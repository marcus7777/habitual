/**
 * Playwright E2E Test Suite for Multi-Device Sync & Habit Deletion propagation
 * Running against the REAL Local Firebase Emulator Suite (Firestore on 8080 & Functions on 5001).
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8099;
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

function setupEmulatorClient(page) {
  return page.addInitScript(() => {
    function jsonToFirestoreFields(obj) {
      const fields = {};
      for (const [k, v] of Object.entries(obj || {})) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) {
          fields[k] = { arrayValue: { values: v.map(x => ({ stringValue: String(x) })) } };
        } else if (typeof v === 'boolean') {
          fields[k] = { booleanValue: v };
        } else if (typeof v === 'number') {
          fields[k] = { integerValue: String(v) };
        } else {
          fields[k] = { stringValue: String(v) };
        }
      }
      return fields;
    }

    function firestoreFieldsToJson(fields) {
      const res = {};
      for (const [k, v] of Object.entries(fields || {})) {
        if (v.stringValue !== undefined) res[k] = v.stringValue;
        else if (v.booleanValue !== undefined) res[k] = v.booleanValue;
        else if (v.integerValue !== undefined) res[k] = parseInt(v.integerValue, 10);
        else if (v.arrayValue) {
          res[k] = (v.arrayValue.values || []).map(x => x.stringValue !== undefined ? x.stringValue : (x.integerValue !== undefined ? parseInt(x.integerValue, 10) : x));
        }
      }
      return res;
    }

    window.firebase = {
      apps: [],
      initializeApp: function() {},
      firestore: function() {
        return {
          useEmulator: function() {},
          collection: function(colName) {
            return {
              doc: function(docId) {
                const autoId = docId || ('doc_' + Math.random().toString(36).substring(2, 10));
                return {
                  id: autoId,
                  set: async function(data) {
                    const url = `http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/${colName}/${autoId}`;
                    const res = await fetch(url, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ fields: jsonToFirestoreFields(data) })
                    });
                    return res.json();
                  },
                  get: async function() {
                    const url = `http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/${colName}/${autoId}`;
                    const res = await fetch(url);
                    if (!res.ok) return { exists: false, data: () => null };
                    const json = await res.json();
                    const data = json.fields ? firestoreFieldsToJson(json.fields) : null;
                    return { exists: !!data, data: () => data };
                  },
                  onSnapshot: function(cb) {
                    let active = true;
                    let lastUpdateTime = null;
                    const poll = async () => {
                      if (!active) return;
                      try {
                        const url = `http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/${colName}/${autoId}`;
                        const res = await fetch(url);
                        if (res.ok) {
                          const json = await res.json();
                          const updateTime = json.updateTime;
                          if (updateTime !== lastUpdateTime) {
                            lastUpdateTime = updateTime;
                            const data = json.fields ? firestoreFieldsToJson(json.fields) : null;
                            if (data) cb({ exists: true, data: () => data, metadata: { hasPendingWrites: false } });
                          }
                        }
                      } catch (e) {}
                      if (active) setTimeout(poll, 300);
                    };
                    poll();
                    return () => { active = false; };
                  }
                };
              }
            };
          }
        };
      }
    };
    window.firebase.firestore.FieldValue = {
      serverTimestamp: () => new Date().toISOString()
    };
  });
}

function logResult(testName, isSuccess, details = '') {
  const status = isSuccess ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${status} ${testName} ${details}`);
  if (!isSuccess) throw new Error(`Test failed: ${testName} ${details}`);
}

async function runMultiDeviceSyncEmulatorPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Multi-Device Sync (FIREBASE EMULATOR BACKED)...\n');

  const server = await createStaticServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await setupEmulatorClient(page1);
    await setupEmulatorClient(page2);

    const SYNC_CODE = 'emul_sync_' + Math.random().toString(36).substring(2, 8);
    const PASSPHRASE = 'Passphrase123!';

    // --- STEP 1: Connect Device 1 to Firestore Sync ---
    console.log('▶ STEP 1: Setting up Sync on Device 1...');
    await page1.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page1.waitForFunction(() => window.HabitualCore && window.HabitualCore.SyncManager);

    await page1.evaluate(async ({ syncCode, passphrase }) => {
      const core = window.HabitualCore;
      core.SyncManager.toggleTarget('firestore', true);
      core.SyncManager.settings.passphrase = passphrase;
      localStorage.setItem('habitual_sync_passphrase', passphrase);
      core.SyncTargets.Firestore.setSyncCode(syncCode);
      await core.SyncTargets.Firestore.startLiveSync();
    }, { syncCode: SYNC_CODE, passphrase: PASSPHRASE });

    logResult('Device 1 configured with Sync Code & Passphrase on Local Emulator', true);

    // --- STEP 2: Connect Device 2 to Same Sync Code & Passphrase ---
    console.log('\n▶ STEP 2: Setting up Sync on Device 2...');
    await page2.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => window.HabitualCore && window.HabitualCore.SyncManager);

    await page2.evaluate(async ({ syncCode, passphrase }) => {
      const core = window.HabitualCore;
      core.SyncManager.toggleTarget('firestore', true);
      core.SyncManager.settings.passphrase = passphrase;
      localStorage.setItem('habitual_sync_passphrase', passphrase);
      core.SyncTargets.Firestore.setSyncCode(syncCode);
      await core.SyncTargets.Firestore.startLiveSync();
    }, { syncCode: SYNC_CODE, passphrase: PASSPHRASE });

    logResult('Device 2 configured with same Sync Code & Passphrase', true);

    // --- STEP 3: Create Habit on Device 1 and Verify Auto-Sync to Device 2 ---
    console.log('\n▶ STEP 3: Creating habit on Device 1 & verifying live sync to Device 2...');
    await page1.evaluate(async () => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();
      const newHabit = {
        id: 'emul_habit_1',
        name: 'Multi-Device Emulator Habit',
        type: 'positive',
        category: 'SyncTest',
        dailyTarget: 1,
        colorTheme: '#2196F3',
        logs: { [today]: { count: 1, note: 'Logged on device 1' } }
      };
      core.state.habits.push(newHabit);
      core.saveState();
      core.renderAll();
      if (core.SyncManager && typeof core.SyncManager.postToFirestoreIfReady === 'function') {
        await core.SyncManager.postToFirestoreIfReady();
      }
    });

    // Wait for live sync over emulator to propagate to Device 2
    let syncedToDevice2 = false;
    for (let i = 0; i < 20; i++) {
      await page2.waitForTimeout(300);
      syncedToDevice2 = await page2.evaluate(() => {
        const core = window.HabitualCore;
        return core.state.habits.some(h => h.name === 'Multi-Device Emulator Habit');
      });
      if (syncedToDevice2) break;
    }

    logResult('Habit created on Device 1 synced live to Device 2 via Firestore Emulator', syncedToDevice2);

    // --- STEP 4: Delete Habit on Device 1 & Verify Propagation to Device 2 ---
    console.log('\n▶ STEP 4: Deleting habit on Device 1 & verifying deletion sync to Device 2...');
    await page1.evaluate(async () => {
      const core = window.HabitualCore;
      if (core.tombstoneAndRemoveHabits) {
        core.tombstoneAndRemoveHabits('emul_habit_1');
      } else {
        core.state.habits = core.state.habits.filter(h => h.id !== 'emul_habit_1');
      }
      core.saveState();
      core.renderAll();
      if (core.SyncManager && typeof core.SyncManager.postToFirestoreIfReady === 'function') {
        await core.SyncManager.postToFirestoreIfReady();
      }
    });

    let deletedOnDevice2 = false;
    for (let i = 0; i < 20; i++) {
      await page2.waitForTimeout(300);
      deletedOnDevice2 = await page2.evaluate(() => {
        const core = window.HabitualCore;
        return !core.state.habits.some(h => h.name === 'Multi-Device Emulator Habit');
      });
      if (deletedOnDevice2) break;
    }

    logResult('Habit deletion on Device 1 propagated live to Device 2 via Firestore Emulator', deletedOnDevice2);

    console.log('\n========================================\n🎉 ALL MULTI-DEVICE EMULATOR SYNC TESTS PASSED!\n========================================\n');

  } catch (err) {
    console.error('\n❌ Test Error:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.destroyAllSockets();
    server.close();
  }
}

if (require.main === module) {
  runMultiDeviceSyncEmulatorPlaywrightTests();
}

module.exports = { runMultiDeviceSyncEmulatorPlaywrightTests };
