'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const admin = require('../functions/node_modules/firebase-admin');

// Ensure admin SDK connects to local Firestore emulator
process.env.FIREBASE_FIRESTORE_EMULATOR_HOST = process.env.FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'habitual-log' });
}
const db = admin.firestore();

// --- Crypto Key Generator & Signing Utilities ---
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return {
    publicKeyBase64: publicKey.toString('base64'),
    privateKeyPem: privateKey
  };
}

function signPayload(privateKeyPem, payloadString) {
  const signer = crypto.createSign('SHA256');
  signer.update(typeof payloadString === 'string' ? payloadString : JSON.stringify(payloadString));
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

// --- HTTP Function Caller ---
async function callFunction(functionName, data) {
  const res = await fetch(`http://127.0.0.1:5001/habitual-log/us-central1/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data })
  });
  const json = await res.json();
  if (json.error) {
    const err = new Error(json.error.message || 'Function returned error');
    err.status = json.error.status;
    err.code = json.error.code;
    throw err;
  }
  return json.result;
}

async function waitUntil(predicate, timeoutMs = 10000, intervalMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

// --- Test Runner Helper ---
let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS ${name}`);
    passedCount++;
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.stack || error}`);
    failedCount++;
    process.exitCode = 1;
  }
}

async function runAllTests() {
  console.log('\n--- Habitual Cloud Functions Integration & Local Emulator Suite ---');

  const ownerKeys = generateKeyPair();
  const allowedUserKeys = generateKeyPair();
  const strangerKeys = generateKeyPair();

  const shareDocId = 'test_share_' + Date.now();
  const ciphertext = 'enc_habit_data_sample_v1';
  const hashOfdata = 'sha256_hash_123';

  // -------------------------------------------------------------
  // SECTION 1: verifyAndWriteShare
  // -------------------------------------------------------------
  console.log('\n1. Testing verifyAndWriteShare (HTTPS Callable)');

  await test('verifyAndWriteShare creates share document with valid ECDSA signature', async () => {
    const payloadString = `${shareDocId}:${ciphertext}:${hashOfdata}`;
    const sig = signPayload(ownerKeys.privateKeyPem, payloadString);

    const result = await callFunction('verifyAndWriteShare', {
      docId: shareDocId,
      ciphertext,
      hashOfdata,
      writerPublicKey: ownerKeys.publicKeyBase64,
      signature: sig,
      ownerPublicKey: ownerKeys.publicKeyBase64
    });

    assert.equal(result.success, true);
    assert.equal(result.docId, shareDocId);

    const snap = await db.collection('share').doc(shareDocId).get();
    assert.equal(snap.exists, true);
    const data = snap.data();
    assert.equal(data.ciphertext, ciphertext);
    assert.equal(data.ownerPublicKey, ownerKeys.publicKeyBase64);
    assert.deepEqual(data.allowedPublicKeys, [ownerKeys.publicKeyBase64]);
  });

  await test('verifyAndWriteShare rejects missing required arguments', async () => {
    await assert.rejects(
      async () => callFunction('verifyAndWriteShare', { docId: 'doc_incomplete' }),
      (err) => err.status === 'INVALID_ARGUMENT'
    );
  });

  await test('verifyAndWriteShare rejects invalid ECDSA signature', async () => {
    const payloadString = `${shareDocId}:${ciphertext}:${hashOfdata}`;
    const wrongSig = signPayload(strangerKeys.privateKeyPem, payloadString);

    await assert.rejects(
      async () => callFunction('verifyAndWriteShare', {
        docId: shareDocId,
        ciphertext,
        hashOfdata,
        writerPublicKey: ownerKeys.publicKeyBase64,
        signature: wrongSig
      }),
      (err) => err.status === 'UNAUTHENTICATED'
    );
  });

  await test('verifyAndWriteShare rejects updates from unauthorized public key before invite', async () => {
    const unauthCiphertext = 'hacked_payload';
    const payloadString = `${shareDocId}:${unauthCiphertext}:${hashOfdata}`;
    const sig = signPayload(allowedUserKeys.privateKeyPem, payloadString);

    await assert.rejects(
      async () => callFunction('verifyAndWriteShare', {
        docId: shareDocId,
        ciphertext: unauthCiphertext,
        hashOfdata,
        writerPublicKey: allowedUserKeys.publicKeyBase64,
        signature: sig
      }),
      (err) => err.status === 'PERMISSION_DENIED'
    );
  });

  // -------------------------------------------------------------
  // SECTION 2: createInviteToken
  // -------------------------------------------------------------
  console.log('\n2. Testing createInviteToken (HTTPS Callable)');
  let inviteToken = null;

  await test('createInviteToken creates valid invite token for authorized owner', async () => {
    const authPayload = `${shareDocId}:create_invite`;
    const sig = signPayload(ownerKeys.privateKeyPem, authPayload);

    const result = await callFunction('createInviteToken', {
      docId: shareDocId,
      ownerPublicKey: ownerKeys.publicKeyBase64,
      signature: sig
    });

    assert.equal(result.success, true);
    assert.equal(result.docId, shareDocId);
    assert.ok(result.token.startsWith('inv_'));
    inviteToken = result.token;

    const tokenSnap = await db.collection('share_invites').doc(inviteToken).get();
    assert.equal(tokenSnap.exists, true);
    assert.equal(tokenSnap.data().used, false);
    assert.equal(tokenSnap.data().docId, shareDocId);
  });

  await test('createInviteToken rejects invalid signature', async () => {
    const authPayload = `${shareDocId}:create_invite`;
    const wrongSig = signPayload(strangerKeys.privateKeyPem, authPayload);

    await assert.rejects(
      async () => callFunction('createInviteToken', {
        docId: shareDocId,
        ownerPublicKey: ownerKeys.publicKeyBase64,
        signature: wrongSig
      }),
      (err) => err.status === 'UNAUTHENTICATED'
    );
  });

  await test('createInviteToken rejects token creation for non-existent habit', async () => {
    const fakeDoc = 'non_existent_doc_999';
    const authPayload = `${fakeDoc}:create_invite`;
    const sig = signPayload(ownerKeys.privateKeyPem, authPayload);

    await assert.rejects(
      async () => callFunction('createInviteToken', {
        docId: fakeDoc,
        ownerPublicKey: ownerKeys.publicKeyBase64,
        signature: sig
      }),
      (err) => err.status === 'NOT_FOUND'
    );
  });

  await test('createInviteToken rejects token creation by unauthorized user', async () => {
    const authPayload = `${shareDocId}:create_invite`;
    const sig = signPayload(strangerKeys.privateKeyPem, authPayload);

    await assert.rejects(
      async () => callFunction('createInviteToken', {
        docId: shareDocId,
        ownerPublicKey: strangerKeys.publicKeyBase64,
        signature: sig
      }),
      (err) => err.status === 'PERMISSION_DENIED'
    );
  });

  // -------------------------------------------------------------
  // SECTION 3: redeemInviteToken
  // -------------------------------------------------------------
  console.log('\n3. Testing redeemInviteToken (HTTPS Callable)');

  await test('redeemInviteToken redeems unused token and grants access', async () => {
    const result = await callFunction('redeemInviteToken', {
      docId: shareDocId,
      token: inviteToken,
      recipientPublicKey: allowedUserKeys.publicKeyBase64
    });

    assert.equal(result.success, true);

    const tokenSnap = await db.collection('share_invites').doc(inviteToken).get();
    assert.equal(tokenSnap.data().used, true);
    assert.equal(tokenSnap.data().usedBy, allowedUserKeys.publicKeyBase64);

    const shareSnap = await db.collection('share').doc(shareDocId).get();
    assert.ok(shareSnap.data().allowedPublicKeys.includes(allowedUserKeys.publicKeyBase64));
  });

  await test('verifyAndWriteShare allows updates from newly redeemed invited user', async () => {
    const newCiphertext = 'enc_habit_data_updated_by_invited_editor_v2';
    const payloadString = `${shareDocId}:${newCiphertext}:${hashOfdata}`;
    const sig = signPayload(allowedUserKeys.privateKeyPem, payloadString);

    const result = await callFunction('verifyAndWriteShare', {
      docId: shareDocId,
      ciphertext: newCiphertext,
      hashOfdata,
      writerPublicKey: allowedUserKeys.publicKeyBase64,
      signature: sig
    });

    assert.equal(result.success, true);
    const snap = await db.collection('share').doc(shareDocId).get();
    assert.equal(snap.data().ciphertext, newCiphertext);
  });

  await test('redeemInviteToken rejects already used invite token', async () => {
    await assert.rejects(
      async () => callFunction('redeemInviteToken', {
        docId: shareDocId,
        token: inviteToken,
        recipientPublicKey: strangerKeys.publicKeyBase64
      }),
      (err) => err.status === 'ALREADY_EXISTS'
    );
  });

  await test('redeemInviteToken rejects non-existent token', async () => {
    await assert.rejects(
      async () => callFunction('redeemInviteToken', {
        docId: shareDocId,
        token: 'inv_bogus_token_123',
        recipientPublicKey: strangerKeys.publicKeyBase64
      }),
      (err) => err.status === 'NOT_FOUND'
    );
  });

  // -------------------------------------------------------------
  // SECTION 4: verifyAndWriteChatMessage
  // -------------------------------------------------------------
  console.log('\n4. Testing verifyAndWriteChatMessage (HTTPS Callable)');
  const msgId = 'msg_' + Date.now();
  const chatCiphertext = 'encrypted_chat_message_body';

  await test('verifyAndWriteChatMessage saves signed message from authorized owner', async () => {
    const payloadString = `${shareDocId}:${msgId}:${chatCiphertext}`;
    const sig = signPayload(ownerKeys.privateKeyPem, payloadString);

    const result = await callFunction('verifyAndWriteChatMessage', {
      docId: shareDocId,
      msgId,
      ciphertext: chatCiphertext,
      writerPublicKey: ownerKeys.publicKeyBase64,
      signature: sig
    });

    assert.equal(result.success, true);
    assert.equal(result.msgId, msgId);

    const msgSnap = await db.collection('habit_chats').doc(shareDocId).collection('messages').doc(msgId).get();
    assert.equal(msgSnap.exists, true);
    assert.equal(msgSnap.data().ciphertext, chatCiphertext);
  });

  await test('verifyAndWriteChatMessage saves signed message from redeemed editor', async () => {
    const editorMsgId = 'msg_editor_' + Date.now();
    const payloadString = `${shareDocId}:${editorMsgId}:${chatCiphertext}`;
    const sig = signPayload(allowedUserKeys.privateKeyPem, payloadString);

    const result = await callFunction('verifyAndWriteChatMessage', {
      docId: shareDocId,
      msgId: editorMsgId,
      ciphertext: chatCiphertext,
      writerPublicKey: allowedUserKeys.publicKeyBase64,
      signature: sig
    });

    assert.equal(result.success, true);
    assert.equal(result.msgId, editorMsgId);
  });

  await test('verifyAndWriteChatMessage rejects invalid signature', async () => {
    const fakeMsgId = 'msg_fake_' + Date.now();
    const payloadString = `${shareDocId}:${fakeMsgId}:${chatCiphertext}`;
    const wrongSig = signPayload(strangerKeys.privateKeyPem, payloadString);

    await assert.rejects(
      async () => callFunction('verifyAndWriteChatMessage', {
        docId: shareDocId,
        msgId: fakeMsgId,
        ciphertext: chatCiphertext,
        writerPublicKey: ownerKeys.publicKeyBase64,
        signature: wrongSig
      }),
      (err) => err.status === 'UNAUTHENTICATED'
    );
  });

  await test('verifyAndWriteChatMessage rejects message from unauthorized writer', async () => {
    const unauthMsgId = 'msg_unauth_' + Date.now();
    const payloadString = `${shareDocId}:${unauthMsgId}:${chatCiphertext}`;
    const sig = signPayload(strangerKeys.privateKeyPem, payloadString);

    await assert.rejects(
      async () => callFunction('verifyAndWriteChatMessage', {
        docId: shareDocId,
        msgId: unauthMsgId,
        ciphertext: chatCiphertext,
        writerPublicKey: strangerKeys.publicKeyBase64,
        signature: sig
      }),
      (err) => err.status === 'PERMISSION_DENIED'
    );
  });

  // -------------------------------------------------------------
  // SECTION 5: Firestore Triggers (onShareDocumentWrite & onHabitChatMessageWrite)
  // -------------------------------------------------------------
  console.log('\n5. Testing Firestore Triggers (onShareDocumentWrite & onHabitChatMessageWrite)');

  await test('onShareDocumentWrite reverts unauthorized deletion of a signed document', async () => {
    const protectedDocId = 'test_protected_' + Date.now();
    const payloadString = `${protectedDocId}:valid_data:`;
    const sig = signPayload(ownerKeys.privateKeyPem, payloadString);

    // Setup valid signed doc
    const originalData = {
      ciphertext: 'valid_data',
      ownerPublicKey: ownerKeys.publicKeyBase64,
      allowedPublicKeys: [ownerKeys.publicKeyBase64],
      writerPublicKey: ownerKeys.publicKeyBase64,
      signature: sig
    };
    await db.collection('share').doc(protectedDocId).set(originalData);

    // Attempt unauthorized deletion directly via database
    await db.collection('share').doc(protectedDocId).delete();

    // Verify background trigger restored original document
    const restored = await waitUntil(async () => {
      const snap = await db.collection('share').doc(protectedDocId).get();
      return snap.exists && snap.data().ciphertext === originalData.ciphertext;
    });

    assert.equal(restored, true, 'Trigger should revert unauthorized deletion of signed document');
  });

  await test('onShareDocumentWrite reverts unsigned write over signed document', async () => {
    const docIdToTamper = 'test_tamper_' + Date.now();
    const payloadString = `${docIdToTamper}:valid:hash`;
    const sig = signPayload(ownerKeys.privateKeyPem, payloadString);

    const originalData = {
      ciphertext: 'valid',
      writerPublicKey: ownerKeys.publicKeyBase64,
      ownerPublicKey: ownerKeys.publicKeyBase64,
      allowedPublicKeys: [ownerKeys.publicKeyBase64],
      signature: sig
    };
    await db.collection('share').doc(docIdToTamper).set(originalData);

    // Tamper with unsigned overwrite
    await db.collection('share').doc(docIdToTamper).set({ ciphertext: 'unsigned_hacked' });

    const reverted = await waitUntil(async () => {
      const snap = await db.collection('share').doc(docIdToTamper).get();
      return snap.data() && snap.data().ciphertext === originalData.ciphertext;
    });

    assert.equal(reverted, true, 'Trigger should revert unsigned overwrite');
  });

  await test('onHabitChatMessageWrite deletes chat message with invalid signature', async () => {
    const badMsgId = 'msg_bad_sig_' + Date.now();

    // Direct write of invalid signature message to firestore
    await db.collection('habit_chats').doc(shareDocId).collection('messages').doc(badMsgId).set({
      ciphertext: 'tampered_chat',
      writerPublicKey: ownerKeys.publicKeyBase64,
      signature: 'invalid_base64_signature'
    });

    // Verify background trigger deletes invalid message
    const deleted = await waitUntil(async () => {
      const snap = await db.collection('habit_chats').doc(shareDocId).collection('messages').doc(badMsgId).get();
      return !snap.exists;
    });

    assert.equal(deleted, true, 'Trigger should delete chat message with invalid signature');
  });

  console.log(`\nResults: ${passedCount} passed, ${failedCount} failed.`);
  if (failedCount > 0) process.exit(1);
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
