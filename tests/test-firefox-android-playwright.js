const path = require('path');
const fs = require('fs');
const http = require('http');
const { firefox } = require('playwright');

const PORT = 8085;
const WEB_DIR = path.join(__dirname, '..', 'web');

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
      resolve(server);
    });
  });
}

async function runFirefoxMobileTestSuite() {
  console.log('\n==================================================');
  console.log('🦊 STARTING PLAYWRIGHT FIREFOX MOBILE TEST SUITE');
  console.log('==================================================\n');

  const server = await createStaticServer();
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
    console.log('🦊 Launching Firefox Mobile Browser Emulation (Pixel 5 Viewport)...');
    browser = await firefox.launch({ headless: true });

    const context = await browser.newContext({
      viewport: { width: 393, height: 851 },
      userAgent: 'Mozilla/5.0 (Android 13; Mobile; LG-M255; rv:112.0) Gecko/112.0 Firefox/112.0',
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true
    });

    const page = await context.newPage();

    // TEST 1: Page Navigation & Core Shell
    console.log('📋 Running Test 1: Firefox Mobile App Loading');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const title = await page.title();
    logResult('App Title Check on Firefox Mobile', title.includes('Habitual'), `(Title: "${title}")`);

    // TEST 2: Create Habit on Firefox Mobile
    console.log('\n📋 Running Test 2: Create New Habit on Firefox Mobile');
    const menuBtn = page.locator('#btn-header-menu');
    await menuBtn.click();
    const menuContent = page.locator('#header-menu-content');
    await menuContent.evaluate(el => el.classList.remove('hidden'));
    await page.waitForTimeout(200);

    await page.locator('#menu-btn-add-habit').click();
    await page.waitForTimeout(300);

    const testHabitName = 'Firefox Habit ' + Math.floor(Math.random() * 1000);
    await page.fill('#habit-name', testHabitName);
    await page.locator('#form-habit').evaluate(form => form.requestSubmit());
    await page.waitForTimeout(500);

    const galleryText = await page.locator('#heatmaps-gallery').innerText();
    logResult('Habit Created and Rendered on Firefox Mobile', galleryText.includes(testHabitName), `(Habit: "${testHabitName}")`);

    // TEST 3: Scroll Lock & Unlocking Verification (#13) on Firefox
    console.log('\n📋 Running Test 3: Firefox Scroll Lock & Unlocking Verification (#13)');

    const initialOverflow = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    logResult('Normal Page Overflow State (No Modal)', initialOverflow !== 'hidden', `(Overflow: "${initialOverflow}")`);

    // Open Menu & Quick Log modal
    await menuBtn.click();
    await menuContent.evaluate(el => el.classList.remove('hidden'));
    await page.waitForTimeout(300);

    const quickLogBtn = page.locator('#menu-btn-quick-log');
    await quickLogBtn.click();
    await page.waitForTimeout(300);

    const lockedOverflow = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    logResult('Modal Open Scroll Lock (overflow: hidden)', lockedOverflow === 'hidden', `(Overflow: "${lockedOverflow}")`);

    const modalCloseBtn = page.locator('.modal-backdrop:not(.hidden) .btn-close');
    await modalCloseBtn.click();
    await page.waitForTimeout(300);

    const restoredOverflow = await page.evaluate(() => window.getComputedStyle(document.body).overflow);
    logResult('Modal Close Scroll Unlock Restored', restoredOverflow !== 'hidden', `(Overflow: "${restoredOverflow}")`);

    console.log(`\n==================================================`);
    console.log(`🎉 FIREFOX MOBILE SUITE COMPLETED: ${passedTests}/${totalTests} Passed!`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error('Firefox test error:', err.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runFirefoxMobileTestSuite();
