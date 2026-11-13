/**
 * Playwright Script to Generate Full User Manual Screenshots for Habitual
 *
 * Captures high-resolution, crisp screenshots for every screen, modal, tab,
 * accordion, and widget in Habitual to assemble a complete visual user manual.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ARTIFACT_DIR = '/home/marcus/.cache/Google/AndroidStudio2026.1.4/projects/habitual.7b234357/.artifacts/fbb3c327-e1d7-4b4c-8c55-fa9d0a964dc3/screenshots';
const LOCAL_SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'manual');
const WEB_DIR = path.join(__dirname, '..', 'web');

[ARTIFACT_DIR, LOCAL_SCREENSHOT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function logStep(msg) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 8);
  console.log(`[${ts}] ${msg}`);
}

function saveScreenshotPair(page, filename) {
  const p1 = path.join(LOCAL_SCREENSHOT_DIR, filename);
  const p2 = path.join(ARTIFACT_DIR, filename);
  return Promise.all([
    page.screenshot({ path: p1, fullPage: false }),
    page.screenshot({ path: p2, fullPage: false })
  ]).then(() => {
    logStep(`📸 Saved screenshot: ${filename}`);
  });
}

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

  server.destroyAllSockets = () => {
    for (const socket of sockets) {
      try { socket.destroy(); } catch (e) {}
    }
    sockets.clear();
  };

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      logStep(`[Server] Manual Screenshot Web Server running on http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

async function generateManualScreenshots() {
  logStep('🚀 Starting Habitual Visual User Manual Screenshot Generator...\n');

  const { server, port } = await createStaticServer();
  let browser = null;

  try {
    browser = await chromium.launch({ headless: true }).catch(() =>
      chromium.launch({ channel: 'chrome', headless: true })
    );

    const context = await browser.newContext({
      viewport: { width: 1366, height: 850 },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();

    const baseUrl = `http://127.0.0.1:${port}/index.html`;
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.HabitualCore !== 'undefined' && Boolean(window.HabitualCore.state));

    // Populate rich realistic state
    await page.evaluate(() => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();

      function generatePastLogs(density = 0.75, days = 60) {
        const logs = {};
        const now = new Date();
        for (let i = 0; i < days; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const k = core.getTodayKey(d);
          if (Math.random() < density) {
            logs[k] = { count: Math.floor(Math.random() * 2) + 1, note: i % 7 === 0 ? 'Great progress today! Felt energized.' : '' };
          }
        }
        return logs;
      }

      const habitWorkout = {
        id: 'habit_workout_master',
        name: '🏋️‍♂️ Fitness & Strength Training',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#2196F3',
        description: 'Daily core exercise and physical conditioning',
        enableChat: true,
        sharing: {
          enabled: true,
          docId: 'habit_workout_master',
          collection: 'habit_workout_master',
          password: 'WorkoutSecret123!',
          enableChat: true
        },
        subhabitDisplayMode: 'concertina',
        logs: generatePastLogs(0.8, 90)
      };

      const subCardio = {
        id: 'sub_cardio_run',
        parentId: 'habit_workout_master',
        name: '🏃‍♂️ Morning Jog / Cardio',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#00bcd4',
        logs: generatePastLogs(0.7, 90)
      };

      const subStretch = {
        id: 'sub_stretching',
        parentId: 'habit_workout_master',
        name: '🧘 Cool Down & Mobility Stretch',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#8e24aa',
        logs: generatePastLogs(0.85, 90)
      };

      const habitQuitSugar = {
        id: 'habit_quit_sugar',
        name: '🍫 Quit Processed Sugar',
        type: 'negative',
        dailyTarget: 1,
        colorTheme: '#e91e63',
        description: 'Maintain zero slip-ups on refined sugar and candy',
        logs: generatePastLogs(0.9, 120)
      };

      const habitReading = {
        id: 'habit_daily_reading',
        name: '📚 Read Non-Fiction 20 Mins',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#4caf50',
        description: 'Expand knowledge with daily deep reading',
        logs: generatePastLogs(0.8, 60)
      };

      core.state.habits = [habitWorkout, subCardio, subStretch, habitQuitSugar, habitReading];
      core.state.selectedHabitId = 'habit_workout_master';
      core.saveState();
      core.renderAll();
    });

    await page.waitForTimeout(500);

    // Helper to safely close modals
    const closeModalInPage = () => {
      document.querySelectorAll('.modal-backdrop, .modal').forEach(m => m.classList.add('hidden'));
      document.body.classList.remove('modal-open');
    };

    // =========================================================================
    // SCREEN 01: Main Overview Heatmaps Page
    // =========================================================================
    logStep('📸 Capturing Screen 01: Main Overview Heatmaps...');
    await saveScreenshotPair(page, '01_main_habits_heatmap_overview.png');

    // =========================================================================
    // SCREEN 02: Concertina Sub-Habit Accordion Expanded
    // =========================================================================
    logStep('📸 Capturing Screen 02: Concertina Sub-Habit Accordion Expanded...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      core._collapsedParentConcertinas = core._collapsedParentConcertinas || {};
      core._collapsedParentConcertinas['habit_workout_master'] = false;
      core.renderAll();
    });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '02_subhabit_accordion_expanded.png');

    // =========================================================================
    // SCREEN 03: Single Habit Page / Focus View
    // =========================================================================
    logStep('📸 Capturing Screen 03: Single Habit Focus Page View...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      core.navigateToHabitPage('habit_workout_master');
    });
    await page.waitForTimeout(500);
    await saveScreenshotPair(page, '03_single_habit_page_view.png');

    // Navigate back to main view
    await page.evaluate(() => {
      window.location.hash = '#/';
      const core = window.HabitualCore;
      if (core.renderAll) core.renderAll();
    });
    await page.waitForTimeout(300);

    // =========================================================================
    // SCREEN 04: Edit Habit Modal - Tab 1: Parent Options
    // =========================================================================
    logStep('📸 Capturing Screen 04: Habit Options Modal - Tab 1 (Parent Options)...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      const habit = core.state.habits.find(h => h.id === 'habit_workout_master');
      core.openHabitModal(habit);
      core.switchDisplayOptionsTab('parent');
    });
    await page.waitForSelector('#modal-habit:not(.hidden)', { state: 'visible' });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '04_edit_habit_modal_parent_tab.png');

    // =========================================================================
    // SCREEN 05: Edit Habit Modal - Tab 2: Sub-Habit Auto-Sort & Options
    // =========================================================================
    logStep('📸 Capturing Screen 05: Habit Options Modal - Tab 2 (Sub-Habit Auto-Sort)...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      core.switchDisplayOptionsTab('subhabits');
    });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '05_edit_habit_modal_subhabit_tab.png');

    // =========================================================================
    // SCREEN 06: Edit Habit Modal - Tab 3: Circumstantial Hiding Rules
    // =========================================================================
    logStep('📸 Capturing Screen 06: Habit Options Modal - Tab 3 (Circumstantial Rules)...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      core.switchDisplayOptionsTab('hiding');
    });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '06_edit_habit_modal_hiding_rules.png');

    // =========================================================================
    // SCREEN 07: Edit Habit Modal - Tab 4: Encrypted Chat Space
    // =========================================================================
    logStep('📸 Capturing Screen 07: Habit Options Modal - Tab 4 (Encrypted Chat Space)...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      core.switchDisplayOptionsTab('chat');
    });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '07_edit_habit_modal_chat_tab.png');

    // =========================================================================
    // SCREEN 08: Edit Habit Modal - Advanced Settings Accordion Expanded
    // =========================================================================
    logStep('📸 Capturing Screen 08: Habit Options Modal - Advanced Settings Accordion...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      core.switchDisplayOptionsTab('parent');
      const acc = document.getElementById('advanced-settings-accordion');
      if (acc) acc.open = true;
    });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '08_edit_habit_modal_advanced_accordion.png');

    // Close Habit Modal
    await page.evaluate(closeModalInPage);
    await page.waitForTimeout(300);

    // =========================================================================
    // SCREEN 09: Quick Check-In / Activity Log Modal
    // =========================================================================
    logStep('📸 Capturing Screen 09: Quick Check-in / Activity Log Modal...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      const today = core.getTodayKey();
      core.openLogModal(today, 'habit_workout_master');
    });
    await page.waitForSelector('#modal-log:not(.hidden)', { state: 'visible' });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '09_quick_log_modal.png');

    // Close Activity Log Modal
    await page.evaluate(closeModalInPage);
    await page.waitForTimeout(300);

    // =========================================================================
    // SCREEN 10: All Page Default Preferences Modal
    // =========================================================================
    logStep('📸 Capturing Screen 10: All Page Default Preferences Modal...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      core.openHabitModal(null);
    });
    await page.waitForSelector('#modal-habit:not(.hidden)', { state: 'visible' });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '10_all_preferences_modal.png');

    // Close Modal
    await page.evaluate(closeModalInPage);
    await page.waitForTimeout(300);

    // =========================================================================
    // SCREEN 11: Import Shared Habit Modal Preview
    // =========================================================================
    logStep('📸 Capturing Screen 11: Import Shared Habit Modal Preview...');
    await page.evaluate(() => {
      const modalImport = document.getElementById('modal-import-shared-habit');
      const nameEl = document.getElementById('import-shared-habit-name');
      const colEl = document.getElementById('import-shared-habit-collection');
      if (nameEl) nameEl.textContent = '🏋️‍♂️ Fitness & Strength Training (Shared)';
      if (colEl) colEl.textContent = 'doc_workout_share_master_99';
      if (modalImport) modalImport.classList.remove('hidden');
    });
    await page.waitForSelector('#modal-import-shared-habit:not(.hidden)', { state: 'visible' });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '11_import_shared_habit_modal.png');

    // Close Modal
    await page.evaluate(closeModalInPage);
    await page.waitForTimeout(300);

    // =========================================================================
    // SCREEN 12: Template Import & Discussion Space Modal
    // =========================================================================
    logStep('📸 Capturing Screen 12: Template Import Modal...');
    await page.evaluate(() => {
      const core = window.HabitualCore;
      const sampleTmpl = {
        name: '30-Day Health Transformation',
        type: 'positive',
        dailyTarget: 1,
        colorTheme: '#ff9800',
        description: 'Comprehensive health routine template with sub-habits',
        children: [
          { name: '💧 Drink 2L Water', type: 'positive', dailyTarget: 1 },
          { name: '🧘 Evening Meditation', type: 'positive', dailyTarget: 1 }
        ]
      };
      core.showImportTemplateModal(sampleTmpl, 'tmpl_doc_123');
    });
    await page.waitForSelector('#modal-import-template:not(.hidden)', { state: 'visible' });
    await page.waitForTimeout(400);
    await saveScreenshotPair(page, '12_template_import_modal.png');

    // Close Template Modal
    await page.evaluate(closeModalInPage);
    await page.waitForTimeout(300);

    // =========================================================================
    // SCREEN 13: Standalone Todo Page (/todo.html)
    // =========================================================================
    logStep('📸 Capturing Screen 13: Standalone Todo Page...');
    await page.goto(`http://127.0.0.1:${port}/todo.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await saveScreenshotPair(page, '13_todo_page_view.png');

    // =========================================================================
    // SCREEN 14: Standalone Sync, E2EE Backup & Restore Page (/sync.html)
    // =========================================================================
    logStep('📸 Capturing Screen 14: Standalone Sync & Backup Page...');
    await page.goto(`http://127.0.0.1:${port}/sync.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await saveScreenshotPair(page, '14_sync_and_backup_page.png');

    // =========================================================================
    // SCREEN 15: Standalone Add Widget (/widgets/add.html)
    // =========================================================================
    logStep('📸 Capturing Screen 15: Standalone Add Widget...');
    await page.goto(`http://127.0.0.1:${port}/widgets/add.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await saveScreenshotPair(page, '15_widget_add_page.png');

    // =========================================================================
    // SCREEN 16: Standalone Heatmaps Widget (/widgets/heatmaps.html)
    // =========================================================================
    logStep('📸 Capturing Screen 16: Standalone Heatmaps Widget...');
    await page.goto(`http://127.0.0.1:${port}/widgets/heatmaps.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await saveScreenshotPair(page, '16_widget_heatmaps_page.png');

    // =========================================================================
    // SCREEN 17: Standalone Settings Widget (/widgets/settings.html)
    // =========================================================================
    logStep('📸 Capturing Screen 17: Standalone Settings Widget...');
    await page.goto(`http://127.0.0.1:${port}/widgets/settings.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await saveScreenshotPair(page, '17_widget_settings_page.png');

    logStep('\n========================================');
    logStep('🎉 ALL 17 USER MANUAL SCREENSHOTS CAPTURED SUCCESSFULLY!');
    logStep(`   Local copies: ${LOCAL_SCREENSHOT_DIR}/`);
    logStep(`   Artifact copies: ${ARTIFACT_DIR}/`);
    logStep('========================================\n');

  } catch (err) {
    logStep(`\n❌ Screenshot Generation Error: ${err.message || err}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) {
      server.destroyAllSockets();
      server.close();
    }
    process.exit(process.exitCode || 0);
  }
}

generateManualScreenshots();
