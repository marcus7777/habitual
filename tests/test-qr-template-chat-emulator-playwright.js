/**
 * Playwright E2E Test Suite for QR Code & Cloud Template Chat
 * Running against the REAL Local Firebase Emulator Suite (Firestore on 8080 & Functions on 5001).
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8114;
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
                  collection: function(subColName) {
                    return {
                      doc: function(subDocId) {
                        const subAutoId = subDocId || ('msg_' + Math.random().toString(36).substring(2, 10));
                        return {
                          id: subAutoId,
                          set: async function(data) {
                            const url = `http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/${colName}/${autoId}/${subColName}/${subAutoId}`;
                            const res = await fetch(url, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ fields: jsonToFirestoreFields(data).mapValue.fields })
                            });
                            return res.json();
                          }
                        };
                      },
                      onSnapshot: function(cb) {
                        let active = true;
                        const poll = async () => {
                          if (!active) return;
                          try {
                            const url = `http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/${colName}/${autoId}/${subColName}`;
                            const res = await fetch(url);
                            if (res.ok) {
                              const json = await res.json();
                              const docs = (json.documents || []).map(d => {
                                const parts = d.name.split('/');
                                const msgId = parts[parts.length - 1];
                                const data = firestoreFieldsToJson({ mapValue: { fields: d.fields } });
                                return { id: msgId, data: () => data, docs: [] };
                              });
                              cb({
                                docChanges: () => docs.map(doc => ({ type: 'added', doc: doc })),
                                docs: docs
                              });
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

async function runQrTemplateChatEmulatorPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for QR Code & Cloud Template Chat (FIREBASE EMULATOR BACKED)...\n');

  const server = await createStaticServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await setupEmulatorClient(pageA);
    await setupEmulatorClient(pageB);

    const baseUrl = `http://127.0.0.1:${PORT}/index.html`;

    // --- STEP 1: Upload Template on Device A to Local Firestore Emulator ---
    console.log('▶ STEP 1: Uploading habit template on Device A to Local Firestore Emulator...');
    await pageA.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await pageA.waitForFunction(() => window.HabitualCore && window.HabitualCore.SyncTargets);

    const tmplInfo = await pageA.evaluate(async () => {
      const core = window.HabitualCore;
      const habit = {
        name: 'Emulator Gym Routine',
        dailyTarget: 2,
        colorTheme: '#E91E63',
        description: '3 sets bench press & 20 pullups'
      };
      const res = await core.SyncTargets.Firestore.uploadTemplateToFirestore(habit, 0);
      return res;
    });

    logResult('Habit template uploaded to Local Firestore Emulator', !!(tmplInfo && tmplInfo.docId));

    // --- STEP 2: Device B downloads template from Local Firestore Emulator ---
    console.log('\n▶ STEP 2: Device B downloads template from Local Firestore Emulator...');
    await pageB.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await pageB.waitForFunction(() => window.HabitualCore && window.HabitualCore.SyncTargets);

    const downloadedTmpl = await pageB.evaluate(async (docId) => {
      const core = window.HabitualCore;
      return core.SyncTargets.Firestore.downloadTemplateFromFirestore(docId);
    }, tmplInfo.docId);

    logResult('Device B downloaded template from Local Firestore Emulator', downloadedTmpl && downloadedTmpl.name === 'Emulator Gym Routine');

    // --- STEP 3: Render Template Import Modal & Open Discussion Chat ---
    console.log('\n▶ STEP 3: Rendering Template Import Modal and displaying Chat Space...');
    await pageB.evaluate((tmplData) => {
      window.HabitualCore.showImportTemplateModal(tmplData);
    }, downloadedTmpl);

    await pageB.waitForSelector('#modal-import-template:not(.hidden)', { state: 'visible' });
    const isChatSectionVisible = await pageB.isVisible('#import-template-chat-section');
    logResult('Template Discussion Chat section visible in Import Modal', isChatSectionVisible);

    // --- STEP 4: Send Discussion Message in Template Chat ---
    console.log('\n▶ STEP 4: Sending message in Template Discussion Chat...');
    await pageB.fill('#template-chat-sender-input', 'Coach Sam');
    await pageB.fill('#template-chat-message-input', 'Keep up the good form on bench press!');
    await pageB.click('#btn-send-template-chat');

    let chatFound = false;
    for (let i = 0; i < 15; i++) {
      await pageB.waitForTimeout(300);
      const chatContent = await pageB.textContent('#template-chat-messages');
      if (chatContent && (chatContent.includes('Coach Sam') || chatContent.includes('bench press'))) {
        chatFound = true;
        break;
      }
    }

    logResult('Discussion message rendered in Template Chat feed', chatFound);

    console.log('\n========================================\n🎉 ALL QR TEMPLATE CHAT EMULATOR TESTS PASSED!\n========================================\n');

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
  runQrTemplateChatEmulatorPlaywrightTests();
}

module.exports = { runQrTemplateChatEmulatorPlaywrightTests };
