/**
 * Comprehensive Playwright E2E Test Suite for Syncing All Habit & Global Settings + Habit Reordering
 * Verifies that all habit settings, display options, habit ordering, and global settings sync across devices within 10 seconds.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

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

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = (addr && typeof addr === 'object') ? addr.port : 8094;
      resolve({ server, port });
    });
  });
}

function logResult(testName, isSuccess, details = '') {
  const status = isSuccess ? '✅ [PASS]' : '❌ [FAIL]';
  fs.writeSync(1, `  ${status} ${testName} ${details}\n`);
  if (!isSuccess) {
    throw new Error(`Test failed: ${testName} ${details}`);
  }
}

async function waitForSyncToDevice2(page2, predicateFn, arg = null, maxTimeoutMs = 10000) {
  const startTime = Date.now();
  const pollIntervalMs = 200;
  const maxAttempts = Math.ceil(maxTimeoutMs / pollIntervalMs);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await page2.waitForTimeout(pollIntervalMs);
    const isMatch = await page2.evaluate(predicateFn, arg);
    if (isMatch) {
      const elapsed = Date.now() - startTime;
      return { success: true, elapsed };
    }
  }
  const elapsed = Date.now() - startTime;
  return { success: false, elapsed };
}

async function runAllSettingsSyncPlaywrightTests() {
  console.log('🚀 Starting Comprehensive Playwright E2E Test Suite for All Settings & Habit Reordering Sync...\n');

  let server;
  let browser;
  let passedTests = 0;
  let totalTests = 0;

  try {
    const serverObj = await createStaticServer();
    server = serverObj.server;
    const serverPort = serverObj.port;
    console.log(`[Server] Local test web server running on http://127.0.0.1:${serverPort}`);

    try {
      browser = await chromium.launch({ headless: true });
    } catch (e) {
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ];
      const foundPath = chromePaths.find(p => fs.existsSync(p));
      if (foundPath) {
        browser = await chromium.launch({ executablePath: foundPath, headless: true });
      } else {
        browser = await chromium.launch({ channel: 'chrome', headless: true });
      }
    }

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    page1.on('dialog', dialog => dialog.accept());
    page2.on('dialog', dialog => dialog.accept());

    const SYNC_CODE = 'test_settings_sync_' + Date.now();
    const PASSPHRASE = 'Passphrase_Settings_123!';

    // STEP 1: Initialize Device 1
    console.log('📱 STEP 1: Setting up Device 1 (Regular Context)...');
    await page1.goto(`http://127.0.0.1:${serverPort}/index.html`);
    await page1.waitForLoadState('domcontentloaded');

    await page1.evaluate(({ code, pass }) => {
      window.HabitualCore.setStorageEngine('localStorage');
      localStorage.setItem('habitual_firestore_sync_code', code);
      localStorage.setItem('habitual_sync_passphrase', pass);
      localStorage.setItem('habitual_sync_targets', JSON.stringify(['firestore']));
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      window.HabitualCore.SyncManager.settings.passphrase = pass;
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.minSyncInterval = 100;
        window.HabitualCore.SyncTargets.Firestore.startLiveSync();
      }
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    // STEP 2: Create Initial Habit on Device 1
    console.log('\n📝 STEP 2: Creating Initial Habit on Device 1...');
    const INITIAL_NAME = 'Initial Habit ' + Math.floor(Math.random() * 1000);
    await page1.evaluate((name) => {
      window.HabitualCore.openHabitModal();
      const nameInput = document.getElementById('habit-name');
      const colorSelect = document.getElementById('habit-calendar-color-select');
      if (nameInput) nameInput.value = name;
      if (colorSelect) colorSelect.value = '#33B679';
      window.HabitualCore.handleHabitFormSubmit();
    }, INITIAL_NAME);

    await page1.waitForTimeout(500);

    let habitId = await page1.evaluate((name) => {
      const h = window.HabitualCore.state.habits.find(x => x.name === name);
      return h ? h.id : null;
    }, INITIAL_NAME);

    totalTests++;
    logResult('Device 1 Created Initial Habit', Boolean(habitId), `(ID: ${habitId})`);
    passedTests++;

    // STEP 3: Setup Device 2 & Connect
    console.log('\n🕵️ STEP 3: Setting up Device 2 (Incognito Context)...');
    await page2.goto(`http://127.0.0.1:${serverPort}/index.html`);
    await page2.waitForLoadState('domcontentloaded');

    await page2.evaluate(({ code, pass }) => {
      window.HabitualCore.setStorageEngine('localStorage');
      localStorage.setItem('habitual_firestore_sync_code', code);
      localStorage.setItem('habitual_sync_passphrase', pass);
      localStorage.setItem('habitual_sync_targets', JSON.stringify(['firestore']));
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      window.HabitualCore.SyncManager.settings.passphrase = pass;
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.minSyncInterval = 100;
        window.HabitualCore.SyncTargets.Firestore.startLiveSync();
      }
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    let initResult = await waitForSyncToDevice2(page2, (id) => {
      return window.HabitualCore.state.habits.some(h => h.id === id);
    }, habitId);

    totalTests++;
    logResult('Device 2 Received Initial Synced Habit', initResult.success, `(${initResult.elapsed}ms <= 10000ms)`);
    passedTests++;

    // BATCH 1: Core Habit Settings (Name, Color Theme, Daily Target, Type)
    console.log('\n⚙️ BATCH 1: Testing Core Habit Settings Sync...');
    await page1.evaluate(({ id }) => {
      const h = window.HabitualCore.state.habits.find(x => x.id === id);
      if (h) {
        h.name = 'Renamed Workout';
        h.colorTheme = '#D50000';
        h.dailyTarget = 5;
        h.type = 'negative';
        window.HabitualCore.saveHabit(h);
      }
    }, { id: habitId });

    let batch1Res = await waitForSyncToDevice2(page2, ({ id }) => {
      const h = window.HabitualCore.state.habits.find(x => x.id === id);
      return h && h.name === 'Renamed Workout' && h.colorTheme === '#D50000' && h.dailyTarget === 5 && h.type === 'negative';
    }, { id: habitId });

    totalTests++;
    logResult('Core Habit Settings Sync (Name, Color, Target, Type)', batch1Res.success, `(${batch1Res.elapsed}ms <= 10000ms)`);
    if (batch1Res.success) passedTests++;

    // BATCH 2: Display & Privacy Settings (showStreak, showCount, showDuration, hideHeatmap, hideFromAll, isPaused)
    console.log('\n⚙️ BATCH 2: Testing Display & Privacy Settings Sync...');
    await page1.evaluate(({ id }) => {
      const h = window.HabitualCore.state.habits.find(x => x.id === id);
      if (h) {
        h.showStreak = true;
        h.showCount = false;
        h.showDuration = true;
        h.hideHeatmap = true;
        h.hideFromAll = true;
        h.isPaused = true;
        window.HabitualCore.saveHabit(h);
      }
    }, { id: habitId });

    let batch2Res = await waitForSyncToDevice2(page2, ({ id }) => {
      const h = window.HabitualCore.state.habits.find(x => x.id === id);
      return h && h.showStreak === true && h.showCount === false && h.showDuration === true && h.hideHeatmap === true && h.hideFromAll === true && h.isPaused === true;
    }, { id: habitId });

    totalTests++;
    logResult('Display & Privacy Settings Sync (Streak, Count, Duration, Pause, Hide)', batch2Res.success, `(${batch2Res.elapsed}ms <= 10000ms)`);
    if (batch2Res.success) passedTests++;

    // BATCH 3: Habit Category & Description
    console.log('\n⚙️ BATCH 3: Testing Taxonomy Sync (Category & Description)...');
    await page1.evaluate(({ id }) => {
      const h = window.HabitualCore.state.habits.find(x => x.id === id);
      if (h) {
        h.category = 'Fitness & Wellness';
        h.description = 'Drink 2L water daily';
        window.HabitualCore.saveHabit(h);
      }
    }, { id: habitId });

    let batch3Res = await waitForSyncToDevice2(page2, ({ id }) => {
      const h = window.HabitualCore.state.habits.find(x => x.id === id);
      return h && h.category === 'Fitness & Wellness' && h.description === 'Drink 2L water daily';
    }, { id: habitId });

    totalTests++;
    logResult('Taxonomy Sync (Category & Description)', batch3Res.success, `(${batch3Res.elapsed}ms <= 10000ms)`);
    if (batch3Res.success) passedTests++;

    // BATCH 4: Habit List Reordering Sync
    console.log('\n↕️ BATCH 4: Testing Habit List Reordering Sync...');
    await page1.evaluate(() => {
      const h1 = { id: 'habit_a', name: 'Alpha Habit', updatedAt: Date.now(), logs: {} };
      const h2 = { id: 'habit_b', name: 'Beta Habit', updatedAt: Date.now(), logs: {} };
      const h3 = { id: 'habit_c', name: 'Gamma Habit', updatedAt: Date.now(), logs: {} };
      window.HabitualCore.state.habits = [h1, h2, h3];
      window.HabitualCore.saveState();
    });

    let habitsAppearedOn2 = await waitForSyncToDevice2(page2, () => window.HabitualCore.state.habits.length === 3);
    assert(habitsAppearedOn2.success, '3 habits synced to Device 2');

    await page1.evaluate(() => {
      const h = window.HabitualCore.state.habits;
      const h3 = h.find(x => x.id === 'habit_c');
      const h1 = h.find(x => x.id === 'habit_a');
      const h2 = h.find(x => x.id === 'habit_b');
      h3.updatedAt = Date.now();
      h1.updatedAt = Date.now();
      h2.updatedAt = Date.now();
      window.HabitualCore.state.habits = [h3, h1, h2];
      window.HabitualCore.saveState();
    });

    let reorderRes = await waitForSyncToDevice2(page2, () => {
      const ids = window.HabitualCore.state.habits.map(x => x.id);
      return ids[0] === 'habit_c' && ids[1] === 'habit_a' && ids[2] === 'habit_b';
    });

    totalTests++;
    logResult('Habit List Reordering Sync ([Gamma, Alpha, Beta])', reorderRes.success, `(${reorderRes.elapsed}ms <= 10000ms)`);
    if (reorderRes.success) passedTests++;

    // BATCH 5: Global Settings (Selected Year & Startup Mode)
    console.log('\n🌐 BATCH 5: Testing Global App Settings Sync...');
    await page1.evaluate(() => {
      window.HabitualCore.state.selectedYear = 2025;
      window.HabitualCore.state.showQuickLogOnStartup = true;
      window.HabitualCore.saveState();
    });

    let globalRes = await waitForSyncToDevice2(page2, () => {
      return window.HabitualCore.state.selectedYear === 2025 && window.HabitualCore.state.showQuickLogOnStartup === true;
    });

    totalTests++;
    logResult('Global Settings Sync (Selected Year = 2025, Quick Log = true)', globalRes.success, `(${globalRes.elapsed}ms <= 10000ms)`);
    if (globalRes.success) passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 ALL SETTINGS SYNC TEST PASSED: ${passedTests}/${totalTests} Passed within 10s!`);
    console.log(`========================================\n`);

  } finally {
    if (browser) {
      browser.close().catch(() => {});
    }
    if (server) {
      try {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        server.close();
      } catch (e) {}
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

if (require.main === module) {
  runAllSettingsSyncPlaywrightTests().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('❌ All Settings Sync Playwright Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runAllSettingsSyncPlaywrightTests };
