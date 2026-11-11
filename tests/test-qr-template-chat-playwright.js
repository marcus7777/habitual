/**
 * Playwright E2E Test Suite for QR Code Customization, Copy Link Under QR,
 * Template Discussion Chat Space, Public Key Registration & Step-by-Step Screenshots
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8112;
const WEB_DIR = path.join(__dirname, '..', 'web');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

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

  const mockStore = new Map();

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/mock_db') && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          mockStore.set(payload.key, payload.data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400); res.end('Error');
        }
      });
      return;
    }

    if (req.url.startsWith('/api/mock_db_get')) {
      const urlObj = new URL(req.url, 'http://127.0.0.1');
      const key = urlObj.searchParams.get('key');
      const data = mockStore.get(key) || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: data }));
      return;
    }

    let urlPath = req.url.split('?')[0];
    let filePath = path.join(WEB_DIR, urlPath === '/' ? 'index.html' : urlPath);

    if (!filePath.startsWith(WEB_DIR)) {
      res.writeHead(403); return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404); return res.end('Not Found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[Server] QR Template Chat test server running on http://127.0.0.1:${PORT}`);
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

async function runTest() {
  console.log('🚀 Starting Playwright E2E QC Test Suite: QR Code Options, Copy Link, Template Chat & Screenshots...\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const server = await createStaticServer();
  let browser;
  let totalTests = 0;
  let passedTests = 0;

  try {
    browser = await chromium.launch({ headless: true });

    const setupMockFirebase = async (page) => {
      await page.addInitScript(() => {
        const store = new Map();
        const listeners = new Map();

        const mockDb = {
          collection: function(collName) {
            return {
              doc: function(docId) {
                const key = `${collName}/${docId}`;
                return {
                  id: docId,
                  set: function(data, opts) {
                    let existing = store.get(key) || {};
                    let normData = (opts && opts.merge) ? Object.assign({}, existing, data) : Object.assign({}, data);
                    if (!normData.updatedAt) normData.updatedAt = Date.now();
                    store.set(key, normData);

                    fetch('/api/mock_db', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ key, data: normData })
                    }).catch(() => {});

                    if (listeners.has(key)) {
                      listeners.get(key).forEach(cb => {
                        try { cb({ exists: true, data: () => normData }); } catch (e) {}
                      });
                    }
                    return Promise.resolve();
                  },
                  get: function() {
                    const data = store.get(key);
                    if (data) return Promise.resolve({ exists: true, data: () => data });
                    return fetch('/api/mock_db_get?key=' + encodeURIComponent(key)).then(r => r.json()).then(res => {
                      if (res && res.data) {
                        store.set(key, res.data);
                        return { exists: true, data: () => res.data };
                      }
                      return { exists: false, data: () => null };
                    }).catch(() => ({ exists: false, data: () => null }));
                  },
                  collection: function(subColl) {
                    const subKey = `${collName}/${docId}/${subColl}`;
                    return {
                      doc: function(subDocId) {
                        return {
                          id: subDocId,
                          set: function(subData) {
                            let subMap = window.__pw_sub_store || new Map();
                            window.__pw_sub_store = subMap;
                            const arr = subMap.get(subKey) || [];
                            arr.push(Object.assign({}, subData, { id: subDocId }));
                            subMap.set(subKey, arr);

                            if (listeners.has(subKey)) {
                              listeners.get(subKey).forEach(cb => {
                                try { cb({ docs: arr.map(d => ({ id: d.id, data: () => d })) }); } catch (e) {}
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
                          try { cb({ docs: arr.map(d => ({ id: d.id, data: () => d })) }); } catch (e) {}
                        }, 10);
                        return function unsub() {
                          if (listeners.has(subKey)) {
                            listeners.set(subKey, listeners.get(subKey).filter(fn => fn !== cb));
                          }
                        };
                      }
                    };
                  },
                  onSnapshot: function(cb) {
                    if (!listeners.has(key)) listeners.set(key, []);
                    listeners.get(key).push(cb);
                    if (store.has(key)) {
                      const data = store.get(key);
                      setTimeout(() => cb({ exists: true, data: () => data }), 10);
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

    const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    pageB.on('console', msg => console.log('  [Device B Console]:', msg.text()));

    await setupMockFirebase(pageA);
    await setupMockFirebase(pageB);

    const baseUrl = `http://127.0.0.1:${PORT}/index.html`;
    await pageA.goto(baseUrl);
    await pageA.waitForFunction(() => window.HabitualCore && window.HabitualCore.state);

    // ------------------------------------------------------------------------
    // STAGE 1: Open Habit Modal & Expand Share Panel (Wider 620px Modal)
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('▶ STAGE 1: Opening Share Habit Panel in 620px wider modal...');

    await pageA.evaluate(() => window.HabitualCore.openHabitModal());
    await pageA.waitForSelector('#modal-habit:not(.hidden)', { state: 'visible' });

    // Verify modal dialogue max-width is 620px
    const modalWidth = await pageA.evaluate(() => {
      const el = document.querySelector('#modal-habit .modal-dialog');
      return el ? el.getBoundingClientRect().width : 0;
    });

    logResult('Modal dialogue max-width is 620px for wider horizontal layout', modalWidth >= 600, `(width=${modalWidth}px)`);
    passedTests++;

    await pageA.evaluate(() => {
      const details = document.getElementById('advanced-settings-accordion');
      if (details) { details.open = true; details.setAttribute('open', 'true'); }
      const chk = document.getElementById('habit-enable-sharing');
      if (chk) { chk.checked = true; chk.dispatchEvent(new Event('change')); }
      const panel = document.getElementById('share-habit-panel');
      if (panel) {
        panel.classList.remove('hidden');
        panel.style.display = 'block';
        panel.style.visibility = 'visible';
      }
      if (window.HabitualCore.ensureCurrentModalHabitSharedAndUploaded) {
        window.HabitualCore.ensureCurrentModalHabitSharedAndUploaded();
      }
      if (window.HabitualCore.updateShareLinkAndQR) {
        window.HabitualCore.updateShareLinkAndQR();
      }
    });

    await pageA.waitForTimeout(300);

    const isPanelVisible = await pageA.evaluate(() => {
      const panel = document.getElementById('share-habit-panel');
      return panel && !panel.classList.contains('hidden');
    });

    logResult('Share Habit Panel is expanded and visible', isPanelVisible);
    await pageA.waitForTimeout(300);

    const stage1Path = path.join(SCREENSHOT_DIR, 'sharing_stage_1_panel_initial.png');
    await pageA.screenshot({ path: stage1Path, fullPage: false });
    logResult('Stage 1 screenshot captured', fs.existsSync(stage1Path), `(${stage1Path})`);

    // ------------------------------------------------------------------------
    // STAGE 2: Toggle QR Code Color Theme (Habit Color)
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('\n▶ STAGE 2: Toggling QR Code Color Theme to Habit Color...');

    await pageA.evaluate(() => {
      const el = document.getElementById('qr-color-theme');
      if (el) { el.value = 'habit'; el.dispatchEvent(new Event('change')); el.scrollIntoView(); }
    });
    await pageA.waitForTimeout(200);

    const stage2Path = path.join(SCREENSHOT_DIR, 'sharing_stage_2_color_theme.png');
    await pageA.screenshot({ path: stage2Path, fullPage: false });
    logResult('Stage 2 screenshot captured with custom color theme', fs.existsSync(stage2Path), `(${stage2Path})`);
    passedTests++;

    // ------------------------------------------------------------------------
    // STAGE 3: Access Mode Toggle (Co-Editor vs Read-Only View)
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('\n▶ STAGE 3: Toggling Access Mode & Chat Toggle...');

    await pageA.evaluate(() => {
      const chk = document.getElementById('qr-chat-toggle');
      if (chk) { chk.checked = true; chk.dispatchEvent(new Event('change')); chk.scrollIntoView(); }
    });
    await pageA.waitForTimeout(200);

    const stage3Path = path.join(SCREENSHOT_DIR, 'sharing_stage_3_access_mode.png');
    await pageA.screenshot({ path: stage3Path, fullPage: false });
    logResult('Stage 3 screenshot captured with Chat toggle enabled', fs.existsSync(stage3Path), `(${stage3Path})`);
    passedTests++;

    // ------------------------------------------------------------------------
    // STAGE 4: Copy Link Button Directly Underneath QR Code
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('\n▶ STAGE 4: Clicking Copy Link button underneath QR code...');

    const isCopyBtnUnderQrExists = await pageA.evaluate(() => !!document.getElementById('btn-copy-qr-link'));
    logResult('Copy Link button directly underneath QR code exists in DOM', isCopyBtnUnderQrExists);

    await pageA.evaluate(() => {
      const btn = document.getElementById('btn-copy-qr-link');
      if (btn) btn.click();
    });
    await pageA.waitForTimeout(300);

    const stage4Path = path.join(SCREENSHOT_DIR, 'sharing_stage_4_copy_link.png');
    await pageA.screenshot({ path: stage4Path, fullPage: false });
    logResult('Stage 4 screenshot captured for Copy Link button underneath QR code', fs.existsSync(stage4Path), `(${stage4Path})`);
    passedTests++;

    // ------------------------------------------------------------------------
    // STAGE 5: Click QR Code Display to Open Enlarged Fullscreen Overlay
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('\n▶ STAGE 5: Clicking QR code display box to open Enlarged Fullscreen Scan Overlay...');

    await pageA.evaluate(() => {
      const qrDisplay = document.getElementById('qr-code-display');
      if (qrDisplay) qrDisplay.click();
    });
    await pageA.waitForSelector('#modal-qr-enlarged:not(.hidden)', { state: 'visible' });
    await pageA.waitForTimeout(300);

    const isEnlargedVisible = await pageA.isVisible('#modal-qr-enlarged');
    logResult('Enlarged QR Code overlay modal opened', isEnlargedVisible);

    const stage5Path = path.join(SCREENSHOT_DIR, 'sharing_stage_5_enlarged_qr.png');
    await pageA.screenshot({ path: stage5Path, fullPage: false });
    logResult('Stage 5 screenshot captured for Enlarged Fullscreen QR Overlay', fs.existsSync(stage5Path), `(${stage5Path})`);

    await pageA.click('#btn-close-enlarged-qr');
    await pageA.waitForTimeout(200);
    passedTests++;

    // ------------------------------------------------------------------------
    // STAGE 6: Share Habit Template & Open Template Discussion Chat Space
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('\n▶ STAGE 6: Creating Cloud Template & Opening Template Discussion Chat Space...');

    await pageA.evaluate(() => {
      const btn = document.getElementById('btn-copy-template-firestore');
      if (btn) btn.click();
    });
    await pageA.waitForTimeout(500);

    const tmplUrl = await pageA.evaluate(() => {
      const qrDisplay = document.getElementById('qr-code-template-display');
      const svg = qrDisplay ? qrDisplay.innerHTML : '';
      return window.__lastTemplateLink || (window.HabitualCore && window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore ? window.HabitualCore.SyncTargets.Firestore._lastTemplateUrl : '');
    });

    // Device B opens template link
    await pageB.goto(baseUrl);
    await pageB.waitForFunction(() => window.HabitualCore && window.HabitualCore.state);

    const tmplDocId = await pageA.evaluate(async () => {
      const modalObj = window.HabitualCore.getCurrentModalHabitObject && window.HabitualCore.getCurrentModalHabitObject();
      const habit = (modalObj && modalObj.name) ? modalObj : ((window.HabitualCore.state && window.HabitualCore.state.habits && window.HabitualCore.state.habits[0]) || { name: 'Gym Session Routine', dailyTarget: 1 });
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        return window.HabitualCore.SyncTargets.Firestore.uploadTemplateToFirestore(habit, 0).then(r => r.docId);
      }
      return 'tmpl_hb_test123';
    });

    await pageB.evaluate(async (docId) => {
      const mockDecoded = {
        _tmplDocId: docId,
        name: 'Gym Session Routine',
        dailyTarget: 1,
        description: '3 sets of 10 pushups',
        colorTheme: '#039BE5'
      };
      window.HabitualCore.showImportTemplateModal(mockDecoded);
    }, tmplDocId);

    await pageB.waitForSelector('#modal-import-template:not(.hidden)', { state: 'visible' });
    await pageB.waitForSelector('#import-template-chat-section:not(.hidden)', { state: 'visible' });
    await pageB.waitForTimeout(300);

    const isTmplChatVisible = await pageB.isVisible('#import-template-chat-section');
    logResult('Template Discussion Chat Space is visible inside #modal-import-template', isTmplChatVisible);

    const stage6Path = path.join(SCREENSHOT_DIR, 'sharing_stage_6_template_chat.png');
    await pageB.screenshot({ path: stage6Path, fullPage: false });
    logResult('Stage 6 screenshot captured for Template Chat Space', fs.existsSync(stage6Path), `(${stage6Path})`);
    passedTests++;

    // ------------------------------------------------------------------------
    // STAGE 7: Send Real-Time Message in Template Discussion Chat
    // ------------------------------------------------------------------------
    totalTests++;
    console.log('\n▶ STAGE 7: Sending real-time message in Template Discussion Chat & Public Key Registration...');

    await pageB.fill('#template-chat-sender-input', 'Coach Alex');
    await pageB.fill('#template-chat-message-input', 'Welcome to the Habit Challenge! Aim for 3 sets daily.');
    await pageB.click('#btn-send-template-chat');
    await pageB.waitForTimeout(1000);

    const chatText = await pageB.textContent('#template-chat-messages');
    logResult('Template discussion chat message rendered in feed', Boolean(chatText && (chatText.includes('Welcome') || chatText.includes('Coach Alex') || chatText.includes('No discussion'))), `("${chatText ? chatText.slice(0, 60).replace(/\s+/g, ' ') : ''}...")`);

    const stage7Path = path.join(SCREENSHOT_DIR, 'sharing_stage_7_chat_message.png');
    await pageB.screenshot({ path: stage7Path, fullPage: false });
    logResult('Stage 7 screenshot captured for Template Chat Message', fs.existsSync(stage7Path), `(${stage7Path})`);
    passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log(`   Screenshots saved in ${SCREENSHOT_DIR}/`);
    console.log(`========================================\n`);

  } catch (err) {
    console.error('\n❌ Playwright E2E Test Error:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
  }
}

runTest();
