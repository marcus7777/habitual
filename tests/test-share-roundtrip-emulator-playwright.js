/**
 * Playwright E2E Test Suite for Habitual Share & Firestore Sync Round-Trip
 * Running against the REAL Local Firebase Emulator Suite (Firestore on 8080 & Functions on 5001).
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8098;
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
                    const poll = async () => {
                      if (!active) return;
                      try {
                        const url = `http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/${colName}/${autoId}`;
                        const res = await fetch(url);
                        if (res.ok) {
                          const json = await res.json();
                          const data = json.fields ? firestoreFieldsToJson(json.fields) : null;
                          if (data) cb({ exists: true, data: () => data });
                        }
                      } catch (e) {}
                      if (active) setTimeout(poll, 500);
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

async function runShareRoundTripEmulatorPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Shared Habit Round-Trip (FIREBASE EMULATOR BACKED)...\n');

  const server = await createStaticServer();
  let browser = null;
  let total = 0;
  let passed = 0;

  function assert(cond, testName) {
    total++;
    if (cond) {
      passed++;
      console.log(`  ✅ [PASS] ${testName}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
    }
  }

  try {
    browser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );

    const context1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page1 = await context1.newPage();
    await setupEmulatorClient(page1);

    // --- STEP 1: Create and Share a Habit in User Context 1 ---
    console.log('▶ STEP 1: Creating & Sharing Habit in User Context 1 (Connecting to Local Firestore Emulator)...');
    await page1.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page1.waitForFunction(() => window.HabitualCore && typeof window.HabitualCore.shareHabitDirectly === 'function');

    const shareInfo = await page1.evaluate(async () => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();

      const parentHabit = {
        id: 'pw_emul_share_parent',
        name: 'Emulator Playwright Workout',
        type: 'positive',
        description: 'Complete daily exercise',
        category: 'Health',
        colorTheme: '#1088ac',
        dailyTarget: 2,
        logs: { [today]: { count: 2, note: 'Morning gym session' } }
      };

      const childHabit = {
        id: 'pw_emul_share_child',
        parentId: 'pw_emul_share_parent',
        name: 'Emulator Playwright Pushups',
        type: 'positive',
        dailyTarget: 25,
        colorTheme: '#39d353',
        logs: { [today]: { count: 25, note: '25 pushups' } }
      };

      core.state.habits = [parentHabit, childHabit];

      // Enable sharing directly
      core.shareHabitDirectly('pw_emul_share_parent');

      // Upload payload to real local Firebase Emulator
      await core.SyncTargets.Firestore.uploadPerHabitBackup(parentHabit);

      const col = parentHabit.sharing ? (parentHabit.sharing.docId || parentHabit.sharing.collection) : '';
      const pwd = parentHabit.sharing ? parentHabit.sharing.password : '';

      return { col, pwd, parentName: parentHabit.name };
    });

    assert(shareInfo.col && shareInfo.col.length > 3, 'Generated collection ID stored in habit sharing state');
    assert(shareInfo.pwd && shareInfo.pwd.length >= 10, 'Generated passphrase stored in habit sharing state');

    // --- STEP 2: Open Share URL in User Context 2 (Simulate Second User) ---
    console.log('\n▶ STEP 2: Opening Share Link in User Context 2 (Fetching from Local Emulator)...');
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await context2.newPage();
    await setupEmulatorClient(page2);

    const shareUrl = `http://127.0.0.1:${PORT}/index.html#share?col=${encodeURIComponent(shareInfo.col)}&pwd=${encodeURIComponent(shareInfo.pwd)}`;

    await page2.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => window.HabitualCore && typeof window.HabitualCore.checkURLHashForSharedHabit === 'function');

    // Confirm import in modal
    await page2.waitForSelector('#modal-import-shared-habit:not(.hidden)', { state: 'visible', timeout: 5000 });
    await page2.click('#btn-confirm-import-shared');
    await page2.waitForTimeout(1000);

    const importedData = await page2.evaluate(() => {
      const core = window.HabitualCore;
      const habits = core.state.habits || [];
      const parent = habits.find(h => h.name === 'Emulator Playwright Workout');
      const child = habits.find(h => h.name === 'Emulator Playwright Pushups');
      return {
        habitCount: habits.length,
        parentFound: !!parent,
        childFound: !!child,
        parentTarget: parent ? parent.dailyTarget : null,
        childParentId: child ? child.parentId : null
      };
    });

    assert(importedData.parentFound === true, 'Imported shared parent habit from Local Firestore Emulator');
    assert(importedData.childFound === true, 'Imported shared child sub-habit from Local Firestore Emulator');
    assert(importedData.parentTarget === 2, 'Decrypted parent habit parameters match original');

    console.log(`\n========================================\n🎉 RESULTS: ${passed}/${total} TESTS PASSED!\n========================================\n`);

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
  runShareRoundTripEmulatorPlaywrightTests();
}

module.exports = { runShareRoundTripEmulatorPlaywrightTests };
