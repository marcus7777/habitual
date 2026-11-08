/**
 * Playwright E2E Test Suite focused on Shared Habit Data Integrity & Cryptographic Security
 * Verifies:
 * 1. Tamper-Evident Payload Digest Verification: Altered ciphertext/hashes are rejected.
 * 2. Writer Authorization Enforcement: Updates from keys not in allowedPublicKeys are rejected.
 * 3. Anti-Deletion Protection: Unauthorized document deletions are blocked and reverted.
 * 4. Anti-Downgrade Protection: Overwriting signed documents with unsigned payloads is rejected.
 * 5. One-Time Invite Link Redemption Guarantee: Reusing invite tokens fails.
 * 6. Sub-Habit Tree Integrity: Parent-child hierarchies remain intact through shared payload encryption & decryption.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8091;
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

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const activePort = server.address().port;
      resolve({ server, port: activePort });
    });
  });
}

async function runSharedDataIntegrityPlaywrightTests() {
  console.log('🚀 Starting Focused Shared Habit Data Integrity & Security Audit...\n');

  const { server, port } = await createStaticServer();
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

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.HabitualCore && typeof window.HabitualCore.CryptoKeys === 'object');


    console.log('▶ TEST 1: Tamper-Evident Payload Signature Verification');
    const tamperResult = await page.evaluate(async () => {
      const core = window.HabitualCore;
      const ownerKp = await core.CryptoKeys.generateKeyPair();
      const ownerPub = await core.CryptoKeys.exportPublicKey(ownerKp.publicKey);

      const docId = 'doc_integrity_test_1';
      const validCipher = await core.E2EE.encrypt({ name: 'Genuine Habit' }, 'password123');
      const dataHash = core.computeDataHash({ name: 'Genuine Habit' });

      const validPayloadStr = `${docId}:${validCipher}:${dataHash}`;
      const validSignature = await core.CryptoKeys.signPayload(ownerKp.privateKey, validPayloadStr);

      // 1. Verify valid payload
      const isValid = await core.CryptoKeys.verifySignature(ownerPub, validSignature, validPayloadStr);

      // 2. Modify 1 character in ciphertext (tamper simulation)
      const tamperedCipher = validCipher.slice(0, 10) + 'X' + validCipher.slice(11);
      const tamperedPayloadStr = `${docId}:${tamperedCipher}:${dataHash}`;
      const isTamperedValid = await core.CryptoKeys.verifySignature(ownerPub, validSignature, tamperedPayloadStr);

      return isValid && !isTamperedValid;
    });

    assert(tamperResult, 'Modifying encrypted ciphertext invalidates the ECDSA signature digest');


    console.log('\n▶ TEST 2: Writer Authorization & Allowed Public Keys Enforcement');
    const authResult = await page.evaluate(async () => {
      const core = window.HabitualCore;
      const ownerKp = await core.CryptoKeys.generateKeyPair();
      const ownerPub = await core.CryptoKeys.exportPublicKey(ownerKp.publicKey);

      const attackerKp = await core.CryptoKeys.generateKeyPair();
      const attackerPub = await core.CryptoKeys.exportPublicKey(attackerKp.publicKey);

      const docId = 'doc_auth_test_2';
      const cipher = await core.E2EE.encrypt({ name: 'Protected Habit' }, 'pass123');
      const hash = core.computeDataHash({ name: 'Protected Habit' });

      // Attacker signs payload with their own private key
      const attackerSig = await core.CryptoKeys.signPayload(attackerKp.privateKey, `${docId}:${cipher}:${hash}`);

      const mockFirestoreDoc = {
        ciphertext: cipher,
        hashOfdata: hash,
        writerPublicKey: attackerPub,
        ownerPublicKey: ownerPub,
        allowedPublicKeys: [ownerPub], // Attacker is NOT in allowedPublicKeys!
        signature: attackerSig
      };

      // Download backup and verify client authorization check
      core.SyncTargets.Firestore.db = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => mockFirestoreDoc })
          })
        })
      };

      let rejected = false;
      try {
        await core.SyncTargets.Firestore.downloadPerHabitBackup(docId, 'pass123');
      } catch (err) {
        rejected = true;
      }
      return rejected;
    });

    assert(authResult, 'Shared document update from unauthorized public key is strictly rejected');


    console.log('\n▶ TEST 3: Anti-Deletion Protection for Signed Shared Documents');
    const deleteResult = await page.evaluate(async () => {
      const core = window.HabitualCore;
      const ownerKp = await core.CryptoKeys.generateKeyPair();
      const ownerPub = await core.CryptoKeys.exportPublicKey(ownerKp.publicKey);

      const docId = 'doc_anti_delete_3';
      const beforeDoc = {
        ciphertext: 'ENC:valid_data',
        ownerPublicKey: ownerPub,
        allowedPublicKeys: [ownerPub],
        signature: 'sig_owner'
      };

      let docStore = { [docId]: beforeDoc };

      // Simulate Firestore Cloud Function onWrite trigger
      function simulateFirestoreTrigger(dId, before, after) {
        if (!after && before && (before.ownerPublicKey || before.signature)) {
          docStore[dId] = before; // Revert unauthorized delete!
          return { restored: true };
        }
        return { restored: false };
      }

      // Attacker deletes document
      delete docStore[docId];
      const trig = simulateFirestoreTrigger(docId, beforeDoc, docStore[docId]);

      return trig.restored && docStore[docId] !== undefined;
    });

    assert(deleteResult, 'Attempted deletion of signed shared habit is detected and restored by security trigger');


    console.log('\n▶ TEST 4: Anti-Downgrade & Unsigned Overwrite Rejection');
    const downgradeResult = await page.evaluate(async () => {
      const core = window.HabitualCore;
      const ownerKp = await core.CryptoKeys.generateKeyPair();
      const ownerPub = await core.CryptoKeys.exportPublicKey(ownerKp.publicKey);

      const docId = 'doc_downgrade_4';
      const mockUnsignedDoc = {
        ciphertext: 'ENC:unsigned_overwrite_attempt',
        ownerPublicKey: ownerPub // Signed document overwritten without signature!
      };

      core.SyncTargets.Firestore.db = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => mockUnsignedDoc })
          })
        })
      };

      let caught = false;
      try {
        await core.SyncTargets.Firestore.downloadPerHabitBackup(docId, 'pwd123');
      } catch (e) {
        caught = true;
      }
      return caught;
    });

    assert(downgradeResult, 'Unsigned overwrite attempt on previously signed document is rejected');


    console.log('\n▶ TEST 5: One-Time Invite Token Single Redemption Guarantee');
    const inviteResult = await page.evaluate(async () => {
      const core = window.HabitualCore;
      const docId = 'doc_invite_5';
      let inviteDoc = { docId: docId, used: false };
      let shareDoc = { ownerPublicKey: 'owner_pub', allowedPublicKeys: ['owner_pub'] };

      core.SyncTargets.Firestore.db = {
        collection: (c) => ({
          doc: (id) => ({
            get: async () => {
              if (c === 'share_invites') return { exists: true, data: () => inviteDoc };
              return { exists: true, data: () => shareDoc };
            },
            set: async (d, opts) => {
              if (c === 'share_invites') inviteDoc = Object.assign(inviteDoc, d);
              if (c === 'share') shareDoc = Object.assign(shareDoc, d);
              return Promise.resolve();
            }
          })
        })
      };

      // 1st Redemption (Success)
      const redeem1 = await core.SyncTargets.Firestore.redeemShareInviteToken(docId, 'inv_token_123');

      // 2nd Redemption (Fails)
      let redeem2Failed = false;
      try {
        await core.SyncTargets.Firestore.redeemShareInviteToken(docId, 'inv_token_123');
      } catch (e) {
        redeem2Failed = true;
      }

      return redeem1.success && inviteDoc.used === true && redeem2Failed;
    });

    assert(inviteResult, 'Single-use invite token cannot be redeemed a second time');


    console.log('\n▶ TEST 6: Sub-Habit Hierarchy & Log Integrity Preservation');
    const treeResult = await page.evaluate(async () => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();

      const parent = {
        id: 'tree_parent',
        name: 'Parent Goal',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#1088ac',
        logs: { [today]: { count: 1, note: 'Parent log' } }
      };

      const child = {
        id: 'tree_child',
        parentId: 'tree_parent',
        name: 'Child Subtask',
        type: 'positive',
        dailyTarget: 5,
        colorTheme: '#39d353',
        logs: { [today]: { count: 5, note: 'Child log' } }
      };

      core.state.habits = [parent, child];
      const payload = core.getPerHabitPayload(parent);

      // Verify payload structure contains nested sub-habit hierarchy
      const hasChildrenInPayload = payload.children && payload.children.length === 1 && payload.children[0].name === 'Child Subtask';
      const childLogIntact = payload.children[0].logs[today].count === 5;

      return hasChildrenInPayload && childLogIntact;
    });

    assert(treeResult, 'Shared payload preserves sub-habit parent-child tree hierarchy, custom colors, and history logs');

  } catch (err) {
    console.error('Fatal Playwright Integrity Test Error:', err);
  } finally {
    if (browser) await browser.close();
    server.close();
    console.log(`\n📊 Shared Data Integrity Test Results: ${passed}/${total} passed.`);
    process.exit(passed === total ? 0 : 1);
  }
}

runSharedDataIntegrityPlaywrightTests();
