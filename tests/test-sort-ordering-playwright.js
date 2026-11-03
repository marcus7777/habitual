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

async function runTests() {
  console.log('🚀 Starting Comprehensive Playwright E2E Test Suite for Sort Ordering & Reorder Controls...');

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

    // --- TEST 1: Main List Manual Sorting & Reorder Arrows ---
    console.log('🧪 TEST 1: Main List Manual Mode Reorder Arrows...');
    await page.evaluate(() => {
      HabitualCore.state.allPreferences = { sortOrder: 'manual', sortReverse: false };
      HabitualCore.state.habits = [
        { id: 'h_zebra', name: 'Zebra Habit', type: 'positive', dailyTarget: 1, logs: {} },
        { id: 'h_apple', name: 'Apple Habit', type: 'positive', dailyTarget: 1, logs: {} },
        { id: 'h_banana', name: 'Banana Habit', type: 'positive', dailyTarget: 1, logs: {} }
      ];
      HabitualCore.renderAll();
    });
    await page.waitForTimeout(300);

    let moveBtnsCount = await page.locator('.btn-move-up, .btn-move-down').count();
    if (moveBtnsCount > 0) {
      console.log(`  ✅ [PASS] Manual mode displays reorder arrows on main list (${moveBtnsCount} arrow buttons found)`);
    } else {
      throw new Error('Expected move buttons in manual mode, found 0');
    }

    // --- TEST 2: Main List Alphabetical Sorting ---
    console.log('🧪 TEST 2: Main List Alphabetical Mode...');
    await page.evaluate(() => {
      HabitualCore.state.allPreferences.sortOrder = 'alphabetical';
      HabitualCore.state.allPreferences.sortReverse = false;
      HabitualCore.renderAll();
    });
    await page.waitForTimeout(300);

    let habitTitles = await page.locator('.heatmap-card:not([data-habit-id="all"]) .tab-title').allTextContents();
    let names = habitTitles.map(t => t.trim());
    if (names[0] === 'Apple Habit' && names[1] === 'Banana Habit' && names[2] === 'Zebra Habit') {
      console.log('  ✅ [PASS] Alphabetical mode orders habits: Apple -> Banana -> Zebra');
    } else {
      throw new Error(`Expected Apple -> Banana -> Zebra, got ${names.join(', ')}`);
    }

    moveBtnsCount = await page.locator('.btn-move-up, .btn-move-down').count();
    if (moveBtnsCount === 0) {
      console.log('  ✅ [PASS] Auto-sort (alphabetical) mode hides reorder arrows on main list');
    } else {
      throw new Error(`Expected 0 reorder arrows in auto-sort mode, found ${moveBtnsCount}`);
    }

    // --- TEST 3: Main List Alphabetical Reverse Sorting ---
    console.log('🧪 TEST 3: Main List Alphabetical Reverse Mode...');
    await page.evaluate(() => {
      HabitualCore.state.allPreferences.sortOrder = 'alphabetical';
      HabitualCore.state.allPreferences.sortReverse = true;
      HabitualCore.renderAll();
    });
    await page.waitForTimeout(300);

    habitTitles = await page.locator('.heatmap-card:not([data-habit-id="all"]) .tab-title').allTextContents();
    names = habitTitles.map(t => t.trim());
    if (names[0] === 'Zebra Habit' && names[1] === 'Banana Habit' && names[2] === 'Apple Habit') {
      console.log('  ✅ [PASS] Reverse Alphabetical mode orders habits: Zebra -> Banana -> Apple');
    } else {
      throw new Error(`Expected Zebra -> Banana -> Apple, got ${names.join(', ')}`);
    }

    // --- TEST 4: Main List Incomplete First Sorting & Dynamic DOM Re-sorting on Check-in ---
    console.log('🧪 TEST 4: Main List Incomplete First Mode & Dynamic Check-in Re-sorting...');
    await page.evaluate(() => {
      HabitualCore.state.allPreferences.sortOrder = 'incomplete_first';
      HabitualCore.state.allPreferences.sortReverse = false;
      const today = HabitualCore.getTodayKey();
      // Initially, Apple is completed (count = 1), Banana & Zebra are uncompleted (count = 0)
      HabitualCore.state.habits[1].logs[today] = { count: 1 }; // Apple completed
      HabitualCore.renderAll();
    });
    await page.waitForTimeout(300);

    habitTitles = await page.locator('.heatmap-card:not([data-habit-id="all"]) .tab-title').allTextContents();
    names = habitTitles.map(t => t.trim());
    // Uncompleted habits (Banana, Zebra) come before completed (Apple)
    if (names[0] === 'Banana Habit' && names[1] === 'Zebra Habit' && names[2] === 'Apple Habit') {
      console.log('  ✅ [PASS] Incomplete First mode places uncompleted (Banana, Zebra) before completed (Apple)');
    } else {
      throw new Error(`Expected Banana -> Zebra -> Apple, got ${names.join(', ')}`);
    }

    // Now complete Banana via quick log button
    const bananaCard = page.locator('.heatmap-card[data-habit-id="h_banana"]');
    await bananaCard.locator('.btn-card-quick-log').click();
    await page.waitForTimeout(300);

    habitTitles = await page.locator('.heatmap-card:not([data-habit-id="all"]) .tab-title').allTextContents();
    names = habitTitles.map(t => t.trim());
    // Zebra (only uncompleted) should now be first!
    if (names[0] === 'Zebra Habit') {
      console.log('  ✅ [PASS] Logging check-in dynamically updated DOM order to keep uncompleted (Zebra) first');
    } else {
      throw new Error(`Expected Zebra Habit first after completing Banana, got ${names.join(', ')}`);
    }

    // --- TEST 5: Sub-Habit Auto-Sort & Manual Mode ---
    console.log('🧪 TEST 5: Sub-Habit Sorting & Reorder Controls...');
    await page.evaluate(() => {
      HabitualCore.state.allPreferences.sortOrder = 'manual';
      HabitualCore.state.expandedHabitIds = new Set(['parent_1']);
      HabitualCore.state.habits = [
        {
          id: 'parent_1', name: 'Parent Habit', type: 'positive', dailyTarget: 1, logs: {},
          subhabitSortOrder: 'alphabetical', subhabitSortReverse: false
        },
        { id: 'sub_z', name: 'Sub Z', parentId: 'parent_1', type: 'positive', dailyTarget: 1, logs: {} },
        { id: 'sub_a', name: 'Sub A', parentId: 'parent_1', type: 'positive', dailyTarget: 1, logs: {} }
      ];
      HabitualCore.renderAll();
    });
    await page.waitForTimeout(300);

    const subTitles = await page.locator('.subhabits-concertina .tab-title').allTextContents();
    const subNames = subTitles.map(t => t.trim());
    if (subNames[0] === 'Sub A' && subNames[1] === 'Sub Z') {
      console.log('  ✅ [PASS] Sub-habit auto-sort (alphabetical) places Sub A before Sub Z');
    } else {
      throw new Error(`Expected Sub A -> Sub Z, got ${subNames.join(', ')}`);
    }

    const subMoveBtns = await page.locator('.subhabits-concertina .btn-move-up, .subhabits-concertina .btn-move-down').count();
    if (subMoveBtns === 0) {
      console.log('  ✅ [PASS] Auto-sorted sub-habits hide reorder arrows');
    } else {
      throw new Error(`Expected 0 reorder arrows on auto-sorted sub-habits, found ${subMoveBtns}`);
    }

    // Switch sub-habits to manual mode
    await page.evaluate(() => {
      HabitualCore.state.habits[0].subhabitSortOrder = 'manual';
      HabitualCore.renderAll();
    });
    await page.waitForTimeout(300);

    const manualSubMoveBtns = await page.locator('.subhabits-concertina .btn-move-up, .subhabits-concertina .btn-move-down').count();
    if (manualSubMoveBtns > 0) {
      console.log(`  ✅ [PASS] Manual mode sub-habits display reorder arrows (${manualSubMoveBtns} buttons)`);
    } else {
      throw new Error('Expected reorder arrows on manual sub-habits, found 0');
    }

    // --- TEST 6: UI Modal Submission Refresh ---
    console.log('🧪 TEST 6: UI Modal Submission Refresh...');
    await page.evaluate(() => {
      HabitualCore.state.allPreferences = { sortOrder: 'manual', sortReverse: false };
      HabitualCore.state.habits = [
        { id: 'h_zebra', name: 'Zebra Habit', type: 'positive', dailyTarget: 1, logs: {} },
        { id: 'h_apple', name: 'Apple Habit', type: 'positive', dailyTarget: 1, logs: {} },
        { id: 'h_banana', name: 'Banana Habit', type: 'positive', dailyTarget: 1, logs: {} }
      ];
      HabitualCore.renderAll();
      HabitualCore.openAllPreferencesModal();
    });
    await page.waitForSelector('#modal-habit:not(.hidden)', { timeout: 3000 });

    // Change sort order to alphabetical via modal input
    await page.selectOption('#habit-subhabit-sort-order', 'alphabetical');
    await page.click('#form-habit button[type="submit"]');
    await page.waitForTimeout(300);

    habitTitles = await page.locator('.heatmap-card:not([data-habit-id="all"]) .tab-title').allTextContents();
    names = habitTitles.map(t => t.trim());
    if (names[0] === 'Apple Habit' && names[1] === 'Banana Habit' && names[2] === 'Zebra Habit') {
      console.log('  ✅ [PASS] Saving sort order in modal refreshed page & re-rendered gallery (Apple -> Banana -> Zebra)');
    } else {
      throw new Error(`Expected modal save to refresh gallery to Apple -> Banana -> Zebra, got ${names.join(', ')}`);
    }

    // --- TEST 7: Page Reload Sort Order Persistence ---
    console.log('🧪 TEST 7: Page Reload Sort Order & Sub-Habit Sort Persistence...');
    await page.evaluate(() => {
      HabitualCore.state.allPreferences = { sortOrder: 'alphabetical', sortReverse: false };
      HabitualCore.state.expandedHabitIds = new Set(['parent_p1']);
      HabitualCore.state.habits = [
        {
          id: 'parent_p1', name: 'Zebra Parent', type: 'positive', dailyTarget: 1, logs: {},
          subhabitSortOrder: 'alphabetical', subhabitSortReverse: false
        },
        { id: 'sub_z2', name: 'Sub Z2', parentId: 'parent_p1', type: 'positive', dailyTarget: 1, logs: {} },
        { id: 'sub_a2', name: 'Sub A2', parentId: 'parent_p1', type: 'positive', dailyTarget: 1, logs: {} },
        { id: 'h_apple_top', name: 'Apple Top', type: 'positive', dailyTarget: 1, logs: {} }
      ];
      HabitualCore.saveState();
    });

    // Reload page to simulate cold boot / browser refresh
    await page.reload();
    await page.waitForTimeout(500);

    // Verify main list sort order persisted across reload (Apple Top before Zebra Parent)
    const topLevelTitlesAfterReload = await page.locator('.heatmap-card:not([data-habit-id="all"]) .tab-title').allTextContents();
    const topNamesAfterReload = topLevelTitlesAfterReload.map(t => t.trim());
    if (topNamesAfterReload[0] === 'Apple Top' && topNamesAfterReload[1] === 'Zebra Parent') {
      console.log('  ✅ [PASS] Page reload preserved main list sortOrder (Apple Top -> Zebra Parent)');
    } else {
      throw new Error(`Expected Apple Top -> Zebra Parent after reload, got ${topNamesAfterReload.join(', ')}`);
    }

    // Verify parent subhabitSortOrder persisted across reload
    const storedParent = await page.evaluate(() => {
      const p = HabitualCore.state.habits.find(h => h.id === 'parent_p1');
      return p ? { subhabitSortOrder: p.subhabitSortOrder } : null;
    });

    if (storedParent && storedParent.subhabitSortOrder === 'alphabetical') {
      console.log('  ✅ [PASS] Page reload preserved parent habit subhabitSortOrder ("alphabetical")');
    } else {
      throw new Error(`Expected subhabitSortOrder "alphabetical" after reload, got ${JSON.stringify(storedParent)}`);
    }

    const screenshotPath = path.join(screenshotsDir, 'sort_ordering_ui.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  📸 [CAPTURE] Saved screenshot to ${screenshotPath}`);

    console.log('\n========================================');
    console.log('🎉 ALL SORT ORDERING PLAYWRIGHT TESTS PASSED!');
    console.log('========================================\n');
  } catch (err) {
    console.error('❌ Playwright Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
}

runTests();
