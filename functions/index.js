const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

const { FieldValue } = require('@google-cloud/firestore');
admin.initializeApp();
const db = admin.firestore();

function spkiBase64ToPem(base64) {
  const clean = base64.replace(/[\r\n\s]/g, '');
  const lines = clean.match(/.{1,64}/g) || [clean];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

function verifySignature(publicKeyBase64, signatureBase64, dataString) {
  if (!publicKeyBase64 || !signatureBase64 || !dataString) return false;
  try {
    const pem = spkiBase64ToPem(publicKeyBase64);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(typeof dataString === 'string' ? dataString : JSON.stringify(dataString));
    verifier.end();
    return verifier.verify(pem, Buffer.from(signatureBase64, 'base64'));
  } catch (err) {
    console.error('Server signature verification error:', err);
    return false;
  }
}

// --- FIRESTORE TRIGGER: REAL-TIME VALIDATION & ENFORCEMENT ON WRITES ---
exports.onShareDocumentWrite = functions.firestore.document('share/{docId}').onWrite(async (change, context) => {
  const docId = context.params.docId;
  const beforeData = change.before.exists ? change.before.data() : null;
  const afterData = change.after.exists ? change.after.data() : null;

  // 1. If document was deleted but was previously signed, revert deletion
  if (!afterData && beforeData && (beforeData.ownerPublicKey || beforeData.signature)) {
    console.warn(`[Security Trigger] Reverting unauthorized deletion of signed shared document: ${docId}`);
    return change.before.ref.set(beforeData);
  }

  if (!afterData) return null;

  // 2. If previously signed document is updated with an unsigned payload, revert immediately
  if (beforeData && (beforeData.ownerPublicKey || beforeData.signature)) {
    if (!afterData.signature || !afterData.writerPublicKey) {
      console.warn(`[Security Trigger] Reverting unsigned overwrite on signed shared document: ${docId}`);
      return change.after.ref.set(beforeData);
    }

    const allowed = Array.isArray(beforeData.allowedPublicKeys) ? beforeData.allowedPublicKeys : [];
    const owner = beforeData.ownerPublicKey || beforeData.writerPublicKey;
    const isAllowed = allowed.includes(afterData.writerPublicKey) || owner === afterData.writerPublicKey;

    if (!isAllowed) {
      console.warn(`[Security Trigger] Reverting write from unauthorized public key ${afterData.writerPublicKey} on doc ${docId}`);
      return change.after.ref.set(beforeData);
    }

    const payloadString = `${docId}:${afterData.ciphertext}:${afterData.hashOfdata || ''}`;
    const isValid = verifySignature(afterData.writerPublicKey, afterData.signature, payloadString);

    if (!isValid) {
      console.warn(`[Security Trigger] Reverting write with invalid signature on doc ${docId}`);
      return change.after.ref.set(beforeData);
    }
  } else if (afterData.signature && afterData.writerPublicKey) {
    // 3. Document is being newly created or upgraded with a signature
    const payloadString = `${docId}:${afterData.ciphertext}:${afterData.hashOfdata || ''}`;
    const isValid = verifySignature(afterData.writerPublicKey, afterData.signature, payloadString);

    if (!isValid) {
      console.warn(`[Security Trigger] Rejecting initial signed write with invalid signature on doc ${docId}`);
      if (beforeData) {
        return change.after.ref.set(beforeData);
      } else {
        return change.after.ref.delete();
      }
    }
  }

  return null;
});

exports.verifyAndWriteShare = functions.https.onCall(async (data, context) => {
  const { docId, ciphertext, hashOfdata, writerPublicKey, signature, ownerPublicKey } = data || {};

  if (!docId || !ciphertext || !writerPublicKey || !signature) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields (docId, ciphertext, writerPublicKey, signature).');
  }

  const payloadString = `${docId}:${ciphertext}:${hashOfdata || ''}`;
  const isValidSig = verifySignature(writerPublicKey, signature, payloadString);
  if (!isValidSig) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid ECDSA signature for habit payload.');
  }

  const shareRef = db.collection('share').doc(docId);
  const snap = await shareRef.get();

  if (snap.exists) {
    const existing = snap.data() || {};
    const allowed = Array.isArray(existing.allowedPublicKeys) ? existing.allowedPublicKeys : [];
    const existingOwner = existing.ownerPublicKey || existing.writerPublicKey;

    if (allowed.length > 0 && !allowed.includes(writerPublicKey) && existingOwner !== writerPublicKey) {
      throw new functions.https.HttpsError('permission-denied', 'Writer public key is not in the allowed editors list for this habit.');
    }

    const updatedAllowed = Array.from(new Set([...allowed, writerPublicKey]));
    if (existingOwner && !updatedAllowed.includes(existingOwner)) {
      updatedAllowed.push(existingOwner);
    }

    await shareRef.set({
      ciphertext: ciphertext,
      hashOfdata: hashOfdata || '',
      writerPublicKey: writerPublicKey,
      signature: signature,
      ownerPublicKey: existingOwner || ownerPublicKey || writerPublicKey,
      allowedPublicKeys: updatedAllowed,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } else {
    const initialOwner = ownerPublicKey || writerPublicKey;
    await shareRef.set({
      ciphertext: ciphertext,
      hashOfdata: hashOfdata || '',
      writerPublicKey: writerPublicKey,
      signature: signature,
      ownerPublicKey: initialOwner,
      allowedPublicKeys: [initialOwner],
      updatedAt: FieldValue.serverTimestamp()
    });
  }

  return { success: true, docId: docId };
});

exports.createInviteToken = functions.https.onCall(async (data, context) => {
  const { docId, ownerPublicKey, signature } = data || {};

  if (!docId || !ownerPublicKey || !signature) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing docId, ownerPublicKey, or signature.');
  }

  const authPayload = `${docId}:create_invite`;
  if (!verifySignature(ownerPublicKey, signature, authPayload)) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid signature for invite creation.');
  }

  const shareRef = db.collection('share').doc(docId);
  const snap = await shareRef.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Shared habit document does not exist.');
  }

  const existing = snap.data() || {};
  const allowed = Array.isArray(existing.allowedPublicKeys) ? existing.allowedPublicKeys : [];
  if (existing.ownerPublicKey && existing.ownerPublicKey !== ownerPublicKey && !allowed.includes(ownerPublicKey)) {
    throw new functions.https.HttpsError('permission-denied', 'Only authorized habit owners/editors can create invite links.');
  }

  const token = 'inv_' + crypto.randomBytes(12).toString('hex');

  await db.collection('share_invites').doc(token).set({
    docId: docId,
    ownerPublicKey: ownerPublicKey,
    used: false,
    createdAt: FieldValue.serverTimestamp()
  });

  return { success: true, token: token, docId: docId };
});

exports.redeemInviteToken = functions.https.onCall(async (data, context) => {
  const { docId, token, recipientPublicKey } = data || {};

  if (!docId || !token || !recipientPublicKey) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields (docId, token, recipientPublicKey).');
  }

  const inviteRef = db.collection('share_invites').doc(token);
  const inviteSnap = await inviteRef.get();

  if (!inviteSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invite token not found.');
  }

  const inviteData = inviteSnap.data() || {};
  if (inviteData.docId !== docId) {
    throw new functions.https.HttpsError('invalid-argument', 'Invite token does not match shared habit ID.');
  }

  if (inviteData.used === true) {
    throw new functions.https.HttpsError('already-exists', 'This invite link has already been used.');
  }

  const shareRef = db.collection('share').doc(docId);
  const shareSnap = await shareRef.get();
  if (!shareSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Shared habit document no longer exists.');
  }

  const shareData = shareSnap.data() || {};
  const allowed = Array.isArray(shareData.allowedPublicKeys) ? shareData.allowedPublicKeys : [];
  const updatedAllowed = Array.from(new Set([...allowed, recipientPublicKey]));

  await db.runTransaction(async (transaction) => {
    transaction.update(shareRef, {
      allowedPublicKeys: updatedAllowed,
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.update(inviteRef, {
      used: true,
      usedAt: FieldValue.serverTimestamp(),
      usedBy: recipientPublicKey
    });
  });

  return { success: true, docId: docId };
});

exports.onHabitChatMessageWrite = functions.firestore.document('habit_chats/{docId}/messages/{msgId}').onWrite(async (change, context) => {
  const { docId, msgId } = context.params;
  const afterData = change.after.exists ? change.after.data() : null;

  if (!afterData) return null;

  const { ciphertext, writerPublicKey, signature } = afterData;

  if (!ciphertext || !writerPublicKey || !signature) {
    console.warn(`[Security Trigger] Reverting message missing required fields on chat doc ${docId}/${msgId}`);
    return change.after.ref.delete();
  }

  const payloadString = `${docId}:${msgId}:${ciphertext}`;
  const isValidSig = verifySignature(writerPublicKey, signature, payloadString);

  if (!isValidSig) {
    console.warn(`[Security Trigger] Reverting chat message with invalid signature on doc ${docId}/${msgId}`);
    return change.after.ref.delete();
  }

  const shareSnap = await db.collection('share').doc(docId).get();
  if (!shareSnap.exists) {
    console.warn(`[Security Trigger] Reverting chat message for non-existent habit ${docId}`);
    return change.after.ref.delete();
  }

  const shareData = shareSnap.data() || {};
  const allowed = Array.isArray(shareData.allowedPublicKeys) ? shareData.allowedPublicKeys : [];
  const owner = shareData.ownerPublicKey || shareData.writerPublicKey;
  const isAllowed = allowed.includes(writerPublicKey) || owner === writerPublicKey;

  if (!isAllowed) {
    console.warn(`[Security Trigger] Reverting message from unauthorized writer key ${writerPublicKey} on habit chat ${docId}`);
    return change.after.ref.delete();
  }

  return null;
});

exports.verifyAndWriteChatMessage = functions.https.onCall(async (data, context) => {
  const { docId, msgId, ciphertext, writerPublicKey, signature } = data || {};

  if (!docId || !msgId || !ciphertext || !writerPublicKey || !signature) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
  }

  const payloadString = `${docId}:${msgId}:${ciphertext}`;
  if (!verifySignature(writerPublicKey, signature, payloadString)) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid ECDSA signature for chat message.');
  }

  const shareSnap = await db.collection('share').doc(docId).get();
  if (!shareSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Shared habit document does not exist.');
  }

  const shareData = shareSnap.data() || {};
  const allowed = Array.isArray(shareData.allowedPublicKeys) ? shareData.allowedPublicKeys : [];
  const owner = shareData.ownerPublicKey || shareData.writerPublicKey;
  const isAllowed = allowed.includes(writerPublicKey) || owner === writerPublicKey;

  if (!isAllowed) {
    throw new functions.https.HttpsError('permission-denied', 'Writer public key is not authorized for this shared habit chat.');
  }

  await db.collection('habit_chats').doc(docId).collection('messages').doc(msgId).set({
    docId,
    msgId,
    ciphertext,
    writerPublicKey,
    signature,
    timestamp: FieldValue.serverTimestamp()
  });

  return { success: true, docId, msgId };
});
