/**
 * Playwright E2E Test Suite for Habitual Share & Firestore Sync Round-Trip
 * Verifies:
 * 1. Sharing a habit generates collection ID & password and uploads payload to Firestore.
 * 2. Opening a clean `#share?col=...&pwd=...` URL in a new browser context loads habit name, colors, sub-habits, and heatmap card from Firestore.
 * 3. AES-256-GCM E2EE decryption integrity.
 * 4. Error banner display when opening an invalid share link.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8088;
const WEB_DIR = path.join(__dirname, '..', 'web');

// 1. Local Static Server Setup
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
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[Server] Local test web server running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

async function runShareRoundTripPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Shared Habit Round-Trip...\n');

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

    // --- STEP 1: Create and Share a Habit in User Context 1 ---
    console.log('📌 STEP 1: Creating & Sharing Habit in User Context 1...');
    await page1.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page1.waitForFunction(() => window.HabitualCore && typeof window.HabitualCore.shareHabitDirectly === 'function');

    // Seed test parent habit and sub-habit into core.state
    const shareInfo = await page1.evaluate(async () => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();

      const parentHabit = {
        id: 'pw_share_parent',
        name: 'Playwright Workout Goal',
        type: 'positive',
        description: 'Complete daily exercise',
        category: 'Health',
        colorTheme: '#1088ac',
        dailyTarget: 2,
        logs: { [today]: { count: 2, note: 'Morning gym session' } }
      };

      const childHabit = {
        id: 'pw_share_child',
        parentId: 'pw_share_parent',
        name: 'Playwright Pushups Subtask',
        type: 'positive',
        dailyTarget: 25,
        colorTheme: '#39d353',
        logs: { [today]: { count: 25, note: '25 pushups' } }
      };

      core.state.habits = [parentHabit, childHabit];

      // Setup Mock Firestore Store in browser
      const mockStore = new Map();
      core.SyncTargets.Firestore.db = {
        collection: function(col) {
          return {
            doc: function(docId) {
              const autoId = docId || ('shared_hb_' + Math.random().toString(36).substring(2, 10));
              return {
                id: autoId,
                set: function(data) {
                  mockStore.set(`${col}_${autoId}`, data);
                  window.__pw_mockStore = mockStore;
                  return Promise.resolve();
                },
                get: function() {
                  const data = (window.__pw_mockStore || mockStore).get(`${col}_${autoId}`);
                  return Promise.resolve({
                    exists: !!data,
                    data: function() { return data; }
                  });
                }
              };
            }
          };
        }
      };

      // Trigger sharing on parent habit
      core.shareHabitDirectly('pw_share_parent');

      // Wait for E2EE encryption & upload
      await core.SyncTargets.Firestore.uploadPerHabitBackup(parentHabit);

      const col = parentHabit.sharing ? (parentHabit.sharing.docId || parentHabit.sharing.collection) : '';
      const pwd = parentHabit.sharing ? parentHabit.sharing.password : '';
      const docKey = `share_${col}`;
      const docUploaded = (window.__pw_mockStore || mockStore).has(docKey);
      const rawCipher = docUploaded ? (window.__pw_mockStore || mockStore).get(docKey).ciphertext : null;

      return { col, pwd, docUploaded, rawCipher, parentName: parentHabit.name };
    });

    assert(shareInfo.col && shareInfo.col.startsWith('shared_hb_'), 'Generated collection ID stored in habit sharing state');
    assert(shareInfo.pwd && shareInfo.pwd.length >= 10, 'Generated passphrase stored in habit sharing state');
    assert(shareInfo.docUploaded === true, 'Habit payload encrypted & uploaded to Firestore collection');
    assert(shareInfo.rawCipher && shareInfo.rawCipher.startsWith('ENC:'), 'Payload encrypted with AES-256-GCM algorithm');


    // --- STEP 2: Open Share URL in User Context 2 (Simulate Second User) ---
    console.log('\n📌 STEP 2: Opening Share Link in User Context 2...');
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await context2.newPage();

    const shareUrl = `http://127.0.0.1:${PORT}/index.html#share?col=${encodeURIComponent(shareInfo.col)}&pwd=${encodeURIComponent(shareInfo.pwd)}`;

    await page2.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => window.HabitualCore && typeof window.HabitualCore.checkURLHashForSharedHabit === 'function');

    // Transfer mock Firestore store into User Context 2 page
    await page2.evaluate(({ col, rawCipher }) => {
      const core = window.HabitualCore;
      const mockStore = new Map();
      mockStore.set(`share_${col}`, { ciphertext: rawCipher });

      core.SyncTargets.Firestore.db = {
        collection: function(c) {
          return {
            doc: function(docId) {
              const autoId = docId || col;
              return {
                id: autoId,
                get: function() {
                  const data = mockStore.get(`${c}_${autoId}`);
                  return Promise.resolve({
                    exists: !!data,
                    data: function() { return data; }
                  });
                }
              };
            }
          };
        }
      };

      // Trigger Hash Check
      core.checkURLHashForSharedHabit();
    }, { col: shareInfo.col, rawCipher: shareInfo.rawCipher });

    await page2.waitForTimeout(300);

    const modalVisible = await page2.isVisible('#modal-import-shared-habit');
    assert(modalVisible, 'Join Shared Habit modal opens automatically');

    const modalTitleText = await page2.textContent('#import-shared-habit-name');
    assert(modalTitleText.includes('Playwright Workout Goal'), 'Habit name loaded dynamically from Firestore document');

    const previewContainerVisible = await page2.isVisible('#import-shared-habit-heatmap-container');
    assert(previewContainerVisible, 'Heatmap preview container displayed');

    const subhabitsText = await page2.textContent('#import-shared-habit-subhabits-preview');
    assert(subhabitsText.includes('Playwright Pushups Subtask'), 'Sub-habit loaded and displayed in preview card');

    // Confirm Join
    await page2.click('#btn-confirm-import-shared');
    await page2.waitForTimeout(100);

    const isModalClosed = await page2.isHidden('#modal-import-shared-habit');
    assert(isModalClosed, 'Join Shared Habit modal closed on confirmation');

    const joinedState = await page2.evaluate(() => {
      const core = window.HabitualCore;
      const joinedHabit = core.state.habits.find(h => h.sharing && h.sharing.enabled);
      const joinedChild = core.state.habits.find(h => h.parentId);
      return {
        habitFound: !!joinedHabit,
        habitName: joinedHabit ? joinedHabit.name : '',
        col: joinedHabit && joinedHabit.sharing ? joinedHabit.sharing.collection : '',
        childFound: !!joinedChild,
        childName: joinedChild ? joinedChild.name : ''
      };
    });

    assert(joinedState.habitFound, 'Shared habit saved locally to IndexedDB/LocalStorage state');
    assert(joinedState.col === shareInfo.col, 'Firestore collection ID linked in recipient local storage');
    assert(joinedState.childFound && joinedState.childName === 'Playwright Pushups Subtask', 'Sub-habit imported & linked locally');


    // --- STEP 3: Test Error Handling for Invalid Share Link in Context 3 ---
    console.log('\n📌 STEP 3: Testing Error Handling for Invalid Share Link...');
    const context3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page3 = await context3.newPage();

    const invalidUrl = `http://127.0.0.1:${PORT}/index.html#share?col=invalid_col_999&pwd=invalid_pass_999`;
    await page3.goto(invalidUrl, { waitUntil: 'domcontentloaded' });
    await page3.waitForTimeout(300);

    await page3.evaluate(() => {
      const core = window.HabitualCore;
      core.SyncTargets.Firestore.downloadPerHabitBackup = function() {
        return Promise.resolve(null); // Simulate undecryptable or missing Firestore document
      };
      core.checkURLHashForSharedHabit();
    });

    await page3.waitForTimeout(150);

    const errorMsgText = await page3.textContent('#import-shared-habit-logs-info');
    assert(errorMsgText.includes('Could not load habit from Firestore'), 'Explicit error message shown when Firestore load fails');


    // --- STEP 4: Opening Share Link for an Already Existing Habit in Context 2 ---
    console.log('\n📌 STEP 4: Re-opening Share Link for Already Existing Habit in Context 2...');
    await page2.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(300);

    await page2.evaluate(({ col }) => {
      const core = window.HabitualCore;
      core.checkURLHashForSharedHabit();
    }, { col: shareInfo.col });

    await page2.waitForTimeout(150);

    const reOpenedModalVisible = await page2.isVisible('#modal-import-shared-habit');
    assert(!reOpenedModalVisible, 'Modal preview is skipped when re-opening share link for existing habit');

    const currentUrlHash = await page2.evaluate(() => window.location.hash);
    assert(currentUrlHash.startsWith('#/habit/'), 'Redirected directly to habit page view (#/habit/...)');

  } catch (err) {
    console.error('Fatal Playwright Test Error:', err);
  } finally {
    if (browser) await browser.close();
    server.close();
    console.log(`\n📊 Playwright Test Results: ${passed}/${total} passed.`);
    process.exit(passed === total ? 0 : 1);
  }
}

runShareRoundTripPlaywrightTests();
