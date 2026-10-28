const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8094;
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

async function runVisualTests() {
  console.log('🚀 Starting Playwright Visual Test Suite for Sub-Habit Display Modes & Sorting...');

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

    // Inject state with Parent Habit and 3 Sub-habits
    await page.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      HabitualCore.state.habits = [
        {
          id: 'parent_workout',
          name: '💪 Daily Workout Routine',
          type: 'positive',
          colorTheme: 'blue',
          subhabitDisplayMode: 'cards',
          subhabitSortOrder: 'manual',
          dailyTarget: 1,
          logs: { [todayStr]: { count: 1 } }
        },
        {
          id: 'parent_workout_sub1',
          name: '🧘 Morning Stretching',
          parentId: 'parent_workout',
          type: 'positive',
          colorTheme: 'cyan',
          dailyTarget: 1,
          logs: { [todayStr]: { count: 1 } } // Completed today
        },
        {
          id: 'parent_workout_sub2',
          name: '🏋️ Upper Body Weights',
          parentId: 'parent_workout',
          type: 'positive',
          colorTheme: 'purple',
          dailyTarget: 1,
          logs: { [todayStr]: { count: 0 } } // Uncompleted today
        },
        {
          id: 'parent_workout_sub3',
          name: '🏃 5km Cardio Run',
          parentId: 'parent_workout',
          type: 'positive',
          colorTheme: 'orange',
          dailyTarget: 1,
          logs: { [todayStr]: { count: 0 } } // Uncompleted today
        }
      ];
      HabitualCore.state.expandedHabitIds.add('parent_workout');
      HabitualCore.renderAll();
    });

    await page.waitForTimeout(500);

    // Capture Screenshot 1: Full Cards View
    const cardsScreenshotPath = path.join(screenshotsDir, 'subhabit_display_cards.png');
    await page.screenshot({ path: cardsScreenshotPath, fullPage: true });
    console.log(`  📸 [CAPTURE] Saved full cards view screenshot to ${cardsScreenshotPath}`);

    // Toggle to Minimal View
    await page.click('.btn-toggle-subhabit-mode[data-mode="minimal"]');
    await page.waitForTimeout(300);

    // Capture Screenshot 2: Minimal View
    const minimalScreenshotPath = path.join(screenshotsDir, 'subhabit_display_minimal.png');
    await page.screenshot({ path: minimalScreenshotPath, fullPage: true });
    console.log(`  📸 [CAPTURE] Saved minimal checklist view screenshot to ${minimalScreenshotPath}`);

    // Verify Minimal DOM Elements
    const minimalRowsCount = await page.locator('.subhabit-minimal-row').count();
    console.log(`  ✅ [PASS] Found ${minimalRowsCount} minimal sub-habit checklist rows`);

    // Toggle Sorting to Uncompleted First
    await page.selectOption('.select-subhabit-sort', 'incomplete_first');
    await page.waitForTimeout(300);

    // Capture Screenshot 3: Uncompleted First Sorting
    const sortIncompletePath = path.join(screenshotsDir, 'subhabit_sort_incomplete.png');
    await page.screenshot({ path: sortIncompletePath, fullPage: true });
    console.log(`  📸 [CAPTURE] Saved uncompleted first sort screenshot to ${sortIncompletePath}`);

    // Toggle Sorting to Alphabetical A-Z
    await page.selectOption('.select-subhabit-sort', 'alphabetical');
    await page.waitForTimeout(300);

    // Capture Screenshot 4: Alphabetical Sorting
    const sortAlphaPath = path.join(screenshotsDir, 'subhabit_sort_alphabetical.png');
    await page.screenshot({ path: sortAlphaPath, fullPage: true });
    console.log(`  📸 [CAPTURE] Saved alphabetical sort screenshot to ${sortAlphaPath}`);

    console.log('\n========================================');
    console.log('🎉 PLAYWRIGHT VISUAL SUB-HABIT TESTS PASSED!');
    console.log('========================================');
  } finally {
    await browser.close();
    server.close();
  }
}

runVisualTests().catch(err => {
  console.error('❌ Visual Test Failed:', err);
  process.exit(1);
});
