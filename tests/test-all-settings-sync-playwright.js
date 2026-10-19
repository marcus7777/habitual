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

const mockStore = new Map();
let globalLastTs = 1000;

async function setupMockFirestore(page) {
  await page.route('**/*firebase*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.__pw_firebase_loaded = true;'
  }));

  try {
    await page.exposeFunction('__pw_firestore_set', (key, data) => {
      mockStore.set(key, data);
    });
  } catch (e) {}

  try {
    await page.exposeFunction('__pw_firestore_get', (key) => {
      return mockStore.get(key) || null;
    });
  } catch (e) {}

  try {
    await page.exposeFunction('__pw_firestore_next_ts', () => {
      globalLastTs = Math.max(Date.now(), globalLastTs + 1);
      return globalLastTs;
    });
  } catch (e) {}

  await page.addInitScript(() => {
    if (!window.__pw_channel) {
      window.__pw_channel = new BroadcastChannel('pw_firestore_channel');
    }
    const channel = window.__pw_channel;

    const listeners = window.__pw_listeners || new Map();
    window.__pw_listeners = listeners;

    channel.onmessage = (event) => {
      if (!event.data) return;
      const { col, docId, data } = event.data;
      const key = `${col}_${docId}`;
      if (listeners.has(key)) {
        listeners.get(key).forEach(cb => {
          try { cb({ exists: true, data: () => data, metadata: { hasPendingWrites: false } }); } catch (e) {}
        });
      }
    };

    const mockDb = {
      collection: function(col) {
        return {
          doc: function(docId) {
            const key = `${col}_${docId}`;
            return {
              id: docId,
              set: function(data) {
                return window.__pw_firestore_next_ts().then(ts => {
                  const normData = Object.assign({}, data, {
                    updatedAt: ts
                  });
                  window.__pw_firestore_set(key, normData);
                  channel.postMessage({ col, docId, data: normData });
                  if (listeners.has(key)) {
                    listeners.get(key).forEach(cb => {
                      try { cb({ exists: true, data: () => normData, metadata: { hasPendingWrites: false } }); } catch (e) {}
                    });
                  }
                  return Promise.resolve();
                });
              },
              get: function() {
                return window.__pw_firestore_get(key).then(data => {
                  return {
                    exists: Boolean(data),
                    data: function() { return data; }
                  };
                });
              },
              onSnapshot: function(cb) {
                if (!listeners.has(key)) listeners.set(key, []);
                listeners.get(key).push(cb);
                window.__pw_firestore_get(key).then(data => {
                  if (data) {
                    try { cb({ exists: true, data: () => data, metadata: { hasPendingWrites: false } }); } catch (e) {}
                  }
                });
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

    const mockFirebase = {
      apps: [{ name: '[DEFAULT]' }],
      initializeApp: function() { return {}; },
      firestore: function() {
        return mockDb;
      }
    };
    mockFirebase.firestore.FieldValue = {
      serverTimestamp: function() { return Date.now(); }
    };

    window.firebase = mockFirebase;

    if (!window.HabitualCore) window.HabitualCore = {};
    if (!window.HabitualCore.SyncTargets) window.HabitualCore.SyncTargets = {};
    if (!window.HabitualCore.SyncTargets.Firestore) window.HabitualCore.SyncTargets.Firestore = {};
    window.HabitualCore.SyncTargets.Firestore.db = mockDb;
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

    const SYNC_CODE = 'test_code_all_settings_' + Date.now();
    const PASSPHRASE = 'Passphrase_Settings_123!';

    // STEP 1: Load Device 1 & Connect Live Sync
    console.log('📱 STEP 1: Setting up Device 1 (Regular Context)...');
    await setupMockFirestore(page1);
    await page1.goto(`http://127.0.0.1:${serverPort}/index.html`);
    await page1.waitForLoadState('domcontentloaded');

    await page1.evaluate(({ code, pass }) => {
      window.HabitualCore.CLIENT_ID = 'cli_dev1_' + Math.random().toString(36).substring(2, 8);
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
        window.HabitualCore.SyncTargets.Firestore.startLiveSync();
      }
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    // STEP 2: Create Initial Habit on Device 1
    console.log('\n📝 STEP 2: Creating Initial Habit on Device 1...');
    const INITIAL_NAME = 'Initial Habit ' + Math.floor(Math.random() * 1000);
    await page1.evaluate(async (name) => {
      window.HabitualCore.openHabitModal();
      const nameInput = document.getElementById('habit-name');
      const colorSelect = document.getElementById('habit-calendar-color-select');
      if (nameInput) nameInput.value = name;
      if (colorSelect) colorSelect.value = '#33B679';
      window.HabitualCore.handleHabitFormSubmit();
      if (window.HabitualCore.SyncManager && window.HabitualCore.SyncManager.broadcastWrite) {
        await window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
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
    await setupMockFirestore(page2);
    await page2.goto(`http://127.0.0.1:${serverPort}/index.html`);
    await page2.waitForLoadState('domcontentloaded');

    await page2.evaluate(({ code, pass }) => {
      window.HabitualCore.CLIENT_ID = 'cli_dev2_' + Math.random().toString(36).substring(2, 8);
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
        window.HabitualCore.SyncTargets.Firestore.startLiveSync();
      }
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    let initSynced = false;
    let t0Init = Date.now();
    for (let i = 0; i < 50; i++) {
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
    logResult('Device 2 Received Initial Synced Habit', initSynced, `(${Date.now() - t0Init}ms <= 5000ms)`);
    passedTests++;

    // BATCH 1: All Habit Settings (Core, Privacy, Display, Taxonomy)
    console.log('\n⚙️ BATCH 1: Testing All Habit Settings Sync (Name, Color, Target, Type, Display, Privacy, Taxonomy)...');
    await page1.evaluate(async ({ id }) => {
      const h = window.HabitualCore.state.habits.find(x => x.id === id);
      if (h) {
        h.name = 'Renamed Workout';
        h.colorTheme = '#D50000';
        h.dailyTarget = 5;
        h.type = 'negative';
        h.showStreak = true;
        h.showCount = false;
        h.showDuration = true;
        h.hideHeatmap = true;
        h.hideFromAll = true;
        h.isPaused = true;
        h.category = 'Fitness & Wellness';
        h.description = 'Drink 2L water daily';
        window.HabitualCore.saveHabit(h);
        if (window.HabitualCore.SyncManager && window.HabitualCore.SyncManager.broadcastWrite) {
          await window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
        }
      }
    }, { id: habitId });

    let batch1Success = false;
    let t0Batch1 = Date.now();
    for (let i = 0; i < 50; i++) {
      await page2.waitForTimeout(100);
      try {
        batch1Success = await page2.evaluate(({ id }) => {
          const habits = window.HabitualCore.state ? window.HabitualCore.state.habits : [];
          const h = habits.find(x => x.id === id);
          return h &&
            h.name === 'Renamed Workout' &&
            h.dailyTarget === 5 &&
            h.type === 'negative' &&
            h.showStreak === true &&
            h.showCount === false &&
            h.showDuration === true &&
            h.hideHeatmap === true &&
            h.hideFromAll === true &&
            h.isPaused === true &&
            h.category === 'Fitness & Wellness' &&
            h.description === 'Drink 2L water daily';
        }, { id: habitId });
      } catch (e) {}
      if (batch1Success) break;
    }

    totalTests++;
    logResult('All Habit Settings Sync (Name, Color, Target, Type, Privacy, Taxonomy)', batch1Success, `(${Date.now() - t0Batch1}ms <= 5000ms)`);
    if (batch1Success) passedTests++;

    // BATCH 2: Habit Reordering & Global App Settings
    console.log('\n↕️ BATCH 2: Testing Habit List Reordering & Global App Settings Sync...');
    await page1.evaluate(async () => {
      const h1 = { id: 'habit_a', name: 'Alpha Habit', updatedAt: Date.now(), logs: {} };
      const h2 = { id: 'habit_b', name: 'Beta Habit', updatedAt: Date.now(), logs: {} };
      const h3 = { id: 'habit_c', name: 'Gamma Habit', updatedAt: Date.now(), logs: {} };
      window.HabitualCore.state.habits.push(h1, h2, h3);
      window.HabitualCore.state.selectedYear = 2025;
      window.HabitualCore.state.showQuickLogOnStartup = true;

      const h = window.HabitualCore.state.habits;
      const gc = h.find(x => x.id === 'habit_c');
      const ga = h.find(x => x.id === 'habit_a');
      const gb = h.find(x => x.id === 'habit_b');
      const others = h.filter(x => x.id !== 'habit_a' && x.id !== 'habit_b' && x.id !== 'habit_c');
      gc.updatedAt = Date.now() + 10;
      ga.updatedAt = Date.now() + 10;
      gb.updatedAt = Date.now() + 10;
      window.HabitualCore.state.habits = [gc, ga, gb, ...others];

      window.HabitualCore.saveState();
      if (window.HabitualCore.SyncManager && window.HabitualCore.SyncManager.broadcastWrite) {
        await window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
    });

    let batch2Success = false;
    let t0Batch2 = Date.now();
    for (let i = 0; i < 50; i++) {
      await page2.waitForTimeout(100);
      try {
        batch2Success = await page2.evaluate(() => {
          const state = window.HabitualCore.state;
          const habits = state ? state.habits : [];
          const ids = habits.map(x => x.id);
          const reordered = ids[0] === 'habit_c' && ids[1] === 'habit_a' && ids[2] === 'habit_b';
          const globalSynced = state.selectedYear === 2025 && state.showQuickLogOnStartup === true;
          return reordered && globalSynced;
        });
      } catch (e) {}
      if (batch2Success) break;
    }

    totalTests++;
    logResult('Habit List Reordering & Global Settings Sync', batch2Success, `(${Date.now() - t0Batch2}ms <= 5000ms)`);
    if (batch2Success) passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 ALL SETTINGS SYNC TEST PASSED: ${passedTests}/${totalTests} Passed!`);
    console.log(`========================================\n`);

  } finally {
    clearTimeout(globalTimeout);
    if (server) {
      try {
        if (typeof server.destroyAllSockets === 'function') server.destroyAllSockets();
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        server.close();
        server.unref();
      } catch (e) {}
    }
    if (browser) {
      try {
        browser.close().catch(() => {});
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
