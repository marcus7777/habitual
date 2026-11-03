/**
 * Playwright End-to-End (E2E) Test Suite for Saving Notes
 * Verifies Note saving, DOM indicators, modal form interactions,
 * zero-count note persistence, page reload persistence (LocalStorage/IndexedDB),
 * and multi-device sync payload replaying.
 */

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

function logResult(testName, isSuccess, details = '') {
  const status = isSuccess ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${status} ${testName} ${details}`);
  if (!isSuccess) {
    throw new Error(`Test failed: ${testName} ${details}`);
  }
}

async function runNoteSavingE2ETests() {
  console.log('🚀 Starting Comprehensive Playwright E2E Test Suite for Saving Notes...\n');

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
    await page.waitForTimeout(500);

    // =========================================================================
    // TEST 1: Save Note via UI Modal & Verify DOM Heatmap Indicators
    // =========================================================================
    console.log('--- TEST 1: UI Modal Note Saving & Heatmap DOM Indicators ---');

    // Create a habit and open modal for today
    await page.evaluate(() => {
      HabitualCore.resetState();
      const todayStr = HabitualCore.getTodayKey();
      HabitualCore.state.habits = [
        { id: 'e2e_run', name: '🏃 Daily Running', type: 'positive', dailyTarget: 1, logs: {} }
      ];
      HabitualCore.state.selectedHabitId = 'e2e_run';
      HabitualCore.renderAll();
      HabitualCore.openLogModal(todayStr, 'e2e_run');
    });

    await page.waitForSelector('#modal-log:not(.hidden)', { timeout: 3000 });

    // Fill count and note input
    await page.fill('#modal-log-count', '2');
    await page.fill('#modal-log-note', 'Ran 10km in the park - personal best!');
    await page.click('#btn-save-log');
    await page.waitForTimeout(400);

    // Verify state note persistence
    const stateLogNote = await page.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      const habit = HabitualCore.state.habits.find(h => h.id === 'e2e_run');
      return habit.logs[todayStr] ? habit.logs[todayStr].note : null;
    });
    logResult('Note saved in HabitualCore state', stateLogNote === 'Ran 10km in the park - personal best!', `(note="${stateLogNote}")`);

    // Verify DOM square rendering of note indicators
    const squareData = await page.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      const sq = document.querySelector(`.day-square[data-date="${todayStr}"]`);
      if (!sq) return null;
      return {
        hasNoteAttr: sq.getAttribute('data-has-note'),
        noteAttr: sq.getAttribute('data-note'),
        hasClass: sq.classList.contains('has-note')
      };
    });

    logResult('DOM square has-note attribute is true', squareData && squareData.hasNoteAttr === 'true');
    logResult('DOM square data-note contains note text', squareData && squareData.noteAttr.includes('Ran 10km in the park'));
    logResult('DOM square contains has-note CSS class', squareData && squareData.hasClass === true);

    // =========================================================================
    // TEST 2: Edit Log Modal & Re-populating Saved Notes
    // =========================================================================
    console.log('\n--- TEST 2: Re-opening Modal Restores Saved Note ---');

    await page.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      HabitualCore.openLogModal(todayStr, 'e2e_run');
    });

    await page.waitForSelector('#modal-log:not(.hidden)', { timeout: 3000 });

    const modalNoteValue = await page.inputValue('#modal-log-note');
    logResult('Modal note input field populates existing note on edit', modalNoteValue === 'Ran 10km in the park - personal best!', `(input="${modalNoteValue}")`);

    // Close modal
    await page.click('#modal-log-close');
    await page.waitForTimeout(300);

    // =========================================================================
    // TEST 3: Zero-Count Log Note Retention & Clearing via UI
    // =========================================================================
    console.log('\n--- TEST 3: Zero-Count Log Note Retention & Note Clearing ---');

    const pastDateKey = await page.evaluate(() => {
      const d = HabitualCore.parseDateKey(HabitualCore.getTodayKey());
      d.setDate(d.getDate() - 2);
      return HabitualCore.formatDateKey(d);
    });

    // Save count 0 with note "Rest day due to rain"
    await page.evaluate((dKey) => {
      HabitualCore.openLogModal(dKey, 'e2e_run');
    }, pastDateKey);

    await page.waitForSelector('#modal-log:not(.hidden)', { timeout: 3000 });
    await page.fill('#modal-log-count', '0');
    await page.fill('#modal-log-note', 'Rest day due to rain');
    await page.click('#btn-save-log');
    await page.waitForTimeout(400);

    const zeroCountStateLog = await page.evaluate((dKey) => {
      const habit = HabitualCore.state.habits.find(h => h.id === 'e2e_run');
      return habit.logs[dKey];
    }, pastDateKey);

    logResult('Zero-count log entry retained when note is non-empty', zeroCountStateLog && zeroCountStateLog.count === 0 && zeroCountStateLog.note === 'Rest day due to rain');

    const zeroCountSquareData = await page.evaluate((dKey) => {
      const sq = document.querySelector(`.day-square[data-date="${dKey}"]`);
      return sq ? { hasNoteAttr: sq.getAttribute('data-has-note'), noteAttr: sq.getAttribute('data-note') } : null;
    }, pastDateKey);

    logResult('Zero-count DOM square has data-has-note="true"', zeroCountSquareData && zeroCountSquareData.hasNoteAttr === 'true');

    // =========================================================================
    // TEST 4: Page Reload Persistence (LocalStorage & IndexedDB)
    // =========================================================================
    console.log('\n--- TEST 4: Persistence Across Page Reload ---');

    await page.reload();
    await page.waitForTimeout(500);

    const reloadedStateNotes = await page.evaluate((pastKey) => {
      const todayStr = HabitualCore.getTodayKey();
      const habit = HabitualCore.state.habits.find(h => h.id === 'e2e_run');
      if (!habit || !habit.logs) return null;
      return {
        todayNote: habit.logs[todayStr] ? habit.logs[todayStr].note : null,
        pastNote: habit.logs[pastKey] ? habit.logs[pastKey].note : null
      };
    }, pastDateKey);

    logResult('Today note persisted across page reload', reloadedStateNotes && reloadedStateNotes.todayNote === 'Ran 10km in the park - personal best!');
    logResult('Past zero-count note persisted across page reload', reloadedStateNotes && reloadedStateNotes.pastNote === 'Rest day due to rain');

    // =========================================================================
    // TEST 5: Multi-Tab / Multi-Device Sync Replaying Log Notes
    // =========================================================================
    console.log('\n--- TEST 5: Multi-Tab / Multi-Device Sync Log Note Payload Merge ---');

    const page2 = await context.newPage();
    await page2.goto(`http://127.0.0.1:${PORT}/`);
    await page2.waitForTimeout(500);

    const syncedNoteOnSecondTab = await page2.evaluate((pastKey) => {
      const todayStr = HabitualCore.getTodayKey();
      const habit = HabitualCore.state.habits.find(h => h.id === 'e2e_run');
      if (!habit || !habit.logs) return null;
      return {
        todayNote: habit.logs[todayStr] ? habit.logs[todayStr].note : null,
        pastNote: habit.logs[pastKey] ? habit.logs[pastKey].note : null
      };
    }, pastDateKey);

    logResult('Second tab loaded synced note state for today', syncedNoteOnSecondTab && syncedNoteOnSecondTab.todayNote === 'Ran 10km in the park - personal best!');

    // Update count on Tab 2 via setHabitCountForDate and verify existing note is preserved
    await page2.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      HabitualCore.setHabitCountForDate('e2e_run', todayStr, 3);
    });

    const tab2NotePreserved = await page2.evaluate(() => {
      const todayStr = HabitualCore.getTodayKey();
      const habit = HabitualCore.state.habits.find(h => h.id === 'e2e_run');
      return habit.logs[todayStr] ? habit.logs[todayStr].note : null;
    });

    logResult('Updating count on Tab 2 preserved existing note text', tab2NotePreserved === 'Ran 10km in the park - personal best!');

    // Test remote payload log_update merge on Tab 2
    const mergeTestResult = await page2.evaluate(() => {
      const now = Date.now();
      const localPayload = HabitualCore.getPayloadFromState();
      const remotePayload = {
        updatedAt: now,
        habits: [{ id: 'e2e_run', name: '🏃 Daily Running', updatedAt: now, logs: {} }],
        updateLog: [
          { id: 'remote_evt_1', timestamp: now, type: 'log_update', habitId: 'e2e_run', dateKey: '2026-10-10', count: 1, note: 'Remote synced note' }
        ]
      };
      const merged = HabitualCore.mergeStatePayloads(localPayload, remotePayload);
      const habit = merged.habits.find(h => h.id === 'e2e_run');
      return habit && habit.logs['2026-10-10'] ? habit.logs['2026-10-10'].note : null;
    });

    logResult('mergeStatePayloads replayed remote log_update containing note on Tab 2', mergeTestResult === 'Remote synced note', `(note="${mergeTestResult}")`);

    // Capture screenshot
    const screenshotPath = path.join(screenshotsDir, 'note_saving_e2e_test.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n📸 [CAPTURE] Saved E2E screenshot to ${screenshotPath}`);

    await page2.close();

    console.log('\n🎉 ALL NOTE SAVING PLAYWRIGHT E2E TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ Playwright E2E Note Saving Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
}

runNoteSavingE2ETests();
