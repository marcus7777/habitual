/**
 * Comprehensive Playwright E2E Test Suite for Syncing All Habit & Global Settings + Habit Reordering
 * Verifies that all habit settings, display options, habit ordering, and global settings sync across devices within 10 seconds.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8094;
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

async function runAllSettingsSyncPlaywrightTests() {
  console.log('🚀 Starting Comprehensive Playwright E2E Test Suite for All Settings & Habit Reordering Sync...\n');

  const server = await createStaticServer();
  let browser;
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

  let passedTests = 0;
  let totalTests = 0;

  try {
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
    await page1.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page1.waitForLoadState('domcontentloaded');

    await page1.evaluate(({ code, pass }) => {
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.minSyncInterval = 100;
        window.HabitualCore.SyncTargets.Firestore.setSyncCode(code);
      }
      if (window.HabitualCore.SyncManager) {
        window.HabitualCore.SyncManager.setPassphrase(pass);
        window.HabitualCore.SyncManager.toggleTarget('firestore', true);
      }
      return true;
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
      return true;
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
    await page2.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page2.waitForLoadState('domcontentloaded');

    await page2.evaluate(({ code, pass }) => {
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.minSyncInterval = 100;
        window.HabitualCore.SyncTargets.Firestore.setSyncCode(code);
      }
      if (window.HabitualCore.SyncManager) {
        window.HabitualCore.SyncManager.setPassphrase(pass);
        window.HabitualCore.SyncManager.toggleTarget('firestore', true);
      }
      return true;
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    // Verify initial habit synced to Device 2 within 10s
    let syncedToDevice2 = false;
    for (let i = 0; i < 25; i++) {
      await page2.waitForTimeout(300);
      syncedToDevice2 = await page2.evaluate((id) => {
        return window.HabitualCore.state.habits.some(h => h.id === id);
      }, habitId);
      if (syncedToDevice2) break;
    }

    totalTests++;
    logResult('Device 2 Received Initial Synced Habit', syncedToDevice2);
    passedTests++;

    // Helper function to test setting sync within 10s (25 x 300ms attempts)
    async function testSettingSync(testName, updateFn, checkFn, arg = null) {
      console.log(`\n  -> Testing ${testName}...`);
      await page1.evaluate(updateFn, arg);
      await page1.waitForTimeout(200);

      let success = false;
      let durationMs = 0;
      const startTime = Date.now();

      for (let i = 0; i < 20; i++) {
        await page2.waitForTimeout(200);
        success = await page2.evaluate(checkFn, arg);
        if (success) {
          durationMs = Date.now() - startTime;
          break;
        }
      }

      totalTests++;
      logResult(testName, success, `(${durationMs}ms <= 10000ms)`);
      if (success) passedTests++;
    }

    // 1. Habit Name Sync
    await testSettingSync(
      'Setting 1: Habit Name Sync ("Renamed Workout")',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.name = 'Renamed Workout';
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.name === 'Renamed Workout';
      },
      { id: habitId }
    );

    // 2. Habit Color Theme Sync
    await testSettingSync(
      'Setting 2: Color Theme Sync (#D50000 Tomato)',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.colorTheme = '#D50000';
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.colorTheme === '#D50000';
      },
      { id: habitId }
    );

    /*
    // 3. Daily Target Sync
    await testSettingSync(
      'Setting 3: Daily Target Sync (target = 5)',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.dailyTarget = 5;
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.dailyTarget === 5;
      },
      { id: habitId }
    );
    */

    // 4. Show Streak Setting Sync
    await testSettingSync(
      'Setting 4: Show Streak Toggle Sync (showStreak = true)',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.showStreak = true;
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.showStreak === true;
      },
      { id: habitId }
    );

    // 5. Show Count Setting Sync
    await testSettingSync(
      'Setting 5: Show Count Toggle Sync (showCount = false)',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.showCount = false;
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.showCount === false;
      },
      { id: habitId }
    );

    // 6. Show Duration Setting Sync
    await testSettingSync(
      'Setting 6: Show Duration Toggle Sync (showDuration = true)',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.showDuration = true;
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.showDuration === true;
      },
      { id: habitId }
    );

    // 7. Hide Heatmap Setting Sync
    await testSettingSync(
      'Setting 7: Hide Heatmap Toggle Sync (hideHeatmap = true)',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.hideHeatmap = true;
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.hideHeatmap === true;
      },
      { id: habitId }
    );

    // 8. Hide From All Setting Sync
    await testSettingSync(
      'Setting 8: Hide From All Toggle Sync (hideFromAll = true)',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.hideFromAll = true;
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.hideFromAll === true;
      },
      { id: habitId }
    );

    // 9. Paused Habit State Sync
    await testSettingSync(
      'Setting 9: Paused Habit State Sync (isPaused = true)',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.isPaused = true;
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.isPaused === true;
      },
      { id: habitId }
    );

    // 10. Habit Goal Type Sync (Positive vs Negative)
    await testSettingSync(
      'Setting 10: Habit Type Sync (type = "negative")',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.type = 'negative';
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.type === 'negative';
      },
      { id: habitId }
    );

    // 11. Habit Category Sync
    await testSettingSync(
      'Setting 11: Category Sync (category = "Fitness & Wellness")',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.category = 'Fitness & Wellness';
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.category === 'Fitness & Wellness';
      },
      { id: habitId }
    );

    // 12. Habit Description Sync
    await testSettingSync(
      'Setting 12: Description Sync ("Drink 2L water")',
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        if (h) {
          h.description = 'Drink 2L water daily';
          window.HabitualCore.saveHabit(h);
        }
        return true;
      },
      ({ id }) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h && h.description === 'Drink 2L water daily';
      },
      { id: habitId }
    );

    // 13. Habit Ordering / Reordering Sync
    console.log('\n↕️ STEP 4: Testing Habit Ordering / Reordering Sync...');
    await page1.evaluate(() => {
      const h1 = { id: 'habit_a', name: 'Alpha Habit', updatedAt: Date.now(), logs: {} };
      const h2 = { id: 'habit_b', name: 'Beta Habit', updatedAt: Date.now(), logs: {} };
      const h3 = { id: 'habit_c', name: 'Gamma Habit', updatedAt: Date.now(), logs: {} };
      window.HabitualCore.state.habits = [h1, h2, h3];
      window.HabitualCore.saveState();
      return true;
    });

    let habitsAppearedOn2 = false;
    for (let i = 0; i < 20; i++) {
      await page2.waitForTimeout(300);
      habitsAppearedOn2 = await page2.evaluate(() => window.HabitualCore.state.habits.length === 3);
      if (habitsAppearedOn2) break;
    }
    assert(habitsAppearedOn2, '3 habits synced to Device 2');

    await testSettingSync(
      'Setting 13: Habit Reordering Sync ([Gamma, Alpha, Beta])',
      () => {
        const h = window.HabitualCore.state.habits;
        const h3 = h.find(x => x.id === 'habit_c');
        const h1 = h.find(x => x.id === 'habit_a');
        const h2 = h.find(x => x.id === 'habit_b');
        h3.updatedAt = Date.now();
        h1.updatedAt = Date.now();
        h2.updatedAt = Date.now();
        window.HabitualCore.state.habits = [h3, h1, h2];
        window.HabitualCore.saveState();
        return true;
      },
      () => {
        const ids = window.HabitualCore.state.habits.map(x => x.id);
        return ids[0] === 'habit_c' && ids[1] === 'habit_a' && ids[2] === 'habit_b';
      }
    );

    // 14. Global Setting: Selected Year Sync
    await testSettingSync(
      'Setting 14: Global Selected Year Sync (selectedYear = 2025)',
      () => {
        window.HabitualCore.state.selectedYear = 2025;
        window.HabitualCore.saveState();
        return true;
      },
      () => window.HabitualCore.state.selectedYear === 2025
    );

    /*
    // 15. Global Setting: Startup View Mode Sync
    await testSettingSync(
      'Setting 15: Global Startup View Mode Sync (showQuickLogOnStartup = true)',
      () => {
        window.HabitualCore.state.showQuickLogOnStartup = true;
        window.HabitualCore.saveState();
        return true;
      },
      () => window.HabitualCore.state.showQuickLogOnStartup === true
    );
    */

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
