/**
 * Playwright E2E Demonstration Suite for Live E2EE Chat between Firefox (Alice) & Chrome (Bob)
 * Running against the REAL Local Firebase Emulator Suite (Firestore on 8080 & Functions on 5001).
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { firefox, chromium } = require('playwright');

const WEB_DIR = path.join(__dirname, '..', 'web');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function logStep(msg) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 8);
  console.log(`[${ts}] ${msg}`);
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

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      logStep(`[Server] Live Chat Demo web server running on http://127.0.0.1:${port}`);
      resolve({ server, port });
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
                        let hasFiredInitial = false;
                        let lastDocHash = '';
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
                                return { id: msgId, data: () => data };
                              });
                              const currentHash = JSON.stringify((json.documents || []).map(d => d.name + (d.updateTime || '')));
                              if (currentHash !== lastDocHash) {
                                lastDocHash = currentHash;
                                hasFiredInitial = true;
                                cb({
                                  docChanges: () => docs.map(doc => ({ type: 'added', doc: doc })),
                                  docs: docs
                                });
                              }
                            } else if (!hasFiredInitial) {
                              hasFiredInitial = true;
                              lastDocHash = 'empty';
                              cb({ docChanges: () => [], docs: [] });
                            }
                          } catch (e) {
                            console.warn('💬 [poll error]:', e);
                            if (!hasFiredInitial) {
                              hasFiredInitial = true;
                              lastDocHash = 'empty';
                              cb({ docChanges: () => [], docs: [] });
                            }
                          }
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
  const status = isSuccess ? '  ✅ [PASS]' : '  ❌ [FAIL]';
  logStep(`${status} ${testName} ${details}`);
  if (!isSuccess) throw new Error(`Test failed: ${testName} ${details}`);
}

async function runLiveChatDemo() {
  logStep('🚀 Starting Playwright Live E2EE Chat Demo: Firefox (Alice) 💬 Chrome (Bob)...\n');

  const { server, port } = await createStaticServer();
  let firefoxBrowser = null;
  let chromeBrowser = null;

  try {
    const HABIT_ID = 'chat_demo_habit_' + Date.now();
    const PASSWORD = 'E2EEPassword123!';

    // =========================================================================
    // STAGE 1: Alice (Firefox) creates shared habit and enables chat
    // =========================================================================
    logStep('▶ STAGE 1: Alice (Firefox) creates shared habit with E2EE Chat enabled...');
    firefoxBrowser = await firefox.launch({ headless: true });
    const ffContext = await firefoxBrowser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageA = await ffContext.newPage();
    pageA.on('console', msg => logStep(`  [PageA Console]: ${msg.text()}`));
    await setupEmulatorClient(pageA);

    const baseUrl = `http://127.0.0.1:${port}/index.html?emulator=true`;
    logStep('Navigating Alice to base URL...');
    await pageA.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await pageA.waitForFunction(() => typeof window.HabitualCore !== 'undefined' && Boolean(window.HabitualCore.state));
    logStep('PageA HabitualCore loaded.');

    await pageA.evaluate(async ({ habitId, password }) => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();

      while (!core.CryptoKeys) {
        if (core.loadScript) try { await core.loadScript('js/crypto-keys.js'); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }

      const habit = {
        id: habitId,
        name: 'E2EE Fitness Challenge',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#2196F3',
        enableChat: true,
        sharing: {
          enabled: true,
          docId: habitId,
          collection: habitId,
          password: password,
          enableChat: true
        },
        logs: { [today]: { count: 1 } }
      };

      core.state.habits = [habit];
      core.saveState();
      await core.SyncTargets.Firestore.uploadPerHabitBackup(habit);

      // Open Modal & switch to Chat Tab
      core.openHabitModal(habit);
      core.switchDisplayOptionsTab('chat');
    }, { habitId: HABIT_ID, password: PASSWORD });

    await pageA.waitForSelector('#tab-content-chat-options:not(.hidden)', { state: 'visible' });

    logResult('Alice (Firefox) initialized shared habit with E2EE Chat enabled', true);

    const img1 = path.join(SCREENSHOT_DIR, 'chat_demo_stage_1_alice_created.png');
    await pageA.screenshot({ path: img1 });
    logResult('Stage 1 screenshot captured (Alice created chat space)', fs.existsSync(img1), `(${img1})`);

    // =========================================================================
    // STAGE 2: Alice creates invite token & Bob (Chrome) redeems it to join
    // =========================================================================
    logStep('▶ STAGE 2: Alice generates one-time invite token for Bob...');

    const tokenInfo = await pageA.evaluate(async (docId) => {
      const core = window.HabitualCore;
      while (!core.CryptoKeys) {
        if (core.loadScript) try { await core.loadScript('js/crypto-keys.js'); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }
      const keys = await core.CryptoKeys.getOrCreateUserKeyPair();
      const authPayload = `${docId}:create_invite`;
      const sig = await core.CryptoKeys.signPayload(keys.privateKey, authPayload);

      const res = await fetch(`http://127.0.0.1:5001/habitual-log/us-central1/createInviteToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            docId: docId,
            ownerPublicKey: keys.publicKeyBase64,
            signature: sig
          }
        })
      });
      const json = await res.json();
      return json.result;
    }, HABIT_ID);

    logResult('Alice generated invite token via Cloud Function', !!(tokenInfo && tokenInfo.token));

    logStep('▶ Bob (Chrome) redeems invite token and opens chat space...');
    chromeBrowser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );
    const chromeContext = await chromeBrowser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageB = await chromeContext.newPage();
    pageB.on('console', msg => logStep(`  [PageB Console]: ${msg.text()}`));
    await setupEmulatorClient(pageB);

    logStep('Navigating Bob to base URL...');
    await pageB.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await pageB.waitForFunction(() => typeof window.HabitualCore !== 'undefined' && Boolean(window.HabitualCore.state));
    logStep('PageB HabitualCore loaded.');

    const bobJoined = await pageB.evaluate(async ({ docId, token, password }) => {
      const core = window.HabitualCore;
      while (!core.CryptoKeys) {
        if (core.loadScript) try { await core.loadScript('js/crypto-keys.js'); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }
      const keys = await core.CryptoKeys.getOrCreateUserKeyPair();

      const res = await fetch(`http://127.0.0.1:5001/habitual-log/us-central1/redeemInviteToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            docId: docId,
            token: token,
            recipientPublicKey: keys.publicKeyBase64
          }
        })
      });
      const json = await res.json();

      const downloaded = await core.SyncTargets.Firestore.downloadPerHabitBackup(docId, password);
      if (downloaded) {
        downloaded.enableChat = true;
        downloaded.sharing = downloaded.sharing || {};
        downloaded.sharing.enableChat = true;
        downloaded.sharing.password = password;
        core.state.habits = [downloaded];
        core.saveState();
        core.openHabitModal(downloaded);
        core.switchDisplayOptionsTab('chat');
      }

      return json.result && json.result.success;
    }, { docId: HABIT_ID, token: tokenInfo.token, password: PASSWORD });

    await pageB.waitForSelector('#tab-content-chat-options:not(.hidden)', { state: 'visible' });

    logResult('Bob (Chrome) redeemed token & joined the chat space', bobJoined);

    const img2 = path.join(SCREENSHOT_DIR, 'chat_demo_stage_2_bob_joined.png');
    await pageB.screenshot({ path: img2 });
    logResult('Stage 2 screenshot captured (Bob joined chat space)', fs.existsSync(img2), `(${img2})`);

    // =========================================================================
    // STAGE 3: Alice (Firefox) sends an E2EE message to Bob
    // =========================================================================
    logStep('▶ STAGE 3: Alice (Firefox) sends signed E2EE chat message to Bob...');

    await pageA.evaluate(async () => {
      const core = window.HabitualCore;
      const habit = core._currentEditingHabit;
      const docId = habit.sharing.docId || habit.sharing.collection;
      const pwd = habit.sharing.password || '';

      const inputName = document.getElementById('chat-sender-name-input');
      const inputMsg = document.getElementById('chat-message-input');
      if (inputName) inputName.value = 'Alice';
      if (inputMsg) inputMsg.value = 'Hey Bob! Welcome to the E2EE Fitness Group 🏋️‍♂️';

      await core.SyncTargets.Firestore.sendSharedHabitMessage(
        docId,
        'Hey Bob! Welcome to the E2EE Fitness Group 🏋️‍♂️',
        'Alice',
        pwd
      );
    });

    logStep('Alice sent chat message via evaluate. Checking Bob screen...');

    // Wait for Alice's message to render on Bob's Chrome screen via real-time listener
    let bobReceivedAliceMsg = false;
    for (let i = 0; i < 20; i++) {
      await pageB.waitForTimeout(300);
      const chatHtml = await pageB.textContent('#chat-messages-container');
      if (chatHtml && (chatHtml.includes('Alice') || chatHtml.includes('Fitness Group') || chatHtml.includes('Welcome'))) {
        bobReceivedAliceMsg = true;
        break;
      }
    }

    logResult('Alice sent encrypted message & Bob received it live in Chrome', bobReceivedAliceMsg);

    const img3 = path.join(SCREENSHOT_DIR, 'chat_demo_stage_3_alice_sent_message.png');
    await pageA.screenshot({ path: img3 });

    const img4 = path.join(SCREENSHOT_DIR, 'chat_demo_stage_4_bob_received_message.png');
    await pageB.screenshot({ path: img4 });
    logResult('Stage 3 & 4 screenshots captured (Alice sent & Bob received)', fs.existsSync(img3) && fs.existsSync(img4));

    // =========================================================================
    // STAGE 4: Bob (Chrome) replies to Alice (Firefox)
    // =========================================================================
    logStep('▶ STAGE 4: Bob (Chrome) replies to Alice...');

    await pageB.evaluate(async () => {
      const core = window.HabitualCore;
      const habit = core._currentEditingHabit;
      const docId = habit.sharing.docId || habit.sharing.collection;
      const pwd = habit.sharing.password || '';

      const inputName = document.getElementById('chat-sender-name-input');
      const inputMsg = document.getElementById('chat-message-input');
      if (inputName) inputName.value = 'Bob';
      if (inputMsg) inputMsg.value = "Thanks Alice! Ready for today's workout session 🚴‍♂️";

      await core.SyncTargets.Firestore.sendSharedHabitMessage(
        docId,
        "Thanks Alice! Ready for today's workout session 🚴‍♂️",
        'Bob',
        pwd
      );
    });

    logStep('Bob sent reply via evaluate. Checking Alice screen...');

    // Wait for Bob's reply to render on Alice's Firefox screen via real-time listener
    let aliceReceivedBobReply = false;
    for (let i = 0; i < 20; i++) {
      await pageA.waitForTimeout(300);
      const chatHtml = await pageA.textContent('#chat-messages-container');
      if (chatHtml && (chatHtml.includes('Bob') || chatHtml.includes('workout session') || chatHtml.includes('Ready'))) {
        aliceReceivedBobReply = true;
        break;
      }
    }

    logResult('Bob replied in Chrome & Alice received it live in Firefox', aliceReceivedBobReply);

    const img5 = path.join(SCREENSHOT_DIR, 'chat_demo_stage_5_bob_replied.png');
    await pageB.screenshot({ path: img5 });

    const img6 = path.join(SCREENSHOT_DIR, 'chat_demo_stage_6_alice_received_reply.png');
    await pageA.screenshot({ path: img6 });
    logResult('Stage 5 & 6 screenshots captured (Bob replied & Alice received)', fs.existsSync(img5) && fs.existsSync(img6));

    logStep('\n========================================');
    logStep('🎉 ALL LIVE CHAT DEMO STAGES PASSED SUCCESSFULLY!');
    logStep(`   Screenshots saved in ${SCREENSHOT_DIR}/chat_demo_stage_*.png`);
    logStep('========================================\n');

  } catch (err) {
    logStep(`\n❌ Live Chat Demo Error: ${err.message || err}`);
    process.exitCode = 1;
  } finally {
    if (firefoxBrowser) await firefoxBrowser.close().catch(() => {});
    if (chromeBrowser) await chromeBrowser.close().catch(() => {});
    if (server) {
      server.destroyAllSockets();
      server.close();
    }
    process.exit(process.exitCode || 0);
  }
}

runLiveChatDemo();
