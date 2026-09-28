/**
 * Habitual - Minimalist Habit Progress Visualizer
 * Vanilla JavaScript & LocalStorage Implementation with Pure Heatmap Mode, Interactive Day Focus & Starting History Backfill
 */

(function () {
  'use strict';

  // --- LOCAL STORAGE & STATE CONFIG ---
  const STORAGE_KEY = 'habitual_tracker_v1';
  const CURRENT_YEAR = new Date().getFullYear();

  let state = {
    habits: [],
    selectedHabitId: 'all',
    selectedYear: CURRENT_YEAR
  };

  let activeCalendarHabit = null;
  let focusedDayState = { habitId: null, dateStr: null };

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

  function getHabitHexColor(habit) {
    if (!habit || !habit.colorTheme) return PRESET_THEME_HEX.green;
    if (habit.colorTheme.startsWith('#')) return habit.colorTheme;
    return PRESET_THEME_HEX[habit.colorTheme] || PRESET_THEME_HEX.green;
  }

  // --- STARTING POINT HISTORY BACKFILL GENERATOR ---
  function generateBackfillLogs(type, dailyTarget, durationOption, frequencyOption) {
    const logs = {};
    const today = new Date();

    let days = 30;
    if (durationOption === '3_months') days = 90;
    else if (durationOption === '6_months') days = 180;
    else if (durationOption === 'year') days = 365;

    let prob = 0.8;
    if (frequencyOption === 'daily') prob = 1.0;
    else if (frequencyOption === 'frequent') prob = 0.8;
    else if (frequencyOption === 'moderate') prob = 0.5;
    else if (frequencyOption === 'occasional') prob = 0.25;

    const startDate = new Date();
    startDate.setDate(today.getDate() - days);

    let cur = new Date(startDate);
    while (cur <= today) {
      const dateKey = formatDateKey(cur);

      if (type === 'negative') {
        if (Math.random() >= prob) {
          logs[dateKey] = { count: 1, note: 'Relapse' };
        }
      } else {
        if (Math.random() < prob) {
          const targetVal = Math.max(1, dailyTarget || 1);
          const count = Math.min(targetVal, Math.floor(Math.random() * targetVal) + 1);
          logs[dateKey] = { count: count, note: '' };
        }
      }

      cur.setDate(cur.getDate() + 1);
    }

    return logs;
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

  function normalizeHex(hexStr) {
    const parsed = parseHexColor(hexStr);
    if (!parsed) return '#39d353';
    return `#${((1 << 24) + (parsed.r << 16) + (parsed.g << 8) + parsed.b).toString(16).slice(1)}`;
  }

  // --- INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initUI();
    registerServiceWorker();
    renderAll();
  });

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
        state.habits = parsed.habits || [];
        state.selectedHabitId = parsed.selectedHabitId || 'all';
        state.selectedYear = parsed.selectedYear || CURRENT_YEAR;
      }
    } catch (e) {
      console.error('Failed to load state from LocalStorage:', e);
      state.habits = [];
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  function parseCSVAndImport(csvText, sourceName = 'CSV') {
    if (!csvText) return;

    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      alert('CSV file appears empty or missing rows.');
      return;
    }

    function parseCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
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

  // --- AUTOMATIC DEMO / LOCAL CSV LOADER ---
  function loadHelloHabitCSV(showConfirm = true) {
    if (showConfirm && state.habits.length > 0) {
      if (!confirm('Import hellohabit_habit_activity.csv into your tracker? Existing data will be preserved and merged.')) {
        return;
      }
    }

    fetch('hellohabit_habit_activity.csv')
      .then(res => {
        if (!res.ok) throw new Error('File not found');
        return res.text();
      })
      .then(text => {
        parseCSVAndImport(text, 'hellohabit_habit_activity.csv');
      })
      .catch(err => {
        console.warn('Could not fetch hellohabit_habit_activity.csv directly, generating default demo data:', err);
        seedDemoData(true);
      });
  }

  // --- DEMO DATA SEEDER ---
  function seedDemoData(force = true) {
    if (!force && state.habits.length > 0) return;

    const today = new Date();
    const currentYear = today.getFullYear();

    function generateLogs(frequencyRatio, maxCount = 2) {
      const logs = {};
      const startDate = new Date(currentYear, 0, 1);
      const endDate = new Date();

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (Math.random() < frequencyRatio) {
          const dateKey = formatDateKey(d);
          const count = Math.floor(Math.random() * maxCount) + 1;
          logs[dateKey] = {
            count: count,
            note: Math.random() < 0.2 ? '30 min session' : ''
          };
        }
      }
      return logs;
    }

    state.habits = [
      {
        id: 'habit_demo_1',
        name: 'Gym & Workout 🏋️',
        description: '30 mins cardio, gym, or strength routine',
        category: 'Health',
        type: 'positive',
        colorTheme: 'green',
        dailyTarget: 1,
        createdAt: `${currentYear}-01-01`,
        logs: generateLogs(0.65, 2)
      },
      {
        id: 'habit_demo_2',
        name: 'Create Art & Design 🎨',
        description: 'Draw, design or practice creative work',
        category: 'Creativity',
        type: 'positive',
        colorTheme: '#a855f7',
        dailyTarget: 1,
        createdAt: `${currentYear}-01-01`,
        logs: generateLogs(0.5, 2)
      },
      {
        id: 'habit_demo_3',
        name: 'Swim (swims) 🏊',
        description: 'Swimming laps or water exercise',
        category: 'Health',
        type: 'positive',
        colorTheme: 'cyan',
        dailyTarget: 1,
        createdAt: `${currentYear}-01-01`,
        logs: generateLogs(0.4, 2)
      },
      {
        id: 'habit_demo_4',
        name: 'Days since Caffeine ☕',
        description: 'Track clean days without caffeine relapse',
        category: 'Wellness',
        type: 'negative',
        colorTheme: 'amber',
        dailyTarget: 1,
        createdAt: `${currentYear}-01-01`,
        logs: {
          [`${currentYear}-02-15`]: { count: 1, note: 'Had 1 espresso' },
          [`${currentYear}-05-10`]: { count: 1, note: 'Coffee relapse' }
        }
      }
    ];

    state.selectedHabitId = 'all';
    state.selectedYear = currentYear;
    saveState();
    renderAll();
  }

  // --- DOM ELEMENTS & EVENT LISTENERS ---
  const elements = {};

  function initUI() {
    elements.yearSelector = document.getElementById('year-selector');
    elements.heatmapsGallery = document.getElementById('heatmaps-gallery');
    elements.customTooltip = document.getElementById('custom-tooltip');

    // Modals
    elements.modalHabit = document.getElementById('modal-habit');
    elements.formHabit = document.getElementById('form-habit');
    elements.modalHabitTitle = document.getElementById('modal-habit-title');

    elements.customColorPicker = document.getElementById('habit-custom-color-picker');
    elements.customColorHex = document.getElementById('habit-custom-color-hex');
    elements.radioColorCustom = document.getElementById('radio-color-custom');
    elements.customSwatchPreview = document.getElementById('custom-swatch-preview');

    elements.backfillSection = document.getElementById('backfill-section');
    elements.habitEnableBackfill = document.getElementById('habit-enable-backfill');
    elements.backfillOptionsContainer = document.getElementById('backfill-options-container');
    elements.habitHistoryDuration = document.getElementById('habit-history-duration');
    elements.habitHistoryFrequency = document.getElementById('habit-history-frequency');

    elements.modalCalendarPicker = document.getElementById('modal-calendar-picker');
    elements.modalCalendarBadge = document.getElementById('modal-calendar-habit-badge');
    elements.calendarInputDate = document.getElementById('calendar-input-date');

    elements.modalLog = document.getElementById('modal-log');
    elements.modalLogDateStr = document.getElementById('modal-log-date-str');
    elements.modalLogHabitSelect = document.getElementById('modal-log-habit-select');
    elements.modalLogCount = document.getElementById('modal-log-count');
    elements.modalLogNote = document.getElementById('modal-log-note');

    elements.modalData = document.getElementById('modal-data');

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

    // History Backfill Toggle
    if (elements.habitEnableBackfill && elements.backfillOptionsContainer) {
      elements.habitEnableBackfill.addEventListener('change', (e) => {
        if (e.target.checked) {
          elements.backfillOptionsContainer.classList.remove('hidden');
        } else {
          elements.backfillOptionsContainer.classList.add('hidden');
        }
      });
    }

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
    document.getElementById('modal-habit-close').addEventListener('click', () => elements.modalHabit.classList.add('hidden'));
    document.getElementById('btn-cancel-habit').addEventListener('click', () => elements.modalHabit.classList.add('hidden'));
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
        renderAll();
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
    renderYearSelector();
    renderHeatmapsGallery();
  }

  function toggleHabitForDate(habitId, dateKey) {
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;

    if (!habit.logs) habit.logs = {};

    const currentLog = habit.logs[dateKey];
    const currentCount = currentLog ? currentLog.count : 0;
    const currentNote = currentLog ? currentLog.note : '';

    if (habit.type === 'negative') {
      if (currentCount === 0) {
        habit.logs[dateKey] = { count: 1, note: currentNote || 'Relapse logged' };
      } else {
        habit.logs[dateKey] = { count: 0, note: '' };
      }
    } else {
      if (currentCount >= (habit.dailyTarget || 1)) {
        habit.logs[dateKey] = { count: 0, note: currentNote };
      } else {
        habit.logs[dateKey] = { count: (habit.dailyTarget || 1), note: currentNote };
      }
    }

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

  // --- HEATMAP GALLERY RENDERER & CONTEXTUAL DAY FOCUS ---
  function renderHeatmapsGallery() {
    elements.heatmapsGallery.innerHTML = '';

    if (state.habits.length === 0) {
      elements.heatmapsGallery.innerHTML = `
        <div class="empty-placeholder">
          No habits created yet. Click "+ New Habit" or "Import CSV" in the Menu to start!
        </div>
      `;
      return;
    }

    const combinedCard = buildHeatmapCard(null, state.selectedYear);
    elements.heatmapsGallery.appendChild(combinedCard);

    state.habits.forEach(habit => {
      const habitCard = buildHeatmapCard(habit, state.selectedYear);
      elements.heatmapsGallery.appendChild(habitCard);
    });

    attachHeatmapSquareEvents();
    attachCardDragAndDropHandlers();
  }

  function buildHeatmapCard(habitOrNull, year) {
    const isAll = habitOrNull === null;
    const habit = habitOrNull;
    const cardHabitId = isAll ? 'all' : habit.id;

    const isCustomHex = habit && habit.colorTheme && habit.colorTheme.startsWith('#');
    const theme = isAll ? 'green' : (isCustomHex ? 'custom' : (habit.colorTheme || 'green'));
    const isNegative = habit && habit.type === 'negative';

    const isCardFocused = focusedDayState.habitId === cardHabitId && focusedDayState.dateStr;

    const streakData = calculateStreakForTarget(isAll ? 'all' : habit);
    const stats = calculateYearStatsForTarget(isAll ? 'all' : habit, year);

    const card = document.createElement('div');
    card.className = `heatmap-card theme-${theme} ${isAll ? '' : 'draggable-card'} ${isCardFocused ? 'focused' : ''}`;

    if (!isAll) {
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-habit-id', habit.id);
    }

    if (isCustomHex) {
      const levels = getCustomThemeLevels(habit.colorTheme);
      card.style.setProperty('--custom-level-0', levels.level0);
      card.style.setProperty('--custom-level-1', levels.level1);
      card.style.setProperty('--custom-level-2', levels.level2);
      card.style.setProperty('--custom-level-3', levels.level3);
      card.style.setProperty('--custom-level-4', levels.level4);
    }

    const title = isAll ? 'Combined Contribution Map' : habit.name;
    const streakLabel = streakData.current > 0 ? `🔥 ${streakData.current}d streak` : '';
    const countLabel = isNegative ? `${stats.totalCount} clean days in ${year}` : `${stats.totalCount} completions in ${year}`;

    const colorBadgeStyle = isAll
      ? 'background-color: #39d353;'
      : `background-color: ${getHabitHexColor(habit)};`;

    const dragHandleHTML = !isAll ? `
      <div class="drag-handle" title="Drag to reorder habit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
      </div>
    ` : '';

    let headerHTML = `
      <div class="heatmap-card-header">
        <div class="heatmap-title-row">
          <span class="color-badge" style="${colorBadgeStyle}"></span>
          <h3>${escapeHTML(title)}</h3>
          ${streakLabel ? `<span class="badge-streak">${streakLabel}</span>` : ''}
          <span class="badge-count">${countLabel}</span>
        </div>
        <div class="card-header-actions">
          ${dragHandleHTML}
        </div>
      </div>
    `;

    // Contextual Quick-Add Toolbar for Tapped Day
    let focusedToolbarHTML = '';
    if (isCardFocused && focusedDayState.dateStr) {
      const focusDateKey = focusedDayState.dateStr;
      const prettyDate = formatPrettyDate(focusDateKey);

      let actionButtonsHTML = '';

      if (isAll) {
        state.habits.forEach(h => {
          const hex = getHabitHexColor(h);
          const log = h.logs ? h.logs[focusDateKey] : null;

          let isDone = false;
          let labelText = '';

          if (h.type === 'negative') {
            const isClean = !log || log.count === 0;
            isDone = isClean;
            labelText = isClean ? `✨ ${h.name}` : `⚠️ Slip ${h.name}`;
          } else {
            isDone = log && log.count >= (h.dailyTarget || 1);
            labelText = isDone ? `✓ ${h.name}` : `+ ${h.name}`;
          }

          actionButtonsHTML += `
            <button type="button" class="btn btn-secondary quick-log-btn ${isDone ? 'completed' : ''}"
                    style="--quick-btn-color: ${hex};"
                    data-action-habit-id="${h.id}"
                    data-action-date-key="${focusDateKey}">
              ${escapeHTML(labelText)}
            </button>
          `;
        });
      } else if (habit) {
        const hex = getHabitHexColor(habit);
        const log = habit.logs ? habit.logs[focusDateKey] : null;

        let isDone = false;
        let labelText = '';

        if (habit.type === 'negative') {
          const isClean = !log || log.count === 0;
          isDone = isClean;
          labelText = isClean ? `✨ ${habit.name}` : `⚠️ Slip ${habit.name}`;
        } else {
          isDone = log && log.count >= (habit.dailyTarget || 1);
          labelText = isDone ? `✓ ${habit.name}` : `+ ${habit.name}`;
        }

        actionButtonsHTML += `
          <button type="button" class="btn btn-secondary quick-log-btn ${isDone ? 'completed' : ''}"
                  style="--quick-btn-color: ${hex};"
                  data-action-habit-id="${habit.id}"
                  data-action-date-key="${focusDateKey}">
            ${escapeHTML(labelText)}
          </button>
        `;
      }

      focusedToolbarHTML = `
        <div class="focused-day-toolbar">
          <div class="focused-date-title">📅 ${prettyDate}</div>
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

    const monthLabels = [];
    let lastMonth = -1;

    weekColumns.forEach((week, colIndex) => {
      week.forEach(d => {
        if (d.getFullYear() === year) {
          const m = d.getMonth();
          if (m !== lastMonth && d.getDate() <= 7) {
            monthLabels.push({
              name: d.toLocaleDateString('en-US', { month: 'short' }),
              colIndex: colIndex
            });
            lastMonth = m;
          }
        }
      });
    });

    let monthsHTML = '<div class="heatmap-months-row"><span></span>';
    monthLabels.forEach(m => {
      monthsHTML += `<span class="month-label" style="grid-column: ${m.colIndex + 2};">${m.name}</span>`;
    });
    monthsHTML += '</div>';

    let gridHTML = '<div class="heatmap-body">';
    gridHTML += `
      <div class="heatmap-days-col">
        <span class="day-label">Sun</span>
        <span class="day-label">Mon</span>
        <span class="day-label">Tue</span>
        <span class="day-label">Wed</span>
        <span class="day-label">Thu</span>
        <span class="day-label">Fri</span>
        <span class="day-label">Sat</span>
      </div>
    `;

    gridHTML += `<div class="heatmap-weeks-grid theme-${theme}">`;
    const todayStr = getTodayKey();

    weekColumns.forEach(week => {
      gridHTML += '<div class="heatmap-week-column">';
      week.forEach(d => {
        const dateStr = formatDateKey(d);
        const isCurrentYear = d.getFullYear() === year;

        if (!isCurrentYear) {
          gridHTML += '<div class="day-square level-0" style="opacity: 0.12;"></div>';
          return;
        }

        const cellData = getCellData(dateStr, habit, todayStr);
        const isToday = dateStr === todayStr;

        let squareStyle = '';
        let habitsDoneAttr = '';

        if (isAll) {
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

        gridHTML += `
          <div class="day-square level-${cellData.level} ${cellData.isRelapse ? 'relapse' : ''} ${isToday ? 'today' : ''}"
               style="${squareStyle}"
               data-date="${dateStr}"
               data-habit-id="${cardHabitId}"
               data-count="${cellData.count}"
               data-level="${cellData.level}"
               data-relapse="${cellData.isRelapse ? 'true' : 'false'}"
               data-note="${escapeHTML(cellData.note)}"
               ${habitsDoneAttr}>
          </div>
        `;
      });
      gridHTML += '</div>';
    });

    gridHTML += '</div></div>';

    const legendLess = isNegative ? 'Relapse' : 'Less';
    const legendMore = isNegative ? 'Clean Day' : 'More';

    let footerHTML = `
      <div class="heatmap-footer">
        <span>Click any square to record progress or notes</span>
        <div class="heatmap-legend">
          <span>${legendLess}</span>
          <div class="legend-cells theme-${theme}">
            <span class="legend-cell level-0"></span>
            <span class="legend-cell level-1"></span>
            <span class="legend-cell level-2"></span>
            <span class="legend-cell level-3"></span>
            <span class="legend-cell level-4"></span>
          </div>
          <span>${legendMore}</span>
        </div>
      </div>
    `;

    card.innerHTML = headerHTML + focusedToolbarHTML + `<div class="heatmap-wrapper"><div class="heatmap-grid-container">${monthsHTML}${gridHTML}</div></div>` + footerHTML;
    return card;
  }

  function getCellData(dateStr, habit, todayStr) {
    if (!habit) {
      const activeHabits = [];

      state.habits.forEach(h => {
        let isDone = false;
        if (h.type === 'negative') {
          if (!h.logs || !h.logs[dateStr] || h.logs[dateStr].count === 0) {
            if (dateStr <= todayStr) isDone = true;
          }
        } else if (h.logs && h.logs[dateStr] && h.logs[dateStr].count > 0) {
          isDone = true;
        }

        if (isDone) {
          activeHabits.push({
            id: h.id,
            name: h.name,
            color: getHabitHexColor(h)
          });
        }
      });

      let level = 0;
      if (activeHabits.length === 0) level = 0;
      else if (activeHabits.length <= 2) level = 1;
      else if (activeHabits.length <= 4) level = 2;
      else if (activeHabits.length <= 6) level = 3;
      else level = 4;

      return {
        count: activeHabits.length,
        level: level,
        activeHabits,
        isRelapse: false,
        note: ''
      };
    }

    const log = (habit.logs && habit.logs[dateStr]) ? habit.logs[dateStr] : null;

    if (habit.type === 'negative') {
      if (log && log.count > 0) {
        return { count: log.count, level: 0, isRelapse: true, note: log.note || 'Relapse logged' };
      }
      if (dateStr <= todayStr) {
        return { count: 1, level: 3, isRelapse: false, note: 'Clean day' };
      }
      return { count: 0, level: 0, isRelapse: false, note: '' };
    }

    const count = log ? log.count : 0;
    const note = log ? log.note : '';
    let level = 0;

    if (count === 0) level = 0;
    else if (count === 1) level = 1;
    else if (count === 2) level = 2;
    else if (count === 3) level = 3;
    else level = 4;

    return { count, level, isRelapse: false, note };
  }

  function calculateStreakForTarget(target) {
    const today = new Date();

    if (target !== 'all' && target && target.type === 'negative') {
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
      return { current: currentStreak };
    }

    const activeDateMap = {};
    if (target === 'all') {
      state.habits.forEach(h => {
        if (h.logs) {
          Object.keys(h.logs).forEach(dateStr => {
            if (h.logs[dateStr] && h.logs[dateStr].count > 0) {
              activeDateMap[dateStr] = true;
            }
          });
        }
      });
    } else if (target && target.logs) {
      Object.keys(target.logs).forEach(dateStr => {
        if (target.logs[dateStr] && target.logs[dateStr].count > 0) {
          activeDateMap[dateStr] = true;
        }
      });
    }

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

    return { current: currentStreak };
  }

  function calculateYearStatsForTarget(target, year) {
    let totalCount = 0;
    const now = new Date();

    if (target !== 'all' && target && target.type === 'negative') {
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
      const processLog = (dateStr, logObj) => {
        if (dateStr.startsWith(`${year}-`) && logObj && logObj.count > 0) {
          totalCount += logObj.count;
        }
      };

      if (target === 'all') {
        state.habits.forEach(h => {
          if (h.logs) {
            Object.entries(h.logs).forEach(([dateStr, log]) => processLog(dateStr, log));
          }
        });
      } else if (target && target.logs) {
        Object.entries(target.logs).forEach(([dateStr, log]) => processLog(dateStr, log));
      }
    }

    return { totalCount };
  }

  function attachHeatmapSquareEvents() {
    const squares = elements.heatmapsGallery.querySelectorAll('.day-square[data-date]');

    squares.forEach(sq => {
      sq.addEventListener('mouseenter', (e) => {
        const dateStr = sq.dataset.date;
        const habitId = sq.dataset.habitId;
        const count = parseInt(sq.dataset.count, 10) || 0;
        const isRelapse = sq.dataset.relapse === 'true';
        const note = sq.dataset.note;
        const habitsDone = sq.dataset.habitsDone;
        const formattedDate = formatPrettyDate(dateStr);

        let text = '';
        if (isRelapse) {
          text = `⚠️ <strong>Relapse logged</strong> (${note || 'Slip day'}) on ${formattedDate}`;
        } else if (habitId === 'all') {
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
            text = `<strong>${count} completion${count === 1 ? '' : 's'}</strong> on ${formattedDate}`;
          }
        }

        elements.customTooltip.innerHTML = text;
        elements.customTooltip.classList.remove('hidden');

        const rect = sq.getBoundingClientRect();
        elements.customTooltip.style.left = `${rect.left + window.scrollX - 40}px`;
        elements.customTooltip.style.top = `${rect.top + window.scrollY - 34}px`;
      });

      sq.addEventListener('mouseleave', () => {
        elements.customTooltip.classList.add('hidden');
      });

      sq.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.customTooltip.classList.add('hidden');

        const dateStr = sq.dataset.date;
        const habitId = sq.dataset.habitId;

        if (focusedDayState.habitId === habitId && focusedDayState.dateStr === dateStr) {
          focusedDayState = { habitId: null, dateStr: null };
        } else {
          focusedDayState = { habitId: habitId, dateStr: dateStr };
        }

        renderAll();
      });
    });

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
          const fromIndex = state.habits.findIndex(h => h.id === draggedHabitId);
          const toIndex = state.habits.findIndex(h => h.id === targetHabitId);

          if (fromIndex !== -1 && toIndex !== -1) {
            const [movedHabit] = state.habits.splice(fromIndex, 1);
            state.habits.splice(toIndex, 0, movedHabit);
            saveState();
            renderAll();
            showToast(`Reordered "${movedHabit.name}"`);
          }
        }
      });
    });
  }

  // --- MODAL HANDLERS ---
  function openHabitModal(habitToEdit = null) {
    elements.formHabit.reset();

    if (elements.habitEnableBackfill) elements.habitEnableBackfill.checked = false;
    if (elements.backfillOptionsContainer) elements.backfillOptionsContainer.classList.add('hidden');

    if (habitToEdit) {
      if (elements.backfillSection) elements.backfillSection.classList.add('hidden');
      elements.modalHabitTitle.textContent = 'Edit Habit Goal';
      document.getElementById('habit-id').value = habitToEdit.id;
      document.getElementById('habit-name').value = habitToEdit.name;
      document.getElementById('habit-description').value = habitToEdit.description || '';
      document.getElementById('habit-category').value = habitToEdit.category || 'General';
      document.getElementById('habit-daily-target').value = habitToEdit.dailyTarget || 1;

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
      if (elements.backfillSection) elements.backfillSection.classList.remove('hidden');
      elements.modalHabitTitle.textContent = 'Create New Habit';
      document.getElementById('habit-id').value = '';
      elements.customSwatchPreview.style.backgroundColor = 'transparent';
    }

    elements.modalHabit.classList.remove('hidden');
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

    let colorTheme = 'green';
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
        habit.colorTheme = colorTheme;
      }
    } else {
      let initialLogs = {};
      if (elements.habitEnableBackfill && elements.habitEnableBackfill.checked) {
        const duration = elements.habitHistoryDuration.value;
        const frequency = elements.habitHistoryFrequency.value;
        initialLogs = generateBackfillLogs(type, dailyTarget, duration, frequency);
      }

      const newHabit = {
        id: 'habit_' + Date.now(),
        name,
        type,
        description,
        category,
        colorTheme,
        dailyTarget,
        createdAt: getTodayKey(),
        logs: initialLogs
      };
      state.habits.push(newHabit);
      state.selectedHabitId = newHabit.id;

      const logCount = Object.keys(initialLogs).length;
      if (logCount > 0) {
        showToast(`Created "${name}" with ${logCount} days of history backfilled!`);
      }
    }

    saveState();
    elements.modalHabit.classList.add('hidden');
    renderAll();
  }

  function deleteSelectedHabit() {
    if (state.selectedHabitId === 'all') return;
    const habit = state.habits.find(h => h.id === state.selectedHabitId);
    if (!habit) return;

    if (confirm(`Are you sure you want to delete "${habit.name}"? All tracking history for this habit will be removed.`)) {
      state.habits = state.habits.filter(h => h.id !== state.selectedHabitId);
      state.selectedHabitId = 'all';
      saveState();
      renderAll();
    }
  }

  // LOG MODAL HANDLERS
  let activeLogDateKey = null;

  function openLogModal(dateStr, preferredHabitId = null) {
    activeLogDateKey = dateStr;
    elements.modalLogDateStr.textContent = formatPrettyDate(dateStr);

    elements.modalLogHabitSelect.innerHTML = state.habits
      .map(h => `<option value="${h.id}">${h.type === 'negative' ? '🛑 ' : ''}${escapeHTML(h.name)}</option>`)
      .join('');

    let targetId = (preferredHabitId && preferredHabitId !== 'all') ? preferredHabitId : state.selectedHabitId;
    if (targetId !== 'all') {
      elements.modalLogHabitSelect.value = targetId;
    }

    loadLogModalValues();
    elements.modalLogHabitSelect.onchange = () => loadLogModalValues();

    elements.modalLog.classList.remove('hidden');
  }

  function loadLogModalValues() {
    const habitId = elements.modalLogHabitSelect.value;
    const habit = state.habits.find(h => h.id === habitId);

    const countLabel = document.getElementById('modal-log-count-label');
    const countHint = document.getElementById('modal-log-count-hint');

    if (habit && habit.type === 'negative') {
      countLabel.textContent = 'Relapse / Slip Count';
      countHint.textContent = '0 = Clean Day Success. 1+ = Relapse/Slip occurred.';
    } else {
      countLabel.textContent = 'Completion Count';
      countHint.textContent = 'Number of times target was completed on this day.';
    }

    if (habit && habit.logs && habit.logs[activeLogDateKey]) {
      elements.modalLogCount.value = habit.logs[activeLogDateKey].count || 0;
      elements.modalLogNote.value = habit.logs[activeLogDateKey].note || '';
    } else {
      elements.modalLogCount.value = (habit && habit.type === 'negative') ? 0 : 1;
      elements.modalLogNote.value = '';
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

})();
