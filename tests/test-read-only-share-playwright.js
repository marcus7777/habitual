/**
 * Playwright E2E Test Suite for Read-Only Shared Habits & Pre-populated Viewer Notes
 * Verifies:
 * 1. Opening a `#share?col=...&pwd=...&note=...` URL renders the Read-Only preview card.
 * 2. `👁️ Read-Only` badge is displayed in card header.
 * 3. Quick log check-in button (`+` / `✓`) is hidden/removed.
 * 4. `📝 Private Viewer Notes` input box is pre-populated with the note from the URL parameter.
 * 5. Saves a screenshot of the end result to `tests/screenshots/read_only_shared_habit_preview.png`.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8089;
const WEB_DIR = path.join(__dirname, '..', 'web');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

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

async function runReadOnlySharePlaywrightTest() {
  console.log('🚀 Starting Playwright E2E Test Suite for Read-Only Shared Habit & Pre-Populated Note...\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const server = await createStaticServer();
  let browser = null;
  let total = 0;
  let passed = 0;

  function assert(cond, testName) {
    total++;
    if (cond) {
      passed++;
      console.log(`  ✅ [PASS] ${testName}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
    }
  }

  try {
    browser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage();

    const col = 'ro_test_col_123';
    const pwd = 'ro_test_pwd_123';
    const preNote = 'Recommended Routine: 3 sets of 10 reps every morning!';

    const shareUrl = `http://127.0.0.1:${PORT}/index.html#share?col=${encodeURIComponent(col)}&pwd=${encodeURIComponent(pwd)}&note=${encodeURIComponent(preNote)}`;

    console.log(`📌 STEP 1: Opening Read-Only Share Link (${shareUrl})...`);
    await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.HabitualCore && typeof window.HabitualCore.checkURLHashForSharedHabit === 'function');

    // Mock Firestore backup download payload
    await page.evaluate(({ col, preNote }) => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();

      const mockData = {
        name: 'Morning Fitness Routine',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#039BE5',
        logs: { [today]: { count: 1, note: 'Shared Cloud Check-in' } }
      };

      core.SyncTargets.Firestore.downloadPerHabitBackup = function() {
        return Promise.resolve(mockData);
      };

      core.checkURLHashForSharedHabit();
    }, { col, preNote });

    await page.waitForTimeout(300);

    // 1. Verify Import Modal opened with Read-Only Badge
    const modalVisible = await page.isVisible('#modal-import-shared-habit');
    assert(modalVisible, 'Join Shared Habit modal opens automatically');

    const modalBadgeText = await page.textContent('#import-shared-habit-logs-info');
    assert(modalBadgeText.includes('Read-Only'), 'Read-Only Mode badge displayed in modal header');

    // 2. Verify Preview Card Has Read-Only Badge and No Quick-Log Plus Button
    const previewBadgeText = await page.textContent('#import-shared-habit-heatmap-svg .badge-readonly');
    assert(previewBadgeText.includes('Read-Only'), '👁️ Read-Only badge rendered on preview heatmap card header');

    const quickLogBtn = await page.$('#import-shared-habit-heatmap-svg .btn-card-quick-log');
    assert(quickLogBtn === null, 'Quick log button (+) is NOT rendered on Read-Only header card');

    // 3. Verify Pre-Populated Viewer Note in Preview Card
    const viewerNoteVal = await page.inputValue('#import-shared-habit-heatmap-svg .viewer-note-input');
    assert(viewerNoteVal === preNote, `📝 Private Viewer Notes input is pre-populated with URL note ("${preNote}")`);

    // 4. Confirm Join Habit
    console.log('\n📌 STEP 2: Joining Read-Only Shared Habit...');
    await page.click('#btn-confirm-import-shared');
    await page.waitForTimeout(300);

    const mainCardBadge = await page.textContent('.heatmap-card .badge-readonly');
    assert(mainCardBadge.includes('Read-Only'), 'Main page heatmap card retains 👁️ Read-Only badge after joining');

    const mainCardNoteVal = await page.inputValue('.heatmap-card .viewer-note-input');
    assert(mainCardNoteVal === preNote, 'Main page heatmap card retains pre-populated viewer note');

    // 5. Capture High-Resolution Screenshot
    console.log('\n📌 STEP 3: Capturing Screenshot of End Result...');
    const cardElement = await page.$('.heatmap-card');
    const screenshotPath = path.join(SCREENSHOT_DIR, 'read_only_shared_habit_preview.png');

    if (cardElement) {
      await cardElement.screenshot({ path: screenshotPath });
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    assert(fs.existsSync(screenshotPath), `Screenshot saved successfully to ${screenshotPath}`);

  } catch (err) {
    console.error('Fatal Playwright Test Error:', err);
  } finally {
    if (browser) await browser.close();
    server.close();
    console.log(`\n📊 Playwright Test Results: ${passed}/${total} passed.`);
    process.exit(passed === total ? 0 : 1);
  }
}

runReadOnlySharePlaywrightTest();
