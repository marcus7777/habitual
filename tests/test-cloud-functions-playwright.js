/**
 * Playwright E2E Test Suite demonstrating Local Firebase Cloud Functions Execution
 * Demonstrates:
 * 1. Invoking `verifyAndWriteShare` Cloud Function via Playwright browser context.
 * 2. Invoking `createInviteToken` Cloud Function via Playwright browser context.
 * 3. Invoking `redeemInviteToken` Cloud Function via Playwright browser context.
 * 4. Invoking `verifyAndWriteChatMessage` Cloud Function via Playwright browser context.
 * 5. Background trigger execution (`onShareDocumentWrite`) enforcing document integrity.
 * 6. Capturing step-by-step screenshots demonstrating Cloud Functions execution.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8118;
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
      console.log(`[Server] Playwright Cloud Functions demonstration server running on http://127.0.0.1:${PORT}`);
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

async function runTest() {
  console.log('🚀 Starting Playwright Cloud Functions Demonstration Suite...\n');

  const server = await createStaticServer();
  let browser;
  let passedCount = 0;
  let totalCount = 0;

  try {
    browser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );

    const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await setupEmulatorClient(pageA);
    await setupEmulatorClient(pageB);

    const baseUrl = `http://127.0.0.1:${PORT}/index.html?emulator=true`;

    // ------------------------------------------------------------------------
    // STAGE 1: verifyAndWriteShare Cloud Function
    // ------------------------------------------------------------------------
    totalCount++;
    console.log('▶ STAGE 1: Invoking `verifyAndWriteShare` Cloud Function via Playwright browser...');
    await pageA.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await pageA.waitForFunction(() => window.HabitualCore && window.HabitualCore.CryptoKeys);

    const DOC_ID = 'pw_func_doc_' + Date.now();

    const writeResult = await pageA.evaluate(async (docId) => {
      const core = window.HabitualCore;
      const userKey = await core.CryptoKeys.getOrCreateUserKeyPair();

      const ciphertext = 'ENC:v1:sample_encrypted_habit_payload';
      const hashOfdata = 'sha256_data_hash_abc123';
      const payloadString = `${docId}:${ciphertext}:${hashOfdata}`;

      const signature = await core.CryptoKeys.signPayload(userKey.privateKey, payloadString);

      const res = await fetch('http://127.0.0.1:5001/habitual-log/us-central1/verifyAndWriteShare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            docId,
            ciphertext,
            hashOfdata,
            writerPublicKey: userKey.publicKeyBase64,
            signature,
            ownerPublicKey: userKey.publicKeyBase64
          }
        })
      });

      const json = await res.json();
      return { result: json.result, pubKey: userKey.publicKeyBase64 };
    }, DOC_ID);

    logResult('verifyAndWriteShare Cloud Function executed and returned success', !!(writeResult.result && writeResult.result.success));
    const imgStage1 = path.join(SCREENSHOT_DIR, 'cloud_functions_stage_1_share_write.png');
    await pageA.screenshot({ path: imgStage1 });
    logResult('Stage 1 screenshot captured', fs.existsSync(imgStage1), `(${imgStage1})`);
    passedCount++;

    // ------------------------------------------------------------------------
    // STAGE 2: createInviteToken Cloud Function
    // ------------------------------------------------------------------------
    totalCount++;
    console.log('\n▶ STAGE 2: Invoking `createInviteToken` Cloud Function via Playwright browser...');

    const tokenResult = await pageA.evaluate(async (docId) => {
      const core = window.HabitualCore;
      const userKey = await core.CryptoKeys.getOrCreateUserKeyPair();

      const authPayload = `${docId}:create_invite`;
      const signature = await core.CryptoKeys.signPayload(userKey.privateKey, authPayload);

      const res = await fetch('http://127.0.0.1:5001/habitual-log/us-central1/createInviteToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            docId,
            ownerPublicKey: userKey.publicKeyBase64,
            signature
          }
        })
      });

      const json = await res.json();
      return json.result;
    }, DOC_ID);

    logResult('createInviteToken Cloud Function returned valid token', !!(tokenResult && tokenResult.token && tokenResult.token.startsWith('inv_')), `(token: ${tokenResult ? tokenResult.token : ''})`);
    const imgStage2 = path.join(SCREENSHOT_DIR, 'cloud_functions_stage_2_create_token.png');
    await pageA.screenshot({ path: imgStage2 });
    logResult('Stage 2 screenshot captured', fs.existsSync(imgStage2), `(${imgStage2})`);
    passedCount++;

    // ------------------------------------------------------------------------
    // STAGE 3: redeemInviteToken Cloud Function
    // ------------------------------------------------------------------------
    totalCount++;
    console.log('\n▶ STAGE 3: Invoking `redeemInviteToken` Cloud Function from Device B...');
    await pageB.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await pageB.waitForFunction(() => window.HabitualCore && window.HabitualCore.CryptoKeys);

    const redeemResult = await pageB.evaluate(async ({ docId, token }) => {
      const core = window.HabitualCore;
      const userKey = await core.CryptoKeys.getOrCreateUserKeyPair();

      const res = await fetch('http://127.0.0.1:5001/habitual-log/us-central1/redeemInviteToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            docId,
            token,
            recipientPublicKey: userKey.publicKeyBase64
          }
        })
      });

      const json = await res.json();
      return json.result;
    }, { docId: DOC_ID, token: tokenResult.token });

    logResult('redeemInviteToken Cloud Function redeemed token & added recipient key', !!(redeemResult && redeemResult.success));
    const imgStage3 = path.join(SCREENSHOT_DIR, 'cloud_functions_stage_3_redeem_token.png');
    await pageB.screenshot({ path: imgStage3 });
    logResult('Stage 3 screenshot captured', fs.existsSync(imgStage3), `(${imgStage3})`);
    passedCount++;

    // ------------------------------------------------------------------------
    // STAGE 4: verifyAndWriteChatMessage Cloud Function
    // ------------------------------------------------------------------------
    totalCount++;
    console.log('\n▶ STAGE 4: Invoking `verifyAndWriteChatMessage` Cloud Function from Device B...');

    const chatResult = await pageB.evaluate(async (docId) => {
      const core = window.HabitualCore;
      const userKey = await core.CryptoKeys.getOrCreateUserKeyPair();

      const msgId = 'msg_pw_' + Date.now();
      const ciphertext = 'ENC:v1:chat_message_from_device_b';
      const payloadString = `${docId}:${msgId}:${ciphertext}`;
      const signature = await core.CryptoKeys.signPayload(userKey.privateKey, payloadString);

      const res = await fetch('http://127.0.0.1:5001/habitual-log/us-central1/verifyAndWriteChatMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            docId,
            msgId,
            ciphertext,
            writerPublicKey: userKey.publicKeyBase64,
            signature
          }
        })
      });

      const json = await res.json();
      return json.result;
    }, DOC_ID);

    logResult('verifyAndWriteChatMessage Cloud Function validated signature and saved message', !!(chatResult && chatResult.success));
    const imgStage4 = path.join(SCREENSHOT_DIR, 'cloud_functions_stage_4_chat_message.png');
    await pageB.screenshot({ path: imgStage4 });
    logResult('Stage 4 screenshot captured', fs.existsSync(imgStage4), `(${imgStage4})`);
    passedCount++;

    // ------------------------------------------------------------------------
    // STAGE 5: Background Trigger Security Enforcement (onShareDocumentWrite)
    // ------------------------------------------------------------------------
    totalCount++;
    console.log('\n▶ STAGE 5: Testing Firestore Trigger (`onShareDocumentWrite`) automatic write security...');

    const triggerRevertResult = await pageA.evaluate(async (docId) => {
      // 1. Fetch current signed state
      const resBefore = await fetch(`http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/share/${docId}`);
      const beforeJson = await resBefore.json();

      // 2. Tamper with document by writing unsigned payload directly to Firestore REST endpoint
      await fetch(`http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/share/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            ciphertext: { stringValue: 'hacked_unsigned_payload' }
          }
        })
      });

      // 3. Wait for background trigger to fire in Cloud Functions emulator and revert write
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 200));
        const resAfter = await fetch(`http://127.0.0.1:8080/v1/projects/habitual-log/databases/(default)/documents/share/${docId}`);
        if (resAfter.ok) {
          const afterJson = await resAfter.json();
          if (afterJson.fields && afterJson.fields.ciphertext && afterJson.fields.ciphertext.stringValue !== 'hacked_unsigned_payload') {
            return { reverted: true, currentText: afterJson.fields.ciphertext.stringValue };
          }
        }
      }
      return { reverted: false };
    }, DOC_ID);

    logResult('Firestore Background Trigger (onShareDocumentWrite) detected and reverted unauthorized write', triggerRevertResult.reverted);
    const imgStage5 = path.join(SCREENSHOT_DIR, 'cloud_functions_stage_5_trigger_revert.png');
    await pageA.screenshot({ path: imgStage5 });
    logResult('Stage 5 screenshot captured', fs.existsSync(imgStage5), `(${imgStage5})`);
    passedCount++;

    console.log(`\n========================================`);
    console.log(`🎉 ALL ${passedCount}/${totalCount} CLOUD FUNCTIONS PLAYWRIGHT STAGES PASSED!`);
    console.log(`   Screenshots saved in ${SCREENSHOT_DIR}/`);
    console.log(`========================================\n`);

  } catch (err) {
    console.error('\n❌ Cloud Functions Playwright Error:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.destroyAllSockets();
    server.close();
  }
}

runTest();
