/**
 * Playwright E2E Test Suite for 3-Device Encrypted Chat (FIREBASE EMULATOR BACKED)
 *
 * Verifies:
 * 1. Device A creates a shared habit and enables chat.
 * 2. Device A creates an invite token via `createInviteToken` Cloud Function.
 * 3. Device B redeems the token via `redeemInviteToken` Cloud Function.
 * 4. Device C (uninvited) tries to write a chat message & gets rejected with PERMISSION_DENIED.
 * 5. Device A and Device B exchange signed E2EE chat messages via `verifyAndWriteChatMessage` Cloud Function.
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
    '.svg': 'image/svg+xml'
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
  console.log(`${status} ${testName} ${details}`);
  if (!isSuccess) throw new Error(`Test failed: ${testName} ${details}`);
}

async function run3DeviceEncryptedChatEmulatorPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for 3-Device Encrypted Chat (FIREBASE EMULATOR BACKED)...\n');

  const server = await createStaticServer();
  let browser = null;

  try {
    browser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextC = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();

    await setupEmulatorClient(pageA);
    await setupEmulatorClient(pageB);
    await setupEmulatorClient(pageC);

    const HABIT_ID = 'chat_emul_habit_' + Date.now();
    const PASSWORD = 'ChatPassword123!';

    // --- STEP 1: Device A creates shared habit ---
    console.log('▶ STEP 1: Device A creates shared habit and enables chat...');
    await pageA.goto(`http://127.0.0.1:${PORT}/index.html?emulator=true`, { waitUntil: 'domcontentloaded' });
    await pageA.waitForFunction(() => window.HabitualCore && window.HabitualCore.state);

    await pageA.evaluate(async ({ habitId, password }) => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();

      while (!core.CryptoKeys) {
        if (core.loadScript) try { await core.loadScript('js/crypto-keys.js'); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }

      const habit = {
        id: habitId,
        name: '3-Device Encrypted Workout',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#00bcd4',
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

      // Get or create ECDSA key pair
      const keys = await core.CryptoKeys.getOrCreateUserKeyPair();
      await core.SyncTargets.Firestore.uploadPerHabitBackup(habit);
    }, { habitId: HABIT_ID, password: PASSWORD });

    logResult('Device A created shared habit with encrypted chat enabled', true);

    // --- STEP 2: Device A generates invite token ---
    console.log('\n▶ STEP 2: Device A creates invite token for Device B...');
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

    logResult('Device A created one-time invite token on Functions Emulator', !!(tokenInfo && tokenInfo.token));

    // --- STEP 3: Device B redeems invite token ---
    console.log('\n▶ STEP 3: Device B redeems invite token...');
    await pageB.goto(`http://127.0.0.1:${PORT}/index.html?emulator=true`, { waitUntil: 'domcontentloaded' });
    await pageB.waitForFunction(() => window.HabitualCore && window.HabitualCore.state);

    const redeemResult = await pageB.evaluate(async ({ docId, token, password }) => {
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

      // Download shared habit into Device B
      const downloaded = await core.SyncTargets.Firestore.downloadPerHabitBackup(docId, password);
      if (downloaded) {
        downloaded.sharing = downloaded.sharing || {};
        downloaded.sharing.enableChat = true;
        core.state.habits = [downloaded];
        core.saveState();
      }

      return json.result;
    }, { docId: HABIT_ID, token: tokenInfo.token, password: PASSWORD });

    logResult('Device B redeemed invite token & authorized editor public key', !!(redeemResult && redeemResult.success));

    // --- STEP 4: Device C (uninvited) tries to send chat message & gets rejected ---
    console.log('\n▶ STEP 4: Device C (uninvited stranger) attempts to post chat message...');
    await pageC.goto(`http://127.0.0.1:${PORT}/index.html?emulator=true`, { waitUntil: 'domcontentloaded' });
    await pageC.waitForFunction(() => window.HabitualCore && window.HabitualCore.state);

    const unauthRejected = await pageC.evaluate(async ({ docId }) => {
      const core = window.HabitualCore;
      while (!core.CryptoKeys) {
        if (core.loadScript) try { await core.loadScript('js/crypto-keys.js'); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }
      const keys = await core.CryptoKeys.getOrCreateUserKeyPair();
      const msgId = 'msg_unauth_' + Date.now();
      const cipher = 'encrypted_bogus_text';
      const payloadString = `${docId}:${msgId}:${cipher}`;
      const sig = await core.CryptoKeys.signPayload(keys.privateKey, payloadString);

      const res = await fetch(`http://127.0.0.1:5001/habitual-log/us-central1/verifyAndWriteChatMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            docId: docId,
            msgId: msgId,
            ciphertext: cipher,
            writerPublicKey: keys.publicKeyBase64,
            signature: sig
          }
        })
      });
      const json = await res.json();
      return json.error && json.error.status === 'PERMISSION_DENIED';
    }, { docId: HABIT_ID });

    logResult('Uninvited stranger (Device C) chat message rejected with PERMISSION_DENIED', unauthRejected);

    // --- STEP 5: Device A and Device B exchange E2EE messages ---
    console.log('\n▶ STEP 5: Device A and Device B exchange signed E2EE chat messages...');

    const msgASent = await pageA.evaluate(async ({ docId, password }) => {
      const core = window.HabitualCore;
      while (!core.CryptoKeys) {
        if (core.loadScript) try { await core.loadScript('js/crypto-keys.js'); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }
      const keys = await core.CryptoKeys.getOrCreateUserKeyPair();
      const msgId = 'msg_A_' + Date.now();
      const encrypted = await core.CryptoKeys.encryptChatMessage({ text: 'Hello from Device A!', senderName: 'Alice' }, password);
      const payloadString = `${docId}:${msgId}:${encrypted}`;
      const sig = await core.CryptoKeys.signPayload(keys.privateKey, payloadString);

      const res = await fetch(`http://127.0.0.1:5001/habitual-log/us-central1/verifyAndWriteChatMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            docId: docId,
            msgId: msgId,
            ciphertext: encrypted,
            writerPublicKey: keys.publicKeyBase64,
            signature: sig
          }
        })
      });
      const json = await res.json();
      return json.result && json.result.success;
    }, { docId: HABIT_ID, password: PASSWORD });

    logResult('Device A posted signed chat message via Functions Emulator', msgASent);

    const msgBSent = await pageB.evaluate(async ({ docId, password }) => {
      const core = window.HabitualCore;
      while (!core.CryptoKeys) {
        if (core.loadScript) try { await core.loadScript('js/crypto-keys.js'); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }
      const keys = await core.CryptoKeys.getOrCreateUserKeyPair();
      const msgId = 'msg_B_' + Date.now();
      const encrypted = await core.CryptoKeys.encryptChatMessage({ text: 'Hi Alice, Device B received your workout invite!', senderName: 'Bob' }, password);
      const payloadString = `${docId}:${msgId}:${encrypted}`;
      const sig = await core.CryptoKeys.signPayload(keys.privateKey, payloadString);

      const res = await fetch(`http://127.0.0.1:5001/habitual-log/us-central1/verifyAndWriteChatMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            docId: docId,
            msgId: msgId,
            ciphertext: encrypted,
            writerPublicKey: keys.publicKeyBase64,
            signature: sig
          }
        })
      });
      const json = await res.json();
      return json.result && json.result.success;
    }, { docId: HABIT_ID, password: PASSWORD });

    logResult('Device B posted signed chat message via Functions Emulator', msgBSent);

    console.log('\n========================================');
    console.log('🎉 ALL 3-DEVICE CHAT EMULATOR TESTS PASSED!');
    console.log('========================================\n');

  } catch (err) {
    console.error('\n❌ Test Error:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.destroyAllSockets();
    server.close();
  }
}

run3DeviceEncryptedChatEmulatorPlaywrightTests();
