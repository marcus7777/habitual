const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8089;
const WEB_DIR = path.join(__dirname, '..', 'web');
const RESULTS_FILE = path.join(__dirname, 'benchmark-results.json');
const packageJsonPath = path.join(__dirname, '..', 'package.json');

// Performance Regression Threshold Configuration
const REGRESSION_THRESHOLDS = {
  FAIL_PERCENT: 35,        // Hard failure if metric regresses >= 35%
  WARN_PERCENT: 20,        // Soft warning if metric regresses >= 20%
  MIN_TIME_BUFFER_MS: 400  // Ignore timing noise fluctuations under 400ms for large 50,000-node DOM renders
};

function getCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return pkg.version || '1.0.0';
  } catch (e) {
    return '1.0.0';
  }
}

function loadBenchmarkHistory() {
  if (!fs.existsSync(RESULTS_FILE)) {
    return { latest: null, history: [] };
  }
  try {
    const content = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    if (!content) return { latest: null, history: [] };

    // Support legacy schema: { timestamp, metrics }
    if (content.metrics && !content.latest) {
      const legacyRun = {
        version: content.version || '1.21.11',
        timestamp: content.timestamp || new Date().toISOString(),
        metrics: content.metrics
      };
      return { latest: legacyRun, history: [legacyRun] };
    }

    return {
      latest: content.latest || null,
      history: Array.isArray(content.history) ? content.history : []
    };
  } catch (err) {
    return { latest: null, history: [] };
  }
}

function getBaselineRun(history, currentVersion) {
  if (!history || history.length === 0) return null;

  // 1. Filter out outlier runs (e.g., boot duration > 3000ms caused by network stalls)
  const validRuns = history.filter(run => run && run.metrics && (typeof run.metrics.bootDurationMs !== 'number' || run.metrics.bootDurationMs < 3000));

  // 2. Filter runs from previous versions (or all prior valid runs if none exist)
  let eligibleRuns = validRuns.filter(run => run.version && run.version !== currentVersion);
  if (eligibleRuns.length === 0) {
    eligibleRuns = validRuns;
  }
  if (eligibleRuns.length === 0) return null;

  // Take up to 5 most recent eligible runs to calculate median baseline
  const sample = eligibleRuns.slice(0, 5);

  const getMedian = (arr) => {
    const nums = arr.filter(n => typeof n === 'number' && !isNaN(n)).sort((a, b) => a - b);
    if (nums.length === 0) return 0;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  };

  return {
    version: sample[0].version,
    timestamp: sample[0].timestamp,
    metrics: {
      bootDurationMs: getMedian(sample.map(r => r.metrics.bootDurationMs)),
      renderDurations: {
        html: {
          habits_10: { renderTimeMs: getMedian(sample.map(r => r.metrics?.renderDurations?.html?.habits_10?.renderTimeMs)) },
          habits_50: { renderTimeMs: getMedian(sample.map(r => r.metrics?.renderDurations?.html?.habits_50?.renderTimeMs)) },
          habits_100: { renderTimeMs: getMedian(sample.map(r => r.metrics?.renderDurations?.html?.habits_100?.renderTimeMs)) }
        },
        svg: {
          habits_10: { renderTimeMs: getMedian(sample.map(r => r.metrics?.renderDurations?.svg?.habits_10?.renderTimeMs)) },
          habits_50: { renderTimeMs: getMedian(sample.map(r => r.metrics?.renderDurations?.svg?.habits_50?.renderTimeMs)) },
          habits_100: { renderTimeMs: getMedian(sample.map(r => r.metrics?.renderDurations?.svg?.habits_100?.renderTimeMs)) }
        }
      },
      quickCheckInInpMs: {
        html: getMedian(sample.map(r => r.metrics?.quickCheckInInpMs?.html)),
        svg: getMedian(sample.map(r => r.metrics?.quickCheckInInpMs?.svg))
      },
      storageThroughput: {
        localStorageOpsPerSec: getMedian(sample.map(r => r.metrics?.storageThroughput?.localStorageOpsPerSec)),
        indexedDBOpsPerSec: getMedian(sample.map(r => r.metrics?.storageThroughput?.indexedDBOpsPerSec))
      }
    }
  };
}

function evaluateMetricRegression(currVal, prevVal, isTime = true) {
  if (currVal === undefined || currVal === null || prevVal === undefined || prevVal === null || isNaN(prevVal) || prevVal === 0) {
    return { status: 'NORMAL', text: 'no baseline' };
  }

  const diff = currVal - prevVal;
  const pct = (diff / prevVal) * 100;

  if (isTime) {
    // Duration: positive diff means SLOWER (regression)
    // Ignore small absolute changes under MIN_TIME_BUFFER_MS
    if (diff > REGRESSION_THRESHOLDS.MIN_TIME_BUFFER_MS) {
      if (pct >= REGRESSION_THRESHOLDS.FAIL_PERCENT) {
        return { status: 'FAIL', text: `${pct.toFixed(1)}% SLOWER (FAIL ≥${REGRESSION_THRESHOLDS.FAIL_PERCENT}%)` };
      }
      if (pct >= REGRESSION_THRESHOLDS.WARN_PERCENT) {
        return { status: 'WARN', text: `${pct.toFixed(1)}% SLOWER (WARN ≥${REGRESSION_THRESHOLDS.WARN_PERCENT}%)` };
      }
    }
    if (pct < -2) {
      return { status: 'IMPROVED', text: `${Math.abs(pct).toFixed(1)}% FASTER` };
    }
    return { status: 'NORMAL', text: `NEUTRAL (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` };
  } else {
    // Throughput (ops/sec): negative diff means LOWER (regression)
    const dropPct = -pct; // positive dropPct means throughput dropped
    if (dropPct >= REGRESSION_THRESHOLDS.FAIL_PERCENT) {
      return { status: 'FAIL', text: `${dropPct.toFixed(1)}% LOWER (FAIL ≥${REGRESSION_THRESHOLDS.FAIL_PERCENT}%)` };
    }
    if (dropPct >= REGRESSION_THRESHOLDS.WARN_PERCENT) {
      return { status: 'WARN', text: `${dropPct.toFixed(1)}% LOWER (WARN ≥${REGRESSION_THRESHOLDS.WARN_PERCENT}%)` };
    }
    if (pct > 2) {
      return { status: 'IMPROVED', text: `${pct.toFixed(1)}% HIGHER` };
    }
    return { status: 'NORMAL', text: `NEUTRAL (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` };
  }
}

function formatMetricComparison(label, currVal, prevVal, isTime = true) {
  if (currVal === undefined || currVal === null) return null;

  if (prevVal === undefined || prevVal === null || isNaN(prevVal) || prevVal === 0) {
    const valStr = isTime ? `${currVal.toFixed(2)} ms` : `${currVal.toLocaleString()} ops/sec`;
    return {
      line: `   ├─ ${label.padEnd(30)}: ${valStr} (no baseline)`,
      level: 'NORMAL'
    };
  }

  const evalResult = evaluateMetricRegression(currVal, prevVal, isTime);
  let icon = '⚪';
  if (evalResult.status === 'IMPROVED') icon = '🟢';
  if (evalResult.status === 'WARN') icon = '⚠️';
  if (evalResult.status === 'FAIL') icon = '🚨';

  const currStr = isTime ? `${currVal.toFixed(2)} ms` : `${currVal.toLocaleString()} ops/sec`;
  const prevStr = isTime ? `${prevVal.toFixed(2)} ms` : `${prevVal.toLocaleString()} ops/sec`;

  return {
    line: `   ├─ ${label.padEnd(30)}: ${currStr} vs ${prevStr} (${icon} ${evalResult.text})`,
    level: evalResult.status
  };
}

function printComparisonReport(currentMetrics, previousRun) {
  const prevVersion = previousRun && previousRun.version ? `v${previousRun.version}` : 'Previous Run';
  console.log('\n==================================================');
  console.log(`📊 PERFORMANCE COMPARISON vs ${prevVersion}`);
  console.log('==================================================\n');

  const prevM = previousRun ? (previousRun.metrics || {}) : {};
  let hardFailures = 0;
  let warnings = 0;

  function trackResult(res) {
    if (!res || !res.line) return;
    console.log(res.line);
    if (res.level === 'FAIL') hardFailures++;
    if (res.level === 'WARN') warnings++;
  }

  // Boot
  console.log('⚡ Boot Duration:');
  trackResult(formatMetricComparison('Initial Boot (DOMContentLoaded)', currentMetrics.bootDurationMs, prevM.bootDurationMs, true));

  // Render HTML
  console.log('\n🎨 Render Latency (HTML Engine):');
  for (const count of [10, 50, 100]) {
    const key = `habits_${count}`;
    const curr = currentMetrics.renderDurations?.html?.[key]?.renderTimeMs;
    const prev = prevM.renderDurations?.html?.[key]?.renderTimeMs;
    trackResult(formatMetricComparison(`${count} Habits Render`, curr, prev, true));
  }

  // Render SVG
  console.log('\n🎨 Render Latency (SVG Engine):');
  for (const count of [10, 50, 100]) {
    const key = `habits_${count}`;
    const curr = currentMetrics.renderDurations?.svg?.[key]?.renderTimeMs;
    const prev = prevM.renderDurations?.svg?.[key]?.renderTimeMs;
    trackResult(formatMetricComparison(`${count} Habits Render`, curr, prev, true));
  }

  // INP
  console.log('\n⏱️ Interaction to Next Paint (INP Check-in):');
  if (currentMetrics.quickCheckInInpMs?.html !== undefined) {
    trackResult(formatMetricComparison('HTML Quick Check-in INP', currentMetrics.quickCheckInInpMs.html, prevM.quickCheckInInpMs?.html, true));
  }
  if (currentMetrics.quickCheckInInpMs?.svg !== undefined) {
    trackResult(formatMetricComparison('SVG Quick Check-in INP', currentMetrics.quickCheckInInpMs.svg, prevM.quickCheckInInpMs?.svg, true));
  }

  // Storage
  console.log('\n💾 Storage Throughput:');
  if (currentMetrics.storageThroughput?.localStorageOpsPerSec !== undefined) {
    trackResult(formatMetricComparison('LocalStorage Writes', currentMetrics.storageThroughput.localStorageOpsPerSec, prevM.storageThroughput?.localStorageOpsPerSec, false));
  }
  if (currentMetrics.storageThroughput?.indexedDBOpsPerSec !== undefined) {
    trackResult(formatMetricComparison('IndexedDB Writes', currentMetrics.storageThroughput.indexedDBOpsPerSec, prevM.storageThroughput?.indexedDBOpsPerSec, false));
  }

  console.log('\n==================================================');
  return { hardFailures, warnings };
}

// Static Web Server
function createStaticServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
  };

  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    let filePath = path.join(WEB_DIR, urlPath === '/' ? 'index.html' : urlPath);

    if (!filePath.startsWith(WEB_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404);
        return res.end('Not Found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

// Generate synthetic habit dataset for benchmarking
function generateSyntheticDataset(habitCount) {
  const habits = [];
  const colors = ['#238636', '#1f6feb', '#8957e5', '#da3633', '#d29922', '#3fb950', '#a371f7'];
  const today = new Date();

  for (let i = 1; i <= habitCount; i++) {
    const logs = {};
    // Pre-fill 365 days of activity
    for (let d = 0; d < 365; d++) {
      if (Math.random() > 0.4) {
        const dateObj = new Date(today);
        dateObj.setDate(dateObj.getDate() - d);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        logs[dateStr] = { count: Math.floor(Math.random() * 5) + 1, note: d % 10 === 0 ? 'Benchmark log' : '' };
      }
    }

    habits.push({
      id: `synthetic_habit_${i}`,
      name: `Synthetic Habit ${i}`,
      type: 'positive',
      dailyTarget: 1,
      colorTheme: colors[i % colors.length],
      createdAt: '2026-01-01',
      logs: logs
    });
  }

  return { habits: habits, settings: { selectedYear: 2026 } };
}

async function runBenchmarkSuite() {
  const currentVersion = getCurrentVersion();
  const benchmarkHistory = loadBenchmarkHistory();

  console.log('\n==================================================');
  console.log(`⚡ HABITUAL AUTOMATED PERFORMANCE BENCHMARK SUITE (v${currentVersion})`);
  console.log('==================================================\n');

  const server = await createStaticServer();
  let browser;

  const benchmarkData = {
    version: currentVersion,
    timestamp: new Date().toISOString(),
    metrics: {}
  };

  try {
    browser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    // Mock network requests for external Firebase SDKs and Service Worker to prevent network stalls during benchmarks
    await page.route('**/*sw.js*', route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '// mock service worker'
    }));

    await page.route('**/*firebase*', route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.__pw_firebase_loaded = true;'
    }));

    // BENCHMARK 1: Boot / Initial Load Duration (3 iterations to eliminate cold-start noise)
    console.log('⏱️  Measuring Initial Page Boot Time...');
    let bootDurationMs = Infinity;
    for (let iter = 0; iter < 3; iter++) {
      const startTime = Date.now();
      await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'domcontentloaded' });
      const elapsed = Date.now() - startTime;
      if (elapsed < bootDurationMs) bootDurationMs = elapsed;
    }
    console.log(`   └─ Page Load (DOMContentLoaded): ${bootDurationMs.toFixed(2)} ms`);
    benchmarkData.metrics.bootDurationMs = bootDurationMs;

    // Wait for core JS initialization
    await page.waitForFunction(() => window.HabitualCore && typeof window.HabitualCore.renderAll === 'function');

    // BENCHMARK 2: DOM Render Latency Across Dataset Sizes (10, 50, 100 habits, best of 3 runs)
    console.log('\n⏱️  Measuring Render Latency Across Scaling Datasets...');
    benchmarkData.metrics.renderDurations = {};

    for (const engine of ['html', 'svg']) {
      console.log(`\n--- Engine: ${engine.toUpperCase()} ---`);
      for (const count of [10, 50, 100]) {
        const syntheticData = generateSyntheticDataset(count);

        const renderMetrics = await page.evaluate((args) => {
          const { dataset, renderEngine } = args;
          window.HabitualCore.state.habits = dataset.habits;
          window.HabitualCore.state.selectedYear = 2026;
          window.HabitualCore.config.renderEngine = renderEngine;

          let bestTime = Infinity;
          let nodeCount = 0;
          for (let run = 0; run < 3; run++) {
            const t0 = performance.now();
            window.HabitualCore.renderAll();
            const t1 = performance.now();
            const elapsed = t1 - t0;
            if (elapsed < bestTime) bestTime = elapsed;
            nodeCount = document.querySelectorAll('#heatmaps-gallery *').length;
          }

          return {
            renderTimeMs: bestTime,
            domNodeCount: nodeCount
          };
        }, { dataset: syntheticData, renderEngine: engine });

        console.log(`   ├─ ${count} Habits (${renderMetrics.domNodeCount} DOM nodes): ${renderMetrics.renderTimeMs.toFixed(2)} ms`);

        if (!benchmarkData.metrics.renderDurations[engine]) {
          benchmarkData.metrics.renderDurations[engine] = {};
        }

        benchmarkData.metrics.renderDurations[engine][`habits_${count}`] = {
          renderTimeMs: parseFloat(renderMetrics.renderTimeMs.toFixed(2)),
          domNodeCount: renderMetrics.domNodeCount
        };
      }
    }

    // BENCHMARK 3: Interaction to Next Paint (INP) / Single Card Check-in Latency
    console.log('\n⏱️  Measuring Interaction to Next Paint (INP) Check-in Latency...');
    benchmarkData.metrics.quickCheckInInpMs = {};

    for (const engine of ['html', 'svg']) {
      // Load 50 habits state
      await page.evaluate((args) => {
        const { dataset, renderEngine } = args;
        window.HabitualCore.state.habits = dataset.habits;
        window.HabitualCore.config.renderEngine = renderEngine;
        window.HabitualCore.renderAll();
      }, { dataset: generateSyntheticDataset(50), renderEngine: engine });

      const inpMetrics = await page.evaluate(async () => {
        let bestInp = Infinity;
        for (let run = 0; run < 3; run++) {
          const firstCardBtn = document.querySelector('.btn-card-quick-log');
          if (!firstCardBtn) return { success: false };

          const t0 = performance.now();
          firstCardBtn.click();

          // Wait for next animation frame paint
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const t1 = performance.now();
          const elapsed = t1 - t0;
          if (elapsed < bestInp) bestInp = elapsed;
        }

        return {
          success: true,
          inpMs: bestInp
        };
      });

      if (inpMetrics.success) {
        console.log(`   └─ [${engine.toUpperCase()}] Quick Check-in INP Latency: ${inpMetrics.inpMs.toFixed(2)} ms`);
        benchmarkData.metrics.quickCheckInInpMs[engine] = parseFloat(inpMetrics.inpMs.toFixed(2));
      }
    }

    // BENCHMARK 4: Storage Driver Throughput (Ops/Sec, best of 3 runs)
    console.log('\n⏱️  Measuring Storage Driver Throughput (1,000 Operations)...');

    const storageMetrics = await page.evaluate(async () => {
      const results = {};

      // LocalStorage benchmark
      if (window.HabitualCore.LocalStorageDriver) {
        let maxOps = 0;
        for (let run = 0; run < 3; run++) {
          const t0 = performance.now();
          for (let i = 0; i < 1000; i++) {
            await window.HabitualCore.LocalStorageDriver.setItem(`bench_key_${i}`, `bench_val_${i}`);
          }
          const t1 = performance.now();
          const durationSec = (t1 - t0) / 1000;
          const ops = Math.round(1000 / durationSec);
          if (ops > maxOps) maxOps = ops;

          // Cleanup
          for (let i = 0; i < 1000; i++) {
            await window.HabitualCore.LocalStorageDriver.removeItem(`bench_key_${i}`);
          }
        }
        results.localStorageOpsPerSec = maxOps;
      }

      // IndexedDB benchmark
      if (window.HabitualCore.IndexedDBDriver) {
        const db = await window.HabitualCore.IndexedDBDriver.getDB();
        if (db) {
          let maxOps = 0;
          for (let run = 0; run < 3; run++) {
            const t0 = performance.now();
            const tx = db.transaction(['settings'], 'readwrite');
            const store = tx.objectStore('settings');
            for (let i = 0; i < 1000; i++) {
              store.put({ key: `bench_idb_${i}`, val: `bench_val_${i}` });
            }
            await new Promise(res => { tx.oncomplete = res; });
            const t1 = performance.now();
            const durationSec = (t1 - t0) / 1000;
            const ops = Math.round(1000 / durationSec);
            if (ops > maxOps) maxOps = ops;
          }
          results.indexedDBOpsPerSec = maxOps;
        }
      }

      return results;
    });

    console.log(`   ├─ LocalStorage Writes: ${storageMetrics.localStorageOpsPerSec.toLocaleString()} ops/sec`);
    if (storageMetrics.indexedDBOpsPerSec) {
      console.log(`   └─ IndexedDB Batch Writes: ${storageMetrics.indexedDBOpsPerSec.toLocaleString()} ops/sec`);
    }
    benchmarkData.metrics.storageThroughput = storageMetrics;

    // Build Current Run Record
    const currentRun = {
      version: currentVersion,
      timestamp: benchmarkData.timestamp,
      metrics: benchmarkData.metrics
    };

    // Find previous baseline run (from previous version if available)
    const baselineRun = getBaselineRun(benchmarkHistory.history, currentVersion) || benchmarkHistory.latest;
    const { hardFailures, warnings } = printComparisonReport(benchmarkData.metrics, baselineRun);

    // Save history array with up to 50 previous runs
    const updatedHistory = [currentRun, ...(benchmarkHistory.history || [])].slice(0, 50);

    const fullResultsData = {
      version: currentVersion,
      timestamp: currentRun.timestamp,
      latest: currentRun,
      metrics: currentRun.metrics, // Preserve root metrics for backward compatibility
      history: updatedHistory
    };

    fs.writeFileSync(RESULTS_FILE, JSON.stringify(fullResultsData, null, 2));

    if (hardFailures > 0) {
      console.error(`\n❌ REGRESSION TEST FAILED: ${hardFailures} performance metric(s) regressed beyond the ${REGRESSION_THRESHOLDS.FAIL_PERCENT}% threshold.`);
      process.exitCode = 1;
    } else if (warnings > 0) {
      console.warn(`\n⚠️ PERFORMANCE WARNING: ${warnings} performance metric(s) regressed above ${REGRESSION_THRESHOLDS.WARN_PERCENT}%.`);
    } else {
      console.log(`\n✅ PERFORMANCE VERIFIED: All metrics passed within threshold buffers!`);
    }

    console.log(`📊 Report Saved -> ${RESULTS_FILE}`);
    console.log('==================================================\n');

  } catch (err) {
    console.error('\n❌ Benchmark error:', err.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runBenchmarkSuite();
