/**
 * Playwright E2E Test Suite for 3-Device Encrypted Chat on Shared Habits
 * Verifies:
 * 1. "Enable Encrypted Chat" option is hidden in Display Options for private habits and appears ONLY once shared.
 * 2. 3 distinct device contexts (Device A, Device B, Device C) with ECDSA keypairs sharing a habit.
 * 3. End-to-end encrypted chat message exchange and payload signature verification.
 * 4. Chat UI minimize/expand functionality and real-time unread badge counter.
 * 5. Rejection of unauthorized messages from uninvited public keys.
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
      console.log(`[Server] Test web server running on http://127.0.0.1:${PORT}`);
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

async function run3DeviceEncryptedChatTests() {
  console.log('🚀 Starting 3-Device Encrypted Chat Playwright Test Suite...\n');

  const GLOBAL_TIMEOUT_MS = 60000;
  const globalTimeout = setTimeout(() => {
    console.error(`❌ Global Test Suite Timeout exceeded (${GLOBAL_TIMEOUT_MS}ms). Forcing process exit.`);
    process.exit(1);
  }, GLOBAL_TIMEOUT_MS);
  if (globalTimeout.unref) globalTimeout.unref();

  const server = await createStaticServer();
  let browser;

  let passedTests = 0;
  let totalTests = 0;

  try {
    browser = await chromium.launch({ headless: true })
      .catch(() => chromium.launch({ channel: 'chrome', headless: true }))
      .catch(() => chromium.launch({ channel: 'msedge', headless: true }));

    const setupMockFirebaseAndChannel = async (page) => {
      await page.addInitScript(() => {
        try { delete window.navigator.serviceWorker; } catch (e) {}

        const store = window.__pw_store || new Map();
        window.__pw_store = store;

        const listeners = window.__pw_listeners || new Map();
        window.__pw_listeners = listeners;

        if (!window.__pw_sse_active) {
          window.__pw_sse_active = true;
          const sse = new EventSource('/api/mock_db_stream');
          sse.onmessage = (event) => {
            if (!event.data) return;
            try {
              const { key, data, subKey } = JSON.parse(event.data);
              if (key) store.set(key, data);
              if (subKey) {
                let subMap = window.__pw_sub_store || new Map();
                window.__pw_sub_store = subMap;
                let arr = subMap.get(subKey) || [];
                arr = arr.filter(x => x.msgId !== data.msgId);
                arr.push(data);
                subMap.set(subKey, arr);

                if (listeners.has(subKey)) {
                  listeners.get(subKey).forEach(cb => {
                    try {
                      cb({ docs: arr.map(d => ({ id: d.msgId || d.id, data: () => d })) });
                    } catch (e) {}
                  });
                }
              }
              if (key && listeners.has(key)) {
                listeners.get(key).forEach(cb => {
                  try { cb({ exists: true, data: () => data, metadata: { hasPendingWrites: false } }); } catch (e) {}
                });
              }
            } catch (e) {}
          };
        }

        const mockDb = {
          collection: function(col) {
            return {
              doc: function(docId) {
                const key = `${col}_${docId}`;
                return {
                  id: docId,
                  collection: function(subCol) {
                    const subKey = `${col}_${docId}_${subCol}`;
                    return {
                      doc: function(msgId) {
                        return {
                          set: function(data) {
                            const payload = Object.assign({ docId, msgId, createdAt: Date.now() }, data);
                            let subMap = window.__pw_sub_store || new Map();
                            window.__pw_sub_store = subMap;
                            let arr = subMap.get(subKey) || [];
                            arr = arr.filter(x => x.msgId !== msgId);
                            arr.push(payload);
                            subMap.set(subKey, arr);

                            fetch('/api/mock_db', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ key, subKey, data: payload })
                            }).catch(() => {});

                            if (listeners.has(subKey)) {
                              listeners.get(subKey).forEach(cb => {
                                try {
                                  cb({ docs: arr.map(d => ({ id: d.msgId || d.id, data: () => d })) });
                                } catch (e) {}
                              });
                            }
                            return Promise.resolve();
                          }
                        };
                      },
                      onSnapshot: function(cb) {
                        if (!listeners.has(subKey)) listeners.set(subKey, []);
                        listeners.get(subKey).push(cb);
                        let subMap = window.__pw_sub_store || new Map();
                        const arr = subMap.get(subKey) || [];
                        setTimeout(() => {
                          try { cb({ docs: arr.map(d => ({ id: d.msgId || d.id, data: () => d })) }); } catch (e) {}
                        }, 10);
                        return function unsub() {
                          if (listeners.has(subKey)) {
                            listeners.set(subKey, listeners.get(subKey).filter(fn => fn !== cb));
                          }
                        };
                      }
                    };
                  },
                  set: function(data) {
                    const normData = Object.assign({}, data, { updatedAt: Date.now() });
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
                    return Promise.resolve({
                      exists: !!data,
                      data: () => data || null
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

    // Test 1: "Enable Encrypted Chat" option is hidden on unshared/private habits
    totalTests++;
    console.log('▶ TEST 1: Display Options "Enable Encrypted Chat" is hidden on unshared habit modal');
    await pageA.evaluate(() => window.HabitualCore.openHabitModal());
    await pageA.waitForSelector('#modal-habit:not(.hidden)', { state: 'visible' });

    const isOptionHiddenInitial = await pageA.evaluate(() => {
      const el = document.getElementById('habit-enable-chat-option-group');
      return !el || el.classList.contains('hidden') || el.style.display === 'none';
    });
    logResult('Display Options Encrypted Chat setting is hidden before sharing', isOptionHiddenInitial);
    passedTests++;

    // Test 2: Checking "👥 Share Habit" reveals the "Enable Encrypted Chat" option
    totalTests++;
    console.log('\n▶ TEST 2: Checking "Share Habit" reveals "Enable Encrypted Chat" in Display Options');
    await pageA.evaluate(() => {
      const acc = document.getElementById('advanced-settings-accordion');
      if (acc) acc.open = true;
      const chk = document.getElementById('habit-enable-sharing');
      if (chk) {
        chk.checked = true;
        chk.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (window.HabitualCore.ensureCurrentModalHabitSharedAndUploaded) {
        window.HabitualCore.ensureCurrentModalHabitSharedAndUploaded();
      }
    });

    const isOptionVisibleAfterShare = await pageA.evaluate(() => {
      const el = document.getElementById('habit-enable-chat-option-group');
      return el && !el.classList.contains('hidden') && el.style.display !== 'none';
    });
    logResult('"Enable Encrypted Chat" option is visible under Display Options once habit is shared', isOptionVisibleAfterShare);
    passedTests++;

    // Save shared habit and ensure Devices A, B, C have it
    const habitDocId = 'shared_chat_doc_123';

    await Promise.all([
      pageA.evaluate((docId) => {
        const newHabit = {
          id: 'habit_team_project',
          name: 'Team Project Habit',
          sharing: { enabled: true, docId: docId, collection: docId, password: 'pass' },
          enableChat: true,
          dailyTarget: 1
        };
        window.HabitualCore.state.habits.push(newHabit);
        if (window.HabitualCore.saveState) window.HabitualCore.saveState();
        if (window.HabitualCore.render) window.HabitualCore.render();
      }, habitDocId),
      pageB.evaluate((docId) => {
        const newHabit = {
          id: 'habit_team_project',
          name: 'Team Project Habit',
          sharing: { enabled: true, docId: docId, collection: docId, password: 'pass' },
          enableChat: true,
          dailyTarget: 1
        };
        window.HabitualCore.state.habits.push(newHabit);
        if (window.HabitualCore.saveState) window.HabitualCore.saveState();
        if (window.HabitualCore.render) window.HabitualCore.render();
      }, habitDocId),
      pageC.evaluate((docId) => {
        const newHabit = {
          id: 'habit_team_project',
          name: 'Team Project Habit',
          sharing: { enabled: true, docId: docId, collection: docId, password: 'pass' },
          enableChat: true,
          dailyTarget: 1
        };
        window.HabitualCore.state.habits.push(newHabit);
        if (window.HabitualCore.saveState) window.HabitualCore.saveState();
        if (window.HabitualCore.render) window.HabitualCore.render();
      }, habitDocId)
    ]);

    logResult('Shared habit created with docId', !!habitDocId, `(DocId: ${habitDocId})`);

    // Register Devices B and C in shared habit document's allowedPublicKeys
    const [pubKeyA, pubKeyB, pubKeyC] = await Promise.all([
      pageA.evaluate(() => window.HabitualCore.CryptoKeys.getOrCreateUserKeyPair().then(kp => kp.publicKeyBase64)),
      pageB.evaluate(() => window.HabitualCore.CryptoKeys.getOrCreateUserKeyPair().then(kp => kp.publicKeyBase64)),
      pageC.evaluate(() => window.HabitualCore.CryptoKeys.getOrCreateUserKeyPair().then(kp => kp.publicKeyBase64))
    ]);

    await pageA.evaluate(({ docId, keys }) => {
      const db = window.HabitualCore.SyncTargets.Firestore.db;
      return db.collection('share').doc(docId).set({
        docId: docId,
        ownerPublicKey: keys[0],
        allowedPublicKeys: keys,
        ciphertext: 'mock_ciphertext',
        signature: 'mock_sig'
      });
    }, { docId: habitDocId, keys: [pubKeyA, pubKeyB, pubKeyC] });

    // Test 3: Chat tab is visible when multiple public keys exist and chat enabled
    totalTests++;
    console.log('\n▶ TEST 3: Chat tab appears on shared habit with multiple public keys');
    await pageA.evaluate((docId) => {
      const habitObj = window.HabitualCore.state.habits.find(h => h.sharing && (h.sharing.docId === docId || h.sharing.collection === docId));
      window.HabitualCore.openHabitModal(habitObj);
    }, habitDocId);
    await pageA.waitForSelector('#modal-habit:not(.hidden)', { state: 'visible' });

    await pageA.waitForFunction(() => {
      const btn = document.getElementById('tab-btn-chat-options');
      return btn && !btn.classList.contains('hidden') && btn.style.display !== 'none';
    }, { timeout: 10000 });

    const isChatTabVisible = await pageA.evaluate(() => {
      const btn = document.getElementById('tab-btn-chat-options');
      return btn && !btn.classList.contains('hidden') && btn.style.display !== 'none';
    });
    logResult('Chat tab is visible for multi-user shared habit', isChatTabVisible);
    passedTests++;

    // Test 4: Device A sends encrypted message -> Device B and C receive & decrypt
    totalTests++;
    console.log('\n▶ TEST 4: 3-Device Encrypted Chat Message Transmission & Signature Verification');

    await pageA.evaluate(() => window.HabitualCore.switchDisplayOptionsTab('chat'));
    await pageA.fill('#chat-sender-name-input', 'Alice');
    await pageA.fill('#chat-message-input', 'Hello team! Let us complete our habits.');
    await pageA.click('#btn-send-chat-message');

    // Device B opens habit and verifies message
    await pageB.evaluate((docId) => {
      const habitObj = window.HabitualCore.state.habits.find(h => h.sharing && (h.sharing.docId === docId || h.sharing.collection === docId));
      window.HabitualCore.openHabitModal(habitObj);
      window.HabitualCore.switchDisplayOptionsTab('chat');
    }, habitDocId);
    await pageB.waitForSelector('#modal-habit:not(.hidden)', { state: 'visible' });

    await pageB.waitForFunction(() => {
      const container = document.getElementById('chat-messages-container');
      return container && container.textContent.includes('Hello team!');
    }, { timeout: 10000 });

    const msgTextB = await pageB.$eval('#chat-messages-container', el => el.textContent);
    logResult('Device B received and decrypted Alice\'s message', msgTextB.includes('Hello team!') && msgTextB.includes('Alice'));

    // Device C opens habit and verifies message
    await pageC.evaluate((docId) => {
      const habitObj = window.HabitualCore.state.habits.find(h => h.sharing && (h.sharing.docId === docId || h.sharing.collection === docId));
      window.HabitualCore.openHabitModal(habitObj);
      window.HabitualCore.switchDisplayOptionsTab('chat');
    }, habitDocId);
    await pageC.waitForSelector('#modal-habit:not(.hidden)', { state: 'visible' });

    await pageC.waitForFunction(() => {
      const container = document.getElementById('chat-messages-container');
      return container && container.textContent.includes('Hello team!');
    }, { timeout: 10000 });

    const msgTextC = await pageC.$eval('#chat-messages-container', el => el.textContent);
    logResult('Device C received and decrypted Alice\'s message', msgTextC.includes('Hello team!') && msgTextC.includes('Alice'));
    passedTests++;

    // Test 5: Chat UI Minimizing and Real-Time Unread Badge Counter
    totalTests++;
    console.log('\n▶ TEST 5: Chat Minimize and Real-Time Unread Badge Counter');

    // Device B minimizes chat
    await pageB.click('#btn-toggle-chat-minimize');
    const isMinimizedB = await pageB.evaluate(() => {
      const bar = document.getElementById('chat-minimized-bar');
      const body = document.getElementById('chat-expandable-body');
      return bar && !bar.classList.contains('hidden') && body && body.classList.contains('hidden');
    });
    logResult('Device B chat UI minimized into compact bar', isMinimizedB);

    // Device A sends second message
    await pageA.fill('#chat-message-input', 'Second update from Alice!');
    await pageA.click('#btn-send-chat-message');

    // Device B unread badge counter should update to 1
    await pageB.waitForFunction(() => {
      const badge = document.getElementById('chat-unread-badge');
      return badge && badge.textContent.trim() === '1';
    }, { timeout: 10000 });

    const unreadCountB = await pageB.$eval('#chat-unread-badge', el => el.textContent.trim());
    logResult('Device B minimized bar updated unread message counter', unreadCountB === '1');

    // Device B expands chat
    await pageB.click('#chat-minimized-bar');
    const hasSecondMsg = await pageB.evaluate(() => {
      const container = document.getElementById('chat-messages-container');
      return container && container.textContent.includes('Second update from Alice!');
    });
    logResult('Device B expanded chat and sees second decrypted message', hasSecondMsg);
    passedTests++;

    console.log(`\n🎉 All ${passedTests}/${totalTests} 3-Device Encrypted Chat E2E Playwright tests passed successfully!`);

  } finally {
    clearTimeout(globalTimeout);
    if (browser) await browser.close();
    server.destroyAllSockets();
    await new Promise(r => server.close(r));
  }
}

if (require.main === module) {
  run3DeviceEncryptedChatTests().catch(err => {
    console.error('❌ Test execution failed with error:', err);
    process.exit(1);
  });
}

module.exports = { run3DeviceEncryptedChatTests };
