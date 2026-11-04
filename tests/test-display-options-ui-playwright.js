const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8098;
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

async function runDisplayOptionsTests() {
  console.log('🚀 Starting Playwright UI Test Suite for Display Options & Cascading...');

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

    // TEST CASE 1: Setting Parent Habit Display Options & Sort Order via UI
    await page.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      HabitualCore.state.habits = [
        { id: 'parent_health', name: '💪 Health & Fitness', type: 'positive', dailyTarget: 1, logs: { [todayStr]: { count: 1 } } },
        { id: 'sub_water', name: 'B Water', parentId: 'parent_health', type: 'positive', dailyTarget: 1, logs: { [todayStr]: { count: 1 } } },
        { id: 'sub_sleep', name: 'A Sleep', parentId: 'parent_health', type: 'positive', dailyTarget: 1, logs: { [todayStr]: { count: 0 } } }
      ];
      HabitualCore.state.expandedHabitIds.add('parent_health');
      HabitualCore.renderAll();
    });

    await page.waitForTimeout(500);

    // Open Parent Habit Edit Modal
    await page.evaluate(() => {
      const parent = HabitualCore.state.habits.find(h => h.id === 'parent_health');
      HabitualCore.openHabitModal(parent);
    });

    await page.waitForSelector('#modal-habit:not(.hidden)', { timeout: 3000 });
    console.log('  ✅ [PASS] Parent Habit Modal opened successfully');

    // Check parent display options
    await page.check('#habit-show-streak');

    // Switch to Sub-Habits tab for sub-habit options & sort order
    await page.click('#tab-btn-subhabit-options');
    await page.check('#subhabit-show-streak');
    await page.check('#subhabit-show-duration');
    await page.selectOption('#habit-subhabit-sort-order', 'alphabetical');

    // Click save
    await page.click('#form-habit button[type="submit"]');
    await page.waitForTimeout(500);

    // Verify parent and sub-habits display options were updated in state
    const subWaterState = await page.evaluate(() => HabitualCore.state.habits.find(h => h.id === 'sub_water'));
    const subSleepState = await page.evaluate(() => HabitualCore.state.habits.find(h => h.id === 'sub_sleep'));

    if (subWaterState && subWaterState.showStreak === true && subWaterState.showDuration === true) {
      console.log('  ✅ [PASS] Display options (Streak & Duration) successfully cascaded to sub_water');
    } else {
      throw new Error(`sub_water failed display options cascade: streak=${subWaterState?.showStreak}, duration=${subWaterState?.showDuration}`);
    }

    if (subSleepState && subSleepState.showStreak === true && subSleepState.showDuration === true) {
      console.log('  ✅ [PASS] Display options (Streak & Duration) successfully cascaded to sub_sleep');
    } else {
      throw new Error(`sub_sleep failed display options cascade: streak=${subSleepState?.showStreak}, duration=${subSleepState?.showDuration}`);
    }

    // Verify sub-habits rendered in alphabetical order in DOM (sub_sleep "A Sleep" before sub_water "B Water")
    const subCards = page.locator('.subhabits-concertina[data-parent-id="parent_health"] .heatmap-card');
    const firstSubText = await subCards.nth(0).locator('.tab-title').textContent();
    if (firstSubText && firstSubText.includes('A Sleep')) {
      console.log('  ✅ [PASS] Alphabetical sort order correctly reordered sub-habits in DOM rendering');
    } else {
      throw new Error(`Expected 'A Sleep' first in sub-habits, got: ${firstSubText}`);
    }

    const screenshotPath = path.join(screenshotsDir, 'display_options_ui_test.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  📸 [CAPTURE] Saved screenshot to ${screenshotPath}`);

    console.log('🎉 ALL DISPLAY OPTIONS PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Playwright Display Options Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
}

runDisplayOptionsTests();
