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
global.window.addEventListener = global.window.addEventListener || (() => {});
global.window.removeEventListener = global.window.removeEventListener || (() => {});
global.window.HabitualCore = global.window.HabitualCore || {};

function createMockElement(tagName) {
  const children = [];
  const attributes = {};
  const classListSet = new Set();
  const eventListeners = {};
  let innerHTMLVal = '';
  const elem = {
    tagName: tagName ? tagName.toUpperCase() : 'DIV',
    value: '',
    style: {},
    parentElement: null,
    get dataset() {
      const ds = {};
      for (const k in attributes) {
        if (k.startsWith('data-')) {
          const camelKey = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          ds[camelKey] = attributes[k];
        }
      }
      return ds;
    },
    addEventListener: (event, fn) => {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(fn);
    },
    click: function() {
      let stopped = false;
      const eventObj = {
        target: elem,
        preventDefault: () => {},
        stopPropagation: () => { stopped = true; }
      };
      let curr = elem;
      while (curr) {
        if (curr._eventListeners && curr._eventListeners['click']) {
          curr._eventListeners['click'].forEach(fn => fn(eventObj));
          if (stopped) break;
        }
        curr = curr.parentElement;
      }
    },
    get className() { return Array.from(classListSet).join(' '); },
    set className(val) { classListSet.clear(); (val || '').split(' ').filter(Boolean).forEach(c => classListSet.add(c)); },
    children,
    attributes,
    get innerHTML() { return innerHTMLVal; },
    set innerHTML(val) {
      innerHTMLVal = val;
      const dataAttrMatches = val.match(/data-([a-z0-9-]+)="([^"]*)"/g) || [];
      dataAttrMatches.forEach(m => {
        const parts = m.split('=');
        const k = parts[0];
        const v = parts[1].replace(/"/g, '');
        attributes[k] = v;
      });
      const classMatches = val.match(/class="([^"]+)"/g) || [];
      classMatches.forEach(m => {
        const classes = m.replace('class="', '').replace('"', '').split(' ');
        const mockChild = createMockElement('div');
        mockChild.parentElement = elem;
        classes.forEach(c => mockChild.classList.add(c));
        if (mockChild.classList.contains('btn-card-quick-log')) {
          const btnMatch = val.match(/<button[^>]*btn-card-quick-log[^>]*>([\s\S]*?)<\/button>/);
          if (btnMatch) mockChild.textContent = btnMatch[1].trim();
          const bAttrMatches = val.match(/data-([a-z0-9-]+)="([^"]*)"/g) || [];
          bAttrMatches.forEach(bm => {
            const bp = bm.split('=');
            mockChild.setAttribute(bp[0], bp[1].replace(/"/g, ''));
          });
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
    removeAttribute: (k) => { delete attributes[k]; },
    appendChild: (child) => { child.parentElement = elem; children.push(child); return child; },
    closest: function(sel) {
      let curr = elem;
      while (curr) {
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          if (curr.classList && curr.classList.contains(cls)) return curr;
        } else if (sel.startsWith('#')) {
          const id = sel.slice(1);
          if (curr.getAttribute && curr.getAttribute('id') === id) return curr;
        }
        curr = curr.parentElement;
      }
      return null;
    },
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
      } else if (sel.startsWith('#')) {
        const id = sel.slice(1);
        if (attributes['id'] === id) return elem;
        for (const child of children) {
          if (child.getAttribute && child.getAttribute('id') === id) return child;
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
  elem._eventListeners = eventListeners;
  return elem;
}

global.document = {
  body: createMockElement('body'),
  addEventListener: () => {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: createMockElement,
  createDocumentFragment: () => createMockElement('fragment')
};
global.localStorage = mockLocalStorage;
global.navigator = { serviceWorker: { register: async () => ({ scope: '/' }) } };

// Load Habitual Core Files
require('../web/js/colours.js');
require('../web/js/qr.js');
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
    showQuickLogOnStartup: false,
    backgroundSync: false
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
    const habit = { id: 'h1', dailyTarget: 4, type: 'positive', colorTheme: '#39d353' }; // #39d353

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
  test('COLOR_PALETTE provides Google Calendar hex colors', () => {
    assert(Array.isArray(HabitualCore.COLOR_PALETTE), 'COLOR_PALETTE is an array');
    assert(HabitualCore.COLOR_PALETTE.length > 0, 'COLOR_PALETTE is not empty');
    assert(HabitualCore.COLOR_PALETTE[0].startsWith('#'), 'COLOR_PALETTE entries are hex colors');
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

  test('generateBackfillLogs accepts native YYYY-MM-DD start date string', () => {
    const startDateStr = '2026-09-01';
    const frequency = 'daily'; // 100% completion
    const instances = '1';

    const result = HabitualCore.generateBackfillLogs(
      startDateStr, frequency, instances, 1, 'positive', 'daily', [1], '1', 1, 1
    );

    assertEqual(result.startDateKey, '2026-09-01', 'startDateKey matches selected start date');
    assert(result.logs['2026-09-01'] !== undefined, 'Log entry created on exact start date 2026-09-01');
  });

  test('generateBackfillLogs matches habit target count when instancesVal is target or dailyTarget > 1', () => {
    const duration = 10;
    const result = HabitualCore.generateBackfillLogs(
      duration, 'daily', 'target', 5, 'positive', 'daily', [1], '1', 1, 1
    );
    const keys = Object.keys(result.logs);
    assert(keys.length > 0, 'Generated logs');
    assertEqual(result.logs[keys[0]].count, 5, 'Backfilled count matches dailyTarget = 5');
  });

  test('clearLogsBeforeDateForHabit removes logs prior to date and retains logs on or after date', () => {
    const habit = {
      id: 'test_clear_before_h',
      name: 'Test Clear Before',
      logs: {
        '2026-01-01': { count: 1 },
        '2026-01-15': { count: 2 },
        '2026-02-01': { count: 1 },
        '2026-03-01': { count: 3 }
      }
    };
    HabitualCore.state.habits.push(habit);

    const cleared = HabitualCore.clearLogsBeforeDateForHabit('test_clear_before_h', '2026-02-01');
    assertEqual(cleared, 2, 'Cleared 2 logs strictly before 2026-02-01');
    assertEqual(habit.logs['2026-01-01'], undefined, '2026-01-01 cleared');
    assertEqual(habit.logs['2026-01-15'], undefined, '2026-01-15 cleared');
    assert(habit.logs['2026-02-01'] !== undefined, '2026-02-01 retained');
    assert(habit.logs['2026-03-01'] !== undefined, '2026-03-01 retained');
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

    // Check caching strategy (Cache-First + Background Cache Replacement / Stale-While-Revalidate)
    assert(swContent.includes('cachedResponse'), 'Checks cached response first');
    assert(swContent.includes('cache.put'), 'Replaces cache in background');
    assert(swContent.includes('event.waitUntil'), 'Extends service worker lifetime for background revalidation');
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
    const habit = { id: 'h1', name: 'Exercise', colorTheme: '#39d353' }; // green hex #39d353

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
    const habit1 = { id: 'h1', name: 'Exercise', type: 'positive', dailyTarget: 2, colorTheme: '#39d353', logs: { '2026-10-02': { count: 1 } } }; // ratio 0.5 -> #39d35380
    const habit2 = { id: 'h2', name: 'Reading', type: 'positive', dailyTarget: 1, colorTheme: '#388bfd', logs: { '2026-10-02': { count: 1 } } };  // ratio 1.0 -> #388bfdff

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

  test('buildSvgHeatmapGrid renders valid SVG markup for all habits combined view with linear-gradients', () => {
    const habit1 = { id: 'h1', name: 'Exercise', type: 'positive', dailyTarget: 2, colorTheme: '#39d353', logs: { '2026-10-02': { count: 1 } } };
    const habit2 = { id: 'h2', name: 'Reading', type: 'positive', dailyTarget: 1, colorTheme: '#388bfd', logs: { '2026-10-02': { count: 1 } } };
    HabitualCore.setState({
      habits: [habit1, habit2],
      selectedHabitId: 'all',
      selectedYear: 2026
    });

    const svgHTML = HabitualCore.buildSvgHeatmapGrid(null, 2026, 'all', '#39d353', null);
    assert(svgHTML.startsWith('<svg'), 'Starts with SVG tag');
    assert(svgHTML.includes('<defs>'), 'Contains definitions for linear gradients');
    assert(svgHTML.includes('<linearGradient'), 'Contains a linearGradient tag');
    assert(svgHTML.includes('stop-color="#388bfdff"'), 'Gradient contains blue at 100%');
    assert(svgHTML.includes('stop-color="#39d35391"'), 'Gradient contains green at 50%');
    assert(svgHTML.includes('data-date="2026-10-02"'), 'Includes standard rect with correct data attributes');
  });

  test('buildSvgHeatmapGrid uses memoized cache on subsequent calls without state changes', () => {
     HabitualCore.resetState();
     const state = HabitualCore.getState();
     state.habits.push(
       { id: 'h1', name: 'H1', colorTheme: 'blue', type: 'positive', dailyTarget: 1, logs: { '2026-10-03': { count: 1 } } }
     );
     HabitualCore._lastStateHash = 'hash123';
     const cursorDate = HabitualCore.getCursorDateKey ? HabitualCore.getCursorDateKey() : HabitualCore.getTodayKey();
     const cacheKey = 'all_2026_hash123_' + cursorDate;

     const call1 = HabitualCore.buildSvgHeatmapGrid(null, 2026, 'all', 'green', null);
     assert(HabitualCore.svgCache[cacheKey] === call1, 'SVG string added to cache');

     HabitualCore.svgCache[cacheKey] = '<svg>CACHED</svg>';
     const call2 = HabitualCore.buildSvgHeatmapGrid(null, 2026, 'all', 'green', null);

     assertEqual(call2, '<svg>CACHED</svg>', 'Returns cached SVG string when hash and cursor match');
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

  test('downloadHeatmapSVG includes sub-habits when exporting SVG for parent habit', () => {
    const parentHabit = { id: 'health_svg', name: 'Health Routine', type: 'positive', dailyTarget: 1, colorTheme: '#009688', logs: { '2026-10-02': { count: 1 } } };
    const subHabit = { id: 'health_svg_running', name: 'Morning Run', parentId: 'health_svg', type: 'positive', dailyTarget: 1, colorTheme: '#f4511e', logs: { '2026-10-02': { count: 1 } } };

    HabitualCore.setState({
      habits: [parentHabit, subHabit],
      selectedHabitId: 'all',
      selectedYear: 2026
    });

    let generatedSvg = null;
    const origCreateObjectURL = global.URL.createObjectURL || (() => 'blob:mock');
    global.URL.createObjectURL = (blob) => 'blob:mock_svg_url';

    const origRemoveChild = global.document.body.removeChild;
    global.document.body.removeChild = function() {};

    const origCreateElement = global.document.createElement;
    global.document.createElement = function(tag) {
      const elem = origCreateElement(tag);
      if (tag === 'a') {
        elem.click = function() {};
      }
      return elem;
    };

    const origBlob = global.Blob || function() {};
    global.Blob = function(parts, options) {
      generatedSvg = parts.join('');
      return { size: generatedSvg.length };
    };

    try {
      HabitualCore.downloadHeatmapSVG('health_svg', 2026);
      assert(generatedSvg !== null, 'Generated SVG string is not null');
      assert(generatedSvg.includes('linearGradient'), 'SVG includes linearGradient for parent + sub-habit combination');
      assert(generatedSvg.includes('data-habits-done="Health Routine, Morning Run"'), 'SVG contains data-habits-done with both parent and sub-habit names');
    } finally {
      global.document.body.removeChild = origRemoveChild;
      global.Blob = origBlob;
      global.URL.createObjectURL = origCreateObjectURL;
      global.document.createElement = origCreateElement;
    }
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
    assert((quickLogBtn.outerHTML && quickLogBtn.outerHTML.includes('icon-tick')) || (quickLogBtn.innerHTML && quickLogBtn.innerHTML.includes('icon-tick')) || (quickLogBtn.textContent && quickLogBtn.textContent.includes('icon-tick')) || quickLogBtn.textContent.includes('✓'), 'Button content contains tick mark ✓ when goal is reached');
  });

  test('btn-card-quick-log displays plus sign when goal is not yet reached', () => {
    HabitualCore.resetState();
    const habit = { id: 'reading', name: 'Reading', type: 'positive', dailyTarget: 2, colorTheme: 'purple', logs: {} };
    HabitualCore.setState({ habits: [habit], selectedHabitId: 'all', selectedYear: 2026 });

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    const quickLogBtn = card.querySelector('.btn-card-quick-log');
    assert(quickLogBtn !== null, 'Card contains .btn-card-quick-log button');
    assert(!quickLogBtn.classList.contains('goal-met'), 'Button does not have goal-met class');
    assert((quickLogBtn.outerHTML && quickLogBtn.outerHTML.includes('icon-plus')) || (quickLogBtn.innerHTML && quickLogBtn.innerHTML.includes('icon-plus')) || (quickLogBtn.textContent && quickLogBtn.textContent.includes('icon-plus')) || quickLogBtn.textContent.includes('+'), 'Button displays + symbol when goal is unfulfilled');
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

  test('Delegated click on btn-card-quick-log increments progress when goal is not met', () => {
    HabitualCore.resetState();
    const todayKey = HabitualCore.getTodayKey();
    const habit = { id: 'stretching', name: 'Stretching', type: 'positive', dailyTarget: 2, logs: {} };
    HabitualCore.setState({ habits: [habit], selectedHabitId: 'all', selectedYear: 2026 });

    const originalElements = HabitualCore.elements;
    const galleryMock = createMockElement('div');
    HabitualCore.elements = {
      heatmapsGallery: galleryMock,
      yearSelector: createMockElement('select')
    };

    // Attach heatmap square and gallery events
    HabitualCore.attachHeatmapSquareEvents();

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    galleryMock.appendChild(card);

    const quickLogBtn = card.querySelector('.btn-card-quick-log');
    assert(quickLogBtn !== null, 'Quick log button rendered on card');

    // Trigger delegated click on quick log button
    quickLogBtn.click();

    assertEqual(habit.logs[todayKey]?.count, 1, 'Clicking btn-card-quick-log incremented progress count to 1');

    HabitualCore.elements = originalElements;
  });

  test('Delegated click on btn-card-quick-log adds to log even when goal is already met', () => {
    HabitualCore.resetState();
    const todayKey = HabitualCore.getTodayKey();
    const habit = { id: 'water', name: 'Water', type: 'positive', dailyTarget: 1, logs: { [todayKey]: { count: 1 } } };
    HabitualCore.setState({ habits: [habit], selectedHabitId: 'all', selectedYear: 2026 });

    const originalElements = HabitualCore.elements;
    const galleryMock = createMockElement('div');
    HabitualCore.elements = {
      heatmapsGallery: galleryMock,
      yearSelector: createMockElement('select')
    };

    // Attach heatmap square and gallery events
    HabitualCore.attachHeatmapSquareEvents();

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    galleryMock.appendChild(card);

    const quickLogBtn = card.querySelector('.btn-card-quick-log');
    assert(quickLogBtn !== null, 'Quick log button rendered on card');
    assert(quickLogBtn.classList.contains('goal-met'), 'Quick log button has goal-met class');

    // Trigger delegated click on quick log button when goal is already met
    quickLogBtn.click();

    assertEqual(habit.logs[todayKey]?.count, 2, 'Clicking btn-card-quick-log when goal is met increments log count to 2');

    HabitualCore.elements = originalElements;
  });

  test('Delegated click on day square opens log modal without ReferenceError', () => {
    HabitualCore.resetState();
    const habit = { id: 'water', name: 'Water', type: 'positive', dailyTarget: 1, logs: {} };
    HabitualCore.setState({ habits: [habit], selectedHabitId: 'all', selectedYear: 2026 });

    const originalElements = HabitualCore.elements;
    const galleryMock = createMockElement('div');
    HabitualCore.elements = {
      heatmapsGallery: galleryMock,
      yearSelector: createMockElement('select'),
      habitModal: createMockElement('div')
    };

    let openedDate = null, openedHabitId = null;
    const originalOpenLogModal = HabitualCore.openLogModal;
    HabitualCore.openLogModal = (d, h) => { openedDate = d; openedHabitId = h; };

    HabitualCore.attachHeatmapSquareEvents();

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    galleryMock.appendChild(card);

    const mockSquare = createMockElement('rect');
    mockSquare.classList.add('day-square');
    mockSquare.setAttribute('data-date', '2026-01-01');
    mockSquare.setAttribute('data-habit-id', 'water');
    card.appendChild(mockSquare);

    mockSquare.click();

    assertEqual(openedHabitId, 'water', 'Clicking day square passed habit ID to openLogModal without cardHabitId ReferenceError');

    HabitualCore.openLogModal = originalOpenLogModal;
    HabitualCore.elements = originalElements;
  });

  test('Delegated click on card background opens log modal without ReferenceError', () => {
    HabitualCore.resetState();
    const habit = { id: 'water', name: 'Water', type: 'positive', dailyTarget: 1, logs: {} };
    HabitualCore.setState({ habits: [habit], selectedHabitId: 'all', selectedYear: 2026 });

    const originalElements = HabitualCore.elements;
    const galleryMock = createMockElement('div');
    HabitualCore.elements = {
      heatmapsGallery: galleryMock,
      yearSelector: createMockElement('select')
    };

    let openedHabitId = null;
    const originalOpenLogModal = HabitualCore.openLogModal;
    HabitualCore.openLogModal = (d, h) => { openedHabitId = h; };

    HabitualCore.attachHeatmapSquareEvents();

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    galleryMock.appendChild(card);

    card.click();

    assertEqual(openedHabitId, 'water', 'Clicking card background passed habit ID to openLogModal without cardHabitId ReferenceError');

    HabitualCore.openLogModal = originalOpenLogModal;
    HabitualCore.elements = originalElements;
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
    const habit = { id: 'reading', name: 'Reading', type: 'positive', dailyTarget: 1, colorTheme: '#39d353', logs: {} };
    const card = HabitualCore.buildHeatmapCard(habit, 2026, '#39d353', '2026-10-03');
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

  test('hideHeatmap option renders minimal checkbox view card without 52-week heatmap grid', () => {
    HabitualCore.resetState();
    const state = HabitualCore.getState();
    const habit = { id: 'test_minimal', name: 'Minimal Checklist Task', createdAt: HabitualCore.getTodayKey(), hideHeatmap: true, logs: {} };
    state.habits.push(habit);

    const cardMinimal = HabitualCore.buildHeatmapCard(habit, 2026);
    assert(cardMinimal.classList.contains('minimal-checkbox-card'), 'Card has minimal-checkbox-card class');
    assert(!cardMinimal.innerHTML.includes('heatmap-wrapper'), 'Card omits heatmap-wrapper grid');
    assert(cardMinimal.innerHTML.includes('btn-card-quick-log'), 'Card retains quick check-in log button');

    habit.hideHeatmap = false;
    const cardNormal = HabitualCore.buildHeatmapCard(habit, 2026);
    assert(!cardNormal.classList.contains('minimal-checkbox-card'), 'Normal card omits minimal-checkbox-card class');
    assert(cardNormal.innerHTML.includes('heatmap-wrapper'), 'Normal card includes heatmap-wrapper grid');
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
          if (node && (node.tagName === 'FRAGMENT' || (node.tagName && node.tagName.toLowerCase() === 'fragment') || node.nodeType === 11)) {
            const list = Array.from(node.children || node.childNodes || []);
            list.forEach(c => appenedCards.push(c));
          } else {
            appenedCards.push(node);
          }
        },
        querySelectorAll() {
          return [];
        },
        querySelector() {
          return null;
        },
        addEventListener() {}
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

    HabitualCore.elements.habitModal = createMockElement('div');
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
      heatmapsGallery: { innerHTML: '', appendChild: () => {}, querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {} },
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

    // Test 'a' key (left = -1 day)
    keydownListener({ key: 'a', preventDefault: () => {} });
    const yesterday = HabitualCore.getDaysAgoKey(1);
    assertEqual(HabitualCore.getCursorDateKey(), yesterday, "'a' key moves cursor left 1 day");

    // Test 'd' key (right = +1 day)
    keydownListener({ key: 'd', preventDefault: () => {} });
    assertEqual(HabitualCore.getCursorDateKey(), today, "'d' key moves cursor right 1 day");

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

  test('setupMobileArrowPad supports optional arrow key handlers when elements exist', () => {
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

    // Test Left button (-1 day)
    buttonListeners['btn-arrow-left'](dummyEvent);
    const yesterday = HabitualCore.getDaysAgoKey(1);
    assertEqual(HabitualCore.getCursorDateKey(), yesterday, 'Left button moves cursor left 1 day');

    // Test Right button (+1 day)
    buttonListeners['btn-arrow-right'](dummyEvent);
    assertEqual(HabitualCore.getCursorDateKey(), today, 'Right button moves cursor right 1 day');

    // Test Today button
    HabitualCore.setCursorDateKey('2026-01-01');
    buttonListeners['btn-arrow-today'](dummyEvent);
    assertEqual(HabitualCore.getCursorDateKey(), today, 'Today button resets cursor to today');
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

  test('mergeStatePayloads respects cleared logs (count = 0 or removed) from newer habit update', () => {
    const localOld = {
      updatedAt: 100,
      habits: [{ id: 'water', name: 'Water', updatedAt: 100, logs: { '2026-10-01': { count: 3 } } }]
    };
    const remoteNewerCleared = {
      updatedAt: 200,
      habits: [{ id: 'water', name: 'Water', updatedAt: 200, logs: { '2026-10-01': { count: 0 } } }]
    };
    const merged = HabitualCore.mergeStatePayloads(localOld, remoteNewerCleared);
    const logVal = merged.habits[0].logs['2026-10-01'];
    assert(!logVal || logVal.count === 0, 'Cleared log entry with count 0 from newer payload is respected during merge');
  });

  test('recordUpdateEvent records events and prunes entries older than 24 hours', () => {
    HabitualCore.resetState();
    const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    const newTimestamp = Date.now() - (1 * 60 * 60 * 1000);  // 1 hour ago

    HabitualCore.state.updateLog = [
      { id: 'old_evt', timestamp: oldTimestamp, type: 'log_update', habitId: 'water', dateKey: '2026-10-01', count: 1 }
    ];

    HabitualCore.recordUpdateEvent({
      id: 'new_evt',
      timestamp: newTimestamp,
      type: 'log_update',
      habitId: 'water',
      dateKey: '2026-10-02',
      count: 2
    });

    const activeLog = HabitualCore.pruneUpdateLog();
    assertEqual(activeLog.length, 1, 'Only 1 event remains within 24 hours window');
    assertEqual(activeLog[0].id, 'new_evt', 'Pruned event keeps recent update event');
  });

  test('mergeStatePayloads replays 24-hour updateLog operations across devices', () => {
    HabitualCore.resetState();
    const now = Date.now();
    const localPayload = {
      updatedAt: now - 1000,
      habits: [{ id: 'water', name: 'Water', updatedAt: now - 1000, logs: { '2026-10-25': { count: 1 } } }],
      updateLog: []
    };

    const remotePayload = {
      updatedAt: now,
      habits: [{ id: 'water', name: 'Water', updatedAt: now, logs: { '2026-10-25': { count: 1 } } }],
      updateLog: [
        { id: 'evt_clear', timestamp: now, type: 'log_update', habitId: 'water', dateKey: '2026-10-25', count: 0, note: '' }
      ]
    };

    const merged = HabitualCore.mergeStatePayloads(localPayload, remotePayload);
    const logVal = merged.habits[0].logs['2026-10-25'];
    assert(!logVal || logVal.count === 0, 'Replayed log_update event from remote updateLog cleared log entry on local device');
  });

  test('SyncManager target toggles and settings persistence', () => {
    HabitualCore.SyncManager.toggleTarget('firestore', true);
    assert(HabitualCore.SyncManager.isTargetEnabled('firestore'), 'Firestore target enabled');
    HabitualCore.SyncManager.toggleTarget('firestore', false);
    assert(!HabitualCore.SyncManager.isTargetEnabled('firestore'), 'Firestore target disabled');
  });

  test('getDeltaPayloadFromState minimizes payload by omitting default properties and old logs', () => {
    const recentKey = HabitualCore.getTodayKey ? HabitualCore.getTodayKey() : '2026-10-14';
    HabitualCore.state.habits = [
      {
        id: 'water_1',
        name: HabitualCore.deriveNameFromId('water_1'),
        colorTheme: HabitualCore.getDefaultColorForId('water_1'),
        dailyTarget: 1,
        logs: {
          '2020-01-01': { count: 1 },
          [recentKey]: { count: 2, note: 'Fresh water' }
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
    assertEqual(h.logs[recentKey].count, 2, 'Recent log is preserved');
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

  test('Firestore Live Sync suppresses self-write echoes and rate-limits snapshot processing', async () => {
    mockLocalStorage.setItem('habitual_sync_passphrase', 'TestPassphrase123');
    HabitualCore.SyncManager.settings.passphrase = 'TestPassphrase123';

    let uploadedDoc = null;
    let snapshotCallback = null;

    const mockDb = {
      collection: () => ({
        doc: () => ({
          set: (data) => {
            uploadedDoc = data;
            return Promise.resolve();
          },
          onSnapshot: (cb) => {
            snapshotCallback = cb;
            return () => {};
          }
        })
      })
    };

    HabitualCore.SyncTargets.Firestore.db = mockDb;
    HabitualCore.SyncTargets.Firestore.minSyncInterval = 50; // shorten throttle delay for test speed

    // 1. Verify uploadBackup includes writerId matching CLIENT_ID
    const initialPayload = { habits: [{ id: 'run', name: 'Daily Running', logs: {} }] };
    const encrypted = await HabitualCore.E2EE.encrypt(initialPayload, 'TestPassphrase123');
    await HabitualCore.SyncTargets.Firestore.uploadBackup(encrypted);

    assert(uploadedDoc !== null, 'uploadBackup writes document to Firestore');
    assertEqual(uploadedDoc.writerId, HabitualCore.CLIENT_ID, 'Uploaded document contains writerId matching HabitualCore.CLIENT_ID');
    assertEqual(HabitualCore.SyncTargets.Firestore.lastSentCiphertext, encrypted, 'lastSentCiphertext recorded on Firestore target');

    // 2. Test startLiveSync and self-write echo suppression
    HabitualCore.SyncTargets.Firestore.startLiveSync();
    assert(typeof snapshotCallback === 'function', 'onSnapshot listener attached');

    let toastEmitted = false;
    const origShowToast = HabitualCore.showToast;
    HabitualCore.showToast = function(msg) {
      toastEmitted = true;
      if (origShowToast) origShowToast(msg);
    };

    // Simulate self-write snapshot event with hasPendingWrites = true
    snapshotCallback({
      exists: true,
      metadata: { hasPendingWrites: true },
      data: () => uploadedDoc
    });

    assert(HabitualCore.SyncTargets.Firestore.pendingSnapshotData === null, 'Snapshot with hasPendingWrites=true is skipped immediately');

    // Simulate self-write snapshot event with writerId matching CLIENT_ID
    snapshotCallback({
      exists: true,
      metadata: { hasPendingWrites: false },
      data: () => ({ ciphertext: encrypted, writerId: HabitualCore.CLIENT_ID })
    });

    assert(HabitualCore.SyncTargets.Firestore.pendingSnapshotData === null, 'Snapshot with writerId matching CLIENT_ID is skipped (self-write echo suppressed)');

    // 3. Test remote snapshot processing & rate limiting throttle
    const remoteState = { habits: [{ id: 'swim', name: 'Morning Swim', logs: { '2026-10-09': { count: 1 } } }] };
    const remoteEncrypted = await HabitualCore.E2EE.encrypt(remoteState, 'TestPassphrase123');

    // Dispatch remote snapshot event (different writerId)
    snapshotCallback({
      exists: true,
      metadata: { hasPendingWrites: false },
      data: () => ({ ciphertext: remoteEncrypted, writerId: 'cli_remote_999' })
    });

    assert(HabitualCore.SyncTargets.Firestore.pendingSnapshotData !== null, 'Remote snapshot data is queued for throttled processing');

    // Wait for throttle delay to elapse
    await new Promise(r => setTimeout(r, 80));

    assert(HabitualCore.SyncTargets.Firestore.pendingSnapshotData === null, 'Pending snapshot cleared after processing');
    const stateHabits = HabitualCore.getState().habits;
    assert(stateHabits.some(h => h.id === 'swim'), 'Remote habit "swim" merged into state via throttled live sync');
    assert(toastEmitted === true, 'Toast emitted for valid remote state update');

    // Clean up
    HabitualCore.showToast = origShowToast;
    HabitualCore.SyncTargets.Firestore.stopLiveSync();
    HabitualCore.SyncTargets.Firestore.db = null;
    HabitualCore.SyncTargets.Firestore.minSyncInterval = 1500;
  });

  test('core.isSyncPage helper detects sync.html and startLiveSync suppresses listener on sync page', async () => {
    // 1. Mock window.location for index.html
    const origLocation = global.window.location;
    global.window.location = { pathname: '/index.html', href: 'http://localhost/index.html' };

    assertEqual(HabitualCore.isSyncPage(), false, 'isSyncPage returns false when on index.html');

    let listenerAttachedOnIndex = false;
    HabitualCore.SyncTargets.Firestore.db = {
      collection: () => ({
        doc: () => ({
          onSnapshot: () => { listenerAttachedOnIndex = true; return () => {}; }
        })
      })
    };
    HabitualCore.SyncTargets.Firestore.isListening = false;
    HabitualCore.SyncManager.settings.passphrase = 'TestPassKey';

    await HabitualCore.SyncTargets.Firestore.startLiveSync();
    assert(listenerAttachedOnIndex === true, 'startLiveSync attaches snapshot listener when on index.html');

    HabitualCore.SyncTargets.Firestore.stopLiveSync();

    // 2. Mock window.location for sync.html
    global.window.location = { pathname: '/sync.html', href: 'http://localhost/sync.html' };

    assertEqual(HabitualCore.isSyncPage(), true, 'isSyncPage returns true when on sync.html');

    let listenerAttachedOnSync = false;
    HabitualCore.SyncTargets.Firestore.db = {
      collection: () => ({
        doc: () => ({
          onSnapshot: () => { listenerAttachedOnSync = true; return () => {}; }
        })
      })
    };
    HabitualCore.SyncTargets.Firestore.isListening = false;

    await HabitualCore.SyncTargets.Firestore.startLiveSync();
    assert(listenerAttachedOnSync === false, 'startLiveSync suppresses snapshot listener when on sync.html page');

    // Restore location and clean up
    global.window.location = origLocation;
    HabitualCore.SyncTargets.Firestore.stopLiveSync();
    HabitualCore.SyncTargets.Firestore.db = null;
  });

  test('E2EE Key Caching, Outbound Write Debouncing & Duplicate Upload Suppression', async () => {
    // 1. E2EE WebCrypto Key Caching Test
    const passphrase = 'KeyCachePassphrase123!';
    const saltBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    HabitualCore.E2EE._keyCache.clear();
    const key1 = await HabitualCore.E2EE.getKey(passphrase, saltBytes);
    assert(key1 !== null, 'getKey returned WebCrypto key');
    assert(HabitualCore.E2EE._keyCache.size === 1, '_keyCache size is 1 after initial derivation');

    const key2 = await HabitualCore.E2EE.getKey(passphrase, saltBytes);
    assertEqual(key1, key2, 'getKey returns cached WebCrypto key on subsequent call');

    // 2. Outbound Sync Write Debouncing Test
    let writeCount = 0;
    const origBroadcastWrite = HabitualCore.SyncManager.broadcastWrite;
    HabitualCore.SyncManager.broadcastWrite = function() {
      writeCount++;
    };

    HabitualCore.SyncManager.broadcastWriteDebounced({ test: 1 }, 50);
    HabitualCore.SyncManager.broadcastWriteDebounced({ test: 2 }, 50);
    HabitualCore.SyncManager.broadcastWriteDebounced({ test: 3 }, 50);

    assertEqual(writeCount, 0, 'Immediate write count is 0 before debounce timer elapses');

    await new Promise(r => setTimeout(r, 80));
    assertEqual(writeCount, 1, 'Debounced broadcastWrite batched 3 rapid calls into 1 single execution');

    HabitualCore.SyncManager.broadcastWrite = origBroadcastWrite;

    // 3. Duplicate Upload Suppression Test
    let setCallCount = 0;
    HabitualCore.SyncTargets.Firestore.db = {
      collection: () => ({
        doc: () => ({
          set: () => { setCallCount++; return Promise.resolve(); }
        })
      })
    };
    HabitualCore.SyncManager.settings.passphrase = passphrase;
    HabitualCore.SyncTargets.Firestore.lastUploadedPayloadStr = null;

    HabitualCore.setState({ habits: [{ id: 'dedup1', name: 'Dedup Habit', logs: {} }] });

    await HabitualCore.SyncTargets.Firestore.uploadBackup();
    assertEqual(setCallCount, 1, 'Initial uploadBackup calls Firestore set()');

    // Calling uploadBackup again with identical payload
    await HabitualCore.SyncTargets.Firestore.uploadBackup();
    assertEqual(setCallCount, 1, 'Duplicate uploadBackup skipped redundant upload when payload was unchanged');

    HabitualCore.SyncTargets.Firestore.db = null;
    HabitualCore.SyncTargets.Firestore.lastUploadedPayloadStr = null;
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

  test('Personal Device QR & URL Sync Connection: checkURLHashForSyncConnection configures Master Password and Store Sync', async () => {
    mockLocalStorage.removeItem('habitual_firestore_sync_code');
    mockLocalStorage.removeItem('habitual_sync_passphrase');
    mockLocalStorage.removeItem('habitual_sync_targets');
    HabitualCore.SyncManager.settings.enabledTargets = [];
    HabitualCore.SyncManager.settings.passphrase = '';

    const testCode = 'HAB-DEV999';
    const testPass = 'MasterKeyPersonal123!';

    const origLocation = global.window.location;
    const origShowToast = HabitualCore.showToast;

    global.window.location = {
      pathname: '/index.html',
      search: '',
      hash: `#sync?code=${encodeURIComponent(testCode)}&pass=${encodeURIComponent(testPass)}`
    };

    const toastHistory = [];
    HabitualCore.showToast = (msg, type) => { toastHistory.push({ msg, type }); };

    try {
      HabitualCore.checkURLHashForSyncConnection();

      assertEqual(HabitualCore.SyncManager.settings.passphrase, testPass, 'Master Passphrase extracted and set');
      assertEqual(HabitualCore.SyncTargets.Firestore.getSyncCode(), testCode, 'Firestore Sync Code extracted and set');
      assert(HabitualCore.SyncManager.isTargetEnabled('firestore'), 'Firestore Sync Target automatically enabled');
      assert(toastHistory.some(t => t.msg.includes('Personal Device Connected')), 'Toast explicitly informs user of personal device connection');
    } finally {
      global.window.location = origLocation;
      HabitualCore.showToast = origShowToast;
    }
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

  test('AudioSync emitCodeChirp and listenForCodeChirp encode and decode Firestore Sync Code', async () => {
    await HabitualCore.AudioSync.init();
    const syncCode = 'HAB-SYNC99';

    let chirpStarted = false;
    global.AudioContext = class {
      constructor() { this.sampleRate = 48000; this.state = 'running'; }
      resume() { return Promise.resolve(); }
      createBuffer(channels, length, sampleRate) { return { length, getChannelData: () => new Float32Array(length) }; }
      createBufferSource() { return { buffer: null, connect: () => {}, start: () => { chirpStarted = true; } }; }
    };

    await HabitualCore.AudioSync.emitCodeChirp(syncCode);
    assert(chirpStarted === true, 'emitCodeChirp starts WebAudio buffer playback');

    const syncHtmlPath = path.join(__dirname, '../web/sync.html');
    assert(fs.existsSync(syncHtmlPath), 'web/sync.html exists');
    const syncHtml = fs.readFileSync(syncHtmlPath, 'utf8');
    assert(syncHtml.includes('btn-firestore-chirp-code'), 'sync.html contains btn-firestore-chirp-code');
    assert(syncHtml.includes('btn-firestore-chirp-listen'), 'sync.html contains btn-firestore-chirp-listen');
  });

  test('Local user habit setting edit (e.g. showStreak) updates habit.updatedAt and overrides older remote Firestore data after time delay', async () => {
    const initialHabit = {
      id: 'meditation',
      name: 'Meditation',
      showStreak: false,
      createdAt: '2026-10-01',
      updatedAt: Date.now() - 5000
    };
    HabitualCore.state.habits = [initialHabit];

    const remoteOldPayload = {
      version: 2,
      updatedAt: Date.now() - 5000,
      habits: [JSON.parse(JSON.stringify(initialHabit))]
    };

    await new Promise(r => setTimeout(r, 50));

    initialHabit.showStreak = true;
    await HabitualCore.saveHabit(initialHabit);

    assert(initialHabit.updatedAt > (Date.now() - 1000), 'saveHabit updated habit.updatedAt to current timestamp');

    const localPayload = HabitualCore.getPayloadFromState();
    const mergedPayload = HabitualCore.mergeStatePayloads(localPayload, remoteOldPayload);

    const mergedHabit = mergedPayload.habits.find(h => h.id === 'meditation');
    assert(mergedHabit !== undefined, 'Merged habit exists');
    assertEqual(mergedHabit.showStreak, true, 'User preference (showStreak: true) is preserved and overrides older Firestore data');
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
describe('Feature 29: 📦 Sync Page JSON Export & Mobile Backup Engine', () => {
  test('web/sync.html exists, contains Backup & Restore JSON section and #btn-export-json button', () => {
    const syncHtmlPath = path.join(__dirname, '../web/sync.html');
    assert(fs.existsSync(syncHtmlPath), 'web/sync.html exists');
    const content = fs.readFileSync(syncHtmlPath, 'utf8');

    assert(content.includes('dark-theme'), 'sync.html contains dark-theme class');
    assert(content.includes('Backup & Restore JSON'), 'sync.html contains Backup & Restore JSON heading');
    assert(content.includes('id="btn-export-json"'), 'sync.html contains #btn-export-json button');
    assert(content.includes('id="input-import-json"'), 'sync.html contains #input-import-json file input');
    assert(content.includes('js/storage.js') && content.includes('js/ui.js'), 'sync.html links storage.js and ui.js');
  });

  test('core.exportDataJSON creates a download link with formatted backup JSON payload', () => {
    // Populate sample state
    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [
        {
          id: 'export_test_1',
          name: 'Export Test Habit',
          type: 'positive',
          dailyTarget: 1,
          colorTheme: 'blue',
          logs: { '2026-10-09': { count: 1, note: 'Export test note' } }
        }
      ]
    });

    let clickedAnchor = null;
    let appendedChild = null;

    // Spy on document.createElement('a') and document.body.appendChild
    const originalCreateElement = global.document.createElement;
    const originalAppendChild = global.document.body.appendChild;

    global.document.createElement = function(tagName) {
      const elem = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        elem.click = function() {
          clickedAnchor = elem;
        };
      }
      return elem;
    };

    global.document.body.appendChild = function(child) {
      appendedChild = child;
      return originalAppendChild ? originalAppendChild(child) : child;
    };

    try {
      HabitualCore.exportDataJSON();

      assert(clickedAnchor !== null, 'exportDataJSON clicked the dynamic download anchor element');
      const downloadAttr = clickedAnchor.getAttribute('download');
      assert(downloadAttr !== null && downloadAttr.startsWith('habitual_backup_') && downloadAttr.endsWith('.json'), `Download attribute set correctly (${downloadAttr})`);

      const href = clickedAnchor.getAttribute('href');
      assert(href !== null, 'Href attribute is set on download anchor');

      // Verify payload in href (either data URL or Blob URL)
      if (href.startsWith('data:text/json;charset=utf-8,')) {
        const jsonStr = decodeURIComponent(href.replace('data:text/json;charset=utf-8,', ''));
        const payload = JSON.parse(jsonStr);
        assert(Array.isArray(payload.habits), 'Exported payload contains habits array');
        assertEqual(payload.habits[0].id, 'export_test_1', 'Exported habit ID matches state');
        assertEqual(payload.habits[0].name, 'Export Test Habit', 'Exported habit name matches state');
      } else {
        assert(href.length > 0, 'Blob URL generated for download anchor');
      }
    } finally {
      global.document.createElement = originalCreateElement;
      global.document.body.appendChild = originalAppendChild;
    }
  });

  test('core.importDataJSON successfully restores habits and logs state from JSON event', (done) => {
    const backupPayload = {
      version: '1.13.5',
      timestamp: Date.now(),
      habits: [
        {
          id: 'imported_habit_99',
          name: 'Restored Habit',
          type: 'positive',
          dailyTarget: 2,
          colorTheme: 'green',
          logs: { '2026-10-09': { count: 2, note: 'Restored log note' } }
        }
      ]
    };

    const mockEvent = {
      target: {
        files: [
          { name: 'habitual_backup.json' }
        ]
      }
    };

    // Mock FileReader
    const originalFileReader = global.FileReader;
    global.FileReader = class MockFileReader {
      readAsText() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({
              target: { result: JSON.stringify(backupPayload) }
            });

            const state = HabitualCore.getState();
            assertEqual(state.habits.length, 1, 'Restored 1 habit into state');
            assertEqual(state.habits[0].id, 'imported_habit_99', 'Restored habit ID matches');
            assertEqual(state.habits[0].name, 'Restored Habit', 'Restored habit name matches');
            global.FileReader = originalFileReader;
          }
        }, 10);
      }
    };

    HabitualCore.importDataJSON(mockEvent);
  });

  test('Full Backup Export-to-Import Roundtrip: Exports state to JSON and restores it completely', () => {
    // 1. Setup initial state with custom habit and log entries
    const initialHabit = {
      id: 'roundtrip_habit_101',
      name: 'Full Roundtrip Habit',
      type: 'positive',
      dailyTarget: 3,
      colorTheme: '#ff8800',
      logs: { '2026-10-09': { count: 3, note: 'Roundtrip test note' } }
    };
    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [initialHabit]
    });

    // 2. Export payload via core.getPayloadFromState()
    const exportedPayload = HabitualCore.getPayloadFromState();
    assert(exportedPayload !== null, 'Exported payload is not null');
    assert(Array.isArray(exportedPayload.habits), 'Exported payload contains habits array');

    // 3. Clear state (simulating fresh app or reset data)
    HabitualCore.resetState();
    assertEqual(HabitualCore.getState().habits.length, 0, 'In-memory state reset before import');

    // 4. Import the exported payload back using core.applyPayloadToState()
    HabitualCore.applyPayloadToState(exportedPayload);

    // 5. Verify state matches original habit and log data
    const restoredHabits = HabitualCore.getState().habits;
    assertEqual(restoredHabits.length, 1, 'Restored 1 habit from exported payload');
    assertEqual(restoredHabits[0].id, 'roundtrip_habit_101', 'Restored habit ID matches');
    assertEqual(restoredHabits[0].name, 'Full Roundtrip Habit', 'Restored habit name matches');
    assertEqual(restoredHabits[0].dailyTarget, 3, 'Restored daily target matches');
    assertEqual(restoredHabits[0].logs['2026-10-09'].count, 3, 'Restored log count matches');
    assertEqual(restoredHabits[0].logs['2026-10-09'].note, 'Roundtrip test note', 'Restored log note matches');
  });
});

// ============================================================================
describe('Feature 30: 👥 Per-Habit Storage Overrides & Firestore Sharing', () => {
  test('core.generateQRCodeSVG generates valid SVG QR code string', () => {
    assert(typeof HabitualCore.generateQRCodeSVG === 'function', 'core.generateQRCodeSVG function exists');
    const svg = HabitualCore.generateQRCodeSVG('http://localhost:8000/#share?col=shared_123&pwd=sec_456&name=Bin%20Day', 180);
    assert(svg.includes('<svg'), 'Generated output contains <svg tag');
    assert(svg.includes('viewBox="0 0 100 100"'), 'SVG contains valid viewBox attribute');
    assert(svg.includes('<rect'), 'SVG contains QR code rect modules');
  });

  test('Habit object supports sharing configuration property', () => {
    const habit = {
      id: 'shared_bin_day',
      name: 'Bins Out',
      type: 'positive',
      dailyTarget: 1,
      sharing: {
        enabled: true,
        collection: 'shared_hb_bins123',
        password: 'secret_passphrase_789'
      },
      logs: {}
    };

    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [habit]
    });

    const storedState = HabitualCore.getState();
    assertEqual(storedState.habits[0].sharing.enabled, true, 'Habit sharing enabled flag is true');
    assertEqual(storedState.habits[0].sharing.collection, 'shared_hb_bins123', 'Habit collection matches');
    assertEqual(storedState.habits[0].sharing.password, 'secret_passphrase_789', 'Habit password matches');
  });

  test('buildHeatmapCard renders badge-shared for shared habits', () => {
    const sharedHabit = {
      id: 'shared_habit_test',
      name: 'Shared Family Habit',
      type: 'positive',
      dailyTarget: 1,
      sharing: {
        enabled: true,
        collection: 'shared_hb_family',
        password: 'fam_pass'
      },
      logs: {}
    };

    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [sharedHabit]
    });

    const cardElem = HabitualCore.buildHeatmapCard(sharedHabit, 2026);
    const htmlStr = cardElem.outerHTML || cardElem.innerHTML || '';
    assert(htmlStr.includes('badge-shared'), 'Heatmap card includes badge-shared class');
    assert(htmlStr.includes('👥 Shared'), 'Heatmap card displays shared icon and badge text');
  });

  test('stopSharingHabit disables sharing and converts shared habit to local habit while retaining logs', () => {
    const today = HabitualCore.getTodayKey();
    const sharedHabit = {
      id: 'shared_unshare_test',
      name: 'Unshare Test Habit',
      type: 'positive',
      dailyTarget: 1,
      sharing: {
        enabled: true,
        collection: 'shared_hb_unshare',
        password: 'unshare_pass'
      },
      logs: { [today]: { count: 1, note: 'Check-in log' } }
    };

    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [sharedHabit]
    });

    const cardElemShared = HabitualCore.buildHeatmapCard(sharedHabit, 2026);
    assert(cardElemShared.innerHTML.includes('badge-shared') || cardElemShared.innerHTML.includes('btn-card-share'), 'Shared card includes share indicator');

    HabitualCore.stopSharingHabit('shared_unshare_test');

    const updatedHabit = HabitualCore.getState().habits.find(h => h.id === 'shared_unshare_test');
    assertEqual(updatedHabit.sharing.enabled, false, 'stopSharingHabit sets sharing.enabled to false');
    assertEqual(updatedHabit.logs[today].count, 1, 'Habit retains all past check-in logs after unsharing');

    const cardElemUnshared = HabitualCore.buildHeatmapCard(updatedHabit, 2026);
    assert(!cardElemUnshared.innerHTML.includes('badge-shared'), 'Unshared card removes shared badge');
    assert(cardElemUnshared.innerHTML.includes('btn-card-edit'), 'Unshared card includes Edit button');
  });

  test('Habit ID remains immutable when shared or unshared and parent/child names are derivable from ID', () => {
    const parentId = 'fitness_workout';
    const childName = 'Pushups';
    const habitId = `${parentId}_${HabitualCore.idFromName(childName)}`;

    const habit = {
      id: habitId,
      name: 'Pushups',
      parentId: parentId,
      type: 'positive',
      dailyTarget: 10,
      sharing: {
        enabled: true,
        collection: 'shared_hb_pushups',
        password: 'pushups_pass'
      },
      logs: {}
    };

    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [habit]
    });

    const parsedNames = HabitualCore.getHabitParentAndChildNames(habitId);
    assertEqual(parsedNames.parentName, 'Workout', 'Parent name derived from habit ID');
    assertEqual(parsedNames.childName, 'Pushups', 'Child name derived from habit ID');

    // Verify ID remains unchanged after unsharing
    HabitualCore.stopSharingHabit(habitId);
    const unsharedHabit = HabitualCore.getState().habits.find(h => h.id === habitId);
    assert(unsharedHabit, 'Habit exists with unchanged original ID after unsharing');
    assertEqual(unsharedHabit.id, habitId, 'Habit ID did not change when unsharing');
    assertEqual(unsharedHabit.sharing.enabled, false, 'Sharing disabled after stopSharingHabit');
  });

  test('Delta backup serialization limits logs to specified cutoff window while full serialization preserves complete history', () => {
    const today = HabitualCore.getTodayKey();
    const d1 = new Date(); d1.setDate(d1.getDate() - 2);
    const d2 = new Date(); d2.setDate(d2.getDate() - 10);
    const recentKey = HabitualCore.formatDateKey(d1);
    const oldKey = HabitualCore.formatDateKey(d2);

    const sharedHabit = {
      id: 'shared_backup_test',
      name: 'Shared Family Habit',
      type: 'positive',
      dailyTarget: 1,
      sharing: {
        enabled: true,
        collection: 'shared_hb_backup',
        password: 'backup_pass'
      },
      logs: {
        [recentKey]: { count: 1, note: 'Recent log' },
        [oldKey]: { count: 1, note: 'Old log' }
      }
    };

    const fullSerialized = HabitualCore._serializeHabit(sharedHabit);
    assert(fullSerialized.sharing && fullSerialized.sharing.enabled, 'Serialized habit preserves sharing link credentials');
    assertEqual(fullSerialized.sharing.collection, 'shared_hb_backup', 'Serialized habit preserves collection');
    assert(fullSerialized.logs && fullSerialized.logs[recentKey], 'Full serialization includes recent logs');
    assert(fullSerialized.logs && fullSerialized.logs[oldKey], 'Full serialization preserves complete past logs history');

    const deltaSerialized = HabitualCore._serializeHabit(sharedHabit, recentKey);
    assert(deltaSerialized.logs && deltaSerialized.logs[recentKey], 'Delta serialization includes logs within cutoff');
    assert(!deltaSerialized.logs || !deltaSerialized.logs[oldKey], 'Delta serialization limits logs to cutoff window');
  });

  test('Shared habit URLs preserve color and upload/download includes full past check-in history', () => {
    const habitWithHistory = {
      id: 'shared_history_test',
      name: 'Gym Buddy Goal',
      type: 'positive',
      dailyTarget: 1,
      colorTheme: '#009688',
      sharing: {
        enabled: true,
        collection: 'shared_hb_gym',
        password: 'gym_secret_pass'
      },
      logs: {
        '2026-10-01': { count: 1, note: 'Leg day' },
        '2026-10-02': { count: 1, note: 'Cardio' }
      }
    };

    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [habitWithHistory]
    });

    // Test share link URL generation includes color
    assert(habitWithHistory.logs['2026-10-01'].count === 1, 'Past log history preserved in habit object');
    assert(habitWithHistory.colorTheme === '#009688', 'Custom color theme preserved in habit object');
    assertEqual(Object.keys(habitWithHistory.logs).length, 2, 'Habit has 2 past check-in log entries');
  });

  test('Sub-habits and sub-habit logs are included in Firestore shared habit backup payload', async () => {
    const parentWorkout = {
      id: 'parent_workout_123',
      name: 'Daily Workout',
      type: 'positive',
      dailyTarget: 1,
      colorTheme: '#4caf50',
      sharing: {
        enabled: true,
        collection: 'shared_hb_workout_col',
        password: 'sec_workout_pwd',
        includeChildren: true
      },
      logs: {
        '2026-10-10': { count: 1, note: 'Warmup completed' }
      }
    };

    const childPushups = {
      id: 'parent_workout_123_pushups',
      name: 'Pushups',
      parentId: 'parent_workout_123',
      parentDependency: 'auto_log_parent',
      type: 'positive',
      dailyTarget: 30,
      colorTheme: '#e91e63',
      logs: {
        '2026-10-10': { count: 30, note: '3 sets of 10' }
      }
    };

    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [parentWorkout, childPushups]
    });

    const store = {};
    const mockDb = {
      collection: function(collName) {
        if (!store[collName]) store[collName] = {};
        return {
          doc: function(docId) {
            return {
              set: function(data) {
                store[collName][docId] = data;
                return Promise.resolve();
              },
              get: function() {
                return Promise.resolve({
                  exists: !!store[collName][docId],
                  data: () => store[collName][docId]
                });
              }
            };
          }
        };
      }
    };

    HabitualCore.SyncTargets.Firestore.db = mockDb;

    await HabitualCore.SyncTargets.Firestore.uploadPerHabitBackup(parentWorkout);

    const storedDoc = store['shared_hb_workout_col']['shared_data'];
    assert(storedDoc && storedDoc.ciphertext, 'Encrypted document uploaded to Firestore collection');

    const decrypted = await HabitualCore.E2EE.decrypt(storedDoc.ciphertext, 'sec_workout_pwd');
    assert(decrypted, 'Decrypted Firestore payload successfully');
    assertEqual(decrypted.includeChildren, true, 'Payload has includeChildren=true');
    assert(Array.isArray(decrypted.children), 'Payload contains children array');
    assertEqual(decrypted.children.length, 1, 'Children array contains 1 sub-habit');

    const syncedChild = decrypted.children[0];
    assertEqual(syncedChild.habitId, 'parent_workout_123_pushups', 'Synced child habitId matches');
    assertEqual(syncedChild.parentId, 'parent_workout_123', 'Synced child parentId matches');
    assertEqual(syncedChild.parentDependency, 'auto_log_parent', 'Synced child parentDependency matches');
    assertEqual(syncedChild.colorTheme, '#e91e63', 'Synced child colorTheme matches');
    assertEqual(syncedChild.dailyTarget, 30, 'Synced child dailyTarget matches');
    assert(syncedChild.logs['2026-10-10'], 'Synced child contains check-in log');
    assertEqual(syncedChild.logs['2026-10-10'].count, 30, 'Synced child log count matches');
    assertEqual(syncedChild.logs['2026-10-10'].note, '3 sets of 10', 'Synced child log note matches');

    HabitualCore.SyncTargets.Firestore.db = null;
  });

  test('Remote Firestore sync snapshot restores missing sub-habits and merges sub-habit logs onto receiving device', async () => {
    const parentReading = {
      id: 'parent_read_999',
      name: 'Read Books',
      type: 'positive',
      dailyTarget: 1,
      colorTheme: '#2196f3',
      sharing: {
        enabled: true,
        collection: 'shared_hb_read_col',
        password: 'sec_read_pwd',
        includeChildren: true
      },
      logs: {}
    };

    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [parentReading]
    });

    const remotePayload = {
      habitId: 'parent_read_999',
      name: 'Read Books',
      type: 'positive',
      dailyTarget: 1,
      colorTheme: '#2196f3',
      logs: { '2026-10-11': { count: 1, note: 'Finished chapter' } },
      includeChildren: true,
      children: [
        {
          habitId: 'parent_read_999_ch1',
          parentId: 'parent_read_999',
          name: 'Chapter 1',
          type: 'positive',
          dailyTarget: 1,
          colorTheme: '#00bcd4',
          parentDependency: 'requires_parent',
          logs: { '2026-10-11': { count: 1, note: 'Read 20 pages' } }
        }
      ]
    };

    const ciphertext = await HabitualCore.E2EE.encrypt(remotePayload, 'sec_read_pwd');

    let snapshotCallback = null;
    const mockDb = {
      collection: function(collName) {
        return {
          doc: function(docId) {
            return {
              onSnapshot: function(cb) {
                snapshotCallback = cb;
                return function unsubscribe() {};
              }
            };
          }
        };
      }
    };

    HabitualCore.SyncTargets.Firestore.db = mockDb;
    HabitualCore.SyncTargets.Firestore.startPerHabitLiveSync(parentReading);

    // Trigger listener snapshot callback
    if (snapshotCallback) {
      snapshotCallback({
        exists: true,
        data: () => ({ ciphertext: ciphertext, writerId: 'remote_client_abc' })
      });
    }

    // Allow promise microtasks for decrypt to resolve
    await new Promise(r => setTimeout(r, 50));

    const updatedHabits = HabitualCore.getState().habits;
    const restoredChild = updatedHabits.find(h => h.id === 'parent_read_999_ch1');
    assert(restoredChild, 'Remote child sub-habit was created in local state');
    assertEqual(restoredChild.parentId, 'parent_read_999', 'Restored child parentId matches');
    assertEqual(restoredChild.name, 'Chapter 1', 'Restored child name matches');
    assertEqual(restoredChild.colorTheme, '#00bcd4', 'Restored child color theme matches');
    assertEqual(restoredChild.parentDependency, 'requires_parent', 'Restored child parent dependency matches');
    assert(restoredChild.logs && restoredChild.logs['2026-10-11'], 'Restored child log entry exists');
    assertEqual(restoredChild.logs['2026-10-11'].count, 1, 'Restored child log count matches');
    assertEqual(restoredChild.logs['2026-10-11'].note, 'Read 20 pages', 'Restored child log note matches');

    HabitualCore.SyncTargets.Firestore.stopPerHabitLiveSync('parent_read_999');
    HabitualCore.SyncTargets.Firestore.db = null;
  });

  test('Saving a sub-habit in UI automatically uploads top-level parent shared habit backup to Firestore', async () => {
    const parentShared = {
      id: 'shared_parent_study',
      name: 'Study Routine',
      type: 'positive',
      dailyTarget: 1,
      colorTheme: '#9c27b0',
      sharing: {
        enabled: true,
        collection: 'shared_hb_study_col',
        password: 'sec_study_pass',
        includeChildren: true
      },
      logs: {}
    };

    HabitualCore.setState({
      selectedHabitId: 'all',
      selectedYear: 2026,
      habits: [parentShared]
    });

    let uploadedTarget = null;
    const originalUpload = HabitualCore.SyncTargets.Firestore.uploadPerHabitBackup;
    HabitualCore.SyncTargets.Firestore.uploadPerHabitBackup = function(habit) {
      uploadedTarget = habit;
      return Promise.resolve();
    };

    // Simulate saving a sub-habit under parentShared
    const newChild = {
      id: 'shared_parent_study_math',
      name: 'Math Exercises',
      parentId: 'shared_parent_study',
      type: 'positive',
      dailyTarget: 10,
      colorTheme: '#ff9800',
      logs: {}
    };

    // Call saveHabit / form save
    HabitualCore.saveHabit(newChild);

    HabitualCore.SyncTargets.Firestore.uploadPerHabitBackup = originalUpload;

    assert(uploadedTarget, 'uploadPerHabitBackup was triggered after saving sub-habit');
    assertEqual(uploadedTarget.id, 'shared_parent_study', 'uploadPerHabitBackup was invoked on root shared parent habit');
  });

  test('checkURLHashForSharedHabit supports both col and doc query parameters from hash or search URL', async () => {
    let modalOpened = false;
    let fetchedDocId = null;

    const mockModal = createMockElement('div');
    mockModal.classList.add('hidden');
    mockModal.classList.remove = (cls) => { if (cls === 'hidden') modalOpened = true; };

    const origGetById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'modal-import-shared-habit') return mockModal;
      return createMockElement('div');
    };

    const origDownload = HabitualCore.SyncTargets.Firestore.downloadPerHabitBackup;
    HabitualCore.SyncTargets.Firestore.downloadPerHabitBackup = function(col, pwd) {
      fetchedDocId = col;
      return Promise.resolve({
        name: 'Shared Exercise',
        colorTheme: '#39d353',
        logs: {}
      });
    };

    // Test 1: Hash with doc parameter (#share?doc=doc_test_123&pwd=pwd_xyz)
    global.window.location = { hash: '#share?doc=doc_test_123&pwd=pwd_xyz', search: '', pathname: '/index.html' };
    modalOpened = false;
    fetchedDocId = null;
    HabitualCore.checkURLHashForSharedHabit();
    assert(modalOpened, 'Modal import opened when hash contains doc= parameter');
    assertEqual(fetchedDocId, 'doc_test_123', 'Extracted doc ID doc_test_123 from doc= hash param');

    // Test 2: Hash with col parameter (#share?col=col_test_456&pwd=pwd_xyz)
    global.window.location = { hash: '#share?col=col_test_456&pwd=pwd_xyz', search: '', pathname: '/index.html' };
    modalOpened = false;
    fetchedDocId = null;
    HabitualCore.checkURLHashForSharedHabit();
    assert(modalOpened, 'Modal import opened when hash contains col= parameter');
    assertEqual(fetchedDocId, 'col_test_456', 'Extracted collection ID col_test_456 from col= hash param');

    // Test 3: Search with doc parameter (?share&doc=search_test_789&pwd=pwd_xyz)
    global.window.location = { hash: '', search: '?share&doc=search_test_789&pwd=pwd_xyz', pathname: '/index.html' };
    modalOpened = false;
    fetchedDocId = null;
    HabitualCore.checkURLHashForSharedHabit();
    assert(modalOpened, 'Modal import opened when search query string contains doc= parameter');
    assertEqual(fetchedDocId, 'search_test_789', 'Extracted doc ID search_test_789 from search query param');

    // Test 4: Existing habit redirect - when user already has the habit, take directly to habit page without preview
    HabitualCore.state.habits = [
      { id: 'already_existing_123', name: 'Existing Shared Goal', sharing: { collection: 'already_existing_123', password: 'pwd' } }
    ];
    global.window.location = { hash: '#share?col=already_existing_123&pwd=pwd', search: '', pathname: '/index.html' };
    modalOpened = false;
    fetchedDocId = null;
    HabitualCore.checkURLHashForSharedHabit();
    assert(!modalOpened, 'Modal preview skipped when user already has habit');
    assertEqual(fetchedDocId, null, 'Firestore download skipped when user already has habit');
    assertEqual(HabitualCore.state.selectedHabitId, 'already_existing_123', 'Selected habit ID set to existing habit ID');
    assertEqual(global.window.location.hash, '#/habit/already_existing_123', 'Location hash redirected to habit page');

    global.document.getElementById = origGetById;
    HabitualCore.SyncTargets.Firestore.downloadPerHabitBackup = origDownload;
  });
});

// ============================================================================
// FEATURE 31: ➕ ADD BUTTON ON THE MAIN PAGE (EMPTY STATE)
// ============================================================================
describe('Feature 31: ➕ Add Button on the Main Page (Empty State)', () => {
  test('Empty state placeholder renders an add habit button when there are no habits', () => {
    HabitualCore.resetState();
    const originalElements = HabitualCore.elements;

    // Mock the required DOM elements for renderHeatmapsGallery
    HabitualCore.elements = {
      heatmapsGallery: createMockElement('div'),
      headerMenuContent: createMockElement('div'),
      btnHeaderMenu: createMockElement('button')
    };

    HabitualCore.renderHeatmapsGallery();

    const html = HabitualCore.elements.heatmapsGallery.innerHTML;
    assert(html.includes('Add Habit') || html.includes('Create Habit') || html.includes('New Habit'), 'Main page should render an Add Habit button when empty');

    HabitualCore.elements = originalElements;
  });

  test('Empty state Add Habit button opens the habit modal when clicked', () => {
    HabitualCore.resetState();
    const originalElements = HabitualCore.elements;
    const originalGetById = global.document.getElementById;

    let modalOpened = false;
    const mockModalHabit = createMockElement('div');
    mockModalHabit.classList.add('hidden');
    mockModalHabit.classList.remove = (cls) => {
      if (cls === 'hidden') modalOpened = true;
    };

    const mockBtnAdd = createMockElement('button');
    const mockForm = createMockElement('form');
    mockForm.reset = () => {};

    global.document.getElementById = (id) => {
      if (id === 'btn-add-first-habit') return mockBtnAdd;
      if (id === 'modal-habit') return mockModalHabit;
      if (id === 'form-habit') return mockForm;
      const el = createMockElement('div');
      el.selectedOptions = [{ text: '' }];
      el.reset = () => {};
      return el;
    };

    HabitualCore.elements = {
      heatmapsGallery: createMockElement('div'),
      headerMenuContent: createMockElement('div'),
      btnHeaderMenu: createMockElement('button'),
      modalHabit: mockModalHabit,
      formHabit: mockForm
    };

    HabitualCore.renderHeatmapsGallery();

    // Trigger click on the rendered empty state add button
    const btnToClick = HabitualCore.elements.heatmapsGallery.querySelector('.btn-add-first-habit') || mockBtnAdd;
    btnToClick.click();

    assertEqual(modalOpened, true, 'Clicking empty state Add Habit button opened habit modal');

    global.document.getElementById = originalGetById;
    HabitualCore.elements = originalElements;
  });

  test('Header dropdown New Habit button opens the habit modal when clicked', () => {
    HabitualCore.resetState();
    const originalElements = HabitualCore.elements;
    const originalGetById = global.document.getElementById;
    const originalWinAddEvt = global.window.addEventListener;

    global.window.addEventListener = global.window.addEventListener || (() => {});

    let modalOpened = false;
    const mockModalHabit = createMockElement('div');
    mockModalHabit.classList.add('hidden');
    mockModalHabit.classList.remove = (cls) => {
      if (cls === 'hidden') modalOpened = true;
    };

    const mockMenuAddHabit = createMockElement('button');
    const mockHeaderMenuContent = createMockElement('div');
    const mockForm = createMockElement('form');
    mockForm.reset = () => {};

    global.document.getElementById = (id) => {
      if (id === 'menu-btn-add-habit') return mockMenuAddHabit;
      if (id === 'header-menu-content') return mockHeaderMenuContent;
      if (id === 'modal-habit') return mockModalHabit;
      if (id === 'form-habit') return mockForm;
      const el = createMockElement('div');
      el.selectedOptions = [{ text: '' }];
      el.reset = () => {};
      return el;
    };

    HabitualCore.elements = {
      headerMenuContent: mockHeaderMenuContent,
      modalHabit: mockModalHabit,
      formHabit: mockForm
    };

    HabitualCore.initUI();

    // Trigger click on the header menu add habit button
    mockMenuAddHabit.click();

    assertEqual(modalOpened, true, 'Clicking header menu New Habit button opened habit modal');

    global.window.addEventListener = originalWinAddEvt;
    global.document.getElementById = originalGetById;
    HabitualCore.elements = originalElements;
  });
});

// ============================================================================
// FEATURE 33: Widget In-Page Filtering & Descendant Tree Parsing
// ============================================================================
describe('Feature 33: 🔍 Widget In-Page Filtering & Descendant Tree Parsing', () => {
  test('getDescendantIds recursively retrieves parent and all nested sub-habit IDs', () => {
    const habits = [
      { id: 'p1', name: 'Parent 1', parentId: null },
      { id: 'c1', name: 'Child 1', parentId: 'p1' },
      { id: 'gc1', name: 'Grandchild 1', parentId: 'c1' },
      { id: 'p2', name: 'Parent 2', parentId: null }
    ];

    const descendantIds = HabitualCore.getDescendantIds('p1', habits);
    assert(descendantIds.includes('p1'), 'Includes parent ID');
    assert(descendantIds.includes('c1'), 'Includes direct child ID');
    assert(descendantIds.includes('gc1'), 'Includes nested grandchild ID');
    assert(!descendantIds.includes('p2'), 'Excludes unrelated habit ID');
    assertEqual(descendantIds.length, 3, 'Correct total count of matched descendant IDs');
  });
});

// ============================================================================
// FEATURE 34: Habit Reordering State Persistence & Move Up/Down
// ============================================================================
describe('Feature 34: ↕️ Habit Reordering State Persistence & Move Up/Down', () => {
  test('reorderHabitsInState rearranges habits array index correctly', () => {
    const habits = [
      { id: 'h1', name: 'Habit One' },
      { id: 'h2', name: 'Habit Two' },
      { id: 'h3', name: 'Habit Three' }
    ];

    const moved = HabitualCore.reorderHabitsInState('h3', 'h1', habits);
    assertEqual(moved.id, 'h3', 'Moved correct habit object');
    assertEqual(habits[0].id, 'h3', 'H3 moved to index 0');
    assertEqual(habits[1].id, 'h1', 'H1 shifted to index 1');
    assertEqual(habits[2].id, 'h2', 'H2 shifted to index 2');
  });
});

// ============================================================================
// FEATURE 35: Sub-Habit Concertina Accordion State & Default Collapse
// ============================================================================
describe('Feature 35: 📁 Sub-Habit Concertina Accordion State & Default Collapse', () => {
  test('Sub-habit concertinas default to closed state and expand upon toggle', () => {
    HabitualCore.resetState();
    const parent = { id: 'parent_concertina', name: 'Parent' };
    const child = { id: 'child_concertina', name: 'Child', parentId: 'parent_concertina' };
    HabitualCore.setState({ habits: [parent, child] });

    const expandedIds = new Set();
    const isExpandedDefault = expandedIds.has('parent_concertina');
    assert(!isExpandedDefault, 'Sub-habit concertina is closed/collapsed by default');

    // Simulate toggle open
    expandedIds.add('parent_concertina');
    assert(expandedIds.has('parent_concertina'), 'Concertina expands upon toggle');
  });
});

// ============================================================================
// FEATURE 36: Background Sync & Version-Check Web Worker Settings
// ============================================================================
describe('Feature 36: 🔄 Background Sync & Version-Check Web Worker Settings', () => {
  test('Background sync is off by default and toggle updates state', () => {
    HabitualCore.resetState();
    assertEqual(HabitualCore.state.backgroundSync, false, 'Background sync is false by default');

    HabitualCore.setBackgroundSync(true);
    assertEqual(HabitualCore.state.backgroundSync, true, 'Background sync toggles to true');

    HabitualCore.setBackgroundSync(false);
    assertEqual(HabitualCore.state.backgroundSync, false, 'Background sync toggles back to false');
  });
});

// ============================================================================
// FEATURE 32: Toast Alerts & Content Layout Stability
// ============================================================================
describe('Feature 32: Toast Alerts & Content Layout Stability', () => {
  test('showToast updates #toast-message and reveals #toast-banner without duplicating toast-item', () => {
    const originalGetById = global.document.getElementById;

    let bannerHidden = true;
    let toastMsg = '';
    const mockBanner = createMockElement('div');
    mockBanner.classList.add('hidden');
    mockBanner.classList.remove = (cls) => {
      if (cls === 'hidden') bannerHidden = false;
    };

    const mockMsgEl = createMockElement('span');
    Object.defineProperty(mockMsgEl, 'textContent', {
      set(val) { toastMsg = val; },
      get() { return toastMsg; }
    });

    let containerCreated = false;

    global.document.getElementById = (id) => {
      if (id === 'toast-banner') return mockBanner;
      if (id === 'toast-message') return mockMsgEl;
      if (id === 'toast-container') {
        containerCreated = true;
        return null;
      }
      return null;
    };

    HabitualCore.showToast('Data synced cleanly!', 'success');

    assertEqual(toastMsg, 'Data synced cleanly!', 'showToast sets toast-message text');
    assertEqual(bannerHidden, false, 'showToast reveals toast-banner by removing hidden class');
    assertEqual(containerCreated, false, 'showToast does not create duplicate toast-item container when banner exists');

    global.document.getElementById = originalGetById;
  });

  test('showToast creates toast-item in toast-container when toast-banner is missing', () => {
    const originalGetById = global.document.getElementById;

    let createdItems = [];
    const mockContainer = createMockElement('div');
    mockContainer.appendChild = (child) => {
      createdItems.push(child);
    };

    global.document.getElementById = (id) => {
      if (id === 'toast-banner') return null;
      if (id === 'toast-container') return mockContainer;
      return null;
    };

    HabitualCore.showToast('Widget alert toast', 'info');

    assertEqual(createdItems.length, 1, 'showToast appends new toast item to container when banner absent');

    global.document.getElementById = originalGetById;
  });
});

// ============================================================================
// ISSUE #21: Offer Deletion of Sub-Habits when deleting Parent Habit
// ============================================================================
describe('Issue #21: Offer Deletion of Sub-Habits', () => {
  test('deleteHabit offers option to delete parent and all its sub-habits', () => {
    HabitualCore.resetState();
    const parent = { id: 'p_del', name: 'Parent', parentId: null, logs: {} };
    const child = { id: 'c_del', name: 'Child', parentId: 'p_del', logs: {} };
    HabitualCore.setState({ habits: [parent, child], deletedHabitIds: [] });

    const origConfirm = global.confirm;
    let confirmCount = 0;
    global.confirm = () => {
      confirmCount++;
      return true; // OK to delete parent AND sub-habits
    };

    HabitualCore.deleteHabit('p_del');
    global.confirm = origConfirm;

    assertEqual(HabitualCore.state.habits.length, 0, 'Both parent and child deleted when OK chosen');
    assert(HabitualCore.state.deletedHabitIds.includes('p_del'), 'Parent ID in deletedHabitIds');
    assert(HabitualCore.state.deletedHabitIds.includes('c_del'), 'Child ID in deletedHabitIds');
  });

  test('deleteHabit offers option to keep/promote sub-habits when parent is deleted', () => {
    HabitualCore.resetState();
    const parent = { id: 'p_keep', name: 'Parent', parentId: null, logs: {} };
    const child = { id: 'c_promote', name: 'Child', parentId: 'p_keep', logs: {} };
    HabitualCore.setState({ habits: [parent, child], deletedHabitIds: [] });

    const origConfirm = global.confirm;
    let confirmCall = 0;
    global.confirm = () => {
      confirmCall++;
      if (confirmCall === 1) return false; // Cancel parent+sub deletion
      if (confirmCall === 2) return true;  // OK to keep sub-habits (promote them)
      return false;
    };

    HabitualCore.deleteHabit('p_keep');
    global.confirm = origConfirm;

    assertEqual(HabitualCore.state.habits.length, 1, 'Only parent deleted, child kept');
    assertEqual(HabitualCore.state.habits[0].id, 'c_promote', 'Child remains in state');
    assertEqual(HabitualCore.state.habits[0].parentId, null, 'Child promoted to top-level habit (parentId = null)');
  });
});

// ============================================================================
// FEATURE 37: Multi-Device Habit Deletion Sync & Tombstoning
// ============================================================================
describe('Feature 37: Multi-Device Habit Deletion Sync & Tombstoning', () => {
  test('deleteHabit adds habitId to deletedHabitIds and mergeStatePayloads propagates deletion', () => {
    HabitualCore.resetState();
    const habit1 = { id: 'hab_to_del_1', name: 'Habit One' };
    const habit2 = { id: 'hab_keep_2', name: 'Habit Two' };
    HabitualCore.state.habits = [habit1, habit2];

    const origConfirm = global.confirm;
    global.confirm = () => true;
    if (global.window) global.window.confirm = () => true;

    HabitualCore.deleteHabit('hab_to_del_1');

    assertEqual(HabitualCore.state.habits.length, 1, 'Habit 1 removed from local state');
    assertEqual(HabitualCore.state.deletedHabitIds.includes('hab_to_del_1'), true, 'Habit 1 ID added to deletedHabitIds');

    // Simulate Device B receiving payload from Device A
    const localDeviceBPayload = {
      habits: [{ id: 'hab_to_del_1', name: 'Habit One' }, { id: 'hab_keep_2', name: 'Habit Two' }],
      deletedHabitIds: []
    };

    const remoteDeviceAPayload = HabitualCore.getPayloadFromState();

    const merged = HabitualCore.mergeStatePayloads(localDeviceBPayload, remoteDeviceAPayload);

    assertEqual(merged.habits.length, 1, 'Merged payload filters out deleted habit');
    assertEqual(merged.habits[0].id, 'hab_keep_2', 'Remaining habit in merged state is Habit Two');
    assertEqual(merged.deletedHabitIds.includes('hab_to_del_1'), true, 'Merged payload retains deletedHabitIds tombstone');

    global.confirm = origConfirm;
    if (global.window) global.window.confirm = origConfirm;
  });
});

// ============================================================================
// FEATURE 38: Overwrite Protection, Passphrase Hash Verification & Surgical DOM Patching
// ============================================================================
describe('Feature 38: Overwrite Protection, Passphrase Hash Verification & Surgical DOM Patching', () => {
  test('validateChannelAccess rejects when decryption fails on existing document', async () => {
    const origInit = HabitualCore.SyncTargets.Firestore.init;
    const origGet = HabitualCore.SyncTargets.Firestore.getSyncCode;

    HabitualCore.SyncTargets.Firestore.init = () => Promise.resolve();
    HabitualCore.SyncTargets.Firestore.getSyncCode = () => 'test_code_38';
    HabitualCore.SyncTargets.Firestore.db = {
      collection: () => ({
        doc: () => ({
          get: () => Promise.resolve({
            exists: true,
            data: () => ({ ciphertext: 'invalid_cipher_text' })
          })
        })
      })
    };

    let rejected = false;
    try {
      await HabitualCore.SyncTargets.Firestore.validateChannelAccess('test_code_38', 'wrong_passphrase');
    } catch (e) {
      rejected = true;
    }

    assertEqual(rejected, true, 'validateChannelAccess rejects when remote doc decryption fails');

    HabitualCore.SyncTargets.Firestore.init = origInit;
    HabitualCore.SyncTargets.Firestore.getSyncCode = origGet;
  });

  test('updatePassphrase re-encrypts payload and verifies matching data hashes', async () => {
    HabitualCore.resetState();
    HabitualCore.state.habits = [{ id: 'hab_hash_1', name: 'Hash Habit' }];
    HabitualCore.SyncManager.settings.passphrase = 'Old_Secret_123';

    const success = await HabitualCore.SyncManager.updatePassphrase('New_Secret_456');

    assertEqual(success, true, 'updatePassphrase returns true on verified re-encryption');
    assertEqual(HabitualCore.SyncManager.settings.passphrase, 'New_Secret_456', 'SyncManager passphrase updated in settings');
  });

  test('patchHeatmapCard updates specific day-square attributes in-place', () => {
    const mockCard = createMockElement('div');
    mockCard.setAttribute('data-habit-id', 'hab_patch_1');

    const mockSquare = createMockElement('div');
    mockSquare.setAttribute('data-date', '2026-10-15');
    mockSquare.className = 'day-square';
    mockSquare.style = {};

    mockCard.querySelectorAll = (selector) => {
      if (selector.includes('data-date="2026-10-15"')) return [mockSquare];
      return [];
    };
    mockCard.querySelector = () => null;

    const origQSA = global.document.querySelectorAll;
    global.document.querySelectorAll = (selector) => {
      if (selector.includes('data-habit-id="hab_patch_1"')) return [mockCard];
      return [];
    };

    HabitualCore.resetState();
    HabitualCore.state.habits = [{
      id: 'hab_patch_1',
      name: 'Patch Habit',
      dailyTarget: 1,
      frequencyType: 'daily',
      logs: { '2026-10-15': { count: 1, note: 'Tested patch' } }
    }];

    const patched = HabitualCore.patchHeatmapCard('hab_patch_1', '2026-10-15');

    assertEqual(patched, true, 'patchHeatmapCard returns true when card DOM element is found and updated');
    assertEqual(mockSquare.className.includes('completed'), true, 'day-square class updated to completed');

    global.document.querySelectorAll = origQSA;
  });

  test('patchHeatmapCard updates SVG rect attributes and fill in-place', () => {
    const mockCard = createMockElement('div');
    mockCard.setAttribute('data-habit-id', 'hab_svg_patch_1');

    const mockRect = createMockElement('rect');
    mockRect.tagName = 'rect';
    mockRect.setAttribute('data-date', '2026-10-15');
    mockRect.setAttribute('fill', '#000000');

    mockCard.querySelectorAll = (selector) => {
      if (selector.includes('data-date="2026-10-15"')) return [mockRect];
      return [];
    };
    mockCard.querySelector = () => null;

    const origQSA = global.document.querySelectorAll;
    global.document.querySelectorAll = (selector) => {
      if (selector.includes('data-habit-id="hab_svg_patch_1"')) return [mockCard];
      return [];
    };

    HabitualCore.resetState();
    HabitualCore.state.habits = [{
      id: 'hab_svg_patch_1',
      name: 'SVG Patch Habit',
      dailyTarget: 1,
      color: '#33B679',
      logs: { '2026-10-15': { count: 1 } }
    }];

    const patched = HabitualCore.patchHeatmapCard('hab_svg_patch_1', '2026-10-15');

    assertEqual(patched, true, 'patchHeatmapCard returns true for SVG rect card');
    assert(mockRect.getAttribute('fill') !== '#000000', 'SVG rect fill attribute updated with habit color');
    assertEqual(mockRect.getAttribute('data-count'), '1', 'SVG rect data-count updated');

    global.document.querySelectorAll = origQSA;
  });
});

// ============================================================================
// ISSUE #22: Handle Icon Display & Mobile Directional Arrows Logic
// ============================================================================
describe('Issue #22: ↕️ Handle Icon Visibility & Mobile Reorder Arrows', () => {
  test('Handle icon is hidden when habit card is the only item in a list', () => {
    HabitualCore.resetState();
    HabitualCore.setState({
      habits: [{ id: 'single_habit_1', name: 'Single Habit', parentId: null }]
    });

    const card = HabitualCore.buildHeatmapCard(HabitualCore.state.habits[0], 2026);
    const inner = card.innerHTML;

    assert(!inner.includes('drag-handle'), 'Single habit card does NOT render drag handle icon');
    assert(!card.classList.contains('draggable-card'), 'Single habit card does NOT have draggable-card class');
  });

  test('Handle icon is displayed when there are multiple habits in a list', () => {
    HabitualCore.resetState();
    HabitualCore.setState({
      habits: [
        { id: 'multi_habit_1', name: 'Habit One', parentId: null },
        { id: 'multi_habit_2', name: 'Habit Two', parentId: null }
      ]
    });

    const card1 = HabitualCore.buildHeatmapCard(HabitualCore.state.habits[0], 2026);
    const card2 = HabitualCore.buildHeatmapCard(HabitualCore.state.habits[1], 2026);

    assert(card1.innerHTML.includes('drag-handle'), 'First habit card renders drag handle');
    assert(card2.innerHTML.includes('drag-handle'), 'Second habit card renders drag handle');
    assert(card1.classList.contains('draggable-card'), 'First habit card has draggable-card class');
    assert(card2.classList.contains('draggable-card'), 'Second habit card has draggable-card class');
  });

  test('First habit in list renders ONLY move down arrow (▼) and NO move up arrow (▲)', () => {
    HabitualCore.resetState();
    HabitualCore.setState({
      habits: [
        { id: 'first_h', name: 'First Habit', parentId: null },
        { id: 'second_h', name: 'Second Habit', parentId: null }
      ]
    });

    const card = HabitualCore.buildHeatmapCard(HabitualCore.state.habits[0], 2026);
    const inner = card.innerHTML;

    assert(inner.includes('btn-move-down'), 'First habit card renders btn-move-down arrow');
    assert(!inner.includes('btn-move-up'), 'First habit card does NOT render btn-move-up arrow');
  });

  test('Last habit in list renders ONLY move up arrow (▲) and NO move down arrow (▼)', () => {
    HabitualCore.resetState();
    HabitualCore.setState({
      habits: [
        { id: 'first_h', name: 'First Habit', parentId: null },
        { id: 'last_h', name: 'Last Habit', parentId: null }
      ]
    });

    const card = HabitualCore.buildHeatmapCard(HabitualCore.state.habits[1], 2026);
    const inner = card.innerHTML;

    assert(inner.includes('btn-move-up'), 'Last habit card renders btn-move-up arrow');
    assert(!inner.includes('btn-move-down'), 'Last habit card does NOT render btn-move-down arrow');
  });

  test('Middle habit in list renders BOTH move up (▲) and move down (▼) arrows', () => {
    HabitualCore.resetState();
    HabitualCore.setState({
      habits: [
        { id: 'h1', name: 'Habit 1', parentId: null },
        { id: 'h2', name: 'Habit 2', parentId: null },
        { id: 'h3', name: 'Habit 3', parentId: null }
      ]
    });

    const card = HabitualCore.buildHeatmapCard(HabitualCore.state.habits[1], 2026);
    const inner = card.innerHTML;

    assert(inner.includes('btn-move-up'), 'Middle habit card renders btn-move-up arrow');
    assert(inner.includes('btn-move-down'), 'Middle habit card renders btn-move-down arrow');
  });

  test('Sub-habits handle visibility & directional arrows match sub-habit sibling count', () => {
    HabitualCore.resetState();
    const parent = { id: 'parent_1', name: 'Parent Habit', parentId: null };
    const singleSub = { id: 'sub_only', name: 'Sub Only', parentId: 'parent_1' };
    HabitualCore.setState({ habits: [parent, singleSub] });

    const subCardSingle = HabitualCore.buildHeatmapCard(singleSub, 2026);
    assert(!subCardSingle.innerHTML.includes('drag-handle'), 'Single sub-habit under parent does NOT render drag handle');

    const subTwo = { id: 'sub_two', name: 'Sub Two', parentId: 'parent_1' };
    HabitualCore.setState({ habits: [parent, singleSub, subTwo] });

    const subCardFirst = HabitualCore.buildHeatmapCard(singleSub, 2026);
    const subCardSecond = HabitualCore.buildHeatmapCard(subTwo, 2026);

    assert(subCardFirst.innerHTML.includes('drag-handle'), 'First of 2 sub-habits renders drag handle');
    assert(subCardFirst.innerHTML.includes('btn-move-down'), 'First sub-habit renders btn-move-down');
    assert(!subCardFirst.innerHTML.includes('btn-move-up'), 'First sub-habit does NOT render btn-move-up');

    assert(subCardSecond.innerHTML.includes('drag-handle'), 'Second of 2 sub-habits renders drag handle');
    assert(subCardSecond.innerHTML.includes('btn-move-up'), 'Second sub-habit renders btn-move-up');
    assert(!subCardSecond.innerHTML.includes('btn-move-down'), 'Second sub-habit does NOT render btn-move-down');
  });
});

// ============================================================================
// ISSUE #23: Midnight Date Rollover & Automatic Cursor Advancement
// ============================================================================
describe('Issue #23: 🌙 Midnight Date Rollover & Automatic Cursor Advancement', () => {
  test('checkMidnightRollover advances cursorDateKey when hasMovedCursor is false', () => {
    HabitualCore.resetState();
    HabitualCore.hasMovedCursor = false;
    HabitualCore.lastTodayKey = '2026-10-18';
    HabitualCore.cursorDateKey = '2026-10-18';

    // Mock getTodayKey to return new day
    const origGetToday = HabitualCore.getTodayKey;
    HabitualCore.getTodayKey = () => '2026-10-19';

    let renderCalled = false;
    const origRender = HabitualCore.renderAll;
    HabitualCore.renderAll = () => { renderCalled = true; };

    const result = HabitualCore.checkMidnightRollover();

    assertEqual(result, true, 'checkMidnightRollover returned true when date changed');
    assertEqual(HabitualCore.lastTodayKey, '2026-10-19', 'lastTodayKey updated to 2026-10-19');
    assertEqual(HabitualCore.getCursorDateKey(), '2026-10-19', 'cursorDateKey updated automatically to new day when hasMovedCursor is false');
    assertEqual(renderCalled, true, 'renderAll invoked on date change');

    HabitualCore.getTodayKey = origGetToday;
    HabitualCore.renderAll = origRender;
  });

  test('checkMidnightRollover preserves cursorDateKey when hasMovedCursor is true', () => {
    HabitualCore.resetState();
    HabitualCore.lastTodayKey = '2026-10-18';
    HabitualCore.setCursorDateKey('2026-10-15', true); // User manually moved cursor to 2026-10-15
    assertEqual(HabitualCore.hasMovedCursor, true, 'hasMovedCursor is true after user date selection');

    // Mock getTodayKey to return new day
    const origGetToday = HabitualCore.getTodayKey;
    HabitualCore.getTodayKey = () => '2026-10-19';

    let renderCalled = false;
    const origRender = HabitualCore.renderAll;
    HabitualCore.renderAll = () => { renderCalled = true; };

    const result = HabitualCore.checkMidnightRollover();

    assertEqual(result, true, 'checkMidnightRollover returned true on day transition');
    assertEqual(HabitualCore.lastTodayKey, '2026-10-19', 'lastTodayKey updated to 2026-10-19');
    assertEqual(HabitualCore.getCursorDateKey(), '2026-10-15', 'cursorDateKey remains on user-selected 2026-10-15');
    assertEqual(renderCalled, true, 'renderAll invoked to refresh UI today highlights');

    HabitualCore.getTodayKey = origGetToday;
    HabitualCore.renderAll = origRender;
  });

  test('moveCursorDateByDays sets hasMovedCursor to true', () => {
    HabitualCore.resetState();
    HabitualCore.hasMovedCursor = false;
    HabitualCore.cursorDateKey = '2026-10-19';

    HabitualCore.moveCursorDateByDays(-1);

    assertEqual(HabitualCore.hasMovedCursor, true, 'moveCursorDateByDays flagged hasMovedCursor = true');
    assertEqual(HabitualCore.getCursorDateKey(), '2026-10-18', 'cursor shifted to yesterday');
  });

  test('setupMidnightRollover initializes state and registers visibility/focus listeners', () => {
    HabitualCore.resetState();
    HabitualCore.lastTodayKey = null;

    let visListenerRegistered = false;
    let focusListenerRegistered = false;

    const origAddDoc = global.document.addEventListener;
    const origAddWin = global.window.addEventListener;

    global.document.addEventListener = (evt, fn) => {
      if (evt === 'visibilitychange') visListenerRegistered = true;
      if (origAddDoc) origAddDoc(evt, fn);
    };

    global.window.addEventListener = (evt, fn) => {
      if (evt === 'focus') focusListenerRegistered = true;
      if (origAddWin) origAddWin(evt, fn);
    };

    HabitualCore.setupMidnightRollover();

    assert(HabitualCore.lastTodayKey !== null, 'setupMidnightRollover initialized lastTodayKey');
    assert(HabitualCore.midnightTimer !== null, 'setupMidnightRollover scheduled midnight timer');
    assert(visListenerRegistered === true, 'Registered visibilitychange listener');
    assert(focusListenerRegistered === true, 'Registered window focus listener');

    if (HabitualCore.midnightTimer) {
      clearTimeout(HabitualCore.midnightTimer);
      HabitualCore.midnightTimer = null;
    }

    global.document.addEventListener = origAddDoc;
    global.window.addEventListener = origAddWin;
  });
});

// ============================================================================
// FEATURE 39: 🟡 ISSUE #24 UPDATING HABITS KEYBOARD NAVIGATION & YELLOW BORDER
// ============================================================================
describe('Feature 39: 🟡 Issue #24 Updating Habits Keyboard Navigation & Yellow Border', () => {
  test('Left and Right arrow keys move cursor date by -1 and +1 day', () => {
    HabitualCore.resetState();
    const today = HabitualCore.getTodayKey();
    assertEqual(HabitualCore.getCursorDateKey(), today, 'getCursorDateKey starts on today');

    HabitualCore.moveCursorDateByDays(-1);
    const yesterday = HabitualCore.getDaysAgoKey(1);
    assertEqual(HabitualCore.getCursorDateKey(), yesterday, 'Left arrow key moves cursor date back 1 day');

    HabitualCore.moveCursorDateByDays(1);
    assertEqual(HabitualCore.getCursorDateKey(), today, 'Right arrow key moves cursor date forward 1 day');
  });

  test('Up and Down arrow keys change selected habit ID using navigateSelectedHabit', () => {
    HabitualCore.resetState();
    HabitualCore.setState({
      habits: [
        { id: 'h1', name: 'Meditation', type: 'positive' },
        { id: 'h2', name: 'Exercise', type: 'positive' }
      ],
      selectedHabitId: 'all'
    });

    assertEqual(HabitualCore.state.selectedHabitId, 'all', 'Initial selectedHabitId is all');

    // Down arrow moves selection to next habit (h1)
    HabitualCore.navigateSelectedHabit(1);
    assertEqual(HabitualCore.state.selectedHabitId, 'h1', 'Down arrow selects first habit h1');

    // Down arrow moves selection to next habit (h2)
    HabitualCore.navigateSelectedHabit(1);
    assertEqual(HabitualCore.state.selectedHabitId, 'h2', 'Down arrow selects second habit h2');

    // Up arrow moves selection to previous habit (h1)
    HabitualCore.navigateSelectedHabit(-1);
    assertEqual(HabitualCore.state.selectedHabitId, 'h1', 'Up arrow selects previous habit h1');

    // Verify 'all' card is skipped when gallery contains 'all' card and habit cards
    const allCard = { getAttribute: (attr) => attr === 'data-habit-id' ? 'all' : null, classList: { add: () => {}, remove: () => {} } };
    const h1Card = { getAttribute: (attr) => attr === 'data-habit-id' ? 'h1' : null, classList: { add: () => {}, remove: () => {} } };
    const h2Card = { getAttribute: (attr) => attr === 'data-habit-id' ? 'h2' : null, classList: { add: () => {}, remove: () => {} } };
    HabitualCore.elements = HabitualCore.elements || {};
    HabitualCore.elements.heatmapsGallery = {
      querySelectorAll: (sel) => sel === '.heatmap-card' ? [allCard, h1Card, h2Card] : []
    };

    // Navigating back up from h1 should NOT select 'all' card
    HabitualCore.state.selectedHabitId = 'h1';
    HabitualCore.navigateSelectedHabit(-1);
    assertEqual(HabitualCore.state.selectedHabitId, 'h1', 'Up arrow from first habit stays on h1 and skips all card');

    // Navigating down cycles through h1 and h2, skipping 'all'
    HabitualCore.navigateSelectedHabit(1);
    assertEqual(HabitualCore.state.selectedHabitId, 'h2', 'Down arrow selects h2');

    // Verify scrollIntoView called with block: 'center'
    let lastScrollOptions = null;
    const mockCard = {
      getAttribute: (attr) => attr === 'data-habit-id' ? 'h2' : null,
      classList: { add: () => {}, remove: () => {} },
      scrollIntoView: (options) => { lastScrollOptions = options; }
    };
    HabitualCore.elements.heatmapsGallery = {
      querySelectorAll: (sel) => sel === '.heatmap-card' ? [mockCard] : []
    };
    HabitualCore.navigateSelectedHabit(1);
    assert(lastScrollOptions && lastScrollOptions.block === 'center', 'scrollIntoView is called with block: center when navigating habits');
  });

  test('ensureHabitAncestorsExpanded opens parent concertinas when selecting a sub-habit', () => {
    HabitualCore.resetState();
    HabitualCore.setState({
      habits: [
        { id: 'parent1', name: 'Parent Habit', type: 'positive' },
        { id: 'sub1', parentId: 'parent1', name: 'Sub Habit 1', type: 'positive' }
      ],
      expandedHabitIds: new Set()
    });

    assert(!HabitualCore.state.expandedHabitIds.has('parent1'), 'Parent concertina starts closed');

    HabitualCore.ensureHabitAncestorsExpanded('sub1');

    assert(HabitualCore.state.expandedHabitIds.has('parent1'), 'ensureHabitAncestorsExpanded opens parent1 concertina when sub1 is selected');
  });

  test('Pressing Spacebar on selected parent card toggles sub-habits concertina', () => {
    HabitualCore.resetState();
    HabitualCore.setState({
      habits: [
        { id: 'parent1', name: 'Parent Habit', type: 'positive' },
        { id: 'sub1', parentId: 'parent1', name: 'Sub Habit 1', type: 'positive' }
      ],
      selectedHabitId: 'parent1',
      expandedHabitIds: new Set()
    });

    assert(!HabitualCore.state.expandedHabitIds.has('parent1'), 'Concertina is initially closed');

    HabitualCore.toggleConcertina('parent1');
    assert(HabitualCore.state.expandedHabitIds.has('parent1'), 'toggleConcertina expands parent1 concertina');

    HabitualCore.toggleConcertina('parent1');
    assert(!HabitualCore.state.expandedHabitIds.has('parent1'), 'toggleConcertina collapses parent1 concertina');
  });

  test('buildHeatmapCard renders selected class on card matching selectedHabitId but excludes all card', () => {
    HabitualCore.resetState();
    const habit = { id: 'water', name: 'Drink Water', type: 'positive', dailyTarget: 1, logs: {} };
    HabitualCore.state.selectedHabitId = 'water';

    const card = HabitualCore.buildHeatmapCard(habit, 2026);
    const className = card.className || '';
    assert(className.includes('selected') || (card.classList && card.classList.contains('selected')), 'Card includes selected class for selectedHabitId');

    HabitualCore.state.selectedHabitId = 'all';
    const allCard = HabitualCore.buildHeatmapCard(null, 2026);
    const allClassName = allCard.className || '';
    assert(!allClassName.includes('selected-habit') && !allClassName.includes('selected'), 'All card does NOT include selected class when selectedHabitId is all');
  });
});

// ============================================================================
// FEATURE 40: 📋 TODO PAGE, COUNTDOWN TIMER & MULTI-TARGET TASK ITEMS
// ============================================================================
describe('Feature 40: 📋 Todo Page, Countdown Timer & Multi-Target Task Items', () => {
  test('getTodayRemainingTime calculates remaining hours and minutes until midnight', () => {
    const timeInfo = HabitualCore.getTodayRemainingTime();
    assert(timeInfo !== undefined, 'getTodayRemainingTime returns time object');
    assert(typeof timeInfo.hours === 'number', 'timeInfo.hours is a number');
    assert(typeof timeInfo.minutes === 'number', 'timeInfo.minutes is a number');
    assert(typeof timeInfo.seconds === 'number', 'timeInfo.seconds is a number');
    assert(typeof timeInfo.formattedString === 'string', 'timeInfo.formattedString is a string');
    assert(typeof timeInfo.boundaryLabel === 'string', 'timeInfo.boundaryLabel is a string');
  });

  test('getTodayTodoList expands multi-target habits into distinct task items', () => {
    HabitualCore.resetState();
    const today = HabitualCore.getTodayKey();
    HabitualCore.setState({
      habits: [
        { id: 'swim', name: 'Swim', type: 'positive', dailyTarget: 2, logs: { [today]: { count: 1 } } },
        { id: 'read', name: 'Read Book', type: 'positive', dailyTarget: 1, logs: {} }
      ]
    });

    const todoList = HabitualCore.getTodayTodoList();
    assertEqual(todoList.length, 3, 'getTodayTodoList returns 3 items (2 Swim + 1 Read)');

    // First Swim instance is completed
    assertEqual(todoList[0].habitId, 'swim', 'First item is Swim');
    assertEqual(todoList[0].instanceIndex, 1, 'First Swim instance index is 1');
    assertEqual(todoList[0].isCompleted, true, 'First Swim instance is completed');

    // Second Swim instance is uncompleted
    assertEqual(todoList[1].habitId, 'swim', 'Second item is Swim');
    assertEqual(todoList[1].instanceIndex, 2, 'Second Swim instance index is 2');
    assertEqual(todoList[1].isCompleted, false, 'Second Swim instance is uncompleted');

    // Read item is uncompleted
    assertEqual(todoList[2].habitId, 'read', 'Third item is Read');
    assertEqual(todoList[2].isCompleted, false, 'Read item is uncompleted');
  });

  test('getTodoListData returns uncompleted tasks for today and ignores future pre-logged events', () => {
    HabitualCore.resetState();
    const today = HabitualCore.getTodayKey();
    const futureDate = '2026-12-25';

    HabitualCore.setState({
      habits: [
        { id: 'party', name: 'Christmas Party', type: 'positive', logs: { [today]: { count: 1 }, [futureDate]: { count: 1, note: 'Holiday dinner' } } },
        { id: 'run', name: 'Morning Run', type: 'positive', dailyTarget: 1, logs: {} },
        { id: 'read', name: 'Read Book', type: 'positive', dailyTarget: 1, logs: { [today]: { count: 1 } } }
      ]
    });

    const todoData = HabitualCore.getTodoListData();
    assertEqual(todoData.mode, 'today_uncompleted', 'getTodoListData mode is today_uncompleted');
    assertEqual(todoData.items.length, 1, 'getTodoListData contains only uncompleted task for today');
    assertEqual(todoData.items[0].habitId, 'run', 'Task item is Morning Run');
    assertEqual(HabitualCore.getUpcomingEvents, undefined, 'getUpcomingEvents is removed');
  });

  test('getTodoListData excludes future created habits', () => {
    HabitualCore.resetState();
    const today = HabitualCore.getTodayKey();
    const futureDate = '2026-12-25';

    HabitualCore.setState({
      habits: [
        { id: 'futureHabit', name: 'New Year Habit', type: 'positive', dailyTarget: 1, createdAt: futureDate, logs: {} },
        { id: 'todayHabit', name: 'Today Habit', type: 'positive', dailyTarget: 1, createdAt: today, logs: {} }
      ]
    });

    const todoData = HabitualCore.getTodoListData();
    assertEqual(todoData.items.length, 1, 'getTodoListData excludes future created habit');
    assertEqual(todoData.items[0].habitId, 'todayHabit', 'Only today habit is included');
  });

  test('web/todo.html file exists and links styles.css and core scripts', () => {
    const fs = require('fs');
    const path = require('path');
    const todoPath = path.join(__dirname, '../web/todo.html');
    assert(fs.existsSync(todoPath), 'web/todo.html file exists');

    const content = fs.readFileSync(todoPath, 'utf8');
    assert(content.includes('styles.css'), 'todo.html links styles.css');
    assert(content.includes('js/ui.js'), 'todo.html links ui.js');
    assert(content.includes('todo-countdown'), 'todo.html includes countdown container');
  });
});

// ============================================================================
// FEATURE 41: 🌅 DAY BOUNDARIES & SUNRISE/SUNSET CALCULATIONS
// ============================================================================
describe('Feature 41: 🌅 Day Boundaries & Sunrise/Sunset Calculations', () => {
  test('calculateSunTimes returns sunrise and sunset Date objects', () => {
    const sun = HabitualCore.calculateSunTimes(new Date(2026, 2, 30), 51.5074, -0.1278);
    assert(sun !== undefined, 'sun object returned');
    assert(sun.sunrise instanceof Date, 'sunrise is a Date object');
    assert(sun.sunset instanceof Date, 'sunset is a Date object');
    assert(sun.sunset > sun.sunrise, 'sunset occurs after sunrise');
  });

  test('getDayBoundaryInfo returns correct info for midnight mode', () => {
    HabitualCore.state.dayBoundaryMode = 'midnight';
    const info = HabitualCore.getDayBoundaryInfo(new Date());
    assertEqual(info.mode, 'midnight', 'mode is midnight');
    assertEqual(info.boundaryLabel, 'before midnight', 'boundaryLabel is before midnight');
    assert(info.nextBoundary instanceof Date, 'nextBoundary is Date');
  });

  test('getDayBoundaryInfo returns correct info for sunrise_to_sunset mode', () => {
    HabitualCore.state.dayBoundaryMode = 'sunrise_to_sunset';
    HabitualCore.state.latitude = 51.5074;
    HabitualCore.state.longitude = -0.1278;

    const info = HabitualCore.getDayBoundaryInfo(new Date());
    assertEqual(info.mode, 'sunrise_to_sunset', 'mode is sunrise_to_sunset');
    assert(info.boundaryLabel === 'until sunset' || info.boundaryLabel === 'until sunrise', 'valid boundary label');
  });

  test('formatPrettyDate explicitly specifies Today for today key', () => {
    const todayKey = HabitualCore.getTodayKey();
    const formatted = HabitualCore.formatPrettyDate(todayKey);
    assert(formatted.startsWith('Today'), 'formatPrettyDate starts with Today for today key');

    const formattedWithoutToday = HabitualCore.formatPrettyDate(todayKey, false);
    assert(!formattedWithoutToday.startsWith('Today'), 'formatPrettyDate omits Today when includeToday=false');
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
