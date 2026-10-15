/**
 * Playwright E2E Test Suite for Multi-Device Sync & Habit Deletion propagation
 * Verifies:
 * 1. Device 1 (Regular context) and Device 2 (Incognito / Private context) connected via Sync Code & Passphrase.
 * 2. Creating a habit on Device 1 automatically syncs to Device 2.
 * 3. Deleting that habit on Device 1 automatically propagates deletion to Device 2.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8089;
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
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[Server] Local test web server running on http://127.0.0.1:${PORT}`);
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

async function runMultiDeviceSyncPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Multi-Device Sync & Habit Deletion Propagation...\n');

  const server = await createStaticServer();
  const browser = await chromium.launch({ headless: true })
    .catch(() => chromium.launch({ channel: 'chrome', headless: true }))
    .catch(() => chromium.launch({ channel: 'msedge', headless: true }));

  let passedTests = 0;
  let totalTests = 0;

  try {
    // Context 1: Device 1 (Regular Context)
    // Context 2: Device 2 (Private / Incognito Context with isolated Storage & Cookies)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Auto-accept confirmation dialogs on both devices
    page1.on('dialog', dialog => dialog.accept());
    page2.on('dialog', dialog => dialog.accept());

    const SYNC_CODE = 'test_code_multidevice_' + Date.now();
    const PASSPHRASE = 'Passphrase_Secure_123!';
    const HABIT_NAME = 'Shared Habit To Delete ' + Math.floor(Math.random() * 1000);

    // STEP 1: Load Device 1 & Setup Live Sync Channel
    console.log('📱 STEP 1: Setting up Device 1 (Regular Context)...');
    await page1.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page1.waitForLoadState('domcontentloaded');

    // Configure Live Sync settings on Device 1
    await page1.evaluate(({ code, pass }) => {
      localStorage.setItem('habitual_firestore_sync_code', code);
      localStorage.setItem('habitual_sync_passphrase', pass);
      localStorage.setItem('habitual_sync_targets', JSON.stringify(['firestore']));
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      window.HabitualCore.SyncManager.settings.passphrase = pass;
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.startLiveSync();
      }
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    // Create a new habit on Device 1
    let createdHabitId = null;
    await page1.evaluate((name) => {
      window.HabitualCore.openHabitModal();
      const nameInput = document.getElementById('habit-name');
      if (nameInput) nameInput.value = name;
      window.HabitualCore.handleHabitFormSubmit();
    }, HABIT_NAME);

    await page1.waitForTimeout(500);

    const device1HasHabit = await page1.evaluate((name) => {
      const h = window.HabitualCore.state.habits.find(x => x.name === name);
      return h ? h.id : null;
    }, HABIT_NAME);

    createdHabitId = device1HasHabit;
    totalTests++;
    logResult('Device 1 Created Habit', Boolean(device1HasHabit), `(Habit ID: ${createdHabitId})`);
    passedTests++;

    // STEP 2: Load Device 2 (Incognito) & Connect to same Sync Code
    console.log('\n🕵️ STEP 2: Setting up Device 2 (Private / Incognito Context)...');
    await page2.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page2.waitForLoadState('domcontentloaded');

    await page2.evaluate(({ code, pass }) => {
      localStorage.setItem('habitual_firestore_sync_code', code);
      localStorage.setItem('habitual_sync_passphrase', pass);
      localStorage.setItem('habitual_sync_targets', JSON.stringify(['firestore']));
      window.HabitualCore.SyncManager.settings.enabledTargets = ['firestore'];
      window.HabitualCore.SyncManager.settings.passphrase = pass;
      if (window.HabitualCore.SyncTargets && window.HabitualCore.SyncTargets.Firestore) {
        window.HabitualCore.SyncTargets.Firestore.startLiveSync();
      }
    }, { code: SYNC_CODE, pass: PASSPHRASE });

    // Wait for live sync to propagate to Device 2
    let syncedToDevice2 = false;
    for (let i = 0; i < 20; i++) {
      await page2.waitForTimeout(300);
      syncedToDevice2 = await page2.evaluate((id) => {
        return window.HabitualCore.state.habits.some(h => h.id === id);
      }, createdHabitId);
      if (syncedToDevice2) break;
    }

    totalTests++;
    logResult('Device 2 Received Synced Habit', syncedToDevice2, `(Habit: "${HABIT_NAME}")`);
    passedTests++;

    // STEP 3: Delete Habit on Device 1
    console.log('\n🗑️ STEP 3: Deleting Habit on Device 1...');
    await page1.evaluate((id) => {
      window.HabitualCore.deleteHabit(id);
    }, createdHabitId);

    await page1.waitForTimeout(500);

    const device1Deleted = await page1.evaluate((id) => {
      return !window.HabitualCore.state.habits.some(h => h.id === id);
    }, createdHabitId);

    totalTests++;
    logResult('Habit Removed from Device 1 UI & State', device1Deleted);
    passedTests++;

    // STEP 4: Verify Deletion Sync on Device 2
    console.log('\n🔄 STEP 4: Verifying Automatic Deletion Sync on Device 2 (Incognito Context)...');
    let device2Deleted = false;
    for (let i = 0; i < 25; i++) {
      await page2.waitForTimeout(300);
      device2Deleted = await page2.evaluate((id) => {
        return !window.HabitualCore.state.habits.some(h => h.id === id);
      }, createdHabitId);
      if (device2Deleted) break;
    }

    totalTests++;
    logResult('Habit Automatically Deleted on Device 2 via Sync', device2Deleted);
    passedTests++;

    console.log(`\n========================================`);
    console.log(`🎉 MULTI-DEVICE SYNC TEST PASSED: ${passedTests}/${totalTests} Passed!`);
    console.log(`========================================\n`);

  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

runMultiDeviceSyncPlaywrightTests().catch((err) => {
  console.error('\n❌ Multi-Device Sync Playwright Test Failed:', err);
  process.exit(1);
});
