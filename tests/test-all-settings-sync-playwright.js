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

function createStaticServer(portToUse = PORT) {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
  };

  const fileCache = new Map();
  const sockets = new Set();

  const createServerInstance = (port) => {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        let urlPath = req.url.split('?')[0];
        let filePath = path.join(WEB_DIR, urlPath === '/' ? 'index.html' : urlPath);

        if (!filePath.startsWith(WEB_DIR)) {
          res.writeHead(403);
          return res.end('Forbidden');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        try {
          if (!fileCache.has(filePath)) {
            if (!fs.existsSync(filePath)) {
              res.writeHead(404);
              return res.end('Not Found');
            }
            fileCache.set(filePath, fs.readFileSync(filePath));
          }
          const data = fileCache.get(filePath);
          res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': data.length });
          res.end(data);
        } catch (e) {
          res.writeHead(500);
          res.end('Server Error');
        }
      });

      server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });

      server.destroyAllSockets = () => {
        for (const socket of sockets) {
          try { socket.destroy(); } catch (e) {}
        }
        sockets.clear();
      };

      server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && port !== 0) {
          createServerInstance(0).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });

      server.listen(port, '127.0.0.1', () => {
        console.log(`[Server] Local test web server running on http://127.0.0.1:${server.address().port}`);
        resolve(server);
      });
    });
  };

  return createServerInstance(portToUse);
}

function logResult(testName, isSuccess, details = '') {
  const status = isSuccess ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${status} ${testName} ${details}`);
  if (!isSuccess) {
    throw new Error(`Test failed: ${testName} ${details}`);
  }
}

async function setupMockFirestore(page) {
  await page.addInitScript(() => {
    if (!window.HabitualCore) window.HabitualCore = {};
    if (!window.HabitualCore.SyncTargets) window.HabitualCore.SyncTargets = {};
    if (!window.HabitualCore.SyncTargets.Firestore) window.HabitualCore.SyncTargets.Firestore = {};

    if (!window.__pw_channel) {
      window.__pw_channel = new BroadcastChannel('pw_firestore_channel');
    }
    const channel = window.__pw_channel;
    const store = window.__pw_store || new Map();
    window.__pw_store = store;

    const listeners = window.__pw_listeners || new Map();
    window.__pw_listeners = listeners;

    channel.onmessage = (event) => {
      const { col, docId, data } = event.data;
      const key = `${col}_${docId}`;
      store.set(key, data);
      if (listeners.has(key)) {
        listeners.get(key).forEach(cb => {
          try { cb({ exists: true, data: () => data, metadata: { hasPendingWrites: false } }); } catch (e) {}
        });
      }
    };

    window.HabitualCore.SyncTargets.Firestore.db = {
      collection: function(col) {
        return {
          doc: function(docId) {
            const key = `${col}_${docId}`;
            return {
              id: docId,
              set: function(data) {
                const normData = Object.assign({}, data, {
                  updatedAt: (data && typeof data.updatedAt === 'number') ? data.updatedAt : Date.now()
                });
                store.set(key, normData);
                channel.postMessage({ col, docId, data: normData });
                if (listeners.has(key)) {
                  listeners.get(key).forEach(cb => {
                    try { cb({ exists: true, data: () => normData, metadata: { hasPendingWrites: false } }); } catch (e) {}
                  });
                }
                return Promise.resolve();
              },
              get: function() {
                const data = store.get(key);
                return Promise.resolve({
                  exists: Boolean(data),
                  data: function() { return data; }
                });
              },
              onSnapshot: function(cb) {
                if (!listeners.has(key)) listeners.set(key, []);
                listeners.get(key).push(cb);
                if (store.has(key)) {
                  const data = store.get(key);
                  setTimeout(() => {
                    try { cb({ exists: true, data: () => data, metadata: { hasPendingWrites: false } }); } catch (e) {}
                  }, 10);
                }
                return function unsubscribe() {
                  if (listeners.has(key)) {
                    const arr = listeners.get(key).filter(x => x !== cb);
                    listeners.set(key, arr);
                  }
                };
              }
            };
          }
        };
      }
    };
  });
}

async function runAllSettingsSyncPlaywrightTests() {
  console.log('🚀 Starting Comprehensive Playwright E2E Test Suite for All Settings & Habit Reordering Sync...\n');

  const GLOBAL_TIMEOUT_MS = 60000;
  const globalTimeout = setTimeout(() => {
    console.error(`❌ Global Test Suite Timeout exceeded (${GLOBAL_TIMEOUT_MS}ms). Forcing process exit.`);
    process.exit(1);
  }, GLOBAL_TIMEOUT_MS);
  if (globalTimeout.unref) globalTimeout.unref();

  const server = await createStaticServer(PORT);
  const serverPort = server.address().port;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
      .catch(() => chromium.launch({ channel: 'msedge', headless: true }));
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

    await setupMockFirestore(page1);
    await setupMockFirestore(page2);

    const SYNC_CODE = 'TEST_SETTINGS_SYNC_' + Date.now();
    const PASSPHRASE = 'Passphrase_Settings_123!';

    // STEP 1: Initialize Device 1
    console.log('📱 STEP 1: Setting up Device 1 (Regular Context)...');
    await page1.goto(`http://127.0.0.1:${serverPort}/index.html`, { waitUntil: 'domcontentloaded' });
    await page1.waitForFunction(() => Boolean(window.HabitualCore && window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore));

    await page1.evaluate(async ({ code, pass }) => {
      localStorage.setItem('habitual_v2_active_engine', 'localStorage');
      if (window.HabitualCore && window.HabitualCore.setStorageEngine) {
        window.HabitualCore.setStorageEngine('localStorage');
      }
      localStorage.setItem('habitual_firestore_sync_code', code);
      localStorage.setItem('habitual_sync_passphrase', pass);
      localStorage.setItem('habitual_sync_targets', JSON.stringify(['firestore']));
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      window.HabitualCore.SyncManager.settings.passphrase = pass;
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.minSyncInterval = 10;
        await window.HabitualCore.SyncTargets.Firestore.startLiveSync();
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
      if (window.HabitualCore.SyncManager) {
        if (window.HabitualCore.SyncManager._broadcastTimer) {
          clearTimeout(window.HabitualCore.SyncManager._broadcastTimer);
          window.HabitualCore.SyncManager._broadcastTimer = null;
        }
        window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
      return true;
    }, INITIAL_NAME);

    await page1.waitForTimeout(100);

    let habitId = await page1.evaluate((name) => {
      const state = window.HabitualCore.state;
      const habits = state && Array.isArray(state.habits) ? state.habits : [];
      const h = habits.find(x => x.name === name);
      return h ? h.id : null;
    }, INITIAL_NAME);

    totalTests++;
    logResult('Device 1 Created Initial Habit', Boolean(habitId), `(ID: ${habitId})`);
    passedTests++;

    // STEP 3: Setup Device 2 & Connect
    console.log('\n🕵️ STEP 3: Setting up Device 2 & Connecting to Sync Channel...');
    await page2.goto(`http://127.0.0.1:${serverPort}/index.html`, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => Boolean(window.HabitualCore && window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore));

    await page2.evaluate(async ({ code, pass }) => {
      localStorage.setItem('habitual_v2_active_engine', 'localStorage');
      if (window.HabitualCore && window.HabitualCore.setStorageEngine) {
        window.HabitualCore.setStorageEngine('localStorage');
      }
      localStorage.setItem('habitual_firestore_sync_code', code);
      localStorage.setItem('habitual_sync_passphrase', pass);
      localStorage.setItem('habitual_sync_targets', JSON.stringify(['firestore']));
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      window.HabitualCore.SyncManager.settings.passphrase = pass;
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.minSyncInterval = 10;
        await window.HabitualCore.SyncTargets.Firestore.startLiveSync();
      }
      return true;
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    let initSynced = false;
    let t0Init = Date.now();
    for (let i = 0; i < 80; i++) {
      await page2.waitForTimeout(100);
      try {
        initSynced = await page2.evaluate((id) => {
          const habits = window.HabitualCore.state ? window.HabitualCore.state.habits : [];
          return habits.some(h => h.id === id);
        }, habitId);
      } catch (e) {}
      if (initSynced) break;
    }

    totalTests++;
    logResult('Device 2 Received Initial Synced Habit', initSynced, `(${Date.now() - t0Init}ms <= 10000ms)`);
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
        h.updatedAt = Date.now() + 1000;
        window.HabitualCore.saveState();
        if (window.HabitualCore.SyncManager) {
          if (window.HabitualCore.SyncManager._broadcastTimer) {
            clearTimeout(window.HabitualCore.SyncManager._broadcastTimer);
            window.HabitualCore.SyncManager._broadcastTimer = null;
          }
          window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
        }
      }
      return true;
    }, { id: habitId });

    let batch1Success = false;
    let t0Batch1 = Date.now();
    for (let i = 0; i < 80; i++) {
      await page2.waitForTimeout(100);
      try {
        batch1Success = await page2.evaluate(({ id }) => {
          const habits = window.HabitualCore.state ? window.HabitualCore.state.habits : [];
          const h = habits.find(x => x.id === id);
          return h && h.name === 'Renamed Workout' && h.colorTheme && h.colorTheme.toLowerCase() === '#d50000' && h.dailyTarget === 5 && h.type === 'negative';
        }, { id: habitId });
      } catch (e) {}
      if (batch1Success) break;
    }

    totalTests++;
    logResult('Core Habit Settings Sync (Name, Color, Target, Type)', batch1Success, `(${Date.now() - t0Batch1}ms <= 10000ms)`);
    if (batch1Success) passedTests++;

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
        h.updatedAt = Date.now() + 2000;
        window.HabitualCore.saveState();
        if (window.HabitualCore.SyncManager) {
          if (window.HabitualCore.SyncManager._broadcastTimer) {
            clearTimeout(window.HabitualCore.SyncManager._broadcastTimer);
            window.HabitualCore.SyncManager._broadcastTimer = null;
          }
          window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
        }
      }
      return true;
    }, { id: habitId });

    let batch2Success = false;
    let t0Batch2 = Date.now();
    for (let i = 0; i < 80; i++) {
      await page2.waitForTimeout(100);
      try {
        batch2Success = await page2.evaluate(({ id }) => {
          const habits = window.HabitualCore.state ? window.HabitualCore.state.habits : [];
          const h = habits.find(x => x.id === id);
          return h && h.showStreak === true && h.showCount === false && h.showDuration === true && h.hideHeatmap === true && h.hideFromAll === true && h.isPaused === true;
        }, { id: habitId });
      } catch (e) {}
      if (batch2Success) break;
    }

    totalTests++;
    logResult('Display & Privacy Settings Sync (Streak, Count, Duration, Pause, Hide)', batch2Success, `(${Date.now() - t0Batch2}ms <= 10000ms)`);
    if (batch2Success) passedTests++;

    // BATCH 3: Habit Category & Description
    console.log('\n⚙️ BATCH 3: Testing Taxonomy Sync (Category & Description)...');
    await page1.evaluate(({ id }) => {
      const h = window.HabitualCore.state.habits.find(x => x.id === id);
      if (h) {
        h.category = 'Fitness & Wellness';
        h.description = 'Drink 2L water daily';
        h.updatedAt = Date.now() + 3000;
        window.HabitualCore.saveState();
        if (window.HabitualCore.SyncManager) {
          if (window.HabitualCore.SyncManager._broadcastTimer) {
            clearTimeout(window.HabitualCore.SyncManager._broadcastTimer);
            window.HabitualCore.SyncManager._broadcastTimer = null;
          }
          window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
        }
      }
      return true;
    }, { id: habitId });

    let batch3Success = false;
    let t0Batch3 = Date.now();
    for (let i = 0; i < 80; i++) {
      await page2.waitForTimeout(100);
      try {
        batch3Success = await page2.evaluate(({ id }) => {
          const habits = window.HabitualCore.state ? window.HabitualCore.state.habits : [];
          const h = habits.find(x => x.id === id);
          return h && h.category === 'Fitness & Wellness' && h.description === 'Drink 2L water daily';
        }, { id: habitId });
      } catch (e) {}
      if (batch3Success) break;
    }

    totalTests++;
    logResult('Taxonomy Sync (Category & Description)', batch3Success, `(${Date.now() - t0Batch3}ms <= 10000ms)`);
    if (batch3Success) passedTests++;

    // BATCH 4: Habit List Reordering Sync
    console.log('\n↕️ BATCH 4: Testing Habit List Reordering Sync...');
    await page1.evaluate(() => {
      const h1 = { id: 'habit_a', name: 'Alpha Habit', updatedAt: Date.now(), logs: {} };
      const h2 = { id: 'habit_b', name: 'Beta Habit', updatedAt: Date.now(), logs: {} };
      const h3 = { id: 'habit_c', name: 'Gamma Habit', updatedAt: Date.now(), logs: {} };
      window.HabitualCore.state.habits.push(h1, h2, h3);
      window.HabitualCore.saveState();
      if (window.HabitualCore.SyncManager) {
        if (window.HabitualCore.SyncManager._broadcastTimer) {
          clearTimeout(window.HabitualCore.SyncManager._broadcastTimer);
          window.HabitualCore.SyncManager._broadcastTimer = null;
        }
        window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
      return true;
    });

    let habitsAppearedOn2 = false;
    for (let i = 0; i < 80; i++) {
      await page2.waitForTimeout(100);
      try {
        habitsAppearedOn2 = await page2.evaluate(() => {
          const habits = window.HabitualCore.state ? window.HabitualCore.state.habits : [];
          return habits.some(h => h.id === 'habit_a') && habits.some(h => h.id === 'habit_b') && habits.some(h => h.id === 'habit_c');
        });
      } catch (e) {}
      if (habitsAppearedOn2) break;
    }
    assert(habitsAppearedOn2, 'New habits synced to Device 2');

    await page1.evaluate(() => {
      const h = window.HabitualCore.state.habits;
      const h3 = h.find(x => x.id === 'habit_c');
      const h1 = h.find(x => x.id === 'habit_a');
      const h2 = h.find(x => x.id === 'habit_b');
      const others = h.filter(x => x.id !== 'habit_a' && x.id !== 'habit_b' && x.id !== 'habit_c');
      h3.updatedAt = Date.now() + 4000;
      h1.updatedAt = Date.now() + 4000;
      h2.updatedAt = Date.now() + 4000;
      window.HabitualCore.state.habits = [h3, h1, h2, ...others];
      window.HabitualCore.saveState();
      if (window.HabitualCore.SyncManager) {
        if (window.HabitualCore.SyncManager._broadcastTimer) {
          clearTimeout(window.HabitualCore.SyncManager._broadcastTimer);
          window.HabitualCore.SyncManager._broadcastTimer = null;
        }
        window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
      return true;
    });

    let reorderSuccess = false;
    let t0Batch4 = Date.now();
    for (let i = 0; i < 80; i++) {
      await page2.waitForTimeout(100);
      try {
        reorderSuccess = await page2.evaluate(() => {
          const ids = window.HabitualCore.state.habits.map(x => x.id);
          return ids[0] === 'habit_c' && ids[1] === 'habit_a' && ids[2] === 'habit_b';
        });
      } catch (e) {}
      if (reorderSuccess) break;
    }

    totalTests++;
    logResult('Habit List Reordering Sync ([Gamma, Alpha, Beta])', reorderSuccess, `(${Date.now() - t0Batch4}ms <= 10000ms)`);
    if (reorderSuccess) passedTests++;

    // BATCH 5: Global Settings (Selected Year & Startup Mode)
    console.log('\n🌐 BATCH 5: Testing Global App Settings Sync...');
    await page1.evaluate(() => {
      window.HabitualCore.state.selectedYear = 2025;
      window.HabitualCore.state.showQuickLogOnStartup = true;
      window.HabitualCore.saveState();
      if (window.HabitualCore.SyncManager) {
        if (window.HabitualCore.SyncManager._broadcastTimer) {
          clearTimeout(window.HabitualCore.SyncManager._broadcastTimer);
          window.HabitualCore.SyncManager._broadcastTimer = null;
        }
        window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
      return true;
    });

    let globalSuccess = false;
    let t0Batch5 = Date.now();
    for (let i = 0; i < 80; i++) {
      await page2.waitForTimeout(100);
      try {
        globalSuccess = await page2.evaluate(() => {
          return window.HabitualCore.state.selectedYear === 2025 && window.HabitualCore.state.showQuickLogOnStartup === true;
        });
      } catch (e) {}
      if (globalSuccess) break;
    }

    totalTests++;
    logResult('Global Settings Sync (Selected Year = 2025, Quick Log = true)', globalSuccess, `(${Date.now() - t0Batch5}ms <= 10000ms)`);
    if (globalSuccess) passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 ALL SETTINGS SYNC TEST PASSED: ${passedTests}/${totalTests} Passed!`);
    console.log(`========================================\n`);

  } finally {
    clearTimeout(globalTimeout);
    if (browser) {
      try {
        await Promise.race([
          browser.close(),
          new Promise(r => setTimeout(r, 2000))
        ]);
      } catch (e) {}
    }
    if (server) {
      try {
        if (typeof server.destroyAllSockets === 'function') server.destroyAllSockets();
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
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
    console.log('All Settings Sync Playwright Test Complete.');
    process.exit(0);
  }).catch((err) => {
    console.error('❌ All Settings Sync Playwright Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runAllSettingsSyncPlaywrightTests };
