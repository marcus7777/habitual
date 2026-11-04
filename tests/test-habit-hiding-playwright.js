const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8099;
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

async function runHabitHidingTests() {
  console.log('🚀 Starting Playwright Test Suite for Habit Circumstantial Hiding Options...');

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

    // TEST 1: Geohash Encoder Unit Test in Browser Environment
    const testGeohash = await page.evaluate(() => HabitualCore.encodeGeohash(51.5074, -0.1278, 7));
    if (typeof testGeohash === 'string' && testGeohash.length === 7) {
      console.log(`  ✅ [PASS] 7-character geohash encoder output verified: ${testGeohash}`);
    } else {
      throw new Error(`Invalid geohash output: ${testGeohash}`);
    }

    // TEST 2: Circumstantial Hiding Rules Setup & Modal Navigation
    await page.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      HabitualCore.state.habits = [
        { id: 'parent_routine', name: '🌅 Morning Routine', type: 'positive', dailyTarget: 1, logs: {} },
        { id: 'sub_brush', name: '🪥 Brush Teeth', parentId: 'parent_routine', type: 'positive', dailyTarget: 1, logs: { [todayStr]: { count: 1 } } },
        { id: 'sub_stretch', name: '🧘 Stretch', parentId: 'parent_routine', type: 'positive', dailyTarget: 1, logs: { [todayStr]: { count: 1 } } },
        { id: 'habit_work', name: '💻 Deep Work', type: 'positive', dailyTarget: 1, hideWhenCompleted: true, logs: {} }
      ];
      HabitualCore.renderAll();
    });

    await page.waitForTimeout(500);

    // Open Modal for 'Deep Work'
    await page.evaluate(() => {
      const h = HabitualCore.state.habits.find(item => item.id === 'habit_work');
      HabitualCore.openHabitModal(h);
    });

    await page.waitForSelector('#modal-habit:not(.hidden)', { timeout: 3000 });
    console.log('  ✅ [PASS] Habit Edit Modal opened successfully');

    // Switch to Hiding Rules tab
    await page.click('#tab-btn-hiding-options');
    await page.waitForSelector('#tab-content-hiding-options:not(.hidden)', { timeout: 2000 });
    console.log('  ✅ [PASS] Switched to 🙈 Hiding Rules tab in edit dialogue');

    // Enable Prerequisite Habit / Sub-habits Rule: Hide until 2 sub-habits of Morning Routine are completed
    await page.check('#habit-hide-dep-enabled');
    await page.selectOption('#habit-hide-dep-target-id', 'parent_routine');
    await page.selectOption('#habit-hide-dep-criterion', 'subhabits_completed');
    await page.fill('#habit-hide-dep-count', '2');

    // Enable Time of Day rule
    await page.check('#habit-hide-time-enabled');
    await page.selectOption('#habit-hide-time-mode', 'before');
    await page.fill('#habit-hide-time-start', '08:00');

    // Save Habit
    await page.click('#form-habit button[type="submit"]');
    await page.waitForTimeout(500);

    // TEST 3: Verify Rule Evaluation (shouldHideHabit)
    const ruleResult = await page.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      const habitWork = HabitualCore.state.habits.find(h => h.id === 'habit_work');
      return {
        hideBefore8am: HabitualCore.shouldHideHabit(habitWork, todayStr, '07:30'),
        showAfter8am: HabitualCore.shouldHideHabit(habitWork, todayStr, '09:00')
      };
    });

    if (ruleResult.hideBefore8am === true && ruleResult.showAfter8am === false) {
      console.log('  ✅ [PASS] Time of Day hiding rule correctly evaluated (hidden before 08:00, visible at 09:00)');
    } else {
      throw new Error(`Time of day rule evaluation failed: ${JSON.stringify(ruleResult)}`);
    }

    // TEST 4: Hide when Completed Today Rule
    await page.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      const habitWork = HabitualCore.state.habits.find(h => h.id === 'habit_work');
      habitWork.logs[todayStr] = { count: 1 };
      HabitualCore.renderAll();
    });

    await page.waitForTimeout(500);

    const isHiddenWhenCompleted = await page.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      const habitWork = HabitualCore.state.habits.find(h => h.id === 'habit_work');
      return HabitualCore.shouldHideHabit(habitWork, todayStr);
    });

    if (isHiddenWhenCompleted === true) {
      console.log('  ✅ [PASS] "Hide when Completed Today" rule correctly hid completed habit');
    } else {
      throw new Error('Expected habit to be hidden when completed today');
    }

    // TEST 5: Header Menu Dynamic Visibility & Global Override Toggle
    const isMenuToggleVisible = await page.evaluate(() => {
      const el = document.getElementById('menu-toggle-show-hidden-container');
      return el && !el.classList.contains('hidden');
    });

    if (isMenuToggleVisible) {
      console.log('  ✅ [PASS] "Show Hidden Habits" context menu option dynamically appeared when habits are hidden');
    } else {
      throw new Error('Expected "Show Hidden Habits" context menu option to be visible');
    }

    // Click "Show Hidden Habits" banner button
    await page.click('#btn-show-hidden-override');
    await page.waitForTimeout(500);

    const isShowingOverride = await page.evaluate(() => HabitualCore.state.showHiddenOverride);
    if (isShowingOverride === true) {
      console.log('  ✅ [PASS] Global override "Show Hidden Habits" activated successfully');
    } else {
      throw new Error('Expected showHiddenOverride to be true');
    }

    const screenshotPath = path.join(screenshotsDir, 'habit_hiding_ui_test.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  📸 [CAPTURE] Saved screenshot to ${screenshotPath}`);

    console.log('🎉 ALL HABIT CIRCUMSTANTIAL HIDING PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Playwright Habit Hiding Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
}

runHabitHidingTests();
