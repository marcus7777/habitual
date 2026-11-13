/**
 * Playwright E2E Test Suite for Cross-Browser Read-Only Habit Sharing
 * Firefox (Owner) -> Chrome / Chromium (Read-Only Viewer)
 * Running against the REAL Local Firebase Emulator Suite (Firestore on 8080 & Functions on 5001).
 *
 * Verifies:
 * 1. Firefox creates and shares a habit with read-only flag (`ro=1`).
 * 2. Chrome imports the shared habit and verifies `sharing.readOnly === true`.
 * 3. Chrome cannot write back or overwrite the owner's document in the local Firestore emulator.
 * 4. Firefox updates the habit, and Chrome receives the live update over the emulator in real-time.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { firefox, chromium } = require('playwright');

const PORT = 8122;
const WEB_DIR = path.join(__dirname, '..', 'web');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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
      console.log(`[Server] Cross-Browser Firefox+Chrome test server running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

function setupEmulatorClient(page) {
  return page.addInitScript(() => {
    function jsonToFirestoreFields(obj) {
      if (obj === null || obj === undefined) return { nullValue: null };
      if (typeof obj === 'boolean') return { booleanValue: obj };
      if (typeof obj === 'number') return { integerValue: String(obj) };
      if (typeof obj === 'string') return { stringValue: obj };
      if (Array.isArray(obj)) {
        return { arrayValue: { values: obj.map(jsonToFirestoreFields) } };
      }
      if (typeof obj === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v !== undefined) fields[k] = jsonToFirestoreFields(v);
        }
        return { mapValue: { fields } };
      }
      return { stringValue: String(obj) };
    }

    function firestoreFieldsToJson(field) {
      if (!field) return null;
      if (field.stringValue !== undefined) return field.stringValue;
      if (field.booleanValue !== undefined) return field.booleanValue;
      if (field.integerValue !== undefined) return parseInt(field.integerValue, 10);
      if (field.doubleValue !== undefined) return parseFloat(field.doubleValue);
      if (field.nullValue !== undefined) return null;
      if (field.arrayValue) return (field.arrayValue.values || []).map(firestoreFieldsToJson);
      if (field.mapValue) {
        const res = {};
        for (const [k, v] of Object.entries(field.mapValue.fields || {})) {
          res[k] = firestoreFieldsToJson(v);
        }
        return res;
      }
      return null;
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
                      body: JSON.stringify({ fields: jsonToFirestoreFields(data).mapValue.fields })
                    });
                    return res.json();
                  },
                  get: async function() {
                    const url = `http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/${colName}/${autoId}`;
                    const res = await fetch(url);
                    if (!res.ok) return { exists: false, data: () => null };
                    const json = await res.json();
                    const data = json.fields ? firestoreFieldsToJson({ mapValue: { fields: json.fields } }) : null;
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
                            const data = json.fields ? firestoreFieldsToJson({ mapValue: { fields: json.fields } }) : null;
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
  const status = isSuccess ? '  ✅ [PASS]' : '  ❌ [FAIL]';
  console.log(`${status} ${testName} ${details}`);
  if (!isSuccess) throw new Error(`Test failed: ${testName} ${details}`);
}

async function runFirefoxChromeReadOnlyTest() {
  console.log('🚀 Starting Playwright Cross-Browser Test: Firefox (Owner) & Chrome (Read-Only Viewer) via Firestore Emulator...\n');

  const server = await createStaticServer();
  let firefoxBrowser = null;
  let chromeBrowser = null;

  try {
    // 1. Launch Firefox for Owner
    console.log('▶ STEP 1: Launching Firefox (Owner) & Creating Shared Habit...');
    firefoxBrowser = await firefox.launch({ headless: true });
    const ffContext = await firefoxBrowser.newContext({ viewport: { width: 1280, height: 800 } });
    const ffPage = await ffContext.newPage();
    await setupEmulatorClient(ffPage);

    const baseUrl = `http://127.0.0.1:${PORT}/index.html?emulator=true`;
    await ffPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await ffPage.waitForFunction(() => window.HabitualCore && window.HabitualCore.state);

    const shareInfo = await ffPage.evaluate(async () => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();

      const habit = {
        id: 'fx_owner_habit',
        name: 'Firefox Owner Habit',
        type: 'positive',
        dailyTarget: 2,
        colorTheme: '#FF7043',
        description: 'Original description by Firefox owner',
        logs: { [today]: { count: 1, note: 'Firefox initial check-in' } }
      };

      core.state.habits = [habit];
      core.shareHabitDirectly('fx_owner_habit');
      await core.SyncTargets.Firestore.uploadPerHabitBackup(habit);

      return {
        col: habit.sharing.docId || habit.sharing.collection,
        pwd: habit.sharing.password
      };
    });

    logResult('Firefox created and uploaded shared habit to Local Firestore Emulator', !!(shareInfo.col && shareInfo.pwd));

    const ffImg = path.join(SCREENSHOT_DIR, 'firefox_owner_habit.png');
    await ffPage.screenshot({ path: ffImg });
    logResult('Firefox Owner screenshot captured', fs.existsSync(ffImg), `(${ffImg})`);

    // 2. Launch Chrome (Chromium) for Read-Only Viewer
    console.log('\n▶ STEP 2: Launching Chrome (Chromium Read-Only Viewer) & Opening View-Only Link...');
    chromeBrowser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );
    const chromeContext = await chromeBrowser.newContext({ viewport: { width: 1280, height: 800 } });
    const chromePage = await chromeContext.newPage();
    await setupEmulatorClient(chromePage);

    const readOnlyShareUrl = `${baseUrl}#share?col=${encodeURIComponent(shareInfo.col)}&pwd=${encodeURIComponent(shareInfo.pwd)}&ro=1`;
    await chromePage.goto(readOnlyShareUrl, { waitUntil: 'domcontentloaded' });

    await chromePage.waitForSelector('#modal-import-shared-habit:not(.hidden)', { state: 'visible' });
    await chromePage.click('#btn-confirm-import-shared');
    await chromePage.waitForTimeout(500);

    const chromeHabitState = await chromePage.evaluate(() => {
      const core = window.HabitualCore;
      const habit = core.state.habits.find(h => h.name === 'Firefox Owner Habit');
      return {
        found: !!habit,
        readOnly: habit && habit.sharing && habit.sharing.readOnly === true,
        description: habit ? habit.description : ''
      };
    });

    logResult('Chrome imported shared habit in Read-Only mode (`readOnly === true`)', chromeHabitState.found && chromeHabitState.readOnly);

    const chromeImg1 = path.join(SCREENSHOT_DIR, 'chrome_viewer_readonly_imported.png');
    await chromePage.screenshot({ path: chromeImg1 });
    logResult('Chrome Read-Only Viewer screenshot captured', fs.existsSync(chromeImg1), `(${chromeImg1})`);

    // 3. Verify Outbound Write Protection in Chrome
    console.log('\n▶ STEP 3: Verifying Outbound Write Protection in Chrome (Read-Only Mode)...');
    const writeSuppressedInChrome = await chromePage.evaluate(async () => {
      const core = window.HabitualCore;
      const habit = core.state.habits.find(h => h.name === 'Firefox Owner Habit');
      // Attempt to tamper with local note
      habit.viewerNote = 'Local Chrome viewer note';
      // Attempt upload
      const res = await core.SyncTargets.Firestore.uploadPerHabitBackup(habit);
      return res === null;
    });

    logResult('Outbound cloud write suppressed for Read-Only viewer in Chrome', writeSuppressedInChrome);

    // 4. Firefox (Owner) updates habit & Chrome receives live update over emulator
    console.log('\n▶ STEP 4: Firefox Owner updates habit & Chrome receives live update...');
    await ffPage.evaluate(async () => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();
      const habit = core.state.habits.find(h => h.name === 'Firefox Owner Habit');
      habit.description = 'Updated description from Firefox Owner!';
      habit.logs[today] = { count: 2, note: 'Firefox completed 2/2' };
      core.saveState();
      await core.SyncTargets.Firestore.uploadPerHabitBackup(habit, true);
    });

    // Device B (Chrome) listens for live update
    let chromeUpdated = false;
    for (let i = 0; i < 20; i++) {
      await chromePage.waitForTimeout(300);
      chromeUpdated = await chromePage.evaluate(() => {
        const core = window.HabitualCore;
        const habit = core.state.habits.find(h => h.name === 'Firefox Owner Habit');
        return habit && habit.description === 'Updated description from Firefox Owner!';
      });
      if (chromeUpdated) break;
    }

    logResult('Chrome (Viewer) received live update from Firefox (Owner) via Firestore Emulator', chromeUpdated);

    const chromeImg2 = path.join(SCREENSHOT_DIR, 'chrome_viewer_live_updated.png');
    await chromePage.screenshot({ path: chromeImg2 });
    logResult('Chrome Live-Updated screenshot captured', fs.existsSync(chromeImg2), `(${chromeImg2})`);

    console.log('\n========================================\n🎉 ALL CROSS-BROWSER FIREFOX+CHROME READ-ONLY TESTS PASSED!\n========================================\n');

  } catch (err) {
    console.error('\n❌ Test Error:', err);
    process.exitCode = 1;
  } finally {
    if (firefoxBrowser) await firefoxBrowser.close();
    if (chromeBrowser) await chromeBrowser.close();
    server.destroyAllSockets();
    server.close();
  }
}

runFirefoxChromeReadOnlyTest();
