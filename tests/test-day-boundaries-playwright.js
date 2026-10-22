/**
 * Playwright E2E Test Suite for Custom Day Boundaries & Today Date Selector Indicators
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8097;
const WEB_DIR = path.join(__dirname, '..', 'web');

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

  const sockets = new Set();
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

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  return {
    start: () => new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve)),
    stop: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    })
  };
}

(async () => {
  console.log('🌅 Starting Playwright E2E Test Suite for Custom Day Boundaries & Today Date Indicators...\n');
  const server = createStaticServer();
  await server.start();
  console.log(`[Server] Local test web server running on http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch({ headless: true })
    .catch(() => chromium.launch({ channel: 'chrome', headless: true }))
    .catch(() => chromium.launch({ channel: 'msedge', headless: true }));
  const context = await browser.newContext();
  const page = await context.newPage();

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(message);
    }
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  }

  try {
    // 1. Sync Page: Configure Sunrise to Sunset mode and coordinates
    console.log('\n⚙️ STEP 1: Testing Sync Page Day Boundary Settings & Live Preview...');
    await page.goto(`http://127.0.0.1:${PORT}/sync.html`);
    await page.waitForSelector('#select-day-boundary-mode');

    await page.selectOption('#select-day-boundary-mode', 'sunrise_to_sunset');
    await page.fill('#input-latitude', '51.5074');
    await page.fill('#input-longitude', '-0.1278');
    await page.click('#btn-save-location');

    const previewText = await page.textContent('#sun-times-preview');
    assert(previewText.includes("Today's Sunrise") && previewText.includes("Sunset"), 'Sync page displays live Sunrise and Sunset preview');

    // Verify stored state in localStorage
    const savedState = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('habitual_tracker_v1') || '{}');
    });
    assert(savedState.dayBoundaryMode === 'sunrise_to_sunset', 'dayBoundaryMode persisted as sunrise_to_sunset');
    assert(savedState.latitude === 51.5074, 'latitude persisted as 51.5074');

    // 2. Index Page: Verify "Today" Date Selector indicators
    console.log('\n📅 STEP 2: Testing "Today" Date Selector Labels on Main Page...');
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.waitForSelector('#app');

    // Populate habit and trigger log modal
    await page.evaluate(() => {
      if (window.HabitualCore) {
        window.HabitualCore.state.habits = [{ id: 'h1', name: 'Test Habit', type: 'positive', dailyTarget: 1, logs: {} }];
        if (window.HabitualCore.openLogModal) {
          window.HabitualCore.openLogModal(window.HabitualCore.getTodayKey());
        }
      }
    });

    const dateLabelText = await page.textContent('label[for="modal-log-date-input"]');
    assert(dateLabelText.includes('Today'), 'Modal log date picker label specifies "Select Date (Today)"');

    // 3. Todo Page: Verify Countdown Timer & Subtext
    console.log('\n⏰ STEP 3: Testing Countdown Timer & Boundary Subtext on Todo Page...');
    await page.goto(`http://127.0.0.1:${PORT}/todo.html`);
    await page.waitForSelector('#todo-countdown');

    const countdownText = await page.textContent('#todo-countdown');
    assert(/\d+h \d+m \d+s/.test(countdownText), 'Todo page countdown displays valid timer digits');

    const subtextText = await page.textContent('.todo-countdown-subtext');
    assert(subtextText.includes('until sunset') || subtextText.includes('until sunrise') || subtextText.includes('before midnight'), 'Countdown subtext includes active boundary label');

    console.log(`\n========================================`);
    console.log(`🎉 ALL E2E PLAYWRIGHT TESTS PASSED: ${passedTests}/${totalTests} Passed!`);
    console.log(`========================================\n`);

  } catch (err) {
    console.error(`\n❌ E2E Playwright Test Failed:`, err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await server.stop();
  }
})();
