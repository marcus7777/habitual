/**
 * Playwright E2E Test Suite for Instant Quick Add Button Responsiveness & UI Feedback (<100ms)
 * Verifies that clicking the quick log button on any habit card immediately:
 * 1. Displays the tick mark (.icon-tick) & .goal-met class on the quick add button.
 * 2. Updates the heatmap square color & .completed class.
 * 3. Operates synchronously (<100ms) regardless of storage engine (LocalStorage, IndexedDB, or Firestore Cloud Sync).
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8093;
const WEB_DIR = path.join(__dirname, '..', 'web');

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
      console.log(`[Server] Local test web server running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

function logResult(testName, isSuccess, details = '') {
  const status = isSuccess ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${status} ${testName} ${details}`);
  if (!isSuccess) {
    throw new Error(`Test failed: ${testName} ${details}`);
  }
}

async function runQuickAddResponsivenessPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Quick Add Button Instant Responsiveness...\n');

  const server = await createStaticServer();
  const browser = await chromium.launch({ headless: true })
    .catch(() => chromium.launch({ channel: 'chrome', headless: true }))
    .catch(() => chromium.launch({ channel: 'msedge', headless: true }));

  let passedTests = 0;
  let totalTests = 0;

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());

    await page.route('**/*sw.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '// mock sw' }));
    await page.route('**/*firebase*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__pw_firebase_loaded = true;' }));

    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.waitForLoadState('domcontentloaded');

    const HABIT_NAME = 'Instant Quick Log Habit';

    // Create a habit for testing
    await page.evaluate(async (name) => {
      window.HabitualCore.setStorageEngine('localStorage');
      const h = {
        id: 'instant_quick_log_habit_1',
        name: name,
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#33B679',
        createdAt: '2026-10-01',
        updatedAt: Date.now(),
        logs: {}
      };
      await window.HabitualCore.saveHabit(h);
      window.HabitualCore.renderAll();
    }, HABIT_NAME);

    await page.waitForSelector('.heatmap-card[data-habit-id="instant_quick_log_habit_1"]');

    // TEST 1: Click Quick Log Button & Measure Instant UI Feedback Delta
    console.log('⚡ TEST 1: Measuring Quick Log Button Click UI Response Delta...');

    const clickMetrics = await page.evaluate(async () => {
      window.HabitualCore.setStorageEngine('localStorage');
      let habit = window.HabitualCore.state.habits.find(x => x.id === 'instant_quick_log_habit_1');
      if (!habit) {
        habit = {
          id: 'instant_quick_log_habit_1',
          name: HABIT_NAME,
          type: 'positive',
          dailyTarget: 1,
          colorTheme: '#33B679',
          createdAt: '2026-10-01',
          updatedAt: Date.now(),
          logs: {}
        };
        window.HabitualCore.state.habits.push(habit);
      }

      const btn = document.querySelector('.heatmap-card[data-habit-id="instant_quick_log_habit_1"] .btn-card-quick-log');
      if (!btn) return { found: false };

      const t0 = performance.now();
      btn.click();
      const t1 = performance.now();

      const hasGoalMetClass = btn.classList.contains('goal-met');
      const dataGoalMet = btn.getAttribute('data-goal-met') === 'true';
      const hasTickIcon = Boolean(btn.querySelector('.icon-tick'));

      const todayKey = (window.HabitualCore && window.HabitualCore.getTodayKey) ? window.HabitualCore.getTodayKey() : new Date().toISOString().split('T')[0];
      const todaySquare = document.querySelector(`.heatmap-card[data-habit-id="instant_quick_log_habit_1"] .day-square[data-date="${todayKey}"]`);
      const squareCompleted = todaySquare ? todaySquare.classList.contains('completed') : false;

      const attrId = btn.getAttribute('data-habit-id');
      const debugLogs = habit ? habit.logs : null;

      return {
        found: true,
        durationMs: t1 - t0,
        hasGoalMetClass,
        dataGoalMet,
        hasTickIcon,
        squareCompleted,
        debugLogs,
        attrId
      };
    });

    totalTests++;
    logResult('Quick Log Button Click Executed in DOM', clickMetrics.found);
    passedTests++;

    totalTests++;
    const isInstant = clickMetrics.durationMs < 100;
    logResult('Quick Add Button UI Update Latency <100ms', isInstant, `(${clickMetrics.durationMs.toFixed(2)}ms)`);
    passedTests++;

    totalTests++;
    logResult('Quick Add Button Gained .goal-met Class', clickMetrics.hasGoalMetClass, `(attrId=${clickMetrics.attrId}, dataGoalMet=${clickMetrics.dataGoalMet}, debugLogs=${JSON.stringify(clickMetrics.debugLogs)})`);
    passedTests++;

    totalTests++;
    logResult('Quick Add Button Displays Tick Icon (.icon-tick)', clickMetrics.hasTickIcon);
    passedTests++;

    totalTests++;
    logResult('Heatmap Day Square Updated to .completed State', clickMetrics.squareCompleted);
    passedTests++;

    // TEST 2: Responsiveness under LocalStorage Storage Driver
    console.log('\n💾 TEST 2: Verifying Instant Quick Add with LocalStorage Driver...');
    const localStorageMetrics = await page.evaluate(async () => {
      window.HabitualCore.setStorageEngine('localStorage');
      const btn = document.querySelector('.heatmap-card[data-habit-id="instant_quick_log_habit_1"] .btn-card-quick-log');

      const t0 = performance.now();
      btn.click(); // Click again (count = 2)
      const t1 = performance.now();

      return {
        durationMs: t1 - t0,
        hasTickIcon: Boolean(btn.querySelector('.icon-tick')),
        count: window.HabitualCore.state.habits[0].logs[window.HabitualCore.getTodayKey()].count
      };
    });

    totalTests++;
    logResult('LocalStorage Quick Log UI Latency <100ms', localStorageMetrics.durationMs < 100, `(${localStorageMetrics.durationMs.toFixed(2)}ms, count=${localStorageMetrics.count})`);
    passedTests++;

    // TEST 3: Responsiveness under IndexedDB Storage Driver
    console.log('\n🗄️ TEST 3: Verifying Instant Quick Add with IndexedDB Driver...');
    const indexedDBMetrics = await page.evaluate(async () => {
      window.HabitualCore.setStorageEngine('indexedDB');
      const btn = document.querySelector('.heatmap-card[data-habit-id="instant_quick_log_habit_1"] .btn-card-quick-log');

      const t0 = performance.now();
      btn.click(); // Click again (count = 3)
      const t1 = performance.now();

      return {
        durationMs: t1 - t0,
        hasTickIcon: Boolean(btn.querySelector('.icon-tick')),
        count: window.HabitualCore.state.habits[0].logs[window.HabitualCore.getTodayKey()].count
      };
    });

    totalTests++;
    logResult('IndexedDB Quick Log UI Latency <100ms', indexedDBMetrics.durationMs < 100, `(${indexedDBMetrics.durationMs.toFixed(2)}ms, count=${indexedDBMetrics.count})`);
    passedTests++;

    // TEST 4: Responsiveness with Firestore Cloud Sync Enabled
    console.log('\n🔥 TEST 4: Verifying Instant Quick Add with Firestore Cloud Sync Active...');
    const firestoreMetrics = await page.evaluate(async () => {
      localStorage.setItem('habitual_firestore_sync_code', 'TEST_QUICK_ADD_CODE');
      localStorage.setItem('habitual_sync_passphrase', 'TEST_PASSPHRASE_123');
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      window.HabitualCore.SyncManager.settings.passphrase = 'TEST_PASSPHRASE_123';

      const btn = document.querySelector('.heatmap-card[data-habit-id="instant_quick_log_habit_1"] .btn-card-quick-log');

      const t0 = performance.now();
      btn.click(); // Click again (count = 4)
      const t1 = performance.now();

      return {
        durationMs: t1 - t0,
        hasTickIcon: Boolean(btn.querySelector('.icon-tick')),
        count: window.HabitualCore.state.habits[0].logs[window.HabitualCore.getTodayKey()].count
      };
    });

    totalTests++;
    logResult('Firestore Cloud Sync Quick Log UI Latency <100ms', firestoreMetrics.durationMs < 100, `(${firestoreMetrics.durationMs.toFixed(2)}ms, count=${firestoreMetrics.count})`);
    passedTests++;

    // TEST 5: Instant Button State Matches Post-Page Reload State Exactly
    console.log('\n🔄 TEST 5: Verifying Quick Add Button Instant State Matches Post-Page Reload State...');
    await page.evaluate(async () => {
      const h2 = {
        id: 'reload_sync_habit_1',
        name: 'Reload Sync Habit',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#33B679',
        createdAt: '2026-10-01',
        updatedAt: Date.now(),
        logs: {}
      };
      window.HabitualCore.state.habits.push(h2);
      if (window.HabitualCore.saveState) window.HabitualCore.saveState();
      window.HabitualCore.renderAll();
    });

    await page.waitForSelector('.heatmap-card[data-habit-id="reload_sync_habit_1"]');

    // Click quick log on reload_sync_habit_1
    await page.click('.heatmap-card[data-habit-id="reload_sync_habit_1"] .btn-card-quick-log');

    // Wait a brief tick for async persistence to finish writing to localStorage before reload
    await page.waitForTimeout(150);

    // Instantly capture button DOM state
    const instantState = await page.evaluate(() => {
      const btn = document.querySelector('.heatmap-card[data-habit-id="reload_sync_habit_1"] .btn-card-quick-log');
      return {
        className: btn.className,
        dataGoalMet: btn.getAttribute('data-goal-met'),
        iconHTML: btn.querySelector('.quick-log-icon') ? btn.querySelector('.quick-log-icon').innerHTML.trim() : ''
      };
    });

    // Now reload page to get fresh render state from storage
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.heatmap-card[data-habit-id="reload_sync_habit_1"]');

    const postReloadState = await page.evaluate(() => {
      const btn = document.querySelector('.heatmap-card[data-habit-id="reload_sync_habit_1"] .btn-card-quick-log');
      return {
        className: btn.className,
        dataGoalMet: btn.getAttribute('data-goal-met'),
        iconHTML: btn.querySelector('.quick-log-icon') ? btn.querySelector('.quick-log-icon').innerHTML.trim() : ''
      };
    });

    totalTests++;
    const classNamesMatch = instantState.className === postReloadState.className;
    logResult('Button ClassName Matches Post-Reload State', classNamesMatch, `("${instantState.className}" === "${postReloadState.className}")`);
    passedTests++;

    totalTests++;
    const goalMetMatch = instantState.dataGoalMet === postReloadState.dataGoalMet;
    logResult('Button data-goal-met Matches Post-Reload State', goalMetMatch, `("${instantState.dataGoalMet}" === "${postReloadState.dataGoalMet}")`);
    passedTests++;

    totalTests++;
    const iconsMatch = instantState.iconHTML === postReloadState.iconHTML;
    logResult('Button Icon HTML Matches Post-Reload State', iconsMatch);
    passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 QUICK ADD RESPONSIVENESS TEST PASSED: ${passedTests}/${totalTests} Passed!`);
    console.log(`========================================\n`);

  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) {
  runQuickAddResponsivenessPlaywrightTests().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('❌ Quick Add Responsiveness Playwright Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runQuickAddResponsivenessPlaywrightTests };
