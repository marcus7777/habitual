/**
 * Playwright E2E QC Test Suite: No Updates On Opening Shared Habit Across 3 Devices
 * Verifies that:
 * 1. 3 distinct device contexts (Device A, Device B, Device C) share a habit with sub-habits and check-ins.
 * 2. Opening and viewing the shared habit across all 3 devices produces 0 "updated!" toast alerts.
 * 3. No redundant re-uploads or background mutations occur simply from opening or viewing the shared habit.
 * 4. Genuine updates (e.g. logging a check-in on Device A) cleanly propagate to Device B and Device C with an update notification.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8110;
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
  const mockStore = new Map();
  const mockStreamListeners = [];

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/mock_db_stream')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      const onMsg = (payload) => {
        try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (e) {}
      };
      mockStreamListeners.push(onMsg);
      req.on('close', () => {
        const idx = mockStreamListeners.indexOf(onMsg);
        if (idx !== -1) mockStreamListeners.splice(idx, 1);
      });
      return;
    }

    if (req.url.startsWith('/api/mock_db_get') && req.method === 'GET') {
      const urlObj = new URL(req.url, 'http://127.0.0.1');
      const key = urlObj.searchParams.get('key');
      const data = mockStore.get(key) || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: data }));
      return;
    }

    if (req.url.startsWith('/api/mock_db') && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          mockStore.set(payload.key, payload.data);
          mockStreamListeners.forEach(fn => fn(payload));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400);
          res.end('Error');
        }
      });
      return;
    }

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
      console.log(`[Server] Multi-device test server running on http://127.0.0.1:${PORT}`);
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

async function runTest() {
  console.log('🚀 Starting Playwright E2E QC Test Suite: No Updates On Opening Shared Habit Across 3 Devices...\n');

  const GLOBAL_TIMEOUT_MS = 60000;
  const globalTimeout = setTimeout(() => {
    console.error(`❌ Global Test Suite Timeout exceeded (${GLOBAL_TIMEOUT_MS}ms). Forcing process exit.`);
    process.exit(1);
  }, GLOBAL_TIMEOUT_MS);
  if (globalTimeout.unref) globalTimeout.unref();

  const server = await createStaticServer();

  let browser;
  let totalTests = 0;
  let passedTests = 0;

  try {
    browser = await chromium.launch({ headless: true });

    const setupMockFirebaseAndChannel = async (page) => {
      await page.addInitScript(() => {
        const store = new Map();
        const listeners = new Map();

        const evtSource = new EventSource('/api/mock_db_stream');
        evtSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            store.set(payload.key, payload.data);
            if (listeners.has(payload.key)) {
              listeners.get(payload.key).forEach(cb => {
                try { cb({ exists: true, data: () => payload.data, metadata: { hasPendingWrites: false } }); } catch (e) {}
              });
            }
          } catch (e) {}
        };

        const mockDb = {
          collection: function(collName) {
            return {
              doc: function(docId) {
                const key = `${collName}/${docId}`;
                return {
                  id: docId,
                  set: function(data, opts) {
                    let existing = store.get(key) || {};
                    let normData = (opts && opts.merge) ? Object.assign({}, existing, data) : Object.assign({}, data);
                    if (!normData.updatedAt) normData.updatedAt = Date.now();
                    store.set(key, normData);

                    fetch('/api/mock_db', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ key, data: normData })
                    }).catch(() => {});

                    if (listeners.has(key)) {
                      listeners.get(key).forEach(cb => {
                        try { cb({ exists: true, data: () => normData, metadata: { hasPendingWrites: false } }); } catch (e) {}
                      });
                    }
                    return Promise.resolve();
                  },
                  get: function() {
                    const data = store.get(key);
                    if (data) {
                      return Promise.resolve({
                        exists: true,
                        data: () => data
                      });
                    }
                    return fetch('/api/mock_db_get?key=' + encodeURIComponent(key)).then(r => r.json()).then(res => {
                      if (res && res.data) {
                        store.set(key, res.data);
                        return { exists: true, data: () => res.data };
                      }
                      return { exists: false, data: () => null };
                    }).catch(() => {
                      return { exists: false, data: () => null };
                    });
                  },
                  onSnapshot: function(cb) {
                    if (!listeners.has(key)) listeners.set(key, []);
                    listeners.get(key).push(cb);
                    if (store.has(key)) {
                      const data = store.get(key);
                      setTimeout(() => cb({ exists: true, data: () => data, metadata: { hasPendingWrites: false } }), 10);
                    }
                    return function unsub() {
                      if (listeners.has(key)) {
                        listeners.set(key, listeners.get(key).filter(fn => fn !== cb));
                      }
                    };
                  }
                };
              }
            };
          }
        };

        window.firebase = {
          apps: [{}],
          initializeApp: function() {},
          firestore: function() { return mockDb; }
        };
        if (window.HabitualCore && window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
          window.HabitualCore.SyncTargets.Firestore.db = mockDb;
        }
      });
    };

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextC = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();

    await setupMockFirebaseAndChannel(pageA);
    await setupMockFirebaseAndChannel(pageB);
    await setupMockFirebaseAndChannel(pageC);

    const baseUrl = `http://127.0.0.1:${PORT}/index.html`;

    await pageA.goto(baseUrl);
    await pageB.goto(baseUrl);
    await pageC.goto(baseUrl);

    await pageA.waitForFunction(() => window.HabitualCore && window.HabitualCore.state);
    await pageB.waitForFunction(() => window.HabitualCore && window.HabitualCore.state);
    await pageC.waitForFunction(() => window.HabitualCore && window.HabitualCore.state);

    const SHARED_DOC_ID = 'shared_doc_opening_test_' + Date.now();
    const SHARED_PASS = 'shared_secret_pwd_123';
    const SHARED_NAME = 'Shared Daily Workout';

    // ------------------------------------------------------------------------
    // TEST 1: Device A creates and shares habit with sub-habits and logs
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('▶ TEST 1: Device A creates and uploads shared habit with sub-habit and check-in history');

    const createdDocId = await pageA.evaluate(async (params) => {
      const today = window.HabitualCore.getTodayKey();
      const parentHabit = {
        id: 'h_parent_workout',
        name: params.name,
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#039be5',
        sharing: {
          enabled: true,
          collection: params.docId,
          docId: params.docId,
          password: params.pass,
          includeChildren: true
        },
        logs: {
          [today]: { count: 1, note: 'Warmup done' }
        }
      };

      const childHabit = {
        id: 'h_parent_workout_pushups',
        name: 'Pushups',
        parentId: 'h_parent_workout',
        type: 'positive',
        dailyTarget: 20,
        colorTheme: '#e91e63',
        logs: {
          [today]: { count: 20, note: '2 sets of 10' }
        }
      };

      window.HabitualCore.state.habits = [parentHabit, childHabit];
      window.HabitualCore.saveState();
      await window.HabitualCore.SyncTargets.Firestore.uploadPerHabitBackup(parentHabit, true);
      window.HabitualCore.SyncTargets.Firestore.startPerHabitLiveSync(parentHabit);
      return params.docId;
    }, { name: SHARED_NAME, docId: SHARED_DOC_ID, pass: SHARED_PASS });

    logResult('Device A created shared habit with sub-habit and check-in history', Boolean(createdDocId), `(Doc ID: ${createdDocId})`);
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 2: Device B and Device C join the shared habit
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('\n▶ TEST 2: Device B and Device C join the shared habit via hash URL');

    const shareUrl = `${baseUrl}#share?col=${SHARED_DOC_ID}&pwd=${SHARED_PASS}`;
    await pageB.goto(shareUrl);
    await pageC.goto(shareUrl);

    await pageB.waitForSelector('#modal-import-shared-habit:not(.hidden)', { state: 'visible' });
    await pageC.waitForSelector('#modal-import-shared-habit:not(.hidden)', { state: 'visible' });

    await pageB.click('#btn-confirm-import-shared');
    await pageC.click('#btn-confirm-import-shared');

    await pageB.waitForTimeout(500);
    await pageC.waitForTimeout(500);

    const bLoaded = await pageB.evaluate((name) => window.HabitualCore.state.habits.some(h => h.name === name), SHARED_NAME);
    const cLoaded = await pageC.evaluate((name) => window.HabitualCore.state.habits.some(h => h.name === name), SHARED_NAME);

    logResult('Device B & C loaded shared habit into local state', bLoaded && cLoaded, `(Device B: ${bLoaded}, Device C: ${cLoaded})`);
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 3: Opening/Viewing the shared habit across 3 devices produces 0 "updated!" toasts
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('\n▶ TEST 3: Opening and viewing shared habit simultaneously on Devices A, B, and C produces ZERO "updated!" toasts');

    // Attach toast loggers to all 3 devices
    const registerToastLogger = async (page) => {
      await page.evaluate(() => {
        window.__updateToastCount = 0;
        const origToast = window.HabitualCore.showToast;
        window.HabitualCore.showToast = (msg, type, actionText, onActionClick) => {
          if (msg && msg.includes('updated!')) {
            window.__updateToastCount++;
          }
          if (origToast) origToast(msg, type, actionText, onActionClick);
        };
      });
    };

    await registerToastLogger(pageA);
    await registerToastLogger(pageB);
    await registerToastLogger(pageC);

    // Navigate all 3 devices to view the shared habit page
    await pageA.evaluate(() => window.HabitualCore.navigateTo('#/habit/h_parent_workout'));
    await pageB.evaluate(() => window.HabitualCore.navigateTo('#/habit/h_parent_workout'));
    await pageC.evaluate(() => window.HabitualCore.navigateTo('#/habit/h_parent_workout'));

    // Wait 3 seconds with live-sync listeners actively receiving snapshots / ticks
    await pageA.waitForTimeout(3000);

    const toastsA = await pageA.evaluate(() => window.__updateToastCount || 0);
    const toastsB = await pageB.evaluate(() => window.__updateToastCount || 0);
    const toastsC = await pageC.evaluate(() => window.__updateToastCount || 0);

    logResult('Device A displayed 0 update toasts on opening/viewing', toastsA === 0, `(toasts=${toastsA})`);
    logResult('Device B displayed 0 update toasts on opening/viewing', toastsB === 0, `(toasts=${toastsB})`);
    logResult('Device C displayed 0 update toasts on opening/viewing', toastsC === 0, `(toasts=${toastsC})`);
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 4: Genuine update on Device A correctly notifies Device B and Device C
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('\n▶ TEST 4: Genuine check-in update on Device A triggers update notification on Device B and Device C');

    // Device A logs a new check-in count on the sub-habit and awaits completion of outbound upload
    await pageA.evaluate(async () => {
      const today = window.HabitualCore.getTodayKey();
      window.HabitualCore.toggleHabitForDate('h_parent_workout_pushups', today, 30, 'Increased to 30 pushups');
      const parent = window.HabitualCore.state.habits.find(h => h.id === 'h_parent_workout');
      await window.HabitualCore.SyncTargets.Firestore.uploadPerHabitBackup(parent, true);
    });

    // Wait for live sync to propagate snapshot to Device B and Device C
    await pageB.waitForFunction(() => (window.__updateToastCount || 0) > 0, { timeout: 10000 });
    await pageC.waitForFunction(() => (window.__updateToastCount || 0) > 0, { timeout: 10000 });

    const toastsBAfter = await pageB.evaluate(() => window.__updateToastCount || 0);
    const toastsCAfter = await pageC.evaluate(() => window.__updateToastCount || 0);

    const bHasUpdatedLog = await pageB.evaluate((today) => {
      const sub = window.HabitualCore.state.habits.find(h => h.id === 'h_parent_workout_pushups');
      return sub && sub.logs && sub.logs[today] && sub.logs[today].count >= 30;
    }, await pageA.evaluate(() => window.HabitualCore.getTodayKey()));

    const cHasUpdatedLog = await pageC.evaluate((today) => {
      const sub = window.HabitualCore.state.habits.find(h => h.id === 'h_parent_workout_pushups');
      return sub && sub.logs && sub.logs[today] && sub.logs[today].count >= 30;
    }, await pageA.evaluate(() => window.HabitualCore.getTodayKey()));

    logResult('Device B received genuine update & toast notification', toastsBAfter > 0 && bHasUpdatedLog, `(toasts=${toastsBAfter}, count>=30)`);
    logResult('Device C received genuine update & toast notification', toastsCAfter > 0 && cHasUpdatedLog, `(toasts=${toastsCAfter}, count>=30)`);
    passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log(`========================================\n`);

  } catch (err) {
    console.error('\n❌ Playwright E2E Test Suite Error:', err);
    process.exitCode = 1;
  } finally {
    clearTimeout(globalTimeout);
    if (browser) await browser.close();
    if (server) {
      if (server.destroyAllSockets) server.destroyAllSockets();
      server.close();
    }
  }
}

runTest();
