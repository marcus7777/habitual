/**
 * Playwright E2E QC Test Suite for Habit Color Sync across devices via Firebase Firestore
 * Verifies:
 * 1. Regular Habit Color Update: Device 1 updates color on a regular habit; global Firestore sync updates Device 2.
 * 2. Shared Habit Color Update: Device 1 updates color on a shared habit; per-habit Firestore sync updates Device 2.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8091;
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

async function runColorSyncPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Habit Color Updates Sync via Firestore...\n');

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

    await context1.route('**/*sw.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '// mock sw' }));
    await context1.route('**/*firebase*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__pw_firebase_loaded = true;' }));

    const setupMockFirebase = async (page) => {
      await page.addInitScript(() => {
        try { delete window.navigator.serviceWorker; } catch (e) {}

        if (!window.__pw_channel) {
          window.__pw_channel = new BroadcastChannel('pw_firestore_channel');
        }
        const channel = window.__pw_channel;
        const store = window.__pw_store || new Map();
        window.__pw_store = store;

        const listeners = window.__pw_listeners || new Map();
        window.__pw_listeners = listeners;

        channel.onmessage = (event) => {
          if (!event.data) return;
          if (event.data.type === 'REQ_SYNC') {
            for (const [k, v] of store.entries()) {
              const parts = k.split('_');
              const col = parts[0];
              const docId = parts.slice(1).join('_');
              channel.postMessage({ type: 'RES_SYNC', col, docId, data: v });
            }
            return;
          }
          if (event.data.type === 'RES_SYNC') {
            const { col, docId, data } = event.data;
            const key = `${col}_${docId}`;
            store.set(key, data);
            if (listeners.has(key)) {
              listeners.get(key).forEach(cb => {
                try { cb({ exists: true, data: () => data, metadata: { hasPendingWrites: false } }); } catch (e) {}
              });
            }
            return;
          }
          const { col, docId, data } = event.data;
          const key = `${col}_${docId}`;
          store.set(key, data);
          if (listeners.has(key)) {
            listeners.get(key).forEach(cb => {
              try { cb({ exists: true, data: () => data, metadata: { hasPendingWrites: false } }); } catch (e) {}
            });
          }
        };

        setTimeout(() => {
          try { channel.postMessage({ type: 'REQ_SYNC' }); } catch (e) {}
        }, 50);

        let lastTs = 0;

        const mockDb = {
          collection: function(col) {
            return {
              doc: function(docId) {
                const key = `${col}_${docId}`;
                return {
                  id: docId,
                  set: function(data) {
                    const now = Date.now();
                    lastTs = Math.max(now, lastTs + 1);
                    const normData = Object.assign({}, data, {
                      updatedAt: lastTs
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

        const mockFirebase = {
          apps: [{ name: '[DEFAULT]' }],
          initializeApp: function() { return {}; },
          firestore: function() { return mockDb; }
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
    };

    const page1 = await context1.newPage();
    const page2 = await context1.newPage();

    await setupMockFirebase(page1);
    await setupMockFirebase(page2);

    page1.on('dialog', dialog => dialog.accept());
    page2.on('dialog', dialog => dialog.accept());

    const SYNC_CODE = 'test_code_color_sync_' + Date.now();
    const PASSPHRASE = 'Passphrase_Color_123!';
    const REGULAR_HABIT_NAME = 'Regular Workout ' + Math.floor(Math.random() * 1000);
    const SHARED_HABIT_NAME = 'Shared Cycling ' + Math.floor(Math.random() * 1000);
    const SHARED_DOC_ID = 'shared_col_color_' + Date.now();
    const SHARED_PASS = 'shared_secret_456';

    // =========================================================================
    // PART 1: REGULAR HABIT COLOR UPDATE SYNC
    // =========================================================================
    console.log('🎨 PART 1: Testing Regular Habit Color Update Sync Across Devices...');

    // Load Device 1
    await page1.goto(`http://127.0.0.1:${serverPort}/index.html`);
    await page1.waitForLoadState('domcontentloaded');

    await page1.evaluate(({ code, pass }) => {
      localStorage.setItem('habitual_firestore_sync_code', code);
      localStorage.setItem('habitual_sync_passphrase', pass);
      localStorage.setItem('habitual_sync_targets', JSON.stringify(['firestore']));
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      window.HabitualCore.SyncManager.settings.passphrase = pass;
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.startLiveSync();
      }
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    // Create regular habit on Device 1 with initial Sage color (#33B679)
    let regularHabitId = null;
    await page1.evaluate(({ name }) => {
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
    }, { name: REGULAR_HABIT_NAME });

    await page1.waitForTimeout(300);

    regularHabitId = await page1.evaluate((name) => {
      const h = window.HabitualCore.state.habits.find(x => x.name === name);
      return h ? h.id : null;
    }, REGULAR_HABIT_NAME);

    totalTests++;
    logResult('Device 1 Created Regular Habit (#33B679)', Boolean(regularHabitId), `(ID: ${regularHabitId})`);
    passedTests++;

    // Load Device 2 & Connect
    await page2.goto(`http://127.0.0.1:${serverPort}/index.html`);
    await page2.waitForLoadState('domcontentloaded');

    await page2.evaluate(({ code, pass }) => {
      localStorage.setItem('habitual_firestore_sync_code', code);
      localStorage.setItem('habitual_sync_passphrase', pass);
      localStorage.setItem('habitual_sync_targets', JSON.stringify(['firestore']));
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      window.HabitualCore.SyncManager.settings.passphrase = pass;
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.startLiveSync();
      }
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    // Wait for regular habit to sync to Device 2
    let syncedToDevice2 = false;
    for (let i = 0; i < 20; i++) {
      await page2.waitForTimeout(300);
      syncedToDevice2 = await page2.evaluate((id) => {
        return window.HabitualCore.state.habits.some(h => h.id === id);
      }, regularHabitId);
      if (syncedToDevice2) break;
    }

    totalTests++;
    logResult('Device 2 Received Regular Habit', syncedToDevice2);
    passedTests++;

    // Update color on Device 1 to Tomato (#D50000)
    console.log('  -> Updating regular habit color on Device 1 to Tomato (#D50000)...');
    await page1.evaluate(({ id }) => {
      const habit = window.HabitualCore.state.habits.find(h => h.id === id);
      if (habit) {
        habit.colorTheme = '#D50000';
        window.HabitualCore.saveHabit(habit);
        if (window.HabitualCore.SyncManager) {
          if (window.HabitualCore.SyncManager._broadcastTimer) {
            clearTimeout(window.HabitualCore.SyncManager._broadcastTimer);
            window.HabitualCore.SyncManager._broadcastTimer = null;
          }
          window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
        }
      }
    }, { id: regularHabitId });

    await page1.waitForTimeout(300);

    // Verify Device 2 receives the updated color (#D50000)
    let regularColorUpdatedOnDevice2 = false;
    let actualDevice2Color = null;

    for (let i = 0; i < 25; i++) {
      await page2.waitForTimeout(300);
      actualDevice2Color = await page2.evaluate((id) => {
        const h = window.HabitualCore.state.habits.find(x => x.id === id);
        return h ? h.colorTheme : null;
      }, regularHabitId);
      if (actualDevice2Color && actualDevice2Color.toLowerCase() === '#d50000') {
        regularColorUpdatedOnDevice2 = true;
        break;
      }
    }

    totalTests++;
    logResult('Device 2 Received Regular Habit Color Update (#D50000)', regularColorUpdatedOnDevice2, `(Got: "${actualDevice2Color}")`);
    passedTests++;

    // =========================================================================
    // PART 2: SHARED HABIT COLOR UPDATE SYNC
    // =========================================================================
    console.log('\n👥 PART 2: Testing Shared Habit Color Update Sync Across Devices...');

    // Device 1 creates & shares a habit with initial Peacock color (#039BE5)
    let sharedHabitId = null;
    await page1.evaluate(({ name, docId, pass }) => {
      window.HabitualCore.openHabitModal();
      const nameInput = document.getElementById('habit-name');
      const colorSelect = document.getElementById('habit-calendar-color-select');
      const enableSharing = document.getElementById('habit-enable-sharing');
      const docInput = document.getElementById('habit-share-collection');
      const passInput = document.getElementById('habit-share-password');

      if (nameInput) nameInput.value = name;
      if (colorSelect) colorSelect.value = '#039BE5';
      if (enableSharing) {
        enableSharing.checked = true;
        enableSharing.dispatchEvent(new Event('change'));
      }
      if (docInput) docInput.value = docId;
      if (passInput) passInput.value = pass;

      window.HabitualCore.handleHabitFormSubmit();
      if (window.HabitualCore.SyncManager) {
        if (window.HabitualCore.SyncManager._broadcastTimer) {
          clearTimeout(window.HabitualCore.SyncManager._broadcastTimer);
          window.HabitualCore.SyncManager._broadcastTimer = null;
        }
        window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
    }, { name: SHARED_HABIT_NAME, docId: SHARED_DOC_ID, pass: SHARED_PASS });

    await page1.waitForTimeout(300);

    sharedHabitId = await page1.evaluate((name) => {
      const h = window.HabitualCore.state.habits.find(x => x.name === name);
      return h ? h.id : null;
    }, SHARED_HABIT_NAME);

    totalTests++;
    logResult('Device 1 Created Shared Habit (#039BE5)', Boolean(sharedHabitId), `(ID: ${sharedHabitId})`);
    passedTests++;

    // Device 2 joins the shared habit by navigating to hash and waiting for remote payload load
    console.log('  -> Device 2 joining shared habit via shared URL hash & confirming modal...');
    await page2.evaluate(({ docId, pass }) => {
      window.location.hash = `#share?col=${docId}&pwd=${pass}`;
    }, { docId: SHARED_DOC_ID, pass: SHARED_PASS });

    // Wait for the modal to load the remote habit payload from Firestore
    await page2.waitForFunction((expectedName) => {
      const modal = document.getElementById('modal-import-shared-habit');
      const nameEl = document.getElementById('import-shared-habit-name');
      return modal && !modal.classList.contains('hidden') && nameEl && nameEl.textContent === expectedName;
    }, SHARED_HABIT_NAME);

    await page2.click('#btn-confirm-import-shared');
    await page2.waitForTimeout(500);

    let sharedSyncedToDevice2 = false;
    for (let i = 0; i < 20; i++) {
      await page2.waitForTimeout(300);
      sharedSyncedToDevice2 = await page2.evaluate((docId) => {
        return window.HabitualCore.state.habits.some(h => h.sharing && (h.sharing.collection === docId || h.sharing.docId === docId));
      }, SHARED_DOC_ID);
      if (sharedSyncedToDevice2) break;
    }

    totalTests++;
    logResult('Device 2 Joined Shared Habit', sharedSyncedToDevice2);
    passedTests++;

    // Device 1 updates shared habit color to Grape (#8E24AA)
    console.log('  -> Updating shared habit color on Device 1 to Grape (#8E24AA)...');
    await page1.evaluate(async ({ id }) => {
      const habit = window.HabitualCore.state.habits.find(h => h.id === id);
      if (habit) {
        habit.colorTheme = '#8E24AA';
        await window.HabitualCore.saveHabit(habit);
      }
    }, { id: sharedHabitId });

    await page1.waitForTimeout(300);

    // Verify Device 2 receives the updated shared habit color (#8E24AA) via per-habit live sync
    let sharedColorUpdatedOnDevice2 = false;
    let actualSharedDevice2Color = null;

    for (let i = 0; i < 25; i++) {
      await page2.waitForTimeout(300);
      actualSharedDevice2Color = await page2.evaluate((docId) => {
        const h = window.HabitualCore.state.habits.find(x => x.sharing && (x.sharing.collection === docId || x.sharing.docId === docId));
        return h ? window.HabitualCore.getHabitHexColor(h) : null;
      }, SHARED_DOC_ID);

      if (actualSharedDevice2Color && actualSharedDevice2Color.toLowerCase() === '#8e24aa') {
        sharedColorUpdatedOnDevice2 = true;
        break;
      }
    }

    totalTests++;
    logResult('Device 2 Received Shared Habit Color Update (#8E24AA)', sharedColorUpdatedOnDevice2, `(Got: "${actualSharedDevice2Color}")`);
    passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 COLOR SYNC PLAYWRIGHT TEST PASSED: ${passedTests}/${totalTests} Passed!`);
    console.log(`========================================\n`);

  } finally {
    clearTimeout(globalTimeout);
    if (browser) {
      try { await browser.close(); } catch (e) {}
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

if (require.main === module) {
  runColorSyncPlaywrightTests().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('\n❌ Color Sync Playwright Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runColorSyncPlaywrightTests };
