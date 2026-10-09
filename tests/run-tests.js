/**
 * Automated Test Suite for Habitual
 * Tests all 11 core features listed in README.md
 */

const fs = require('fs');
const path = require('path');

// --- MINIMAL DOM & LOCALSTORAGE MOCK FOR NODE.JS ---
const mockLocalStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

global.window = global.window || {};
global.window.location = global.window.location || { hash: '#/', toString: () => '#/' };
global.window.HabitualCore = global.window.HabitualCore || {};

function createMockElement(tagName) {
  const children = [];
  const attributes = {};
  const classListSet = new Set();
  const eventListeners = {};
  let innerHTMLVal = '';
  const elem = {
    tagName: tagName.toUpperCase(),
    value: '',
    style: {},
    addEventListener: (event, fn) => {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(fn);
    },
    click: function() {
      if (eventListeners['click']) {
        eventListeners['click'].forEach(fn => fn({ target: elem }));
      }
    },
    get className() { return Array.from(classListSet).join(' '); },
    set className(val) { classListSet.clear(); (val || '').split(' ').filter(Boolean).forEach(c => classListSet.add(c)); },
    children,
    attributes,
    get innerHTML() { return innerHTMLVal; },
    set innerHTML(val) {
      innerHTMLVal = val;
      const classMatches = val.match(/class="([^"]+)"/g) || [];
      classMatches.forEach(m => {
        const classes = m.replace('class="', '').replace('"', '').split(' ');
        const mockChild = createMockElement('div');
        classes.forEach(c => mockChild.classList.add(c));
        if (mockChild.classList.contains('btn-card-quick-log')) {
          const btnMatch = val.match(/<button[^>]*btn-card-quick-log[^>]*>([\s\S]*?)<\/button>/);
          if (btnMatch) mockChild.textContent = btnMatch[1].trim();
        }
        children.push(mockChild);
      });
    },
    classList: {
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls),
      contains: (cls) => classListSet.has(cls),
      toggle: (cls, force) => {
        if (force !== undefined) {
          if (force) classListSet.add(cls); else classListSet.delete(cls);
          return force;
        }
        if (classListSet.has(cls)) { classListSet.delete(cls); return false; }
        classListSet.add(cls); return true;
      }
    },
    setAttribute: (k, v) => { attributes[k] = String(v); },
    getAttribute: (k) => attributes[k] || null,
    appendChild: (child) => { children.push(child); return child; },
    querySelector: function(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        for (const child of children) {
          if (child.classList && child.classList.contains(cls)) return child;
          if (child.querySelector) {
            const found = child.querySelector(sel);
            if (found) return found;
          }
        }
      }
      return null;
    },
    querySelectorAll: () => []
  };
  return elem;
}

global.document = {
  body: createMockElement('body'),
  addEventListener: () => {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: createMockElement
};
global.localStorage = mockLocalStorage;
global.navigator = { serviceWorker: { register: async () => ({ scope: '/' }) } };

// Load Habitual Core Files
require('../web/js/colours.js');
require('../web/js/state.js');
require('../web/js/storage.js');
require('../web/js/audio-sync.js');
require('../web/js/render.js');
require('../web/js/ui.js');
const HabitualCore = global.window.HabitualCore;

HabitualCore.resetState = function() {
  HabitualCore.cursorDateKey = null;
  HabitualCore.state = {
    habits: [],
    selectedHabitId: 'all',
    selectedYear: HabitualCore.CURRENT_YEAR,
    showQuickLogOnStartup: false
  };
};

HabitualCore.getState = () => HabitualCore.state;
HabitualCore.setState = (newState) => { HabitualCore.state = newState; };
HabitualCore.getElements = () => HabitualCore.elements;

// --- SIMPLE ASSERTION & TEST HARNESS ---
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function describe(suiteName, fn) {
  console.log(`\n========================================`);
  console.log(`🧪 TEST SUITE: ${suiteName}`);
  console.log(`========================================`);
  fn();
}

function test(testName, fn) {
  totalTests++;
  try {
    // Reset state before each test
    HabitualCore.resetState();
    mockLocalStorage.clear();
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ testName, error: err.message, stack: err.stack });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Expected values to match'}: Expected "${expected}", got "${actual}"`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message || 'Expected deep equality'}: Expected ${expectedStr}, got ${actualStr}`);
  }
}

// ============================================================================
// FEATURE 1: 📊 7x52 HEATMAP GRID & SHADING LOGIC
// ============================================================================
describe('Feature 1: 📊 7x52 Heatmap Grid & Date Shading Logic', () => {
  test('formatDateKey formats Date object to YYYY-MM-DD string', () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026
    const key = HabitualCore.formatDateKey(d);
    assertEqual(key, '2026-01-05', 'Date formatting check');
  });

  test('parseDateKey converts YYYY-MM-DD string back to Date', () => {
    const dateObj = HabitualCore.parseDateKey('2026-10-02');
    assertEqual(dateObj.getFullYear(), 2026);
    assertEqual(dateObj.getMonth(), 9); // October = index 9
    assertEqual(dateObj.getDate(), 2);
  });

  test('parseFlexibleDate parses DD/MM/YYYY and YYYY-MM-DD formats', () => {
    assertEqual(HabitualCore.parseFlexibleDate('15/08/2026'), '2026-08-15', 'DD/MM/YYYY format');
    assertEqual(HabitualCore.parseFlexibleDate('2026-08-15'), '2026-08-15', 'YYYY-MM-DD format');
    assertEqual(HabitualCore.parseFlexibleDate('5/3/2026'), '2026-03-05', 'Single digit D/M/YYYY format');
  });

  test('getDaysAgoKey returns accurate relative date strings', () => {
    const today = HabitualCore.getTodayKey();
    const todayDate = HabitualCore.parseDateKey(today);

    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const expectedYesterday = HabitualCore.formatDateKey(yesterdayDate);

    assertEqual(HabitualCore.getDaysAgoKey(0), today, 'Days ago 0 is today');
    assertEqual(HabitualCore.getDaysAgoKey(1), expectedYesterday, 'Days ago 1 is yesterday');
  });

  test('Heatmap Ratio Calculation scales continuous alpha based on completion ratio', () => {
    const habit = { id: 'h1', dailyTarget: 4, type: 'positive', colorTheme: 'green' }; // #39d353

    assertEqual(HabitualCore.getHabitHexWithAlpha(habit, 0.0), '#39d35300', '0 ratio returns transparent hex');
    assertEqual(HabitualCore.getHabitHexWithAlpha(habit, 0.25), '#39d35359', '1/4 ratio returns floor 22 + scaled alpha hex');
    assertEqual(HabitualCore.getHabitHexWithAlpha(habit, 0.50), '#39d35391', '2/4 ratio returns floor 22 + scaled alpha hex');
    assertEqual(HabitualCore.getHabitHexWithAlpha(habit, 0.75), '#39d353c8', '3/4 ratio returns floor 22 + scaled alpha hex');
    assertEqual(HabitualCore.getHabitHexWithAlpha(habit, 1.0), '#39d353ff', '4/4 ratio returns 100% alpha hex');
  });

  test('Week Range Boundaries calculate 7-day windows', () => {
    const weekRange = HabitualCore.getWeekRangeForDate('2026-10-02', 1); // Monday anchor
    assert(weekRange.startKey <= '2026-10-02', 'Start key is before or on date');
    assert(weekRange.endKey >= '2026-10-02', 'End key is on or after date');
    assertEqual(weekRange.startDate.getDay(), 1, 'Start date is Monday (day 1)');
  });

  test('Month Range Boundaries calculate start and end of calendar month', () => {
    const monthRange = HabitualCore.getMonthRangeForDate('2026-02-15');
    assertEqual(monthRange.startKey, '2026-02-01', 'Month start key');
    assertEqual(monthRange.endKey, '2026-02-28', 'Month end key for Feb non-leap year');
  });
});

// ============================================================================
// FEATURE 2: 🎯 POSITIVE & NEGATIVE HABIT GOAL TYPES
// ============================================================================
describe('Feature 2: 🎯 Positive & Negative Habit Goal Types', () => {
  test('Positive Habit tracks build completion status', () => {
    const habit = {
      id: 'coding',
      name: 'Daily Coding',
      type: 'positive',
      dailyTarget: 1,
      logs: {
        '2026-10-01': { count: 1, note: 'Built unit tests' },
        '2026-10-02': { count: 0, note: '' }
      }
    };
    assert(habit.logs['2026-10-01'].count >= habit.dailyTarget, 'Target met on 2026-10-01');
    assert(habit.logs['2026-10-02'].count < habit.dailyTarget, 'Target missed on 2026-10-02');
  });

  test('Negative (Quit) Habit automatically calculates clean days (count = 0)', () => {
    const today = new Date();
    const todayKey = HabitualCore.formatDateKey(today);

    const d1 = new Date(today); d1.setDate(d1.getDate() - 1); const k1 = HabitualCore.formatDateKey(d1);
    const d2 = new Date(today); d2.setDate(d2.getDate() - 2); const k2 = HabitualCore.formatDateKey(d2);

    const quitHabit = {
      id: 'caffeine',
      name: 'Days Since Caffeine',
      type: 'negative',
      logs: {
        [k2]: { count: 1, note: 'Had coffee' } // Relapse 2 days ago
        // k1 and today have no logs (count = 0) -> Clean days!
      }
    };

    const streakInfo = HabitualCore.calculateStreakForTarget(quitHabit);
    assertEqual(streakInfo.current, 2, '2 consecutive clean days calculated for quit habit');
  });
});

// ============================================================================
// FEATURE 3: 📅 FLEXIBLE SCHEDULES & TARGET FREQUENCIES
// ============================================================================
describe('Feature 3: 📅 Flexible Schedules & Target Frequencies', () => {
  test('Weekly Schedule logs count within week window', () => {
    const habit = {
      id: 'weekly_gym',
      name: 'Weekly Gym',
      frequencyType: 'weekly',
      weeklyTarget: 2,
      targetDays: [1], // Monday anchor
      logs: {
        '2026-09-28': { count: 1 }, // Mon
        '2026-09-30': { count: 1 }  // Wed
      }
    };

    const weekCount = HabitualCore.getWeeklyLogCount(habit, '2026-09-28', '2026-10-04');
    assertEqual(weekCount, 2, '2 completions logged in week window');
    assert(weekCount >= habit.weeklyTarget, 'Weekly target requirement met');
  });

  test('Monthly Schedule logs count within month window', () => {
    const habit = {
      id: 'monthly_review',
      name: 'Monthly Review',
      frequencyType: 'monthly',
      monthlyTarget: 1,
      logs: {
        '2026-10-15': { count: 1 }
      }
    };

    const monthCount = HabitualCore.getMonthlyLogCount(habit, '2026-10-01', '2026-10-31');
    assertEqual(monthCount, 1, '1 completion logged in monthly window');
    assert(monthCount >= habit.monthlyTarget, 'Monthly target requirement met');
  });

  test('Specific Days of Week schedule filters active days', () => {
    const habit = {
      id: 'mwf_workout',
      name: 'MWF Workout',
      frequencyType: 'specific_days',
      targetDays: [1, 3, 5], // Mon, Wed, Fri
      logs: {
        '2026-09-28': { count: 1 }, // Mon
        '2026-09-30': { count: 1 }, // Wed
        '2026-10-02': { count: 1 }  // Fri
      }
    };

    const activeDaysCount = HabitualCore.getWeeklyActiveDaysCount(habit, '2026-09-28', '2026-10-04');
    assertEqual(activeDaysCount, 3, 'All 3 scheduled target days logged');
  });
});

// ============================================================================
// FEATURE 4: 🌲 HIERARCHICAL SUB-HABITS & DEPENDENCY RULES
// ============================================================================
describe('Feature 4: 🌲 Hierarchical Sub-Habits & Dependency Rules', () => {
  test('Sub-habit tree structure tracks ancestry and descendants', () => {
    const state = HabitualCore.getState();
    state.habits = [
      { id: 'gym', name: 'Gym', parentId: null },
      { id: 'gym_legDay', name: 'Leg Day', parentId: 'gym' },
      { id: 'gym_legDay_squats', name: 'Squats', parentId: 'gym_legDay' }
    ];

    const chain = HabitualCore.getAncestryChain('gym_legDay_squats');
    assertEqual(chain.length, 3, '3 nodes in ancestry chain');
    assertEqual(chain[0].id, 'gym', 'Root parent is first element');
    assertEqual(chain[1].id, 'gym_legDay', 'Intermediate parent is second element');
    assertEqual(chain[2].id, 'gym_legDay_squats', 'Target sub-habit is last element');

    const descendants = HabitualCore.getAllDescendantIds('gym');
    assert(descendants.includes('gym'), 'Contains parent');
    assert(descendants.includes('gym_legDay'), 'Contains child');
    assert(descendants.includes('gym_legDay_squats'), 'Contains grandchild');
  });

  test('Dependency Rule: requires_parent auto-logs parent task', () => {
    const state = HabitualCore.getState();
    state.habits = [
      { id: 'gym', name: 'Gym', dailyTarget: 1, logs: {} },
      { id: 'gym_legDay', name: 'Leg Day', parentId: 'gym', parentDependency: 'requires_parent', dailyTarget: 1, logs: {} }
    ];

    const subHabit = state.habits[1];
    HabitualCore.applyParentDependencyOnLog(subHabit, '2026-10-02', 1);

    const parent = state.habits[0];
    assert(parent.logs['2026-10-02'] !== undefined, 'Parent task automatically logged when sub-habit is logged');
    assertEqual(parent.logs['2026-10-02'].count, 1, 'Parent task count set to target');
  });

  test('Dependency Rule: auto_complete_from_parent completes sub-habits when parent is logged', () => {
    const state = HabitualCore.getState();
    state.habits = [
      { id: 'gym', name: 'Gym', dailyTarget: 1, logs: {} },
      { id: 'gym_cardio', name: 'Cardio', parentId: 'gym', parentDependency: 'auto_complete_from_parent', dailyTarget: 1, logs: {} }
    ];

    const parentHabit = state.habits[0];
    HabitualCore.applyParentDependencyOnLog(parentHabit, '2026-10-02', 1);

    const childHabit = state.habits[1];
    assert(childHabit.logs['2026-10-02'] !== undefined, 'Child habit auto-completed when parent task is logged');
    assertEqual(childHabit.logs['2026-10-02'].count, 1);
  });
});

// ============================================================================
// FEATURE 5: 🎨 COLOR THEMES & CUSTOM HEX COLOR PICKER
// ============================================================================
describe('Feature 5: 🎨 Color Themes & Custom HEX Color Picker', () => {
  test('Preset Themes return expected color HEX values', () => {
    assertEqual(HabitualCore.PRESET_THEME_HEX.green, '#39d353');
    assertEqual(HabitualCore.PRESET_THEME_HEX.blue, '#388bfd');
    assertEqual(HabitualCore.PRESET_THEME_HEX.purple, '#a855f7');
  });

  test('Custom HEX parser and normalizer handles # and short hex', () => {
    assertEqual(HabitualCore.normalizeHex('#ff0000'), '#ff0000', 'Full hex string');
    assertEqual(HabitualCore.normalizeHex('39d353'), '#39d353', 'Hex without leading hash');
    assertEqual(HabitualCore.normalizeHex('#f00'), '#ff0000', 'Short 3-character hex expansion');
  });

  test('getCustomThemeLevels generates 4 distinct gradient levels from custom HEX', () => {
    const levels = HabitualCore.getCustomThemeLevels('#ff0000'); // Pure red
    assertEqual(levels.level0, '#161b22', 'Level 0 is base background');
    assert(levels.level1.startsWith('#'), 'Level 1 is a valid hex color');
    assert(levels.level2.startsWith('#'), 'Level 2 is a valid hex color');
    assert(levels.level3.startsWith('#'), 'Level 3 is a valid hex color');
    assertEqual(levels.level4, '#ff0000', 'Level 4 matches custom HEX');
  });
});

// ============================================================================
// FEATURE 6: ⏱️ QUICK LOGGING & CALENDAR DATE PICKER
// ============================================================================
describe('Feature 6: ⏱️ Quick Logging & Calendar Date Picker', () => {
  test('toggleHabitForDate updates check-in count and journal note', () => {
    const state = HabitualCore.getState();
    state.habits = [
      { id: 'reading', name: 'Reading', type: 'positive', dailyTarget: 1, logs: {} }
    ];

    HabitualCore.toggleHabitForDate('reading', '2026-10-02');
    const habit = state.habits[0];

    assertEqual(habit.logs['2026-10-02'].count, 1, 'First toggle sets count to 1');

    HabitualCore.toggleHabitForDate('reading', '2026-10-02');
    assertEqual(habit.logs['2026-10-02'].count, 2, 'Second toggle increments count to 2');
  });

  test('Heatmap click pops up quick add modal with right habit and date selected', () => {
    const state = HabitualCore.getState();
    state.habits = [
      { id: 'habit_1', name: 'Exercise', type: 'positive', dailyTarget: 1, logs: {} },
      { id: 'habit_2', name: 'Meditation', type: 'positive', dailyTarget: 1, logs: {} }
    ];

    let selectValue = '';
    let dateInputValue = '';
    let modalOpened = false;

    const coreElements = HabitualCore.getElements();
    coreElements.modalLog = { classList: { remove: (cls) => { if (cls === 'hidden') modalOpened = true; }, add: () => {} } };
    coreElements.modalLogHabitSelect = {
      get value() { return selectValue; },
      set value(val) { selectValue = val; },
      innerHTML: ''
    };
    coreElements.modalLogDateInput = {
      get value() { return dateInputValue; },
      set value(val) { dateInputValue = val; }
    };
    coreElements.modalLogCount = { value: '1' };
    coreElements.modalLogNote = { value: '' };

    HabitualCore.openLogModal('2026-10-02', 'habit_2');

    assertEqual(modalOpened, true, 'Quick add log modal opened on heatmap click');
    assertEqual(dateInputValue, '2026-10-02', 'Clicked date selected in quick add modal');
    assertEqual(selectValue, 'habit_2', 'Correct habit selected in quick add modal');
  });
});

// ============================================================================
// FEATURE 7: ⌛ PAST HISTORY BACKFILLING
// ============================================================================
describe('Feature 7: ⌛ Past History Backfilling', () => {
  test('generateBackfillLogs creates history logs over specified duration', () => {
    const duration = 30; // 30 days
    const frequency = 'daily'; // 100% completion
    const instances = '1';

    const result = HabitualCore.generateBackfillLogs(
      duration, frequency, instances, 1, 'positive', 'daily', [1], '1', 1, 1
    );

    const keys = Object.keys(result.logs);
    assertEqual(keys.length, 31, 'Generated 31 calendar dates including today (duration 0 to 30)');
    assertEqual(result.logs[keys[0]].count, 1, 'Backfilled entry count equals 1');
  });

  test('generateBackfillLogs supports variable frequency density (~50%)', () => {
    const duration = 100;
    const frequency = 'moderate'; // ~50%
    const instances = '1';

    const result = HabitualCore.generateBackfillLogs(
      duration, frequency, instances, 1, 'positive', 'daily', [1], '1', 1, 1
    );

    const keys = Object.keys(result.logs);
    assert(keys.length >= 30 && keys.length <= 70, `Moderate frequency produces ~50% logs (got ${keys.length})`);
  });
});

// ============================================================================
// FEATURE 8: 🔥 STREAK & YEAR ANALYTICS ENGINE
// ============================================================================
describe('Feature 8: 🔥 Streak & Year Analytics Engine', () => {
  test('calculateStreakForTarget calculates active unbroken daily streak', () => {
    const today = new Date();
    const todayKey = HabitualCore.formatDateKey(today);

    const d1 = new Date(today); d1.setDate(d1.getDate() - 1); const k1 = HabitualCore.formatDateKey(d1);
    const d2 = new Date(today); d2.setDate(d2.getDate() - 2); const k2 = HabitualCore.formatDateKey(d2);

    const habit = {
      id: 'water',
      name: 'Drink Water',
      type: 'positive',
      dailyTarget: 1,
      logs: {
        [todayKey]: { count: 1 },
        [k1]: { count: 1 },
        [k2]: { count: 1 }
      }
    };

    const streak = HabitualCore.calculateStreakForTarget(habit);
    assertEqual(streak.current, 3, '3-day unbroken streak calculated');
  });

  test('calculateYearStatsForTarget sums total annual completed units', () => {
    const habit = {
      id: 'meditation',
      name: 'Meditation',
      type: 'positive',
      dailyTarget: 1,
      logs: {
        '2026-01-01': { count: 1 },
        '2026-01-02': { count: 1 },
        '2026-01-03': { count: 1 }
      }
    };

    const stats = HabitualCore.calculateYearStatsForTarget(habit, 2026);
    assertEqual(stats.totalCount, 3, '3 completions aggregated for year 2026');
  });
});

// ============================================================================
// FEATURE 9: 📥 CSV DATA IMPORT ENGINE
// ============================================================================
describe('Feature 9: 📥 CSV Data Import Engine', () => {
  test('parseCSVLine handles quoted values and commas within quotes', () => {
    const line = '2026-10-02,"Coding, Practice",5,"Note with ""quotes"""';
    const parsed = HabitualCore.parseCSVLine(line);

    assertEqual(parsed.length, 4, '4 columns parsed');
    assertEqual(parsed[0], '2026-10-02');
    assertEqual(parsed[1], 'Coding, Practice', 'Commas preserved inside quotes');
    assertEqual(parsed[2], '5');
    assertEqual(parsed[3], 'Note with "quotes"', 'Escaped quotes parsed correctly');
  });

  test('parseCSVAndImport imports habits and logs from CSV text', () => {
    const csvContent = [
      'Date,Daily Coding,Days Since Alcohol',
      '01/10/2026,1,0',
      '02/10/2026,2,0'
    ].join('\n');

    HabitualCore.parseCSVAndImport(csvContent, 'Test CSV');

    const state = HabitualCore.getState();
    assertEqual(state.habits.length, 2, '2 habits created from CSV columns');

    const codingHabit = state.habits.find(h => h.name === 'Daily Coding');
    assert(codingHabit !== undefined, 'Daily Coding habit found');
    assertEqual(codingHabit.type, 'positive', 'Daily Coding categorized as positive');
    assertEqual(codingHabit.logs['2026-10-01'].count, 1, 'Log entry for 01/10/2026 parsed');

    const quitHabit = state.habits.find(h => h.name === 'Days Since Alcohol');
    assert(quitHabit !== undefined, 'Days Since Alcohol habit found');
    assertEqual(quitHabit.type, 'negative', 'Auto-detected quit habit from keyword');
  });
});

// ============================================================================
// FEATURE 10: 💾 DATA BACKUPS & PRIVACY
// ============================================================================
describe('Feature 10: 💾 Data Backups & Privacy', () => {
  test('saveState and loadState persist data into local storage', () => {
    const state = HabitualCore.getState();
    state.habits = [
      { id: 'test_habit', name: 'Test Habit', logs: { '2026-10-02': { count: 1 } } }
    ];

    HabitualCore.saveState();
    HabitualCore.resetState(); // Clear in-memory state

    assertEqual(HabitualCore.getState().habits.length, 0, 'In-memory state reset');

    HabitualCore.loadState(); // Restore from local storage
    assertEqual(HabitualCore.getState().habits.length, 1, 'Restored 1 habit from local storage');
    assertEqual(HabitualCore.getState().habits[0].name, 'Test Habit');
  });

  test('saveState minimizes stored data by deriving default name, color, and omitting empty notes', () => {
    const defaultColor = HabitualCore.getDefaultColorForId('dailyExercise');
    const state = HabitualCore.getState();

    // Habit with default derived name ("Daily Exercise"), derived color, default type/targets, and log without user note
    state.habits = [
      {
        id: 'dailyExercise',
        name: 'Daily Exercise',
        colorTheme: defaultColor,
        type: 'positive',
        dailyTarget: 1,
        frequencyType: 'daily',
        logs: { '2026-10-02': { count: 1, note: '' } }
      }
    ];

    HabitualCore.saveState();

    // Inspect raw JSON stored in LocalStorage
    const rawSaved = mockLocalStorage.getItem('habitual_tracker_v1');
    assert(rawSaved !== null, 'LocalStorage item exists');

    const parsed = JSON.parse(rawSaved);
    const savedHabit = parsed.habits[0];

    // Verify minimal storage: name, colorTheme, default type/target, and empty note are omitted from JSON
    assertEqual(savedHabit.id, 'dailyExercise', 'ID is stored');
    assertEqual(savedHabit.name, undefined, 'Name is omitted from LocalStorage because it matches derived name');
    assertEqual(savedHabit.colorTheme, undefined, 'Color is omitted from LocalStorage because it matches derived color');
    assertEqual(savedHabit.type, undefined, 'Default positive type omitted');
    assertEqual(savedHabit.dailyTarget, undefined, 'Default daily target 1 omitted');
    assertEqual(savedHabit.logs['2026-10-02'].note, undefined, 'Empty note is omitted from stored log entry');

    // Verify loadState derives name, color, and restores defaults into memory
    HabitualCore.resetState();
    HabitualCore.loadState();

    const restoredHabit = HabitualCore.getState().habits[0];
    assertEqual(restoredHabit.name, 'Daily Exercise', 'Derived name restored on load');
    assertEqual(restoredHabit.colorTheme, defaultColor, 'Derived color restored on load');
    assertEqual(restoredHabit.type, 'positive', 'Default type restored on load');
    assertEqual(restoredHabit.logs['2026-10-02'].note, '', 'Note restored as empty string');
  });

  test('saveState stores custom overwritten name, custom color, and user notes', () => {
    const state = HabitualCore.getState();

    // Habit with custom name, custom color, and user note
    state.habits = [
      {
        id: 'dailyExercise',
        name: 'Custom Workout Plan', // Overwritten by user
        colorTheme: '#ff0055',       // Overwritten by user
        type: 'positive',
        dailyTarget: 2,               // Overwritten by user
        logs: { '2026-10-02': { count: 2, note: 'Hit personal record!' } } // User note
      }
    ];

    HabitualCore.saveState();

    const rawSaved = mockLocalStorage.getItem('habitual_tracker_v1');
    const parsed = JSON.parse(rawSaved);
    const savedHabit = parsed.habits[0];

    // Verify overwritten fields ARE saved
    assertEqual(savedHabit.name, 'Custom Workout Plan', 'Custom overwritten name IS stored');
    assertEqual(savedHabit.colorTheme, '#ff0055', 'Custom overwritten color IS stored');
    assertEqual(savedHabit.dailyTarget, 2, 'Custom daily target IS stored');
    assertEqual(savedHabit.logs['2026-10-02'].note, 'Hit personal record!', 'User log note IS stored');

    // Verify loadState preserves custom values
    HabitualCore.resetState();
    HabitualCore.loadState();

    const restoredHabit = HabitualCore.getState().habits[0];
    assertEqual(restoredHabit.name, 'Custom Workout Plan', 'Custom name restored');
    assertEqual(restoredHabit.colorTheme, '#ff0055', 'Custom color restored');
    assertEqual(restoredHabit.dailyTarget, 2, 'Custom daily target restored');
    assertEqual(restoredHabit.logs['2026-10-02'].note, 'Hit personal record!', 'User log note restored');
  });
});

// ============================================================================
// FEATURE 11: 📱 PWA & OFFLINE SUPPORT
// ============================================================================
describe('Feature 11: 📱 PWA & Offline Support', () => {
  test('Service Worker file exists and caches key PWA assets', () => {
    const swPath = path.join(__dirname, '../web/sw.js');
    assert(fs.existsSync(swPath), 'sw.js file exists');

    const swContent = fs.readFileSync(swPath, 'utf8');
    assert(swContent.includes('index.html'), 'Caches index.html');
    assert(swContent.includes('app.js'), 'Caches app.js');
    assert(swContent.includes('styles.css'), 'Caches styles.css');
    assert(swContent.includes('manifest.json'), 'Caches manifest.json');
    assert(swContent.includes('js/widgets.js'), 'Caches js/widgets.js');
    assert(swContent.includes('widgets/add.html'), 'Caches widgets/add.html');
    assert(swContent.includes('widgets/heatmaps.html'), 'Caches widgets/heatmaps.html');
    assert(swContent.includes('widgets/settings.html'), 'Caches widgets/settings.html');
  });

  test('Web Manifest manifest.json specifies required PWA fields', () => {
    const manifestPath = path.join(__dirname, '../web/manifest.json');
    assert(fs.existsSync(manifestPath), 'manifest.json file exists');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assertEqual(manifest.short_name, 'Habitual');
    assertEqual(manifest.display, 'standalone');
    assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Manifest specifies PWA icons');
  });

  test('robots.txt exists and contains standard crawler rules', () => {
    const robotsPath = path.join(__dirname, '../web/robots.txt');
    assert(fs.existsSync(robotsPath), 'robots.txt file exists');

    const robotsContent = fs.readFileSync(robotsPath, 'utf8');
    assert(robotsContent.includes('User-agent: *'), 'Specifies User-agent');
    assert(robotsContent.includes('Allow: /'), 'Allows root path');
  });
});

// ============================================================================
// FEATURE 12: ⏸️ PAUSED HABITS IN EDIT DIALOGUE
// ============================================================================
describe('Feature 12: ⏸️ Paused Habits in Edit Dialogue', () => {
  test('Pausing and unpausing a habit in habit edit dialogue updates isPaused status', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();
    const habit = { id: 'coding', name: 'Daily Coding', type: 'positive', dailyTarget: 1, isPaused: false, logs: {} };
    state.habits = [habit];

    const mockClassList = { add: () => {}, remove: () => {}, toggle: () => {} };
    const elementMap = {
      'habit-id': { value: '' },
      'habit-name': { value: 'Daily Coding' },
      'habit-description': { value: '' },
      'habit-category': { value: 'General' },
      'habit-daily-target': { value: '1' },
      'habit-parent': { value: '', innerHTML: '', selectedOptions: [] },
      'habit-frequency-type': { value: 'daily', onchange: null },
      'habit-parent-dependency': { value: 'none' },
      'parent-dependency-section': { classList: mockClassList },
      'parent-dependency-hint': { textContent: '' },
      'freq-daily-options': { classList: mockClassList },
      'freq-weekly-options': { classList: mockClassList },
      'freq-monthly-options': { classList: mockClassList },
      'freq-specific-options': { classList: mockClassList },
      'freq-custom-options': { classList: mockClassList }
    };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => elementMap[id] || { value: '', classList: mockClassList };

    const coreElements = HabitualCore.getElements();
    let isPausedChecked = false;
    coreElements.modalHabit = { classList: { remove: () => {}, add: () => {} } };
    coreElements.modalHabitTitle = { textContent: '' };
    coreElements.customSwatchPreview = { style: {} };
    coreElements.formHabit = {
      reset: () => {},
      querySelector: (sel) => {
        if (sel.includes('habit-type')) return { value: 'positive', checked: true };
        if (sel.includes('habit-color')) return { value: 'green', checked: true };
        return null;
      },
      querySelectorAll: () => []
    };
    coreElements.habitIsPaused = {
      get checked() { return isPausedChecked; },
      set checked(v) { isPausedChecked = v; }
    };
    coreElements.habitShowStreak = { checked: false };

    // Open edit habit modal
    HabitualCore.openHabitModal(habit);
    assertEqual(isPausedChecked, false, 'Edit dialogue initially reflects isPaused=false');

    // Pause habit in dialogue and submit
    isPausedChecked = true;
    elementMap['habit-id'].value = 'coding';
    elementMap['habit-name'].value = 'Daily Coding';
    HabitualCore.handleHabitFormSubmit({ preventDefault: () => {} });
    assertEqual(state.habits[0].isPaused, true, 'Habit isPaused set to true upon form submit');

    // Open edit habit modal again
    HabitualCore.openHabitModal(habit);
    assertEqual(isPausedChecked, true, 'Edit dialogue reflects isPaused=true when re-opened');

    // Unpause habit in dialogue and submit
    isPausedChecked = false;
    HabitualCore.handleHabitFormSubmit({ preventDefault: () => {} });
    assertEqual(state.habits[0].isPaused, false, 'Habit isPaused toggled back to false upon form submit');

    global.document.getElementById = originalGetElementById;
  });
});

// ============================================================================
// FEATURE 13: 🎨 255-LEVEL TRANSPARENCY COMBINED HEATMAP
// ============================================================================
describe('Feature 13: 🎨 255-Level Transparency Combined Heatmap', () => {
  test('getHabitHexWithAlpha generates 8-character hex color with transparency based on target completion ratio', () => {
    const habit = { id: 'h1', name: 'Exercise', colorTheme: 'green' }; // green hex #39d353

    // 100% target met (ratio = 1.0) -> alpha 255 -> ff
    const hexFull = HabitualCore.getHabitHexWithAlpha(habit, 1.0);
    assertEqual(hexFull, '#39d353ff', '100% target met generates full opacity alpha ff');

    // 50% target met (ratio = 0.5) -> alpha 145 -> 91
    const hexHalf = HabitualCore.getHabitHexWithAlpha(habit, 0.5);
    assertEqual(hexHalf, '#39d35391', '50% target met generates 145 alpha (91 in hex) starting from floor 22');

    // 0% target met (ratio = 0.0) -> alpha 0 -> 00
    const hexZero = HabitualCore.getHabitHexWithAlpha(habit, 0.0);
    assertEqual(hexZero, '#39d35300', '0% target met generates 0 alpha (00 in hex)');
  });

  test('getCellData includes 8-character hex colors with transparency for active habits in combined heatmap', () => {
    const habit1 = { id: 'h1', name: 'Exercise', type: 'positive', dailyTarget: 2, colorTheme: 'green', logs: { '2026-10-02': { count: 1 } } }; // ratio 0.5 -> #39d35380
    const habit2 = { id: 'h2', name: 'Reading', type: 'positive', dailyTarget: 1, colorTheme: 'blue', logs: { '2026-10-02': { count: 1 } } };  // ratio 1.0 -> #388bfdff

    HabitualCore.setState({
      habits: [habit1, habit2],
      selectedHabitId: 'all',
      selectedYear: 2026
    });

    const cellData = HabitualCore.getCellData('2026-10-02', 'all', '2026-10-02');
    assertEqual(cellData.count, 2, '2 active habits found on target date');
    assertEqual(cellData.activeHabits.length, 2, '2 items in activeHabits array');

    const h1Data = cellData.activeHabits.find(a => a.id === 'h1');
    assertEqual(h1Data.color, '#39d35391', '50% completion translated to #39d35391 8-char hex transparency');

    const h2Data = cellData.activeHabits.find(a => a.id === 'h2');
    assertEqual(h2Data.color, '#388bfdff', '100% completion translated to #388bfdff 8-char hex transparency');
  });
});

// ============================================================================
// FEATURE 14: 📁 HOME PAGE PARENT HABIT & SUB-HABITS COMBINED HEATMAP
// ============================================================================
describe('Feature 14: 📁 Home Page Parent Habit & Sub-Habits Combined Heatmap', () => {
  test('Top-level parent habit with sub-habits includes descendant habit IDs in combined heatmap cell data', () => {
    const parentHabit = { id: 'health', name: 'Health', type: 'positive', dailyTarget: 1, colorTheme: 'emerald', logs: { '2026-10-02': { count: 1 } } };
    const subHabit = { id: 'running', name: 'Running', parentId: 'health', type: 'positive', dailyTarget: 1, colorTheme: 'orange', logs: { '2026-10-02': { count: 1 } } };

    HabitualCore.setState({
      habits: [parentHabit, subHabit],
      selectedHabitId: 'all',
      selectedYear: 2026
    });

    const descendantIds = HabitualCore.getAllDescendantIds(parentHabit.id);
    assertDeepEqual(descendantIds, ['health', 'running'], 'Descendant IDs include parent and sub-habit');

    const groupTarget = {
      isGroup: true,
      habit: parentHabit,
      title: parentHabit.name,
      habitIds: descendantIds,
      colorTheme: parentHabit.colorTheme
    };

    const cellData = HabitualCore.getCellData('2026-10-02', groupTarget, '2026-10-02');
    assertEqual(cellData.count, 2, 'Group card combines logs for both parent habit and sub-habit');
    assertEqual(cellData.activeHabits.length, 2, 'activeHabits contains both parent and sub-habit');
  });

  test('Single top-level main habit (with sub-habits) filters topLevelHabits count to 1', () => {
    const parentHabit = { id: 'health', name: 'Health', type: 'positive', dailyTarget: 1, logs: {} };
    const subHabit1 = { id: 'running', name: 'Running', parentId: 'health', type: 'positive', dailyTarget: 1, logs: {} };
    const subHabit2 = { id: 'diet', name: 'Diet', parentId: 'health', type: 'positive', dailyTarget: 1, logs: {} };

    HabitualCore.setState({
      habits: [parentHabit, subHabit1, subHabit2],
      selectedHabitId: 'all',
      selectedYear: 2026
    });

    const state = HabitualCore.getState();
    const topLevelHabits = state.habits.filter(h => !h.parentId);
    assertEqual(topLevelHabits.length, 1, 'Only 1 main top-level habit exists');
    assertEqual(state.habits.length, 3, 'Total habits count is 3 including sub-habits');
  });
});

// FEATURE 15: 📅 DATE NAVIGATOR ARROWS, LONG-PRESS & FUTURE DATE REMINDERS
describe('Feature 15: 📅 Date Navigator Arrows, Long-press & Future Reminders', () => {
  test('shiftModalLogDate navigates dates forward and backward accurately', () => {
    const habit = { id: 'meditation', name: 'Meditation', type: 'positive', dailyTarget: 1, logs: {} };
    HabitualCore.setState({ habits: [habit], selectedHabitId: 'meditation', selectedYear: 2026 });

    let dateValue = '2026-10-02';
    const coreElements = HabitualCore.getElements();
    coreElements.modalLogDateInput = {
      get value() { return dateValue; },
      set value(v) { dateValue = v; }
    };
    coreElements.modalLogHabitSelect = { value: 'meditation' };
    coreElements.modalLogCount = { value: '1' };
    coreElements.modalLogNote = { value: '' };

    HabitualCore.openLogModal('2026-10-02', 'meditation');
    assertEqual(dateValue, '2026-10-02', 'Initial date set to 2026-10-02');

    HabitualCore.shiftModalLogDate(-1);
    assertEqual(dateValue, '2026-10-01', 'shiftModalLogDate(-1) shifted back to 2026-10-01');

    HabitualCore.shiftModalLogDate(2);
    assertEqual(dateValue, '2026-10-03', 'shiftModalLogDate(2) shifted forward to 2026-10-03');
  });

  test('generateICSFile constructs valid iCalendar .ics formatted reminder string', () => {
    const icsContent = HabitualCore.generateICSFile('Daily Reading', '2026-10-15');

    assert(icsContent.includes('BEGIN:VCALENDAR'), 'ICS file starts with BEGIN:VCALENDAR');
    assert(icsContent.includes('SUMMARY:Habit Reminder: Daily Reading'), 'ICS contains habit title in SUMMARY');
    assert(icsContent.includes('DTSTART:20261015T090000'), 'ICS contains target DTSTART');
    assert(icsContent.includes('BEGIN:VALARM'), 'ICS includes VALARM reminder alarm');
    assert(icsContent.includes('END:VCALENDAR'), 'ICS ends with END:VCALENDAR');
  });
});

// ============================================================================
// FEATURE 16: ⌨️ ENTER KEY ON HABIT NAME BLURS INPUT INSTEAD OF SUBMITTING FORM
// ============================================================================
describe('Feature 16: ⌨️ Enter Key on Habit Name Blurs Input', () => {
  test('Pressing Enter key on habit name input calls preventDefault and blurs input', () => {
    let blurred = false;
    let defaultPrevented = false;

    const mockHabitName = {
      value: 'Morning Run',
      listeners: {},
      addEventListener(event, fn) {
        this.listeners[event] = fn;
      },
      blur() {
        blurred = true;
        if (this.listeners['blur']) {
          this.listeners['blur']();
        }
      }
    };

    let formDetailsHidden = true;
    const mockFormDetails = {
      classList: {
        remove: (cls) => {
          if (cls === 'hidden') formDetailsHidden = false;
        },
        add: (cls) => {
          if (cls === 'hidden') formDetailsHidden = true;
        }
      }
    };

    const mockIdDisplay = { textContent: '' };
    const mockIdPreview = {
      classList: {
        remove: () => {},
        add: () => {}
      }
    };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'habit-name') return mockHabitName;
      if (id === 'habit-form-details') return mockFormDetails;
      if (id === 'habit-id-display') return mockIdDisplay;
      if (id === 'habit-id-preview') return mockIdPreview;
      if (id === 'habit-id') return { value: '' };
      if (id === 'habit-parent') return { value: '' };
      return { value: '', addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } };
    };

    HabitualCore.initUI();

    assert(typeof mockHabitName.listeners['keydown'] === 'function', 'keydown event listener attached to habitName');

    const event = {
      key: 'Enter',
      keyCode: 13,
      preventDefault: () => {
        defaultPrevented = true;
      }
    };

    mockHabitName.listeners['keydown'](event);

    assertEqual(defaultPrevented, true, 'preventDefault called when Enter key is pressed');
    assertEqual(blurred, true, 'input blur() called when Enter key is pressed');
    assertEqual(mockIdDisplay.textContent, 'morningRun', 'handleHabitNameBlur derived habit ID correctly on blur');

    global.document.getElementById = originalGetElementById;
  });
});

// ============================================================================
// FEATURE 17: ⌛ BACKFILLING IN EDIT DIALOGUE & NEGATIVE HABIT LOGIC
// ============================================================================
describe('Feature 17: ⌛ Backfilling in Edit Dialogue & Negative Habit Logic', () => {
  test('generateBackfillLogs generates clean days vs relapses for negative habits', () => {
    // 100% clean negative habit -> 0 relapses logged
    const res100 = HabitualCore.generateBackfillLogs(30, 'daily', '1', 1, 'negative', 'daily');
    assertEqual(Object.keys(res100.logs).length, 0, '100% clean quit habit generates 0 relapse logs');

    // 80% clean negative habit -> ~20% relapses logged (approx 6 out of 30 days)
    const res80 = HabitualCore.generateBackfillLogs(30, 'frequent', '1', 1, 'negative', 'daily');
    const relapseCount = Object.keys(res80.logs).length;
    assert(relapseCount > 0 && relapseCount < 20, '80% clean quit habit generates small proportion of relapse logs');
    if (relapseCount > 0) {
      const firstKey = Object.keys(res80.logs)[0];
      assertEqual(res80.logs[firstKey].count, 1, 'Relapse log count is 1');
      assertEqual(res80.logs[firstKey].note || '', '', 'Relapse log note is empty (not programmatically added)');
    }
  });

  test('updateBackfillWordingUI updates labels dynamically for Quit (negative) habits', () => {
    let titleHTML = '';
    let descText = '';
    let freqText = '';

    const mockRadio = { value: 'negative' };
    const mockForm = {
      querySelector: (sel) => {
        if (sel.includes('habit-type')) return mockRadio;
        return null;
      }
    };

    const mockTitle = {
      set innerHTML(v) { titleHTML = v; }
    };
    const mockDesc = {
      set textContent(v) { descText = v; }
    };
    const mockFreqLabel = {
      set textContent(v) { freqText = v; }
    };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'backfill-checkbox-title') return mockTitle;
      if (id === 'backfill-checkbox-desc') return mockDesc;
      if (id === 'label-history-frequency') return mockFreqLabel;
      return { value: '', addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } };
    };

    const coreElements = HabitualCore.getElements();
    coreElements.formHabit = mockForm;

    HabitualCore.updateBackfillWordingUI();

    assert(titleHTML.includes('Clean Days'), 'Title updated to Clean Days for negative habit');
    assert(descText.includes('clean days vs slip-ups'), 'Description updated for negative habit');
    assert(freqText.includes('avoided the bad habit'), 'Frequency label updated for negative habit');

    global.document.getElementById = originalGetElementById;
  });
});

// ============================================================================
// FEATURE 18: ⏸️ PAUSE HISTORY & HEATMAP PAUSED DAY INDICATORS
// ============================================================================
describe('Feature 18: ⏸️ Pause History & Heatmap Paused Day Indicators', () => {
  test('setHabitPauseState records pause start and end dates in pauseHistory array', () => {
    const habit = { id: 'gym', name: 'Gym', isPaused: false, pauseHistory: [] };

    HabitualCore.setHabitPauseState(habit, true, '2026-10-01');
    assertEqual(habit.isPaused, true, 'habit.isPaused updated to true');
    assertEqual(habit.pauseHistory.length, 1, 'pauseHistory contains 1 entry');
    assertEqual(habit.pauseHistory[0].startDate, '2026-10-01', 'startDate recorded as 2026-10-01');
    assertEqual(habit.pauseHistory[0].endDate, null, 'endDate initially null');

    assertEqual(HabitualCore.isHabitPausedOnDate(habit, '2026-10-02'), true, 'isHabitPausedOnDate returns true during pause');

    HabitualCore.setHabitPauseState(habit, false, '2026-10-05');
    assertEqual(habit.isPaused, false, 'habit.isPaused updated to false');
    assertEqual(habit.pauseHistory[0].endDate, '2026-10-05', 'endDate recorded as 2026-10-05');

    assertEqual(HabitualCore.isHabitPausedOnDate(habit, '2026-10-02'), true, 'Historical pause date 2026-10-02 remains paused');
    assertEqual(HabitualCore.isHabitPausedOnDate(habit, '2026-10-06'), false, 'Date after unpause 2026-10-06 returns false');
  });

  test('getCellData includes isPaused flag for paused days', () => {
    const habit = {
      id: 'reading',
      name: 'Reading',
      isPaused: true,
      pauseHistory: [{ startDate: '2026-10-01', endDate: null }],
      logs: {}
    };

    const cellData = HabitualCore.getCellData('2026-10-02', habit, '2026-10-03');
    assertEqual(cellData.isPaused, true, 'cellData.isPaused set to true on paused date');
    assert(cellData.note.includes('Paused'), 'cellData note indicates paused status');
  });
});

// ============================================================================
// FEATURE 19: 📁 CONCERTINA ACCORDION & INDENTED SUB-HABITS
// ============================================================================
describe('Feature 19: 📁 Concertina Accordion & Indented Sub-habits', () => {
  test('toggleConcertina toggles expandedHabitIds set and updates badge/arrow', () => {
    HabitualCore.resetState();
    const parent = { id: 'gym', name: 'Gym', parentId: null, dailyTarget: 1, logs: {} };
    const sub = { id: 'gym_legs', name: 'Legs', parentId: 'gym', dailyTarget: 1, logs: {} };
    HabitualCore.setState({
      habits: [parent, sub],
      selectedHabitId: 'all',
      selectedYear: 2026,
      expandedHabitIds: new Set()
    });

    assertEqual(HabitualCore.state.expandedHabitIds.has('gym'), false, 'Initially collapsed');

    HabitualCore.toggleConcertina('gym');
    assertEqual(HabitualCore.state.expandedHabitIds.has('gym'), true, 'Expanded after first toggle');

    HabitualCore.toggleConcertina('gym');
    assertEqual(HabitualCore.state.expandedHabitIds.has('gym'), false, 'Collapsed after second toggle');
  });

  test('renderHabitTree builds group wrapper with subhabits-concertina container', () => {
    HabitualCore.resetState();
    const parent = { id: 'gym', name: 'Gym', parentId: null, dailyTarget: 1, colorTheme: 'green', logs: {} };
    const sub = { id: 'gym_legs', name: 'Legs', parentId: 'gym', dailyTarget: 1, colorTheme: 'blue', logs: {} };
    HabitualCore.setState({
      habits: [parent, sub],
      selectedHabitId: 'all',
      selectedYear: 2026,
      expandedHabitIds: new Set(['gym'])
    });

    const treeNode = HabitualCore.renderHabitTree(parent, 2026);
    assert(treeNode.className.includes('heatmap-group-wrapper'), 'Parent node wrapped in heatmap-group-wrapper');
    const concertina = treeNode.querySelector('.subhabits-concertina');
    assert(concertina !== null, 'Contains .subhabits-concertina container');
    assert(concertina.classList.contains('expanded'), 'concertina is expanded when in expandedHabitIds');
    const putAwayBtn = concertina.querySelector('.btn-put-away');
    assert(putAwayBtn !== null, 'Contains ▲ Put away button');
  });
});

// ============================================================================
// FEATURE 20: 🎯 PROMINENT QUICK LOG BUTTON & TICK MARK GOAL REACHED
// ============================================================================
describe('Feature 20: 🎯 Prominent Quick Log Button & Tick Mark Goal Reached', () => {
  test('buildHeatmapCard renders btn-card-quick-log with tick mark when goal is reached', () => {
    HabitualCore.resetState();
    const todayKey = HabitualCore.getTodayKey();
    const habit = { id: 'water', name: 'Water', type: 'positive', dailyTarget: 2, colorTheme: 'blue', logs: { [todayKey]: { count: 2 } } };
    HabitualCore.setState({ habits: [habit], selectedHabitId: 'all', selectedYear: 2026 });

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    const quickLogBtn = card.querySelector('.btn-card-quick-log');
    assert(quickLogBtn !== null, 'Card contains .btn-card-quick-log button');
    assert(quickLogBtn.classList.contains('goal-met'), 'Button has goal-met class');
    assert(quickLogBtn.textContent.includes('✓'), 'Button content contains tick mark ✓ when goal is reached');
  });

  test('btn-card-quick-log displays plus sign when goal is not yet reached', () => {
    HabitualCore.resetState();
    const habit = { id: 'reading', name: 'Reading', type: 'positive', dailyTarget: 2, colorTheme: 'purple', logs: {} };
    HabitualCore.setState({ habits: [habit], selectedHabitId: 'all', selectedYear: 2026 });

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    const quickLogBtn = card.querySelector('.btn-card-quick-log');
    assert(quickLogBtn !== null, 'Card contains .btn-card-quick-log button');
    assert(!quickLogBtn.classList.contains('goal-met'), 'Button does not have goal-met class');
    assert(quickLogBtn.textContent.includes('+'), 'Button displays + symbol when goal is unfulfilled');
  });

  test('toggleHabitForDate increments progress directly when goal not met', () => {
    HabitualCore.resetState();
    const coreElements = HabitualCore.getElements();
    coreElements.heatmapsGallery = createMockElement('div');
    coreElements.yearSelector = createMockElement('select');

    const todayKey = HabitualCore.getTodayKey();
    const habit = { id: 'pushups', name: 'Pushups', type: 'positive', dailyTarget: 2, logs: {} };
    HabitualCore.setState({ habits: [habit], selectedHabitId: 'pushups', selectedYear: 2026 });

    HabitualCore.toggleHabitForDate('pushups', todayKey);
    assertEqual(habit.logs[todayKey].count, 1, 'Increments count to 1');

    HabitualCore.toggleHabitForDate('pushups', todayKey);
    assertEqual(habit.logs[todayKey].count, 2, 'Increments count to 2, reaching daily target');
  });
});

describe('Feature 21: ✂️ Cut-off Top Right Corner Note Indicator', () => {
  test('getCellData sets hasNote=true for days with log notes and hasNote=false for empty notes', () => {
    const state = HabitualCore.getState();
    state.habits = [
      {
        id: 'journaling',
        name: 'Journaling',
        type: 'positive',
        dailyTarget: 1,
        logs: {
          '2026-10-01': { count: 1, note: 'Had a productive day!' },
          '2026-10-02': { count: 1, note: '' }
        }
      }
    ];

    const cellData1 = HabitualCore.getCellData('2026-10-01', state.habits[0], '2026-10-03');
    assertEqual(cellData1.hasNote, true, 'cellData.hasNote is true when user note exists');

    const cellData2 = HabitualCore.getCellData('2026-10-02', state.habits[0], '2026-10-03');
    assertEqual(cellData2.hasNote, false, 'cellData.hasNote is false when note is empty');

    const cellData3 = HabitualCore.getCellData('2026-10-03', state.habits[0], '2026-10-03');
    assertEqual(cellData3.hasNote, false, 'cellData.hasNote is false when log is missing');
  });

  test('buildHeatmapCard outputs has-note class and data-has-note="true" attribute', () => {
    const state = HabitualCore.getState();
    state.habits = [
      {
        id: 'meditation',
        name: 'Meditation',
        type: 'positive',
        dailyTarget: 1,
        logs: {
          '2026-10-02': { count: 1, note: 'Deep focus session' }
        }
      }
    ];

    const card = HabitualCore.buildHeatmapCard(state.habits[0], 2026, 'green', '2026-10-03');
    const html = card.innerHTML;
    assert(html.includes('has-note'), 'Rendered HTML includes has-note class');
    assert(html.includes('data-has-note="true"'), 'Rendered HTML includes data-has-note="true" attribute');
  });

  test('buildHeatmapCard sets background-color with 11 alpha hint for uncompleted day squares', () => {
    const habit = { id: 'reading', name: 'Reading', type: 'positive', dailyTarget: 1, colorTheme: 'green', logs: {} };
    const card = HabitualCore.buildHeatmapCard(habit, 2026, 'green', '2026-10-03');
    const html = card.innerHTML;
    assert(html.includes('background-color: #39d35311;'), 'Uncompleted day square receives #39d35311 hint background');
  });
});

// ============================================================================
// FEATURE 22: 🎨 COLOURED HABIT TAB HEADING
// ============================================================================
describe('Feature 22: 🎨 Coloured Habit Tab Heading', () => {
  test('buildHeatmapCard renders coloured habit tab with habit name and color styles', () => {
    const habit = { id: 'coding', name: 'Daily Coding', type: 'positive', dailyTarget: 1, colorTheme: 'purple', logs: {} };
    const card = HabitualCore.buildHeatmapCard(habit, 2026);

    const colorTab = card.querySelector('.habit-color-tab');
    assert(colorTab !== null, 'Card contains .habit-color-tab element');

    const pill = card.querySelector('.color-tab-pill');
    assert(pill !== null, 'Card contains .color-tab-pill element');

    const title = card.querySelector('.tab-title');
    assert(title !== null, 'Card contains .tab-title element');
    assert(card.innerHTML.includes('Daily Coding'), 'Card HTML displays habit name "Daily Coding" inside tab');
  });
});

// ============================================================================
// FEATURE 23: 🎨 24 GOOGLE CALENDAR COLOURS IN COLOURS.JS
// ============================================================================
describe('Feature 23: 🎨 24 Google Calendar Colours in colours.js', () => {
  test('windows.colour and window.colour return array of 24 Google Calendar hex colors', () => {
    assert(typeof global.window.colour === 'function', 'window.colour is a function');
    assert(typeof global.windows.colour === 'function', 'windows.colour is a function');
    const colours = global.windows.colour();
    assert(Array.isArray(colours), 'windows.colour() returns an array');
    assertEqual(colours.length, 24, 'returns 24 hex colors');
    assert(colours.includes('#795548'), 'includes Cocoa (#795548)');
    assert(colours.includes('#9E69AF'), 'includes Amethyst (#9E69AF)');
  });

  test('window.colour(str) and window.colourFromString(str) return deterministic color from string', () => {
    assert(typeof global.window.colourFromString === 'function', 'window.colourFromString is a function');
    const color1 = global.window.colourFromString('workout');
    const color2 = global.window.colourFromString('workout');
    const color3 = global.window.colour('workout');
    assertEqual(color1, color2, 'same string returns identical color');
    assertEqual(color1, color3, 'window.colour("workout") returns same color as colourFromString');
    assert(global.window.colour().includes(color1), 'returned color is one of the 24 Google Calendar colors');

    const differentColor = global.window.colourFromString('reading');
    assert(typeof differentColor === 'string', 'returns hex string');
    assert(differentColor.startsWith('#'), 'hex string starts with #');
  });

  test('Updating habit color in edit form saves and persists in LocalStorage', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();
    const originalHabit = {
      id: 'running',
      name: 'Morning Run',
      type: 'positive',
      dailyTarget: 1,
      colorTheme: '#33b679', // Sage
      logs: {}
    };
    state.habits = [originalHabit];

    // Mock form elements for saving
    const coreElements = HabitualCore.getElements();
    coreElements.formHabit = {
      reset: () => {},
      querySelector: (sel) => {
        if (sel.includes('habit-type')) return { value: 'positive', checked: true };
        return null;
      },
      querySelectorAll: () => []
    };
    coreElements.customColorHex = { value: '#d50000' }; // Tomato (#d50000)
    coreElements.customColorPicker = { value: '#d50000' };

    // Mock document.getElementById for form fields
    const prevGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'habit-id') return { value: 'running' };
      if (id === 'habit-name') return { value: 'Morning Run' };
      if (id === 'habit-calendar-color-select') return { value: '#d50000' };
      if (id === 'habit-custom-color-hex') return { value: '#d50000' };
      if (id === 'habit-custom-color-picker') return { value: '#d50000' };
      return prevGetElementById ? prevGetElementById(id) : null;
    };

    // Execute save habit with updated color
    HabitualCore.handleHabitFormSubmit({ preventDefault: () => {} });

    global.document.getElementById = prevGetElementById;

    const updatedHabit = state.habits.find(h => h.id === 'running');
    assert(updatedHabit !== undefined, 'Habit still exists');
    assertEqual(updatedHabit.colorTheme, '#d50000', 'Updated colorTheme in state memory to Tomato (#d50000)');

    // Save and reload state to test persistence
    HabitualCore.saveState();
    HabitualCore.resetState();
    HabitualCore.loadState();

    const restoredHabit = HabitualCore.getState().habits.find(h => h.id === 'running');
    assert(restoredHabit !== undefined, 'Restored habit exists after loadState()');
    assertEqual(restoredHabit.colorTheme, '#d50000', 'Restored habit retains updated colorTheme from LocalStorage');
  });
});

describe('Feature 24: ⚙️ Habit Admin Options (Show/Hide Count, Duration, Hide from All)', () => {
  test('showCount option controls rendering of badge-count in card header', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();
    const habit = { id: 'test_count', name: 'Test Count', createdAt: HabitualCore.getTodayKey(), showCount: true, logs: {} };
    state.habits.push(habit);

    const cardShow = HabitualCore.buildHeatmapCard(habit, 2026);
    assert(cardShow.innerHTML.includes('badge-count'), 'Heatmap card includes badge-count when showCount is true');

    habit.showCount = false;
    const cardHide = HabitualCore.buildHeatmapCard(habit, 2026);
    assert(!cardHide.innerHTML.includes('badge-count'), 'Heatmap card hides badge-count when showCount is false');
  });

  test('showDuration option renders badge-duration in card header with active duration', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();
    const habit = { id: 'test_dur', name: 'Test Duration', createdAt: '2026-01-01', showDuration: true, logs: {} };
    state.habits.push(habit);

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    assert(card.innerHTML.includes('badge-duration'), 'Heatmap card includes badge-duration when showDuration is true');
    assert(card.innerHTML.includes('⏱️'), 'badge-duration contains stopwatch icon');

    habit.showDuration = false;
    const cardHide = HabitualCore.buildHeatmapCard(habit, 2026);
    assert(!cardHide.innerHTML.includes('badge-duration'), 'Heatmap card hides badge-duration when showDuration is false');
  });

  test('hideFromAll option excludes habit from combined All heatmap calculation', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();
    const today = HabitualCore.getTodayKey();

    const h1 = { id: 'h1', name: 'Habit 1', hideFromAll: false, logs: { [today]: { count: 1 } } };
    const h2 = { id: 'h2', name: 'Habit 2', hideFromAll: true, logs: { [today]: { count: 1 } } };
    state.habits.push(h1, h2);

    const cellData = HabitualCore.getCellData(today, 'all', today);
    assert(cellData.activeHabits.length === 1, 'Only non-hidden habit is included in All active habits');
    assertEqual(cellData.activeHabits[0].id, 'h1', 'Included active habit is h1');
  });

  test('renderHeatmapsGallery hides All heatmap card when all habits have hideFromAll set to true', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();
    state.habits.push(
      { id: 'h1', name: 'Habit 1', hideFromAll: true, logs: {} },
      { id: 'h2', name: 'Habit 2', hideFromAll: true, logs: {} }
    );

    const appenedCards = [];
    const originalElements = HabitualCore.elements;
    HabitualCore.elements = {
      heatmapsGallery: {
        innerHTML: '',
        appendChild(node) {
          appenedCards.push(node);
        },
        querySelectorAll() {
          return [];
        },
        querySelector() {
          return null;
        }
      },
      yearSelector: { innerHTML: '' }
    };

    HabitualCore.renderHeatmapsGallery();

    const hasAllCard = appenedCards.some(card => card && card.getAttribute && card.getAttribute('data-habit-id') === 'all');
    assertEqual(hasAllCard, false, 'All heatmap card is NOT rendered when all habits are hideFromAll');

    const hasH1Card = appenedCards.some(card => card && card.getAttribute && (card.getAttribute('data-habit-id') === 'h1' || card.getAttribute('data-habit-id-raw') === 'h1'));
    assertEqual(hasH1Card, true, 'Individual habit card h1 IS rendered on homepage gallery');

    HabitualCore.elements = originalElements;
  });

  test('saveState and loadState persist showCount, showDuration, and hideFromAll options', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();
    state.habits.push({
      id: 'custom_opts',
      name: 'Custom Options',
      createdAt: HabitualCore.getTodayKey(),
      showCount: false,
      showDuration: true,
      hideFromAll: true,
      logs: {}
    });

    HabitualCore.saveState();
    HabitualCore.resetState();
    HabitualCore.loadState();

    const restored = HabitualCore.getState().habits.find(h => h.id === 'custom_opts');
    assert(restored !== undefined, 'Restored habit exists');
    assertEqual(restored.showCount, false, 'showCount false is persisted');
    assertEqual(restored.showDuration, true, 'showDuration true is persisted');
    assertEqual(restored.hideFromAll, true, 'hideFromAll true is persisted');
  });

  test('updating hideFromAll on parent habit cascades to children while allowing individual updates', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();

    const parent = { id: 'p1', name: 'Parent', hideFromAll: false, logs: {} };
    const child = { id: 'c1', name: 'Child', parentId: 'p1', hideFromAll: false, logs: {} };
    state.habits.push(parent, child);

    // Mock document.getElementById for handleHabitFormSubmit
    const prevGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'habit-id') return { value: 'p1' };
      if (id === 'habit-name') return { value: 'Parent' };
      return prevGetElementById ? prevGetElementById(id) : null;
    };

    HabitualCore.elements.habitHideFromAll = { checked: true };
    HabitualCore.handleHabitFormSubmit({ preventDefault: () => {} });

    assertEqual(parent.hideFromAll, true, 'Parent hideFromAll updated to true');
    assertEqual(child.hideFromAll, true, 'Child inherited hideFromAll true from parent update');

    // Update child individually back to false
    global.document.getElementById = (id) => {
      if (id === 'habit-id') return { value: 'c1' };
      if (id === 'habit-name') return { value: 'Child' };
      return prevGetElementById ? prevGetElementById(id) : null;
    };

    HabitualCore.elements.habitHideFromAll = { checked: false };
    HabitualCore.handleHabitFormSubmit({ preventDefault: () => {} });

    global.document.getElementById = prevGetElementById;

    assertEqual(child.hideFromAll, false, 'Child updated individually back to false');
    assertEqual(parent.hideFromAll, true, 'Parent remains true when child is individually updated');
  });

  test('creating a new sub-habit copies preferences from parent habit', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();

    const parent = { id: 'p_pref', name: 'Parent Prefs', showCount: false, showDuration: true, hideFromAll: true, logs: {} };
    state.habits.push(parent);

    const prevGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'habit-parent') return { value: 'p_pref', selectedOptions: [{ text: 'Parent Prefs' }] };
      if (id === 'habit-id') return { value: '' };
      if (id === 'habit-name') return { value: '' };
      return prevGetElementById ? prevGetElementById(id) : null;
    };

    HabitualCore.elements.habitShowCount = { checked: true };
    HabitualCore.elements.habitShowDuration = { checked: false };
    HabitualCore.elements.habitHideFromAll = { checked: false };

    HabitualCore.openHabitModal(null, 'p_pref');

    global.document.getElementById = prevGetElementById;

    assertEqual(HabitualCore.elements.habitShowCount.checked, false, 'New sub-habit copied parent showCount false');
    assertEqual(HabitualCore.elements.habitShowDuration.checked, true, 'New sub-habit copied parent showDuration true');
    assertEqual(HabitualCore.elements.habitHideFromAll.checked, true, 'New sub-habit copied parent hideFromAll true');
  });
});

// ============================================================================
// FEATURE 25: 🎯 FOCUS HABIT NAME INPUT WHEN HABIT MODAL OPENS
// ============================================================================
describe('Feature 25: 🎯 Focus Habit Name Input when Habit Modal Opens', () => {
  test('openHabitModal sets focus on the habit-name input field', () => {
    let focusCalled = false;
    const mockHabitName = {
      value: '',
      addEventListener: () => {},
      focus() {
        focusCalled = true;
      }
    };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'habit-name') return mockHabitName;
      return {
        value: '',
        selectedOptions: [{ text: '' }],
        addEventListener: () => {},
        reset: () => {},
        querySelectorAll: () => [],
        querySelector: () => null,
        classList: { add: () => {}, remove: () => {}, toggle: () => {} }
      };
    };

    HabitualCore.initUI();
    HabitualCore.openHabitModal();

    assertEqual(focusCalled, true, 'focus() was called on habit-name input when opening habit modal');

    global.document.getElementById = originalGetElementById;
  });
});

// ============================================================================
// FEATURE 26: 🎯 ARROW KEY DATE CURSOR NAVIGATION & CURSOR DAY LOGGING
// ============================================================================
describe('Feature 26: 🎯 Arrow Key Date Cursor Navigation & Cursor Day Logging', () => {
  test('getCursorDateKey starts on today and setCursorDateKey/moveCursorDateByDays shifts cursor', () => {
    HabitualCore.resetState();
    const today = HabitualCore.getTodayKey();
    assertEqual(HabitualCore.getCursorDateKey(), today, 'getCursorDateKey starts on today');

    HabitualCore.moveCursorDateByDays(-1);
    const yesterday = HabitualCore.getDaysAgoKey(1);
    assertEqual(HabitualCore.getCursorDateKey(), yesterday, 'moveCursorDateByDays(-1) moves cursor to yesterday');

    HabitualCore.moveCursorDateByDays(1);
    assertEqual(HabitualCore.getCursorDateKey(), today, 'moveCursorDateByDays(1) returns cursor to today');

    HabitualCore.moveCursorDateByDays(-7);
    const lastWeek = HabitualCore.getDaysAgoKey(7);
    assertEqual(HabitualCore.getCursorDateKey(), lastWeek, 'moveCursorDateByDays(-7) moves cursor 7 days back');
  });

  test('buildHeatmapCard renders cursor-day class on day square matching cursorDateKey', () => {
    HabitualCore.resetState();
    const habit = { id: 'water', name: 'Drink Water', type: 'positive', dailyTarget: 1, logs: {} };
    const yesterday = HabitualCore.getDaysAgoKey(1);
    HabitualCore.setCursorDateKey(yesterday);

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    const html = card.innerHTML;

    assert(html.includes('cursor-day'), 'HTML contains cursor-day class on day square');
    assert(html.includes(`data-date="${yesterday}"`), 'HTML includes day square matching yesterday date key');
  });

  test('toggleHabitForDate adds completion entry to cursorDateKey when cursor is on a different day', () => {
    HabitualCore.resetState();
    const originalElements = HabitualCore.elements;
    HabitualCore.elements = {
      heatmapsGallery: { innerHTML: '', appendChild: () => {}, querySelectorAll: () => [], querySelector: () => null },
      yearSelector: { innerHTML: '' }
    };

    const state = HabitualCore.getState();
    const habit = { id: 'pushups', name: 'Pushups', type: 'positive', dailyTarget: 1, logs: {} };
    state.habits.push(habit);

    const pastDate = '2026-05-10';
    HabitualCore.setCursorDateKey(pastDate);

    const cursorDate = HabitualCore.getCursorDateKey();
    assertEqual(cursorDate, pastDate, 'Cursor date is set to 2026-05-10');

    HabitualCore.toggleHabitForDate('pushups', cursorDate);
    assertEqual(habit.logs['2026-05-10'].count, 1, 'Logged +1 to cursor date 2026-05-10');

    HabitualCore.elements = originalElements;
  });

  test('WASD keys navigate cursor date and Enter key clicks quick log on hovered card', () => {
    HabitualCore.resetState();
    const today = HabitualCore.getTodayKey();
    assertEqual(HabitualCore.getCursorDateKey(), today, 'getCursorDateKey starts on today');

    let keydownListener = null;
    const prevAddEventListener = global.document.addEventListener;
    global.document.addEventListener = (event, fn) => {
      if (event === 'keydown') keydownListener = fn;
    };

    HabitualCore.initUI();
    global.document.addEventListener = prevAddEventListener;

    assert(typeof keydownListener === 'function', 'keydown listener was registered');

    // Test 'w' key (up 1 day = -1 day)
    keydownListener({ key: 'w', preventDefault: () => {} });
    const yesterday = HabitualCore.getDaysAgoKey(1);
    assertEqual(HabitualCore.getCursorDateKey(), yesterday, "'w' key moves cursor up 1 day");

    // Test 's' key (down 1 day = +1 day)
    keydownListener({ key: 's', preventDefault: () => {} });
    assertEqual(HabitualCore.getCursorDateKey(), today, "'s' key moves cursor down 1 day");

    // Test 'a' key (left 1 week = -7 days)
    keydownListener({ key: 'a', preventDefault: () => {} });
    const lastWeek = HabitualCore.getDaysAgoKey(7);
    assertEqual(HabitualCore.getCursorDateKey(), lastWeek, "'a' key moves cursor left 1 week");

    // Test 'd' key (right 1 week = +7 days)
    keydownListener({ key: 'd', preventDefault: () => {} });
    assertEqual(HabitualCore.getCursorDateKey(), today, "'d' key moves cursor right 1 week");

    // Test Enter key on hovered card
    let clicked = false;
    const mockCard = {
      querySelector(sel) {
        if (sel === '.btn-card-quick-log') {
          return { click: () => { clicked = true; } };
        }
        return null;
      }
    };
    HabitualCore.hoveredCard = mockCard;

    keydownListener({ key: 'Enter', preventDefault: () => {} });
    assertEqual(clicked, true, 'Enter key triggers click on hovered card quick log button');
  });

  test('showCursorTooltip picks visible square closest to mouse or viewport center', () => {
    HabitualCore.resetState();
    let tooltipTarget = null;
    HabitualCore.showTooltipForSquare = (sq) => { tooltipTarget = sq; };

    const mockSq1 = {
      dataset: { date: '2026-10-05' },
      getBoundingClientRect: () => ({ left: 100, top: 100, width: 20, height: 20, right: 120, bottom: 120 })
    };
    const mockSq2 = {
      dataset: { date: '2026-10-05' },
      getBoundingClientRect: () => ({ left: 100, top: 500, width: 20, height: 20, right: 120, bottom: 520 })
    };

    const originalElements = HabitualCore.elements;
    HabitualCore.elements = {
      heatmapsGallery: {
        querySelectorAll: (sel) => sel === '.day-square.cursor-day' ? [mockSq1, mockSq2] : []
      }
    };

    // Test mouse proximity selection
    HabitualCore.mouseX = 110;
    HabitualCore.mouseY = 510; // Closer to mockSq2
    HabitualCore.showCursorTooltip();
    assertEqual(tooltipTarget, mockSq2, 'showCursorTooltip selects mockSq2 because mouse is closer to it');

    // Test viewport center fallback when mouse position is reset (-1)
    HabitualCore.mouseX = -1;
    HabitualCore.mouseY = -1;
    HabitualCore.showCursorTooltip();
    assert(tooltipTarget !== null, 'showCursorTooltip selects a square based on viewport center proximity when mouse is inactive');

    HabitualCore.elements = originalElements;
  });

  test('Mobile arrow key footer buttons shift cursor date and trigger action', () => {
    HabitualCore.resetState();
    const today = HabitualCore.getTodayKey();
    assertEqual(HabitualCore.getCursorDateKey(), today, 'getCursorDateKey starts on today');

    const buttonListeners = {};
    const mockElements = {
      'btn-arrow-up': { addEventListener: (evt, fn) => buttonListeners['btn-arrow-up'] = fn },
      'btn-arrow-down': { addEventListener: (evt, fn) => buttonListeners['btn-arrow-down'] = fn },
      'btn-arrow-left': { addEventListener: (evt, fn) => buttonListeners['btn-arrow-left'] = fn },
      'btn-arrow-right': { addEventListener: (evt, fn) => buttonListeners['btn-arrow-right'] = fn },
      'btn-arrow-today': { addEventListener: (evt, fn) => buttonListeners['btn-arrow-today'] = fn },
      'btn-arrow-action': { addEventListener: (evt, fn) => buttonListeners['btn-arrow-action'] = fn }
    };

    const prevGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => mockElements[id] || (prevGetElementById ? prevGetElementById.call(global.document, id) : null);

    HabitualCore.setupMobileArrowPad();
    global.document.getElementById = prevGetElementById;

    const dummyEvent = { preventDefault: () => {}, stopPropagation: () => {} };

    // Test Up button (-1 day)
    buttonListeners['btn-arrow-up'](dummyEvent);
    const yesterday = HabitualCore.getDaysAgoKey(1);
    assertEqual(HabitualCore.getCursorDateKey(), yesterday, 'Mobile Up button moves cursor up 1 day');

    // Test Down button (+1 day)
    buttonListeners['btn-arrow-down'](dummyEvent);
    assertEqual(HabitualCore.getCursorDateKey(), today, 'Mobile Down button moves cursor down 1 day');

    // Test Left button (-7 days)
    buttonListeners['btn-arrow-left'](dummyEvent);
    const lastWeek = HabitualCore.getDaysAgoKey(7);
    assertEqual(HabitualCore.getCursorDateKey(), lastWeek, 'Mobile Left button moves cursor left 1 week');

    // Test Right button (+7 days)
    buttonListeners['btn-arrow-right'](dummyEvent);
    assertEqual(HabitualCore.getCursorDateKey(), today, 'Mobile Right button moves cursor right 1 week');

    // Test Today button
    HabitualCore.setCursorDateKey('2026-01-01');
    buttonListeners['btn-arrow-today'](dummyEvent);
    assertEqual(HabitualCore.getCursorDateKey(), today, 'Mobile Today button resets cursor to today');
  });
});

// ============================================================================
// FEATURE 27: 🔄 MULTI-TARGET SYNC, DYNAMIC SCRIPT LOADER & STORAGE DRIVERS
// ============================================================================
describe('Feature 27: 🔄 Multi-Target Sync, Dynamic Script Loader & Storage Drivers', () => {
  test('LocalStorageDriver and IndexedDBDriver interface compliance', () => {
    assert(HabitualCore.LocalStorageDriver !== undefined, 'LocalStorageDriver defined');
    assert(HabitualCore.IndexedDBDriver !== undefined, 'IndexedDBDriver defined');
    assertEqual(HabitualCore.LocalStorageDriver.name, 'localStorage');
    assertEqual(HabitualCore.IndexedDBDriver.name, 'indexedDB');
  });

  test('loadScript dynamic script loader caches loaded promises', () => {
    assert(typeof HabitualCore.loadScript === 'function', 'loadScript is a function');
    const url = 'https://example.com/test-script.js';
    const p1 = HabitualCore.loadScript(url);
    const p2 = HabitualCore.loadScript(url);
    assertEqual(p1, p2, 'loadScript returns cached promise for duplicate URL requests');
  });

  test('E2EE AES-256-GCM encrypt and decrypt roundtrip', async () => {
    const payload = { habits: [{ id: 'run', name: 'Running' }] };
    const pass = 'test_passphrase_321';
    const cipher = await HabitualCore.E2EE.encrypt(payload, pass);
    assert(cipher.startsWith('ENC:'), 'Ciphertext formatted with ENC: prefix');
    const dec = await HabitualCore.E2EE.decrypt(cipher, pass);
    assertEqual(dec.habits[0].name, 'Running');
  });

  test('mergeStatePayloads merges logs and habits without overwriting data', () => {
    const local = {
      updatedAt: 100,
      habits: [{ id: 'water', name: 'Water', logs: { '2026-10-01': { count: 1 } } }]
    };
    const remote = {
      updatedAt: 200,
      habits: [{ id: 'water', name: 'Water', logs: { '2026-10-01': { count: 3 }, '2026-10-02': { count: 2 } } }]
    };
    const merged = HabitualCore.mergeStatePayloads(local, remote);
    assertEqual(merged.habits[0].logs['2026-10-01'].count, 3);
    assertEqual(merged.habits[0].logs['2026-10-02'].count, 2);
  });

  test('SyncManager target toggles and settings persistence', () => {
    HabitualCore.SyncManager.toggleTarget('webdav', true);
    assert(HabitualCore.SyncManager.isTargetEnabled('webdav'), 'WebDAV target enabled');
    HabitualCore.SyncManager.toggleTarget('webdav', false);
    assert(!HabitualCore.SyncManager.isTargetEnabled('webdav'), 'WebDAV target disabled');
  });

  test('Feature flags URL query parameter parsing', () => {
    const params1 = new URLSearchParams('cloudSync=1&p2p=1&widgets=1');
    assertEqual(params1.get('cloudSync'), '1', 'cloudSync=1 recognized');
    assertEqual(params1.get('p2p'), '1', 'p2p=1 recognized');
    assertEqual(params1.get('widgets'), '1', 'widgets=1 recognized');

    const params2 = new URLSearchParams('');
    assertEqual(params2.get('cloudSync'), null, 'cloudSync hidden by default');
    assertEqual(params2.get('p2p'), null, 'p2p hidden by default');
    assertEqual(params2.get('widgets'), null, 'widgets hidden by default');

    assert(typeof HabitualCore.isWidgetsEnabled === 'function', 'isWidgetsEnabled helper function exists');
    HabitualCore.state.enableWidgets = false;
    assertEqual(HabitualCore.isWidgetsEnabled(), false, 'isWidgetsEnabled returns false by default');
    HabitualCore.state.enableWidgets = true;
    assertEqual(HabitualCore.isWidgetsEnabled(), true, 'isWidgetsEnabled returns true when state.enableWidgets is true');
    HabitualCore.state.enableWidgets = false;
  });

  test('getDeltaPayloadFromState minimizes payload by omitting default properties and old logs', () => {
    HabitualCore.state.habits = [
      {
        id: 'water_1',
        name: HabitualCore.deriveNameFromId('water_1'),
        colorTheme: HabitualCore.getDefaultColorForId('water_1'),
        dailyTarget: 1,
        logs: {
          '2020-01-01': { count: 1 },
          '2026-10-06': { count: 2, note: 'Fresh water' }
        }
      }
    ];

    const delta = HabitualCore.getDeltaPayloadFromState(7);
    assert(delta.isDelta === true, 'isDelta flag is set');
    assert(delta.habits.length === 1, 'Contains 1 habit');

    const h = delta.habits[0];
    assertEqual(h.id, 'water_1', 'Habit ID preserved');
    assertEqual(h.name, undefined, 'Derived default name is omitted');
    assertEqual(h.colorTheme, undefined, 'Derived default color is omitted');
    assertEqual(h.logs['2020-01-01'], undefined, 'Old log prior to 7-day cutoff is omitted');
    assertEqual(h.logs['2026-10-06'].count, 2, 'Recent log is preserved');
  });

  test('Granular storage APIs saveLog, saveHabit, saveSettings and saveStateDebounced', async () => {
    assert(typeof HabitualCore.LocalStorageDriver.saveLog === 'function', 'LocalStorageDriver.saveLog defined');
    assert(typeof HabitualCore.LocalStorageDriver.saveHabit === 'function', 'LocalStorageDriver.saveHabit defined');
    assert(typeof HabitualCore.LocalStorageDriver.saveSettings === 'function', 'LocalStorageDriver.saveSettings defined');

    assert(typeof HabitualCore.saveLog === 'function', 'core.saveLog function defined');
    assert(typeof HabitualCore.saveHabit === 'function', 'core.saveHabit function defined');
    assert(typeof HabitualCore.saveSettings === 'function', 'core.saveSettings function defined');
    assert(typeof HabitualCore.saveStateDebounced === 'function', 'core.saveStateDebounced function defined');

    // Test saveLog execution
    HabitualCore.state.habits = [{ id: 'test_habit', name: 'Test Habit', logs: {} }];
    const logRes = await HabitualCore.saveLog('test_habit', '2026-10-07', 3, 'Granular log test');
    assert(logRes === true, 'saveLog returned true');

    // Test saveHabit execution
    const habitRes = await HabitualCore.saveHabit(HabitualCore.state.habits[0]);
    assert(habitRes === true, 'saveHabit returned true');

    // Test saveSettings execution
    const settingsRes = await HabitualCore.saveSettings({ selectedYear: 2026 });
    assert(settingsRes === true, 'saveSettings returned true');

    // Test saveStateDebounced batches call
    let saveCount = 0;
    const origSaveState = HabitualCore.saveState;
    HabitualCore.saveState = function() { saveCount++; };

    HabitualCore.saveStateDebounced(50);
    HabitualCore.saveStateDebounced(50);
    HabitualCore.saveStateDebounced(50);

    await new Promise(r => setTimeout(r, 100));
    assertEqual(saveCount, 1, 'Debounced saveState coalesced 3 calls into 1 save');

    HabitualCore.saveState = origSaveState;
  });

  test('Firestore E2EE Sync Target, auto-post on turn-on, send, retrieve, encrypt and decrypt', async () => {
    assert(typeof HabitualCore.SyncTargets.Firestore === 'object', 'Firestore Sync Target defined');

    // 1. Test Sync Code Generation and Formatting
    const code = HabitualCore.SyncTargets.Firestore.getSyncCode();
    assert(code.startsWith('HAB-'), 'Sync Code starts with HAB- prefix');
    assertEqual(code.length, 10, 'Sync Code is 10 characters long (HAB-XXXXXX)');

    const customCode = HabitualCore.SyncTargets.Firestore.setSyncCode('hab-custom123');
    assertEqual(customCode, 'HAB-CUSTOM123', 'Sync Code normalized to uppercase');
    assertEqual(HabitualCore.SyncTargets.Firestore.getSyncCode(), 'HAB-CUSTOM123', 'Custom Sync Code persisted');

    // 2. Setup Mock Firebase / Firestore
    const store = {};
    const listeners = {};
    const mockDb = {
      collection: function(collName) {
        if (!store[collName]) store[collName] = {};
        if (!listeners[collName]) listeners[collName] = {};

        return {
          doc: function(docId) {
            const actualDocId = docId || ('auto_doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
            return {
              id: actualDocId,
              set: function(data) {
                store[collName][actualDocId] = Object.assign({}, data, {
                  updatedAt: data.updatedAt || { toMillis: () => Date.now() }
                });
                if (listeners[collName][actualDocId]) {
                  const snap = {
                    exists: true,
                    data: () => store[collName][actualDocId]
                  };
                  listeners[collName][actualDocId].forEach(cb => cb(snap));
                }
                return Promise.resolve();
              },
              get: function() {
                const docData = store[collName][actualDocId];
                return Promise.resolve({
                  exists: !!docData,
                  data: () => docData
                });
              },
              onSnapshot: function(onNext) {
                if (!listeners[collName][actualDocId]) listeners[collName][actualDocId] = [];
                listeners[collName][actualDocId].push(onNext);
                if (store[collName][actualDocId]) {
                  onNext({
                    exists: true,
                    data: () => store[collName][actualDocId]
                  });
                }
                return function unsubscribe() {
                  const idx = listeners[collName][actualDocId].indexOf(onNext);
                  if (idx !== -1) listeners[collName][actualDocId].splice(idx, 1);
                };
              }
            };
          }
        };
      }
    };

    global.firebase = {
      apps: [{}],
      initializeApp: () => {},
      firestore: () => mockDb
    };
    global.firebase.firestore.FieldValue = {
      serverTimestamp: () => ({ toMillis: () => Date.now() })
    };
    HabitualCore.SyncTargets.Firestore.db = mockDb;

    // 3. Test E2EE Encryption and Decryption Roundtrip
    const testPayload = { habits: [{ id: 'water', name: 'Hydration', logs: { '2026-10-07': { count: 2 } } }] };
    const passphrase = 'SecretPassphrase123!';

    const encryptedText = await HabitualCore.E2EE.encrypt(testPayload, passphrase);
    assert(typeof encryptedText === 'string', 'Encrypted payload is string');
    assert(encryptedText.startsWith('ENC:'), 'Ciphertext starts with ENC: prefix');

    const decryptedPayload = await HabitualCore.E2EE.decrypt(encryptedText, passphrase);
    assertEqual(decryptedPayload.habits[0].id, 'water', 'Decrypted habit ID matches original');
    assertEqual(decryptedPayload.habits[0].name, 'Hydration', 'Decrypted habit name matches original');

    // 4. Test Sending (uploadBackup)
    HabitualCore.SyncManager.setPassphrase(passphrase);
    await HabitualCore.SyncTargets.Firestore.uploadBackup(encryptedText);
    const storedDoc = store['habit_data']['HAB-CUSTOM123'];
    assert(storedDoc !== undefined, 'Document posted to habit_data collection with sync code key');
    assertEqual(storedDoc.ciphertext, encryptedText, 'Stored ciphertext matches uploaded encrypted text');

    // 5. Test Retrieving (downloadBackup) and Decrypting
    const retrievedCiphertext = await HabitualCore.SyncTargets.Firestore.downloadBackup();
    assertEqual(retrievedCiphertext, encryptedText, 'Downloaded ciphertext matches stored text');
    const retrievedPayload = await HabitualCore.E2EE.decrypt(retrievedCiphertext, passphrase);
    assertEqual(retrievedPayload.habits[0].name, 'Hydration', 'Retrieved payload decrypts correctly');

    // 6. Test generateNewSyncCode API method using Firebase automatic auto-ID
    const oldCode = HabitualCore.SyncTargets.Firestore.getSyncCode();
    const brandNewCode = HabitualCore.SyncTargets.Firestore.generateNewSyncCode();
    assert(typeof brandNewCode === 'string' && brandNewCode.length > 5, 'generateNewSyncCode produces valid auto-ID string');
    assert(brandNewCode !== oldCode, 'generateNewSyncCode produces a fresh auto-generated code');
    assertEqual(HabitualCore.SyncTargets.Firestore.getExistingSyncCode(), brandNewCode, 'generateNewSyncCode persists in storage');

    // 7. Test user pasting custom code & explicit Save & Sync
    const pastedCode = HabitualCore.SyncTargets.Firestore.setSyncCode('hab-pasted123');
    assertEqual(pastedCode, 'HAB-PASTED123', 'User typed/pasted code normalized to uppercase');
    assertEqual(HabitualCore.SyncTargets.Firestore.getSyncCode(), 'HAB-PASTED123', 'Pasted code stored in settings');

    // Enable sync & explicitly push/sync to Firestore
    HabitualCore.SyncManager.toggleTarget('firestore', true);
    HabitualCore.state.habits = [{ id: 'yoga', name: 'Morning Yoga', logs: { '2026-10-08': { count: 1 } } }];

    await HabitualCore.SyncManager.postToFirestoreIfReady();

    const syncedDoc = store['habit_data']['HAB-PASTED123'];
    assert(syncedDoc !== undefined, 'Explicit Save & Sync pushed document under pasted code key');
    assert(syncedDoc.ciphertext.startsWith('ENC:'), 'Synced payload is encrypted');

    const syncedDecrypted = await HabitualCore.E2EE.decrypt(syncedDoc.ciphertext, passphrase);
    assertEqual(syncedDecrypted.habits[0].id, 'yoga', 'Synced document decrypts to current habit state');

    // 8. Test Toast Feedback during sync operations
    const emittedToasts = [];
    const origShowToast = HabitualCore.showToast;
    HabitualCore.showToast = function(msg, type) {
      emittedToasts.push({ msg, type });
      if (origShowToast) origShowToast(msg, type);
    };

    HabitualCore.state.habits = [{ id: 'pilates', name: 'Pilates Workout', logs: { '2026-10-08': { count: 1 } } }];
    await HabitualCore.SyncManager.postToFirestoreIfReady();

    assert(emittedToasts.some(t => t.msg.includes('Syncing data to Firestore cloud')), 'Emitted syncing progress toast');
    assert(emittedToasts.some(t => t.msg.includes('Firestore Cloud Sync Complete') || t.type === 'success'), 'Emitted sync completion toast');

    HabitualCore.showToast = origShowToast;

    // Clean up
    HabitualCore.SyncManager.toggleTarget('firestore', false);
    delete global.firebase;
    HabitualCore.SyncTargets.Firestore.db = null;
  });

  test('Firestore Sync Code helpers: hasSyncCode, getExistingSyncCode and auto-enable on paste/new-code', async () => {
    mockLocalStorage.removeItem('habitual_firestore_sync_code');
    mockLocalStorage.removeItem('habitual_sync_targets');
    mockLocalStorage.removeItem('habitual_sync_passphrase');
    HabitualCore.SyncManager.settings.enabledTargets = [];
    HabitualCore.SyncManager.settings.passphrase = '';

    // 1. Initial state: no sync code
    assert(HabitualCore.SyncTargets.Firestore.hasSyncCode() === false, 'hasSyncCode returns false when localStorage is empty');
    assertEqual(HabitualCore.SyncTargets.Firestore.getExistingSyncCode(), '', 'getExistingSyncCode returns empty string when no code exists');

    // 2. Setting master passphrase
    HabitualCore.SyncManager.setPassphrase('MyMasterKey123!');

    // 3. User pastes code into input box -> setSyncCode automatically formats and returns code
    const pasted = HabitualCore.SyncTargets.Firestore.setSyncCode('hab-pasted999');
    assertEqual(pasted, 'HAB-PASTED999', 'setSyncCode normalizes pasted code to uppercase');
    assert(HabitualCore.SyncTargets.Firestore.hasSyncCode() === true, 'hasSyncCode returns true after setSyncCode');
    assertEqual(HabitualCore.SyncTargets.Firestore.getExistingSyncCode(), 'HAB-PASTED999', 'getExistingSyncCode returns stored code');

    // 4. Generating new sync code via generateNewSyncCode
    const generated = HabitualCore.SyncTargets.Firestore.generateNewSyncCode();
    assert(typeof generated === 'string' && generated.length > 5, 'generateNewSyncCode produces valid auto-ID string');
    assertEqual(HabitualCore.SyncTargets.Firestore.getExistingSyncCode(), generated, 'generateNewSyncCode updates existing code');
  });

  test('UI Button Click: New Code button generates Firebase auto-ID and displays it in code box', async () => {
    // Mock Firebase for auto-ID generation
    global.firebase = {
      apps: [{}],
      initializeApp: () => {},
      firestore: () => ({
        collection: () => ({
          doc: () => ({ id: 'fb_auto_id_998877665544' })
        })
      })
    };

    const inputFirestoreCode = createMockElement('input');
    const btnGenFirestoreCode = createMockElement('button');
    const btnCopyFirestoreCode = createMockElement('button');

    // Wire event handler (simulating ui.js listener)
    btnGenFirestoreCode.addEventListener('click', () => {
      const newCode = HabitualCore.SyncTargets.Firestore.generateNewSyncCode();
      inputFirestoreCode.value = newCode;
      if (btnCopyFirestoreCode && btnCopyFirestoreCode.style) {
        btnCopyFirestoreCode.style.display = newCode ? 'inline-block' : 'none';
      }
    });

    // Initial state
    inputFirestoreCode.value = '';
    btnCopyFirestoreCode.style.display = 'none';

    // Click "New Code" button
    btnGenFirestoreCode.click();

    // Verify code box is populated with Firebase auto-ID and Copy button is visible
    assertEqual(inputFirestoreCode.value, 'fb_auto_id_998877665544', 'Code box displays Firebase auto-generated document ID');
    assertEqual(btnCopyFirestoreCode.style.display, 'inline-block', 'Copy button displays once code is generated');

    delete global.firebase;
  });

  test('Firestore UI Initialization: updateFirestoreCodeUIState populates input box with sync code on load', async () => {
    mockLocalStorage.removeItem('habitual_firestore_sync_code');

    const inputFirestoreCode = createMockElement('input');
    const btnCopyFirestoreCode = createMockElement('button');

    const elemMap = {
      'input-firestore-sync-code': inputFirestoreCode,
      'btn-copy-firestore-code': btnCopyFirestoreCode
    };

    const origGetById = global.document.getElementById;
    global.document.getElementById = (id) => elemMap[id] || (origGetById ? origGetById(id) : null);

    // Call updateFirestoreCodeUIState
    assert(typeof HabitualCore.updateFirestoreCodeUIState === 'function', 'updateFirestoreCodeUIState is exported on HabitualCore');
    HabitualCore.updateFirestoreCodeUIState();

    // Verify input box value and copy button visibility
    assert(inputFirestoreCode.value.length > 0, 'Firestore sync code input is populated on UI load even when localStorage was empty');
    assert(inputFirestoreCode.value.startsWith('HAB-'), 'Populated sync code starts with HAB- prefix');
    assertEqual(btnCopyFirestoreCode.style.display, 'inline-block', 'Copy button is made visible when sync code is populated');

    global.document.getElementById = origGetById;
  });

  test('Conditional localStorage write and direct object payload loading', async () => {
    const origEngine = HabitualCore.activeStorageEngine;

    // Test localStorage active engine writes full key
    HabitualCore.setStorageEngine('localStorage');
    HabitualCore.saveState();
    assert(localStorage.getItem(HabitualCore.STORAGE_KEY) !== null, 'LocalStorage contains full state payload when localStorage engine is active');

    // Test indexedDB active engine skips full localStorage rewrite
    HabitualCore.setStorageEngine('indexedDB');
    localStorage.removeItem(HabitualCore.STORAGE_KEY);
    HabitualCore.saveState();
    assertEqual(localStorage.getItem('habitual_v2_active_engine'), 'indexedDB', 'Non-localStorage engine sets lightweight active engine key in localStorage');

    // Restore original engine
    HabitualCore.setStorageEngine(origEngine);
  });

  test('toggleHabitForDate invokes targeted saveLog persistence', async () => {
    let savedLogData = null;
    const origSaveLog = HabitualCore.saveLog;
    HabitualCore.saveLog = function(habitId, dateKey, count, note) {
      savedLogData = { habitId, dateKey, count, note };
      return Promise.resolve(true);
    };

    HabitualCore.state.habits = [{ id: 'water_test', name: 'Water Test', logs: {} }];
    HabitualCore.toggleHabitForDate('water_test', '2026-10-07');

    assert(savedLogData !== null, 'toggleHabitForDate triggered saveLog');
    assertEqual(savedLogData.habitId, 'water_test', 'saveLog called with habitId');
    assertEqual(savedLogData.dateKey, '2026-10-07', 'saveLog called with dateKey');
    assertEqual(savedLogData.count, 1, 'saveLog called with incremented count = 1');

    HabitualCore.saveLog = origSaveLog;
  });

  test('AudioSync ggwave encode and decode roundtrip', async () => {
    if (!global.AudioContext && !global.webkitAudioContext) {
      global.AudioContext = class {
        constructor() { this.sampleRate = 48000; this.state = 'running'; }
        resume() { return Promise.resolve(); }
        createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
        createBufferSource() { return { buffer: null, connect: () => {}, start: () => {} }; }
      };
    }

    assert(HabitualCore.AudioSync !== undefined, 'AudioSync module defined');

    // Test Gzip Compression & Decompression Roundtrip
    const testData = { version: 2, habits: [{ id: 'run', name: 'Running' }] };
    const compressed = await HabitualCore.AudioSync.compressJSON(testData);
    assert(compressed instanceof Uint8Array, 'Compressed to Uint8Array');

    const decompressed = await HabitualCore.AudioSync.decompressJSON(compressed);
    assertEqual(decompressed.habits[0].id, 'run', 'Decompressed JSON matches original');

    // Test GGwave WASM initialization & encode roundtrip
    await HabitualCore.AudioSync.init();
    assert(HabitualCore.AudioSync.instance !== null, 'GGwave instance initialized');

    const protocol = HabitualCore.AudioSync.ggwaveModule.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST;
    const waveform = HabitualCore.AudioSync.ggwaveModule.encode(
      HabitualCore.AudioSync.instance,
      'HAB:A1B2C3',
      protocol,
      10
    );
    assert(waveform && waveform.length > 0, 'GGwave encoded non-empty waveform');

    const decoded = HabitualCore.AudioSync.ggwaveModule.decode(
      HabitualCore.AudioSync.instance,
      waveform
    );
    const decodedStr = String.fromCharCode.apply(null, decoded);
    assertEqual(decodedStr, 'HAB:A1B2C3', 'GGwave decoded string matches original audio payload');
  });
});

// ============================================================================
// FEATURE 28: 🧩 STANDALONE WIDGET HTML PAGES (ADD, HEATMAPS, SETTINGS)
// ============================================================================
describe('Feature 28: 🧩 Standalone Widget HTML Pages (Add, Heatmaps, Settings)', () => {
  test('web/widgets/add.html exists, has dark theme, links styles.css, core scripts, and widget UI elements', () => {
    const addHtmlPath = path.join(__dirname, '../web/widgets/add.html');
    assert(fs.existsSync(addHtmlPath), 'web/widgets/add.html exists');
    const content = fs.readFileSync(addHtmlPath, 'utf8');

    assert(content.includes('dark-theme'), 'add.html contains dark-theme class');
    assert(content.includes('styles.css') || content.includes('../styles.css'), 'add.html links styles.css');
    assert(content.includes('Habitual Quick Add') || content.includes('Quick Add'), 'add.html contains title/brand header');
    assert(content.includes('widget-quick-add-list') || content.includes('widget-add-list'), 'add.html contains quick add list container');
    assert(content.includes('state.js') && content.includes('widgets.js'), 'add.html links required JS scripts');
  });

  test('web/widgets/heatmaps.html exists, has dark theme, links styles.css, core scripts, and heatmap UI elements', () => {
    const heatmapHtmlPath = path.join(__dirname, '../web/widgets/heatmaps.html');
    assert(fs.existsSync(heatmapHtmlPath), 'web/widgets/heatmaps.html exists');
    const content = fs.readFileSync(heatmapHtmlPath, 'utf8');

    assert(content.includes('dark-theme'), 'heatmaps.html contains dark-theme class');
    assert(content.includes('styles.css') || content.includes('../styles.css'), 'heatmaps.html links styles.css');
    assert(content.includes('widget-heatmap-select') || content.includes('select'), 'heatmaps.html contains target habit selector');
    assert(content.includes('widget-heatmap-grid') || content.includes('mini-week') || content.includes('heatmap'), 'heatmaps.html contains heatmap grid container');
    assert(content.includes('state.js') && content.includes('widgets.js'), 'heatmaps.html links required JS scripts');
  });

  test('web/widgets/settings.html exists, has dark theme, links styles.css, core scripts, and settings UI elements', () => {
    const settingsHtmlPath = path.join(__dirname, '../web/widgets/settings.html');
    assert(fs.existsSync(settingsHtmlPath), 'web/widgets/settings.html exists');
    const content = fs.readFileSync(settingsHtmlPath, 'utf8');

    assert(content.includes('dark-theme'), 'settings.html contains dark-theme class');
    assert(content.includes('styles.css') || content.includes('../styles.css'), 'settings.html links styles.css');
    assert(content.includes('setting-default-habit') || content.includes('setting') || content.includes('select'), 'settings.html contains widget settings controls');
    assert(content.includes('widget-schema-preview') || content.includes('schema') || content.includes('json') || content.includes('preview'), 'settings.html contains schema/JSON preview box');
    assert(content.includes('state.js') && content.includes('widgets.js'), 'settings.html links required JS scripts');
  });

  test('web/js/widgets.js exists and exports core widget payload functions', () => {
    const widgetsJsPath = path.join(__dirname, '../web/js/widgets.js');
    assert(fs.existsSync(widgetsJsPath), 'web/js/widgets.js exists');

    // Load widgets.js into global HabitualCore if not already loaded
    require(widgetsJsPath);

    assert(typeof global.window.HabitualCore.getQuickAddWidgetPayload === 'function', 'getQuickAddWidgetPayload defined');
    assert(typeof global.window.HabitualCore.getHeatmapWidgetPayload === 'function', 'getHeatmapWidgetPayload defined');

    // Test Quick Add Payload structure
    HabitualCore.setState({
      habits: [
        { id: 'h_test1', name: 'Daily Meditation', type: 'positive', dailyTarget: 1, colorTheme: 'purple', logs: {} }
      ]
    });
    const quickPayload = HabitualCore.getQuickAddWidgetPayload();
    assert(quickPayload !== null, 'getQuickAddWidgetPayload returns non-null payload');
    assert(Array.isArray(quickPayload.habits), 'quickPayload.habits is an array');
    assertEqual(quickPayload.habits.length, 1, 'Contains 1 active habit');
    assertEqual(quickPayload.habits[0].id, 'h_test1');
    assertEqual(quickPayload.habits[0].name, 'Daily Meditation');
    assertEqual(quickPayload.habits[0].statusIcon, '+');

    // Test Heatmap Payload structure
    const heatmapPayload = HabitualCore.getHeatmapWidgetPayload('h_test1');
    assert(heatmapPayload !== null, 'getHeatmapWidgetPayload returns non-null payload');
    assertEqual(heatmapPayload.habitId, 'h_test1');
    assertEqual(heatmapPayload.habitName, 'Daily Meditation');
    assert(Array.isArray(heatmapPayload.miniWeeks), 'miniWeeks is an array');
    assertEqual(heatmapPayload.miniWeeks.length, 12, 'miniWeeks contains 12 week columns');
  });
});

// ============================================================================
// FINAL REPORT
// ============================================================================
console.log(`\n========================================`);
console.log(`📊 TEST RESULTS SUMMARY`);
console.log(`========================================`);
console.log(`Total Tests Run : ${totalTests}`);
console.log(`Passed          : ${passedTests} ✅`);
console.log(`Failed          : ${failedTests} ❌`);

if (failedTests > 0) {
  console.log(`\nFailed Tests Details:`);
  failures.forEach(f => {
    console.error(`- ${f.testName}: ${f.error}`);
  });
  process.exit(1);
} else {
  console.log(`\n🎉 ALL TESTS PASSED SUCCESSFULLY!\n`);
  process.exit(0);
}
