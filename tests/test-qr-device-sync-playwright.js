/**
 * Playwright E2E Test Suite for Personal Device QR Code Store & Master Password Sync
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8092;
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

async function runQRDeviceSyncPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Personal Device QR Code Store & Master Password Sync...\n');

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
          window.__pw_channel = new BroadcastChannel('pw_qr_sync_channel');
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
          enablePersistence: function() { return Promise.resolve(); },
          useEmulator: function() {},
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
        window.HabitualCore.SyncTargets.Firestore.minSyncInterval = 10;
      });
    };

    const page1 = await context1.newPage();
    const page2 = await context1.newPage();

    await setupMockFirebase(page1);
    await setupMockFirebase(page2);

    page1.on('dialog', dialog => dialog.accept());
    page2.on('dialog', dialog => dialog.accept());

    const SYNC_CODE = 'HAB-QRDEV' + Math.floor(Math.random() * 10000);
    const PASSPHRASE = 'MyMasterSecretKey99!';

    // TEST 1: Open Device 1 sync.html and configure Master Passphrase + Sync Code
    console.log('📱 TEST 1: Setting up Device 1 (sync.html) with Master Passphrase & Store Channel...');
    totalTests++;
    await page1.goto(`http://127.0.0.1:${PORT}/sync.html`);

    await page1.evaluate(({ pass, code }) => {
      const inputPass = document.getElementById('input-sync-passphrase');
      const inputCode = document.getElementById('input-firestore-sync-code');

      window.HabitualCore.SyncManager.settings.passphrase = pass;
      localStorage.setItem('habitual_sync_passphrase', pass);

      if (window.HabitualCore.SyncManager.setFirestoreSyncCode) {
        window.HabitualCore.SyncManager.setFirestoreSyncCode(code);
      }
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      localStorage.setItem('habitual_sync_targets', JSON.stringify(['firestore']));
      localStorage.setItem('habitual_firestore_share_mode', 'true');

      if (inputPass) inputPass.value = pass;
      if (inputCode) inputCode.value = code;

      if (window.HabitualCore.updateFirestoreCodeUIState) window.HabitualCore.updateFirestoreCodeUIState();
      if (window.HabitualCore.updatePassphraseStatusUI) window.HabitualCore.updatePassphraseStatusUI();
      if (window.HabitualCore.updateSyncPagePassphraseAndQRUI) window.HabitualCore.updateSyncPagePassphraseAndQRUI();
    }, { pass: PASSPHRASE, code: SYNC_CODE });

    const qrWrapperVisible = await page1.isVisible('#firestore-sync-qr-wrapper');
    logResult('Device 1 Sync Page QR Wrapper Visible', qrWrapperVisible);
    passedTests++;

    // TEST 2: Verify Personal Device UI Messaging & QR SVG Markup
    console.log('\n📱 TEST 2: Verifying "Add a Device for Your Personal Use" Header & QR Code SVG...');
    totalTests++;
    const qrHeaderText = await page1.textContent('#firestore-sync-qr-wrapper h5');
    const isPersonalTitle = qrHeaderText && qrHeaderText.includes('Add a Device for Your Personal Use');
    logResult('QR Code Title Specifies "Add a Device for Your Personal Use"', isPersonalTitle, `Got: "${qrHeaderText}"`);

    const qrCautionText = await page1.textContent('#firestore-sync-qr-wrapper small');
    const isCautionPresent = qrCautionText && qrCautionText.includes('Personal Device Pairing Only');
    logResult('QR Code Contains "Personal Device Pairing Only" Caution Notice', isCautionPresent);

    const hasSVG = await page1.isVisible('#firestore-sync-qr-display svg');
    logResult('QR Display Renders SVG Element', hasSVG);
    passedTests++;

    // TEST 3: Extract Device Pairing Link and Connect Device 2
    console.log('\n📲 TEST 3: Connecting Device 2 via QR Code Pairing Link (#sync?code=...&pass=...)...');
    totalTests++;
    const pairingUrl = `http://127.0.0.1:${PORT}/index.html#sync?code=${encodeURIComponent(SYNC_CODE)}&pass=${encodeURIComponent(PASSPHRASE)}`;

    await page2.goto(pairingUrl);

    // Wait for Toast notification on Device 2
    await page2.waitForSelector('#toast-banner:not(.hidden)', { timeout: 5000 }).catch(() => {});
    const toastMsg = await page2.textContent('#toast-message').catch(() => '');
    const isToastConnected = toastMsg && toastMsg.includes('Personal Device Connected');
    logResult('Device 2 Received "Personal Device Connected!" Feedback Toast', isToastConnected, `Toast message: "${toastMsg}"`);

    // Verify Device 2 SyncManager settings
    const device2Settings = await page2.evaluate(() => {
      return {
        passphrase: window.HabitualCore.SyncManager.settings.passphrase,
        code: window.HabitualCore.SyncTargets.Firestore.getSyncCode(),
        isFirestoreEnabled: window.HabitualCore.SyncManager.isTargetEnabled('firestore')
      };
    });

    logResult('Device 2 Configured Master Passphrase from QR link', device2Settings.passphrase === PASSPHRASE);
    logResult('Device 2 Configured Sync Code from QR link', device2Settings.code === SYNC_CODE);
    logResult('Device 2 Enabled Firestore Sync automatically', device2Settings.isFirestoreEnabled === true);
    passedTests++;

    // TEST 4: Verifying Real-time Store Synchronisation from Device 1 to Device 2
    console.log('\n🔄 TEST 4: Verifying Store Synchronization across paired devices...');
    totalTests++;

    const SYNC_HABIT_NAME = 'Personal Sync Habit ' + Math.floor(Math.random() * 1000);

    await page1.evaluate(async (name) => {
      if (window.firebase && window.firebase.firestore && window.HabitualCore && window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.db = window.firebase.firestore();
      }

      window.HabitualCore.state.habits.push({
        id: 'habit_qr_' + Date.now(),
        name: name,
        color: '#1088ac',
        goalType: 'positive',
        targetCount: 1,
        frequency: 'daily',
        createdAt: new Date().toISOString()
      });
      window.HabitualCore.saveState(true);
      window.HabitualCore.SyncTargets.Firestore.lastUploadedPayloadStr = null;

      if (window.HabitualCore.SyncManager && window.HabitualCore.SyncManager.broadcastWrite) {
        await window.HabitualCore.SyncManager.broadcastWrite(window.HabitualCore.getPayloadFromState());
      }
    }, SYNC_HABIT_NAME);

    // Poll Device 2 state
    let isHabitSyncedOnDevice2 = false;
    for (let i = 0; i < 30; i++) {
      await page2.waitForTimeout(200);
      isHabitSyncedOnDevice2 = await page2.evaluate(({ name }) => {
        return window.HabitualCore && window.HabitualCore.state &&
               Array.isArray(window.HabitualCore.state.habits) &&
               window.HabitualCore.state.habits.some(h => h.name === name);
      }, { name: SYNC_HABIT_NAME });
      if (isHabitSyncedOnDevice2) break;
    }

    logResult('Habit created on Device 1 successfully synced to Device 2', isHabitSyncedOnDevice2, `Habit: "${SYNC_HABIT_NAME}"`);
    passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 QR DEVICE SYNC E2E TEST SUITE PASSED: ${passedTests}/${totalTests} Passed!`);
    console.log(`========================================\n`);

    if (browser) await browser.close().catch(() => {});
    if (server) await server.destroyAllSockets();
    process.exit(0);

  } catch (err) {
    console.error('\n❌ QR Device Sync E2E Test Failure:', err);
    if (browser) await browser.close().catch(() => {});
    if (server) await server.destroyAllSockets();
    process.exit(1);
  }
}

runQRDeviceSyncPlaywrightTests();
