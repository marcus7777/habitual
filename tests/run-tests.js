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
  let innerHTMLVal = '';
  const elem = {
    tagName: tagName.toUpperCase(),
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
  addEventListener: () => {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: createMockElement
};
global.localStorage = mockLocalStorage;
global.navigator = { serviceWorker: { register: async () => ({ scope: '/' }) } };

// Load Habitual Core Files
require('../web/colours.js');
require('../web/js/state.js');
require('../web/js/storage.js');
require('../web/js/render.js');
require('../web/js/ui.js');
const HabitualCore = global.window.HabitualCore;

HabitualCore.resetState = function() {
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
});

// ============================================================================
// FEATURE 25: 🎯 FOCUS HABIT NAME INPUT WHEN HABIT MODAL OPENS
// ============================================================================
describe('Feature 25: 🎯 Focus Habit Name Input when Habit Modal Opens', () => {
  test('openHabitModal sets focus on the habit-name input field', () => {
    let focusCalled = false;
    const mockHabitName = {
      value: '',
      focus() {
        focusCalled = true;
      }
    };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'habit-name') return mockHabitName;
      if (id === 'modal-habit') return { classList: { remove: () => {}, add: () => {}, toggle: () => {} } };
      if (id === 'form-habit') return { reset: () => {}, querySelectorAll: () => [] };
      return { value: '', selectedOptions: [{ text: '' }], classList: { add: () => {}, remove: () => {}, toggle: () => {} } };
    };

    HabitualCore.openHabitModal();

    assertEqual(focusCalled, true, 'focus() was called on habit-name input when opening habit modal');

    global.document.getElementById = originalGetElementById;
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
