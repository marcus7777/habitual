/**
 * Habitual - GitHub-Style Habit Progression Engine
 * Vanilla JavaScript & LocalStorage Implementation
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

  // --- INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', () => {
    loadState();
    if (state.habits.length === 0) {
      seedDemoData(false); // Default seed if completely empty
    }
    initUI();
    renderAll();
  });

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
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function getTodayKey() {
    return formatDateKey(new Date());
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

  // --- DEMO DATA SEEDER ---
  function seedDemoData(force = true) {
    if (!force && state.habits.length > 0) return;

    const today = new Date();
    const currentYear = today.getFullYear();

    // Helper to generate realistic contribution activity over the past ~280 days
    function generateLogs(frequencyRatio, maxCount = 2) {
      const logs = {};
      const startDate = new Date(currentYear, 0, 1);
      const endDate = new Date();

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // Higher probability on weekdays or realistic random distribution
        if (Math.random() < frequencyRatio) {
          const dateKey = formatDateKey(d);
          const count = Math.floor(Math.random() * maxCount) + 1;
          const notes = [
            'Made solid progress today!',
            '30 min focused session',
            'Completed daily target',
            'High energy day',
            'Quick check-in'
          ];
          logs[dateKey] = {
            count: count,
            note: Math.random() < 0.25 ? notes[Math.floor(Math.random() * notes.length)] : ''
          };
        }
      }
      return logs;
    }

    state.habits = [
      {
        id: 'habit_' + Date.now() + '_1',
        name: 'Daily Code & Build',
        description: 'Ship code or learn new tech for 1 hour every day',
        category: 'Development',
        colorTheme: 'green',
        dailyTarget: 1,
        createdAt: `${currentYear}-01-01`,
        logs: generateLogs(0.72, 3)
      },
      {
        id: 'habit_' + Date.now() + '_2',
        name: 'Exercise & Workout',
        description: '30 mins cardio, gym, or mobility routine',
        category: 'Health',
        colorTheme: 'orange',
        dailyTarget: 1,
        createdAt: `${currentYear}-01-01`,
        logs: generateLogs(0.55, 2)
      },
      {
        id: 'habit_' + Date.now() + '_3',
        name: 'Read Technical / Books',
        description: 'Read 20 pages of a book or documentation',
        category: 'Learning',
        colorTheme: 'purple',
        dailyTarget: 1,
        createdAt: `${currentYear}-01-01`,
        logs: generateLogs(0.65, 2)
      },
      {
        id: 'habit_' + Date.now() + '_4',
        name: 'Hydration (2L Water)',
        description: 'Drink at least 2 liters of water daily',
        category: 'Wellness',
        colorTheme: 'cyan',
        dailyTarget: 2,
        createdAt: `${currentYear}-01-01`,
        logs: generateLogs(0.82, 2)
      }
    ];

    state.selectedHabitId = 'all';
    state.selectedYear = currentYear;
    saveState();
  }

  // --- DOM ELEMENTS & EVENT LISTENERS ---
  const elements = {};

  function initUI() {
    // Cache Elements
    elements.habitPills = document.getElementById('habit-pills');
    elements.activeHabitTitle = document.getElementById('active-habit-title');
    elements.activeHabitDesc = document.getElementById('active-habit-desc');
    elements.activeHabitColorIndicator = document.getElementById('active-habit-color-indicator');
    elements.activeHabitActions = document.getElementById('active-habit-actions');

    elements.statCurrentStreak = document.getElementById('stat-current-streak');
    elements.statStreakSub = document.getElementById('stat-streak-sub');
    elements.statLongestStreak = document.getElementById('stat-longest-streak');
    elements.statTotalCompletions = document.getElementById('stat-total-completions');
    elements.statYearSub = document.getElementById('stat-year-sub');
    elements.statConsistency = document.getElementById('stat-consistency');
    elements.statConsistencySub = document.getElementById('stat-consistency-sub');

    elements.heatmapHeading = document.getElementById('heatmap-heading');
    elements.heatmapSummaryCount = document.getElementById('heatmap-summary-count');
    elements.yearSelector = document.getElementById('year-selector');
    elements.heatmapGridContainer = document.getElementById('heatmap-grid-container');
    elements.legendCells = document.getElementById('legend-cells');

    elements.todayDateDisplay = document.getElementById('today-date-display');
    elements.todayHabitsList = document.getElementById('today-habits-list');
    elements.recentNotesList = document.getElementById('recent-notes-list');

    elements.customTooltip = document.getElementById('custom-tooltip');

    // Modals
    elements.modalHabit = document.getElementById('modal-habit');
    elements.formHabit = document.getElementById('form-habit');
    elements.modalHabitTitle = document.getElementById('modal-habit-title');

    elements.modalLog = document.getElementById('modal-log');
    elements.modalLogDateStr = document.getElementById('modal-log-date-str');
    elements.modalLogHabitSelect = document.getElementById('modal-log-habit-select');
    elements.modalLogCount = document.getElementById('modal-log-count');
    elements.modalLogNote = document.getElementById('modal-log-note');

    elements.modalData = document.getElementById('modal-data');

    // Attach Event Handlers
    document.getElementById('btn-add-habit').addEventListener('click', () => openHabitModal());
    document.getElementById('btn-edit-habit').addEventListener('click', () => {
      if (state.selectedHabitId !== 'all') {
        const habit = state.habits.find(h => h.id === state.selectedHabitId);
        if (habit) openHabitModal(habit);
      }
    });
    document.getElementById('btn-delete-habit').addEventListener('click', () => deleteSelectedHabit());

    document.getElementById('btn-quick-log').addEventListener('click', () => openLogModal(getTodayKey()));
    document.getElementById('btn-demo-data').addEventListener('click', () => {
      if (confirm('Load sample habits and contribution history?')) {
        seedDemoData(true);
        renderAll();
      }
    });

    document.getElementById('btn-data-modal').addEventListener('click', () => {
      elements.modalData.classList.remove('hidden');
    });

    // Close Modals
    document.getElementById('modal-habit-close').addEventListener('click', () => elements.modalHabit.classList.add('hidden'));
    document.getElementById('btn-cancel-habit').addEventListener('click', () => elements.modalHabit.classList.add('hidden'));
    document.getElementById('modal-log-close').addEventListener('click', () => elements.modalLog.classList.add('hidden'));
    document.getElementById('modal-data-close').addEventListener('click', () => elements.modalData.classList.add('hidden'));

    // Habit Form Submit
    elements.formHabit.addEventListener('submit', handleHabitFormSubmit);

    // Counter buttons in Log modal
    document.getElementById('btn-counter-minus').addEventListener('click', () => {
      let val = parseInt(elements.modalLogCount.value, 10) || 0;
      if (val > 0) elements.modalLogCount.value = val - 1;
    });
    document.getElementById('btn-counter-plus').addEventListener('click', () => {
      let val = parseInt(elements.modalLogCount.value, 10) || 0;
      elements.modalLogCount.value = val + 1;
    });

    // Save & Clear Log Entry
    document.getElementById('btn-save-log').addEventListener('click', handleSaveLog);
    document.getElementById('btn-clear-log').addEventListener('click', handleClearLog);

    // Year Selector Change
    elements.yearSelector.addEventListener('change', (e) => {
      state.selectedYear = parseInt(e.target.value, 10);
      saveState();
      renderAll();
    });

    // Export & Import Data
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

    // Setup today's header date
    elements.todayDateDisplay.textContent = formatPrettyDate(getTodayKey());
  }

  // --- RENDER ENGINE ---
  function renderAll() {
    renderYearSelector();
    renderHabitPills();
    renderHabitDetails();
    renderStats();
    renderHeatmap();
    renderTodayCheckin();
    renderRecentNotes();
  }

  function renderYearSelector() {
    const years = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
    elements.yearSelector.innerHTML = years
      .map(y => `<option value="${y}" ${y === state.selectedYear ? 'selected' : ''}>${y}</option>`)
      .join('');
  }

  function renderHabitPills() {
    let html = `
      <div class="habit-pill ${state.selectedHabitId === 'all' ? 'active' : ''}" data-id="all">
        <span class="pill-dot" style="background-color: var(--accent-green);"></span>
        All Habits Overview
      </div>
    `;

    state.habits.forEach(habit => {
      const isActive = habit.id === state.selectedHabitId;
      const themeVar = `var(--theme-${habit.colorTheme || 'green'}-4)`;
      html += `
        <div class="habit-pill ${isActive ? 'active' : ''}" data-id="${habit.id}">
          <span class="pill-dot" style="background-color: ${themeVar};"></span>
          ${escapeHTML(habit.name)}
        </div>
      `;
    });

    elements.habitPills.innerHTML = html;

    // Attach click events
    elements.habitPills.querySelectorAll('.habit-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        state.selectedHabitId = pill.dataset.id;
        saveState();
        renderAll();
      });
    });
  }

  function renderHabitDetails() {
    if (state.selectedHabitId === 'all') {
      elements.activeHabitTitle.textContent = 'All Habits Overview';
      elements.activeHabitDesc.textContent = 'Combined contribution heat map for all tracked habits';
      elements.activeHabitColorIndicator.className = 'color-badge green';
      elements.activeHabitActions.classList.add('hidden');
    } else {
      const habit = state.habits.find(h => h.id === state.selectedHabitId);
      if (habit) {
        elements.activeHabitTitle.textContent = habit.name;
        elements.activeHabitDesc.textContent = habit.description || `Category: ${habit.category || 'General'}`;
        elements.activeHabitColorIndicator.className = `color-badge ${habit.colorTheme || 'green'}`;
        elements.activeHabitActions.classList.remove('hidden');
      }
    }
  }

  // --- STATS ENGINE ---
  function renderStats() {
    const habitOrAll = state.selectedHabitId === 'all'
      ? 'all'
      : state.habits.find(h => h.id === state.selectedHabitId);

    const streakData = calculateStreaks(habitOrAll);
    const yearStats = calculateYearStats(habitOrAll, state.selectedYear);

    elements.statCurrentStreak.textContent = `${streakData.current} days`;
    elements.statStreakSub.textContent = streakData.current > 0 ? '🔥 On a roll!' : 'No active streak';

    elements.statLongestStreak.textContent = `${streakData.longest} days`;

    elements.statTotalCompletions.textContent = yearStats.totalCount;
    elements.statYearSub.textContent = `${yearStats.activeDays} active days in ${state.selectedYear}`;

    elements.statConsistency.textContent = `${yearStats.consistencyRate}%`;
    elements.statConsistencySub.textContent = `${yearStats.activeDays}/${yearStats.daysInYearSoFar} days active`;
  }

  function calculateStreaks(target) {
    // Generate map of dates -> combined active boolean
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

    // Current Streak calculation
    let currentStreak = 0;
    const today = new Date();
    let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Check today first. If today isn't logged yet, try yesterday to see if streak is preserved
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

    // Longest Streak calculation
    let longestStreak = 0;
    let tempStreak = 0;
    const allDates = Object.keys(activeDateMap).sort();

    if (allDates.length > 0) {
      let prevDate = null;
      allDates.forEach(dateStr => {
        const d = parseDateKey(dateStr);
        if (prevDate) {
          const diffDays = Math.round((d - prevDate) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            tempStreak++;
          } else {
            tempStreak = 1;
          }
        } else {
          tempStreak = 1;
        }
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
        prevDate = d;
      });
    }

    return { current: currentStreak, longest: longestStreak };
  }

  function calculateYearStats(target, year) {
    let totalCount = 0;
    let activeDaysSet = new Set();

    const processLog = (dateStr, logObj) => {
      if (dateStr.startsWith(`${year}-`) && logObj && logObj.count > 0) {
        totalCount += logObj.count;
        activeDaysSet.add(dateStr);
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

    // Calculate days passed in selected year
    const now = new Date();
    let daysInYearSoFar = 365;

    if (year === now.getFullYear()) {
      const startOfYear = new Date(year, 0, 1);
      daysInYearSoFar = Math.max(1, Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24)) + 1);
    }

    const activeDays = activeDaysSet.size;
    const consistencyRate = Math.min(100, Math.round((activeDays / daysInYearSoFar) * 100));

    return { totalCount, activeDays, daysInYearSoFar, consistencyRate };
  }

  // --- HEATMAP ENGINE (52 WEEKS x 7 DAYS GRID) ---
  function renderHeatmap() {
    const year = state.selectedYear;
    const habit = state.selectedHabitId === 'all'
      ? null
      : state.habits.find(h => h.id === state.selectedHabitId);

    const theme = habit ? (habit.colorTheme || 'green') : 'green';

    // Update heatmap header summary
    const stats = calculateYearStats(
      state.selectedHabitId === 'all' ? 'all' : habit,
      year
    );

    elements.heatmapHeading.textContent = `${year} Contribution Year Map`;
    elements.heatmapSummaryCount.textContent = `${stats.totalCount} completions in ${year}`;

    // Update legend theme class
    elements.legendCells.className = `legend-cells theme-${theme}`;

    // Build Heatmap Matrix (Jan 1 to Dec 31)
    const startDate = new Date(year, 0, 1);
    // Align start to preceding Sunday
    const gridStart = new Date(startDate);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    const endDate = new Date(year, 11, 31);
    // Align end to trailing Saturday
    const gridEnd = new Date(endDate);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    // Collect dates into week columns
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

    // Identify month label column offsets
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

    // Build HTML for Months Row
    let monthsHTML = '<div class="heatmap-months-row">';
    monthLabels.forEach(m => {
      // 12px cell + 3px gap = 15px per column offset
      const leftOffset = m.colIndex * 15;
      monthsHTML += `<span class="month-label" style="left: ${leftOffset}px;">${m.name}</span>`;
    });
    monthsHTML += '</div>';

    // Build HTML for Days & Weeks Grid
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
          gridHTML += '<div class="day-square level-0" style="opacity: 0.15;"></div>';
          return;
        }

        const { count, level } = getCompletionDataForDate(dateStr, state.selectedHabitId);
        const isToday = dateStr === todayStr;

        gridHTML += `
          <div class="day-square level-${level} ${isToday ? 'today' : ''}"
               data-date="${dateStr}"
               data-count="${count}"
               data-level="${level}">
          </div>
        `;
      });
      gridHTML += '</div>';
    });

    gridHTML += '</div></div>';

    elements.heatmapGridContainer.innerHTML = monthsHTML + gridHTML;

    // Attach Interactivity (Click & Hover Tooltips)
    attachHeatmapEvents();
  }

  function getCompletionDataForDate(dateStr, habitId) {
    let totalCount = 0;

    if (habitId === 'all') {
      state.habits.forEach(h => {
        if (h.logs && h.logs[dateStr]) {
          totalCount += h.logs[dateStr].count || 0;
        }
      });
    } else {
      const habit = state.habits.find(h => h.id === habitId);
      if (habit && habit.logs && habit.logs[dateStr]) {
        totalCount = habit.logs[dateStr].count || 0;
      }
    }

    let level = 0;
    if (totalCount === 0) level = 0;
    else if (totalCount === 1) level = 1;
    else if (totalCount === 2) level = 2;
    else if (totalCount === 3) level = 3;
    else level = 4;

    return { count: totalCount, level };
  }

  function attachHeatmapEvents() {
    const squares = elements.heatmapGridContainer.querySelectorAll('.day-square[data-date]');

    squares.forEach(sq => {
      sq.addEventListener('mouseenter', (e) => {
        const dateStr = sq.dataset.date;
        const count = parseInt(sq.dataset.count, 10) || 0;
        const formattedDate = formatPrettyDate(dateStr);
        const label = count === 1 ? '1 completion' : `${count} completions`;

        elements.customTooltip.innerHTML = `<strong>${label}</strong> on ${formattedDate}`;
        elements.customTooltip.classList.remove('hidden');

        const rect = sq.getBoundingClientRect();
        elements.customTooltip.style.left = `${rect.left + window.scrollX - 40}px`;
        elements.customTooltip.style.top = `${rect.top + window.scrollY - 36}px`;
      });

      sq.addEventListener('mouseleave', () => {
        elements.customTooltip.classList.add('hidden');
      });

      sq.addEventListener('click', () => {
        elements.customTooltip.classList.add('hidden');
        openLogModal(sq.dataset.date);
      });
    });
  }

  // --- TODAY CHECKIN & QUICK LOG PANEL ---
  function renderTodayCheckin() {
    const todayKey = getTodayKey();

    if (state.habits.length === 0) {
      elements.todayHabitsList.innerHTML = `
        <div class="empty-placeholder">
          No habits created yet. Click "New Habit" above to start tracking!
        </div>
      `;
      return;
    }

    let html = '';
    state.habits.forEach(habit => {
      const todayLog = (habit.logs && habit.logs[todayKey]) ? habit.logs[todayKey] : { count: 0, note: '' };
      const isDone = todayLog.count >= (habit.dailyTarget || 1);
      const themeVar = `var(--theme-${habit.colorTheme || 'green'}-4)`;

      html += `
        <div class="today-habit-item">
          <div class="today-habit-info">
            <span class="pill-dot" style="background-color: ${themeVar};"></span>
            <div>
              <div class="today-habit-name">${escapeHTML(habit.name)}</div>
              <div class="today-habit-sub">
                Target: ${habit.dailyTarget || 1}/day &bull; Current today: <strong>${todayLog.count}</strong>
              </div>
            </div>
          </div>
          <div class="today-habit-actions">
            <button class="check-btn ${isDone ? 'completed' : ''}" data-habit-id="${habit.id}">
              ${isDone ? '✓ Completed' : '+ Log Today'}
            </button>
          </div>
        </div>
      `;
    });

    elements.todayHabitsList.innerHTML = html;

    // Attach quick log button events
    elements.todayHabitsList.querySelectorAll('.check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const habitId = btn.dataset.habitId;
        toggleTodayHabit(habitId);
      });
    });
  }

  function toggleTodayHabit(habitId) {
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;

    const todayKey = getTodayKey();
    if (!habit.logs) habit.logs = {};

    const currentCount = habit.logs[todayKey] ? habit.logs[todayKey].count : 0;
    const currentNote = habit.logs[todayKey] ? habit.logs[todayKey].note : '';

    if (currentCount >= (habit.dailyTarget || 1)) {
      // Toggle off
      habit.logs[todayKey] = { count: 0, note: currentNote };
    } else {
      // Toggle on
      habit.logs[todayKey] = { count: (habit.dailyTarget || 1), note: currentNote };
    }

    saveState();
    renderAll();
  }

  // --- RECENT NOTES ENGINE ---
  function renderRecentNotes() {
    const recentNotes = [];

    state.habits.forEach(habit => {
      if (habit.logs) {
        Object.entries(habit.logs).forEach(([dateStr, log]) => {
          if (log && log.note && log.note.trim() !== '') {
            recentNotes.push({
              habitName: habit.name,
              dateStr: dateStr,
              note: log.note
            });
          }
        });
      }
    });

    // Sort by date descending
    recentNotes.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    if (recentNotes.length === 0) {
      elements.recentNotesList.innerHTML = `
        <div class="empty-placeholder">
          No notes recorded yet. Click any square on the heatmap to log notes!
        </div>
      `;
      return;
    }

    let html = '';
    recentNotes.slice(0, 10).forEach(item => {
      html += `
        <div class="note-item">
          <div class="note-header">
            <span class="note-habit-tag">${escapeHTML(item.habitName)}</span>
            <span>${formatPrettyDate(item.dateStr)}</span>
          </div>
          <div class="note-text">${escapeHTML(item.note)}</div>
        </div>
      `;
    });

    elements.recentNotesList.innerHTML = html;
  }

  // --- MODAL HANDLERS ---
  function openHabitModal(habitToEdit = null) {
    elements.formHabit.reset();

    if (habitToEdit) {
      elements.modalHabitTitle.textContent = 'Edit Habit';
      document.getElementById('habit-id').value = habitToEdit.id;
      document.getElementById('habit-name').value = habitToEdit.name;
      document.getElementById('habit-description').value = habitToEdit.description || '';
      document.getElementById('habit-category').value = habitToEdit.category || 'General';
      document.getElementById('habit-daily-target').value = habitToEdit.dailyTarget || 1;

      const colorRadio = elements.formHabit.querySelector(`input[name="habit-color"][value="${habitToEdit.colorTheme}"]`);
      if (colorRadio) colorRadio.checked = true;
    } else {
      elements.modalHabitTitle.textContent = 'Create New Habit';
      document.getElementById('habit-id').value = '';
    }

    elements.modalHabit.classList.remove('hidden');
  }

  function handleHabitFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('habit-id').value;
    const name = document.getElementById('habit-name').value.trim();
    const description = document.getElementById('habit-description').value.trim();
    const category = document.getElementById('habit-category').value.trim();
    const dailyTarget = parseInt(document.getElementById('habit-daily-target').value, 10) || 1;
    const colorTheme = elements.formHabit.querySelector('input[name="habit-color"]:checked').value;

    if (!name) return;

    if (id) {
      // Edit existing
      const habit = state.habits.find(h => h.id === id);
      if (habit) {
        habit.name = name;
        habit.description = description;
        habit.category = category;
        habit.dailyTarget = dailyTarget;
        habit.colorTheme = colorTheme;
      }
    } else {
      // Create new
      const newHabit = {
        id: 'habit_' + Date.now(),
        name,
        description,
        category,
        colorTheme,
        dailyTarget,
        createdAt: getTodayKey(),
        logs: {}
      };
      state.habits.push(newHabit);
      state.selectedHabitId = newHabit.id;
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

  function openLogModal(dateStr) {
    activeLogDateKey = dateStr;
    elements.modalLogDateStr.textContent = formatPrettyDate(dateStr);

    // Populate habits dropdown
    elements.modalLogHabitSelect.innerHTML = state.habits
      .map(h => `<option value="${h.id}">${escapeHTML(h.name)}</option>`)
      .join('');

    // Pre-select current active habit if specific, else first habit
    if (state.selectedHabitId !== 'all') {
      elements.modalLogHabitSelect.value = state.selectedHabitId;
    }

    loadLogModalValues();

    // Change value when habit selection inside modal changes
    elements.modalLogHabitSelect.onchange = () => loadLogModalValues();

    elements.modalLog.classList.remove('hidden');
  }

  function loadLogModalValues() {
    const habitId = elements.modalLogHabitSelect.value;
    const habit = state.habits.find(h => h.id === habitId);

    if (habit && habit.logs && habit.logs[activeLogDateKey]) {
      elements.modalLogCount.value = habit.logs[activeLogDateKey].count || 0;
      elements.modalLogNote.value = habit.logs[activeLogDateKey].note || '';
    } else {
      elements.modalLogCount.value = 1;
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

  // --- DATA BACKUP & RESTORE ---
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
          alert('Data imported successfully!');
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

  // --- UTILITY ---
  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
