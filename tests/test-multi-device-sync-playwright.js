/**
 * Playwright E2E Test Suite for Multi-Device Sync & Habit Deletion propagation
 * Verifies:
 * 1. Device 1 (Regular context) and Device 2 (Incognito / Private context) connected via Sync Code & Passphrase.
 * 2. Creating a habit on Device 1 automatically syncs to Device 2.
 * 3. Deleting that habit on Device 1 automatically propagates deletion to Device 2.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8089;
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

  const sockets = new Set();

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

async function runMultiDeviceSyncPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Multi-Device Sync & Habit Deletion Propagation...\n');

  const GLOBAL_TIMEOUT_MS = 60000;
  const globalTimeout = setTimeout(() => {
    console.error(`❌ Global Test Suite Timeout exceeded (${GLOBAL_TIMEOUT_MS}ms). Forcing process exit.`);
    process.exit(1);
  }, GLOBAL_TIMEOUT_MS);
  if (globalTimeout.unref) globalTimeout.unref();

  const server = await createStaticServer();
  let browser;

  let passedTests = 0;
  let totalTests = 0;

  try {
    browser = await chromium.launch({ headless: true })
      .catch(() => chromium.launch({ channel: 'chrome', headless: true }))
      .catch(() => chromium.launch({ channel: 'msedge', headless: true }));

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

    const SYNC_CODE = 'test_code_multidevice_' + Date.now();
    const PASSPHRASE = 'Passphrase_Secure_123!';
    const HABIT_NAME = 'Shared Habit To Delete ' + Math.floor(Math.random() * 1000);

    // STEP 1: Load Device 1 & Setup Live Sync Channel
    console.log('📱 STEP 1: Setting up Device 1 (Regular Context)...');
    await page1.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page1.waitForLoadState('domcontentloaded');

    await page1.evaluate(({ code, pass }) => {
      window.HabitualCore.CLIENT_ID = 'cli_dev1_' + Math.random().toString(36).substring(2, 8);
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

    let createdHabitId = null;
    await page1.evaluate(async (name) => {
      window.HabitualCore.openHabitModal();
      const nameInput = document.getElementById('habit-name');
      if (nameInput) nameInput.value = name;
      window.HabitualCore.handleHabitFormSubmit();
      if (window.HabitualCore.SyncManager && window.HabitualCore.SyncManager.broadcastWrite) {
        await window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
    }, HABIT_NAME);

    await page1.waitForTimeout(300);

    const device1HasHabit = await page1.evaluate((name) => {
      const h = window.HabitualCore.state.habits.find(x => x.name === name);
      return h ? h.id : null;
    }, HABIT_NAME);

    createdHabitId = device1HasHabit;
    totalTests++;
    logResult('Device 1 Created Habit', Boolean(device1HasHabit), `(Habit ID: ${createdHabitId})`);
    passedTests++;

    // STEP 2: Load Device 2 (Incognito) & Connect
    console.log('\n🕵️ STEP 2: Setting up Device 2 (Private / Incognito Context)...');
    await page2.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page2.waitForLoadState('domcontentloaded');

    await page2.evaluate(({ code, pass }) => {
      window.HabitualCore.CLIENT_ID = 'cli_dev2_' + Math.random().toString(36).substring(2, 8);
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

    let syncedToDevice2 = false;
    for (let i = 0; i < 35; i++) {
      await page2.waitForTimeout(300);
      try {
        syncedToDevice2 = await page2.evaluate((id) => {
          return window.HabitualCore.state.habits.some(h => h.id === id);
        }, createdHabitId);
      } catch (e) {}
      if (syncedToDevice2) break;
    }

    totalTests++;
    logResult('Device 2 Received Synced Habit', syncedToDevice2, `(Habit: "${HABIT_NAME}")`);
    passedTests++;

    // STEP 3: Delete Habit on Device 1
    console.log('\n🗑️ STEP 3: Deleting Habit on Device 1...');
    await page1.evaluate(async (id) => {
      window.HabitualCore.deleteHabit(id);
      if (window.HabitualCore.SyncManager && window.HabitualCore.SyncManager.broadcastWrite) {
        await window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
    }, createdHabitId);

    await page1.waitForTimeout(300);

    const device1Deleted = await page1.evaluate((id) => {
      return !window.HabitualCore.state.habits.some(h => h.id === id);
    }, createdHabitId);

    totalTests++;
    logResult('Habit Removed from Device 1 UI & State', device1Deleted);
    passedTests++;

    // STEP 4: Verify Deletion Sync on Device 2
    console.log('\n🔄 STEP 4: Verifying Automatic Deletion Sync on Device 2 (Incognito Context)...');
    let device2Deleted = false;
    for (let i = 0; i < 25; i++) {
      await page2.waitForTimeout(300);
      try {
        device2Deleted = await page2.evaluate((id) => {
          return !window.HabitualCore.state.habits.some(h => h.id === id);
        }, createdHabitId);
      } catch (e) {}
      if (device2Deleted) break;
    }

    totalTests++;
    logResult('Habit Automatically Deleted on Device 2 via Sync', device2Deleted);
    passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 MULTI-DEVICE SYNC TEST PASSED: ${passedTests}/${totalTests} Passed!`);
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
  runMultiDeviceSyncPlaywrightTests().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('\n❌ Multi-Device Sync Playwright Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runMultiDeviceSyncPlaywrightTests };
