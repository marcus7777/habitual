/**
 * Habitual - PWA & Platform Widgets Engine
 * Generates live data payloads for Quick Add and Heatmap widgets, manages PWA Widget API sync,
 * and renders standalone & in-app widget components.
 */

window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  // --- DATA GENERATION PAYLOAD HELPERS ---

  core.getQuickAddWidgetPayload = function() {
    const todayKey = core.getTodayKey ? core.getTodayKey() : new Date().toISOString().split('T')[0];
    const prettyToday = core.formatPrettyDate ? core.formatPrettyDate(todayKey) : todayKey;
    const habits = (core.state && Array.isArray(core.state.habits)) ? core.state.habits : [];

    // Helper: Sort/order habits according to homepage hierarchy (Top-level parent -> descendant sub-habits)
    const orderedHabits = [];
    const visited = new Set();

    function addHabitTree(habit, depth) {
      if (!habit || visited.has(habit.id)) return;
      visited.add(habit.id);

      if (!habit.isPaused) {
        orderedHabits.push({ habit, depth });
      }

      // Find direct sub-habits of this habit in original array order
      const children = habits.filter(h => h.parentId === habit.id);
      children.forEach(child => addHabitTree(child, depth + 1));
    }

    // 1. Process top-level habits first
    const topLevelHabits = habits.filter(h => !h.parentId);
    topLevelHabits.forEach(parent => addHabitTree(parent, 0));

    // 2. Process any remaining unvisited habits (e.g., orphaned sub-habits)
    habits.forEach(h => {
      if (!visited.has(h.id)) addHabitTree(h, h.parentId ? 1 : 0);
    });

    const activeHabitList = orderedHabits.map(({ habit: h, depth }) => {
      const log = (h.logs && h.logs[todayKey]) ? h.logs[todayKey] : null;
      const count = log ? (log.count || 0) : 0;
      const target = Math.max(1, h.dailyTarget || 1);
      const isCompleted = h.type === 'negative' ? (count === 0) : (count >= target);
      const streakInfo = core.calculateStreakForTarget ? core.calculateStreakForTarget(h) : { current: 0 };
      const colorHex = core.getHabitHexColor ? core.getHabitHexColor(h) : '#39d353';

      return {
        id: h.id,
        name: h.name || 'Habit',
        type: h.type || 'positive',
        parentId: h.parentId || null,
        isSubhabit: Boolean(h.parentId),
        depth: depth,
        streak: streakInfo.current || 0,
        completedCount: count,
        dailyTarget: target,
        isCompleted: isCompleted,
        statusIcon: isCompleted ? '✓' : '+',
        color: colorHex
      };
    });

    return {
      dateKey: todayKey,
      dateStr: prettyToday,
      habits: activeHabitList
    };
  };

  core.getHeatmapWidgetPayload = function(habitId = 'all') {
    const currentYear = core.state ? (core.state.selectedYear || core.CURRENT_YEAR || new Date().getFullYear()) : new Date().getFullYear();
    const todayKey = core.getTodayKey ? core.getTodayKey() : new Date().toISOString().split('T')[0];
    const habits = (core.state && Array.isArray(core.state.habits)) ? core.state.habits : [];

    let target = 'all';
    let targetName = 'Combined Progress Heatmap';
    let targetColor = '#39d353';

    if (habitId && habitId !== 'all') {
      const found = habits.find(h => h.id === habitId);
      if (found) {
        target = found;
        targetName = found.name;
        targetColor = core.getHabitHexColor ? core.getHabitHexColor(found) : '#39d353';
      }
    }

    const streakInfo = core.calculateStreakForTarget ? core.calculateStreakForTarget(target) : { current: 0 };
    const yearStats = core.calculateYearStatsForTarget ? core.calculateYearStatsForTarget(target, currentYear) : { totalCount: 0 };

    // Build mini 7x12 matrix (last 12 weeks) for widget presentation
    const miniWeeks = [];
    const todayObj = core.parseDateKey ? core.parseDateKey(todayKey) : new Date();
    const numWeeks = 12;

    for (let w = numWeeks - 1; w >= 0; w--) {
      const weekStart = new Date(todayObj);
      weekStart.setDate(todayObj.getDate() - (w * 7) - (todayObj.getDay() || 7) + 1);
      const weekDays = [];

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + dayOffset);
        const dKey = core.formatDateKey ? core.formatDateKey(d) : d.toISOString().split('T')[0];
        const cellData = core.getCellData ? core.getCellData(dKey, target, todayKey) : { count: 0, ratio: 0 };

        let cellColor = '#161b22';
        if (cellData.ratio > 0) {
          if (target === 'all' && Array.isArray(cellData.activeHabits) && cellData.activeHabits.length > 0) {
            cellColor = cellData.activeHabits[0].color || targetColor;
          } else if (target !== 'all') {
            cellColor = core.getHabitHexWithAlpha ? core.getHabitHexWithAlpha(target, cellData.ratio) : targetColor;
          }
        }

        weekDays.push({
          dateKey: dKey,
          ratio: cellData.ratio || 0,
          color: cellColor,
          isCompleted: cellData.ratio >= 1.0
        });
      }
      miniWeeks.push(weekDays);
    }

    return {
      habitId: habitId || 'all',
      habitName: targetName,
      color: targetColor,
      currentStreak: streakInfo.current || 0,
      yearTotal: yearStats.totalCount || 0,
      year: currentYear,
      miniWeeks: miniWeeks,
      matrixSummary: `7x12 mini heatmap preview active for ${targetName} with ${streakInfo.current || 0}-day streak and ${yearStats.totalCount || 0} completions in ${currentYear}.`
    };
  };

  // --- WIDGET HELPER UTILITIES ---

  core.getDescendantIds = function(habitId, habitsList) {
    const habits = habitsList || (core.state && Array.isArray(core.state.habits) ? core.state.habits : []);
    const ids = [habitId];
    const children = habits.filter(h => h.parentId === habitId);
    children.forEach(c => ids.push(...core.getDescendantIds(c.id, habits)));
    return ids;
  };

  core.reorderHabitsInState = function(fromId, toId, habitsList) {
    const habits = habitsList || (core.state && Array.isArray(core.state.habits) ? core.state.habits : null);
    if (!habits) return null;
    const fromIdx = habits.findIndex(h => h.id === fromId);
    const toIdx = habits.findIndex(h => h.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return null;

    const [moved] = habits.splice(fromIdx, 1);
    habits.splice(toIdx, 0, moved);
    if (core.saveState && !habitsList) core.saveState();
    return moved;
  };

  // --- SERVICE WORKER WIDGET SYNC ---

  core.updatePWAWidgets = function() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const quickAddPayload = core.getQuickAddWidgetPayload();
      const heatmapPayload = core.getHeatmapWidgetPayload(core.state ? core.state.selectedHabitId : 'all');

      navigator.serviceWorker.controller.postMessage({
        type: 'SYNC_WIDGETS',
        quickAddData: quickAddPayload,
        heatmapData: heatmapPayload
      });
    }
  };

  // --- IN-APP WIDGET GALLERY & MODAL RENDERER ---

  core.openWidgetsModal = function() {
    if (core.elements && core.elements.modalWidgets) {
      core.elements.modalWidgets.classList.remove('hidden');
      core.renderWidgetsGallery();
    }
  };

  core.closeWidgetsModal = function() {
    if (core.elements && core.elements.modalWidgets) {
      core.elements.modalWidgets.classList.add('hidden');
    }
  };

  core.renderWidgetsGallery = function() {
    const galleryContainer = document.getElementById('widget-gallery-content');
    if (!galleryContainer) return;

    const quickAddData = core.getQuickAddWidgetPayload();
    const heatmapData = core.getHeatmapWidgetPayload(core.activeWidgetHabitId || (core.state ? core.state.selectedHabitId : 'all'));
    const habits = (core.state && Array.isArray(core.state.habits)) ? core.state.habits : [];

    let quickAddHabitsHTML = '';
    if (quickAddData.habits.length === 0) {
      quickAddHabitsHTML = `<div class="widget-empty-notice">No active habits found. Create a habit to populate your widget!</div>`;
    } else {
      quickAddHabitsHTML = quickAddData.habits.map(h => {
        const habitName = core.escapeHTML ? core.escapeHTML(h.name) : h.name;
        const habitId = core.escapeHTML ? core.escapeHTML(h.id) : h.id;
        const habitColor = (core.normalizeHex && h.color) ? core.normalizeHex(h.color) : (h.color || '#39d353');
        const indentStyle = h.depth > 0 ? `margin-left: ${Math.min(h.depth, 3) * 18}px;` : '';
        const subIndicator = h.isSubhabit ? `<span class="subhabit-curve-icon" style="color: ${habitColor}; font-weight: bold; margin-right: 4px;">↳</span>` : '';

        return `
          <div class="widget-habit-card widget-habit-item ${h.isSubhabit ? 'widget-subhabit-card' : ''}" style="${indentStyle}">
            <div class="widget-habit-left">
              <div class="habit-color-tab" style="background-color: ${habitColor}1a; border-color: ${habitColor}4d;">
                <span class="color-tab-pill" style="background-color: ${habitColor}; box-shadow: 0 0 6px ${habitColor};"></span>
                <span class="tab-title">
                  ${subIndicator}<a href="#/habit/${encodeURIComponent(h.id)}" class="card-title-link" onclick="if(window.HabitualCore && HabitualCore.closeWidgetsModal) HabitualCore.closeWidgetsModal();" title="Open ${habitName} & sub-habits">${habitName}</a>
                </span>
              </div>
              <div class="widget-habit-meta-row">
                <span class="widget-meta-pill">🔥 ${h.streak} d streak</span>
                <span class="widget-meta-pill ${h.isCompleted ? 'completed-pill' : ''}">
                  Today: ${h.completedCount}/${h.dailyTarget} ${h.isCompleted ? '✓' : ''}
                </span>
              </div>
            </div>
            <button class="widget-quick-log-btn ${h.isCompleted ? 'completed' : ''}"
                    style="${!h.isCompleted ? `border-color: ${habitColor}; color: ${habitColor};` : ''}"
                    data-habit-id="${habitId}"
                    title="${h.isCompleted ? 'Completed today!' : 'Click to quick log +1'}">
              ${h.statusIcon}
            </button>
          </div>
        `;
      }).join('');
    }

    let habitOptionsHTML = `<option value="all" ${heatmapData.habitId === 'all' ? 'selected' : ''}>🌟 Combined All Habits</option>`;
    habits.forEach(h => {
      habitOptionsHTML += `<option value="${core.escapeHTML ? core.escapeHTML(h.id) : h.id}" ${heatmapData.habitId === h.id ? 'selected' : ''}>${core.escapeHTML ? core.escapeHTML(h.name) : h.name}</option>`;
    });

    let miniGridHTML = '';
    heatmapData.miniWeeks.forEach(week => {
      miniGridHTML += `<div class="widget-mini-week">`;
      week.forEach(day => {
        miniGridHTML += `<div class="widget-mini-day" style="background-color: ${core.escapeHTML ? core.escapeHTML(day.color) : day.color};" title="${core.escapeHTML ? core.escapeHTML(day.dateKey) : day.dateKey}"></div>`;
      });
      miniGridHTML += `</div>`;
    });

    galleryContainer.innerHTML = `
      <div class="widgets-grid-layout">

        <!-- QUICK ADD WIDGET INTERACTIVE CARD -->
        <div class="widget-preview-card">
          <div class="widget-card-header">
            <div class="widget-card-title">
              <span class="widget-icon">⚡</span>
              <h3>Quick Add Widget</h3>
            </div>
            <span class="widget-type-badge">Interactive 1-Click</span>
          </div>
          <p class="widget-card-description">
            Place on home screen / desktop for instant 1-click check-ins without opening dialogs.
          </p>

          <div class="widget-card-body">
            <div class="widget-header-bar">
              <span class="widget-brand">⚡ Habitual</span>
              <span class="widget-date">${core.escapeHTML ? core.escapeHTML(quickAddData.dateStr) : quickAddData.dateStr}</span>
            </div>
            <div class="widget-quick-add-list">
              ${quickAddHabitsHTML}
            </div>
          </div>
          <div class="margin-top-xs">
            <a href="widgets/add.html" target="_blank" class="btn btn-secondary btn-sm" style="width: 100%; text-align: center;">Launch Standalone Quick Add Widget ↗</a>
          </div>
        </div>

        <!-- HEATMAP GRID WIDGET INTERACTIVE CARD -->
        <div class="widget-preview-card">
          <div class="widget-card-header">
            <div class="widget-card-title">
              <span class="widget-icon">📊</span>
              <h3>Heatmap Grid Widget</h3>
            </div>
            <span class="widget-type-badge">7x12 Contribution Grid</span>
          </div>
          <p class="widget-card-description">
            Visualize consistency trends and year-at-a-glance contribution heatmaps.
          </p>

          <div class="widget-card-body">
            <div class="widget-selector-row">
              <label for="widget-heatmap-select">Target Habit:</label>
              <select id="widget-heatmap-select" class="widget-select">
                ${habitOptionsHTML}
              </select>
            </div>

            <div class="widget-heatmap-meta-bar">
              <div class="widget-stat-pill">
                <span class="stat-label">Streak</span>
                <span class="stat-value">🔥 ${heatmapData.currentStreak} d</span>
              </div>
              <div class="widget-stat-pill">
                <span class="stat-label">${heatmapData.year} Total</span>
                <span class="stat-value">✨ ${heatmapData.yearTotal}</span>
              </div>
            </div>

            <div class="widget-heatmap-grid-preview">
              ${miniGridHTML}
            </div>
          </div>
          <div class="margin-top-xs">
            <a href="widgets/heatmaps.html" target="_blank" class="btn btn-secondary btn-sm" style="width: 100%; text-align: center;">Launch Standalone Heatmaps Widget ↗</a>
          </div>
        </div>

      </div>

      <!-- PLATFORM COMPATIBILITY & INSTALLATION INFO -->
      <div class="widget-platform-info">
        <div class="platform-info-header">
          <span class="platform-status-icon">⚙️</span>
          <h4>Platform Widget Integration & Settings</h4>
        </div>
        <p>
          Habitual uses the <strong>W3C Web App Manifest Widgets Standard</strong> and <strong>Adaptive Cards</strong>.
          Supported on Windows 11 Widgets Board, Android PWA/WebAPK launcher widgets, and Chrome/Edge PWA platforms.
        </p>
        <div class="widget-action-buttons">
          <a href="widgets/settings.html" target="_blank" class="btn btn-secondary">⚙️ Widget Settings Page</a>
          <button id="btn-copy-widget-template" class="btn btn-secondary">📋 Copy Adaptive Card Schema</button>
          <button id="btn-trigger-pwa-install" class="btn btn-primary">📲 Install PWA App & Widgets</button>
        </div>
      </div>
    `;

    // Attach quick log click listeners inside widget preview
    galleryContainer.querySelectorAll('.widget-quick-log-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = btn.getAttribute('data-habit-id');
        const todayKey = core.getTodayKey ? core.getTodayKey() : new Date().toISOString().split('T')[0];
        if (habitId && core.toggleHabitForDate) {
          core.toggleHabitForDate(habitId, todayKey, btn);
          if (core.showToast) core.showToast('Logged progress via Quick Add Widget!');
          core.renderWidgetsGallery();
        }
      });
    });

    // Attach heatmap target selector change listener
    const heatmapSelect = document.getElementById('widget-heatmap-select');
    if (heatmapSelect) {
      heatmapSelect.addEventListener('change', (e) => {
        core.activeWidgetHabitId = e.target.value;
        core.renderWidgetsGallery();
      });
    }

    // Attach copy template button listener
    const btnCopy = document.getElementById('btn-copy-widget-template');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const payloadStr = JSON.stringify(core.getQuickAddWidgetPayload(), null, 2);
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(payloadStr)
            .then(() => { if (core.showToast) core.showToast('Copied Widget Adaptive Card JSON to clipboard!'); })
            .catch(() => alert('Widget JSON:\n\n' + payloadStr));
        } else {
          alert('Widget JSON:\n\n' + payloadStr);
        }
      });
    }

    // Attach PWA Install trigger button
    const btnInstall = document.getElementById('btn-trigger-pwa-install');
    if (btnInstall) {
      btnInstall.addEventListener('click', () => {
        if (core.deferredPWAInstallPrompt) {
          core.deferredPWAInstallPrompt.prompt();
          core.deferredPWAInstallPrompt.userChoice.then(() => {
            core.deferredPWAInstallPrompt = null;
          });
        } else {
          if (core.showToast) core.showToast('To install as PWA Widget, tap "Add to Home Screen" or install via Browser Menu!');
        }
      });
    }
  };

  // --- UI INITIALIZATION ---

  core.initWidgetsUI = function() {
    const btnOpen = document.getElementById('btn-open-widgets');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        core.openWidgetsModal();
      });
    }

    const menuWidgets = document.getElementById('menu-btn-open-widgets');
    if (menuWidgets) {
      menuWidgets.addEventListener('click', () => {
        core.openWidgetsModal();
      });
    }

    const btnClose = document.getElementById('btn-close-widgets');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        core.closeWidgetsModal();
      });
    }

    const modal = document.getElementById('modal-widgets');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          core.closeWidgetsModal();
        }
      });
    }

    // Capture beforeinstallprompt for PWA widget installation
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        core.deferredPWAInstallPrompt = e;
      });

      // Listen for Service Worker messages
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'WIDGET_ACTION') {
            const verb = event.data.verb;
            const habitId = event.data.habitId;
            const todayKey = core.getTodayKey ? core.getTodayKey() : new Date().toISOString().split('T')[0];

            if (verb === 'quick-add' && habitId && core.toggleHabitForDate) {
              core.toggleHabitForDate(habitId, todayKey);
              if (core.showToast) core.showToast('Habit check-in received from platform widget!');
            } else if (verb === 'view-heatmap' && habitId) {
              if (core.state) core.state.selectedHabitId = habitId;
              if (core.renderAll) core.renderAll();
            }
          }
        });
      }
    }
  };

  // --- TODO PAGE COUNTDOWN & TASK LIST HELPERS ---

  core.getTodayRemainingTime = function() {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const diffMs = Math.max(0, endOfDay.getTime() - now.getTime());

    const totalSec = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const formattedString = `${hours}h ${minutes}m ${seconds}s`;

    return {
      hours,
      minutes,
      seconds,
      formattedString
    };
  };

  core.getTodayTodoList = function() {
    const todayKey = core.getTodayKey ? core.getTodayKey() : new Date().toISOString().split('T')[0];
    const habits = (core.state && Array.isArray(core.state.habits)) ? core.state.habits : [];

    const todoItems = [];

    const orderedHabits = [];
    const visited = new Set();

    function addHabitTree(habit, depth) {
      if (!habit || visited.has(habit.id)) return;
      visited.add(habit.id);

      if (!habit.isPaused) {
        orderedHabits.push({ habit, depth });
      }

      const children = habits.filter(h => h.parentId === habit.id);
      children.forEach(child => addHabitTree(child, depth + 1));
    }

    const topLevel = habits.filter(h => !h.parentId);
    topLevel.forEach(parent => addHabitTree(parent, 0));
    habits.forEach(h => {
      if (!visited.has(h.id)) addHabitTree(h, h.parentId ? 1 : 0);
    });

    orderedHabits.forEach(({ habit: h, depth }) => {
      const dateObj = core.parseDateKey ? core.parseDateKey(todayKey) : new Date();
      if (core.isHabitActiveOnDate && !core.isHabitActiveOnDate(h, dateObj)) {
        return;
      }

      const log = (h.logs && h.logs[todayKey]) ? h.logs[todayKey] : null;
      const count = log ? (log.count || 0) : 0;
      const target = h.type === 'negative' ? 1 : Math.max(1, h.dailyTarget || 1);

      for (let i = 1; i <= target; i++) {
        const isCompleted = h.type === 'negative' ? (count === 0) : (count >= i);
        todoItems.push({
          habitId: h.id,
          habitName: h.name,
          colorTheme: h.colorTheme || 'green',
          instanceIndex: i,
          totalTarget: target,
          isCompleted: isCompleted,
          dateKey: todayKey,
          icon: h.type === 'negative' ? '🛑' : '🎯',
          type: h.type || 'positive',
          depth: depth
        });
      }
    });

    return todoItems;
  };

  core.getUpcomingEvents = function() {
    const todayStr = core.getTodayKey ? core.getTodayKey() : new Date().toISOString().split('T')[0];
    const habits = (core.state && Array.isArray(core.state.habits)) ? core.state.habits : [];
    const upcoming = [];

    habits.forEach(h => {
      if (h.isPaused) return;
      if (h.logs) {
        Object.keys(h.logs).forEach(dateKey => {
          if (dateKey > todayStr) {
            const log = h.logs[dateKey];
            if (log && (log.count > 0 || (log.note && log.note.trim() !== ''))) {
              upcoming.push({
                habitId: h.id,
                habitName: h.name,
                colorTheme: h.colorTheme || 'green',
                dateKey: dateKey,
                formattedDate: core.formatPrettyDate ? core.formatPrettyDate(dateKey) : dateKey,
                count: log.count || 0,
                note: log.note || '',
                isUpcomingEvent: true,
                isCompleted: true,
                icon: '📅'
              });
            }
          }
        });
      }
    });

    upcoming.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return upcoming;
  };

  core.getTodoListData = function() {
    const upcomingEvents = core.getUpcomingEvents();
    if (upcomingEvents.length > 0) {
      return {
        mode: 'upcoming',
        items: upcomingEvents
      };
    }

    const todayItems = core.getTodayTodoList();
    const uncompletedTodayItems = todayItems.filter(item => !item.isCompleted);

    return {
      mode: 'today_uncompleted',
      items: uncompletedTodayItems.length > 0 ? uncompletedTodayItems : todayItems
    };
  };

})(window.HabitualCore);
