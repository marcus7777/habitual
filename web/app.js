/**
 * Habitual - Minimalist Habit Progress Visualizer
 * Vanilla JavaScript & LocalStorage Implementation with Pure Heatmap Mode & Interactive Day Focus
 */

(function () {
  'use strict';

  // --- LOCAL STORAGE & STATE CONFIG ---
  const STORAGE_KEY = 'habitual_tracker_v1';
  const CURRENT_YEAR = new Date().getFullYear();

  let state = {
    habits: [],
    selectedHabitId: 'all',
    selectedYear: CURRENT_YEAR,
    showQuickLogOnStartup: false
  };

  let activeCalendarHabit = null;
  let focusedDayState = { habitId: null, dateStr: null };
  let pendingQuickLogAfterHabit = false;

  const COLOR_PALETTE = ['green', 'blue', 'purple', 'orange', 'crimson', 'cyan', 'emerald', 'amber', 'indigo', 'rose'];

  const PRESET_THEME_HEX = {
    green: '#39d353',
    blue: '#388bfd',
    purple: '#a855f7',
    orange: '#f97316',
    crimson: '#fb7185',
    cyan: '#22d3ee',
    emerald: '#34d399',
    amber: '#f59e0b',
    indigo: '#818cf8',
    rose: '#f43f5e'
  };
  function deriveNameFromId(id) {
    if (!id) return '';
    let baseId = id;
    if (baseId.includes('_')) {
      const parts = baseId.split('_');
      baseId = parts[parts.length - 1];
    }
    const name = baseId.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function nameFromId(id) {
    const habit = (state && state.habits) ? state.habits.find(h => h.id === id) : null;
    if (habit && habit.name) return habit.name;
    return deriveNameFromId(id);
  }

  function idFromName(name) {
    // titleCase to camelCase
    return name.trim().replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
      return index == 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  function getDefaultColorForId(id) {
    if (!id) return 'green';
    if (typeof Please !== 'undefined') {
      const col = Please.make_color({ from_hash: id });
      if (col) {
        return (typeof col === 'string' && col.startsWith('#')) ? normalizeHex(col) : col;
      }
    }
    return 'green';
  }

  function getHabitHexColor(habit) {
    const defaultColour = getDefaultColorForId(habit ? habit.id : 'default');
    const defaultHex = defaultColour.startsWith('#') ? defaultColour : (PRESET_THEME_HEX[defaultColour] || PRESET_THEME_HEX.green);
    if (!habit || !habit.colorTheme) return defaultHex;
    if (habit.colorTheme.startsWith('#')) return habit.colorTheme;
    return PRESET_THEME_HEX[habit.colorTheme] || defaultHex;
  }

  // --- ROUTING & SUB-HABIT NAVIGATION HELPERS ---
  function parseHash() {
    const hash = window.location.hash.trim();
    if (hash.startsWith('#/habit/')) {
      const habitId = hash.replace('#/habit/', '').trim();
      if (habitId) return { view: 'habit', habitId };
    }
    if (hash.startsWith('#/+1c/')) {
      const habitId = hash.replace('#/+1c/', '').trim();

      if (habitId) {
        let habit = state.habits.find(h => h.id === habitId);

        // Add habit if not already added
        if (!habit) {
          const namesFromPath = habitId.split('_');
          let parentId = null;
          let habitName = habitId;

          if (namesFromPath.length === 1) {
            habitName = namesFromPath[0];
          } else if (namesFromPath.length >= 2) {
            parentId = namesFromPath[0];
            habitName = nameFromId(namesFromPath[1]);
          }

          habit = {
            id: habitId,
            name: habitName,
            type: 'positive',
            description: '',
            category: '',
            colorTheme: typeof Please !== 'undefined' ? Please.make_color({ from_hash: habitId }) : 'green',
            dailyTarget: 1,
            parentId: parentId,
            createdAt: getTodayKey(),
            logs: {}
          };
          let parentHabit = state.habits.find(h => h.id === parentId);
          if (!parentHabit) {
            parentHabit = {
              id: parentId,
              name: nameFromId(parentId),
              type: 'positive',
              description: '',
              category: '',
              colorTheme: typeof Please !== 'undefined' ? Please.make_color({ from_hash: habitId }) : 'green',
              dailyTarget: 1,
              parentId: null,
              createdAt: getTodayKey(),
              logs: {}
            };
            state.habits.push(parentHabit);
          }

          state.habits.push(habit);
          saveState(); // Save new habit to local storage
        }

        // Save today's log (+1) to local storage
        if (!habit.logs) habit.logs = {};
        const todayKey = getTodayKey();
        const currentLog = habit.logs[todayKey];
        const currentCount = currentLog ? currentLog.count : 0;
        const currentNote = currentLog ? currentLog.note : '';

        habit.logs[todayKey] = {
          count: currentCount + 1,
          note: currentNote,
        };
        saveState(); // Save updated log to local storage

        // Toast notification to update user
        showToast(`+1 logged for "${habit.name}"! Window closing in 7s...`);

        // Update hash to habit page so re-renders won't double-log
        window.location.hash = '#/habit/' + habit.id;

        // Close window after 7 seconds
        setTimeout(() => {
          window.close();
        }, 7000);

        return { view: 'habit', habitId: habit.id };
      }
    }
    return { view: 'home', habitId: null };
  }

  function navigateTo(hash) {
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      renderAll();
    }
  }

  function getAncestryChain(habitId) {
    const chain = [];
    let cur = state.habits.find(h => h.id === habitId);
    const visited = new Set();

    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      chain.unshift(cur);
      cur = cur.parentId ? state.habits.find(h => h.id === cur.parentId) : null;
    }
    return chain;
  }

  function getAllDescendantIds(habitId) {
    const ids = [habitId];
    const children = state.habits.filter(h => h.parentId === habitId);
    children.forEach(c => {
      ids.push(...getAllDescendantIds(c.id));
    });
    return ids;
  }

  // --- COLOR HELPER FUNCTIONS FOR CUSTOM HEX THEMES ---
  function parseHexColor(hexStr) {
    if (!hexStr) return null;
    hexStr = hexStr.trim().replace(/^#/, '');
    if (hexStr.length === 3) {
      hexStr = hexStr.split('').map(c => c + c).join('');
    }
    if (hexStr.length !== 6) return null;
    const num = parseInt(hexStr, 16);
    if (isNaN(num)) return null;

    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function blendColors(rgb1, rgb2, factor) {
    const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * factor);
    const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * factor);
    const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * factor);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function getCustomThemeLevels(hexStr) {
    const baseRgb = { r: 0x16, g: 0x1b, b: 0x22 }; // #161b22
    const targetRgb = parseHexColor(hexStr) || { r: 0x39, g: 0xd3, b: 0x53 };
    const targetHex = `#${((1 << 24) + (targetRgb.r << 16) + (targetRgb.g << 8) + targetRgb.b).toString(16).slice(1)}`;

    return {
      level0: '#161b22',
      level1: blendColors(baseRgb, targetRgb, 0.25),
      level2: blendColors(baseRgb, targetRgb, 0.50),
      level3: blendColors(baseRgb, targetRgb, 0.75),
      level4: targetHex
    };
  }

  function getHabitLevelColor(habit, level) {
    if (!level || level <= 0) return '#161b22';
    const hex = getHabitHexColor(habit);
    const levels = getCustomThemeLevels(hex);
    const lvlKey = 'level' + Math.min(4, Math.max(1, Math.round(level)));
    return levels[lvlKey] || hex;
  }

  function normalizeHex(hexStr) {
    const parsed = parseHexColor(hexStr);
    if (!parsed) return '#39d353';
    return `#${((1 << 24) + (parsed.r << 16) + (parsed.g << 8) + parsed.b).toString(16).slice(1)}`;
  }

  function getHabitHexWithAlpha(habit, ratio) {
    const hex = normalizeHex(getHabitHexColor(habit));
    const alpha = Math.min(255, Math.max(0, Math.round((ratio || 0) * 255)));
    const alphaHex = alpha.toString(16).padStart(2, '0');
    return hex + alphaHex;
  }

  // --- INITIALIZATION ---
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => {
      loadState();
      initUI();
      registerServiceWorker();
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('hashchange', renderAll);
      }
      renderAll();
      if (state.showQuickLogOnStartup) {
        openLogModal(getTodayKey());
      }
    });
  }

  // --- PWA SERVICE WORKER ---
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('[PWA] Service Worker registered:', reg.scope))
          .catch((err) => console.warn('[PWA] Service Worker registration error:', err));
      });
    }
  }

  // --- STORAGE HELPERS ---
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.habits = (parsed.habits || []).map(h => {
          const id = h.id;
          const derivedName = deriveNameFromId(id);
          const derivedColor = getDefaultColorForId(id);

          const restoredLogs = {};
          if (h.logs) {
            Object.keys(h.logs).forEach(dateKey => {
              const entry = h.logs[dateKey];
              if (typeof entry === 'number') {
                restoredLogs[dateKey] = { count: entry, note: '' };
              } else if (entry && typeof entry === 'object') {
                restoredLogs[dateKey] = {
                  count: entry.count || 0,
                  note: entry.note || ''
                };
              }
            });
          }

          return {
            id: id,
            name: h.name || derivedName,
            type: h.type || 'positive',
            description: h.description || '',
            category: h.category || '',
            showStreak: Boolean(h.showStreak),
            isPaused: Boolean(h.isPaused),
            colorTheme: h.colorTheme || derivedColor,
            dailyTarget: h.dailyTarget || 1,
            frequencyType: h.frequencyType || 'daily',
            targetDays: h.targetDays || [1, 2, 3, 4, 5, 6, 0],
            weeklyTarget: h.weeklyTarget || 1,
            monthlyDay: h.monthlyDay || 1,
            monthlyTarget: h.monthlyTarget || 1,
            colorWholeWeek: Boolean(h.colorWholeWeek),
            colorWholeMonth: Boolean(h.colorWholeMonth),
            parentId: h.parentId || null,
            parentDependency: h.parentDependency || 'none',
            createdAt: h.createdAt || getTodayKey(),
            logs: restoredLogs
          };
        });
        state.selectedHabitId = parsed.selectedHabitId || 'all';
        state.selectedYear = parsed.selectedYear || CURRENT_YEAR;
        state.showQuickLogOnStartup = parsed.showQuickLogOnStartup || false;
      }
    } catch (e) {
      console.error('Failed to load state from LocalStorage:', e);
      state.habits = [];
    }
  }

  function saveState() {
    try {
      const serializedHabits = state.habits.map(habit => {
        const derivedName = deriveNameFromId(habit.id);
        const derivedColor = getDefaultColorForId(habit.id);

        const h = { id: habit.id };

        // Save name only if user edited/overwrote it (differs from derived name)
        if (habit.name && habit.name.trim() !== derivedName) {
          h.name = habit.name;
        }

        // Save colorTheme only if user edited/overwrote it (differs from derived color)
        if (habit.colorTheme) {
          const normTheme = habit.colorTheme.startsWith('#') ? normalizeHex(habit.colorTheme) : habit.colorTheme;
          const normDerived = derivedColor.startsWith('#') ? normalizeHex(derivedColor) : derivedColor;
          if (normTheme !== normDerived) {
            h.colorTheme = habit.colorTheme;
          }
        }

        if (habit.type && habit.type !== 'positive') h.type = habit.type;
        if (habit.description) h.description = habit.description;
        if (habit.category) h.category = habit.category;
        if (habit.showStreak) h.showStreak = true;
        if (habit.isPaused) h.isPaused = true;
        if (habit.dailyTarget && habit.dailyTarget !== 1) h.dailyTarget = habit.dailyTarget;
        if (habit.frequencyType && habit.frequencyType !== 'daily') h.frequencyType = habit.frequencyType;

        if (habit.targetDays && Array.isArray(habit.targetDays)) {
          const defaultDays = [1, 2, 3, 4, 5, 6, 0];
          const isDefaultDays = habit.targetDays.length === 7 && defaultDays.every((d, i) => habit.targetDays[i] === d);
          if (!isDefaultDays) h.targetDays = habit.targetDays;
        }

        if (habit.weeklyTarget && habit.weeklyTarget !== 1) h.weeklyTarget = habit.weeklyTarget;
        if (habit.monthlyDay && habit.monthlyDay !== 1) h.monthlyDay = habit.monthlyDay;
        if (habit.monthlyTarget && habit.monthlyTarget !== 1) h.monthlyTarget = habit.monthlyTarget;
        if (habit.colorWholeWeek) h.colorWholeWeek = true;
        if (habit.colorWholeMonth) h.colorWholeMonth = true;
        if (habit.parentId) h.parentId = habit.parentId;
        if (habit.parentDependency && habit.parentDependency !== 'none') h.parentDependency = habit.parentDependency;
        if (habit.createdAt) h.createdAt = habit.createdAt;

        // Save logs without empty notes, and omit count=0 logs with no note
        if (habit.logs) {
          const cleanLogs = {};
          let hasLogs = false;
          Object.keys(habit.logs).forEach(dateKey => {
            const log = habit.logs[dateKey];
            if (!log) return;
            const count = log.count || 0;
            const note = (log.note || '').trim();

            if (count > 0 || note !== '') {
              hasLogs = true;
              if (note !== '') {
                cleanLogs[dateKey] = { count, note };
              } else {
                cleanLogs[dateKey] = { count };
              }
            }
          });
          if (hasLogs) {
            h.logs = cleanLogs;
          }
        }

        return h;
      });

      const payload = {
        habits: serializedHabits,
        selectedHabitId: state.selectedHabitId || 'all',
        selectedYear: state.selectedYear || CURRENT_YEAR,
        showQuickLogOnStartup: state.showQuickLogOnStartup || false
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to save state to LocalStorage:', e);
    }
  }

  // --- DATE HELPERS ---
  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateKey(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function parseFlexibleDate(str) {
    if (!str) return null;
    str = str.trim();

    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        let day = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;

        if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900) {
          const mStr = String(month).padStart(2, '0');
          const dStr = String(day).padStart(2, '0');
          return `${year}-${mStr}-${dStr}`;
        }
      }
    }

    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return str;
      }
    }

    return null;
  }

  function getTodayKey() {
    return formatDateKey(new Date());
  }

  function getDaysAgoKey(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return formatDateKey(d);
  }

  function formatPrettyDate(dateStr) {
    const d = parseDateKey(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message) {
    const banner = document.getElementById('toast-banner');
    const msgEl = document.getElementById('toast-message');
    if (banner && msgEl) {
      msgEl.textContent = message;
      banner.classList.remove('hidden');
      setTimeout(() => {
        banner.classList.add('hidden');
      }, 4000);
    }
  }

  // --- CSV PARSER & IMPORT ENGINE ---
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        if (inQuotes && line[i + 1] === char) {
          current += char;
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  function parseCSVAndImport(csvText, sourceName = 'CSV') {
    if (!csvText) return;

    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      alert('CSV file appears empty or missing rows.');
      return;
    }

    const header = parseCSVLine(lines[0]);
    if (header.length < 2) {
      alert('Invalid CSV header structure.');
      return;
    }

    const colHabitMap = [];
    let unnamedCount = 1;

    for (let c = 1; c < header.length; c++) {
      let rawName = header[c].trim();
      if (!rawName) {
        rawName = `Activity Column ${unnamedCount++}`;
      }

      let existing = state.habits.find(h => h.name.toLowerCase() === rawName.toLowerCase());

      if (!existing) {
        const lowerName = rawName.toLowerCase();
        const isNegative = lowerName.includes('days since') ||
                           lowerName.includes('quit') ||
                           lowerName.includes('stop') ||
                           lowerName.startsWith('no ') ||
                           lowerName.includes('avoid');

        const themeColor = COLOR_PALETTE[state.habits.length % COLOR_PALETTE.length];

        existing = {
          id: 'habit_' + Date.now() + '_' + c,
          name: rawName,
          description: isNegative ? 'Quit habit goal' : 'Build habit goal',
          category: isNegative ? 'Wellness' : 'General',
          type: isNegative ? 'negative' : 'positive',
          colorTheme: themeColor,
          dailyTarget: 1,
          parentId: null,
          createdAt: getTodayKey(),
          logs: {}
        };
        state.habits.push(existing);
      }

      colHabitMap[c] = existing;
    }

    let logsImportedCount = 0;
    const yearsFound = new Set();

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (row.length === 0) continue;

      const rawDate = row[0];
      const isoDate = parseFlexibleDate(rawDate);
      if (!isoDate) continue;

      const year = parseInt(isoDate.split('-')[0], 10);
      if (year) yearsFound.add(year);

      for (let c = 1; c < row.length; c++) {
        const val = row[c] ? row[c].trim() : '';
        const habit = colHabitMap[c];

        if (!habit) continue;
        if (!habit.logs) habit.logs = {};

        if (val !== '') {
          let count = 0;
          let note = '';

          if (!isNaN(val) && val !== '') {
            count = parseInt(val, 10);
          } else if (val.toLowerCase() === 'reset') {
            count = 1;
            note = 'Reset';
          } else {
            count = 1;
            note = val;
          }

          if (count > 0 || note !== '') {
            habit.logs[isoDate] = { count, note };
            logsImportedCount++;
          }
        }
      }
    }

    if (yearsFound.size > 0) {
      const sortedYears = Array.from(yearsFound).sort((a, b) => b - a);
      state.selectedYear = sortedYears[0];
    }

    saveState();
    renderAll();

    showToast(`Imported ${colHabitMap.length - 1} habits and ${logsImportedCount} check-in logs from ${sourceName}!`);
  }


  // --- DOM ELEMENTS & EVENT LISTENERS ---
  const elements = {};

  function initUI() {
    elements.yearSelector = document.getElementById('year-selector');
    elements.heatmapsGallery = document.getElementById('heatmaps-gallery');
    elements.customTooltip = document.getElementById('custom-tooltip');

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('scroll', () => {
        if (elements.customTooltip && !elements.customTooltip.classList.contains('hidden')) {
          elements.customTooltip.classList.add('hidden');
        }
      }, { passive: true });

      window.addEventListener('resize', () => {
        if (elements.customTooltip && !elements.customTooltip.classList.contains('hidden')) {
          elements.customTooltip.classList.add('hidden');
        }
      }, { passive: true });
    }

    // Modals
    elements.modalHabit = document.getElementById('modal-habit');
    elements.formHabit = document.getElementById('form-habit');
    elements.modalHabitTitle = document.getElementById('modal-habit-title');
    elements.habitParent = document.getElementById('habit-parent');
    elements.habitShowStreak = document.getElementById('habit-show-streak');
    elements.habitIsPaused = document.getElementById('habit-is-paused');
    elements.habitName = document.getElementById('habit-name');
    elements.habitIdPreview = document.getElementById('habit-id-preview');
    elements.habitIdDisplay = document.getElementById('habit-id-display');
    elements.habitFormDetails = document.getElementById('habit-form-details');

    if (elements.habitName) {
      elements.habitName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          elements.habitName.blur();
        }
      });
      elements.habitName.addEventListener('blur', () => {
        handleHabitNameBlur();
      });
    }

    elements.customColorPicker = document.getElementById('habit-custom-color-picker');
    elements.customColorHex = document.getElementById('habit-custom-color-hex');
    elements.radioColorCustom = document.getElementById('radio-color-custom');
    elements.customSwatchPreview = document.getElementById('custom-swatch-preview');

    elements.modalCalendarPicker = document.getElementById('modal-calendar-picker');
    elements.modalCalendarBadge = document.getElementById('modal-calendar-habit-badge');
    elements.calendarInputDate = document.getElementById('calendar-input-date');

    elements.modalLog = document.getElementById('modal-log');
    elements.modalLogDateInput = document.getElementById('modal-log-date-input');
    elements.modalLogHabitSelect = document.getElementById('modal-log-habit-select');
    elements.modalLogCount = document.getElementById('modal-log-count');
    elements.modalLogNote = document.getElementById('modal-log-note');
    elements.modalLogShowOnStartup = document.getElementById('modal-log-show-on-startup');

    if (elements.modalLogDateInput) {
      elements.modalLogDateInput.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          activeLogDateKey = val;
          loadLogModalValues();
        }
      });
    }

    const btnDatePrev = document.getElementById('btn-modal-date-prev');
    const btnDateNext = document.getElementById('btn-modal-date-next');
    if (btnDatePrev) {
      btnDatePrev.addEventListener('click', () => shiftModalLogDate(-1));
    }
    if (btnDateNext) {
      btnDateNext.addEventListener('click', () => shiftModalLogDate(1));
    }

    const btnIcsReminder = document.getElementById('btn-modal-ics-reminder');
    if (btnIcsReminder) {
      btnIcsReminder.addEventListener('click', () => {
        const habitId = elements.modalLogHabitSelect ? elements.modalLogHabitSelect.value : null;
        const habit = state.habits.find(h => h.id === habitId);
        const habitName = habit ? habit.name : 'Habit';
        downloadICSReminder(habitName, activeLogDateKey);
      });
    }

    if (elements.modalLogShowOnStartup) {
      elements.modalLogShowOnStartup.addEventListener('change', (e) => {
        state.showQuickLogOnStartup = e.target.checked;
        saveState();
      });
    }

    elements.modalData = document.getElementById('modal-data');

    // Backfill Elements
    elements.habitEnableBackfill = document.getElementById('habit-enable-backfill');
    elements.backfillOptionsContainer = document.getElementById('backfill-options-container');
    elements.backfillSection = document.getElementById('backfill-section');
    elements.habitHistoryDuration = document.getElementById('habit-history-duration');
    elements.habitHistoryFrequency = document.getElementById('habit-history-frequency');
    elements.habitHistoryInstances = document.getElementById('habit-history-instances');

    if (elements.habitEnableBackfill && elements.backfillOptionsContainer) {
      elements.habitEnableBackfill.addEventListener('change', (e) => {
        if (e.target.checked) {
          elements.backfillOptionsContainer.classList.remove('hidden');
        } else {
          elements.backfillOptionsContainer.classList.add('hidden');
        }
      });
    }

    // Custom Color Sync
    elements.customColorPicker.addEventListener('input', (e) => {
      const color = e.target.value;
      elements.customColorHex.value = color;
      elements.radioColorCustom.checked = true;
      elements.customSwatchPreview.style.backgroundColor = color;
    });

    elements.customColorHex.addEventListener('input', (e) => {
      let val = e.target.value.trim();
      elements.radioColorCustom.checked = true;
      if (parseHexColor(val)) {
        const hex = normalizeHex(val);
        elements.customColorPicker.value = hex;
        elements.customSwatchPreview.style.backgroundColor = hex;
      }
    });

    // Calendar Pop-up Actions
    document.getElementById('modal-calendar-close').addEventListener('click', () => elements.modalCalendarPicker.classList.add('hidden'));
    document.getElementById('btn-calendar-cancel').addEventListener('click', () => elements.modalCalendarPicker.classList.add('hidden'));

    document.querySelectorAll('.quick-date-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const daysAgo = parseInt(btn.dataset.daysAgo, 10) || 0;
        const targetDateKey = getDaysAgoKey(daysAgo);
        elements.modalCalendarPicker.classList.add('hidden');
        openLogModal(targetDateKey, activeCalendarHabit ? activeCalendarHabit.id : null);
      });
    });

    document.getElementById('btn-calendar-submit').addEventListener('click', () => {
      const customDateVal = elements.calendarInputDate.value;
      if (customDateVal) {
        elements.modalCalendarPicker.classList.add('hidden');
        openLogModal(customDateVal, activeCalendarHabit ? activeCalendarHabit.id : null);
      }
    });

    // Logo / Header Brand Click to Home Navigation
    const headerBrand = document.querySelector('.header-brand');
    if (headerBrand) {
      headerBrand.addEventListener('click', (e) => {
        if (window.location.hash === '#/' || window.location.hash === '' || window.location.hash === '#') {
          e.preventDefault();
          navigateTo('#/');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    // Header Dropdown Menu Toggle
    elements.btnHeaderMenu = document.getElementById('btn-header-menu');
    elements.headerMenuContent = document.getElementById('header-menu-content');

    if (elements.btnHeaderMenu && elements.headerMenuContent) {
      elements.btnHeaderMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = elements.headerMenuContent.classList.toggle('hidden');
        elements.btnHeaderMenu.setAttribute('aria-expanded', !isHidden);
      });

      document.addEventListener('click', (e) => {
        if (elements.headerMenuContent && !elements.headerMenuContent.classList.contains('hidden') && !e.target.closest('.header-menu-dropdown')) {
          elements.headerMenuContent.classList.add('hidden');
          elements.btnHeaderMenu.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Header Menu Action Handlers
    const menuAddHabit = document.getElementById('menu-btn-add-habit');
    if (menuAddHabit) {
      menuAddHabit.addEventListener('click', () => {
        if (elements.headerMenuContent) elements.headerMenuContent.classList.add('hidden');
        openHabitModal();
      });
    }

    const menuQuickLog = document.getElementById('menu-btn-quick-log');
    if (menuQuickLog) {
      menuQuickLog.addEventListener('click', () => {
        if (elements.headerMenuContent) elements.headerMenuContent.classList.add('hidden');
        openLogModal(getTodayKey());
      });
    }

    const menuDataModal = document.getElementById('menu-btn-data-modal');
    if (menuDataModal) {
      menuDataModal.addEventListener('click', () => {
        if (elements.headerMenuContent) elements.headerMenuContent.classList.add('hidden');
        elements.modalData.classList.remove('hidden');
      });
    }

    // Close Modals
    document.getElementById('modal-habit-close').addEventListener('click', () => {
      pendingQuickLogAfterHabit = false;
      elements.modalHabit.classList.add('hidden');
    });
    document.getElementById('btn-cancel-habit').addEventListener('click', () => {
      pendingQuickLogAfterHabit = false;
      elements.modalHabit.classList.add('hidden');
    });
    document.getElementById('modal-log-close').addEventListener('click', () => elements.modalLog.classList.add('hidden'));
    document.getElementById('modal-data-close').addEventListener('click', () => elements.modalData.classList.add('hidden'));

    const toastCloseBtn = document.getElementById('toast-close');
    if (toastCloseBtn) {
      toastCloseBtn.addEventListener('click', () => {
        document.getElementById('toast-banner').classList.add('hidden');
      });
    }

    // CSV Upload Listeners
    const handleCSVUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        parseCSVAndImport(event.target.result, file.name);
        e.target.value = '';
        elements.modalData.classList.add('hidden');
      };
      reader.readAsText(file);
    };

    document.getElementById('input-header-csv').addEventListener('change', handleCSVUpload);
    document.getElementById('input-modal-csv').addEventListener('change', handleCSVUpload);

    elements.formHabit.addEventListener('submit', handleHabitFormSubmit);

    document.getElementById('btn-counter-minus').addEventListener('click', () => {
      let val = parseInt(elements.modalLogCount.value, 10) || 0;
      if (val > 0) elements.modalLogCount.value = val - 1;
    });
    document.getElementById('btn-counter-plus').addEventListener('click', () => {
      let val = parseInt(elements.modalLogCount.value, 10) || 0;
      elements.modalLogCount.value = val + 1;
    });

    document.getElementById('btn-save-log').addEventListener('click', handleSaveLog);
    document.getElementById('btn-clear-log').addEventListener('click', handleClearLog);

    elements.yearSelector.addEventListener('change', (e) => {
      state.selectedYear = parseInt(e.target.value, 10);
      saveState();
      renderAll();
    });

    document.getElementById('btn-export-json').addEventListener('click', exportDataJSON);
    document.getElementById('input-import-json').addEventListener('change', importDataJSON);
    document.getElementById('btn-reset-data').addEventListener('click', () => {
      if (confirm('Are you sure you want to delete ALL habits and history? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        state.habits = [];
        state.selectedHabitId = 'all';
        saveState();
        navigateTo('#/');
        elements.modalData.classList.add('hidden');
      }
    });

    // Dismiss Focused Card Details when clicking outside
    document.addEventListener('click', (e) => {
      if (focusedDayState.dateStr && !e.target.closest('.heatmap-card') && !e.target.closest('.modal-backdrop')) {
        focusedDayState = { habitId: null, dateStr: null };
        renderAll();
      }
    });
  }

  // --- RENDER ENGINE ---
  function renderAll() {
    if (!elements.yearSelector || !elements.heatmapsGallery) return;
    renderYearSelector();
    renderHeatmapsGallery();
  }

  function renderViewNavigation(route) {
    const viewNav = document.getElementById('view-navigation');
    if (!viewNav) return;

    if (route.view === 'habit' && route.habitId) {
      const chain = getAncestryChain(route.habitId);
      if (chain.length === 0) {
        viewNav.classList.add('hidden');
        return;
      }

      const targetHabit = chain[chain.length - 1];

      let breadcrumbHTML = `<a href="#/" class="breadcrumb-item">🏠 All Habits</a>`;
      chain.forEach((h, idx) => {
        const isLast = idx === chain.length - 1;
        breadcrumbHTML += ` <span class="breadcrumb-sep">/</span> `;
        if (isLast) {
          breadcrumbHTML += `<span class="breadcrumb-current">${escapeHTML(h.name)}</span>`;
        } else {
          breadcrumbHTML += `<a href="#/habit/${h.id}" class="breadcrumb-item">${escapeHTML(h.name)}</a>`;
        }
      });

      viewNav.innerHTML = `
        <div class="nav-left">
          <div class="breadcrumb-trail">${breadcrumbHTML}</div>
        </div>
        <div class="nav-right">
          <button type="button" class="btn btn-primary btn-sm" id="btn-nav-add-sub">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Add Sub-habit
          </button>
        </div>
      `;

      viewNav.classList.remove('hidden');

      const navAddSub = document.getElementById('btn-nav-add-sub');
      if (navAddSub) {
        navAddSub.addEventListener('click', () => {
          openHabitModal(null, targetHabit.id);
        });
      }
    } else {
      viewNav.classList.add('hidden');
    }
  }

  function handleBackNavigation(currentHabit) {
    if (currentHabit && currentHabit.parentId) {
      navigateTo(`#/habit/${currentHabit.parentId}`);
    } else {
      if (window.history.length > 1 && document.referrer.includes(window.location.host)) {
        window.history.back();
      } else {
        navigateTo('#/');
      }
    }
  }

  function applyParentDependencyOnLog(habit, dateKey, newCount) {
    if (!habit) return;

    // 1. If this habit is a sub-habit with parent dependency rules
    if (habit.parentId && habit.parentDependency && habit.parentDependency !== 'none' && newCount > 0) {
      const parent = state.habits.find(h => h.id === habit.parentId);
      if (parent) {
        if (!parent.logs) parent.logs = {};
        const parentLog = parent.logs[dateKey];
        const parentCount = parentLog ? parentLog.count : 0;

        if (habit.parentDependency === 'requires_parent' || habit.parentDependency === 'auto_log_parent') {
          const reqTarget = parent.type === 'negative' ? 0 : (parent.dailyTarget || 1);
          if (parent.type !== 'negative') {
            if (parentCount < reqTarget) {
              parent.logs[dateKey] = {
                count: reqTarget,
                note: (parentLog && parentLog.note) ? parentLog.note : ''
              };
              showToast(`Logged "${habit.name}" & auto-logged parent task "${parent.name}"!`);
            }
          }
        }
      }
    }

    // 2. If this habit is a parent task, check for child sub-habits set to 'auto_complete_from_parent'
    if (newCount > 0) {
      const autoSubs = state.habits.filter(h => h.parentId === habit.id && h.parentDependency === 'auto_complete_from_parent');
      autoSubs.forEach(sub => {
        if (!sub.logs) sub.logs = {};
        const subLog = sub.logs[dateKey];
        const subTarget = sub.type === 'negative' ? 0 : (sub.dailyTarget || 1);

        if (sub.type !== 'negative') {
          const subCount = subLog ? subLog.count : 0;
          if (subCount < subTarget) {
            sub.logs[dateKey] = {
              count: subTarget,
              note: (subLog && subLog.note) ? subLog.note : ''
            };
            showToast(`Logged "${habit.name}" & auto-completed sub-habit "${sub.name}"!`);
          }
        }
      });
    }
  }

  function setHabitPauseState(habit, newIsPaused, dateStr = getTodayKey()) {
    if (!habit) return;
    const wasPaused = Boolean(habit.isPaused);
    habit.isPaused = Boolean(newIsPaused);

    if (!Array.isArray(habit.pauseHistory)) {
      habit.pauseHistory = [];
    }

    if (newIsPaused && !wasPaused) {
      habit.pauseHistory.push({
        startDate: dateStr,
        endDate: null
      });
    } else if (!newIsPaused && wasPaused) {
      if (habit.pauseHistory.length > 0) {
        const lastEntry = habit.pauseHistory[habit.pauseHistory.length - 1];
        if (!lastEntry.endDate) {
          lastEntry.endDate = dateStr;
        }
      }
    }
  }

  function isHabitPausedOnDate(habit, dateStr) {
    if (!habit) return false;

    if (Array.isArray(habit.pauseHistory) && habit.pauseHistory.length > 0) {
      for (const range of habit.pauseHistory) {
        const start = range.startDate;
        const end = range.endDate;
        if (start && dateStr >= start) {
          if (!end || dateStr <= end) {
            return true;
          }
        }
      }
    }

    if (habit.isPaused) {
      const createdAt = habit.createdAt || getTodayKey();
      if (dateStr >= createdAt || dateStr === getTodayKey()) {
        return true;
      }
    }

    return false;
  }

  function toggleHabitForDate(habitId, dateKey) {
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;

    if (!habit.logs) habit.logs = {};

    const currentLog = habit.logs[dateKey];
    const currentCount = currentLog ? currentLog.count : 0;
    const currentNote = currentLog ? currentLog.note : '';

    let newCount = currentCount + 1;
    habit.logs[dateKey] = { count: newCount, note: currentNote };

    applyParentDependencyOnLog(habit, dateKey, newCount);

    saveState();
    renderAll();
  }

  function getAvailableYears() {
    const yearsSet = new Set();
    yearsSet.add(CURRENT_YEAR);

    state.habits.forEach(h => {
      if (h.logs) {
        Object.keys(h.logs).forEach(dateStr => {
          const y = parseInt(dateStr.split('-')[0], 10);
          if (y && !isNaN(y)) yearsSet.add(y);
        });
      }
    });

    return Array.from(yearsSet).sort((a, b) => b - a);
  }

  function renderYearSelector() {
    const years = getAvailableYears();
    if (!years.includes(state.selectedYear)) {
      state.selectedYear = years[0];
    }

    elements.yearSelector.innerHTML = years
      .map(y => `<option value="${y}" ${y === state.selectedYear ? 'selected' : ''}>${y}</option>`)
      .join('');
  }

  // --- HEATMAP GALLERY RENDERER ---
  function renderHeatmapsGallery() {
    elements.heatmapsGallery.innerHTML = '';
    const route = parseHash();

    renderViewNavigation(route);

    if (state.habits.length === 0) {
      const isHidden = elements.headerMenuContent.classList.toggle('hidden');
      elements.btnHeaderMenu.setAttribute('aria-expanded', !isHidden);// show menu
      return;
    }

    if (route.view === 'home') {
      const topLevelHabits = state.habits.filter(h => !h.parentId);

      // Render Combined Heatmap Card only if there are multiple main habits overall
      if (topLevelHabits.length > 1) {
        const combinedCard = buildHeatmapCard(null, state.selectedYear);
        elements.heatmapsGallery.appendChild(combinedCard);
      }

      topLevelHabits.forEach(habit => {
        const subhabits = state.habits.filter(h => h.parentId === habit.id);
        if (subhabits.length > 0) {
          const allDescendantIds = getAllDescendantIds(habit.id);
          const groupTarget = {
            isGroup: true,
            habit: habit,
            title: habit.name,
            habitIds: allDescendantIds,
            colorTheme: habit.colorTheme
          };
          const habitCard = buildHeatmapCard(groupTarget, state.selectedYear);
          elements.heatmapsGallery.appendChild(habitCard);
        } else {
          const habitCard = buildHeatmapCard(habit, state.selectedYear);
          elements.heatmapsGallery.appendChild(habitCard);
        }
      });
    } else if (route.view === 'habit') {
      const targetHabit = state.habits.find(h => h.id === route.habitId);

      if (!targetHabit) {
        elements.heatmapsGallery.innerHTML = `
          <div class="empty-placeholder">
            <p>Habit not found or may have been deleted.</p>
            <br>
            <a href="#/" class="btn btn-primary">Return to All Habits</a>
          </div>
        `;
        return;
      }

      const subhabits = state.habits.filter(h => h.parentId === targetHabit.id);
      const allDescendantIds = getAllDescendantIds(targetHabit.id);

      if (subhabits.length > 0) {
        // Combined Sub-habits Heatmap Card (serves as the combined view for target habit + sub-habits)
        const groupTarget = {
          isGroup: true,
          habit: targetHabit,
          title: targetHabit.name,
          habitIds: allDescendantIds,
          colorTheme: targetHabit.colorTheme
        };
        const groupCard = buildHeatmapCard(groupTarget, state.selectedYear);
        elements.heatmapsGallery.appendChild(groupCard);

        // Section header for sub-habits
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'subhabits-section-header';
        sectionHeader.innerHTML = `
          <h4>📁 Sub-habits (${subhabits.length})</h4>
          <button type="button" class="btn btn-secondary btn-sm btn-add-sub-section">
            + New Sub-habit
          </button>
        `;
        elements.heatmapsGallery.appendChild(sectionHeader);

        sectionHeader.querySelector('.btn-add-sub-section').addEventListener('click', () => {
          openHabitModal(null, targetHabit.id);
        });

        subhabits.forEach(sub => {
          const subCard = buildHeatmapCard(sub, state.selectedYear);
          elements.heatmapsGallery.appendChild(subCard);
        });
      } else {
        // Render target habit card directly (when there are no sub-habits)
        const habitCard = buildHeatmapCard(targetHabit, state.selectedYear);
        elements.heatmapsGallery.appendChild(habitCard);

        const callout = document.createElement('div');
        callout.className = 'subhabit-callout';
        callout.innerHTML = `
          <button type="button" class="btn btn-secondary btn-sm btn-add-sub-callout">+ Add Sub-habit</button>
        `;
        elements.heatmapsGallery.appendChild(callout);

        callout.querySelector('.btn-add-sub-callout').addEventListener('click', () => {
          openHabitModal(null, targetHabit.id);
        });
      }
    }

    attachHeatmapSquareEvents();
    attachCardDragAndDropHandlers();
  }

  function buildHeatmapCard(targetOrNull, year) {
    const todayStr = getTodayKey();
    const isAll = targetOrNull === null;
    const isGroup = targetOrNull && targetOrNull.isGroup;
    const habit = (!isAll && !isGroup) ? targetOrNull : (isGroup && targetOrNull.habit ? targetOrNull.habit : null);

    let cardHabitId = 'all';
    if (isGroup) cardHabitId = 'group_' + targetOrNull.habitIds.join('_');
    else if (habit) cardHabitId = habit.id;

    const colorTheme = isAll ? null : (isGroup ? (targetOrNull.colorTheme || (habit ? habit.colorTheme : null)) : (habit ? habit.colorTheme : null));
    const isCustomHex = colorTheme && colorTheme.startsWith('#');
    const theme = isAll ? 'green' : (isCustomHex ? 'custom' : (colorTheme || 'green'));
    const isNegative = habit && habit.type === 'negative';

    const isCardFocused = focusedDayState.habitId === cardHabitId && focusedDayState.dateStr;

    const streakData = calculateStreakForTarget(isAll ? 'all' : (isGroup ? targetOrNull : habit));
    const stats = calculateYearStatsForTarget(isAll ? 'all' : (isGroup ? targetOrNull : habit), year);

    const isTopLevelGroup = isGroup && habit && !habit.parentId;
    const isDraggable = (!isAll && (!isGroup || isTopLevelGroup));

    const card = document.createElement('div');
    card.className = `heatmap-card theme-${theme} ${isDraggable ? 'draggable-card' : ''} ${isCardFocused ? 'focused' : ''} ${(habit && habit.isPaused) ? 'is-paused' : ''}`;
    card.setAttribute('data-habit-id', cardHabitId);

    if (isDraggable) {
      card.setAttribute('draggable', 'true');
    }

    if (isCustomHex) {
      const levels = getCustomThemeLevels(colorTheme);
      card.style.setProperty('--custom-level-0', levels.level0);
      card.style.setProperty('--custom-level-1', levels.level1);
      card.style.setProperty('--custom-level-2', levels.level2);
      card.style.setProperty('--custom-level-3', levels.level3);
      card.style.setProperty('--custom-level-4', levels.level4);
    }

    const route = parseHash();
    const isCurrentOpenPage = route.view === 'habit' && route.habitId === (habit ? habit.id : null);

    let titleText = 'All';
    if (isGroup) titleText = targetOrNull.title;
    else if (habit) titleText = habit.name;

    let streakLabel = '';
    const shouldShowStreak = habit ? habit.showStreak === true : false;
    if (shouldShowStreak && streakData.current > 0) {
      if (streakData.isMonthly) {
        streakLabel = `🔥 ${streakData.current} mo${streakData.current === 1 ? '' : 's'}`;
      } else if (streakData.isWeekly) {
        streakLabel = `🔥 ${streakData.current} wk${streakData.current === 1 ? '' : 's'}`;
      } else {
        streakLabel = `🔥 ${streakData.current} d`;
      }
    }

    let countLabel = '';
    if (stats.isMonthly) {
      countLabel = `${stats.totalCount} of 12 months met in ${year}`;
    } else if (stats.isWeekly) {
      countLabel = `${stats.totalCount} of 52 weeks met in ${year}`;
    } else {
      countLabel = isNegative ? `${stats.totalCount} clean days in ${year}` : `${stats.totalCount} in ${year}`;
    }

    let frequencyBadgeHTML = '';
    if (habit) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      if (habit.frequencyType === 'weekly') {
        const dayIdx = (habit.targetDays && habit.targetDays.length > 0) ? habit.targetDays[0] : 1;
        frequencyBadgeHTML = `<span class="badge-frequency" title="Weekly target: Every ${dayNames[dayIdx]}">📅 Every ${dayNames[dayIdx]}</span>`;
      } else if (habit.frequencyType === 'monthly') {
        const mDay = habit.monthlyDay || '1';
        const dayLabel = mDay === 'last' ? 'Last day' : `${mDay}${getOrdinalSuffix(parseInt(mDay, 10))}`;
        frequencyBadgeHTML = `<span class="badge-frequency" title="Monthly goal: ${dayLabel} of month">📅 Every Month (${dayLabel})</span>`;
      } else if (habit.frequencyType === 'specific_days' && habit.targetDays && habit.targetDays.length > 0) {
        const daysStr = habit.targetDays.map(d => dayNames[d]).join(', ');
        frequencyBadgeHTML = `<span class="badge-frequency" title="Target days: ${daysStr}">📅 ${daysStr}</span>`;
      } else if (habit.frequencyType === 'custom_interval') {
        const cTarget = habit.customTarget || 1;
        const cInterval = habit.customInterval || 3;
        const cUnit = habit.customUnit || 'days';
        frequencyBadgeHTML = `<span class="badge-frequency" title="Custom schedule: ${cTarget}x every ${cInterval} ${cUnit}">📅 ${cTarget}x every ${cInterval} ${cUnit}</span>`;
      }
    }

    const colorBadgeStyle = isAll
      ? 'background-color: #39d353;'
      : `background-color: ${getHabitHexColor(habit || targetOrNull)};`;

    // Title element: if page is ALREADY open, no link is needed!
    let titleHTML = `<h3>${escapeHTML(titleText)}</h3>`;
    if (habit) {
      if (isCurrentOpenPage) {
        titleHTML = `<h3>${escapeHTML(titleText)}</h3>`;
      } else {
        titleHTML = `<h3><a href="#/habit/${habit.id}" class="card-title-link" title="Open ${escapeHTML(titleText)}">${escapeHTML(titleText)}</a></h3>`;
      }
    }

    // Subhabits badge
    let subhabitsBadgeHTML = '';
    if (habit) {
      const directSubs = state.habits.filter(h => h.parentId === habit.id);
      if (directSubs.length > 0) {
        if (isCurrentOpenPage) {
          subhabitsBadgeHTML = `<span class="badge-subhabits">📁 ${directSubs.length} sub-habit${directSubs.length === 1 ? '' : 's'}</span>`;
        } else {
          subhabitsBadgeHTML = `<a href="#/habit/${habit.id}" class="badge-subhabits" title="View ${directSubs.length} sub-habits">📁 ${directSubs.length} sub-habit${directSubs.length === 1 ? '' : 's'}</a>`;
        }
      }
    }

    // Parent Dependency badge
    let dependencyBadgeHTML = '';
    if (habit && habit.parentId && habit.parentDependency && habit.parentDependency !== 'none') {
      const parent = state.habits.find(h => h.id === habit.parentId);
      const pName = parent ? parent.name : 'Parent Task';
      if (habit.parentDependency === 'requires_parent') {
        dependencyBadgeHTML = `<span class="badge-dependency" title="Requires '${escapeHTML(pName)}' to be completed first">🔗 Requires ${escapeHTML(pName)}</span>`;
      } else if (habit.parentDependency === 'auto_log_parent') {
        dependencyBadgeHTML = `<span class="badge-dependency" title="Logging this sub-habit auto-logs '${escapeHTML(pName)}'">⚡ Auto-logs ${escapeHTML(pName)}</span>`;
      } else if (habit.parentDependency === 'auto_complete_from_parent') {
        dependencyBadgeHTML = `<span class="badge-dependency" title="Logging '${escapeHTML(pName)}' auto-completes this sub-habit">🔄 Auto-completes with ${escapeHTML(pName)}</span>`;
      } else if (habit.parentDependency === 'parent_days_only') {
        dependencyBadgeHTML = `<span class="badge-dependency" title="Goal active only on days when '${escapeHTML(pName)}' is done">📅 Active on ${escapeHTML(pName)} Days</span>`;
      }
    }

    // Paused badge
    let pausedBadgeHTML = (habit && habit.isPaused) ? '<span class="badge-paused" title="This habit is currently paused">⏸️ Paused</span>' : '';

    // Context Menu for Habit Actions
    let actionsHTML = '';
    if (habit) {
      const openMenuItem = !isCurrentOpenPage ? `<a href="#/habit/${habit.id}" class="card-menu-item">Open Habit Page</a>` : '';
      const dragHandleHTML = isDraggable ? `
        <div class="drag-handle" title="Drag to reorder habit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
        </div>
      ` : '';

      actionsHTML = `
        <div class="card-header-actions">
          ${dragHandleHTML}
          <div class="card-context-menu-dropdown">
            <button type="button" class="btn-card-menu-toggle" title="Options" aria-label="Habit Options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
            <div class="card-menu-content hidden">
              ${openMenuItem}
              <button type="button" class="card-menu-item btn-card-add-sub" data-habit-id="${habit.id}">+ Add Sub-habit</button>
              <button type="button" class="card-menu-item btn-card-edit" data-habit-id="${habit.id}">Edit Habit</button>
              <button type="button" class="card-menu-item btn-card-pause" data-habit-id="${habit.id}">${habit.isPaused ? '▶️ Resume Habit' : '⏸️ Pause Habit'}</button>
              <button type="button" class="card-menu-item btn-card-delete text-danger" data-habit-id="${habit.id}">Delete Habit</button>
            </div>
          </div>
        </div>
      `;
    } else if (!isAll) {
      actionsHTML = isDraggable ? `
        <div class="card-header-actions">
          <div class="drag-handle" title="Drag to reorder habit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
          </div>
        </div>
      ` : '';
    }

    let headerHTML = `
      <div class="heatmap-card-header ${actionsHTML ? 'has-actions' : ''}">
        <div class="heatmap-title-row">
          <span class="color-badge" style="${colorBadgeStyle}"></span>
          ${titleHTML}
          ${subhabitsBadgeHTML}
          ${dependencyBadgeHTML}
          ${frequencyBadgeHTML}
          ${pausedBadgeHTML}
          ${streakLabel ? `<span class="badge-streak">${streakLabel}</span>` : ''}
          <span class="badge-count">${countLabel}</span>
        </div>
        ${actionsHTML}
      </div>
    `;

    // Contextual Quick-Add Toolbar for Tapped Day
    let focusedToolbarHTML = '';
    if (isCardFocused && focusedDayState.dateStr) {
      const focusDateKey = focusedDayState.dateStr;
      const prettyDate = formatPrettyDate(focusDateKey);

      let actionButtonsHTML = '';

      const habitsToInclude = isAll ? state.habits : (isGroup ? state.habits.filter(h => targetOrNull.habitIds.includes(h.id)) : (habit ? [habit] : []));

      habitsToInclude.forEach(h => {
        const hex = getHabitHexColor(h);
        const log = h.logs ? h.logs[focusDateKey] : null;

        let isDone = false;
        let labelText = '';

        if (h.type === 'negative') {
          const isClean = !log || log.count === 0;
          isDone = isClean;
          labelText = isClean ? `✨ ${h.name}` : `⚠️ Slip ${h.name} (${log.count})`;
        } else {
          const count = log ? log.count : 0;
          const target = h.dailyTarget || 1;
          isDone = count >= target;
          const targetText = target > 1 ? ` (${count}/${target})` : (count > 0 ? ` (${count})` : '');
          labelText = isDone ? `✓ +1 ${h.name}${targetText}` : `+1 ${h.name}${targetText}`;
        }

        actionButtonsHTML += `
          <button type="button" class="btn btn-secondary quick-log-btn ${isDone ? 'completed' : ''}"
                  style="--quick-btn-color: ${hex};"
                  data-action-habit-id="${h.id}"
                  data-action-date-key="${focusDateKey}"
                  title="Click to add +1">
            ${escapeHTML(labelText)}
          </button>
        `;
      });

      focusedToolbarHTML = `
        <div class="focused-day-toolbar">
          <div class="focused-date-picker-wrap">
            <label for="focused-date-input-${cardHabitId}" class="focused-date-label">📅 Date:</label>
            <input type="date"
                   id="focused-date-input-${cardHabitId}"
                   class="focused-date-input"
                   value="${focusDateKey}"
                   max="${todayStr}">
          </div>
          <div class="focused-toolbar-actions">
            ${actionButtonsHTML}
            <button type="button" class="btn btn-ghost btn-close-toolbar" id="btn-close-focused-toolbar" title="Collapse details">&times; Close</button>
          </div>
        </div>
      `;
    }

    // 100% Fluid 7x52 Grid Matrix
    const startDate = new Date(year, 0, 1);
    const gridStart = new Date(startDate);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    const endDate = new Date(year, 11, 31);
    const gridEnd = new Date(endDate);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const weekColumns = [];
    let currentWeek = [];
    let cur = new Date(gridStart);

    while (cur <= gridEnd) {
      currentWeek.push(new Date(cur));
      if (currentWeek.length === 7) {
        weekColumns.push(currentWeek);
        currentWeek = [];
      }
      cur.setDate(cur.getDate() + 1);
    }

    let gridHTML = `<div class="heatmap-weeks-grid theme-${theme}">`;

    weekColumns.forEach(week => {
      gridHTML += '<div class="heatmap-week-column">';
      week.forEach(d => {
        const dateStr = formatDateKey(d);
        const isCurrentYear = d.getFullYear() === year;

        if (!isCurrentYear) {
          gridHTML += '<div class="day-square level-0" style="opacity: 0.12;"></div>';
          return;
        }

        const cellData = getCellData(dateStr, isAll ? 'all' : (isGroup ? targetOrNull : habit), todayStr);
        const isToday = dateStr === todayStr;

        let squareStyle = '';
        let habitsDoneAttr = '';

        if (isAll || isGroup) {
          const numActive = cellData.activeHabits ? cellData.activeHabits.length : 0;

          if (numActive === 1) {
            squareStyle = `background-color: ${cellData.activeHabits[0].color};`;
          } else if (numActive > 1) {
            const colors = cellData.activeHabits.map(h => h.color);
            const num = colors.length;
            const stops = colors.map((col, idx) => {
              const p1 = ((idx / num) * 100).toFixed(1);
              const p2 = (((idx + 1) / num) * 100).toFixed(1);
              return `${col} ${p1}% ${p2}%`;
            }).join(', ');
            squareStyle = `background: linear-gradient(135deg, ${stops});`;
          }

          if (cellData.activeHabits && cellData.activeHabits.length > 0) {
            habitsDoneAttr = `data-habits-done="${escapeHTML(cellData.activeHabits.map(h => h.name).join(', '))}"`;
          }
        }

        const targetDayClass = (cellData.isTargetDay && cellData.level === 0) ? 'target-day' : '';
        const isPausedDayClass = cellData.isPaused ? 'is-paused-day' : '';

        gridHTML += `
          <div class="day-square level-${cellData.level} ${cellData.isRelapse ? 'relapse' : ''} ${isToday ? 'today' : ''} ${targetDayClass} ${isPausedDayClass}"
               style="${squareStyle}"
               data-date="${dateStr}"
               data-habit-id="${cardHabitId}"
               data-count="${cellData.count}"
               data-level="${cellData.level}"
               data-relapse="${cellData.isRelapse ? 'true' : 'false'}"
               data-paused="${cellData.isPaused ? 'true' : 'false'}"
               data-note="${escapeHTML(cellData.note)}"
               ${habitsDoneAttr}>
          </div>
        `;
      });
      gridHTML += '</div>';
    });

    gridHTML += '</div>';

    card.innerHTML = headerHTML + focusedToolbarHTML + `<div class="heatmap-wrapper"><div class="heatmap-grid-container">${gridHTML}</div></div>`;
    return card;
  }

  // --- WEEKLY & MONTHLY SCHEDULE HELPERS ---
  function getOrdinalSuffix(i) {
    const j = i % 10, k = i % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  }

  function getWeekRangeForDate(dInput, weekStartDay = 1) {
    const d = new Date(typeof dInput === 'string' ? dInput + 'T00:00:00' : dInput);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = Sun, 1 = Mon, ...
    const diff = (day - weekStartDay + 7) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      startKey: formatDateKey(start),
      endKey: formatDateKey(end),
      startDate: start,
      endDate: end
    };
  }

  function getWeeklyLogCount(habit, startKey, endKey) {
    if (!habit || !habit.logs) return 0;
    let total = 0;
    const cur = new Date(startKey + 'T00:00:00');
    const end = new Date(endKey + 'T00:00:00');
    while (cur <= end) {
      const key = formatDateKey(cur);
      const log = habit.logs[key];
      if (log && log.count > 0) {
        total += log.count;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return total;
  }

  function getWeeklyActiveDaysCount(habit, startKey, endKey) {
    if (!habit || !habit.logs) return 0;
    let activeDays = 0;
    const cur = new Date(startKey + 'T00:00:00');
    const end = new Date(endKey + 'T00:00:00');
    while (cur <= end) {
      const key = formatDateKey(cur);
      const log = habit.logs[key];
      if (log && log.count > 0) {
        activeDays++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return activeDays;
  }

  function getMonthRangeForDate(dInput) {
    const d = new Date(typeof dInput === 'string' ? dInput + 'T00:00:00' : dInput);
    const year = d.getFullYear();
    const month = d.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return {
      startKey: formatDateKey(start),
      endKey: formatDateKey(end),
      startDate: start,
      endDate: end,
      year,
      month
    };
  }

  function getMonthlyLogCount(habit, startKey, endKey) {
    if (!habit || !habit.logs) return 0;
    let total = 0;
    const cur = new Date(startKey + 'T00:00:00');
    const end = new Date(endKey + 'T00:00:00');
    while (cur <= end) {
      const key = formatDateKey(cur);
      const log = habit.logs[key];
      if (log && log.count > 0) {
        total += log.count;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return total;
  }

  function getTargetDayOfMonthDate(year, month, targetDaySetting) {
    const maxDays = new Date(year, month + 1, 0).getDate();
    let day = 1;
    if (targetDaySetting === 'last') {
      day = maxDays;
    } else {
      const parsed = parseInt(targetDaySetting, 10);
      day = (!isNaN(parsed) && parsed > 0) ? Math.min(parsed, maxDays) : 1;
    }
    return new Date(year, month, day);
  }

  function getCellData(dateStr, target, todayStr) {
    let habitList = [];
    if (target === 'all') {
      habitList = state.habits;
    } else if (Array.isArray(target)) {
      habitList = target;
    } else if (target && target.habitIds) {
      habitList = state.habits.filter(h => target.habitIds.includes(h.id));
    } else if (target) {
      habitList = [target];
    }

    if (target === 'all' || Array.isArray(target) || (target && target.habitIds)) {
      const activeHabits = [];
      let totalRatios = 0;

      const habitData = habitList.map(h => {
        const log = (h.logs && h.logs[dateStr]) ? h.logs[dateStr] : null;
        let isDone = false;
        let ratio = 0;
        let hLevel = 0;

        if (h.type === 'negative') {
          if (log && log.count > 0) {
            isDone = false;
            ratio = 0;
            hLevel = 0;
          } else if (dateStr <= todayStr) {
            isDone = true;
            ratio = 1.0;
            hLevel = 4;
          }
        } else {
          const count = log ? log.count : 0;
          if (h.frequencyType === 'weekly' && h.colorWholeWeek !== false) {
            const anchor = (h.targetDays && h.targetDays.length > 0) ? h.targetDays[0] : 1;
            const range = getWeekRangeForDate(dateStr, anchor);
            const wCount = getWeeklyLogCount(h, range.startKey, range.endKey);
            const req = h.weeklyTarget || 1;
            if (wCount >= req) {
              isDone = true;
              ratio = 1.0;
              hLevel = 4;
            } else if (count > 0) {
              isDone = true;
              ratio = Math.min(1.0, count / req);
              hLevel = Math.min(3, Math.max(1, Math.ceil(ratio * 3)));
            }
          } else if (h.frequencyType === 'monthly' && h.colorWholeMonth !== false) {
            const mRange = getMonthRangeForDate(dateStr);
            const mCount = getMonthlyLogCount(h, mRange.startKey, mRange.endKey);
            const req = h.monthlyTarget || 1;
            if (mCount >= req) {
              isDone = true;
              ratio = 1.0;
              hLevel = 4;
            } else if (count > 0) {
              isDone = true;
              ratio = Math.min(1.0, count / req);
              hLevel = Math.min(3, Math.max(1, Math.ceil(ratio * 3)));
            }
          } else if (h.frequencyType === 'specific_days' && h.colorWholeWeek !== false) {
            const targetDays = h.targetDays || [1, 3, 5];
            const anchor = targetDays[0] || 1;
            const range = getWeekRangeForDate(dateStr, anchor);
            const activeDays = getWeeklyActiveDaysCount(h, range.startKey, range.endKey);
            const req = targetDays.length;
            if (activeDays >= req) {
              isDone = true;
              ratio = 1.0;
              hLevel = 4;
            } else if (count > 0) {
              isDone = true;
              ratio = Math.min(1.0, count / (req || 1));
              hLevel = Math.min(3, Math.max(1, Math.ceil(ratio * 3)));
            }
          } else {
            const dailyTarget = Math.max(1, h.dailyTarget || 1);
            if (count > 0) {
              isDone = true;
              ratio = Math.min(1.0, count / dailyTarget);
              if (ratio >= 1.0) {
                hLevel = 4;
              } else {
                hLevel = Math.min(3, Math.max(1, Math.ceil(ratio * 3)));
              }
            }
          }
        }

        if (isDone) {
          totalRatios += ratio;
        }

        return { habit: h, isDone, ratio, hLevel };
      });

      let overallLevel = 0;
      const activeCount = habitData.filter(d => d.isDone).length;

      if (activeCount > 0 && habitList.length > 0) {
        const avgRatio = totalRatios / habitList.length;
        if (avgRatio >= 1.0) {
          overallLevel = 4;
        } else {
          overallLevel = Math.min(3, Math.max(1, Math.ceil(avgRatio * 3)));
        }
      }

      habitData.forEach(item => {
        if (item.isDone && item.ratio > 0) {
          const effectiveLevel = Math.max(1, Math.min(item.hLevel, overallLevel));
          activeHabits.push({
            id: item.habit.id,
            name: item.habit.name,
            ratio: item.ratio,
            level: effectiveLevel,
            color: getHabitHexWithAlpha(item.habit, item.ratio)
          });
        }
      });

      const allPaused = (habitList.length > 0) && habitList.every(h => isHabitPausedOnDate(h, dateStr));

      return {
        count: activeCount,
        level: overallLevel,
        activeHabits,
        isRelapse: false,
        isPaused: allPaused,
        note: allPaused ? '⏸️ Paused' : '',
        isTargetDay: false
      };
    }

    const habit = target;
    const log = (habit.logs && habit.logs[dateStr]) ? habit.logs[dateStr] : null;
    const isPaused = isHabitPausedOnDate(habit, dateStr);

    if (isPaused && (!log || log.count === 0)) {
      return {
        count: 0,
        level: 0,
        isRelapse: false,
        isPaused: true,
        note: (log && log.note) ? log.note : '⏸️ Paused (Tracking paused)',
        isTargetDay: false
      };
    }

    if (habit.type === 'negative') {
      if (log && log.count > 0) {
        return { count: log.count, level: 0, isRelapse: true, note: log.note || 'Relapse logged', isTargetDay: false };
      }
      if (dateStr <= todayStr) {
        return { count: 1, level: 3, isRelapse: false, note: 'Clean day', isTargetDay: false };
      }
      return { count: 0, level: 0, isRelapse: false, note: '', isTargetDay: false };
    }

    const dObj = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = dObj.getDay();
    const count = log ? log.count : 0;
    const note = log ? log.note : '';

    if (habit.parentId && habit.parentDependency === 'parent_days_only') {
      const parent = state.habits.find(h => h.id === habit.parentId);
      if (parent) {
        const parentLog = parent.logs ? parent.logs[dateStr] : null;
        let isParentDoneOnDate = parent.type === 'negative'
          ? ((!parentLog || parentLog.count === 0) && dateStr <= todayStr)
          : (parentLog && parentLog.count > 0);

        if (!isParentDoneOnDate && count === 0) {
          return {
            count: 0,
            level: 0,
            isRelapse: false,
            note: note || `Parent task "${parent.name}" was not completed on this date (Sub-habit inactive)`,
            isTargetDay: false
          };
        }
      }
    }

    if (habit.frequencyType === 'weekly') {
      const anchorDay = (habit.targetDays && habit.targetDays.length > 0) ? habit.targetDays[0] : 1;
      const isTargetDay = dayOfWeek === anchorDay;
      const weekRange = getWeekRangeForDate(dateStr, anchorDay);
      const weeklyTarget = habit.weeklyTarget || 1;
      const weeklyCount = getWeeklyLogCount(habit, weekRange.startKey, weekRange.endKey);
      const isGoalMet = weeklyCount >= weeklyTarget;

      if (isGoalMet && habit.colorWholeWeek !== false) {
        return {
          count: count || 1,
          level: 4,
          isRelapse: false,
          note: note || `Weekly goal met (${weeklyCount}/${weeklyTarget})`,
          isTargetDay
        };
      } else {
        let level = 0;
        if (count > 0) {
          const ratio = count / weeklyTarget;
          level = ratio >= 1.0 ? 4 : Math.min(3, Math.max(1, Math.ceil(ratio * 3)));
        }
        return {
          count,
          level,
          isRelapse: false,
          note: note || (isTargetDay && count === 0 ? 'Target Day' : ''),
          isTargetDay
        };
      }
    } else if (habit.frequencyType === 'monthly') {
      const monthSetting = habit.monthlyDay || '1';
      const monthRange = getMonthRangeForDate(dateStr);
      const targetDate = getTargetDayOfMonthDate(monthRange.year, monthRange.month, monthSetting);
      const targetKey = formatDateKey(targetDate);
      const isTargetDay = dateStr === targetKey;
      const monthlyTarget = habit.monthlyTarget || 1;
      const monthlyCount = getMonthlyLogCount(habit, monthRange.startKey, monthRange.endKey);
      const isGoalMet = monthlyCount >= monthlyTarget;

      if (isGoalMet && habit.colorWholeMonth !== false) {
        return {
          count: count || 1,
          level: 4,
          isRelapse: false,
          note: note || `Monthly goal met (${monthlyCount}/${monthlyTarget})`,
          isTargetDay
        };
      } else {
        let level = 0;
        if (count > 0) {
          const ratio = count / monthlyTarget;
          level = ratio >= 1.0 ? 4 : Math.min(3, Math.max(1, Math.ceil(ratio * 3)));
        }
        return {
          count,
          level,
          isRelapse: false,
          note: note || (isTargetDay && count === 0 ? 'Target Day' : ''),
          isTargetDay
        };
      }
    } else if (habit.frequencyType === 'specific_days') {
      const targetDays = habit.targetDays || [1, 3, 5];
      const anchorDay = targetDays[0] || 1;
      const isTargetDay = targetDays.includes(dayOfWeek);
      const weekRange = getWeekRangeForDate(dateStr, anchorDay);
      const activeDaysCount = getWeeklyActiveDaysCount(habit, weekRange.startKey, weekRange.endKey);
      const isWeekMet = activeDaysCount >= targetDays.length;

      if (isWeekMet && habit.colorWholeWeek !== false) {
        return {
          count: count || 1,
          level: 4,
          isRelapse: false,
          note: note || 'Weekly target met',
          isTargetDay
        };
      } else {
        let level = 0;
        if (count > 0) {
          level = 4;
        }
        return {
          count,
          level,
          isRelapse: false,
          note: note || (isTargetDay && count === 0 ? 'Target Day' : ''),
          isTargetDay
        };
      }
    } else {
      const dailyTarget = Math.max(1, habit.dailyTarget || 1);
      let level = 0;
      if (count > 0) {
        const ratio = count / dailyTarget;
        if (ratio >= 1.0) level = 4;
        else level = Math.min(3, Math.max(1, Math.ceil(ratio * 3)));
      }
      return { count, level, isRelapse: false, note, isTargetDay: false };
    }
  }

  function calculateStreakForTarget(target) {
    const today = new Date();

    if (target !== 'all' && target && !target.habitIds && target.type === 'negative') {
      let currentStreak = 0;
      let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      while (true) {
        let key = formatDateKey(checkDate);
        let log = target.logs ? target.logs[key] : null;

        if (!log || log.count === 0) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
      return { current: currentStreak, isWeekly: false, isMonthly: false };
    }

    if (target !== 'all' && target && !target.habitIds && target.frequencyType === 'monthly') {
      const monthlyTarget = target.monthlyTarget || 1;
      const todayKey = formatDateKey(today);
      let curMonthRange = getMonthRangeForDate(todayKey);

      let monthStreak = 0;
      let checkYear = curMonthRange.year;
      let checkMonth = curMonthRange.month;

      let curCount = getMonthlyLogCount(target, curMonthRange.startKey, curMonthRange.endKey);

      if (curCount >= monthlyTarget) {
        monthStreak++;
        checkMonth--;
        if (checkMonth < 0) { checkMonth = 11; checkYear--; }
      } else {
        let prevM = checkMonth - 1;
        let prevY = checkYear;
        if (prevM < 0) { prevM = 11; prevY--; }
        const prevRange = getMonthRangeForDate(new Date(prevY, prevM, 1));
        let prevCount = getMonthlyLogCount(target, prevRange.startKey, prevRange.endKey);

        if (prevCount >= monthlyTarget) {
          checkMonth = prevM;
          checkYear = prevY;
        } else {
          return { current: 0, isMonthly: true };
        }
      }

      while (true) {
        const mRange = getMonthRangeForDate(new Date(checkYear, checkMonth, 1));
        let mCount = getMonthlyLogCount(target, mRange.startKey, mRange.endKey);
        if (mCount >= monthlyTarget) {
          monthStreak++;
          checkMonth--;
          if (checkMonth < 0) { checkMonth = 11; checkYear--; }
        } else {
          break;
        }
      }

      return { current: monthStreak, isMonthly: true };
    }

    if (target !== 'all' && target && !target.habitIds && (target.frequencyType === 'weekly' || target.frequencyType === 'specific_days')) {
      const anchorDay = (target.targetDays && target.targetDays.length > 0) ? target.targetDays[0] : 1;
      const reqTarget = target.frequencyType === 'weekly' ? (target.weeklyTarget || 1) : (target.targetDays ? target.targetDays.length : 1);

      const todayKey = formatDateKey(today);
      let currentWeekRange = getWeekRangeForDate(todayKey, anchorDay);

      let weekStreak = 0;
      let curWeekStart = new Date(currentWeekRange.startDate);

      let curLogCount = target.frequencyType === 'weekly'
        ? getWeeklyLogCount(target, currentWeekRange.startKey, currentWeekRange.endKey)
        : getWeeklyActiveDaysCount(target, currentWeekRange.startKey, currentWeekRange.endKey);

      if (curLogCount >= reqTarget) {
        weekStreak++;
        curWeekStart.setDate(curWeekStart.getDate() - 7);
      } else {
        const prevStart = new Date(curWeekStart);
        prevStart.setDate(prevStart.getDate() - 7);
        const prevRange = getWeekRangeForDate(formatDateKey(prevStart), anchorDay);
        let prevLogCount = target.frequencyType === 'weekly'
          ? getWeeklyLogCount(target, prevRange.startKey, prevRange.endKey)
          : getWeeklyActiveDaysCount(target, prevRange.startKey, prevRange.endKey);

        if (prevLogCount >= reqTarget) {
          curWeekStart.setDate(curWeekStart.getDate() - 7);
        } else {
          return { current: 0, isWeekly: true };
        }
      }

      while (true) {
        const range = getWeekRangeForDate(formatDateKey(curWeekStart), anchorDay);
        let count = target.frequencyType === 'weekly'
          ? getWeeklyLogCount(target, range.startKey, range.endKey)
          : getWeeklyActiveDaysCount(target, range.startKey, range.endKey);

        if (count >= reqTarget) {
          weekStreak++;
          curWeekStart.setDate(curWeekStart.getDate() - 7);
        } else {
          break;
        }
      }

      return { current: weekStreak, isWeekly: true };
    }

    if (target !== 'all' && target && !target.habitIds && target.parentId && target.parentDependency === 'parent_days_only') {
      const parent = state.habits.find(h => h.id === target.parentId);
      if (parent) {
        let currentStreak = 0;
        let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const minDate = new Date(today.getFullYear() - 3, 0, 1);

        while (checkDate >= minDate) {
          let key = formatDateKey(checkDate);
          let parentLog = parent.logs ? parent.logs[key] : null;
          let isParentDone = parent.type === 'negative'
            ? ((!parentLog || parentLog.count === 0) && key <= formatDateKey(today))
            : (parentLog && parentLog.count > 0);

          if (!isParentDone) {
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }

          let subLog = target.logs ? target.logs[key] : null;
          let isSubDone = target.type === 'negative'
            ? (!subLog || subLog.count === 0)
            : (subLog && subLog.count >= (target.dailyTarget || 1));

          if (isSubDone) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            if (key === formatDateKey(today)) {
              checkDate.setDate(checkDate.getDate() - 1);
              continue;
            }
            break;
          }
        }
        return { current: currentStreak, isWeekly: false, isMonthly: false };
      }
    }

    const activeDateMap = {};
    let habitList = [];
    if (target === 'all') {
      habitList = state.habits;
    } else if (target && target.habitIds) {
      habitList = state.habits.filter(h => target.habitIds.includes(h.id));
    } else if (target) {
      habitList = [target];
    }

    habitList.forEach(h => {
      if (h.logs) {
        Object.keys(h.logs).forEach(dateStr => {
          if (h.logs[dateStr] && h.logs[dateStr].count > 0) {
            activeDateMap[dateStr] = true;
          }
        });
      }
    });

    let currentStreak = 0;
    let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let todayKey = formatDateKey(checkDate);

    if (!activeDateMap[todayKey]) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      let key = formatDateKey(checkDate);
      if (activeDateMap[key]) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return { current: currentStreak, isWeekly: false };
  }

  function calculateYearStatsForTarget(target, year) {
    let totalCount = 0;
    const now = new Date();

    if (target !== 'all' && target && !target.habitIds && target.frequencyType === 'monthly') {
      const monthlyTarget = target.monthlyTarget || 1;
      let completedMonths = 0;
      for (let m = 0; m < 12; m++) {
        const mRange = getMonthRangeForDate(new Date(year, m, 1));
        const mCount = getMonthlyLogCount(target, mRange.startKey, mRange.endKey);
        if (mCount >= monthlyTarget) {
          completedMonths++;
        }
      }
      return { totalCount: completedMonths, isMonthly: true };
    }

    if (target !== 'all' && target && !target.habitIds && (target.frequencyType === 'weekly' || target.frequencyType === 'specific_days')) {
      const anchorDay = (target.targetDays && target.targetDays.length > 0) ? target.targetDays[0] : 1;
      const reqTarget = target.frequencyType === 'weekly' ? (target.weeklyTarget || 1) : (target.targetDays ? target.targetDays.length : 1);

      let completedWeeks = 0;
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);

      let curWeek = getWeekRangeForDate(formatDateKey(yearStart), anchorDay);
      let curWeekStart = new Date(curWeek.startDate);

      while (curWeekStart <= yearEnd) {
        const range = getWeekRangeForDate(formatDateKey(curWeekStart), anchorDay);
        let count = target.frequencyType === 'weekly'
          ? getWeeklyLogCount(target, range.startKey, range.endKey)
          : getWeeklyActiveDaysCount(target, range.startKey, range.endKey);

        if (count >= reqTarget) {
          completedWeeks++;
        }

        curWeekStart.setDate(curWeekStart.getDate() + 7);
      }

      return { totalCount: completedWeeks, isWeekly: true };
    }

    if (target !== 'all' && target && !target.habitIds && target.type === 'negative') {
      const startOfYear = new Date(year, 0, 1);
      const endYearDate = (year === now.getFullYear()) ? now : new Date(year, 11, 31);

      let cur = new Date(startOfYear);
      while (cur <= endYearDate) {
        let key = formatDateKey(cur);
        let log = target.logs ? target.logs[key] : null;

        if (!log || log.count === 0) {
          totalCount++;
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      let habitList = [];
      if (target === 'all') {
        habitList = state.habits;
      } else if (target && target.habitIds) {
        habitList = state.habits.filter(h => target.habitIds.includes(h.id));
      } else if (target) {
        habitList = [target];
      }

      habitList.forEach(h => {
        if (h.logs) {
          Object.entries(h.logs).forEach(([dateStr, log]) => {
            if (dateStr.startsWith(`${year}-`) && log && log.count > 0) {
              totalCount += log.count;
            }
          });
        }
      });
    }

    return { totalCount, isWeekly: false };
  }

  function attachHeatmapSquareEvents() {
    const cards = elements.heatmapsGallery.querySelectorAll('.heatmap-card');
    cards.forEach(card => {
      // Long press detection on day squares
      const squares = card.querySelectorAll('.day-square[data-date]');
      squares.forEach(sq => {
        let longPressTimer = null;
        let startX = 0;
        let startY = 0;

        const cancelLongPress = () => {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        };

        const startLongPress = (e) => {
          if (e.button !== undefined && e.button !== 0) return;
          cancelLongPress();
          sq._isLongPressTriggered = false;

          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          startX = clientX;
          startY = clientY;

          longPressTimer = setTimeout(() => {
            sq._isLongPressTriggered = true;
            longPressTimer = null;

            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try { navigator.vibrate(40); } catch (err) {}
            }

            if (elements.customTooltip) elements.customTooltip.classList.add('hidden');

            const dateStr = sq.dataset.date;
            let targetHabitId = sq.dataset.habitId;
            if (!targetHabitId || targetHabitId === 'all' || targetHabitId.startsWith('group_')) {
              targetHabitId = card.getAttribute('data-habit-id') || 'all';
            }

            openLogModal(dateStr, targetHabitId);
          }, 500);
        };

        const moveLongPress = (e) => {
          if (!longPressTimer) return;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          const dist = Math.hypot(clientX - startX, clientY - startY);
          if (dist > 10) {
            cancelLongPress();
          }
        };

        if (typeof window !== 'undefined' && window.PointerEvent) {
          sq.addEventListener('pointerdown', startLongPress);
          sq.addEventListener('pointermove', moveLongPress);
          sq.addEventListener('pointerup', cancelLongPress);
          sq.addEventListener('pointercancel', cancelLongPress);
        } else {
          sq.addEventListener('mousedown', startLongPress);
          sq.addEventListener('mousemove', moveLongPress);
          sq.addEventListener('mouseup', cancelLongPress);
          sq.addEventListener('touchstart', startLongPress, { passive: true });
          sq.addEventListener('touchmove', moveLongPress, { passive: true });
          sq.addEventListener('touchend', cancelLongPress);
          sq.addEventListener('touchcancel', cancelLongPress);
        }

        sq.addEventListener('contextmenu', (e) => {
          if (sq._isLongPressTriggered) {
            e.preventDefault();
          }
        });
      });

      card.addEventListener('click', (e) => {
        if (
          e.target.closest('.focused-day-toolbar') ||
          e.target.closest('.card-header-actions') ||
          e.target.closest('.card-context-menu-dropdown') ||
          e.target.closest('.btn-card-menu-toggle')
        ) {
          return;
        }

        const sq = e.target.closest('.day-square[data-date]');
        if (sq && sq._isLongPressTriggered) {
          sq._isLongPressTriggered = false;
          e.stopPropagation();
          e.preventDefault();
          return;
        }

        e.stopPropagation();
        if (elements.customTooltip) elements.customTooltip.classList.add('hidden');

        const cardHabitId = card.getAttribute('data-habit-id') || 'all';
        let targetHabitId = cardHabitId;

        if (sq && sq.dataset.habitId && sq.dataset.habitId !== 'all' && !sq.dataset.habitId.startsWith('group_')) {
          targetHabitId = sq.dataset.habitId;
        }

        openLogModal(getTodayKey(), targetHabitId);
      });
    });

    // Square tooltips on hover
    const squares = elements.heatmapsGallery.querySelectorAll('.day-square[data-date]');
    squares.forEach(sq => {
      sq.addEventListener('mouseenter', (e) => {
        const dateStr = sq.dataset.date;
        const habitId = sq.dataset.habitId;
        const count = parseInt(sq.dataset.count, 10) || 0;
        const isRelapse = sq.dataset.relapse === 'true';
        const isPaused = sq.dataset.paused === 'true';
        const note = sq.dataset.note;
        const habitsDone = sq.dataset.habitsDone;
        const formattedDate = formatPrettyDate(dateStr);

        let text = '';
        if (isPaused) {
          text = `⏸️ <strong>Paused (Tracking paused)</strong> on ${formattedDate}`;
        } else if (isRelapse) {
          text = `<strong>Relapse logged</strong> (${note || 'Slip day'}) on ${formattedDate}`;
        } else if (habitId.startsWith('all') || habitId.startsWith('group_')) {
          if (habitsDone) {
            text = `✨ <strong>Completed (${count}):</strong> ${habitsDone} on ${formattedDate}`;
          } else {
            text = `No check-ins on ${formattedDate}`;
          }
        } else {
          const habit = state.habits.find(h => h.id === habitId);
          if (habit && habit.type === 'negative') {
            text = count > 0 ? `✨ <strong>Clean Day Success</strong> on ${formattedDate}` : `No data for ${formattedDate}`;
          } else {
            const dailyTarget = habit ? Math.max(1, habit.dailyTarget || 1) : 1;
            if (dailyTarget > 1) {
              const status = count >= dailyTarget ? ' 🎉 Goal Met!' : '';
              text = `<strong>${count}/${dailyTarget} completed${status}</strong> on ${formattedDate}`;
            } else {
              text = `<strong>${count} completion${count === 1 ? '' : 's'}</strong> on ${formattedDate}`;
            }
          }
        }

        elements.customTooltip.innerHTML = text;
        elements.customTooltip.classList.remove('hidden');

        const rect = sq.getBoundingClientRect();
        const tooltipWidth = elements.customTooltip.offsetWidth;
        const tooltipHeight = elements.customTooltip.offsetHeight;

        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const padding = 8;

        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        left = Math.max(padding, Math.min(left, viewportWidth - tooltipWidth - padding));

        const gap = 8;
        let top = rect.top - tooltipHeight - gap;
        if (top < padding) {
          top = rect.bottom + gap;
        }
        top = Math.max(padding, Math.min(top, viewportHeight - tooltipHeight - padding));

        elements.customTooltip.style.left = `${left}px`;
        elements.customTooltip.style.top = `${top}px`;
      });

      sq.addEventListener('mouseleave', () => {
        elements.customTooltip.classList.add('hidden');
      });
    });

    // Date Picker Input Listener in Focused Day Toolbar
    const dateInput = elements.heatmapsGallery.querySelector('.focused-date-input');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        e.stopPropagation();
        const newDate = e.target.value;
        if (newDate) {
          const newYear = parseInt(newDate.split('-')[0], 10);
          if (newYear && newYear !== state.selectedYear && getAvailableYears().includes(newYear)) {
            state.selectedYear = newYear;
          }
          focusedDayState.dateStr = newDate;
          renderAll();
        }
      });
      dateInput.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Quick-Add Action Buttons in Focused Day Toolbar
    const actionButtons = elements.heatmapsGallery.querySelectorAll('[data-action-habit-id]');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hId = btn.dataset.actionHabitId;
        const dateKey = btn.dataset.actionDateKey;

        toggleHabitForDate(hId, dateKey);
      });
    });

    const closeToolbarBtn = elements.heatmapsGallery.querySelector('#btn-close-focused-toolbar');
    if (closeToolbarBtn) {
      closeToolbarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        focusedDayState = { habitId: null, dateStr: null };
        renderAll();
      });
    }

    // Card Context Menu Dropdown Toggle
    elements.heatmapsGallery.querySelectorAll('.btn-card-menu-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.closest('.card-context-menu-dropdown');
        if (!dropdown) return;
        const menu = dropdown.querySelector('.card-menu-content');
        if (!menu) return;

        // Close all other open card context menus
        elements.heatmapsGallery.querySelectorAll('.card-menu-content').forEach(m => {
          if (m !== menu) {
            m.classList.add('hidden');
            const otherCard = m.closest('.heatmap-card');
            if (otherCard) otherCard.classList.remove('menu-open');
          }
        });

        const isHidden = menu.classList.toggle('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) {
          parentCard.classList.toggle('menu-open', !isHidden);
        }
      });
    });

    // Dismiss context menus on click anywhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.card-context-menu-dropdown') && elements.heatmapsGallery) {
        elements.heatmapsGallery.querySelectorAll('.card-menu-content').forEach(m => m.classList.add('hidden'));
        elements.heatmapsGallery.querySelectorAll('.heatmap-card.menu-open').forEach(c => c.classList.remove('menu-open'));
      }
    });

    // Header action buttons inside Context Menu (+ Sub, Edit, Delete)
    elements.heatmapsGallery.querySelectorAll('.btn-card-add-sub').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = btn.dataset.habitId;
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        openHabitModal(null, habitId);
      });
    });

    elements.heatmapsGallery.querySelectorAll('.btn-card-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = btn.dataset.habitId;
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        const habit = state.habits.find(h => h.id === habitId);
        if (habit) openHabitModal(habit);
      });
    });

    elements.heatmapsGallery.querySelectorAll('.btn-card-pause').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = btn.dataset.habitId;
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        const habit = state.habits.find(h => h.id === habitId);
        if (habit) {
          setHabitPauseState(habit, !habit.isPaused);
          saveState();
          renderAll();
        }
      });
    });

    elements.heatmapsGallery.querySelectorAll('.btn-card-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = btn.dataset.habitId;
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        deleteHabit(habitId);
      });
    });

    elements.heatmapsGallery.querySelectorAll('.card-title-link, .badge-subhabits').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
  }

  function getHabitIdFromCardId(idStr) {
    if (!idStr) return null;
    if (idStr.startsWith('group_')) {
      const parts = idStr.replace('group_', '').split('_');
      return parts[0];
    }
    return idStr;
  }

  // --- HTML5 DRAG & DROP REORDERING HANDLER ---
  function attachCardDragAndDropHandlers() {
    let draggedHabitId = null;

    const cards = elements.heatmapsGallery.querySelectorAll('.heatmap-card.draggable-card');

    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        draggedHabitId = card.dataset.habitId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedHabitId);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        cards.forEach(c => c.classList.remove('drag-over'));
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (card.dataset.habitId !== draggedHabitId) {
          card.classList.add('drag-over');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const targetHabitId = card.dataset.habitId;

        if (draggedHabitId && targetHabitId && draggedHabitId !== targetHabitId) {
          const fromId = getHabitIdFromCardId(draggedHabitId);
          const toId = getHabitIdFromCardId(targetHabitId);

          if (fromId && toId && fromId !== toId) {
            const fromIndex = state.habits.findIndex(h => h.id === fromId);
            const toIndex = state.habits.findIndex(h => h.id === toId);

            if (fromIndex !== -1 && toIndex !== -1) {
              const [movedHabit] = state.habits.splice(fromIndex, 1);
              state.habits.splice(toIndex, 0, movedHabit);
              saveState();
              renderAll();
              showToast(`Reordered "${movedHabit.name}"`);
            }
          }
        }
      });
    });
  }

  // --- MODAL HANDLERS ---
  function updateFrequencyOptionsVisibility() {
    const freqSelect = document.getElementById('habit-frequency-type');
    if (!freqSelect) return;
    const val = freqSelect.value;
    const dailyOpts = document.getElementById('freq-daily-options');
    const weeklyOpts = document.getElementById('freq-weekly-options');
    const monthlyOpts = document.getElementById('freq-monthly-options');
    const specificOpts = document.getElementById('freq-specific-options');
    const customOpts = document.getElementById('freq-custom-options');

    if (dailyOpts) dailyOpts.classList.toggle('hidden', val !== 'daily');
    if (weeklyOpts) weeklyOpts.classList.toggle('hidden', val !== 'weekly');
    if (monthlyOpts) monthlyOpts.classList.toggle('hidden', val !== 'monthly');
    if (specificOpts) specificOpts.classList.toggle('hidden', val !== 'specific_days');
    if (customOpts) customOpts.classList.toggle('hidden', val !== 'custom_interval');
  }

  function openHabitModal(habitToEdit = null, defaultParentId = null) {
    elements.formHabit.reset();

    const selectedParentId = habitToEdit ? (habitToEdit.parentId || '') : (defaultParentId || '');
    const parentSelect = document.getElementById('habit-parent');
    if (parentSelect) {
      parentSelect.innerHTML = buildParentSelectOptions(habitToEdit ? habitToEdit.id : null, selectedParentId);
    }

    const parentDepSec = document.getElementById('parent-dependency-section');
    const parentDepSelect = document.getElementById('habit-parent-dependency');
    const parentDepHint = document.getElementById('parent-dependency-hint');

    function updateParentDependencyUI() {
      const pVal = parentSelect ? parentSelect.value : '';
      if (parentDepSec) {
        if (pVal) parentDepSec.classList.remove('hidden');
        else parentDepSec.classList.add('hidden');
      }

      if (parentDepHint && parentDepSelect) {
        const depVal = parentDepSelect.value;
        const selectedOpt = parentSelect && parentSelect.selectedOptions[0] ? parentSelect.selectedOptions[0].text : '';
        const parentName = selectedOpt ? selectedOpt.replace(/^(\s|↳|🛑)*/, '').trim() : 'parent task';

        if (depVal === 'requires_parent') {
          parentDepHint.textContent = `Requires "${parentName}" to be logged on the same day. Auto-logs "${parentName}" if not yet done when you check this off.`;
        } else if (depVal === 'auto_log_parent') {
          parentDepHint.textContent = `Logging this sub-habit will automatically log / increment "${parentName}" for the same date.`;
        } else if (depVal === 'auto_complete_from_parent') {
          parentDepHint.textContent = `Logging "${parentName}" will automatically mark this sub-habit as complete for the same date.`;
        } else if (depVal === 'parent_days_only') {
          parentDepHint.textContent = `Goal & streak for this sub-habit are active ONLY on days when you complete "${parentName}". Non-parent days will not break your sub-habit streak.`;
        } else {
          parentDepHint.textContent = `Independent sub-habit. Can be logged on any day regardless of "${parentName}".`;
        }
      }
    }

    if (parentSelect) {
      parentSelect.onchange = () => {
        updateParentDependencyUI();
        if (elements.habitName && elements.habitName.value.trim().length > 0) {
          handleHabitNameBlur();
        }
      };
    }
    if (parentDepSelect) {
      parentDepSelect.onchange = updateParentDependencyUI;
    }

    const freqSelect = document.getElementById('habit-frequency-type');
    if (freqSelect) {
      freqSelect.value = habitToEdit ? (habitToEdit.frequencyType || 'daily') : 'daily';
      freqSelect.onchange = updateFrequencyOptionsVisibility;
    }
    updateFrequencyOptionsVisibility();

    if (habitToEdit) {
      elements.modalHabitTitle.textContent = 'Edit Habit Goal';
      document.getElementById('habit-id').value = habitToEdit.id;
      document.getElementById('habit-name').value = habitToEdit.name;
      if (elements.habitIdDisplay) elements.habitIdDisplay.textContent = habitToEdit.id;
      if (elements.habitIdPreview) elements.habitIdPreview.classList.remove('hidden');
      if (elements.habitFormDetails) elements.habitFormDetails.classList.remove('hidden');
      document.getElementById('habit-description').value = habitToEdit.description || '';
      document.getElementById('habit-category').value = habitToEdit.category || 'General';
      document.getElementById('habit-daily-target').value = habitToEdit.dailyTarget || 1;
      if (elements.habitShowStreak) elements.habitShowStreak.checked = habitToEdit.showStreak === true;
      if (elements.habitIsPaused) elements.habitIsPaused.checked = habitToEdit.isPaused === true;
      if (parentDepSelect) parentDepSelect.value = habitToEdit.parentDependency || 'none';

      const freqType = habitToEdit.frequencyType || 'daily';
      if (freqType === 'weekly') {
        const daySelect = document.getElementById('habit-weekly-day');
        if (daySelect) daySelect.value = (habitToEdit.targetDays && habitToEdit.targetDays.length > 0) ? String(habitToEdit.targetDays[0]) : '1';
        const targetInput = document.getElementById('habit-weekly-target');
        if (targetInput) targetInput.value = habitToEdit.weeklyTarget || 1;
        const colorChk = document.getElementById('habit-color-whole-week');
        if (colorChk) colorChk.checked = habitToEdit.colorWholeWeek !== false;
      } else if (freqType === 'monthly') {
        const mDaySelect = document.getElementById('habit-monthly-day');
        if (mDaySelect) mDaySelect.value = habitToEdit.monthlyDay || '1';
        const mTargetInput = document.getElementById('habit-monthly-target');
        if (mTargetInput) mTargetInput.value = habitToEdit.monthlyTarget || 1;
        const mColorChk = document.getElementById('habit-color-whole-month');
        if (mColorChk) mColorChk.checked = habitToEdit.colorWholeMonth !== false;
      } else if (freqType === 'specific_days') {
        const targetDays = habitToEdit.targetDays || [1, 3, 5];
        const checkboxes = elements.formHabit.querySelectorAll('input[name="target-days"]');
        checkboxes.forEach(chk => {
          chk.checked = targetDays.includes(parseInt(chk.value, 10));
        });
        const colorChk = document.getElementById('habit-specific-color-whole-week');
        if (colorChk) colorChk.checked = habitToEdit.colorWholeWeek !== false;
      } else if (freqType === 'custom_interval') {
        const cTargetInput = document.getElementById('habit-custom-target');
        if (cTargetInput) cTargetInput.value = habitToEdit.customTarget || 1;
        const cIntervalInput = document.getElementById('habit-custom-interval');
        if (cIntervalInput) cIntervalInput.value = habitToEdit.customInterval || 3;
        const cUnitSelect = document.getElementById('habit-custom-unit');
        if (cUnitSelect) cUnitSelect.value = habitToEdit.customUnit || 'days';
      }

      if (elements.backfillSection) elements.backfillSection.classList.remove('hidden');
      if (elements.habitEnableBackfill) elements.habitEnableBackfill.checked = false;
      if (elements.backfillOptionsContainer) elements.backfillOptionsContainer.classList.add('hidden');
      if (elements.habitHistoryDuration) elements.habitHistoryDuration.value = '30';
      if (elements.habitHistoryFrequency) elements.habitHistoryFrequency.value = 'frequent';
      if (elements.habitHistoryInstances) elements.habitHistoryInstances.value = '1';

      const typeRadio = elements.formHabit.querySelector(`input[name="habit-type"][value="${habitToEdit.type || 'positive'}"]`);
      if (typeRadio) typeRadio.checked = true;

      const isCustomHex = habitToEdit.colorTheme && habitToEdit.colorTheme.startsWith('#');
      if (isCustomHex) {
        elements.radioColorCustom.checked = true;
        const normalized = normalizeHex(habitToEdit.colorTheme);
        elements.customColorHex.value = normalized;
        elements.customColorPicker.value = normalized;
        elements.customSwatchPreview.style.backgroundColor = normalized;
      } else {
        const colorRadio = elements.formHabit.querySelector(`input[name="habit-color"][value="${habitToEdit.colorTheme || 'green'}"]`);
        if (colorRadio) colorRadio.checked = true;
        elements.customSwatchPreview.style.backgroundColor = 'transparent';
      }
    } else {
      elements.modalHabitTitle.textContent = defaultParentId ? 'Create New Sub-Habit' : 'Create New Habit';
      document.getElementById('habit-id').value = '';
      if (elements.habitName) elements.habitName.value = '';
      if (elements.habitIdDisplay) elements.habitIdDisplay.textContent = '';
      if (elements.habitIdPreview) elements.habitIdPreview.classList.add('hidden');
      if (elements.habitFormDetails) elements.habitFormDetails.classList.add('hidden');
      elements.customSwatchPreview.style.backgroundColor = 'transparent';
      if (elements.habitShowStreak) elements.habitShowStreak.checked = false;
      if (elements.habitIsPaused) elements.habitIsPaused.checked = false;
      if (parentDepSelect) parentDepSelect.value = 'none';

      const daySelect = document.getElementById('habit-weekly-day');
      if (daySelect) daySelect.value = '1';
      const targetInput = document.getElementById('habit-weekly-target');
      if (targetInput) targetInput.value = '1';
      const colorChk = document.getElementById('habit-color-whole-week');
      if (colorChk) colorChk.checked = true;

      const mDaySelect = document.getElementById('habit-monthly-day');
      if (mDaySelect) mDaySelect.value = '1';
      const mTargetInput = document.getElementById('habit-monthly-target');
      if (mTargetInput) mTargetInput.value = '1';
      const mColorChk = document.getElementById('habit-color-whole-month');
      if (mColorChk) mColorChk.checked = true;

      const checkboxes = elements.formHabit.querySelectorAll('input[name="target-days"]');
      checkboxes.forEach(chk => {
        const val = parseInt(chk.value, 10);
        chk.checked = (val === 1 || val === 3 || val === 5);
      });
      const specColorChk = document.getElementById('habit-specific-color-whole-week');
      if (specColorChk) specColorChk.checked = true;

      const cTargetInput = document.getElementById('habit-custom-target');
      if (cTargetInput) cTargetInput.value = '1';
      const cIntervalInput = document.getElementById('habit-custom-interval');
      if (cIntervalInput) cIntervalInput.value = '3';
      const cUnitSelect = document.getElementById('habit-custom-unit');
      if (cUnitSelect) cUnitSelect.value = 'days';

      if (elements.backfillSection) elements.backfillSection.classList.remove('hidden');
      if (elements.habitEnableBackfill) elements.habitEnableBackfill.checked = false;
      if (elements.backfillOptionsContainer) elements.backfillOptionsContainer.classList.add('hidden');
      if (elements.habitHistoryDuration) elements.habitHistoryDuration.value = '30';
      if (elements.habitHistoryFrequency) elements.habitHistoryFrequency.value = 'frequent';
      if (elements.habitHistoryInstances) elements.habitHistoryInstances.value = '1';
    }

    const typeRadios = elements.formHabit ? elements.formHabit.querySelectorAll('input[name="habit-type"]') : [];
    typeRadios.forEach(radio => {
      radio.onchange = updateBackfillWordingUI;
    });
    updateBackfillWordingUI();

    updateParentDependencyUI();
    elements.modalHabit.classList.remove('hidden');
  }

  function handleHabitNameBlur() {
    if (!elements.habitName) return;
    const nameVal = elements.habitName.value.trim();
    const currentIdInput = document.getElementById('habit-id');
    const currentId = currentIdInput ? currentIdInput.value : '';
    const isEditMode = Boolean(currentId);

    if (nameVal.length > 0) {
      const parentSelect = document.getElementById('habit-parent');
      const parentIdVal = parentSelect ? parentSelect.value.trim() : '';

      let derivedId = currentId;
      if (!isEditMode) {
        derivedId = (parentIdVal ? parentIdVal + '_' : '') + idFromName(nameVal);
      }

      if (elements.habitIdDisplay) {
        elements.habitIdDisplay.textContent = derivedId;
      }
      if (elements.habitIdPreview) {
        elements.habitIdPreview.classList.remove('hidden');
      }

      if (elements.habitFormDetails) {
        elements.habitFormDetails.classList.remove('hidden');
      }

      if (!isEditMode && typeof Please !== 'undefined') {
        const derivedColor = Please.make_color({ from_hash: derivedId });
        if (derivedColor && typeof derivedColor === 'string') {
          const normalized = normalizeHex(derivedColor);
          if (elements.radioColorCustom) elements.radioColorCustom.checked = true;
          if (elements.customColorHex) elements.customColorHex.value = normalized;
          if (elements.customColorPicker) elements.customColorPicker.value = normalized;
          if (elements.customSwatchPreview) elements.customSwatchPreview.style.backgroundColor = normalized;
        }
      }
    } else if (!isEditMode) {
      if (elements.habitIdPreview) elements.habitIdPreview.classList.add('hidden');
      if (elements.habitFormDetails) elements.habitFormDetails.classList.add('hidden');
    }
  }


  function buildParentSelectOptions(excludeId = null, currentParentId = null) {
    let html = `<option value="">None (Top-Level Habit)</option>`;

    const invalidIds = new Set();
    if (excludeId) {
      getAllDescendantIds(excludeId).forEach(id => invalidIds.add(id));
    }

    function appendHabitOptions(parentId = null, depth = 0) {
      const children = state.habits.filter(h => (h.parentId || null) === parentId);
      children.forEach(h => {
        if (invalidIds.has(h.id)) return;
        const indent = '&nbsp;&nbsp;'.repeat(depth) + (depth > 0 ? '↳ ' : '');
        const isSelected = h.id === currentParentId;
        const pausedSuffix = h.isPaused ? ' (Paused)' : '';
        html += `<option value="${h.id}" ${isSelected ? 'selected' : ''}>${indent}${escapeHTML(h.name)}${pausedSuffix}</option>`;
        appendHabitOptions(h.id, depth + 1);
      });
    }

    appendHabitOptions(null, 0);
    return html;
  }

  function updateBackfillWordingUI() {
    const typeRadio = elements.formHabit ? elements.formHabit.querySelector('input[name="habit-type"]:checked') : null;
    const isNegative = typeRadio ? typeRadio.value === 'negative' : false;

    const titleEl = document.getElementById('backfill-checkbox-title');
    const descEl = document.getElementById('backfill-checkbox-desc');
    const freqLabel = document.getElementById('label-history-frequency');
    const freqSelect = document.getElementById('habit-history-frequency');
    const groupInstances = document.getElementById('group-history-instances');

    if (titleEl) {
      titleEl.innerHTML = isNegative
        ? '<strong>Add Past History / Backfill Clean Days</strong>'
        : '<strong>Add Past History / Backfill Progress</strong>';
    }
    if (descEl) {
      descEl.textContent = isNegative
        ? 'Fill in past history showing clean days vs slip-ups.'
        : 'Fill out past heatmap activity so you don\'t start from a blank canvas.';
    }
    if (freqLabel) {
      freqLabel.textContent = isNegative
        ? 'How consistently were you clean / avoided the bad habit?'
        : 'How consistently did you complete this habit?';
    }
    if (freqSelect && typeof freqSelect.querySelector === 'function') {
      const optDaily = freqSelect.querySelector('option[value="daily"]');
      const optFreq = freqSelect.querySelector('option[value="frequent"]');
      const optMod = freqSelect.querySelector('option[value="moderate"]');
      const optOcc = freqSelect.querySelector('option[value="occasional"]');

      if (optDaily) optDaily.textContent = isNegative ? '100% clean (no relapses logged)' : 'Every single target period (100% complete)';
      if (optFreq) optFreq.textContent = isNegative ? 'Most days clean (~80% clean / 20% slip-ups)' : 'Most periods (~80% / 4 out of 5)';
      if (optMod) optMod.textContent = isNegative ? 'Half the time clean (~50% clean / 50% slip-ups)' : 'Half the time (~50% / half the time)';
      if (optOcc) optOcc.textContent = isNegative ? 'Occasionally clean (~25% clean / 75% slip-ups)' : 'Occasionally (~25% / 1 out of 4)';
    }

    if (groupInstances) {
      if (isNegative) {
        groupInstances.classList.add('hidden');
      } else {
        groupInstances.classList.remove('hidden');
      }
    }
  }

  function generateBackfillLogs(daysToBackfill, frequencyVal, instancesVal, dailyTarget = 1, habitType = 'positive', frequencyType = 'daily', targetDays = [1], monthlyDay = '1', monthlyTarget = 1, weeklyTarget = 1) {
    const logs = {};
    const today = new Date();
    const days = Math.max(1, Math.min(3650, parseInt(daysToBackfill, 10) || 30));

    let frequencyRatio = 0.8;
    if (frequencyVal === 'daily') frequencyRatio = 1.0;
    else if (frequencyVal === 'frequent') frequencyRatio = 0.8;
    else if (frequencyVal === 'moderate') frequencyRatio = 0.5;
    else if (frequencyVal === 'occasional') frequencyRatio = 0.25;

    const startDate = new Date();
    startDate.setDate(today.getDate() - days);

    function getCountForLog() {
      if (habitType === 'negative') return 1;
      if (instancesVal === 'target') return Math.max(1, dailyTarget);
      if (instancesVal === 'random_target') return Math.floor(Math.random() * Math.max(1, dailyTarget)) + 1;
      if (instancesVal === 'random_multi') return Math.floor(Math.random() * Math.max(3, dailyTarget)) + 1;
      if (instancesVal === 'random_high') return Math.floor(Math.random() * Math.max(5, dailyTarget)) + 1;
      const parsed = parseInt(instancesVal, 10);
      return (!isNaN(parsed) && parsed > 0) ? parsed : 1;
    }

    function shouldCreateLog() {
      if (habitType === 'negative') {
        // For quit habits: frequencyRatio is clean day percentage.
        // Relapse (count = 1) occurs on non-clean days (probability 1 - frequencyRatio).
        return Math.random() >= frequencyRatio;
      }
      return Math.random() < frequencyRatio;
    }

    if (frequencyType === 'monthly') {
      let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      while (cur <= todayMonthStart) {
        if (shouldCreateLog()) {
          const logDate = getTargetDayOfMonthDate(cur.getFullYear(), cur.getMonth(), monthlyDay);
          if (logDate >= startDate && logDate <= today) {
            const key = formatDateKey(logDate);
            logs[key] = { count: getCountForLog() };
          }
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (frequencyType === 'weekly') {
      const targetWeekDay = (targetDays && targetDays.length > 0) ? targetDays[0] : 1;
      let curWeekRange = getWeekRangeForDate(startDate, targetWeekDay);
      let curStart = new Date(curWeekRange.startDate);

      while (curStart <= today) {
        if (shouldCreateLog()) {
          const targetDate = new Date(curStart);
          const dayDiff = (targetWeekDay - targetDate.getDay() + 7) % 7;
          targetDate.setDate(targetDate.getDate() + dayDiff);

          if (targetDate >= startDate && targetDate <= today) {
            const key = formatDateKey(targetDate);
            logs[key] = { count: getCountForLog() };
          }
        }
        curStart.setDate(curStart.getDate() + 7);
      }
    } else if (frequencyType === 'specific_days') {
      for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (targetDays.includes(dayOfWeek) && shouldCreateLog()) {
          const key = formatDateKey(d);
          logs[key] = { count: getCountForLog() };
        }
      }
    } else {
      for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
        if (shouldCreateLog()) {
          const key = formatDateKey(d);
          logs[key] = { count: getCountForLog() };
        }
      }
    }

    return { logs, startDateKey: formatDateKey(startDate) };
  }

  function handleHabitFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('habit-id').value;
    const name = document.getElementById('habit-name').value.trim();
    const type = elements.formHabit.querySelector('input[name="habit-type"]:checked').value;
    const description = document.getElementById('habit-description').value.trim();
    const category = document.getElementById('habit-category').value.trim();
    const dailyTarget = parseInt(document.getElementById('habit-daily-target').value, 10) || 1;
    const selectedColorRadio = elements.formHabit.querySelector('input[name="habit-color"]:checked').value;
    const parentIdVal = document.getElementById('habit-parent').value.trim();
    const parentId = parentIdVal ? parentIdVal : null;
    const parentDepSelect = document.getElementById('habit-parent-dependency');
    const parentDependency = (parentId && parentDepSelect) ? parentDepSelect.value : 'none';
    const showStreak = elements.habitShowStreak ? elements.habitShowStreak.checked : false;
    const isPaused = elements.habitIsPaused ? elements.habitIsPaused.checked : false;

    const freqSelect = document.getElementById('habit-frequency-type');
    const freqType = freqSelect ? freqSelect.value : 'daily';
    let targetDays = [1];
    let weeklyTarget = 1;
    let monthlyDay = '1';
    let monthlyTarget = 1;
    let colorWholeWeek = true;
    let colorWholeMonth = true;
    let customTarget = 1;
    let customInterval = 3;
    let customUnit = 'days';

    if (freqType === 'weekly') {
      const dayVal = parseInt(document.getElementById('habit-weekly-day').value, 10);
      targetDays = [isNaN(dayVal) ? 1 : dayVal];
      weeklyTarget = parseInt(document.getElementById('habit-weekly-target').value, 10) || 1;
      const chk = document.getElementById('habit-color-whole-week');
      colorWholeWeek = chk ? chk.checked : true;
    } else if (freqType === 'monthly') {
      const mDayVal = document.getElementById('habit-monthly-day').value;
      monthlyDay = mDayVal || '1';
      monthlyTarget = parseInt(document.getElementById('habit-monthly-target').value, 10) || 1;
      const chk = document.getElementById('habit-color-whole-month');
      colorWholeMonth = chk ? chk.checked : true;
    } else if (freqType === 'specific_days') {
      const checkedBtns = Array.from(elements.formHabit.querySelectorAll('input[name="target-days"]:checked'));
      targetDays = checkedBtns.map(cb => parseInt(cb.value, 10));
      if (targetDays.length === 0) targetDays = [1];
      weeklyTarget = targetDays.length;
      const chk = document.getElementById('habit-specific-color-whole-week');
      colorWholeWeek = chk ? chk.checked : true;
    } else if (freqType === 'custom_interval') {
      const cTargetInput = document.getElementById('habit-custom-target');
      customTarget = cTargetInput ? (parseInt(cTargetInput.value, 10) || 1) : 1;
      const cIntervalInput = document.getElementById('habit-custom-interval');
      customInterval = cIntervalInput ? (parseInt(cIntervalInput.value, 10) || 3) : 3;
      const cUnitSelect = document.getElementById('habit-custom-unit');
      customUnit = cUnitSelect ? cUnitSelect.value : 'days';
    }

    let colorTheme = typeof Please !== 'undefined' ? Please.make_color({ from_hash: id || name || 'default' }) : 'green';
    if (selectedColorRadio === 'custom') {
      const hexVal = elements.customColorHex.value;
      colorTheme = normalizeHex(hexVal);
    } else {
      colorTheme = selectedColorRadio;
    }

    if (!name) return;

    if (id) {
      const habit = state.habits.find(h => h.id === id);
      if (habit) {
        habit.name = name;
        habit.type = type;
        habit.description = description;
        habit.category = category;
        habit.dailyTarget = dailyTarget;
        habit.showStreak = showStreak;
        setHabitPauseState(habit, isPaused);
        habit.frequencyType = freqType;
        habit.targetDays = targetDays;
        habit.weeklyTarget = weeklyTarget;
        habit.monthlyDay = monthlyDay;
        habit.monthlyTarget = monthlyTarget;
        habit.colorWholeWeek = colorWholeWeek;
        habit.colorWholeMonth = colorWholeMonth;
        habit.customTarget = customTarget;
        habit.customInterval = customInterval;
        habit.customUnit = customUnit;
        habit.colorTheme = colorTheme;
        habit.parentId = parentId;
        habit.parentDependency = parentDependency;

        if (elements.habitEnableBackfill && elements.habitEnableBackfill.checked) {
          const durationVal = elements.habitHistoryDuration ? elements.habitHistoryDuration.value : '30';
          const frequencyVal = elements.habitHistoryFrequency ? elements.habitHistoryFrequency.value : 'frequent';
          const instancesVal = elements.habitHistoryInstances ? elements.habitHistoryInstances.value : '1';

          const result = generateBackfillLogs(durationVal, frequencyVal, instancesVal, dailyTarget, type, freqType, targetDays, monthlyDay, monthlyTarget, weeklyTarget);
          if (!habit.logs) habit.logs = {};

          Object.keys(result.logs).forEach(dateKey => {
            if (!habit.logs[dateKey]) {
              habit.logs[dateKey] = result.logs[dateKey];
            }
          });

          if (!habit.createdAt || result.startDateKey < habit.createdAt) {
            habit.createdAt = result.startDateKey;
          }
        }
      }
    } else {
      let backfilledLogs = {};
      let createdAtKey = getTodayKey();

      if (elements.habitEnableBackfill && elements.habitEnableBackfill.checked) {
        const durationVal = elements.habitHistoryDuration ? elements.habitHistoryDuration.value : '30';
        const frequencyVal = elements.habitHistoryFrequency ? elements.habitHistoryFrequency.value : 'frequent';
        const instancesVal = elements.habitHistoryInstances ? elements.habitHistoryInstances.value : '1';

        const result = generateBackfillLogs(durationVal, frequencyVal, instancesVal, dailyTarget, type, freqType, targetDays, monthlyDay, monthlyTarget, weeklyTarget);
        backfilledLogs = result.logs;
        createdAtKey = result.startDateKey;
      }

      const newHabit = {
        id: (parentId ? parentId + '_' : '') + idFromName(name),
        name,
        type,
        description,
        category,
        showStreak,
        isPaused,
        pauseHistory: isPaused ? [{ startDate: getTodayKey(), endDate: null }] : [],
        colorTheme,
        dailyTarget,
        frequencyType: freqType,
        targetDays,
        weeklyTarget,
        monthlyDay,
        monthlyTarget,
        colorWholeWeek,
        colorWholeMonth,
        customTarget,
        customInterval,
        customUnit,
        parentId,
        parentDependency,
        createdAt: createdAtKey,
        logs: backfilledLogs
      };
      state.habits.push(newHabit);
      state.selectedHabitId = newHabit.id;
    }

    saveState();
    elements.modalHabit.classList.add('hidden');
    renderAll();

    if (pendingQuickLogAfterHabit) {
      pendingQuickLogAfterHabit = false;
      const createdHabitId = id || (state.habits.length > 0 ? state.habits[state.habits.length - 1].id : null);
      openLogModal(activeLogDateKey || getTodayKey(), createdHabitId);
    }
  }

  function deleteHabit(habitId) {
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;

    const subHabits = state.habits.filter(h => h.parentId === habitId);
    let msg = `Are you sure you want to delete "${habit.name}"?`;
    if (subHabits.length > 0) {
      msg += ` Its ${subHabits.length} sub-habit(s) will become top-level habits.`;
    }

    if (confirm(msg)) {
      state.habits = state.habits.filter(h => h.id !== habitId);
      subHabits.forEach(sub => {
        sub.parentId = habit.parentId || null;
      });

      saveState();

      const route = parseHash();
      if (route.view === 'habit' && route.habitId === habitId) {
        if (habit.parentId) {
          navigateTo(`#/habit/${habit.parentId}`);
        } else {
          navigateTo('#/');
        }
      } else {
        renderAll();
      }
      showToast(`Deleted "${habit.name}"`);
    }
  }

  function deleteSelectedHabit() {
    if (state.selectedHabitId === 'all') return;
    deleteHabit(state.selectedHabitId);
  }

  // LOG MODAL HANDLERS
  let activeLogDateKey = null;

  function openLogModal(dateStr, preferredHabitId = null) {
    activeLogDateKey = dateStr;

    if (state.habits.length === 0) {
      pendingQuickLogAfterHabit = true;
      openHabitModal();
      return;
    }

    if (elements.modalLogDateInput) {
      elements.modalLogDateInput.value = dateStr;
    }

    let habitSelectHTML = '';
    function appendLogOptions(parentId = null, depth = 0) {
      const children = state.habits.filter(h => (h.parentId || null) === parentId);
      children.forEach(h => {
        const indent = '&nbsp;&nbsp;'.repeat(depth) + (depth > 0 ? '↳ ' : '');
        const icon = h.type === 'negative' ? '🛑 ' : '';
        const pausedSuffix = h.isPaused ? ' (Paused)' : '';
        const pageId = (typeof window !== 'undefined' && window.location) ? window.location.toString().split("/").slice(-1)[0] : '';
        if (pageId == h.id) {
          habitSelectHTML += `<option value="${h.id}" selected>${indent}${icon}${escapeHTML(h.name)}${pausedSuffix}</option>`;
        } else {
          habitSelectHTML += `<option value="${h.id}">${indent}${icon}${escapeHTML(h.name)}${pausedSuffix}</option>`;
        }
        appendLogOptions(h.id, depth + 1);
      });
    }
    appendLogOptions(null, 0);

    if (elements.modalLogHabitSelect) {
      elements.modalLogHabitSelect.innerHTML = habitSelectHTML || '<option value="">No habits</option>';

      let targetId = (preferredHabitId && preferredHabitId !== 'all' && !preferredHabitId.startsWith('group_')) ? preferredHabitId : state.selectedHabitId;
      if (targetId !== 'all' && state.habits.some(h => h.id === targetId)) {
        elements.modalLogHabitSelect.value = targetId;
      }
    }

    loadLogModalValues();
    if (elements.modalLogHabitSelect) {
      elements.modalLogHabitSelect.onchange = () => loadLogModalValues();
    }

    if (elements.modalLogShowOnStartup) {
      elements.modalLogShowOnStartup.checked = !!state.showQuickLogOnStartup;
    }

    if (elements.modalLog) {
      elements.modalLog.classList.remove('hidden');
    }
  }

  function shiftModalLogDate(days) {
    if (!activeLogDateKey) activeLogDateKey = getTodayKey();
    const d = parseDateKey(activeLogDateKey);
    d.setDate(d.getDate() + days);
    activeLogDateKey = formatDateKey(d);
    if (elements.modalLogDateInput) {
      elements.modalLogDateInput.value = activeLogDateKey;
    }
    loadLogModalValues();
  }

  function updateReminderLinks(habitName, dateStr) {
    const cleanDate = dateStr.replace(/-/g, '');
    const gCalStart = `${cleanDate}T090000`;
    const gCalEnd = `${cleanDate}T093000`;
    const title = encodeURIComponent(`Habit Reminder: ${habitName}`);
    const details = encodeURIComponent(`Reminder to complete habit "${habitName}" in Habitual.`);
    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${gCalStart}/${gCalEnd}&details=${details}`;

    const linkGCal = document.getElementById('link-modal-google-cal');
    if (linkGCal) {
      linkGCal.href = gCalUrl;
    }
  }

  function generateICSFile(habitName, dateStr) {
    const cleanDate = dateStr.replace(/-/g, '');
    const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const uid = `habitual-${Date.now()}-${cleanDate}@habitual.app`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Habitual//Habit Tracker//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowIso}`,
      `DTSTART:${cleanDate}T090000`,
      `DTEND:${cleanDate}T093000`,
      `SUMMARY:Habit Reminder: ${habitName}`,
      `DESCRIPTION:Reminder to log habit "${habitName}" in Habitual.`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder to log habit "${habitName}"`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return icsContent;
  }

  function downloadICSReminder(habitName, dateStr) {
    const icsData = generateICSFile(habitName, dateStr);
    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sanitizedName = habitName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    a.download = `${sanitizedName}_reminder_${dateStr}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function loadLogModalValues() {
    if (!elements.modalLogHabitSelect) return;
    const habitId = elements.modalLogHabitSelect.value;
    const habit = state.habits.find(h => h.id === habitId);

    const countLabel = document.getElementById('modal-log-count-label');
    const countHint = document.getElementById('modal-log-count-hint');

    if (countLabel) {
      if (habit && habit.type === 'negative') {
        countLabel.textContent = 'Relapse / Slip Count';
      } else {
        countLabel.textContent = 'Completion Count';
      }
    }
    if (countHint) {
      if (habit && habit.type === 'negative') {
        countHint.textContent = '0 = Clean Day Success. 1+ = Relapse/Slip occurred.';
      } else {
        countHint.textContent = 'Number of times target was completed on this day.';
      }
    }

    if (habit && habit.logs && habit.logs[activeLogDateKey]) {
      elements.modalLogCount.value = habit.logs[activeLogDateKey].count || 0;
      elements.modalLogNote.value = habit.logs[activeLogDateKey].note || '';
    } else {
      elements.modalLogCount.value = (habit && habit.type === 'negative') ? 0 : 1;
      elements.modalLogNote.value = '';
    }

    // Future Date Reminder Section
    const todayStr = getTodayKey();
    const reminderBox = document.getElementById('modal-log-reminder-box');
    if (reminderBox) {
      if (activeLogDateKey > todayStr) {
        reminderBox.classList.remove('hidden');
        updateReminderLinks(habit ? habit.name : 'Habit', activeLogDateKey);
      } else {
        reminderBox.classList.add('hidden');
      }
    }
  }

  function handleSaveLog() {
    const habitId = elements.modalLogHabitSelect.value;
    const habit = state.habits.find(h => h.id === habitId);

    if (!habit) return;
    if (!habit.logs) habit.logs = {};

    const count = parseInt(elements.modalLogCount.value, 10) || 0;
    const note = elements.modalLogNote.value.trim();

    habit.logs[activeLogDateKey] = { count, note };

    applyParentDependencyOnLog(habit, activeLogDateKey, count);

    saveState();
    elements.modalLog.classList.add('hidden');
    renderAll();
  }

  function handleClearLog() {
    const habitId = elements.modalLogHabitSelect.value;
    const habit = state.habits.find(h => h.id === habitId);

    if (habit && habit.logs && habit.logs[activeLogDateKey]) {
      delete habit.logs[activeLogDateKey];
      saveState();
      elements.modalLog.classList.add('hidden');
      renderAll();
    }
  }

  function exportDataJSON() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `habitual_backup_${getTodayKey()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function importDataJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported && Array.isArray(imported.habits)) {
          state = imported;
          saveState();
          renderAll();
          showToast('JSON Backup restored successfully!');
          elements.modalData.classList.add('hidden');
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Failed to parse backup JSON file.');
      }
    };
    reader.readAsText(file);
  }

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- CORE EXPORTS FOR TESTING ---
  const HabitualCore = {
    getState: () => state,
    setState: (newState) => { state = newState; },
    resetState: () => {
      state = {
        habits: [],
        selectedHabitId: 'all',
        selectedYear: CURRENT_YEAR,
        showQuickLogOnStartup: false
      };
    },
    loadState,
    saveState,
    formatDateKey,
    parseDateKey,
    parseFlexibleDate,
    getTodayKey,
    getDaysAgoKey,
    idFromName,
    nameFromId,
    deriveNameFromId,
    getDefaultColorForId,
    parseHexColor,
    blendColors,
    getCustomThemeLevels,
    getHabitHexColor,
    getHabitLevelColor,
    getHabitHexWithAlpha,
    normalizeHex,
    updateBackfillWordingUI,
    getCellData,
    getWeekRangeForDate,
    getMonthRangeForDate,
    getWeeklyLogCount,
    getMonthlyLogCount,
    getWeeklyActiveDaysCount,
    calculateStreakForTarget,
    calculateYearStatsForTarget,
    getAncestryChain,
    getAllDescendantIds,
    parseCSVLine,
    parseCSVAndImport,
    generateBackfillLogs,
    applyParentDependencyOnLog,
    toggleHabitForDate,
    setHabitPauseState,
    isHabitPausedOnDate,
    openHabitModal,
    handleHabitNameBlur,
    handleHabitFormSubmit,
    openLogModal,
    shiftModalLogDate,
    updateReminderLinks,
    generateICSFile,
    downloadICSReminder,
    attachHeatmapSquareEvents,
    getElements: () => elements,
    initUI,
    parseHash,
    navigateTo,
    escapeHTML,
    COLOR_PALETTE,
    PRESET_THEME_HEX
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HabitualCore;
  }
  if (typeof window !== 'undefined') {
    window.HabitualCore = HabitualCore;
  }

})();

