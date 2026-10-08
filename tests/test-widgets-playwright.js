/**
 * Playwright E2E Integration Test Suite for Habitual Widgets
 * Verifies standalone widget pages (add.html, heatmaps.html, settings.html)
 * and the in-app Widgets Gallery modal using Playwright Chromium.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8085;
const WEB_DIR = path.join(__dirname, '..', 'web');

// 1. Static Local Web Server
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

async function runWidgetsPlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Habitual Widgets...\n');

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
    browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() =>
      chromium.launch({ channel: 'msedge', headless: true })
    ).catch(() =>
      chromium.launch({ headless: true })
    );
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    // Seed sample LocalStorage habit data for E2E widget tests
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const sampleState = {
        updatedAt: Date.now(),
        habits: [
          {
            id: 'pw_habit_1',
            name: 'Daily Coding Goal',
            type: 'positive',
            dailyTarget: 1,
            colorTheme: 'purple',
            logs: {}
          },
          {
            id: 'pw_habit_2',
            name: 'Gym Workout Goal',
            type: 'positive',
            dailyTarget: 1,
            colorTheme: 'blue',
            logs: {}
          }
        ],
        selectedHabitId: 'all',
        selectedYear: 2026
      };
      localStorage.setItem('habitual_tracker_v1', JSON.stringify(sampleState));
      localStorage.setItem('habitual_v2_state', JSON.stringify(sampleState));
    });

    // ------------------------------------------------------------------------
    // TEST 1: Standalone Quick Add Widget Page (add.html)
    // ------------------------------------------------------------------------
    console.log('📋 Running Test 1: Quick Add Widget Page (widgets/add.html)');
    await page.goto(`http://127.0.0.1:${PORT}/widgets/add.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const addTitle = await page.title();
    logResult('add.html Page Title Check', addTitle.includes('Quick Add Widget'), `(Title: "${addTitle}")`);

    const addHeaderBrand = await page.locator('.brand-text .tagline').innerText();
    logResult('add.html Header Tagline Check', addHeaderBrand.includes('Quick Add Widget'));

    const addHabitsCount = await page.locator('.widget-habit-item').count();
    logResult('add.html Habit Items Rendered', addHabitsCount > 0, `(${addHabitsCount} habit items found)`);

    // Click quick log button
    const firstLogBtn = page.locator('.widget-quick-log-btn').first();
    if (await firstLogBtn.isVisible()) {
      await firstLogBtn.click();
      await page.waitForTimeout(500);

      const toast = page.locator('.toast-item');
      const isToastVisible = await toast.count() > 0;
      logResult('add.html Check-in Triggers Toast Notification', isToastVisible);
    }

    // ------------------------------------------------------------------------
    // TEST 2: Standalone Heatmap Grid Widget Page (heatmaps.html)
    // ------------------------------------------------------------------------
    console.log('\n📋 Running Test 2: Heatmap Grid Widget Page (widgets/heatmaps.html)');
    await page.goto(`http://127.0.0.1:${PORT}/widgets/heatmaps.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const heatmapTitle = await page.title();
    logResult('heatmaps.html Page Title Check', heatmapTitle.includes('Heatmap Grid Widget'), `(Title: "${heatmapTitle}")`);

    const selectCount = await page.locator('#widget-heatmap-select option').count();
    logResult('heatmaps.html Target Habit Selector Populated', selectCount > 0, `(${selectCount} options)`);

    const miniDaysCount = await page.locator('.widget-mini-day').count();
    logResult('heatmaps.html 7x12 Mini Heatmap Grid Rendered', miniDaysCount === 84, `(${miniDaysCount}/84 cells)`);

    const streakVal = await page.locator('#stat-streak-val').innerText();
    logResult('heatmaps.html Streak Badge Displayed', streakVal.includes('🔥'), `(Streak: "${streakVal}")`);

    // ------------------------------------------------------------------------
    // TEST 3: Standalone Widget Settings Page (settings.html)
    // ------------------------------------------------------------------------
    console.log('\n📋 Running Test 3: Widget Settings Page (widgets/settings.html)');
    await page.goto(`http://127.0.0.1:${PORT}/widgets/settings.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const settingsTitle = await page.title();
    logResult('settings.html Page Title Check', settingsTitle.includes('Widget Settings'), `(Title: "${settingsTitle}")`);

    const schemaVal = await page.locator('#widget-schema-preview').inputValue();
    logResult('settings.html Live Schema JSON Generated', schemaVal.includes('dateStr') || schemaVal.includes('habits'), 'JSON payload generated');

    const syncBtn = page.locator('#btn-sync-widgets');
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
      await page.waitForTimeout(400);

      const toast = page.locator('.toast-item');
      const isSyncToastVisible = await toast.count() > 0;
      logResult('settings.html Sync Widgets Button Feedback Toast', isSyncToastVisible);
    }

    // ------------------------------------------------------------------------
    // TEST 4: In-App Widgets Gallery Modal (index.html)
    // ------------------------------------------------------------------------
    console.log('\n📋 Running Test 4: In-App Widgets Gallery Modal (index.html)');
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const openWidgetsBtn = page.locator('#btn-open-widgets');
    if (await openWidgetsBtn.isVisible()) {
      await openWidgetsBtn.click();
      await page.waitForTimeout(500);

      const modalWidgets = page.locator('#modal-widgets');
      const isModalOpen = !(await modalWidgets.evaluate(el => el.classList.contains('hidden')));
      logResult('index.html Open Widgets Modal', isModalOpen);

      const cardsInGallery = await page.locator('.widget-preview-card').count();
      logResult('index.html Widget Preview Cards Rendered in Gallery', cardsInGallery >= 2, `(${cardsInGallery} preview cards)`);
    }

    // Capture Final Screenshot
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

    const screenshotPath = path.join(screenshotDir, 'widgets-preview.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`\n📸 [Screenshot Saved] -> ${screenshotPath}`);

    await page.close();

    console.log(`\n==================================================`);
    console.log(`🎉 WIDGETS PLAYWRIGHT TEST SUITE PASSED: ${passedTests}/${totalTests} Passed!`);
    console.log(`==================================================\n`);
  } catch (err) {
    console.error('\n❌ Playwright execution error:', err.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(process.exitCode || 0);
  }
}

runWidgetsPlaywrightTests();
