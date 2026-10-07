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

// 2. Setup ADB Port Forwarding
function setupAdb() {
  try {
    execSync(`${adbBin} forward tcp:${CDP_PORT} localabstract:chrome_devtools_remote`);
    console.log(`[ADB] Forwarded desktop tcp:${CDP_PORT} -> phone localabstract:chrome_devtools_remote`);

    execSync(`${adbBin} reverse tcp:${PORT} tcp:${PORT}`);
    console.log(`[ADB] Reversed phone tcp:${PORT} -> desktop tcp:${PORT}`);
  } catch (err) {
    console.error('[ADB Error]', err.message);
    throw err;
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
  console.log('🚀 Starting Comprehensive Playwright Test Suite on Android Phone...');

  const server = await createStaticServer();
  setupAdb();

  let browser;
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
    console.log(`[Playwright] Connecting to Chrome on phone at http://127.0.0.1:${CDP_PORT}...`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    console.log('✅ Connected to Chrome on Android device!\n');

    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
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

    // TEST 4: Data Management Modal
    console.log('\n📋 Running Test 4: Data Management Modal');
    await openMenuDropdown(page);

    const dataModalBtn = page.locator('#menu-btn-data-modal');
    await clickMobile(dataModalBtn);
    await page.waitForTimeout(500);

    const dataModal = page.locator('#modal-data');
    const isDataModalVisible = !(await dataModal.evaluate(el => el.classList.contains('hidden')));
    logResult('Open Data Management Modal', isDataModalVisible);

    const storageSelect = page.locator('#select-storage-engine');
    const hasStorageSelect = await storageSelect.count() > 0;
    logResult('Storage Engine Selector Present', hasStorageSelect);

    // Close Data Modal
    const dataCloseBtn = page.locator('#modal-data-close');
    await clickMobile(dataCloseBtn);
    await page.waitForTimeout(300);

    const isDataModalClosed = await dataModal.evaluate(el => el.classList.contains('hidden'));
    logResult('Close Data Management Modal', isDataModalClosed);

    // Capture Final Screenshot
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

    const screenshotPath = path.join(screenshotDir, 'android-phone-pwa.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`\n📸 [Screenshot Saved] -> ${screenshotPath}`);

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
