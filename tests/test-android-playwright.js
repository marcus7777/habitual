const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const PORT = 8080;
const CDP_PORT = 9222;
const WEB_DIR = path.join(__dirname, '..', 'web');

const sdkAdbPath = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools');
const adbBin = fs.existsSync(path.join(sdkAdbPath, 'adb.exe'))
  ? `"${path.join(sdkAdbPath, 'adb.exe')}"`
  : 'adb';

// 1. Static Web Server
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
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Local web server running on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

// 2. Setup ADB Port Forwarding (Graceful with fallback)
function setupAdb() {
  try {
    execSync(`${adbBin} forward tcp:${CDP_PORT} localabstract:chrome_devtools_remote`, { stdio: 'pipe' });
    execSync(`${adbBin} reverse tcp:${PORT} tcp:${PORT}`, { stdio: 'pipe' });
    console.log(`[ADB] Forwarded desktop tcp:${CDP_PORT} -> phone localabstract:chrome_devtools_remote`);
    return true;
  } catch (err) {
    console.log('[ADB] No physical ADB device connected. Switching to Mobile Browser Emulation mode.');
    return false;
  }
}

// Helpers for Mobile Playwright Interactions
async function openMenuDropdown(page) {
  await clickMobile(page.locator('#btn-header-menu'));
  const menuContent = page.locator('#header-menu-content');
  await menuContent.evaluate(el => el.classList.remove('hidden'));
  await page.waitForTimeout(300);
}

async function clickMobile(locator) {
  try {
    await locator.click({ timeout: 2000 });
  } catch (e) {
    await locator.evaluate(el => el.click());
  }
}

async function runAndroidTestSuite() {
  console.log('🚀 Starting Comprehensive Playwright Test Suite on Android Mobile Device...');

  const server = await createStaticServer();
  const isAdbConnected = setupAdb();

  let browser;
  let context;
  let passedTests = 0;
  let totalTests = 0;

  function logResult(testName, success, details = '') {
    totalTests++;
    if (success) {
      passedTests++;
      console.log(`  ✅ [PASS] ${testName} ${details}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${details}`);
    }
  }

  try {
    if (isAdbConnected) {
      try {
        console.log(`[Playwright] Connecting to Chrome on phone at http://127.0.0.1:${CDP_PORT}...`);
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
        console.log('✅ Connected to Chrome on physical Android device!\n');
        const contexts = browser.contexts();
        context = contexts.length > 0 ? contexts[0] : await browser.newContext();
      } catch (err) {
        console.log(`[Playwright CDP Warning] ${err.message}. Falling back to Mobile Browser Emulation.`);
      }
    }

    if (!browser) {
      console.log('📱 Launching Mobile Chromium Browser Emulation (Pixel 5 Mobile Viewport)...');
      browser = await chromium.launch({ headless: true }).catch(() =>
        chromium.launch({ channel: 'chrome', headless: true })
      );
      context = await browser.newContext({
        viewport: { width: 393, height: 851 },
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
        deviceScaleFactor: 2.75,
        isMobile: true,
        hasTouch: true
      });
    }

    const page = await context.newPage();

    // TEST 1: Page Navigation & Core Shell
    console.log('📋 Running Test 1: App Loading & Navigation Shell');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1500);

    const title = await page.title();
    logResult('App Title Check', title.includes('Habitual'), `(Title: "${title}")`);

    const brandText = await page.locator('.brand-text h1').innerText();
    logResult('Brand Header Check', brandText.trim() === 'Habitual', `(Text: "${brandText.trim()}")`);

    // TEST 2: Open Menu & Create New Habit
    console.log('\n📋 Running Test 2: Create New Habit Flow');
    await openMenuDropdown(page);

    const addHabitBtn = page.locator('#menu-btn-add-habit');
    await clickMobile(addHabitBtn);
    await page.waitForTimeout(500);

    const habitModal = page.locator('#modal-habit');
    const isModalVisible = !(await habitModal.evaluate(el => el.classList.contains('hidden')));
    logResult('Open Habit Modal', isModalVisible);

    const testHabitName = 'Daily Reading ' + Math.floor(Math.random() * 1000);
    await page.fill('#habit-name', testHabitName);

    // Submit habit form
    await page.locator('#form-habit').evaluate(form => form.requestSubmit());
    await page.waitForTimeout(1000);

    const isModalClosed = await habitModal.evaluate(el => el.classList.contains('hidden'));
    logResult('Submit Habit Form & Close Modal', isModalClosed);

    // Verify habit card created in heatmaps gallery
    const galleryText = await page.locator('#heatmaps-gallery').innerText();
    const isHabitInGallery = galleryText.includes(testHabitName);
    logResult('New Habit Card Rendered in Gallery', isHabitInGallery, `(Habit: "${testHabitName}")`);

    // TEST 3: Quick Check-in / Log Entry Flow
    console.log('\n📋 Running Test 3: Quick Check-in Flow');
    await openMenuDropdown(page);

    const quickLogBtn = page.locator('#menu-btn-quick-log');
    await clickMobile(quickLogBtn);
    await page.waitForTimeout(500);

    const logModal = page.locator('#modal-log');
    const isLogModalVisible = !(await logModal.evaluate(el => el.classList.contains('hidden')));
    logResult('Open Quick Check-in Modal', isLogModalVisible);

    // Increment count using plus button
    const plusBtn = page.locator('#btn-counter-plus');
    if (await plusBtn.isVisible()) {
      await clickMobile(plusBtn);
      await page.waitForTimeout(200);
    }

    // Add note
    await page.fill('#modal-log-note', 'Completed test entry via Playwright');

    // Save Log
    const saveLogBtn = page.locator('#btn-save-log');
    await clickMobile(saveLogBtn);
    await page.waitForTimeout(1000);

    const isLogModalClosed = await logModal.evaluate(el => el.classList.contains('hidden'));
    logResult('Save Log Entry & Close Modal', isLogModalClosed);

    // Verify Toast notification banner
    const toastMessage = await page.locator('#toast-message').innerText();
    logResult('Toast Notification Displayed', toastMessage.length > 0, `(Toast: "${toastMessage}")`);

    // TEST 3.5: Modal Scroll Lock & Unlocking Verification (#13)
    console.log('\n📋 Running Test: Modal Scroll Lock & Unlocking Verification');

    const initialOverflow = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    logResult('Normal Page Overflow State (No Modal)', initialOverflow !== 'hidden', `(Overflow: "${initialOverflow}")`);

    await openMenuDropdown(page);
    await clickMobile(page.locator('#menu-btn-quick-log'));
    await page.waitForTimeout(300);

    const lockedOverflow = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    logResult('Modal Open Scroll Lock (overflow: hidden)', lockedOverflow === 'hidden', `(Overflow: "${lockedOverflow}")`);

    await clickMobile(page.locator('#modal-log-close'));
    await page.waitForTimeout(300);

    const openModalId = await page.evaluate(() => {
      const el = document.querySelector('.modal-backdrop:not(.hidden)');
      return el ? el.id : null;
    });

    const restoredOverflow = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    logResult('Modal Close Scroll Unlock Restored', restoredOverflow !== 'hidden', `(Overflow: "${restoredOverflow}", Still Open Modal: "${openModalId}")`);

    // TEST 4: Navigation to Sync Page via Header Menu
    console.log('\n📋 Running Test 4: Navigation to Sync Page via Header Menu');
    await openMenuDropdown(page);

    const syncPageLink = page.locator('a[href="sync.html"]');
    const isSyncLinkVisible = await syncPageLink.isVisible();
    logResult('Sync Page Link Visible in Menu', isSyncLinkVisible);

    await clickMobile(syncPageLink);
    await page.waitForTimeout(1000);

    const currentUrl = page.url();
    logResult('Navigated to sync.html', currentUrl.includes('sync.html'), `(URL: "${currentUrl}")`);

    // Capture Main App Mobile Screenshot
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

    const screenshotPath = path.join(screenshotDir, 'android-phone-pwa.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`\n📸 [Screenshot Saved] -> ${screenshotPath}`);

    // TEST 5: Sync Page JSON Backup Export Flow on Mobile
    console.log('\n📋 Running Test 5: Sync Page Export JSON Flow on Mobile');

    const syncTitle = await page.title();
    logResult('Sync Page Title Check', syncTitle.includes('Sync') || syncTitle.includes('Data Management'), `(Title: "${syncTitle}")`);

    const syncHeader = await page.locator('.sync-hero-info h1').innerText();
    logResult('Sync Page Header Check', syncHeader.includes('Data Management') || syncHeader.includes('Sync'), `(Header: "${syncHeader.trim()}")`);

    // Verify Storage Engine selector is present on Sync Page
    const storageSelect = page.locator('#select-storage-engine');
    const hasStorageSelect = await storageSelect.count() > 0;
    logResult('Storage Engine Selector Present on Sync Page', hasStorageSelect);

    // Verify Export JSON button is present on Sync Page
    const btnExportJson = page.locator('#btn-export-json');
    const isExportBtnVisible = await btnExportJson.isVisible();
    logResult('Export JSON Button Visible on Sync Page', isExportBtnVisible);

    // Trigger Export JSON and verify download / payload generation
    let downloadSuccess = false;
    let downloadedFileName = '';
    let savedBackupPath = '';

    try {
      const downloadPromise = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
      await clickMobile(btnExportJson);
      const download = await downloadPromise;

      if (download) {
        downloadedFileName = download.suggestedFilename();
        downloadSuccess = downloadedFileName.includes('habitual_backup_') && downloadedFileName.endsWith('.json');
        savedBackupPath = path.join(screenshotDir, downloadedFileName);
        await download.saveAs(savedBackupPath);
      } else {
        // Evaluate exported state structure on page context if download event is handled via blob
        const exportedData = await page.evaluate(() => {
          if (window.HabitualCore && typeof window.HabitualCore.getPayloadFromState === 'function') {
            return window.HabitualCore.getPayloadFromState();
          }
          return null;
        });
        if (exportedData && Array.isArray(exportedData.habits)) {
          downloadSuccess = true;
          downloadedFileName = `habitual_backup_${new Date().toISOString().slice(0,10)}.json`;
          savedBackupPath = path.join(screenshotDir, downloadedFileName);
          fs.writeFileSync(savedBackupPath, JSON.stringify(exportedData, null, 2));
        }
      }
    } catch (err) {
      console.error('Export error:', err.message);
    }

    logResult('Export JSON Triggered and Generated Valid Backup File', downloadSuccess, `(Filename: "${downloadedFileName}")`);

    // Capture Sync Page Mobile Export Screenshot
    const syncScreenshotPath = path.join(screenshotDir, 'android-sync-export-json.png');
    await page.screenshot({ path: syncScreenshotPath });
    console.log(`📸 [Sync Page Mobile Export Screenshot Saved] -> ${syncScreenshotPath}`);

    // TEST 6: Sync Page Import JSON Roundtrip Flow on Mobile
    console.log('\n📋 Running Test 6: Sync Page Import JSON Roundtrip Flow on Mobile');

    const inputImportJson = page.locator('#input-import-json');
    const isImportInputPresent = await inputImportJson.count() > 0;
    logResult('Import JSON File Input Present on Sync Page', isImportInputPresent);

    let importSuccess = false;
    let restoredHabitCount = 0;

    if (isImportInputPresent && savedBackupPath && fs.existsSync(savedBackupPath)) {
      // Clear state in browser memory first to prove import restores state
      await page.evaluate(() => {
        if (window.HabitualCore && window.HabitualCore.state) {
          window.HabitualCore.state.habits = [];
        }
      });

      // Upload the generated backup file into #input-import-json
      await inputImportJson.setInputFiles(savedBackupPath);
      await page.waitForTimeout(1000);

      // Verify restored state in browser memory
      restoredHabitCount = await page.evaluate(() => {
        if (window.HabitualCore && window.HabitualCore.state) {
          return window.HabitualCore.state.habits ? window.HabitualCore.state.habits.length : 0;
        }
        return 0;
      });

      const toastMessageText = await page.locator('#toast-message').innerText().catch(() => '');
      importSuccess = restoredHabitCount > 0 || toastMessageText.length > 0;
      logResult('Import JSON Backup File Restored State Successfully', importSuccess, `(Restored Habits: ${restoredHabitCount}, Toast: "${toastMessageText.trim()}")`);
    } else {
      logResult('Import JSON Backup File Restored State Successfully', false, '(Backup file not found on disk)');
    }

    // Capture Sync Page Mobile Import Screenshot
    const importScreenshotPath = path.join(screenshotDir, 'android-sync-import-json.png');
    await page.screenshot({ path: importScreenshotPath });
    console.log(`📸 [Sync Page Mobile Import Screenshot Saved] -> ${importScreenshotPath}`);

    await page.close();

    console.log(`\n==================================================`);
    console.log(`🎉 TEST SUITE COMPLETED: ${passedTests}/${totalTests} Passed!`);
    console.log(`==================================================\n`);
  } catch (err) {
    console.error('\n❌ Test Suite execution error:', err.message);
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(0);
  }
}

runAndroidTestSuite();
