window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  core.showToast = function(message) {
    const banner = document.getElementById('toast-banner');
    const msgEl = document.getElementById('toast-message');
    if (banner && msgEl) {
      msgEl.textContent = message;
      banner.classList.remove('hidden');
      setTimeout(() => { banner.classList.add('hidden'); }, 4000);
    }
  };

  core.parseHash = function() {
    const hash = window.location.hash.trim();
    if (hash.startsWith('#/habit/')) {
      const habitId = hash.replace('#/habit/', '').trim();
      if (habitId) return { view: 'habit', habitId };
    }
    if (hash.startsWith('#/+1c/')) {
      const habitId = hash.replace('#/+1c/', '').trim();
      if (habitId) {
        let habit = core.state.habits.find(h => h.id === habitId);
        if (!habit) {
          const namesFromPath = habitId.split('_');
          let parentId = null; let habitName = habitId;
          if (namesFromPath.length === 1) habitName = namesFromPath[0];
          else if (namesFromPath.length >= 2) {
            parentId = namesFromPath[0];
            habitName = core.nameFromId(namesFromPath[1]);
          }
          habit = {
            id: habitId, name: habitName, type: 'positive', description: '', category: '',
            colorTheme: typeof Please !== 'undefined' ? Please.make_color({ from_hash: habitId }) : 'green',
            dailyTarget: 1, parentId: parentId, createdAt: core.getTodayKey(), logs: {}
          };
          let parentHabit = core.state.habits.find(h => h.id === parentId);
          if (!parentHabit && parentId) {
            parentHabit = {
              id: parentId, name: core.nameFromId(parentId), type: 'positive', description: '', category: '',
              colorTheme: typeof Please !== 'undefined' ? Please.make_color({ from_hash: habitId }) : 'green',
              dailyTarget: 1, parentId: null, createdAt: core.getTodayKey(), logs: {}
            };
            core.state.habits.push(parentHabit);
          }
          core.state.habits.push(habit);
          if (core.saveState) core.saveState();
        }
        if (!habit.logs) habit.logs = {};
        const todayKey = core.getTodayKey();
        const currentLog = habit.logs[todayKey];
        const currentCount = currentLog ? currentLog.count : 0;
        const currentNote = currentLog ? currentLog.note : '';
        habit.logs[todayKey] = { count: currentCount + 1, note: currentNote };
        if (core.saveState) core.saveState();
        core.showToast(`+1 logged for "${habit.name}"! Window closing in 7s...`);
        window.location.hash = '#/habit/' + habit.id;
        setTimeout(() => { window.close(); }, 7000);
        return { view: 'habit', habitId: habit.id };
      }
    }
    return { view: 'home', habitId: null };
  };

  core.navigateTo = function(hash) {
    if (window.location.hash !== hash) window.location.hash = hash;
    else if (core.renderAll) core.renderAll();
  };

  core.initUI = function() {
    core.elements.yearSelector = document.getElementById('year-selector');
    core.elements.heatmapsGallery = document.getElementById('heatmaps-gallery');
    core.elements.customTooltip = document.getElementById('custom-tooltip');

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('scroll', () => { if (core.elements.customTooltip && !core.elements.customTooltip.classList.contains('hidden')) core.elements.customTooltip.classList.add('hidden'); }, { passive: true });
      window.addEventListener('resize', () => { if (core.elements.customTooltip && !core.elements.customTooltip.classList.contains('hidden')) core.elements.customTooltip.classList.add('hidden'); }, { passive: true });
    }

    core.elements.modalHabit = document.getElementById('modal-habit');
    core.elements.formHabit = document.getElementById('form-habit');
    core.elements.modalHabitTitle = document.getElementById('modal-habit-title');
    core.elements.habitParent = document.getElementById('habit-parent');
    core.elements.habitShowStreak = document.getElementById('habit-show-streak');
    core.elements.habitIsPaused = document.getElementById('habit-is-paused');
    core.elements.habitName = document.getElementById('habit-name');
    core.elements.habitIdPreview = document.getElementById('habit-id-preview');
    core.elements.habitIdDisplay = document.getElementById('habit-id-display');
    core.elements.habitFormDetails = document.getElementById('habit-form-details');

    if (core.elements.habitName) {
      core.elements.habitName.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); core.elements.habitName.blur(); } });
      core.elements.habitName.addEventListener('blur', () => core.handleHabitNameBlur());
    }

    core.elements.customColorPicker = document.getElementById('habit-custom-color-picker');
    core.elements.customColorHex = document.getElementById('habit-custom-color-hex');
    core.elements.radioColorCustom = document.getElementById('radio-color-custom');
    core.elements.customSwatchPreview = document.getElementById('custom-swatch-preview');

    core.elements.modalCalendarPicker = document.getElementById('modal-calendar-picker');
    core.elements.modalCalendarBadge = document.getElementById('modal-calendar-habit-badge');
    core.elements.calendarInputDate = document.getElementById('calendar-input-date');

    core.elements.modalLog = document.getElementById('modal-log');
    core.elements.modalLogDateInput = document.getElementById('modal-log-date-input');
    core.elements.modalLogHabitSelect = document.getElementById('modal-log-habit-select');
    core.elements.modalLogCount = document.getElementById('modal-log-count');
    core.elements.modalLogNote = document.getElementById('modal-log-note');
    core.elements.modalLogShowOnStartup = document.getElementById('modal-log-show-on-startup');

    if (core.elements.modalLogDateInput) {
      core.elements.modalLogDateInput.addEventListener('change', (e) => {
        if (e.target.value) { core.activeLogDateKey = e.target.value; core.loadLogModalValues(); }
      });
    }

    const btnDatePrev = document.getElementById('btn-modal-date-prev');
    const btnDateNext = document.getElementById('btn-modal-date-next');
    if (btnDatePrev) btnDatePrev.addEventListener('click', () => core.shiftModalLogDate(-1));
    if (btnDateNext) btnDateNext.addEventListener('click', () => core.shiftModalLogDate(1));

    const btnIcsReminder = document.getElementById('btn-modal-ics-reminder');
    if (btnIcsReminder) {
      btnIcsReminder.addEventListener('click', () => {
        const habitId = core.elements.modalLogHabitSelect ? core.elements.modalLogHabitSelect.value : null;
        const habit = core.state.habits.find(h => h.id === habitId);
        core.downloadICSReminder(habit ? habit.name : 'Habit', core.activeLogDateKey);
      });
    }

    if (core.elements.modalLogShowOnStartup) {
      core.elements.modalLogShowOnStartup.addEventListener('change', (e) => {
        core.state.showQuickLogOnStartup = e.target.checked;
        if (core.saveState) core.saveState();
      });
    }

    core.elements.modalData = document.getElementById('modal-data');
    core.elements.habitEnableBackfill = document.getElementById('habit-enable-backfill');
    core.elements.backfillOptionsContainer = document.getElementById('backfill-options-container');
    core.elements.backfillSection = document.getElementById('backfill-section');
    core.elements.habitHistoryDuration = document.getElementById('habit-history-duration');
    core.elements.habitHistoryFrequency = document.getElementById('habit-history-frequency');
    core.elements.habitHistoryInstances = document.getElementById('habit-history-instances');

    if (core.elements.habitEnableBackfill && core.elements.backfillOptionsContainer) {
      core.elements.habitEnableBackfill.addEventListener('change', (e) => {
        if (e.target.checked) core.elements.backfillOptionsContainer.classList.remove('hidden');
        else core.elements.backfillOptionsContainer.classList.add('hidden');
      });
    }

    if (core.elements.customColorPicker) {
      core.elements.customColorPicker.addEventListener('input', (e) => {
        const color = e.target.value;
        core.elements.customColorHex.value = color;
        core.elements.radioColorCustom.checked = true;
        core.elements.customSwatchPreview.style.backgroundColor = color;
      });
    }

    if (core.elements.customColorHex) {
      core.elements.customColorHex.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        core.elements.radioColorCustom.checked = true;
        if (core.parseHexColor(val)) {
          const hex = core.normalizeHex(val);
          core.elements.customColorPicker.value = hex;
          core.elements.customSwatchPreview.style.backgroundColor = hex;
        }
      });
    }

    const modalCalendarClose = document.getElementById('modal-calendar-close');
    if (modalCalendarClose) modalCalendarClose.addEventListener('click', () => core.elements.modalCalendarPicker.classList.add('hidden'));

    const btnCalendarCancel = document.getElementById('btn-calendar-cancel');
    if (btnCalendarCancel) btnCalendarCancel.addEventListener('click', () => core.elements.modalCalendarPicker.classList.add('hidden'));

    document.querySelectorAll('.quick-date-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const daysAgo = parseInt(btn.dataset.daysAgo, 10) || 0;
        const targetDateKey = core.getDaysAgoKey(daysAgo);
        core.elements.modalCalendarPicker.classList.add('hidden');
        core.openLogModal(targetDateKey, core.activeCalendarHabit ? core.activeCalendarHabit.id : null);
      });
    });

    const btnCalendarSubmit = document.getElementById('btn-calendar-submit');
    if (btnCalendarSubmit) {
      btnCalendarSubmit.addEventListener('click', () => {
        const customDateVal = core.elements.calendarInputDate.value;
        if (customDateVal) {
          core.elements.modalCalendarPicker.classList.add('hidden');
          core.openLogModal(customDateVal, core.activeCalendarHabit ? core.activeCalendarHabit.id : null);
        }
      });
    }

    const headerBrand = document.querySelector('.header-brand');
    if (headerBrand) {
      headerBrand.addEventListener('click', (e) => {
        if (window.location.hash === '#/' || window.location.hash === '' || window.location.hash === '#') {
          e.preventDefault();
          core.navigateTo('#/');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    core.elements.btnHeaderMenu = document.getElementById('btn-header-menu');
    core.elements.headerMenuContent = document.getElementById('header-menu-content');

    if (core.elements.btnHeaderMenu && core.elements.headerMenuContent) {
      core.elements.btnHeaderMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = core.elements.headerMenuContent.classList.toggle('hidden');
        core.elements.btnHeaderMenu.setAttribute('aria-expanded', !isHidden);
      });
      document.addEventListener('click', (e) => {
        if (core.elements.headerMenuContent && !core.elements.headerMenuContent.classList.contains('hidden') && !e.target.closest('.header-menu-dropdown')) {
          core.elements.headerMenuContent.classList.add('hidden');
          core.elements.btnHeaderMenu.setAttribute('aria-expanded', 'false');
        }
      });
    }

    const menuAddHabit = document.getElementById('menu-btn-add-habit');
    if (menuAddHabit) menuAddHabit.addEventListener('click', () => { if (core.elements.headerMenuContent) core.elements.headerMenuContent.classList.add('hidden'); core.openHabitModal(); });

    const menuQuickLog = document.getElementById('menu-btn-quick-log');
    if (menuQuickLog) menuQuickLog.addEventListener('click', () => { if (core.elements.headerMenuContent) core.elements.headerMenuContent.classList.add('hidden'); core.openLogModal(core.getTodayKey()); });

    const menuDataModal = document.getElementById('menu-btn-data-modal');
    if (menuDataModal) menuDataModal.addEventListener('click', () => { if (core.elements.headerMenuContent) core.elements.headerMenuContent.classList.add('hidden'); core.elements.modalData.classList.remove('hidden'); });

    const modalHabitClose = document.getElementById('modal-habit-close');
    if (modalHabitClose) modalHabitClose.addEventListener('click', () => { core.pendingQuickLogAfterHabit = false; core.elements.modalHabit.classList.add('hidden'); });

    const btnCancelHabit = document.getElementById('btn-cancel-habit');
    if (btnCancelHabit) btnCancelHabit.addEventListener('click', () => { core.pendingQuickLogAfterHabit = false; core.elements.modalHabit.classList.add('hidden'); });

    const modalLogClose = document.getElementById('modal-log-close');
    if (modalLogClose) modalLogClose.addEventListener('click', () => core.elements.modalLog.classList.add('hidden'));

    const modalDataClose = document.getElementById('modal-data-close');
    if (modalDataClose) modalDataClose.addEventListener('click', () => core.elements.modalData.classList.add('hidden'));

    const toastCloseBtn = document.getElementById('toast-close');
    if (toastCloseBtn) toastCloseBtn.addEventListener('click', () => document.getElementById('toast-banner').classList.add('hidden'));

    const handleCSVUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        core.parseCSVAndImport(event.target.result, file.name);
        e.target.value = '';
        if (core.elements.modalData) core.elements.modalData.classList.add('hidden');
      };
      reader.readAsText(file);
    };

    const inputModalCsv = document.getElementById('input-modal-csv');
    if (inputModalCsv) inputModalCsv.addEventListener('change', handleCSVUpload);

    if (core.elements.formHabit) core.elements.formHabit.addEventListener('submit', core.handleHabitFormSubmit);

    const btnCounterMinus = document.getElementById('btn-counter-minus');
    if (btnCounterMinus) btnCounterMinus.addEventListener('click', () => {
      let val = parseInt(core.elements.modalLogCount.value, 10) || 0;
      if (val > 0) core.elements.modalLogCount.value = val - 1;
    });

    const btnCounterPlus = document.getElementById('btn-counter-plus');
    if (btnCounterPlus) btnCounterPlus.addEventListener('click', () => {
      let val = parseInt(core.elements.modalLogCount.value, 10) || 0;
      core.elements.modalLogCount.value = val + 1;
    });

    const btnSaveLog = document.getElementById('btn-save-log');
    if (btnSaveLog) btnSaveLog.addEventListener('click', core.handleSaveLog);
    const btnClearLog = document.getElementById('btn-clear-log');
    if (btnClearLog) btnClearLog.addEventListener('click', core.handleClearLog);

    if (core.elements.yearSelector) {
      core.elements.yearSelector.addEventListener('change', (e) => {
        core.state.selectedYear = parseInt(e.target.value, 10);
        if (core.saveState) core.saveState();
        if (core.renderAll) core.renderAll();
      });
    }

    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) btnExportJson.addEventListener('click', core.exportDataJSON);

    const inputImportJson = document.getElementById('input-import-json');
    if (inputImportJson) inputImportJson.addEventListener('change', core.importDataJSON);

    const btnResetData = document.getElementById('btn-reset-data');
    if (btnResetData) btnResetData.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete ALL habits and history? This cannot be undone.')) {
        localStorage.removeItem(core.STORAGE_KEY);
        core.state.habits = [];
        core.state.selectedHabitId = 'all';
        if (core.saveState) core.saveState();
        core.navigateTo('#/');
        if (core.elements.modalData) core.elements.modalData.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (core.focusedDayState.dateStr && !e.target.closest('.heatmap-card') && !e.target.closest('.modal-backdrop')) {
        core.focusedDayState = { habitId: null, dateStr: null };
        if (core.renderAll) core.renderAll();
      }
    });
  };

  core.attachHeatmapSquareEvents = function() {
    const cards = core.elements.heatmapsGallery.querySelectorAll('.heatmap-card');
    cards.forEach(card => {
      const squares = card.querySelectorAll('.day-square[data-date]');
      squares.forEach(sq => {
        let longPressTimer = null, startX = 0, startY = 0;
        const cancelLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
        const startLongPress = (e) => {
          if (e.button !== undefined && e.button !== 0) return;
          cancelLongPress(); sq._isLongPressTriggered = false;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          startX = clientX; startY = clientY;
          longPressTimer = setTimeout(() => {
            sq._isLongPressTriggered = true; longPressTimer = null;
            if (typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(40); } catch (err) {} }
            if (core.elements.customTooltip) core.elements.customTooltip.classList.add('hidden');
            const dateStr = sq.dataset.date;
            let targetHabitId = sq.dataset.habitId;
            if (!targetHabitId || targetHabitId === 'all' || targetHabitId.startsWith('group_')) targetHabitId = card.getAttribute('data-habit-id') || 'all';
            core.openLogModal(dateStr, targetHabitId);
          }, 500);
        };
        const moveLongPress = (e) => {
          if (!longPressTimer) return;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          if (Math.hypot(clientX - startX, clientY - startY) > 10) cancelLongPress();
        };

        if (typeof window !== 'undefined' && window.PointerEvent) {
          sq.addEventListener('pointerdown', startLongPress); sq.addEventListener('pointermove', moveLongPress);
          sq.addEventListener('pointerup', cancelLongPress); sq.addEventListener('pointercancel', cancelLongPress);
        } else {
          sq.addEventListener('mousedown', startLongPress); sq.addEventListener('mousemove', moveLongPress);
          sq.addEventListener('mouseup', cancelLongPress); sq.addEventListener('touchstart', startLongPress, { passive: true });
          sq.addEventListener('touchmove', moveLongPress, { passive: true }); sq.addEventListener('touchend', cancelLongPress); sq.addEventListener('touchcancel', cancelLongPress);
        }
        sq.addEventListener('contextmenu', (e) => { if (sq._isLongPressTriggered) e.preventDefault(); });
      });

      card.addEventListener('click', (e) => {
        if (e.target.closest('.focused-day-toolbar') || e.target.closest('.card-header-actions') || e.target.closest('.card-context-menu-dropdown') || e.target.closest('.btn-card-menu-toggle')) return;
        const sq = e.target.closest('.day-square[data-date]');
        if (sq && sq._isLongPressTriggered) { sq._isLongPressTriggered = false; e.stopPropagation(); e.preventDefault(); return; }
        e.stopPropagation();
        if (core.elements.customTooltip) core.elements.customTooltip.classList.add('hidden');
        const cardHabitId = card.getAttribute('data-habit-id') || 'all';
        let targetHabitId = cardHabitId;
        if (sq && sq.dataset.habitId && sq.dataset.habitId !== 'all' && !sq.dataset.habitId.startsWith('group_')) targetHabitId = sq.dataset.habitId;
        core.openLogModal(core.getTodayKey(), targetHabitId);
      });
    });

    const squares = core.elements.heatmapsGallery.querySelectorAll('.day-square[data-date]');
    squares.forEach(sq => {
      sq.addEventListener('mouseenter', (e) => {
        const dateStr = sq.dataset.date;
        const habitId = sq.dataset.habitId;
        const count = parseInt(sq.dataset.count, 10) || 0;
        const isRelapse = sq.dataset.relapse === 'true';
        const isPaused = sq.dataset.paused === 'true';
        const note = sq.dataset.note;
        const habitsDone = sq.dataset.habitsDone;
        const formattedDate = core.formatPrettyDate(dateStr);

        let text = '';
        if (isPaused) text = `⏸️ <strong>Paused (Tracking paused)</strong> on ${formattedDate}`;
        else if (isRelapse) text = `<strong>Relapse logged</strong> (${note || 'Slip day'}) on ${formattedDate}`;
        else if (habitId.startsWith('all') || habitId.startsWith('group_')) {
          if (habitsDone) text = `✨ <strong>Completed (${count}):</strong> ${habitsDone} on ${formattedDate}`;
          else text = `No check-ins on ${formattedDate}`;
        } else {
          const habit = core.state.habits.find(h => h.id === habitId);
          if (habit && habit.type === 'negative') text = count > 0 ? `✨ <strong>Clean Day Success</strong> on ${formattedDate}` : `No data for ${formattedDate}`;
          else {
            const dailyTarget = habit ? Math.max(1, habit.dailyTarget || 1) : 1;
            if (dailyTarget > 1) {
              const status = count >= dailyTarget ? ' 🎉 Goal Met!' : '';
              text = `<strong>${count}/${dailyTarget} completed${status}</strong> on ${formattedDate}`;
            } else text = `<strong>${count} completion${count === 1 ? '' : 's'}</strong> on ${formattedDate}`;
          }
        }
        core.elements.customTooltip.innerHTML = text;
        core.elements.customTooltip.classList.remove('hidden');

        const rect = sq.getBoundingClientRect();
        const tooltipWidth = core.elements.customTooltip.offsetWidth;
        const tooltipHeight = core.elements.customTooltip.offsetHeight;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const padding = 8;
        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        left = Math.max(padding, Math.min(left, viewportWidth - tooltipWidth - padding));
        const gap = 8;
        let top = rect.top - tooltipHeight - gap;
        if (top < padding) top = rect.bottom + gap;
        top = Math.max(padding, Math.min(top, viewportHeight - tooltipHeight - padding));
        core.elements.customTooltip.style.left = `${left}px`;
        core.elements.customTooltip.style.top = `${top}px`;
      });
      sq.addEventListener('mouseleave', () => { core.elements.customTooltip.classList.add('hidden'); });
    });

    const dateInput = core.elements.heatmapsGallery.querySelector('.focused-date-input');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        e.stopPropagation();
        const newDate = e.target.value;
        if (newDate) {
          const newYear = parseInt(newDate.split('-')[0], 10);
          if (newYear && newYear !== core.state.selectedYear && core.getAvailableYears().includes(newYear)) core.state.selectedYear = newYear;
          core.focusedDayState.dateStr = newDate;
          if (core.renderAll) core.renderAll();
        }
      });
      dateInput.addEventListener('click', (e) => e.stopPropagation());
    }

    const actionButtons = core.elements.heatmapsGallery.querySelectorAll('[data-action-habit-id]');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        core.toggleHabitForDate(btn.dataset.actionHabitId, btn.dataset.actionDateKey);
      });
    });

    const closeToolbarBtn = core.elements.heatmapsGallery.querySelector('#btn-close-focused-toolbar');
    if (closeToolbarBtn) {
      closeToolbarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        core.focusedDayState = { habitId: null, dateStr: null };
        if (core.renderAll) core.renderAll();
      });
    }

    core.elements.heatmapsGallery.querySelectorAll('.btn-card-menu-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.closest('.card-context-menu-dropdown');
        if (!dropdown) return;
        const menu = dropdown.querySelector('.card-menu-content');
        if (!menu) return;
        core.elements.heatmapsGallery.querySelectorAll('.card-menu-content').forEach(m => {
          if (m !== menu) {
            m.classList.add('hidden');
            const otherCard = m.closest('.heatmap-card');
            if (otherCard) otherCard.classList.remove('menu-open');
          }
        });
        const isHidden = menu.classList.toggle('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.toggle('menu-open', !isHidden);
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.card-context-menu-dropdown') && core.elements.heatmapsGallery) {
        core.elements.heatmapsGallery.querySelectorAll('.card-menu-content').forEach(m => m.classList.add('hidden'));
        core.elements.heatmapsGallery.querySelectorAll('.heatmap-card.menu-open').forEach(c => c.classList.remove('menu-open'));
      }
    });

    core.elements.heatmapsGallery.querySelectorAll('.btn-card-add-sub').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        core.openHabitModal(null, btn.dataset.habitId);
      });
    });

    core.elements.heatmapsGallery.querySelectorAll('.btn-card-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        const habit = core.state.habits.find(h => h.id === btn.dataset.habitId);
        if (habit) core.openHabitModal(habit);
      });
    });

    core.elements.heatmapsGallery.querySelectorAll('.btn-card-pause').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        const habit = core.state.habits.find(h => h.id === btn.dataset.habitId);
        if (habit) {
          core.setHabitPauseState(habit, !habit.isPaused);
          if (core.saveState) core.saveState();
          if (core.renderAll) core.renderAll();
        }
      });
    });

    core.elements.heatmapsGallery.querySelectorAll('.btn-card-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        core.deleteHabit(btn.dataset.habitId);
      });
    });

    core.elements.heatmapsGallery.querySelectorAll('.card-title-link, .badge-subhabits').forEach(el => {
      el.addEventListener('click', (e) => e.stopPropagation());
    });
  };

  core.getHabitIdFromCardId = function(idStr) {
    if (!idStr) return null;
    if (idStr.startsWith('group_')) return idStr.replace('group_', '').split('_')[0];
    return idStr;
  };

  core.attachCardDragAndDropHandlers = function() {
    let draggedHabitId = null;
    const cards = core.elements.heatmapsGallery.querySelectorAll('.heatmap-card.draggable-card');
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
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        if (card.dataset.habitId !== draggedHabitId) card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => { card.classList.remove('drag-over'); });
      card.addEventListener('drop', (e) => {
        e.preventDefault(); card.classList.remove('drag-over');
        const targetHabitId = card.dataset.habitId;
        if (draggedHabitId && targetHabitId && draggedHabitId !== targetHabitId) {
          const fromId = core.getHabitIdFromCardId(draggedHabitId);
          const toId = core.getHabitIdFromCardId(targetHabitId);
          if (fromId && toId && fromId !== toId) {
            const fromIndex = core.state.habits.findIndex(h => h.id === fromId);
            const toIndex = core.state.habits.findIndex(h => h.id === toId);
            if (fromIndex !== -1 && toIndex !== -1) {
              const [movedHabit] = core.state.habits.splice(fromIndex, 1);
              core.state.habits.splice(toIndex, 0, movedHabit);
              if (core.saveState) core.saveState();
              if (core.renderAll) core.renderAll();
              core.showToast(`Reordered "${movedHabit.name}"`);
            }
          }
        }
      });
    });
  };

  core.updateFrequencyOptionsVisibility = function() {
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
  };

  core.openHabitModal = function(habitToEdit = null, defaultParentId = null) {
    if (core.elements.formHabit) core.elements.formHabit.reset();
    const selectedParentId = habitToEdit ? (habitToEdit.parentId || '') : (defaultParentId || '');
    const parentSelect = document.getElementById('habit-parent');
    if (parentSelect) parentSelect.innerHTML = core.buildParentSelectOptions(habitToEdit ? habitToEdit.id : null, selectedParentId);

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
        if (depVal === 'requires_parent') parentDepHint.textContent = `Requires "${parentName}" to be logged on the same day. Auto-logs "${parentName}" if not yet done when you check this off.`;
        else if (depVal === 'auto_log_parent') parentDepHint.textContent = `Logging this sub-habit will automatically log / increment "${parentName}" for the same date.`;
        else if (depVal === 'auto_complete_from_parent') parentDepHint.textContent = `Logging "${parentName}" will automatically mark this sub-habit as complete for the same date.`;
        else if (depVal === 'parent_days_only') parentDepHint.textContent = `Goal & streak for this sub-habit are active ONLY on days when you complete "${parentName}". Non-parent days will not break your sub-habit streak.`;
        else parentDepHint.textContent = `Independent sub-habit. Can be logged on any day regardless of "${parentName}".`;
      }
    }

    if (parentSelect) {
      parentSelect.onchange = () => {
        updateParentDependencyUI();
        if (core.elements.habitName && core.elements.habitName.value.trim().length > 0) core.handleHabitNameBlur();
      };
    }
    if (parentDepSelect) parentDepSelect.onchange = updateParentDependencyUI;

    const freqSelect = document.getElementById('habit-frequency-type');
    if (freqSelect) {
      freqSelect.value = habitToEdit ? (habitToEdit.frequencyType || 'daily') : 'daily';
      freqSelect.onchange = core.updateFrequencyOptionsVisibility;
    }
    core.updateFrequencyOptionsVisibility();

    if (habitToEdit) {
      if (core.elements.modalHabitTitle) core.elements.modalHabitTitle.textContent = 'Edit Habit Goal';
      document.getElementById('habit-id').value = habitToEdit.id;
      document.getElementById('habit-name').value = habitToEdit.name;
      if (core.elements.habitIdDisplay) core.elements.habitIdDisplay.textContent = habitToEdit.id;
      if (core.elements.habitIdPreview) core.elements.habitIdPreview.classList.remove('hidden');
      if (core.elements.habitFormDetails) core.elements.habitFormDetails.classList.remove('hidden');
      document.getElementById('habit-description').value = habitToEdit.description || '';
      document.getElementById('habit-category').value = habitToEdit.category || 'General';
      document.getElementById('habit-daily-target').value = habitToEdit.dailyTarget || 1;
      if (core.elements.habitShowStreak) core.elements.habitShowStreak.checked = habitToEdit.showStreak === true;
      if (core.elements.habitIsPaused) core.elements.habitIsPaused.checked = habitToEdit.isPaused === true;
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
        const checkboxes = core.elements.formHabit.querySelectorAll('input[name="target-days"]');
        checkboxes.forEach(chk => { chk.checked = targetDays.includes(parseInt(chk.value, 10)); });
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

      if (core.elements.backfillSection) core.elements.backfillSection.classList.remove('hidden');
      if (core.elements.habitEnableBackfill) core.elements.habitEnableBackfill.checked = false;
      if (core.elements.backfillOptionsContainer) core.elements.backfillOptionsContainer.classList.add('hidden');
      if (core.elements.habitHistoryDuration) core.elements.habitHistoryDuration.value = '30';
      if (core.elements.habitHistoryFrequency) core.elements.habitHistoryFrequency.value = 'frequent';
      if (core.elements.habitHistoryInstances) core.elements.habitHistoryInstances.value = '1';

      const typeRadio = core.elements.formHabit.querySelector(`input[name="habit-type"][value="${habitToEdit.type || 'positive'}"]`);
      if (typeRadio) typeRadio.checked = true;

      const isCustomHex = habitToEdit.colorTheme && habitToEdit.colorTheme.startsWith('#');
      if (isCustomHex) {
        if (core.elements.radioColorCustom) core.elements.radioColorCustom.checked = true;
        const normalized = core.normalizeHex(habitToEdit.colorTheme);
        if (core.elements.customColorHex) core.elements.customColorHex.value = normalized;
        if (core.elements.customColorPicker) core.elements.customColorPicker.value = normalized;
        if (core.elements.customSwatchPreview) core.elements.customSwatchPreview.style.backgroundColor = normalized;
      } else {
        const colorRadio = core.elements.formHabit.querySelector(`input[name="habit-color"][value="${habitToEdit.colorTheme || 'green'}"]`);
        if (colorRadio) colorRadio.checked = true;
        if (core.elements.customSwatchPreview) core.elements.customSwatchPreview.style.backgroundColor = 'transparent';
      }
    } else {
      if (core.elements.modalHabitTitle) core.elements.modalHabitTitle.textContent = defaultParentId ? 'Create New Sub-Habit' : 'Create New Habit';
      document.getElementById('habit-id').value = '';
      if (core.elements.habitName) core.elements.habitName.value = '';
      if (core.elements.habitIdDisplay) core.elements.habitIdDisplay.textContent = '';
      if (core.elements.habitIdPreview) core.elements.habitIdPreview.classList.add('hidden');
      if (core.elements.habitFormDetails) core.elements.habitFormDetails.classList.add('hidden');
      if (core.elements.customSwatchPreview) core.elements.customSwatchPreview.style.backgroundColor = 'transparent';
      if (core.elements.habitShowStreak) core.elements.habitShowStreak.checked = false;
      if (core.elements.habitIsPaused) core.elements.habitIsPaused.checked = false;
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

      const checkboxes = core.elements.formHabit.querySelectorAll('input[name="target-days"]');
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

      if (core.elements.backfillSection) core.elements.backfillSection.classList.remove('hidden');
      if (core.elements.habitEnableBackfill) core.elements.habitEnableBackfill.checked = false;
      if (core.elements.backfillOptionsContainer) core.elements.backfillOptionsContainer.classList.add('hidden');
      if (core.elements.habitHistoryDuration) core.elements.habitHistoryDuration.value = '30';
      if (core.elements.habitHistoryFrequency) core.elements.habitHistoryFrequency.value = 'frequent';
      if (core.elements.habitHistoryInstances) core.elements.habitHistoryInstances.value = '1';
    }

    const typeRadios = core.elements.formHabit ? core.elements.formHabit.querySelectorAll('input[name="habit-type"]') : [];
    typeRadios.forEach(radio => { radio.onchange = core.updateBackfillWordingUI; });
    core.updateBackfillWordingUI();
    updateParentDependencyUI();
    if (core.elements.modalHabit) core.elements.modalHabit.classList.remove('hidden');
  };

  core.handleHabitNameBlur = function() {
    if (!core.elements.habitName) return;
    const nameVal = core.elements.habitName.value.trim();
    const currentIdInput = document.getElementById('habit-id');
    const currentId = currentIdInput ? currentIdInput.value : '';
    const isEditMode = Boolean(currentId);

    if (nameVal.length > 0) {
      const parentSelect = document.getElementById('habit-parent');
      const parentIdVal = parentSelect ? parentSelect.value.trim() : '';
      let derivedId = currentId;
      if (!isEditMode) derivedId = (parentIdVal ? parentIdVal + '_' : '') + core.idFromName(nameVal);

      if (core.elements.habitIdDisplay) core.elements.habitIdDisplay.textContent = derivedId;
      if (core.elements.habitIdPreview) core.elements.habitIdPreview.classList.remove('hidden');
      if (core.elements.habitFormDetails) core.elements.habitFormDetails.classList.remove('hidden');

      if (!isEditMode && typeof Please !== 'undefined') {
        const derivedColor = Please.make_color({ from_hash: derivedId });
        if (derivedColor && typeof derivedColor === 'string') {
          const normalized = core.normalizeHex(derivedColor);
          if (core.elements.radioColorCustom) core.elements.radioColorCustom.checked = true;
          if (core.elements.customColorHex) core.elements.customColorHex.value = normalized;
          if (core.elements.customColorPicker) core.elements.customColorPicker.value = normalized;
          if (core.elements.customSwatchPreview) core.elements.customSwatchPreview.style.backgroundColor = normalized;
        }
      }
    } else if (!isEditMode) {
      if (core.elements.habitIdPreview) core.elements.habitIdPreview.classList.add('hidden');
      if (core.elements.habitFormDetails) core.elements.habitFormDetails.classList.add('hidden');
    }
  };

  core.buildParentSelectOptions = function(excludeId = null, currentParentId = null) {
    let html = `<option value="">None (Top-Level Habit)</option>`;
    const invalidIds = new Set();
    if (excludeId) core.getAllDescendantIds(excludeId).forEach(id => invalidIds.add(id));

    function appendHabitOptions(parentId = null, depth = 0) {
      const children = core.state.habits.filter(h => (h.parentId || null) === parentId);
      children.forEach(h => {
        if (invalidIds.has(h.id)) return;
        const indent = '&nbsp;&nbsp;'.repeat(depth) + (depth > 0 ? '↳ ' : '');
        const isSelected = h.id === currentParentId;
        const pausedSuffix = h.isPaused ? ' (Paused)' : '';
        html += `<option value="${h.id}" ${isSelected ? 'selected' : ''}>${indent}${core.escapeHTML(h.name)}${pausedSuffix}</option>`;
        appendHabitOptions(h.id, depth + 1);
      });
    }

    appendHabitOptions(null, 0);
    return html;
  };

  core.updateBackfillWordingUI = function() {
    const typeRadio = core.elements.formHabit ? core.elements.formHabit.querySelector('input[name="habit-type"]:checked') : null;
    const isNegative = typeRadio ? typeRadio.value === 'negative' : false;

    const titleEl = document.getElementById('backfill-checkbox-title');
    const descEl = document.getElementById('backfill-checkbox-desc');
    const freqLabel = document.getElementById('label-history-frequency');
    const freqSelect = document.getElementById('habit-history-frequency');
    const groupInstances = document.getElementById('group-history-instances');

    if (titleEl) titleEl.innerHTML = isNegative ? '<strong>Add Past History / Backfill Clean Days</strong>' : '<strong>Add Past History / Backfill Progress</strong>';
    if (descEl) descEl.textContent = isNegative ? 'Fill in past history showing clean days vs slip-ups.' : 'Fill out past heatmap activity so you don\'t start from a blank canvas.';
    if (freqLabel) freqLabel.textContent = isNegative ? 'How consistently were you clean / avoided the bad habit?' : 'How consistently did you complete this habit?';
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
      if (isNegative) groupInstances.classList.add('hidden');
      else groupInstances.classList.remove('hidden');
    }
  };

  core.handleHabitFormSubmit = function(e) {
    if (e && e.preventDefault) e.preventDefault();
    const formEl = core.elements.formHabit || document.getElementById('form-habit');
    let formData = null;
    try {
      if (formEl && typeof FormData !== 'undefined') {
        formData = new FormData(formEl);
      }
    } catch (err) {
      formData = null;
    }
    const getVal = (key) => (formData && formData.get) ? formData.get(key) : null;
    const hasVal = (key) => (formData && formData.has) ? formData.has(key) : false;

    const id = getVal('habit-id') || (document.getElementById('habit-id') ? document.getElementById('habit-id').value : '');
    const name = (getVal('habit-name') || (document.getElementById('habit-name') ? document.getElementById('habit-name').value : '')).trim();
    const typeRadio = formEl ? formEl.querySelector('input[name="habit-type"]:checked') : null;
    const type = typeRadio ? typeRadio.value : (getVal('habit-type') || 'positive');
    const description = (getVal('habit-description') || (document.getElementById('habit-description') ? document.getElementById('habit-description').value : '')).trim();
    const category = (getVal('habit-category') || (document.getElementById('habit-category') ? document.getElementById('habit-category').value : '')).trim();
    const dailyTargetInput = document.getElementById('habit-daily-target');
    const dailyTarget = parseInt(getVal('habit-daily-target') || (dailyTargetInput ? dailyTargetInput.value : '1'), 10) || 1;
    const colorRadio = formEl ? formEl.querySelector('input[name="habit-color"]:checked') : null;
    const selectedColorRadio = colorRadio ? colorRadio.value : (getVal('habit-color') || 'green');
    const parentIdVal = (getVal('habit-parent') || (document.getElementById('habit-parent') ? document.getElementById('habit-parent').value : '')).trim();
    const parentId = parentIdVal ? parentIdVal : null;
    const parentDepSelect = document.getElementById('habit-parent-dependency');
    const parentDependency = parentId ? (getVal('habit-parent-dependency') || (parentDepSelect ? parentDepSelect.value : 'none')) : 'none';
    const showStreak = core.elements.habitShowStreak ? core.elements.habitShowStreak.checked : hasVal('habit-show-streak');
    const isPaused = core.elements.habitIsPaused ? core.elements.habitIsPaused.checked : hasVal('habit-is-paused');

    const freqSelect = document.getElementById('habit-frequency-type');
    const freqType = getVal('habit-frequency-type') || (freqSelect ? freqSelect.value : 'daily');
    let targetDays = [1], weeklyTarget = 1, monthlyDay = '1', monthlyTarget = 1, colorWholeWeek = true, colorWholeMonth = true, customTarget = 1, customInterval = 3, customUnit = 'days';

    if (freqType === 'weekly') {
      const dayVal = parseInt(getVal('habit-weekly-day') || (document.getElementById('habit-weekly-day') ? document.getElementById('habit-weekly-day').value : '1'), 10);
      targetDays = [isNaN(dayVal) ? 1 : dayVal];
      weeklyTarget = parseInt(getVal('habit-weekly-target') || (document.getElementById('habit-weekly-target') ? document.getElementById('habit-weekly-target').value : '1'), 10) || 1;
      const chk = document.getElementById('habit-color-whole-week');
      colorWholeWeek = chk ? chk.checked : hasVal('habit-color-whole-week');
    } else if (freqType === 'monthly') {
      monthlyDay = getVal('habit-monthly-day') || (document.getElementById('habit-monthly-day') ? document.getElementById('habit-monthly-day').value : '1');
      monthlyTarget = parseInt(getVal('habit-monthly-target') || (document.getElementById('habit-monthly-target') ? document.getElementById('habit-monthly-target').value : '1'), 10) || 1;
      const chk = document.getElementById('habit-color-whole-month');
      colorWholeMonth = chk ? chk.checked : hasVal('habit-color-whole-month');
    } else if (freqType === 'specific_days') {
      const checkedBtns = formEl ? Array.from(formEl.querySelectorAll('input[name="target-days"]:checked')) : [];
      targetDays = checkedBtns.map(cb => parseInt(cb.value, 10));
      if (targetDays.length === 0) targetDays = [1];
      weeklyTarget = targetDays.length;
      const chk = document.getElementById('habit-specific-color-whole-week');
      colorWholeWeek = chk ? chk.checked : hasVal('habit-specific-color-whole-week');
    } else if (freqType === 'custom_interval') {
      customTarget = parseInt(getVal('habit-custom-target') || (document.getElementById('habit-custom-target') ? document.getElementById('habit-custom-target').value : '1'), 10) || 1;
      customInterval = parseInt(getVal('habit-custom-interval') || (document.getElementById('habit-custom-interval') ? document.getElementById('habit-custom-interval').value : '3'), 10) || 3;
      customUnit = getVal('habit-custom-unit') || (document.getElementById('habit-custom-unit') ? document.getElementById('habit-custom-unit').value : 'days');
    }

    let colorTheme = typeof Please !== 'undefined' ? Please.make_color({ from_hash: id || name || 'default' }) : 'green';
    if (selectedColorRadio === 'custom') {
      const hexVal = core.elements.customColorHex.value;
      colorTheme = core.normalizeHex(hexVal);
    } else {
      colorTheme = selectedColorRadio;
    }

    if (!name) return;

    if (id) {
      const habit = core.state.habits.find(h => h.id === id);
      if (habit) {
        habit.name = name; habit.type = type; habit.description = description; habit.category = category; habit.dailyTarget = dailyTarget; habit.showStreak = showStreak;
        core.setHabitPauseState(habit, isPaused);
        habit.frequencyType = freqType; habit.targetDays = targetDays; habit.weeklyTarget = weeklyTarget; habit.monthlyDay = monthlyDay; habit.monthlyTarget = monthlyTarget; habit.colorWholeWeek = colorWholeWeek; habit.colorWholeMonth = colorWholeMonth; habit.customTarget = customTarget; habit.customInterval = customInterval; habit.customUnit = customUnit; habit.colorTheme = colorTheme; habit.parentId = parentId; habit.parentDependency = parentDependency;

        if (core.elements.habitEnableBackfill && core.elements.habitEnableBackfill.checked) {
          const durationVal = core.elements.habitHistoryDuration ? core.elements.habitHistoryDuration.value : '30';
          const frequencyVal = core.elements.habitHistoryFrequency ? core.elements.habitHistoryFrequency.value : 'frequent';
          const instancesVal = core.elements.habitHistoryInstances ? core.elements.habitHistoryInstances.value : '1';
          const result = core.generateBackfillLogs(durationVal, frequencyVal, instancesVal, dailyTarget, type, freqType, targetDays, monthlyDay, monthlyTarget, weeklyTarget);
          if (!habit.logs) habit.logs = {};
          Object.keys(result.logs).forEach(dateKey => {
            if (!habit.logs[dateKey]) habit.logs[dateKey] = result.logs[dateKey];
          });
          if (!habit.createdAt || result.startDateKey < habit.createdAt) habit.createdAt = result.startDateKey;
        }
      }
    } else {
      let backfilledLogs = {};
      let createdAtKey = core.getTodayKey();
      if (core.elements.habitEnableBackfill && core.elements.habitEnableBackfill.checked) {
        const durationVal = core.elements.habitHistoryDuration ? core.elements.habitHistoryDuration.value : '30';
        const frequencyVal = core.elements.habitHistoryFrequency ? core.elements.habitHistoryFrequency.value : 'frequent';
        const instancesVal = core.elements.habitHistoryInstances ? core.elements.habitHistoryInstances.value : '1';
        const result = core.generateBackfillLogs(durationVal, frequencyVal, instancesVal, dailyTarget, type, freqType, targetDays, monthlyDay, monthlyTarget, weeklyTarget);
        backfilledLogs = result.logs;
        createdAtKey = result.startDateKey;
      }
      const newHabit = {
        id: (parentId ? parentId + '_' : '') + core.idFromName(name),
        name, type, description, category, showStreak, isPaused, pauseHistory: isPaused ? [{ startDate: core.getTodayKey(), endDate: null }] : [],
        colorTheme, dailyTarget, frequencyType: freqType, targetDays, weeklyTarget, monthlyDay, monthlyTarget, colorWholeWeek, colorWholeMonth, customTarget, customInterval, customUnit, parentId, parentDependency, createdAt: createdAtKey, logs: backfilledLogs
      };
      core.state.habits.push(newHabit);
      core.state.selectedHabitId = newHabit.id;
    }

    if (core.saveState) core.saveState();
    if (core.elements.modalHabit) core.elements.modalHabit.classList.add('hidden');
    if (core.renderAll) core.renderAll();

    if (core.pendingQuickLogAfterHabit) {
      core.pendingQuickLogAfterHabit = false;
      const createdHabitId = id || (core.state.habits.length > 0 ? core.state.habits[core.state.habits.length - 1].id : null);
      core.openLogModal(core.activeLogDateKey || core.getTodayKey(), createdHabitId);
    } else if (!id) {
      if (parentId) core.navigateTo(`#/habit/${parentId}`);
      else core.navigateTo(`#/habit/${core.state.selectedHabitId}`);
    }
  };

  core.deleteHabit = function(habitId) {
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit) return;
    const subHabits = core.state.habits.filter(h => h.parentId === habitId);
    let msg = `Are you sure you want to delete "${habit.name}"?`;
    if (subHabits.length > 0) msg += ` Its ${subHabits.length} sub-habit(s) will become top-level habits.`;

    if (confirm(msg)) {
      core.state.habits = core.state.habits.filter(h => h.id !== habitId);
      subHabits.forEach(sub => { sub.parentId = habit.parentId || null; });
      if (core.saveState) core.saveState();

      const route = core.parseHash ? core.parseHash() : { view: 'home' };
      if (route.view === 'habit' && route.habitId === habitId) {
        if (habit.parentId) core.navigateTo(`#/habit/${habit.parentId}`);
        else core.navigateTo('#/');
      } else {
        if (core.renderAll) core.renderAll();
      }
      core.showToast(`Deleted "${habit.name}"`);
    }
  };

  core.deleteSelectedHabit = function() {
    if (core.state.selectedHabitId === 'all') return;
    core.deleteHabit(core.state.selectedHabitId);
  };

  core.openLogModal = function(dateStr, preferredHabitId = null) {
    core.activeLogDateKey = dateStr;
    if (core.state.habits.length === 0) {
      core.pendingQuickLogAfterHabit = true;
      if (core.openHabitModal) core.openHabitModal();
      return;
    }
    if (core.elements.modalLogDateInput) core.elements.modalLogDateInput.value = dateStr;

    let habitSelectHTML = '';
    function appendLogOptions(parentId = null, depth = 0) {
      const children = core.state.habits.filter(h => (h.parentId || null) === parentId);
      children.forEach(h => {
        const indent = '&nbsp;&nbsp;'.repeat(depth) + (depth > 0 ? '↳ ' : '');
        const icon = h.type === 'negative' ? '🛑 ' : '';
        const pausedSuffix = h.isPaused ? ' (Paused)' : '';
        const pageId = (typeof window !== 'undefined' && window.location) ? window.location.toString().split("/").slice(-1)[0] : '';
        if (pageId == h.id) habitSelectHTML += `<option value="${h.id}" selected>${indent}${icon}${core.escapeHTML(h.name)}${pausedSuffix}</option>`;
        else habitSelectHTML += `<option value="${h.id}">${indent}${icon}${core.escapeHTML(h.name)}${pausedSuffix}</option>`;
        appendLogOptions(h.id, depth + 1);
      });
    }
    appendLogOptions(null, 0);

    if (core.elements.modalLogHabitSelect) {
      core.elements.modalLogHabitSelect.innerHTML = habitSelectHTML || '<option value="">No habits</option>';
      let targetId = (preferredHabitId && preferredHabitId !== 'all' && !preferredHabitId.startsWith('group_')) ? preferredHabitId : core.state.selectedHabitId;
      if (targetId !== 'all' && core.state.habits.some(h => h.id === targetId)) {
        core.elements.modalLogHabitSelect.value = targetId;
      }
      core.elements.modalLogHabitSelect.onchange = () => core.loadLogModalValues();
    }
    core.loadLogModalValues();
    if (core.elements.modalLogShowOnStartup) core.elements.modalLogShowOnStartup.checked = !!core.state.showQuickLogOnStartup;
    if (core.elements.modalLog) core.elements.modalLog.classList.remove('hidden');
  };

  core.shiftModalLogDate = function(days) {
    if (!core.activeLogDateKey) core.activeLogDateKey = core.getTodayKey();
    const d = core.parseDateKey(core.activeLogDateKey);
    d.setDate(d.getDate() + days);
    core.activeLogDateKey = core.formatDateKey(d);
    if (core.elements.modalLogDateInput) core.elements.modalLogDateInput.value = core.activeLogDateKey;
    core.loadLogModalValues();
  };

  core.updateReminderLinks = function(habitName, dateStr) {
    const cleanDate = dateStr.replace(/-/g, '');
    const gCalStart = `${cleanDate}T090000`;
    const gCalEnd = `${cleanDate}T093000`;
    const title = encodeURIComponent(`Habit Reminder: ${habitName}`);
    const details = encodeURIComponent(`Reminder to complete habit "${habitName}" in Habitual.`);
    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${gCalStart}/${gCalEnd}&details=${details}`;
    const linkGCal = document.getElementById('link-modal-google-cal');
    if (linkGCal) linkGCal.href = gCalUrl;
  };

  core.generateICSFile = function(habitName, dateStr) {
    const cleanDate = dateStr.replace(/-/g, '');
    const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const uid = `habitual-${Date.now()}-${cleanDate}@habitual.app`;
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Habitual//Habit Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${nowIso}`, `DTSTART:${cleanDate}T090000`, `DTEND:${cleanDate}T093000`,
      `SUMMARY:Habit Reminder: ${habitName}`, `DESCRIPTION:Reminder to log habit "${habitName}" in Habitual.`, 'STATUS:CONFIRMED',
      'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:Reminder to log habit "${habitName}"`,
      'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
  };

  core.downloadICSReminder = function(habitName, dateStr) {
    const icsData = core.generateICSFile(habitName, dateStr);
    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sanitizedName = habitName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    a.download = `${sanitizedName}_reminder_${dateStr}.ics`;
    document.body.appendChild(a);
    a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  core.loadLogModalValues = function() {
    if (!core.elements.modalLogHabitSelect) return;
    const habitId = core.elements.modalLogHabitSelect.value;
    const habit = core.state.habits.find(h => h.id === habitId);

    const countLabel = document.getElementById('modal-log-count-label');
    const countHint = document.getElementById('modal-log-count-hint');

    if (countLabel) countLabel.textContent = (habit && habit.type === 'negative') ? 'Relapse / Slip Count' : 'Completion Count';
    if (countHint) countHint.textContent = (habit && habit.type === 'negative') ? '0 = Clean Day Success. 1+ = Relapse/Slip occurred.' : 'Number of times target was completed on this day.';

    if (habit && habit.logs && habit.logs[core.activeLogDateKey]) {
      core.elements.modalLogCount.value = habit.logs[core.activeLogDateKey].count || 0;
      core.elements.modalLogNote.value = habit.logs[core.activeLogDateKey].note || '';
    } else {
      core.elements.modalLogCount.value = (habit && habit.type === 'negative') ? 0 : 1;
      core.elements.modalLogNote.value = '';
    }

    const todayStr = core.getTodayKey();
    const reminderBox = document.getElementById('modal-log-reminder-box');
    if (reminderBox) {
      if (core.activeLogDateKey > todayStr) {
        reminderBox.classList.remove('hidden');
        core.updateReminderLinks(habit ? habit.name : 'Habit', core.activeLogDateKey);
      } else {
        reminderBox.classList.add('hidden');
      }
    }
  };

  core.handleSaveLog = function() {
    const habitId = core.elements.modalLogHabitSelect.value;
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit) return;
    if (!habit.logs) habit.logs = {};
    const count = parseInt(core.elements.modalLogCount.value, 10) || 0;
    const note = core.elements.modalLogNote.value.trim();
    habit.logs[core.activeLogDateKey] = { count, note };
    core.applyParentDependencyOnLog(habit, core.activeLogDateKey, count);
    if (core.saveState) core.saveState();
    if (core.elements.modalLog) core.elements.modalLog.classList.add('hidden');
    if (core.renderAll) core.renderAll();
  };

  core.handleClearLog = function() {
    const habitId = core.elements.modalLogHabitSelect.value;
    const habit = core.state.habits.find(h => h.id === habitId);
    if (habit && habit.logs && habit.logs[core.activeLogDateKey]) {
      delete habit.logs[core.activeLogDateKey];
      if (core.saveState) core.saveState();
      if (core.elements.modalLog) core.elements.modalLog.classList.add('hidden');
      if (core.renderAll) core.renderAll();
    }
  };

})(window.HabitualCore);
