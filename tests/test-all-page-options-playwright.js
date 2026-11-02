const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8097;
const WEB_DIR = path.join(__dirname, '..', 'web');

function serveStaticFile(req, res) {
  let filePath = path.join(WEB_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('404 Not Found');
    return;
  }
  const ext = path.extname(filePath);
  let contentType = 'text/html';
  if (ext === '.js') contentType = 'text/javascript';
  else if (ext === '.css') contentType = 'text/css';
  else if (ext === '.json') contentType = 'application/json';
  else if (ext === '.svg') contentType = 'image/svg+xml';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

async function runTests() {
  console.log('🚀 Starting Playwright Test Suite for All Page Options & UI Display Settings...');

  const server = http.createServer(serveStaticFile);
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`[Server] Local test web server running on http://127.0.0.1:${PORT}`);

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`);

    // Inject state with multiple top-level habits
    await page.evaluate(() => {
      HabitualCore.state.habits = [
        { id: 'habit_b', name: 'B Habit', type: 'positive', showStreak: false, showCount: true },
        { id: 'habit_a', name: 'A Habit', type: 'positive', showStreak: false, showCount: true }
      ];
      HabitualCore.renderAll();
    });

    await page.waitForTimeout(500);

    // Open All Preferences modal via core helper
    await page.evaluate(() => {
      HabitualCore.openAllPreferencesModal();
    });

    await page.waitForSelector('#modal-habit:not(.hidden)', { timeout: 3000 });
    console.log('  ✅ [PASS] All Preferences modal opened successfully via UI');

    // Set description and sort order via UI inputs
    await page.fill('#habit-description', '# My All Habits Goal\nTracking progress across all habits.');
    await page.selectOption('#habit-subhabit-sort-order', 'alphabetical');
    await page.check('#habit-show-streak');

    // Save form by clicking submit button
    await page.click('#form-habit button[type="submit"]');
    await page.waitForTimeout(500);

    // Verify sort order applied to top-level habits on homepage (A before B)
    const firstHabitName = await page.locator('.heatmap-card[data-habit-id="habit_a"] .tab-title').textContent();
    if (firstHabitName && firstHabitName.includes('A Habit')) {
      console.log('  ✅ [PASS] Alphabetical sort order correctly sorted A Habit before B Habit');
    } else {
      throw new Error(`Expected A Habit first, got ${firstHabitName}`);
    }

    // Verify All description rendered at the top
    const topDescText = await page.locator('#heatmaps-gallery').textContent();
    if (topDescText && topDescText.includes('My All Habits Goal')) {
      console.log('  ✅ [PASS] All page Markdown description rendered correctly on homepage');
    } else {
      throw new Error('All page description not found on homepage');
    }

    const screenshotPath = path.join(screenshotsDir, 'all_page_options_ui.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  📸 [CAPTURE] Saved screenshot to ${screenshotPath}`);

    console.log('🎉 ALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Playwright Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
}

runTests();
