/**
 * Playwright E2E Test Suite for Habitual Template Sharing & Auto-Logging
 * Verifies:
 * 1. Template encoding preserves parent and sub-habit display options (showCount, showDuration, hideHeatmap, hideFromAll, colors, etc.).
 * 2. Generating a JSURL template link and opening it in a second browser context imports the habit structure with exact colors and display options.
 * 3. Opening a template link configured with auto-increment automatically logs check-ins on scan/open in a fresh user context.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8089;
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

async function runTemplateSharePlaywrightTests() {
  console.log('🚀 Starting Playwright E2E Test Suite for Template Sharing & Auto-Logging...\n');

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

    // User Context 1: Creator of habit with specific options & sub-habit colors
    const context1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page1 = await context1.newPage();
    page1.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page1.on('pageerror', err => console.error('PAGE ERROR:', err));

    console.log('📌 STEP 1: Setting up Habit with Custom Display Options & Distinct Sub-Habit Colors in Context 1...');
    await page1.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page1.waitForFunction(() => window.HabitualCore && typeof window.HabitualCore.generateJSURLTemplateLink === 'function');

    const templateData = await page1.evaluate(() => {
      const core = window.HabitualCore;

      const parent = {
        id: 'tmpl_e2e_parent',
        name: 'CrossFit Fitness Routine',
        type: 'positive',
        category: 'Sports',
        description: 'Complete daily WOD routine',
        dailyTarget: 3,
        frequencyType: 'daily',
        colorTheme: '#8e24aa', // Grape theme
        showCount: true,
        showDuration: true,
        hideHeatmap: false,
        hideFromAll: true
      };

      const child1 = {
        id: 'tmpl_e2e_child1',
        parentId: 'tmpl_e2e_parent',
        name: 'Heavy Deadlifts',
        dailyTarget: 5,
        colorTheme: '#d81b60', // Flamingo theme
        showCount: false,
        showDuration: true,
        hideHeatmap: true, // Minimal View
        parentDependency: 'requires_parent'
      };

      // Grandchild (Sub-habit of child1)
      const grandchild1 = {
        id: 'tmpl_e2e_grandchild1',
        parentId: 'tmpl_e2e_child1',
        name: 'Grip Strength Holds',
        dailyTarget: 3,
        hideHeatmap: true, // Minimal View
        colorTheme: '#f4511e' // Tangerine theme
      };

      const child2 = {
        id: 'tmpl_e2e_child2',
        parentId: 'tmpl_e2e_parent',
        name: 'Burpees Warmup',
        dailyTarget: 20,
        colorTheme: '#00acc1', // Peacock theme
        showCount: true,
        showDuration: false,
        parentDependency: 'auto_complete_from_parent'
      };

      // Child 3 uses default derived color (no custom colorTheme explicitly assigned)
      const child3 = {
        id: 'tmpl_e2e_child3',
        parentId: 'tmpl_e2e_parent',
        name: 'Mobility Stretching',
        dailyTarget: 1
      };

      core.state.habits = [parent, child1, grandchild1, child2, child3];

      // Generate JSURL template link with autoIncrement = 1
      const link = core.generateJSURLTemplateLink(parent, 1);
      const minPayload = core.encodeHabitTemplate(parent, 1);

      return { link, minPayload };
    });

    assert(templateData.link.includes('#template?data='), 'JSURL template link generated with hash');
    assert(templateData.minPayload.h === 'CrossFit Fitness Routine', 'Parent habit name encoded in minified payload');
    assert(templateData.minPayload.ha === true, 'Parent hideFromAll option encoded in minified payload');
    assert(templateData.minPayload.s.length === 3, 'Three direct sub-habits encoded in minified payload');
    assert(templateData.minPayload.s[0].hh === true, 'Sub-habit 1 minimal view (hideHeatmap: true) encoded in payload');
    assert(templateData.minPayload.s[0].s && templateData.minPayload.s[0].s[0].hh === true, 'Grandchild minimal view (hideHeatmap: true) encoded recursively in payload');
    assert(templateData.minPayload.s[0].c === '#d81b60', 'Sub-habit 1 distinct Flamingo color encoded in payload');
    assert(templateData.minPayload.s[1].c === '#00acc1', 'Sub-habit 2 distinct Peacock color encoded in payload');
    assert(templateData.minPayload.s[2].c === undefined, 'Sub-habit 3 default color is omitted from minified payload');

    // --- STEP 2: Open Template Link in User Context 2 (Simulating recipient scanning QR/NFC) ---
    console.log('\n📌 STEP 2: Opening JSURL Template Link in User Context 2 (Recipient)...');
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await context2.newPage();

    await page2.goto(templateData.link, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => window.HabitualCore && Array.isArray(window.HabitualCore.state.habits) && window.HabitualCore.state.habits.length > 0);

    const importedState = await page2.evaluate(() => {
      const core = window.HabitualCore;
      const habits = core.state.habits;
      const parent = habits.find(h => !h.parentId && h.name === 'CrossFit Fitness Routine');
      const children = habits.filter(h => h.parentId === parent.id);
      const child1 = children.find(c => c.name === 'Heavy Deadlifts');
      const grandchildren = child1 ? habits.filter(h => h.parentId === child1.id) : [];
      const child2 = children.find(c => c.name === 'Burpees Warmup');
      const child3 = children.find(c => c.name === 'Mobility Stretching');

      return {
        parentFound: !!parent,
        parentName: parent ? parent.name : null,
        parentColor: parent ? parent.colorTheme : null,
        parentHideFromAll: parent ? parent.hideFromAll : null,
        parentShowDuration: parent ? parent.showDuration : null,
        childrenCount: children.length,
        child1Color: child1 ? child1.colorTheme : null,
        child1Rule: child1 ? child1.parentDependency : null,
        child1ShowCount: child1 ? child1.showCount : null,
        child1ShowDuration: child1 ? child1.showDuration : null,
        child1HideHeatmap: child1 ? child1.hideHeatmap : null,
        child2Color: child2 ? child2.colorTheme : null,
        child2Rule: child2 ? child2.parentDependency : null,
        grandchildFound: grandchildren.length > 0,
        grandchildName: grandchildren[0] ? grandchildren[0].name : null,
        grandchildColor: grandchildren[0] ? grandchildren[0].colorTheme : null,
        grandchildHideHeatmap: grandchildren[0] ? grandchildren[0].hideHeatmap : null,
        child3Color: child3 ? child3.colorTheme : null,
        child3NotParentColor: child3 ? (child3.colorTheme !== parent.colorTheme) : false,
        todayCount: (parent && parent.logs && core.getTodayKey) ? (parent.logs[core.getTodayKey()] ? parent.logs[core.getTodayKey()].count : 0) : 0
      };
    });

    assert(importedState.parentFound, 'Recipient imported top-level habit from template link');
    assert(importedState.parentName === 'CrossFit Fitness Routine', 'Imported parent habit name matches original');
    assert(importedState.parentColor === '#8e24aa', 'Imported parent habit color preserved (#8e24aa)');
    assert(importedState.parentHideFromAll === true, 'Imported parent habit display option hideFromAll preserved');
    assert(importedState.parentShowDuration === true, 'Imported parent habit display option showDuration preserved');
    assert(importedState.childrenCount === 3, 'Recipient imported all 3 direct sub-habits');
    assert(importedState.child1Color === '#d81b60', 'Sub-habit 1 distinct Flamingo color preserved (#d81b60)');
    assert(importedState.child1Rule === 'requires_parent', 'Sub-habit 1 parentDependency rule preserved (requires_parent)');
    assert(importedState.child1ShowCount === false, 'Sub-habit 1 display option showCount: false preserved');
    assert(importedState.child1ShowDuration === true, 'Sub-habit 1 display option showDuration: true preserved');
    assert(importedState.child1HideHeatmap === true, 'Sub-habit 1 minimal view option (hideHeatmap: true) preserved and restored');
    assert(importedState.child2Color === '#00acc1', 'Sub-habit 2 distinct Peacock color preserved (#00acc1)');
    assert(importedState.child2Rule === 'auto_complete_from_parent', 'Sub-habit 2 parentDependency rule preserved (auto_complete_from_parent)');
    assert(importedState.grandchildFound, 'Nested sub-sub-habit (grandchild) imported recursively');
    assert(importedState.grandchildName === 'Grip Strength Holds', 'Grandchild habit name matches');
    assert(importedState.grandchildColor === '#f4511e', 'Grandchild habit color preserved (#f4511e)');
    assert(importedState.grandchildHideHeatmap === true, 'Grandchild sub-sub-habit minimal view option (hideHeatmap: true) preserved and restored');
    assert(importedState.child3NotParentColor, 'Sub-habit 3 reconstructed with its OWN default color, NOT parent color');
    assert(importedState.todayCount === 1, 'Auto-increment count (+1) logged for today on import');

    console.log(`\n📊 Playwright Test Results: ${passed}/${total} passed.`);
    if (passed !== total) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Playwright E2E Execution Error:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runTemplateSharePlaywrightTests();
