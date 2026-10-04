/**
 * Habitual - PWA & Platform Widgets Engine
 * Generates live data payloads for Quick Add and Heatmap widgets, manages PWA Widget API sync,
 * and renders the interactive In-App Widget Gallery.
 */

window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  // --- DATA GENERATION PAYLOAD HELPERS ---

  core.getQuickAddWidgetPayload = function() {
    const todayKey = core.getTodayKey ? core.getTodayKey() : new Date().toISOString().split('T')[0];
    const prettyToday = core.formatPrettyDate ? core.formatPrettyDate(todayKey) : todayKey;
    const habits = (core.state && Array.isArray(core.state.habits)) ? core.state.habits : [];

    const activeHabitList = habits.filter(h => !h.isPaused).map(h => {
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

    // Build mini 7x12 matrix (last 12 weeks ~3 months) for widget presentation
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
      quickAddHabitsHTML = quickAddData.habits.map(h => `
        <div class="widget-habit-item">
          <div class="widget-habit-info">
            <span class="widget-habit-title" style="color: ${core.escapeHTML(h.color)};">${core.escapeHTML(h.name)}</span>
            <span class="widget-habit-meta">🔥 ${h.streak} day streak • Today: ${h.completedCount}/${h.dailyTarget}</span>
          </div>
          <button class="widget-quick-log-btn ${h.isCompleted ? 'completed' : ''}"
                  data-habit-id="${core.escapeHTML(h.id)}"
                  title="${h.isCompleted ? 'Completed today!' : 'Click to quick log +1'}">
            ${h.statusIcon}
          </button>
        </div>
      `).join('');
    }

    let habitOptionsHTML = `<option value="all" ${heatmapData.habitId === 'all' ? 'selected' : ''}>🌟 Combined All Habits</option>`;
    habits.forEach(h => {
      habitOptionsHTML += `<option value="${core.escapeHTML(h.id)}" ${heatmapData.habitId === h.id ? 'selected' : ''}>${core.escapeHTML(h.name)}</option>`;
    });

    let miniGridHTML = '';
    heatmapData.miniWeeks.forEach(week => {
      miniGridHTML += `<div class="widget-mini-week">`;
      week.forEach(day => {
        miniGridHTML += `<div class="widget-mini-day" style="background-color: ${core.escapeHTML(day.color)};" title="${core.escapeHTML(day.dateKey)}"></div>`;
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
              <span class="widget-brand">📊 Habitual</span>
              <span class="widget-date">${core.escapeHTML(quickAddData.dateStr)}</span>
            </div>
            <div class="widget-quick-add-list">
              ${quickAddHabitsHTML}
            </div>
          </div>
        </div>

        <!-- HEATMAP GRID WIDGET INTERACTIVE CARD -->
        <div class="widget-preview-card">
          <div class="widget-card-header">
            <div class="widget-card-title">
              <span class="widget-icon">🟩</span>
              <h3>Heatmap Grid Widget</h3>
            </div>
            <span class="widget-type-badge">7x52 Contribution Grid</span>
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
        </div>

      </div>

      <!-- PLATFORM COMPATIBILITY & INSTALLATION INFO -->
      <div class="widget-platform-info">
        <div class="platform-info-header">
          <span class="platform-status-icon">🚀</span>
          <h4>Platform Widget Integration Status</h4>
        </div>
        <p>
          Habitual uses the <strong>W3C Web App Manifest Widgets Standard</strong> and <strong>Adaptive Cards</strong>.
          Supported on Windows 11 Widgets Board, Android PWA/WebAPK launcher widgets, and Chrome/Edge PWA platforms.
        </p>
        <div class="widget-action-buttons">
          <button id="btn-copy-widget-template" class="btn btn-secondary">📋 Copy Adaptive Card Schema</button>
          <button id="btn-trigger-pwa-install" class="btn btn-primary">📱 Install PWA App & Widgets</button>
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
          core.toggleHabitForDate(habitId, todayKey);
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

})(window.HabitualCore);
