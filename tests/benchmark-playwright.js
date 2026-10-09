const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8089;
const WEB_DIR = path.join(__dirname, '..', 'web');
const RESULTS_FILE = path.join(__dirname, 'benchmark-results.json');

// 1. Static Web Server
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
    server.listen(PORT, '0.0.0.0', () => {
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
  console.log('\n==================================================');
  console.log('⚡ HABITUAL AUTOMATED PERFORMANCE BENCHMARK SUITE');
  console.log('==================================================\n');

  const server = await createStaticServer();
  let browser;

  const benchmarkData = {
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

    // BENCHMARK 1: Boot / Initial Load Duration
    console.log('⏱️  Measuring Initial Page Boot Time...');
    const startTime = Date.now();
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded' });
    const bootDurationMs = Date.now() - startTime;
    console.log(`   └─ Page Load (DOMContentLoaded): ${bootDurationMs.toFixed(2)} ms`);
    benchmarkData.metrics.bootDurationMs = bootDurationMs;

    // Wait for core JS initialization
    await page.waitForFunction(() => window.HabitualCore && typeof window.HabitualCore.renderAll === 'function');

    // BENCHMARK 2: DOM Render Latency Across Dataset Sizes (10, 50, 100 habits)
    console.log('\n⏱️  Measuring Render Latency Across Scaling Datasets...');
    benchmarkData.metrics.renderDurations = {};

    for (const count of [10, 50, 100]) {
      const syntheticData = generateSyntheticDataset(count);

      const renderMetrics = await page.evaluate((dataset) => {
        window.HabitualCore.state.habits = dataset.habits;
        window.HabitualCore.state.selectedYear = 2026;

        const t0 = performance.now();
        window.HabitualCore.renderAll();
        const t1 = performance.now();

        const domNodeCount = document.querySelectorAll('#heatmaps-gallery *').length;
        return {
          renderTimeMs: t1 - t0,
          domNodeCount: domNodeCount
        };
      }, syntheticData);

      console.log(`   ├─ ${count} Habits (${renderMetrics.domNodeCount} DOM nodes): ${renderMetrics.renderTimeMs.toFixed(2)} ms`);
      benchmarkData.metrics.renderDurations[`habits_${count}`] = {
        renderTimeMs: parseFloat(renderMetrics.renderTimeMs.toFixed(2)),
        domNodeCount: renderMetrics.domNodeCount
      };
    }

    // BENCHMARK 3: Interaction to Next Paint (INP) / Single Card Check-in Latency
    console.log('\n⏱️  Measuring Interaction to Next Paint (INP) Check-in Latency...');

    // Load 50 habits state
    await page.evaluate((dataset) => {
      window.HabitualCore.state.habits = dataset.habits;
      window.HabitualCore.renderAll();
    }, generateSyntheticDataset(50));

    const inpMetrics = await page.evaluate(async () => {
      const firstCardBtn = document.querySelector('.btn-card-quick-log');
      if (!firstCardBtn) return { success: false };

      const t0 = performance.now();
      firstCardBtn.click();

      // Wait for next animation frame paint
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const t1 = performance.now();

      return {
        success: true,
        inpMs: t1 - t0
      };
    });

    if (inpMetrics.success) {
      console.log(`   └─ Quick Check-in INP Latency: ${inpMetrics.inpMs.toFixed(2)} ms`);
      benchmarkData.metrics.quickCheckInInpMs = parseFloat(inpMetrics.inpMs.toFixed(2));
    }

    // BENCHMARK 4: Storage Driver Throughput (Ops/Sec)
    console.log('\n⏱️  Measuring Storage Driver Throughput (1,000 Operations)...');

    const storageMetrics = await page.evaluate(async () => {
      const results = {};

      // LocalStorage benchmark
      if (window.HabitualCore.LocalStorageDriver) {
        const t0 = performance.now();
        for (let i = 0; i < 1000; i++) {
          await window.HabitualCore.LocalStorageDriver.setItem(`bench_key_${i}`, `bench_val_${i}`);
        }
        const t1 = performance.now();
        const durationSec = (t1 - t0) / 1000;
        results.localStorageOpsPerSec = Math.round(1000 / durationSec);

        // Cleanup
        for (let i = 0; i < 1000; i++) {
          await window.HabitualCore.LocalStorageDriver.removeItem(`bench_key_${i}`);
        }
      }

      // IndexedDB benchmark
      if (window.HabitualCore.IndexedDBDriver) {
        const db = await window.HabitualCore.IndexedDBDriver.getDB();
        if (db) {
          const t0 = performance.now();
          const tx = db.transaction(['settings'], 'readwrite');
          const store = tx.objectStore('settings');
          for (let i = 0; i < 1000; i++) {
            store.put({ key: `bench_idb_${i}`, val: `bench_val_${i}` });
          }
          await new Promise(res => { tx.oncomplete = res; });
          const t1 = performance.now();
          const durationSec = (t1 - t0) / 1000;
          results.indexedDBOpsPerSec = Math.round(1000 / durationSec);
        }
      }

      return results;
    });

    console.log(`   ├─ LocalStorage Writes: ${storageMetrics.localStorageOpsPerSec.toLocaleString()} ops/sec`);
    if (storageMetrics.indexedDBOpsPerSec) {
      console.log(`   └─ IndexedDB Batch Writes: ${storageMetrics.indexedDBOpsPerSec.toLocaleString()} ops/sec`);
    }
    benchmarkData.metrics.storageThroughput = storageMetrics;

    // Save benchmark report file
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(benchmarkData, null, 2));

    console.log('\n==================================================');
    console.log(`✅ BENCHMARK COMPLETED SUCCESSFULLY!`);
    console.log(`📊 Report Saved -> ${RESULTS_FILE}`);
    console.log('==================================================\n');

  } catch (err) {
    console.error('\n❌ Benchmark error:', err.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runBenchmarkSuite();
