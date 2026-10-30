window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  core.showToast = function(message, type = 'info', actionText = null, onActionClick = null) {
    if (!message) return;

    // 1. Banner Toast Alert (Fixed bottom overlay for pages with #toast-banner)
    const banner = document.getElementById('toast-banner');
    const msgEl = document.getElementById('toast-message');
    if (banner && msgEl) {
      msgEl.textContent = message;
      banner.className = 'toast-banner toast-' + type;

      // Handle optional action button
      let actionBtn = banner.querySelector('.toast-action-btn');
      if (actionText && typeof onActionClick === 'function') {
        if (!actionBtn) {
          actionBtn = document.createElement('button');
          actionBtn.className = 'btn btn-sm btn-primary toast-action-btn';
          actionBtn.style.marginLeft = '12px';
          banner.appendChild(actionBtn);
        }
        actionBtn.textContent = actionText;
        actionBtn.style.display = 'inline-block';
        actionBtn.onclick = (e) => {
          e.stopPropagation();
          banner.classList.add('hidden');
          onActionClick();
        };
      } else if (actionBtn) {
        actionBtn.style.display = 'none';
      }

      banner.classList.remove('hidden');
      if (core._toastTimeout) clearTimeout(core._toastTimeout);
      const autoHideMs = (actionText && typeof onActionClick === 'function') ? 10000 : 4000;
      core._toastTimeout = setTimeout(() => { banner.classList.add('hidden'); }, autoHideMs);
      return;
    }

    // 2. Floating Pop-up Toast (Fallback for pages without #toast-banner)
    let container = document.getElementById('toast-container');
    if (!container && document.body) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    if (container) {
      const toastItem = document.createElement('div');
      toastItem.className = 'toast-item toast-' + type;
      toastItem.style.display = 'flex';
      toastItem.style.alignItems = 'center';
      toastItem.style.gap = '10px';

      const msgSpan = document.createElement('span');
      msgSpan.textContent = message;
      toastItem.appendChild(msgSpan);

      if (actionText && typeof onActionClick === 'function') {
        const actionBtn = document.createElement('button');
        actionBtn.className = 'btn btn-sm btn-primary toast-action-btn';
        actionBtn.textContent = actionText;
        actionBtn.onclick = (e) => {
          e.stopPropagation();
          if (toastItem.parentNode) toastItem.parentNode.removeChild(toastItem);
          onActionClick();
        };
        toastItem.appendChild(actionBtn);
      }

      container.appendChild(toastItem);

      const autoHideMs = (actionText && typeof onActionClick === 'function') ? 10000 : 3800;
      setTimeout(() => {
        toastItem.classList.add('toast-fade-out');
        setTimeout(() => { if (toastItem.parentNode) toastItem.parentNode.removeChild(toastItem); }, 300);
      }, autoHideMs);
    }
  };

  core.vibrate = function(pattern = 15) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  };

  core.toggleModalScrollLock = function(isLocked) {
    if (typeof document !== 'undefined' && document.body) {
      if (isLocked) {
        document.body.style.overflow = 'hidden';
      } else {
        const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
        if (!openModal) {
          document.body.style.overflow = '';
        }
      }
    }
  };

  core.showConfirmModal = function(message, options = {}) {
    const title = options.title || 'Confirm Update';
    const yesText = options.yesText || 'Yes';
    const noText = options.noText || 'No';

    const modal = (typeof document !== 'undefined') ? document.getElementById('modal-confirm') : null;
    const titleEl = (typeof document !== 'undefined') ? document.getElementById('modal-confirm-title') : null;
    const msgEl = (typeof document !== 'undefined') ? document.getElementById('modal-confirm-message') : null;
    const btnYes = (typeof document !== 'undefined') ? document.getElementById('btn-modal-confirm-yes') : null;
    const btnNo = (typeof document !== 'undefined') ? document.getElementById('btn-modal-confirm-no') : null;
    const btnClose = (typeof document !== 'undefined') ? document.getElementById('modal-confirm-close') : null;

    if (!modal || !btnYes || !btnNo) {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return window.confirm(message);
      }
      return true;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (btnYes) btnYes.textContent = yesText;
    if (btnNo) btnNo.textContent = noText;

    modal.classList.remove('hidden');
    if (core.toggleModalScrollLock) core.toggleModalScrollLock(true);

    return new Promise((resolve) => {
      let resolved = false;

      const cleanup = (result) => {
        if (resolved) return;
        resolved = true;
        modal.classList.add('hidden');
        if (core.toggleModalScrollLock) core.toggleModalScrollLock(false);
        btnYes.removeEventListener('click', onYes);
        btnNo.removeEventListener('click', onNo);
        if (btnClose) btnClose.removeEventListener('click', onNo);
        modal.removeEventListener('click', onModalClick);
        resolve(result);
      };

      const onYes = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        cleanup(true);
      };

      const onNo = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        cleanup(false);
      };

      const onModalClick = (e) => {
        if (e.target === modal) {
          cleanup(false);
        }
      };

      btnYes.addEventListener('click', onYes);
      btnNo.addEventListener('click', onNo);
      if (btnClose) btnClose.addEventListener('click', onNo);
      modal.addEventListener('click', onModalClick);
    });
  };

  core.parseHash = function() {
    const hash = (typeof window !== 'undefined' && window.location && window.location.hash) ? String(window.location.hash).trim() : '';
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
            colorTheme: core.getDefaultColorForId(habitId),
            dailyTarget: 1, parentId: parentId, createdAt: core.getTodayKey(), logs: {}
          };
          let parentHabit = core.state.habits.find(h => h.id === parentId);
          if (!parentHabit && parentId) {
            parentHabit = {
              id: parentId, name: core.nameFromId(parentId), type: 'positive', description: '', category: '',
              colorTheme: core.getDefaultColorForId(parentId),
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
    if (!core.elements) core.elements = {};
    core.mouseX = -1;
    core.mouseY = -1;

    core.elements.yearSelector = document.getElementById('year-selector');
    core.elements.heatmapsGallery = document.getElementById('heatmaps-gallery');
    core.elements.customTooltip = document.getElementById('custom-tooltip');

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('scroll', () => { if (core.elements.customTooltip && !core.elements.customTooltip.classList.contains('hidden')) core.elements.customTooltip.classList.add('hidden'); }, { passive: true });
      window.addEventListener('resize', () => { if (core.elements.customTooltip && !core.elements.customTooltip.classList.contains('hidden')) core.elements.customTooltip.classList.add('hidden'); }, { passive: true });
      window.addEventListener('mousemove', (e) => {
        core.mouseX = e.clientX;
        core.mouseY = e.clientY;
      }, { passive: true });
    }

    core.elements.modalHabit = document.getElementById('modal-habit');
    core.elements.formHabit = document.getElementById('form-habit');
    core.elements.modalHabitTitle = document.getElementById('modal-habit-title');
    core.elements.habitParent = document.getElementById('habit-parent');
    core.elements.habitShowStreak = document.getElementById('habit-show-streak');
    core.elements.habitShowCount = document.getElementById('habit-show-count');
    core.elements.habitShowDuration = document.getElementById('habit-show-duration');
    core.elements.habitHideFromAll = document.getElementById('habit-hide-from-all');
    core.elements.habitIsPaused = document.getElementById('habit-is-paused');
    core.elements.habitHideHeatmapWhenPaused = document.getElementById('habit-hide-heatmap-when-paused');
    core.elements.habitHideHeatmap = document.getElementById('habit-hide-heatmap');

    core.elements.modalPauseHabit = document.getElementById('modal-pause-habit');
    core.elements.modalPauseHabitTitle = document.getElementById('modal-pause-habit-title');
    core.elements.pauseHabitId = document.getElementById('pause-habit-id');
    core.elements.modalPauseHabitBadge = document.getElementById('modal-pause-habit-badge');
    core.elements.pauseStartDate = document.getElementById('pause-start-date');
    core.elements.pauseResumeDate = document.getElementById('pause-resume-date');
    core.elements.pauseNote = document.getElementById('pause-note');
    core.elements.pauseHideHeatmap = document.getElementById('pause-hide-heatmap');
    core.elements.btnConfirmPause = document.getElementById('btn-confirm-pause');
    core.elements.btnCancelPause = document.getElementById('btn-cancel-pause');
    core.elements.modalPauseClose = document.getElementById('modal-pause-close');
    core.elements.habitName = document.getElementById('habit-name');
    core.elements.habitIdPreview = document.getElementById('habit-id-preview');
    core.elements.habitIdDisplay = document.getElementById('habit-id-display');
    core.elements.habitFormDetails = document.getElementById('habit-form-details');

    if (core.elements.habitName && typeof core.elements.habitName.addEventListener === 'function') {
      core.elements.habitName.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); core.elements.habitName.blur(); } });
      core.elements.habitName.addEventListener('blur', () => core.handleHabitNameBlur());
    }

    core.elements.customColorPicker = document.getElementById('habit-custom-color-picker');
    core.elements.customColorHex = document.getElementById('habit-custom-color-hex');
    core.elements.radioColorCustom = document.getElementById('radio-color-custom');
    core.elements.customSwatchPreview = document.getElementById('custom-swatch-preview');
    core.elements.calendarColorSelect = document.getElementById('habit-calendar-color-select');

    core.elements.modalCalendarPicker = document.getElementById('modal-calendar-picker');
    core.elements.modalCalendarBadge = document.getElementById('modal-calendar-habit-badge');
    core.elements.calendarInputDate = document.getElementById('calendar-input-date');

    core.elements.modalLog = document.getElementById('modal-log');
    core.elements.modalLogDateInput = document.getElementById('modal-log-date-input');
    core.elements.modalLogHabitSelect = document.getElementById('modal-log-habit-select');
    core.elements.modalLogCount = document.getElementById('modal-log-count');
    core.elements.modalLogNote = document.getElementById('modal-log-note');
    core.elements.modalLogShowOnStartup = document.getElementById('modal-log-show-on-startup');

    if (core.elements.modalLogDateInput && typeof core.elements.modalLogDateInput.addEventListener === 'function') {
      core.elements.modalLogDateInput.addEventListener('change', (e) => {
        if (e.target.value) {
          core.activeLogDateKey = e.target.value;
          if (core.setCursorDateKey) core.setCursorDateKey(e.target.value, true);
          core.loadLogModalValues();
        }
      });
    }

    const btnDatePrev = document.getElementById('btn-modal-date-prev');
    const btnDateNext = document.getElementById('btn-modal-date-next');
    if (btnDatePrev && typeof btnDatePrev.addEventListener === 'function') btnDatePrev.addEventListener('click', () => core.shiftModalLogDate(-1));
    if (btnDateNext && typeof btnDateNext.addEventListener === 'function') btnDateNext.addEventListener('click', () => core.shiftModalLogDate(1));

    const btnIcsReminder = document.getElementById('btn-modal-ics-reminder');
    if (btnIcsReminder && typeof btnIcsReminder.addEventListener === 'function') {
      btnIcsReminder.addEventListener('click', () => {
        const habitId = core.elements.modalLogHabitSelect ? core.elements.modalLogHabitSelect.value : null;
        const habit = core.state.habits.find(h => h.id === habitId);
        core.downloadICSReminder(habit ? habit.name : 'Habit', core.activeLogDateKey);
      });
    }

    if (core.elements.modalLogShowOnStartup && typeof core.elements.modalLogShowOnStartup.addEventListener === 'function') {
      core.elements.modalLogShowOnStartup.addEventListener('change', (e) => {
        core.state.showQuickLogOnStartup = e.target.checked;
        if (core.saveState) core.saveState();
      });
    }

    core.elements.modalData = document.getElementById('modal-data');
    core.elements.habitEnableBackfill = document.getElementById('habit-enable-backfill');
    core.elements.backfillOptionsContainer = document.getElementById('backfill-options-container');
    core.elements.backfillSection = document.getElementById('backfill-section');
    core.elements.habitHistoryStartDate = document.getElementById('habit-history-start-date') || document.getElementById('habit-history-duration');
    core.elements.habitHistoryDuration = core.elements.habitHistoryStartDate;
    core.elements.habitHistoryFrequency = document.getElementById('habit-history-frequency');
    core.elements.habitHistoryInstances = document.getElementById('habit-history-instances');

    if (core.elements.habitEnableBackfill && typeof core.elements.habitEnableBackfill.addEventListener === 'function' && core.elements.backfillOptionsContainer) {
      core.elements.habitEnableBackfill.addEventListener('change', (e) => {
        if (e.target.checked) core.elements.backfillOptionsContainer.classList.remove('hidden');
        else core.elements.backfillOptionsContainer.classList.add('hidden');
      });
    }

    if (core.elements.calendarColorSelect && typeof core.elements.calendarColorSelect.addEventListener === 'function') {
      core.elements.calendarColorSelect.addEventListener('change', (e) => {
        const hex = e.target.value;
        if (hex) {
          if (core.elements.customColorHex) core.elements.customColorHex.value = hex;
          if (core.elements.customColorPicker) core.elements.customColorPicker.value = hex;
          if (core.elements.customSwatchPreview && core.elements.customSwatchPreview.style) {
            core.elements.customSwatchPreview.style.backgroundColor = hex;
          }
        }
      });
    }

    if (core.elements.customColorPicker && typeof core.elements.customColorPicker.addEventListener === 'function') {
      core.elements.customColorPicker.addEventListener('input', (e) => {
        const color = e.target.value;
        if (core.elements.customColorHex) core.elements.customColorHex.value = color;
        if (core.elements.customSwatchPreview && core.elements.customSwatchPreview.style) {
          core.elements.customSwatchPreview.style.backgroundColor = color;
        }
        core.syncCalendarColorDropdown(color);
      });
    }

    if (core.elements.customColorHex && typeof core.elements.customColorHex.addEventListener === 'function') {
      core.elements.customColorHex.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        if (core.parseHexColor(val)) {
          const hex = core.normalizeHex(val);
          if (core.elements.customColorPicker) core.elements.customColorPicker.value = hex;
          if (core.elements.customSwatchPreview && core.elements.customSwatchPreview.style) {
            core.elements.customSwatchPreview.style.backgroundColor = hex;
          }
          core.syncCalendarColorDropdown(hex);
        }
      });
    }

    const modalCalendarClose = document.getElementById('modal-calendar-close');
    if (modalCalendarClose && typeof modalCalendarClose.addEventListener === 'function') modalCalendarClose.addEventListener('click', () => {
      if (core.elements.modalCalendarPicker) core.elements.modalCalendarPicker.classList.add('hidden');
      core.toggleModalScrollLock(false);
    });

    const btnCalendarCancel = document.getElementById('btn-calendar-cancel');
    if (btnCalendarCancel && typeof btnCalendarCancel.addEventListener === 'function') btnCalendarCancel.addEventListener('click', () => {
      if (core.elements.modalCalendarPicker) core.elements.modalCalendarPicker.classList.add('hidden');
      core.toggleModalScrollLock(false);
    });

    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.quick-date-btn').forEach(btn => {
        if (btn && typeof btn.addEventListener === 'function') {
          btn.addEventListener('click', () => {
            const daysAgo = parseInt(btn.dataset.daysAgo, 10) || 0;
            const targetDateKey = core.getDaysAgoKey(daysAgo);
            if (core.elements.modalCalendarPicker) core.elements.modalCalendarPicker.classList.add('hidden');
            core.openLogModal(targetDateKey, core.activeCalendarHabit ? core.activeCalendarHabit.id : null);
          });
        }
      });
    }

    const btnCalendarSubmit = document.getElementById('btn-calendar-submit');
    if (btnCalendarSubmit && typeof btnCalendarSubmit.addEventListener === 'function') {
      btnCalendarSubmit.addEventListener('click', () => {
        const customDateVal = core.elements.calendarInputDate ? core.elements.calendarInputDate.value : '';
        if (customDateVal) {
          if (core.elements.modalCalendarPicker) core.elements.modalCalendarPicker.classList.add('hidden');
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

    if (core.elements.btnHeaderMenu && typeof core.elements.btnHeaderMenu.addEventListener === 'function' && core.elements.headerMenuContent) {
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
    if (menuAddHabit && typeof menuAddHabit.addEventListener === 'function') menuAddHabit.addEventListener('click', () => { if (core.elements.headerMenuContent) core.elements.headerMenuContent.classList.add('hidden'); core.openHabitModal(); });

    const menuQuickLog = document.getElementById('menu-btn-quick-log');
    if (menuQuickLog && typeof menuQuickLog.addEventListener === 'function') menuQuickLog.addEventListener('click', () => {
      if (core.elements.headerMenuContent) core.elements.headerMenuContent.classList.add('hidden');
      const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : core.getTodayKey();
      core.openLogModal(targetDate);
    });

    const menuWidgets = document.getElementById('menu-btn-open-widgets');
    if (menuWidgets && typeof menuWidgets.addEventListener === 'function') menuWidgets.addEventListener('click', () => {
      if (core.elements.headerMenuContent) core.elements.headerMenuContent.classList.add('hidden');
      core.openWidgetsModal();
    });

    const menuDataModal = document.getElementById('menu-btn-data-modal');
    if (menuDataModal && typeof menuDataModal.addEventListener === 'function') menuDataModal.addEventListener('click', () => {
      if (core.elements.headerMenuContent) core.elements.headerMenuContent.classList.add('hidden');
      if (core.elements.modalData) core.elements.modalData.classList.remove('hidden');
      core.toggleModalScrollLock(true);
      core.state.selectedYear = core.CURRENT_YEAR;
      if (core.renderAll) core.renderAll();

      if (selectStorageEngine) {
        selectStorageEngine.value = core.activeStorageEngine || 'localStorage';
      }
      if (typeof toggleOrbitDBSyncPanel === 'function') {
          toggleOrbitDBSyncPanel();
      }
    });

    const modalHabitClose = document.getElementById('modal-habit-close');
    if (modalHabitClose && typeof modalHabitClose.addEventListener === 'function') modalHabitClose.addEventListener('click', () => { core.pendingQuickLogAfterHabit = false; if (core.elements.modalHabit) core.elements.modalHabit.classList.add('hidden'); core.toggleModalScrollLock(false); });

    const btnCancelHabit = document.getElementById('btn-cancel-habit');
    if (btnCancelHabit && typeof btnCancelHabit.addEventListener === 'function') btnCancelHabit.addEventListener('click', () => { core.pendingQuickLogAfterHabit = false; if (core.elements.modalHabit) core.elements.modalHabit.classList.add('hidden'); core.toggleModalScrollLock(false); });

    if (core.elements.modalPauseClose && typeof core.elements.modalPauseClose.addEventListener === 'function') core.elements.modalPauseClose.addEventListener('click', () => core.closePauseModal());
    if (core.elements.btnCancelPause && typeof core.elements.btnCancelPause.addEventListener === 'function') core.elements.btnCancelPause.addEventListener('click', () => core.closePauseModal());
    if (core.elements.btnConfirmPause && typeof core.elements.btnConfirmPause.addEventListener === 'function') core.elements.btnConfirmPause.addEventListener('click', () => core.handleConfirmPause());

    const formPause = document.getElementById('form-pause-habit');
    if (formPause && typeof formPause.addEventListener === 'function') {
      formPause.addEventListener('submit', (e) => {
        e.preventDefault();
        core.handleConfirmPause();
      });
    }

    const modalLogClose = document.getElementById('modal-log-close');
    if (modalLogClose && typeof modalLogClose.addEventListener === 'function') modalLogClose.addEventListener('click', () => { if (core.elements.modalLog) core.elements.modalLog.classList.add('hidden'); core.toggleModalScrollLock(false); });

    const modalDataClose = document.getElementById('modal-data-close');
    if (modalDataClose && typeof modalDataClose.addEventListener === 'function') modalDataClose.addEventListener('click', () => { if (core.elements.modalData) core.elements.modalData.classList.add('hidden'); core.toggleModalScrollLock(false); });

    const toastCloseBtn = document.getElementById('toast-close');
    if (toastCloseBtn && typeof toastCloseBtn.addEventListener === 'function') toastCloseBtn.addEventListener('click', () => {
      const banner = document.getElementById('toast-banner');
      if (banner) banner.classList.add('hidden');
    });

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
    if (inputModalCsv && typeof inputModalCsv.addEventListener === 'function') inputModalCsv.addEventListener('change', handleCSVUpload);

    if (core.elements.formHabit && typeof core.elements.formHabit.addEventListener === 'function') core.elements.formHabit.addEventListener('submit', core.handleHabitFormSubmit);

    const btnCounterMinus = document.getElementById('btn-counter-minus');
    if (btnCounterMinus && typeof btnCounterMinus.addEventListener === 'function') btnCounterMinus.addEventListener('click', () => {
      let val = parseInt(core.elements.modalLogCount ? core.elements.modalLogCount.value : 0, 10) || 0;
      if (val > 0 && core.elements.modalLogCount) core.elements.modalLogCount.value = val - 1;
    });

    const btnCounterPlus = document.getElementById('btn-counter-plus');
    if (btnCounterPlus && typeof btnCounterPlus.addEventListener === 'function') btnCounterPlus.addEventListener('click', () => {
      let val = parseInt(core.elements.modalLogCount ? core.elements.modalLogCount.value : 0, 10) || 0;
      if (core.elements.modalLogCount) core.elements.modalLogCount.value = val + 1;
    });

    const btnSaveLog = document.getElementById('btn-save-log');
    if (btnSaveLog && typeof btnSaveLog.addEventListener === 'function') btnSaveLog.addEventListener('click', core.handleSaveLog);

    const btnHeaderVerify = document.getElementById('btn-header-verify-checkin');
    if (btnHeaderVerify && typeof btnHeaderVerify.addEventListener === 'function') btnHeaderVerify.addEventListener('click', () => core.openVerifyLogsModal());

    const btnVerifyAll = document.getElementById('btn-verify-all');
    if (btnVerifyAll && typeof btnVerifyAll.addEventListener === 'function') btnVerifyAll.addEventListener('click', () => core.verifyAllLogs());

    const btnVerifyLater = document.getElementById('btn-verify-later');
    const modalVerifyClose = document.getElementById('modal-verify-close');
    const modalVerifyEl = document.getElementById('modal-verify-logs');
    const closeVerifyModal = () => {
      if (modalVerifyEl) modalVerifyEl.classList.add('hidden');
      core.toggleModalScrollLock(false);
    };
    if (btnVerifyLater && typeof btnVerifyLater.addEventListener === 'function') btnVerifyLater.addEventListener('click', closeVerifyModal);
    if (modalVerifyClose && typeof modalVerifyClose.addEventListener === 'function') modalVerifyClose.addEventListener('click', closeVerifyModal);

    if (core.elements.yearSelector && typeof core.elements.yearSelector.addEventListener === 'function') {
      core.elements.yearSelector.addEventListener('change', (e) => {
        core.state.selectedYear = parseInt(e.target.value, 10);
        if (core.renderAll) core.renderAll();
        if (core.saveState) core.saveState();
      });
    }

    // --- DATA MANAGEMENT & STORAGE ENGINES ---
    const selectStorageEngine = document.getElementById('select-storage-engine');
    if (selectStorageEngine) {
      selectStorageEngine.value = core.activeStorageEngine || 'localStorage';
    }

    const btnMigrateEngine = document.getElementById('btn-migrate-engine');
    if (btnMigrateEngine && typeof btnMigrateEngine.addEventListener === 'function') {
      btnMigrateEngine.addEventListener('click', function() {
        const target = selectStorageEngine ? selectStorageEngine.value : 'localStorage';
        if (target === core.activeStorageEngine) {
          if (core.showToast) core.showToast('Already using ' + target + ' engine.', 'info');
          return;
        }
        const originalText = btnMigrateEngine.textContent;
        btnMigrateEngine.textContent = 'Migrating...';
        btnMigrateEngine.disabled = true;

        core.migrateStorageEngine(target).then(function(res) {
          btnMigrateEngine.textContent = originalText;
          btnMigrateEngine.disabled = false;
        }).catch(function(err) {
          btnMigrateEngine.textContent = originalText;
          btnMigrateEngine.disabled = false;
        });
      });
    }

    const inputPassphrase = document.getElementById('input-sync-passphrase');
    const badgePassphraseStatus = document.getElementById('passphrase-status-badge');
    const btnToggleShowPassphrase = document.getElementById('btn-toggle-show-passphrase');
    const eyeIconShow = document.getElementById('eye-icon-show');
    const eyeIconHide = document.getElementById('eye-icon-hide');
    const btnGenPassphrase = document.getElementById('btn-gen-passphrase');
    const qrSyncWrapper = document.getElementById('firestore-sync-qr-wrapper');
    const qrSyncDisplay = document.getElementById('firestore-sync-qr-display');
    const btnCopySyncLink = document.getElementById('btn-copy-sync-link');
    const inputFirestoreCode = document.getElementById('input-firestore-sync-code');

    function updatePassphraseStatusUI() {
      const savedKey = core.SyncManager && core.SyncManager.settings ? core.SyncManager.settings.passphrase : '';
      if (inputPassphrase) {
        inputPassphrase.value = savedKey || '';
      }
      if (badgePassphraseStatus && badgePassphraseStatus.style) {
        badgePassphraseStatus.style.display = (savedKey && savedKey.trim().length > 0) ? 'flex' : 'none';
      }
    }

    function updateSyncPagePassphraseAndQRUI() {
      const inputPassphraseVal = inputPassphrase ? inputPassphrase.value.trim() : '';
      if (btnGenPassphrase) {
        if (inputPassphraseVal.length > 0) {
          btnGenPassphrase.classList.add('hidden');
        } else {
          btnGenPassphrase.classList.remove('hidden');
        }
      }

      const savedPassphrase = (core.SyncManager && core.SyncManager.settings) ? core.SyncManager.settings.passphrase : '';
      const activePass = inputPassphraseVal || savedPassphrase;
      const activeCode = (inputFirestoreCode ? inputFirestoreCode.value.trim() : '') || (core.SyncTargets && core.SyncTargets.Firestore ? core.SyncTargets.Firestore.getSyncCode() : '');

      const chkShareMode = document.getElementById('chk-firestore-share-mode');
      const sharingPanel = document.getElementById('firestore-sharing-panel');
      const backupBanner = document.getElementById('firestore-backup-status-banner');
      const backupChannelBadge = document.getElementById('firestore-backup-channel-badge');

      // Determine if Pair / Add Another Device sharing mode is ON (default: false = Just Backup)
      const storedShareMode = localStorage.getItem('habitual_firestore_share_mode');
      let isShareMode = false;
      if (storedShareMode === 'true') {
        isShareMode = true;
      } else if (storedShareMode === 'false') {
        isShareMode = false;
      } else {
        isShareMode = chkShareMode ? chkShareMode.checked : false;
      }
      if (chkShareMode) chkShareMode.checked = isShareMode;

      if (backupChannelBadge) {
        if (activeCode) {
          backupChannelBadge.textContent = `Channel Identifier: ${activeCode} • Data is encrypted with your Master Passphrase before uploading.`;
        } else {
          backupChannelBadge.textContent = 'Your habits & check-ins are encrypted and backed up to your private cloud store.';
        }
      }

      if (isShareMode) {
        if (sharingPanel) sharingPanel.classList.remove('hidden');
        if (backupBanner) backupBanner.classList.add('hidden');

        if (activeCode && activePass && qrSyncWrapper && qrSyncDisplay && core.generateQRCodeSVG) {
          const baseUrl = (typeof window !== 'undefined' && window.location) ? (window.location.origin + window.location.pathname) : '';
          const syncUrl = `${baseUrl}#sync?code=${encodeURIComponent(activeCode)}&pass=${encodeURIComponent(activePass)}`;
          qrSyncDisplay.innerHTML = core.generateQRCodeSVG(syncUrl, 200);
          qrSyncWrapper.classList.remove('hidden');
          if (btnCopySyncLink) {
            if (btnCopySyncLink.style) btnCopySyncLink.style.display = 'inline-block';
            btnCopySyncLink.onclick = () => {
              if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(syncUrl);
                if (core.showToast) core.showToast('📋 Device Sync URL copied to clipboard!', 'success');
              }
            };
          }
        } else {
          if (qrSyncWrapper) qrSyncWrapper.classList.add('hidden');
          if (btnCopySyncLink && btnCopySyncLink.style) btnCopySyncLink.style.display = 'none';
        }
      } else {
        if (sharingPanel) sharingPanel.classList.add('hidden');
        if (backupBanner) backupBanner.classList.remove('hidden');
        if (qrSyncWrapper) qrSyncWrapper.classList.add('hidden');
        if (btnCopySyncLink && btnCopySyncLink.style) btnCopySyncLink.style.display = 'none';
      }
    }
    core.updatePassphraseStatusUI = updatePassphraseStatusUI;
    core.updateSyncPagePassphraseAndQRUI = updateSyncPagePassphraseAndQRUI;

    updatePassphraseStatusUI();
    updateSyncPagePassphraseAndQRUI();

    const chkFirestoreShareMode = document.getElementById('chk-firestore-share-mode');
    if (chkFirestoreShareMode && typeof chkFirestoreShareMode.addEventListener === 'function') {
      chkFirestoreShareMode.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        localStorage.setItem('habitual_firestore_share_mode', isChecked ? 'true' : 'false');
        updateSyncPagePassphraseAndQRUI();
      });
    }

    if (inputPassphrase && typeof inputPassphrase.addEventListener === 'function') {
      inputPassphrase.addEventListener('input', updateSyncPagePassphraseAndQRUI);
    }

    if (btnToggleShowPassphrase && inputPassphrase && typeof btnToggleShowPassphrase.addEventListener === 'function') {
      btnToggleShowPassphrase.addEventListener('click', () => {
        const isPassword = inputPassphrase.type === 'password';
        inputPassphrase.type = isPassword ? 'text' : 'password';
        if (eyeIconShow && eyeIconShow.style) eyeIconShow.style.display = isPassword ? 'none' : 'block';
        if (eyeIconHide && eyeIconHide.style) eyeIconHide.style.display = isPassword ? 'block' : 'none';
      });
    }

    if (btnGenPassphrase && inputPassphrase && typeof btnGenPassphrase.addEventListener === 'function') {
      btnGenPassphrase.addEventListener('click', () => {
        const strongPwd = core.generateRandomPassword ? core.generateRandomPassword(20) : Math.random().toString(36).slice(-10);
        inputPassphrase.value = strongPwd;
        inputPassphrase.type = 'text';
        if (eyeIconShow && eyeIconShow.style) eyeIconShow.style.display = 'none';
        if (eyeIconHide && eyeIconHide.style) eyeIconHide.style.display = 'block';
        updateSyncPagePassphraseAndQRUI();
        if (core.showToast) core.showToast('Generated strong master passphrase!', 'info');
      });
    }

    const btnSavePassphrase = document.getElementById('btn-save-passphrase');
    if (btnSavePassphrase && inputPassphrase && typeof btnSavePassphrase.addEventListener === 'function') {
      btnSavePassphrase.addEventListener('click', () => {
        const val = inputPassphrase.value.trim();
        if (!val) {
          if (core.showToast) core.showToast('⚠️ Please enter a Master Passphrase first!', 'warning');
          return;
        }
        core.SyncManager.updatePassphrase(val).then(() => {
          updatePassphraseStatusUI();
          updateSyncPagePassphraseAndQRUI();
        }).catch(err => {
          console.warn('Passphrase update error:', err);
        });
      });
    }

    // Firestore Live Sync & Code Controls
    const chkFirestore = document.getElementById('chk-sync-firestore');
    const btnSaveFirestoreCode = document.getElementById('btn-save-firestore-code');
    const btnGenFirestoreCode = document.getElementById('btn-gen-firestore-code');
    const btnCopyFirestoreCode = document.getElementById('btn-copy-firestore-code');

    function updateFirestoreCopyBtnVisibility() {
      const inputEl = document.getElementById('input-firestore-sync-code') || inputFirestoreCode;
      const copyBtnEl = document.getElementById('btn-copy-firestore-code') || btnCopyFirestoreCode;
      if (copyBtnEl && copyBtnEl.style && inputEl) {
        const hasCode = inputEl.value && inputEl.value.trim().length > 0;
        copyBtnEl.style.display = hasCode ? 'inline-block' : 'none';
      }
    }

    function updateFirestoreCodeUIState() {
      const inputEl = document.getElementById('input-firestore-sync-code') || inputFirestoreCode;
      if (inputEl && core.SyncTargets && core.SyncTargets.Firestore) {
        const syncCode = core.SyncTargets.Firestore.getSyncCode();
        if (syncCode) {
          inputEl.value = syncCode;
        }
      }
      updateFirestoreCopyBtnVisibility();
    }
    core.updateFirestoreCodeUIState = updateFirestoreCodeUIState;

    const initialFirestoreEnabled = core.SyncManager.isTargetEnabled('firestore');
    if (chkFirestore) {
      chkFirestore.checked = initialFirestoreEnabled;
    }
    updateFirestoreCodeUIState();

    if (chkFirestore && typeof chkFirestore.addEventListener === 'function') {
      chkFirestore.addEventListener('change', (e) => {
        if (e.target.checked) {
          const currentPassphrase = core.SyncManager.settings.passphrase;
          if (!currentPassphrase || currentPassphrase.trim().length === 0) {
            e.target.checked = false;
            if (inputPassphrase) inputPassphrase.focus();
            if (core.showToast) {
              core.showToast('⚠️ Please enter and save a Master Passphrase first!', 'error');
            } else {
              alert('Please enter and save a Master Encryption Passphrase first!');
            }
            return;
          }

          const code = core.SyncTargets.Firestore.getSyncCode();
          core.SyncTargets.Firestore.validateChannelAccess(code, currentPassphrase).then(() => {
            core.SyncManager.toggleTarget('firestore', true);
            if (inputFirestoreCode) inputFirestoreCode.value = code;
            updateFirestoreCopyBtnVisibility();
            if (core.showToast) core.showToast('🔥 Encrypted Firestore Live Sync Enabled!', 'success');
          }).catch(err => {
            e.target.checked = false;
            console.warn('Channel access validation blocked:', err);
          });
        } else {
          core.SyncManager.toggleTarget('firestore', false);
          if (core.showToast) core.showToast('Firestore Sync Disabled.');
        }
      });
    }

    if (inputFirestoreCode && typeof inputFirestoreCode.addEventListener === 'function') {
      inputFirestoreCode.addEventListener('input', () => {
        updateFirestoreCopyBtnVisibility();
        updateSyncPagePassphraseAndQRUI();
      });

      // Paste event listener: automatically format, validate channel access, enable sync toggle if valid, and sync immediately
      inputFirestoreCode.addEventListener('paste', (e) => {
        setTimeout(() => {
          const val = inputFirestoreCode.value.trim();
          if (val) {
            const currentPassphrase = core.SyncManager.settings.passphrase;
            const formatted = core.SyncTargets.Firestore.setSyncCode(val);
            inputFirestoreCode.value = formatted;
            updateFirestoreCopyBtnVisibility();

            if (!currentPassphrase || currentPassphrase.trim().length === 0) {
              if (inputPassphrase) inputPassphrase.focus();
              if (core.showToast) core.showToast('📋 Sync Code pasted! Please enter and save a Master Passphrase to sync.', 'warning');
              return;
            }

            core.SyncTargets.Firestore.validateChannelAccess(formatted, currentPassphrase).then(() => {
              if (!core.SyncManager.isTargetEnabled('firestore')) {
                core.SyncManager.toggleTarget('firestore', true);
                if (chkFirestore) chkFirestore.checked = true;
              }

              if (core.showToast) core.showToast('📋 Pasted Sync Code recognized! Syncing with channel ' + formatted + '...', 'info');
              core.SyncManager.postToFirestoreIfReady();
              core.SyncManager.pullAndMergeAll();
            }).catch(err => {
              console.warn('Channel validation blocked paste sync:', err);
            });
          }
        }, 50);
      });
    }

    if (btnSaveFirestoreCode && inputFirestoreCode && typeof btnSaveFirestoreCode.addEventListener === 'function') {
      btnSaveFirestoreCode.addEventListener('click', () => {
        const val = inputFirestoreCode.value.trim();
        if (!val) {
          if (core.showToast) core.showToast('⚠️ Please enter or paste a Sync Code first!', 'warning');
          return;
        }

        const currentPassphrase = core.SyncManager.settings.passphrase;
        const formatted = core.SyncTargets.Firestore.setSyncCode(val);
        inputFirestoreCode.value = formatted;
        updateFirestoreCopyBtnVisibility();

        if (!currentPassphrase || currentPassphrase.trim().length === 0) {
          if (inputPassphrase) inputPassphrase.focus();
          if (core.showToast) core.showToast('⚠️ Please enter and save a Master Passphrase first!', 'error');
          return;
        }

        core.SyncTargets.Firestore.validateChannelAccess(formatted, currentPassphrase).then(() => {
          if (!core.SyncManager.isTargetEnabled('firestore')) {
            core.SyncManager.toggleTarget('firestore', true);
            if (chkFirestore) chkFirestore.checked = true;
          }

          if (core.showToast) core.showToast('💾 Code saved! Syncing with channel ' + formatted + '...', 'info');
          core.SyncManager.postToFirestoreIfReady();
          core.SyncManager.pullAndMergeAll();
        }).catch(err => {
          console.warn('Channel validation blocked save sync code:', err);
        });
      });
    }

    if (btnGenFirestoreCode && inputFirestoreCode && typeof btnGenFirestoreCode.addEventListener === 'function') {
      btnGenFirestoreCode.addEventListener('click', () => {
        const currentPassphrase = core.SyncManager.settings.passphrase;
        if (!currentPassphrase || currentPassphrase.trim().length === 0) {
          if (inputPassphrase) inputPassphrase.focus();
          if (core.showToast) core.showToast('⚠️ Please enter and save a Master Passphrase first!', 'error');
          return;
        }

        const newCode = core.SyncTargets.Firestore.generateNewSyncCode();
        inputFirestoreCode.value = newCode;
        updateFirestoreCopyBtnVisibility();

        if (!core.SyncManager.isTargetEnabled('firestore')) {
          core.SyncManager.toggleTarget('firestore', true);
          if (chkFirestore) chkFirestore.checked = true;
        }

        if (core.showToast) core.showToast('🔑 Generated new Sync Code: ' + newCode + '! Syncing...', 'info');
        core.SyncManager.postToFirestoreIfReady();
      });
    }

    if (btnCopyFirestoreCode && inputFirestoreCode && typeof btnCopyFirestoreCode.addEventListener === 'function') {
      btnCopyFirestoreCode.addEventListener('click', () => {
        if (!inputFirestoreCode.value) return;
        navigator.clipboard.writeText(inputFirestoreCode.value).then(() => {
          if (core.showToast) core.showToast('Sync Code copied to clipboard!', 'success');
        });
      });
    }

    const btnFirestoreChirpCode = document.getElementById('btn-firestore-chirp-code');
    if (btnFirestoreChirpCode && typeof btnFirestoreChirpCode.addEventListener === 'function') {
      btnFirestoreChirpCode.addEventListener('click', () => {
        const code = (inputFirestoreCode ? inputFirestoreCode.value.trim() : '') || (core.SyncTargets && core.SyncTargets.Firestore ? core.SyncTargets.Firestore.getSyncCode() : '');
        if (code) {
          core.AudioSync.emitCodeChirp(code).catch(err => {
            console.error('Chirp emit error:', err);
            alert('Failed to emit sound chirp: ' + err.message);
          });
        } else {
          alert('Please enter or generate a Firestore Sync Code first.');
        }
      });
    }

    const btnFirestoreChirpListen = document.getElementById('btn-firestore-chirp-listen');
    if (btnFirestoreChirpListen && inputFirestoreCode && typeof btnFirestoreChirpListen.addEventListener === 'function') {
      btnFirestoreChirpListen.addEventListener('click', () => {
        const origText = btnFirestoreChirpListen.textContent;
        btnFirestoreChirpListen.disabled = true;

        const handleCountdown = (cd) => {
          if (cd > 0) {
            btnFirestoreChirpListen.textContent = `🎙️ Mic Active! (${cd}s)`;
          } else {
            btnFirestoreChirpListen.textContent = '🎙️ Listening...';
          }
        };

        core.AudioSync.listenForCodeChirp(20000, updateMicMeter, handleCountdown).then(code => {
          btnFirestoreChirpListen.textContent = origText;
          btnFirestoreChirpListen.disabled = false;
          inputFirestoreCode.value = code;
          updateMicMeter(0);

          if (btnSaveFirestoreCode) {
            btnSaveFirestoreCode.click();
          } else {
            const currentPassphrase = core.SyncManager.settings.passphrase;
            const formatted = core.SyncTargets.Firestore.setSyncCode(code);
            inputFirestoreCode.value = formatted;
            updateFirestoreCopyBtnVisibility();
            if (currentPassphrase) {
              core.SyncTargets.Firestore.validateChannelAccess(formatted, currentPassphrase).then(() => {
                if (!core.SyncManager.isTargetEnabled('firestore')) {
                  core.SyncManager.toggleTarget('firestore', true);
                  if (chkFirestore) chkFirestore.checked = true;
                }
                core.SyncManager.postToFirestoreIfReady();
                core.SyncManager.pullAndMergeAll();
              });
            }
          }
        }).catch(err => {
          btnFirestoreChirpListen.textContent = origText;
          btnFirestoreChirpListen.disabled = false;
          updateMicMeter(0);
          if (core.showToast) core.showToast(err.message, 'error');
        });
      });
    }

    // --- ACOUSTIC SOUND SYNC HANDLERS ---
    const micMeterContainer = document.getElementById('mic-meter-container');
    const micVolumeLevel = document.getElementById('mic-volume-level');
    const micVolumePercent = document.getElementById('mic-volume-percent');

    const updateMicMeter = (volPercent) => {
      if (!micMeterContainer) return;
      if (volPercent > 0 || !micMeterContainer.classList.contains('hidden')) {
        micMeterContainer.classList.remove('hidden');
        if (micVolumeLevel) micVolumeLevel.style.width = volPercent + '%';
        if (micVolumePercent) micVolumePercent.textContent = volPercent + '%';
        if (volPercent === 0) {
          setTimeout(() => { if (micMeterContainer) micMeterContainer.classList.add('hidden'); }, 1000);
        }
      }
    };

    const btnBroadcastDelta = document.getElementById('btn-acoustic-broadcast-delta');
    const btnBroadcastFull = document.getElementById('btn-acoustic-broadcast-full');
    const btnAcousticReceive = document.getElementById('btn-acoustic-receive');
    const acousticProgressBox = document.getElementById('acoustic-progress-bar-container');
    const acousticStatusLabel = document.getElementById('acoustic-status-label');
    const acousticProgressBar = document.getElementById('acoustic-progress-bar');

    const updateAcousticProgress = (percent, label) => {
      if (acousticProgressBox) acousticProgressBox.classList.remove('hidden');
      if (acousticProgressBar) acousticProgressBar.style.width = percent + '%';
      if (acousticStatusLabel) acousticStatusLabel.textContent = label || `${percent}%`;
    };

    if (btnBroadcastDelta && typeof btnBroadcastDelta.addEventListener === 'function') {
      btnBroadcastDelta.addEventListener('click', () => {
        btnBroadcastDelta.disabled = true;
        updateAcousticProgress(0, 'Broadcasting Delta Sound...');

        core.AudioSync.emitAcousticPayload(true, (percent) => {
          updateAcousticProgress(percent, `Broadcasting Delta Sound (${percent}%)...`);
        }).then(() => {
          btnBroadcastDelta.disabled = false;
          updateAcousticProgress(100, '✅ Delta Broadcast Complete!');
          setTimeout(() => { if (acousticProgressBox) acousticProgressBox.classList.add('hidden'); }, 3000);
        }).catch(err => {
          btnBroadcastDelta.disabled = false;
          console.error(err);
          alert('Acoustic Broadcast Error: ' + err.message);
        });
      });
    }

    if (btnBroadcastFull && typeof btnBroadcastFull.addEventListener === 'function') {
      btnBroadcastFull.addEventListener('click', () => {
        btnBroadcastFull.disabled = true;
        updateAcousticProgress(0, 'Broadcasting Full Sound...');

        core.AudioSync.emitAcousticPayload(false, (percent) => {
          updateAcousticProgress(percent, `Broadcasting Full Sound (${percent}%)...`);
        }).then(() => {
          btnBroadcastFull.disabled = false;
          updateAcousticProgress(100, '✅ Full Broadcast Complete!');
          setTimeout(() => { if (acousticProgressBox) acousticProgressBox.classList.add('hidden'); }, 3000);
        }).catch(err => {
          btnBroadcastFull.disabled = false;
          console.error(err);
          alert('Acoustic Broadcast Error: ' + err.message);
        });
      });
    }

    if (btnAcousticReceive && typeof btnAcousticReceive.addEventListener === 'function') {
      btnAcousticReceive.addEventListener('click', () => {
        btnAcousticReceive.disabled = true;

        const handleCountdown = (cd) => {
          if (cd > 0) {
            updateAcousticProgress(0, `🎙️ Mic Active! Starting in ${cd}s...`);
          } else {
            updateAcousticProgress(0, '🎙️ Listening for Sound Data...');
          }
        };

        core.AudioSync.listenForAcousticPayload((percent) => {
          updateAcousticProgress(percent, `Receiving Sound Data (${percent}%)...`);
        }, updateMicMeter, 25000, handleCountdown).then(() => {
          btnAcousticReceive.disabled = false;
          updateMicMeter(0);
          updateAcousticProgress(100, '🎉 Sound Data Received & Applied!');
          setTimeout(() => { if (acousticProgressBox) acousticProgressBox.classList.add('hidden'); }, 3000);
        }).catch(err => {
          btnAcousticReceive.disabled = false;
          updateMicMeter(0);
          updateAcousticProgress(0, '❌ ' + err.message);
          setTimeout(() => { if (acousticProgressBox) acousticProgressBox.classList.add('hidden'); }, 4000);
        });
      });
    }

    // Manual Trigger Sync
    const btnTriggerSync = document.getElementById('btn-trigger-sync');
    if (btnTriggerSync && typeof btnTriggerSync.addEventListener === 'function') {
      btnTriggerSync.addEventListener('click', () => {
        core.SyncManager.pullAndMergeAll().then((res) => {
          if (!res.merged && core.showToast) {
            core.showToast(res.message || 'Sync complete.');
          }
        });
      });
    }

    // Check for OAuth hash tokens in URL on load
    if (window.location.hash && window.location.hash.includes('access_token=')) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        core.SyncTargets.Dropbox.setToken(accessToken);
        core.SyncManager.toggleTarget('dropbox', true);
        if (core.showToast) core.showToast('Dropbox authenticated successfully!');
        window.history.replaceState(null, null, window.location.pathname);
      }
    }

    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson && typeof btnExportJson.addEventListener === 'function') btnExportJson.addEventListener('click', core.exportDataJSON);

    const inputImportJson = document.getElementById('input-import-json');
    if (inputImportJson && typeof inputImportJson.addEventListener === 'function') inputImportJson.addEventListener('change', core.importDataJSON);

    const btnResetData = document.getElementById('btn-reset-data');
    if (btnResetData && typeof btnResetData.addEventListener === 'function') btnResetData.addEventListener('click', () => {
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
      if (e.target && e.target.classList && e.target.classList.contains('modal-backdrop')) {
        e.target.classList.add('hidden');
        core.toggleModalScrollLock(false);
      }
      if (core.focusedDayState.dateStr && !e.target.closest('.heatmap-card') && !e.target.closest('.modal-backdrop')) {
        core.focusedDayState = { habitId: null, dateStr: null };
        if (core.renderAll) core.renderAll();
      }
    });

    core.getActiveCardAndHabitId = function() {
      let habitId = null;
      if (core.state && core.state.selectedHabitId && core.state.selectedHabitId !== 'all' && !core.state.selectedHabitId.startsWith('group_')) {
        habitId = core.state.selectedHabitId;
      }

      let card = null;
      if (habitId && document.querySelector && typeof document.querySelector === 'function') {
        card = document.querySelector(`.heatmap-card[data-habit-id="${habitId}"]`) ||
               document.querySelector(`.heatmap-card[data-habit-id-raw="${habitId}"]`) ||
               document.querySelector('.heatmap-card.selected') ||
               document.querySelector('.heatmap-card.selected-habit');
      }

      if (!card && document.querySelector && typeof document.querySelector === 'function') {
        card = document.querySelector('.heatmap-card.selected') ||
               document.querySelector('.heatmap-card.selected-habit') ||
               document.querySelector('.day-square.cursor-day')?.closest('.heatmap-card');
      }

      if (!habitId && card && typeof card.getAttribute === 'function') {
        habitId = card.getAttribute('data-habit-id-raw') || card.getAttribute('data-habit-id');
      }

      if (card && typeof card.querySelector === 'function') {
        const quickLogBtn = card.querySelector('.btn-card-quick-log');
        if (quickLogBtn) {
          const btnHabitId = (quickLogBtn.dataset && quickLogBtn.dataset.habitId) ||
                             (typeof quickLogBtn.getAttribute === 'function' ? quickLogBtn.getAttribute('data-habit-id') : null);
          if (btnHabitId) habitId = btnHabitId;
        }
      }

      if (!habitId) {
        const firstCard = (document.querySelector && typeof document.querySelector === 'function') ? document.querySelector('.heatmap-card') : null;
        if (firstCard) {
          if (typeof firstCard.querySelector === 'function') {
            const quickLogBtn = firstCard.querySelector('.btn-card-quick-log');
            if (quickLogBtn) {
              const btnHabitId = (quickLogBtn.dataset && quickLogBtn.dataset.habitId) ||
                                 (typeof quickLogBtn.getAttribute === 'function' ? quickLogBtn.getAttribute('data-habit-id') : null);
              if (btnHabitId) habitId = btnHabitId;
            }
          }
          if (!habitId && typeof firstCard.getAttribute === 'function') {
            habitId = firstCard.getAttribute('data-habit-id-raw') || firstCard.getAttribute('data-habit-id');
          }
          if (!card) card = firstCard;
        }
      }

      return { card, habitId };
    };

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
        if (openModal) {
          openModal.classList.add('hidden');
          core.toggleModalScrollLock(false);
          return;
        }
      }

      const activeEl = document.activeElement;
      const activeTag = activeEl ? activeEl.tagName.toUpperCase() : '';
      const isEditable = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || (activeEl && activeEl.isContentEditable);
      if (isEditable) return;

      const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
      if (openModal) return;

      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key;
      const lowerKey = key ? key.toLowerCase() : '';

      if (key === 'ArrowLeft' || key === 'a' || key === 'h') {
        e.preventDefault();
        if (core.moveCursorDateByDays) core.moveCursorDateByDays(-1);
      } else if (key === 'ArrowRight' || key === 'd' || key === 'l') {
        e.preventDefault();
        if (core.moveCursorDateByDays) core.moveCursorDateByDays(1);
      } else if (key === 'ArrowUp' || key === 'w' || key === 'k') {
        e.preventDefault();
        if (core.navigateSelectedHabit) core.navigateSelectedHabit(-1);
      } else if (key === 'ArrowDown' || key === 's' || key === 'j') {
        e.preventDefault();
        if (core.navigateSelectedHabit) core.navigateSelectedHabit(1);
      } else if (key === 'Enter') {
        e.preventDefault();
        const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : (core.getTodayKey ? core.getTodayKey() : '');
        const target = core.getActiveCardAndHabitId ? core.getActiveCardAndHabitId() : null;
        if (target && target.card) {
          const btn = (typeof target.card.querySelector === 'function') ? target.card.querySelector('.btn-card-quick-log') : null;
          if (btn && typeof btn.click === 'function') {
            btn.click();
          } else if (target.habitId && target.habitId !== 'all' && !target.habitId.startsWith('group_')) {
            if (core.toggleHabitForDate) core.toggleHabitForDate(target.habitId, targetDate, btn);
          }
        } else if (target && target.habitId && target.habitId !== 'all' && !target.habitId.startsWith('group_')) {
          if (core.toggleHabitForDate) core.toggleHabitForDate(target.habitId, targetDate);
        }
      } else if (key === 'Delete') {
        e.preventDefault();
        const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : (core.getTodayKey ? core.getTodayKey() : '');
        const target = core.getActiveCardAndHabitId ? core.getActiveCardAndHabitId() : null;
        if (target && target.habitId && target.habitId !== 'all' && !target.habitId.startsWith('group_')) {
          const btn = (target.card && typeof target.card.querySelector === 'function') ? target.card.querySelector('.btn-card-quick-log') : null;
          if (core.setHabitCountForDate) core.setHabitCountForDate(target.habitId, targetDate, 0, btn, 'Cleared');
        }
      } else if (key === 'Backspace' || key === '-' || e.code === 'NumpadSubtract' || e.code === 'Minus') {
        e.preventDefault();
        const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : (core.getTodayKey ? core.getTodayKey() : '');
        const target = core.getActiveCardAndHabitId ? core.getActiveCardAndHabitId() : null;
        if (target && target.habitId && target.habitId !== 'all' && !target.habitId.startsWith('group_')) {
          const habit = core.state && Array.isArray(core.state.habits) ? core.state.habits.find(h => h.id === target.habitId) : null;
          const currentLog = (habit && habit.logs) ? habit.logs[targetDate] : null;
          const currentCount = currentLog ? (currentLog.count || 0) : 0;
          const newCount = Math.max(0, currentCount - 1);
          const btn = (target.card && typeof target.card.querySelector === 'function') ? target.card.querySelector('.btn-card-quick-log') : null;
          if (core.setHabitCountForDate) core.setHabitCountForDate(target.habitId, targetDate, newCount, btn, '-1');
        }
      } else if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : (core.getTodayKey ? core.getTodayKey() : '');
        const target = core.getActiveCardAndHabitId ? core.getActiveCardAndHabitId() : null;
        if (target && target.habitId && target.habitId !== 'all' && !target.habitId.startsWith('group_')) {
          const num = parseInt(key, 10);
          const btn = (target.card && typeof target.card.querySelector === 'function') ? target.card.querySelector('.btn-card-quick-log') : null;
          if (core.setHabitCountForDate) core.setHabitCountForDate(target.habitId, targetDate, num, btn, num === 0 ? '0' : `${num}`);
        }
      } else if (/^[A-Z]$/.test(key)) {
        e.preventDefault();
        const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : (core.getTodayKey ? core.getTodayKey() : '');
        const target = core.getActiveCardAndHabitId ? core.getActiveCardAndHabitId() : null;
        const habitId = (target && target.habitId && target.habitId !== 'all' && !target.habitId.startsWith('group_')) ? target.habitId : null;
        if (core.openLogModal) {
          core.openLogModal(targetDate, habitId);
          const noteInput = (core.elements && core.elements.modalLogNote) ? core.elements.modalLogNote : document.getElementById('modal-log-note');
          if (noteInput) {
            const existingVal = noteInput.value || '';
            let newVal = key;
            if (existingVal && existingVal.trim() !== '') {
              newVal = existingVal.trimEnd() + ' ' + key;
            }
            noteInput.value = newVal;
            noteInput.focus();
            if (typeof noteInput.setSelectionRange === 'function') {
              noteInput.setSelectionRange(newVal.length, newVal.length);
            }
          }
        }
      } else if (key === ' ' || key === 'Spacebar' || e.code === 'Space') {
        const selectedCard = (document.querySelector && document.querySelector('.heatmap-card.selected')) ||
                             (document.querySelector && document.querySelector('.heatmap-card.selected-habit')) ||
                             (document.querySelector && document.querySelector('.day-square.cursor-day')?.closest('.heatmap-card')) ||
                             (document.querySelector && document.querySelector('.heatmap-card'));
        if (selectedCard) {
          const rawHabitId = selectedCard.getAttribute('data-habit-id-raw') ||
                             selectedCard.getAttribute('data-habit-id') ||
                             (selectedCard.closest('.heatmap-group-wrapper') && selectedCard.closest('.heatmap-group-wrapper').getAttribute('data-habit-id'));
          const hasSubhabitsAttr = selectedCard.getAttribute('data-has-subhabits') === 'true';
          const subCount = (core.state && Array.isArray(core.state.habits) && rawHabitId)
            ? core.state.habits.filter(h => h.parentId === rawHabitId || h.parentId === rawHabitId.replace(/^group_/, '')).length
            : 0;

          if (hasSubhabitsAttr || subCount > 0) {
            e.preventDefault();
            let parentIdToToggle = rawHabitId;
            if (parentIdToToggle && parentIdToToggle.startsWith('group_')) {
              const habit = core.state.habits.find(h => h.parentId && parentIdToToggle.includes(h.parentId));
              if (habit) parentIdToToggle = habit.parentId;
            }
            if (!parentIdToToggle && selectedCard.closest('.heatmap-group-wrapper')) {
              parentIdToToggle = selectedCard.closest('.heatmap-group-wrapper').getAttribute('data-habit-id');
            }
            if (parentIdToToggle && core.toggleConcertina) {
              core.toggleConcertina(parentIdToToggle);
            }
          }
        }
      }
    });

    if (core.setupMobileArrowPad) core.setupMobileArrowPad();
    if (core.updateFloatingDateBar) core.updateFloatingDateBar();

    core.elements.modalWidgets = document.getElementById('modal-widgets');
    if (core.initWidgetsUI) core.initWidgetsUI();
    if (core.initDayBoundaryUI) core.initDayBoundaryUI();
  };

  core.initDayBoundaryUI = function() {
    const selectMode = document.getElementById('select-day-boundary-mode');
    const inputLat = document.getElementById('input-latitude');
    const inputLng = document.getElementById('input-longitude');
    const btnSave = document.getElementById('btn-save-location');
    const btnDetect = document.getElementById('btn-detect-location');
    const previewEl = document.getElementById('sun-times-preview');

    if (!selectMode) return;

    const updatePreview = () => {
      if (!previewEl || !core.calculateSunTimes) return;
      const lat = parseFloat(inputLat ? inputLat.value : 51.5074) || 51.5074;
      const lng = parseFloat(inputLng ? inputLng.value : -0.1278) || -0.1278;
      const sun = core.calculateSunTimes(new Date(), lat, lng);
      const srStr = sun.sunrise ? sun.sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
      const ssStr = sun.sunset ? sun.sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
      const info = core.getDayBoundaryInfo ? core.getDayBoundaryInfo(new Date()) : {};

      previewEl.innerHTML = `☀️ Today's Sunrise: <strong>${srStr}</strong> &nbsp;|&nbsp; 🌇 Sunset: <strong>${ssStr}</strong><br>` +
        `<span style="color: var(--text-secondary); font-size: 0.8rem;">Current Active Date: <strong>${info.dateKey || core.getTodayKey()}</strong> (${info.boundaryLabel || ''})</span>`;
    };

    if (core.state) {
      selectMode.value = core.state.dayBoundaryMode || 'midnight';
      if (inputLat) inputLat.value = typeof core.state.latitude === 'number' ? core.state.latitude : 51.5074;
      if (inputLng) inputLng.value = typeof core.state.longitude === 'number' ? core.state.longitude : -0.1278;
    }

    updatePreview();

    selectMode.addEventListener('change', () => {
      if (core.state) {
        core.state.dayBoundaryMode = selectMode.value;
        if (core.saveState) core.saveState();
      }
      updatePreview();
      if (core.showToast) core.showToast(`Day boundary updated to ${selectMode.options[selectMode.selectedIndex].text}`, 'success');
    });

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        const lat = parseFloat(inputLat ? inputLat.value : 51.5074);
        const lng = parseFloat(inputLng ? inputLng.value : -0.1278);
        if (isNaN(lat) || isNaN(lng)) {
          if (core.showToast) core.showToast('Please enter valid numeric latitude and longitude.', 'warning');
          return;
        }
        if (core.state) {
          core.state.latitude = lat;
          core.state.longitude = lng;
          core.state.dayBoundaryMode = selectMode.value;
          if (core.saveState) core.saveState();
        }
        updatePreview();
        if (core.showToast) core.showToast('Day boundary & location settings saved!', 'success');
      });
    }

    if (btnDetect) {
      btnDetect.addEventListener('click', () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          if (core.showToast) core.showToast('Geolocation is not supported by your browser.', 'error');
          return;
        }
        btnDetect.textContent = '⌛ Detecting...';
        btnDetect.disabled = true;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            btnDetect.textContent = '🎯 Auto-Detect Location';
            btnDetect.disabled = false;
            const lat = parseFloat(pos.coords.latitude.toFixed(4));
            const lng = parseFloat(pos.coords.longitude.toFixed(4));
            if (inputLat) inputLat.value = lat;
            if (inputLng) inputLng.value = lng;
            if (core.state) {
              core.state.latitude = lat;
              core.state.longitude = lng;
              core.state.locationName = 'Auto-Detected Location';
              if (core.saveState) core.saveState();
            }
            updatePreview();
            if (core.showToast) core.showToast(`📍 Location detected: ${lat}°N, ${lng}°E`, 'success');
          },
          (err) => {
            btnDetect.textContent = '🎯 Auto-Detect Location';
            btnDetect.disabled = false;
            if (core.showToast) core.showToast(`Could not detect location: ${err.message}`, 'warning');
          },
          { timeout: 10000 }
        );
      });
    }
  };

  core.setupMobileArrowPad = function() {
    const btnUp = document.getElementById('btn-arrow-up');
    const btnDown = document.getElementById('btn-arrow-down');
    const btnLeft = document.getElementById('btn-arrow-left');
    const btnRight = document.getElementById('btn-arrow-right');
    const btnAction = document.getElementById('btn-arrow-action');
    const btnToday = document.getElementById('btn-arrow-today');

    const triggerHaptic = () => {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(10); } catch (_) {}
      }
    };

    if (btnUp && typeof btnUp.addEventListener === 'function') {
      btnUp.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic();
        if (core.navigateSelectedHabit) core.navigateSelectedHabit(-1);
      });
    }

    if (btnDown && typeof btnDown.addEventListener === 'function') {
      btnDown.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic();
        if (core.navigateSelectedHabit) core.navigateSelectedHabit(1);
      });
    }

    if (btnLeft && typeof btnLeft.addEventListener === 'function') {
      btnLeft.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic();
        if (core.moveCursorDateByDays) core.moveCursorDateByDays(-1);
      });
    }

    if (btnRight && typeof btnRight.addEventListener === 'function') {
      btnRight.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic();
        if (core.moveCursorDateByDays) core.moveCursorDateByDays(1);
      });
    }

    if (btnToday && typeof btnToday.addEventListener === 'function') {
      btnToday.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic();
        if (core.setCursorDateKey && core.getTodayKey) {
          core.setCursorDateKey(core.getTodayKey(), true);
        }
      });
    }

    if (btnAction && typeof btnAction.addEventListener === 'function') {
      btnAction.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic();
        const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : (core.getTodayKey ? core.getTodayKey() : '');
        const target = core.getActiveCardAndHabitId ? core.getActiveCardAndHabitId() : null;
        if (target && target.card) {
          const quickLogBtn = typeof target.card.querySelector === 'function' ? target.card.querySelector('.btn-card-quick-log') : null;
          if (quickLogBtn && typeof quickLogBtn.click === 'function') {
            quickLogBtn.click();
          } else {
            const habitId = target.habitId || (target.card.getAttribute ? (target.card.getAttribute('data-habit-id') || target.card.getAttribute('data-habit-id-raw')) : null);
            if (habitId && habitId !== 'all' && !habitId.startsWith('group_') && core.toggleHabitForDate) {
              core.toggleHabitForDate(habitId, targetDate);
            } else if (core.openLogModal) {
              core.openLogModal(targetDate);
            }
          }
        } else if (core.openLogModal) {
          core.openLogModal(targetDate);
        }
      });
    }
  };

  core.updateFloatingDateBar = function() {
    const bar = document.getElementById('floating-today-bar');
    if (!bar) return;

    const todayStr = core.getTodayKey ? core.getTodayKey() : new Date().toISOString().split('T')[0];
    const cursorDateStr = core.getCursorDateKey ? core.getCursorDateKey() : todayStr;

    const dateTextEl = document.getElementById('floating-date-text');
    const todayBadgeEl = document.getElementById('floating-today-badge');

    const cursorDate = core.parseDateKey ? core.parseDateKey(cursorDateStr) : new Date(cursorDateStr + 'T00:00:00');
    const formattedShort = cursorDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    if (cursorDateStr === todayStr) {
      if (dateTextEl) dateTextEl.textContent = `Today, ${formattedShort}`;
      if (todayBadgeEl) todayBadgeEl.classList.add('hidden');
      bar.classList.add('is-today');
      bar.classList.remove('is-past', 'is-future');
    } else {
      const todayDate = core.parseDateKey ? core.parseDateKey(todayStr) : new Date(todayStr + 'T00:00:00');
      const diffDays = Math.round((cursorDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

      let relativeLabel = '';
      if (diffDays === -1) relativeLabel = 'Yesterday';
      else if (diffDays === 1) relativeLabel = 'Tomorrow';
      else if (diffDays < 0) relativeLabel = `${Math.abs(diffDays)}d ago`;
      else if (diffDays > 0) relativeLabel = `${diffDays}d ahead`;

      if (dateTextEl) {
        dateTextEl.textContent = `${relativeLabel} (${formattedShort})`;
      }
      if (todayBadgeEl) {
        todayBadgeEl.classList.remove('hidden');
        todayBadgeEl.textContent = 'Today';
      }

      bar.classList.remove('is-today');
      if (diffDays < 0) {
        bar.classList.add('is-past');
        bar.classList.remove('is-future');
      } else {
        bar.classList.add('is-future');
        bar.classList.remove('is-past');
      }
    }
  };

  core._cursorTooltipTimer = null;

  core.showTooltipForSquare = function(sq, autoHideMs = 0) {
    if (!sq || !core.elements || !core.elements.customTooltip) return;

    if (core._cursorTooltipTimer) {
      clearTimeout(core._cursorTooltipTimer);
      core._cursorTooltipTimer = null;
    }

    const dateStr = sq.dataset.date;
    if (!dateStr) return;
    const habitId = sq.dataset.habitId || 'all';
    const count = parseInt(sq.dataset.count, 10) || 0;
    const isRelapse = sq.dataset.relapse === 'true';
    const isPaused = sq.dataset.paused === 'true';
    const isUnverified = sq.dataset.unverified === 'true';
    const note = sq.dataset.note;
    const habitsDone = sq.dataset.habitsDone;
    const formattedDate = core.formatPrettyDate(dateStr);

    const todayStr = core.getTodayKey();
    const isUpcoming = dateStr > todayStr;

    let text = '';
    if (isPaused) text = `⏸️ <strong>Paused (Tracking paused)</strong> on ${formattedDate}`;
    else if (isRelapse) text = `<strong>Relapse logged</strong> (${note || 'Slip day'}) on ${formattedDate}`;
    else if (habitId.startsWith('all') || habitId.startsWith('group_')) {
      if (habitsDone) text = `✨ <strong>Completed (${count}):</strong> ${habitsDone} on ${formattedDate}`;
      else text = isUpcoming ? `⏳ <strong>Upcoming</strong> on ${formattedDate}` : `No check-ins on ${formattedDate}`;
    } else {
      const habit = (core.state && core.state.habits) ? core.state.habits.find(h => h.id === habitId) : null;
      if (habit && habit.type === 'negative') {
        if (count > 0) text = `✨ <strong>Clean Day Success</strong> on ${formattedDate}`;
        else text = isUpcoming ? `⏳ <strong>Upcoming</strong> on ${formattedDate}` : `No data for ${formattedDate}`;
      } else {
        const dailyTarget = habit ? Math.max(1, habit.dailyTarget || 1) : 1;
        if (isUpcoming) {
          if (count > 0) {
            const unverifiedTag = isUnverified ? ' (Unverified)' : '';
            text = `⏳ <strong>Upcoming: ${count}/${dailyTarget} pre-logged${unverifiedTag}</strong> on ${formattedDate}`;
          } else {
            text = `⏳ <strong>Upcoming</strong> on ${formattedDate}`;
          }
        } else if (dailyTarget > 1) {
          const status = count >= dailyTarget ? ' 🎉 Goal Met!' : '';
          text = `<strong>${count}/${dailyTarget} completed${status}</strong> on ${formattedDate}`;
        } else text = `<strong>${count} completion${count === 1 ? '' : 's'}</strong> on ${formattedDate}`;
      }
    }
    const hasUserNote = sq.dataset.hasNote === 'true';
    if (hasUserNote && note && note.trim() !== '') {
      text += `<br><span style="color: var(--accent-amber, #d29922); opacity: 0.95; font-size: 0.88em;">📝 ${core.escapeHTML(note)}</span>`;
    }
    core.elements.customTooltip.innerHTML = text;
    core.elements.customTooltip.classList.remove('hidden');

    const rect = sq.getBoundingClientRect();
    const tooltipWidth = core.elements.customTooltip.offsetWidth || 150;
    const tooltipHeight = core.elements.customTooltip.offsetHeight || 40;
    const viewportWidth = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement.clientWidth || window.innerWidth : 1000;
    const viewportHeight = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement.clientHeight || window.innerHeight : 800;
    const padding = 8;
    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    left = Math.max(padding, Math.min(left, viewportWidth - tooltipWidth - padding));
    const gap = 8;
    let top = rect.top - tooltipHeight - gap;
    if (top < padding) top = rect.bottom + gap;
    top = Math.max(padding, Math.min(top, viewportHeight - tooltipHeight - padding));
    core.elements.customTooltip.style.left = `${left}px`;
    core.elements.customTooltip.style.top = `${top}px`;

    if (autoHideMs > 0) {
      core._cursorTooltipTimer = setTimeout(() => {
        if (core.elements.customTooltip) {
          core.elements.customTooltip.classList.add('hidden');
        }
        core._cursorTooltipTimer = null;
      }, autoHideMs);
    }
  };

  core.showCursorTooltip = function(autoHideMs = 1200) {
    if (!core.elements || !core.elements.heatmapsGallery || typeof core.elements.heatmapsGallery.querySelectorAll !== 'function') return;

    const allCursorSquares = Array.from(core.elements.heatmapsGallery.querySelectorAll('.day-square.cursor-day'));
    if (allCursorSquares.length === 0) return;

    const viewportWidth = (typeof document !== 'undefined' && document.documentElement) ? (document.documentElement.clientWidth || window.innerWidth) : 1000;
    const viewportHeight = (typeof document !== 'undefined' && document.documentElement) ? (document.documentElement.clientHeight || window.innerHeight) : 800;

    const visibleSquares = allCursorSquares.filter(sq => {
      const rect = sq.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= viewportHeight && rect.right >= 0 && rect.left <= viewportWidth;
    });

    const candidateSquares = visibleSquares.length > 0 ? visibleSquares : allCursorSquares;

    let chosenSq = candidateSquares[0];

    if (core.mouseX >= 0 && core.mouseY >= 0) {
      let minDistance = Infinity;
      candidateSquares.forEach(sq => {
        const rect = sq.getBoundingClientRect();
        const centerX = rect.left + (rect.width / 2);
        const centerY = rect.top + (rect.height / 2);
        const dist = Math.hypot(centerX - core.mouseX, centerY - core.mouseY);
        if (dist < minDistance) {
          minDistance = dist;
          chosenSq = sq;
        }
      });
    } else {
      const target = core.getActiveCardAndHabitId ? core.getActiveCardAndHabitId() : null;
      const targetSq = (target && target.card && typeof target.card.querySelector === 'function') ? target.card.querySelector('.day-square.cursor-day') : null;
      if (targetSq && candidateSquares.includes(targetSq)) {
        chosenSq = targetSq;
      } else {
        const viewportCenterX = viewportWidth / 2;
        const viewportCenterY = viewportHeight / 2;
        let minCenterDistance = Infinity;

        candidateSquares.forEach(sq => {
          const rect = sq.getBoundingClientRect();
          const centerX = rect.left + (rect.width / 2);
          const centerY = rect.top + (rect.height / 2);
          const dist = Math.hypot(centerX - viewportCenterX, centerY - viewportCenterY);
          if (dist < minCenterDistance) {
            minCenterDistance = dist;
            chosenSq = sq;
          }
        });
      }
    }

    if (chosenSq) {
      if (typeof chosenSq.scrollIntoView === 'function') {
        try {
          chosenSq.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        } catch (err) {}
      }
      core.showTooltipForSquare(chosenSq, autoHideMs);
    }
  };

  core.attachHeatmapSquareEvents = function() {
    // SINGLE DELEGATED EVENT LISTENER ON THE GALLERY CONTAINER
    const gallery = core.elements.heatmapsGallery;
    if (!gallery || typeof gallery.addEventListener !== 'function' || gallery._eventsAttached) return; // Prevent attaching multiple times
    gallery._eventsAttached = true;

    let longPressTimer = null, startX = 0, startY = 0;

    const cancelLongPress = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };

    gallery.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('.focused-day-toolbar') || e.target.closest('.card-header-actions') || e.target.closest('.card-context-menu-dropdown') || e.target.closest('.card-title-link') || e.target.closest('button, input, select, a, .btn-card-quick-log')) return;

      const sq = e.target.closest('.day-square[data-date], rect[data-date]');
      const card = e.target.closest('.heatmap-card');
      if (!sq && !card) return;

      cancelLongPress();
      const targetEl = sq || card;
      targetEl._isLongPressTriggered = false;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX; startY = clientY;

      longPressTimer = setTimeout(() => {
        targetEl._isLongPressTriggered = true;
        longPressTimer = null;
        if (core.vibrate) core.vibrate(40);
        if (core.elements.customTooltip) core.elements.customTooltip.classList.add('hidden');
        const dateStr = sq ? sq.getAttribute('data-date') : (core.getCursorDateKey ? core.getCursorDateKey() : core.getTodayKey());
        let targetHabitId = sq ? sq.getAttribute('data-habit-id') : null;
        if (!targetHabitId || targetHabitId === 'all' || targetHabitId.startsWith('group_')) {
          targetHabitId = card ? (card.getAttribute('data-habit-id') || 'all') : 'all';
        }
        if (card && (card.getAttribute('data-habit-id') || card.getAttribute('data-habit-id-raw')) && core.state) {
          const cardHabitId = card.getAttribute('data-habit-id');
          const clickedRawId = card.getAttribute('data-habit-id-raw');
          core.state.selectedHabitId = cardHabitId || clickedRawId;
          if (core.ensureHabitAncestorsExpanded) {
            core.ensureHabitAncestorsExpanded(clickedRawId || cardHabitId);
          }
          const allCards = gallery.querySelectorAll('.heatmap-card');
          allCards.forEach(c => {
            const cId = c.getAttribute('data-habit-id');
            const cRawId = c.getAttribute('data-habit-id-raw');
            if (cId === cardHabitId || (clickedRawId && cRawId === clickedRawId)) {
              c.classList.add('selected');
              c.classList.add('selected-habit');
            } else {
              c.classList.remove('selected');
              c.classList.remove('selected-habit');
            }
          });
        }
        if (dateStr && core.setCursorDateKey) {
          core.setCursorDateKey(dateStr, true);
        }
        const habitIdToEdit = card ? (card.getAttribute('data-habit-id-raw') || card.getAttribute('data-habit-id')) : targetHabitId;
        const habitToEdit = core.state && core.state.habits ? core.state.habits.find(h => h.id === habitIdToEdit) : null;
        if (habitToEdit && core.openHabitModal) {
          core.openHabitModal(habitToEdit);
        } else if (core.openLogModal) {
          core.openLogModal(dateStr, targetHabitId);
        }
      }, 500);
    });

    gallery.addEventListener('pointermove', (e) => {
      if (!longPressTimer) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      if (Math.hypot(clientX - startX, clientY - startY) > 10) cancelLongPress();
    });

    gallery.addEventListener('pointerup', cancelLongPress);
    gallery.addEventListener('pointercancel', cancelLongPress);

    gallery.addEventListener('mouseover', (e) => {
      const sq = e.target.closest('.day-square[data-date], rect[data-date]');
      if (sq) core.showTooltipForSquare(sq, 0);
    });

    gallery.addEventListener('mouseout', (e) => {
      const sq = e.target.closest('.day-square[data-date], rect[data-date]');
      if (sq) {
        if (core._cursorTooltipTimer) { clearTimeout(core._cursorTooltipTimer); core._cursorTooltipTimer = null; }
        if (core.elements.customTooltip) core.elements.customTooltip.classList.add('hidden');
      }
    });

    gallery.addEventListener('click', (e) => {
      const concertinaBtn = e.target.closest('.btn-toggle-concertina');
      if (concertinaBtn) {
        e.stopPropagation();
        e.preventDefault();
        const habitId = concertinaBtn.dataset.habitId || concertinaBtn.dataset.parentId || concertinaBtn.getAttribute('data-habit-id') || concertinaBtn.getAttribute('data-parent-id');
        if (habitId && core.toggleConcertina) core.toggleConcertina(habitId);
        return;
      }

      const card = e.target.closest('.heatmap-card');
      if (!card) return; // Only process clicks inside cards

      const cardHabitId = card.getAttribute('data-habit-id');
      const clickedRawId = card.getAttribute('data-habit-id-raw');
      const wasAlreadySelected = card.classList.contains('selected') || card.classList.contains('selected-habit') || (core.state && (core.state.selectedHabitId === cardHabitId || (clickedRawId && core.state.selectedHabitId === clickedRawId)));

      if ((cardHabitId || clickedRawId) && core.state) {
        core.state.selectedHabitId = cardHabitId || clickedRawId;
        if (core.ensureHabitAncestorsExpanded) {
          core.ensureHabitAncestorsExpanded(clickedRawId || cardHabitId);
        }
        const allCards = gallery.querySelectorAll('.heatmap-card');
        allCards.forEach(c => {
          const cId = c.getAttribute('data-habit-id');
          const cRawId = c.getAttribute('data-habit-id-raw');
          if (cId === cardHabitId || (clickedRawId && cRawId === clickedRawId)) {
            c.classList.add('selected');
            c.classList.add('selected-habit');
          } else {
            c.classList.remove('selected');
            c.classList.remove('selected-habit');
          }
        });
      }

      // 1. Handle Quick Log Button clicks via Delegation
      const quickLogBtn = e.target.closest('.btn-card-quick-log');
      if (quickLogBtn) {
        e.stopPropagation();
        e.preventDefault();
        const habitId = quickLogBtn.dataset.habitId || quickLogBtn.getAttribute('data-habit-id');

        if (!habitId) return;

        const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : core.getTodayKey();

        core.toggleHabitForDate(habitId, targetDate, quickLogBtn);
        return;
      }

      // 2. Handle Edit / Context Menu Button clicks via Delegation
      const editBtn = e.target.closest('.btn-card-edit, .btn-card-menu-toggle');
      if (editBtn) {
        e.stopPropagation();
        e.preventDefault();
        const habitId = editBtn.dataset.habitId || editBtn.getAttribute('data-habit-id');
        const habit = core.state.habits.find(h => h.id === habitId);
        if (habit && core.openHabitModal) core.openHabitModal(habit);
        return;
      }

      // 3. Handle Move Up / Down button clicks via Delegation
      const moveBtn = e.target.closest('.btn-move-up, .btn-move-down');
      if (moveBtn) {
        e.stopPropagation();
        e.preventDefault();

        const habitId = moveBtn.dataset.habitId || moveBtn.getAttribute('data-habit-id');
        const isUp = moveBtn.classList.contains('btn-move-up');

        const habit = core.state.habits.find(h => h.id === habitId);
        if (!habit) return;

        const siblings = core.state.habits.filter(h => h.parentId === habit.parentId);
        const siblingIndex = siblings.findIndex(h => h.id === habitId);

        if (isUp && siblingIndex > 0) {
          const prevSibling = siblings[siblingIndex - 1];
          const fromIndex = core.state.habits.findIndex(h => h.id === habitId);
          const [movedHabit] = core.state.habits.splice(fromIndex, 1);
          const newToIndex = core.state.habits.findIndex(h => h.id === prevSibling.id);
          core.state.habits.splice(newToIndex, 0, movedHabit);
          if (core.renderAll) core.renderAll();
          if (core.saveState) core.saveState();
        } else if (!isUp && siblingIndex < siblings.length - 1) {
          const nextSibling = siblings[siblingIndex + 1];
          const fromIndex = core.state.habits.findIndex(h => h.id === habitId);
          const [movedHabit] = core.state.habits.splice(fromIndex, 1);
          const newToIndex = core.state.habits.findIndex(h => h.id === nextSibling.id);
          core.state.habits.splice(newToIndex + 1, 0, movedHabit);
          if (core.renderAll) core.renderAll();
          if (core.saveState) core.saveState();
        }
        return;
      }

      const downloadSvgBtn = e.target.closest('.btn-card-download-svg');
      if (downloadSvgBtn) {
        e.stopPropagation();
        e.preventDefault();
        const menu = downloadSvgBtn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        card.classList.remove('menu-open');
        const habitId = downloadSvgBtn.dataset.habitId || downloadSvgBtn.getAttribute('data-habit-id');
        if (habitId && core.downloadHeatmapSVG) {
          core.downloadHeatmapSVG(habitId, core.state.selectedYear);
          if (core.showToast) core.showToast('SVG Downloaded! 🎨');
        }
        return;
      }

      const pauseBtn = e.target.closest('.btn-card-pause');
      if (pauseBtn) {
        e.stopPropagation();
        e.preventDefault();
        const menu = pauseBtn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        card.classList.remove('menu-open');
        const habitId = pauseBtn.dataset.habitId || pauseBtn.getAttribute('data-habit-id');
        const habit = core.state.habits.find(h => h.id === habitId);
        if (habit) {
          const newIsPaused = !habit.isPaused;
          if (core.setHabitPauseState) core.setHabitPauseState(habit, newIsPaused);
          if (core.renderAll) core.renderAll();
          if (core.saveHabit) core.saveHabit(habit);
          else if (core.saveState) core.saveState();
          if (core.showToast) core.showToast(newIsPaused ? `Paused "${habit.name}" ⏸️` : `Resumed "${habit.name}" ▶️`);
        }
        return;
      }

      const deleteBtn = e.target.closest('.btn-card-delete');
      if (deleteBtn) {
        e.stopPropagation();
        e.preventDefault();
        const menu = deleteBtn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        card.classList.remove('menu-open');
        const habitId = deleteBtn.dataset.habitId || deleteBtn.getAttribute('data-habit-id');
        if (habitId && core.deleteHabit) core.deleteHabit(habitId);
        return;
      }

      const shareBtn = e.target.closest('.btn-card-share');
      if (shareBtn) {
        e.stopPropagation();
        e.preventDefault();
        const habitId = shareBtn.dataset.habitId || shareBtn.getAttribute('data-habit-id');
        if (habitId && core.shareHabitDirectly) core.shareHabitDirectly(habitId);
        return;
      }

      const stopShareBtn = e.target.closest('.btn-card-stop-sharing');
      if (stopShareBtn) {
        e.stopPropagation();
        e.preventDefault();
        const habitId = stopShareBtn.dataset.habitId || stopShareBtn.getAttribute('data-habit-id');
        if (habitId && core.stopSharingHabit) core.stopSharingHabit(habitId);
        return;
      }

      if (e.target.closest('.focused-day-toolbar') || e.target.closest('.card-header-actions') || e.target.closest('.card-context-menu-dropdown') || e.target.closest('.card-title-link')) return;

      const sq = e.target.closest('.day-square[data-date], rect[data-date]');
      if (sq && sq._isLongPressTriggered) { sq._isLongPressTriggered = false; e.stopPropagation(); e.preventDefault(); return; }
      if (card && card._isLongPressTriggered) { card._isLongPressTriggered = false; e.stopPropagation(); e.preventDefault(); return; }

      // Short click on heat map or card background
      e.stopPropagation();
      if (core.elements.customTooltip) core.elements.customTooltip.classList.add('hidden');

      if (wasAlreadySelected) {
        // If habit was ALREADY selected, short tap brings up quick add dialogue!
        let targetHabitId = cardHabitId || 'all';
        const sqHabitId = sq ? sq.getAttribute('data-habit-id') : null;
        if (sqHabitId && sqHabitId !== 'all' && !sqHabitId.startsWith('group_')) targetHabitId = sqHabitId;
        const targetDate = sq ? sq.getAttribute('data-date') : (core.getCursorDateKey ? core.getCursorDateKey() : core.getTodayKey());

        if (targetDate && core.setCursorDateKey) {
          core.setCursorDateKey(targetDate, true);
        }
        if (core.openLogModal) {
          core.openLogModal(targetDate, targetHabitId);
        }
      }
    });

    // Delegated event listeners for focused toolbar inputs, concertina controls and buttons
    gallery.addEventListener('change', (e) => {
      if (e.target.classList.contains('focused-date-input')) {
        e.stopPropagation();
        const newDate = e.target.value;
        if (newDate) {
          const newYear = parseInt(newDate.split('-')[0], 10);
          if (newYear && newYear !== core.state.selectedYear && core.getAvailableYears().includes(newYear)) core.state.selectedYear = newYear;
          core.focusedDayState.dateStr = newDate;
          if (core.setCursorDateKey) core.setCursorDateKey(newDate, true);
          if (core.renderAll) core.renderAll();
        }
      } else if (e.target.classList.contains('select-subhabit-sort')) {
        e.stopPropagation();
        const parentId = e.target.dataset.parentId;
        const newSort = e.target.value;
        const parentHabit = core.state.habits.find(h => h.id === parentId);
        if (parentHabit) {
          parentHabit.subhabitSortOrder = newSort;
          parentHabit.updatedAt = Date.now();
          if (core.cascadeSubhabitPreferences) {
            core.cascadeSubhabitPreferences(parentHabit);
          }
          if (core.saveState) core.saveState();
          if (core.renderAll) core.renderAll();
        }
      }
    });

    gallery.addEventListener('click', (e) => {
       const btn = e.target.closest('[data-action-habit-id]');
       if (btn) {
         e.stopPropagation();
         core.toggleHabitForDate(btn.dataset.actionHabitId, btn.dataset.actionDateKey, btn);
         return;
       }

       const closeBtn = e.target.closest('#btn-close-focused-toolbar');
       if (closeBtn) {
         e.stopPropagation();
         core.focusedDayState = { habitId: null, dateStr: null };
         if (core.renderAll) core.renderAll();
       }
    });

    const safeQueryGallery = (sel) => (core.elements && core.elements.heatmapsGallery && typeof core.elements.heatmapsGallery.querySelectorAll === 'function') ? core.elements.heatmapsGallery.querySelectorAll(sel) : [];

    safeQueryGallery('.btn-card-menu-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.closest('.card-context-menu-dropdown');
        if (!dropdown) return;
        const menu = dropdown.querySelector('.card-menu-content');
        if (!menu) return;
        safeQueryGallery('.card-menu-content').forEach(m => {
          if (m !== menu) {
            m.classList.add('hidden');
            const otherCard = m.closest('.heatmap-card');
            if (otherCard) otherCard.classList.remove('menu-open');
            const otherWrapper = m.closest('.heatmap-group-wrapper');
            if (otherWrapper) otherWrapper.classList.remove('menu-open');
          }
        });
        const isHidden = menu.classList.toggle('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.toggle('menu-open', !isHidden);
        const parentWrapper = btn.closest('.heatmap-group-wrapper');
        if (parentWrapper) parentWrapper.classList.toggle('menu-open', !isHidden);
      });
    });

    const isNonInteractiveClick = (e) => {
      const isSquare = e.target.classList.contains('day-square') || e.target.tagName.toLowerCase() === 'rect';
      const isCardHeaderAction = e.target.closest('.card-header-actions') || e.target.closest('.card-title-link') || e.target.closest('.badge-subhabits') || e.target.closest('.badge-shared') || e.target.closest('.badge-streak') || e.target.closest('.badge-count') || e.target.closest('.badge-duration') || e.target.closest('.badge-frequency') || e.target.closest('.badge-paused');
      return !isSquare && !isCardHeaderAction;
    };

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.card-context-menu-dropdown') && core.elements.heatmapsGallery && typeof core.elements.heatmapsGallery.querySelectorAll === 'function') {
        safeQueryGallery('.card-menu-content').forEach(m => m.classList.add('hidden'));
        safeQueryGallery('.heatmap-card.menu-open').forEach(c => c.classList.remove('menu-open'));
        safeQueryGallery('.heatmap-group-wrapper.menu-open').forEach(w => w.classList.remove('menu-open'));
      }
    });

    safeQueryGallery('.btn-card-add-sub').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        const parentWrapper = btn.closest('.heatmap-group-wrapper');
        if (parentWrapper) parentWrapper.classList.remove('menu-open');
        core.openHabitModal(null, btn.dataset.habitId);
      });
    });

    safeQueryGallery('.btn-card-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        const parentWrapper = btn.closest('.heatmap-group-wrapper');
        if (parentWrapper) parentWrapper.classList.remove('menu-open');
        const habit = core.state.habits.find(h => h.id === btn.dataset.habitId);
        if (habit) core.openHabitModal(habit);
      });
    });

    safeQueryGallery('.btn-card-download-svg').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        const parentWrapper = btn.closest('.heatmap-group-wrapper');
        if (parentWrapper) parentWrapper.classList.remove('menu-open');

        core.downloadHeatmapSVG(btn.dataset.habitId, core.state.selectedYear);
        if (core.showToast) core.showToast('SVG Downloaded! 🎨');
      });
    });

    safeQueryGallery('.btn-card-pause').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        const parentWrapper = btn.closest('.heatmap-group-wrapper');
        if (parentWrapper) parentWrapper.classList.remove('menu-open');
        const habit = core.state.habits.find(h => h.id === btn.dataset.habitId);
        if (habit) {
          if (!habit.isPaused) {
            core.openPauseModal(habit);
          } else {
            core.setHabitPauseState(habit, false);
            if (core.renderAll) core.renderAll();
            if (core.saveHabit) {
              core.saveHabit(habit);
            } else if (core.saveState) {
              core.saveState();
            }
            if (core.showToast) core.showToast(`Resumed "${habit.name}"`);
          }
        }
      });
    });

    safeQueryGallery('.btn-card-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.card-menu-content');
        if (menu) menu.classList.add('hidden');
        const parentCard = btn.closest('.heatmap-card');
        if (parentCard) parentCard.classList.remove('menu-open');
        const parentWrapper = btn.closest('.heatmap-group-wrapper');
        if (parentWrapper) parentWrapper.classList.remove('menu-open');
        core.deleteHabit(btn.dataset.habitId);
      });
    });

    safeQueryGallery('.btn-toggle-concertina').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const habitId = btn.dataset.habitId || btn.dataset.parentId;
        if (habitId) core.toggleConcertina(habitId);
      });
    });

    safeQueryGallery('.card-title-link').forEach(el => {
      el.addEventListener('click', (e) => e.stopPropagation());
    });

    safeQueryGallery('.btn-card-stop-sharing').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = btn.dataset.habitId;
        if (habitId && core.stopSharingHabit) core.stopSharingHabit(habitId);
      });
    });

    safeQueryGallery('.btn-card-share').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const habitId = btn.dataset.habitId;
        if (habitId && core.shareHabitDirectly) core.shareHabitDirectly(habitId);
      });
    });
  };

  core.shareHabitDirectly = function(habitId) {
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit) return;

    const inputShareCol = document.getElementById('habit-share-collection');
    const inputSharePwd = document.getElementById('habit-share-password');
    const chkShareChildren = document.getElementById('habit-share-include-children');

    const docIdVal = inputShareCol && inputShareCol.value.trim() ? inputShareCol.value.trim() : (habit.sharing ? (habit.sharing.docId || habit.sharing.collection) : '');
    const pwdVal = inputSharePwd && inputSharePwd.value.trim() ? inputSharePwd.value.trim() : (habit.sharing ? habit.sharing.password : '');
    const incChildrenVal = chkShareChildren ? chkShareChildren.checked : true;

    const finalDocId = docIdVal || core.generateShareDocId();
    const finalPwd = pwdVal || core.generateRandomPassword(16);

    if (!habit.sharing) {
      habit.sharing = {
        enabled: true,
        docId: finalDocId,
        collection: finalDocId,
        password: finalPwd,
        includeChildren: incChildrenVal
      };
    } else {
      habit.sharing.enabled = true;
      habit.sharing.docId = finalDocId;
      habit.sharing.collection = finalDocId;
      habit.sharing.password = finalPwd;
      habit.sharing.includeChildren = incChildrenVal;
    }

    // Instantly save state to IndexedDB / LocalStorage so keys & sharing status persist locally
    if (core.saveState) core.saveState();

    // Upload habit data, settings, logs, names, colors, and all sub-habits immediately to Firestore
    if (core.SyncTargets && core.SyncTargets.Firestore) {
      core.SyncTargets.Firestore.startPerHabitLiveSync(habit);
      core.SyncTargets.Firestore.uploadPerHabitBackup(habit).catch(function(err) {
        const errMsg = err && err.message ? err.message : String(err);
        if (core.showToast) core.showToast(`❌ Firestore upload error: ${errMsg}`, 'error');
      });
    }

    // Open Habit Modal with Share section expanded so link & QR code can be copied / viewed
    if (core.openHabitModal) {
      core.openHabitModal(habit.id);
      const shareAccordion = document.getElementById('advanced-settings-accordion');
      if (shareAccordion) shareAccordion.open = true;
      const chkShare = document.getElementById('habit-enable-sharing');
      if (chkShare) chkShare.checked = true;
      const sharePanel = document.getElementById('share-habit-panel');
      if (sharePanel) sharePanel.classList.remove('hidden');
      if (core.updateShareLinkAndQR) core.updateShareLinkAndQR();
    }

    if (core.renderAll) core.renderAll();
    if (core.showToast) core.showToast(`🔥 Shared "${habit.name}" & uploaded logs and sub-habits to Firestore!`, 'success');
  };

  core.stopSharingHabit = function(habitId) {
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit) return;

    if (habit.sharing) {
      habit.sharing.enabled = false;
    }
    if (core.SyncTargets && core.SyncTargets.Firestore) {
      core.SyncTargets.Firestore.stopPerHabitLiveSync(habit.id);
    }

    const chkSharing = document.getElementById('habit-enable-sharing');
    if (chkSharing) chkSharing.checked = false;
    const btnStopShare = document.getElementById('btn-stop-sharing-habit');
    if (btnStopShare) btnStopShare.classList.add('hidden');
    const sharePanel = document.getElementById('share-habit-panel');
    if (sharePanel) sharePanel.classList.add('hidden');

    if (core.saveState) core.saveState();
    if (core.renderAll) core.renderAll();
    if (core.showToast) core.showToast(`🚫 Stopped sharing "${habit.name}" - now stored locally!`, 'info');
  };

  core.getHabitIdFromCardId = function(idStr) {
    if (!idStr) return null;
    if (idStr.startsWith('group_')) return idStr.replace('group_', '').split('_')[0];
    return idStr;
  };

  core.attachCardDragAndDropHandlers = function() {
    let draggedHabitId = null;
    const gallery = core.elements.heatmapsGallery;
    if (!gallery || typeof gallery.querySelectorAll !== 'function') return;

    const cards = gallery.querySelectorAll('.heatmap-card.draggable-card');
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
              if (core.renderAll) core.renderAll();
              if (core.saveState) core.saveState();
              if (core.showToast) core.showToast(`Reordered "${movedHabit.name}"`);
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

    if (dailyOpts && dailyOpts.classList && typeof dailyOpts.classList.toggle === 'function') dailyOpts.classList.toggle('hidden', val !== 'daily');
    if (weeklyOpts && weeklyOpts.classList && typeof weeklyOpts.classList.toggle === 'function') weeklyOpts.classList.toggle('hidden', val !== 'weekly');
    if (monthlyOpts && monthlyOpts.classList && typeof monthlyOpts.classList.toggle === 'function') monthlyOpts.classList.toggle('hidden', val !== 'monthly');
    if (specificOpts && specificOpts.classList && typeof specificOpts.classList.toggle === 'function') specificOpts.classList.toggle('hidden', val !== 'specific_days');
    if (customOpts && customOpts.classList && typeof customOpts.classList.toggle === 'function') customOpts.classList.toggle('hidden', val !== 'custom_interval');
  };

  core.openPauseModal = function(habit) {
    if (!habit || !core.elements.modalPauseHabit) return;
    if (core.elements.pauseHabitId) core.elements.pauseHabitId.value = habit.id;
    if (core.elements.modalPauseHabitBadge) core.elements.modalPauseHabitBadge.textContent = habit.name;

    const todayStr = core.getTodayKey();
    if (core.elements.pauseStartDate) core.elements.pauseStartDate.value = todayStr;
    if (core.elements.pauseResumeDate) core.elements.pauseResumeDate.value = '';
    if (core.elements.pauseNote) core.elements.pauseNote.value = '';
    if (core.elements.pauseHideHeatmap) core.elements.pauseHideHeatmap.checked = habit.hideHeatmapWhenPaused === true;

    core.toggleModalScrollLock(true);
    core.elements.modalPauseHabit.classList.remove('hidden');
  };

  core.closePauseModal = function() {
    if (core.elements.modalPauseHabit) {
      core.elements.modalPauseHabit.classList.add('hidden');
      core.toggleModalScrollLock(false);
    }
  };

  core.handleConfirmPause = function() {
    if (!core.elements.pauseHabitId) return;
    const habitId = core.elements.pauseHabitId.value;
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit) return;

    const startDate = (core.elements.pauseStartDate && core.elements.pauseStartDate.value) ? core.elements.pauseStartDate.value : core.getTodayKey();
    const resumeDate = (core.elements.pauseResumeDate && core.elements.pauseResumeDate.value) ? core.elements.pauseResumeDate.value : null;
    const note = core.elements.pauseNote ? core.elements.pauseNote.value.trim() : '';
    const hideHeatmap = core.elements.pauseHideHeatmap ? core.elements.pauseHideHeatmap.checked : false;

    core.setHabitPauseState(habit, true, startDate, {
      startDate: startDate,
      resumeDate: resumeDate,
      note: note,
      hideHeatmap: hideHeatmap
    });

    core.closePauseModal();
    if (core.renderAll) core.renderAll();
    if (core.saveHabit) {
      core.saveHabit(habit);
    } else if (core.saveState) {
      core.saveState();
    }
    if (core.showToast) {
      const msg = resumeDate ? `Paused "${habit.name}" until ${resumeDate}` : `Paused "${habit.name}"`;
      core.showToast(msg);
    }
  };

  core.openHabitModal = function(habitToEdit = null, defaultParentId = null) {
    if (!core.elements || (!core.elements.habitModal && !core.elements.modalHabit)) {
      if (core.initUI) core.initUI();
    }
    const formEl = (core.elements && core.elements.formHabit) ? core.elements.formHabit : document.getElementById('form-habit');
    if (formEl && typeof formEl.reset === 'function') formEl.reset();
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
        if (!habitToEdit) {
          const selectedPId = parentSelect.value;
          const parentObj = selectedPId ? core.state.habits.find(h => h.id === selectedPId) : null;
          if (core.elements.habitShowCount) core.elements.habitShowCount.checked = parentObj ? parentObj.showCount !== false : true;
          if (core.elements.habitShowDuration) core.elements.habitShowDuration.checked = parentObj ? parentObj.showDuration === true : false;
          if (core.elements.habitHideFromAll) core.elements.habitHideFromAll.checked = parentObj ? parentObj.hideFromAll === true : false;
          if (core.elements.habitHideHeatmap) core.elements.habitHideHeatmap.checked = parentObj ? parentObj.hideHeatmap === true : false;
        }
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
      if (core.elements.habitShowCount) core.elements.habitShowCount.checked = habitToEdit.showCount !== false;
      if (core.elements.habitShowDuration) core.elements.habitShowDuration.checked = habitToEdit.showDuration === true;
      if (core.elements.habitHideFromAll) core.elements.habitHideFromAll.checked = habitToEdit.hideFromAll === true;
      if (core.elements.habitIsPaused) core.elements.habitIsPaused.checked = habitToEdit.isPaused === true;
      if (core.elements.habitHideHeatmapWhenPaused) core.elements.habitHideHeatmapWhenPaused.checked = habitToEdit.hideHeatmapWhenPaused === true;
      if (core.elements.habitHideHeatmap) core.elements.habitHideHeatmap.checked = habitToEdit.hideHeatmap === true;
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
        const formEl = core.elements.formHabit || document.getElementById('form-habit');
        const checkboxes = (formEl && typeof formEl.querySelectorAll === 'function') ? formEl.querySelectorAll('input[name="target-days"]') : [];
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
      const defaultStartDate30 = core.getDaysAgoKey ? core.getDaysAgoKey(30) : new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      if (core.elements.habitHistoryStartDate) core.elements.habitHistoryStartDate.value = defaultStartDate30;
      if (core.elements.habitHistoryDuration) core.elements.habitHistoryDuration.value = defaultStartDate30;
      if (core.elements.habitHistoryFrequency) core.elements.habitHistoryFrequency.value = 'frequent';
      if (core.elements.habitHistoryInstances) core.elements.habitHistoryInstances.value = '1';

      const formEl = core.elements.formHabit || document.getElementById('form-habit');
      const typeRadio = (formEl && typeof formEl.querySelector === 'function') ? formEl.querySelector(`input[name="habit-type"][value="${habitToEdit.type || 'positive'}"]`) : null;
      if (typeRadio) typeRadio.checked = true;

      const rawColor = habitToEdit.colorTheme || core.getDefaultColorForId(habitToEdit.id);
      const normalizedDerived = core.updateColorDropdownDefault(habitToEdit.id);
      const normalized = rawColor.startsWith('#') ? core.normalizeHex(rawColor) : ((typeof window !== 'undefined' && window.colourFromString ? window.colourFromString(rawColor) : null) || normalizedDerived);
      if (core.elements.customColorHex) core.elements.customColorHex.value = normalized;
      if (core.elements.customColorPicker) core.elements.customColorPicker.value = normalized;
      if (core.elements.customSwatchPreview && core.elements.customSwatchPreview.style) {
        core.elements.customSwatchPreview.style.backgroundColor = normalized;
      }
      core.syncCalendarColorDropdown(normalized);
    } else {
      if (core.elements.modalHabitTitle) core.elements.modalHabitTitle.textContent = defaultParentId ? 'Create New Sub-Habit' : 'Create New Habit';
      document.getElementById('habit-id').value = '';
      if (core.elements.habitName) core.elements.habitName.value = '';
      if (core.elements.habitIdDisplay) core.elements.habitIdDisplay.textContent = '';
      if (core.elements.habitIdPreview) core.elements.habitIdPreview.classList.add('hidden');
      if (core.elements.habitFormDetails) core.elements.habitFormDetails.classList.add('hidden');
      if (core.elements.customSwatchPreview && core.elements.customSwatchPreview.style) {
        core.elements.customSwatchPreview.style.backgroundColor = 'transparent';
      }
      const initialParent = selectedParentId ? core.state.habits.find(h => h.id === selectedParentId) : null;
      const normalizedDerived = core.updateColorDropdownDefault(selectedParentId || 'default');
      if (core.elements.customColorHex) core.elements.customColorHex.value = normalizedDerived;
      if (core.elements.customColorPicker) core.elements.customColorPicker.value = normalizedDerived;
      core.syncCalendarColorDropdown(normalizedDerived);
      if (core.elements.habitShowStreak) core.elements.habitShowStreak.checked = false;
      if (core.elements.habitShowCount) core.elements.habitShowCount.checked = initialParent ? initialParent.showCount !== false : true;
      if (core.elements.habitShowDuration) core.elements.habitShowDuration.checked = initialParent ? initialParent.showDuration === true : false;
      if (core.elements.habitHideFromAll) core.elements.habitHideFromAll.checked = initialParent ? initialParent.hideFromAll === true : false;
      if (core.elements.habitHideHeatmap) core.elements.habitHideHeatmap.checked = initialParent ? initialParent.hideHeatmap === true : false;
      if (core.elements.habitIsPaused) core.elements.habitIsPaused.checked = false;
      if (core.elements.habitHideHeatmapWhenPaused) core.elements.habitHideHeatmapWhenPaused.checked = false;
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

      if (core.elements.formHabit && typeof core.elements.formHabit.querySelectorAll === 'function') {
        const checkboxes = core.elements.formHabit.querySelectorAll('input[name="target-days"]');
        checkboxes.forEach(chk => {
          const val = parseInt(chk.value, 10);
          chk.checked = (val === 1 || val === 3 || val === 5);
        });
      }
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
      const defaultStartDate30 = core.getDaysAgoKey ? core.getDaysAgoKey(30) : new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      if (core.elements.habitHistoryStartDate) core.elements.habitHistoryStartDate.value = defaultStartDate30;
      if (core.elements.habitHistoryDuration) core.elements.habitHistoryDuration.value = defaultStartDate30;
      if (core.elements.habitHistoryFrequency) core.elements.habitHistoryFrequency.value = 'frequent';
      if (core.elements.habitHistoryInstances) core.elements.habitHistoryInstances.value = '1';
    }

    const chkSharing = document.getElementById('habit-enable-sharing');
    const inputShareCol = document.getElementById('habit-share-collection');
    const inputSharePwd = document.getElementById('habit-share-password');
    const chkShareChildren = document.getElementById('habit-share-include-children');
    const shareChildrenContainer = document.getElementById('share-habit-children-container');
    const sharePanel = document.getElementById('share-habit-panel');
    const btnToggleShare = document.getElementById('btn-toggle-share-habit-panel');

    const subhabits = habitToEdit ? core.state.habits.filter(h => h.parentId === habitToEdit.id) : [];
    const hasSubhabits = subhabits.length > 0;

    const subhabitDisplaySection = document.getElementById('parent-subhabit-display-section');
    const selectSortOrder = document.getElementById('habit-subhabit-sort-order');

    if (subhabitDisplaySection) {
      if (hasSubhabits) {
        subhabitDisplaySection.classList.remove('hidden');
      } else {
        subhabitDisplaySection.classList.add('hidden');
      }
    }

    if (selectSortOrder) {
      selectSortOrder.value = habitToEdit ? (habitToEdit.subhabitSortOrder || 'manual') : 'manual';
    }

    if (shareChildrenContainer) {
      if (hasSubhabits) {
        shareChildrenContainer.classList.remove('hidden');
      } else {
        shareChildrenContainer.classList.add('hidden');
      }
    }

    const sharingData = (habitToEdit && habitToEdit.sharing && habitToEdit.sharing.enabled) ? habitToEdit.sharing : null;
    if (chkSharing) chkSharing.checked = Boolean(sharingData);
    if (inputShareCol) inputShareCol.value = sharingData ? sharingData.collection || '' : '';
    if (inputSharePwd) inputSharePwd.value = sharingData ? sharingData.password || '' : '';
    if (chkShareChildren) {
      if (hasSubhabits) {
        chkShareChildren.checked = sharingData ? (sharingData.includeChildren !== false) : true;
      } else {
        chkShareChildren.checked = false;
      }
    }

    const btnStopShare = document.getElementById('btn-stop-sharing-habit');
    if (btnStopShare) {
      if (sharingData) {
        btnStopShare.classList.remove('hidden');
        btnStopShare.onclick = () => {
          if (habitToEdit) core.stopSharingHabit(habitToEdit.id);
          if (core.elements.modalHabit) core.elements.modalHabit.classList.add('hidden');
          core.toggleModalScrollLock(false);
        };
      } else {
        btnStopShare.classList.add('hidden');
      }
    }

    if (sharingData && sharePanel) {
      sharePanel.classList.remove('hidden');
      if (btnToggleShare) btnToggleShare.classList.remove('hidden');
    } else {
      if (sharePanel) sharePanel.classList.add('hidden');
      if (btnToggleShare) btnToggleShare.classList.add('hidden');
    }
    if (core.updateShareLinkAndQR) core.updateShareLinkAndQR();

    const accordion = document.getElementById('advanced-settings-accordion');
    if (accordion) {
      if (habitToEdit) {
        const hasAdvanced = Boolean(
          (habitToEdit.description && habitToEdit.description.trim()) ||
          (habitToEdit.category && habitToEdit.category !== 'General') ||
          habitToEdit.parentId ||
          habitToEdit.showStreak ||
          habitToEdit.showDuration ||
          habitToEdit.hideFromAll ||
          habitToEdit.isPaused ||
          (habitToEdit.sharing && habitToEdit.sharing.enabled)
        );
        accordion.open = hasAdvanced;
      } else {
        accordion.open = false;
      }
    }

    const typeRadios = (core.elements.formHabit && typeof core.elements.formHabit.querySelectorAll === 'function') ? core.elements.formHabit.querySelectorAll('input[name="habit-type"]') : [];
    typeRadios.forEach(radio => { radio.onchange = core.updateBackfillWordingUI; });
    core.updateBackfillWordingUI();
    updateParentDependencyUI();

    const btnClearFuture = document.getElementById('btn-clear-future-logs');
    if (btnClearFuture) {
      if (habitToEdit && habitToEdit.id) {
        const todayStr = core.getTodayKey();
        const futureKeys = (habitToEdit.logs) ? Object.keys(habitToEdit.logs).filter(k => k > todayStr && habitToEdit.logs[k] && habitToEdit.logs[k].count > 0) : [];
        btnClearFuture.classList.remove('hidden');
        btnClearFuture.textContent = futureKeys.length > 0 ? `🧹 Clear Future Events (${futureKeys.length})` : '🧹 Clear Future Events';
        btnClearFuture.onclick = () => {
          core.clearFutureLogsForHabit(habitToEdit.id);
          const remainingKeys = (habitToEdit.logs) ? Object.keys(habitToEdit.logs).filter(k => k > todayStr && habitToEdit.logs[k] && habitToEdit.logs[k].count > 0) : [];
          btnClearFuture.textContent = remainingKeys.length > 0 ? `🧹 Clear Future Events (${remainingKeys.length})` : '🧹 Clear Future Events';
        };
      } else {
        btnClearFuture.classList.add('hidden');
        btnClearFuture.onclick = null;
      }
    }

    const actionsSec = document.getElementById('habit-actions-section');
    const btnModalDownloadSvg = document.getElementById('btn-modal-download-svg');
    const btnModalDeleteHabit = document.getElementById('btn-modal-delete-habit');
    const btnModalClearBeforeDate = document.getElementById('btn-modal-clear-before-date');

    if (actionsSec) {
      if (habitToEdit && habitToEdit.id) {
        actionsSec.classList.remove('hidden');
        if (btnModalClearBeforeDate) {
          btnModalClearBeforeDate.onclick = () => {
            core.openClearBeforeDateModal(habitToEdit.id);
          };
        }
        if (btnModalDownloadSvg) {
          btnModalDownloadSvg.onclick = () => {
            if (core.downloadHeatmapSVG) {
              core.downloadHeatmapSVG(habitToEdit.id, core.state.selectedYear);
              if (core.showToast) core.showToast('SVG Downloaded! 🎨');
            }
          };
        }
        if (btnModalDeleteHabit) {
          btnModalDeleteHabit.onclick = () => {
            if (core.deleteHabit) {
              core.deleteHabit(habitToEdit.id);
              if (core.elements.modalHabit) core.elements.modalHabit.classList.add('hidden');
              core.toggleModalScrollLock(false);
            }
          };
        }
      } else {
        actionsSec.classList.add('hidden');
        if (btnModalDownloadSvg) btnModalDownloadSvg.onclick = null;
        if (btnModalDeleteHabit) btnModalDeleteHabit.onclick = null;
      }
    }

    if (core.elements.modalHabit) {
      core.toggleModalScrollLock(true);
      core.elements.modalHabit.classList.remove('hidden');
    }

    const habitNameInput = core.elements.habitName || document.getElementById('habit-name');
    if (habitNameInput && typeof habitNameInput.focus === 'function') {
      habitNameInput.focus();
      setTimeout(() => {
        if (habitNameInput && typeof habitNameInput.focus === 'function') {
          habitNameInput.focus();
        }
      }, 50);
    }
  };

  core.updateColorDropdownDefault = function(derivedIdOrName) {
    const derivedColor = (typeof core.getDefaultColorForId === 'function') ? core.getDefaultColorForId(derivedIdOrName || 'default') : '#33B679';
    const normFn = (typeof core.normalizeHex === 'function') ? core.normalizeHex : function(x) { return x; };
    const normalizedDerived = derivedColor.startsWith('#') ? normFn(derivedColor) : derivedColor;
    const select = document.getElementById('habit-calendar-color-select');
    if (!select || !select.options) return normalizedDerived;

    const upperDerived = normalizedDerived.toUpperCase();

    Array.from(select.options).forEach(opt => {
      if (!opt.value) return;
      let baseText = opt.dataset.baseText || opt.textContent.replace(/\s*\(Default\)/i, '').replace(/\s*\(Auto-Derived Default\)/i, '').trim();
      opt.dataset.baseText = baseText;
      if (opt.value.toUpperCase() === upperDerived) {
        opt.textContent = `${baseText} (Default)`;
      } else {
        opt.textContent = baseText;
      }
    });

    return normalizedDerived;
  };

  core.syncCalendarColorDropdown = function(hex) {
    if (!core.elements.calendarColorSelect || !core.elements.calendarColorSelect.options) return;
    if (!hex) {
      core.elements.calendarColorSelect.value = '';
      return;
    }
    const upperHex = hex.toUpperCase();
    const options = Array.from(core.elements.calendarColorSelect.options);
    const matchedOpt = options.find(opt => opt && opt.value && opt.value.toUpperCase() === upperHex);
    if (matchedOpt) {
      core.elements.calendarColorSelect.value = matchedOpt.value;
    } else {
      core.elements.calendarColorSelect.value = '';
    }
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
      let derivedId = currentId || ((parentIdVal ? parentIdVal + '_' : '') + core.idFromName(nameVal));

      if (core.elements.habitIdDisplay) core.elements.habitIdDisplay.textContent = derivedId;
      if (core.elements.habitIdPreview) core.elements.habitIdPreview.classList.remove('hidden');
      if (core.elements.habitFormDetails) core.elements.habitFormDetails.classList.remove('hidden');

      const normalizedDerived = core.updateColorDropdownDefault(derivedId);
      if (!isEditMode) {
        if (core.elements.customColorHex) core.elements.customColorHex.value = normalizedDerived;
        if (core.elements.customColorPicker) core.elements.customColorPicker.value = normalizedDerived;
        core.syncCalendarColorDropdown(normalizedDerived);
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
      const habitsList = (core.state && core.state.habits) ? core.state.habits : [];
      const children = habitsList.filter(h => (h.parentId || null) === parentId);
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
    const typeRadio = (core.elements.formHabit && typeof core.elements.formHabit.querySelector === 'function') ? core.elements.formHabit.querySelector('input[name="habit-type"]:checked') : (typeof document !== 'undefined' && typeof document.querySelector === 'function' ? document.querySelector('input[name="habit-type"]:checked') : null);
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

  core.handleHabitFormSubmit = async function(e) {
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
    const typeRadio = (formEl && typeof formEl.querySelector === 'function') ? formEl.querySelector('input[name="habit-type"]:checked') : null;
    const type = typeRadio ? typeRadio.value : (getVal('habit-type') || 'positive');
    const description = (getVal('habit-description') || (document.getElementById('habit-description') ? document.getElementById('habit-description').value : '')).trim();
    const category = (getVal('habit-category') || (document.getElementById('habit-category') ? document.getElementById('habit-category').value : '')).trim();
    const dailyTargetInput = document.getElementById('habit-daily-target');
    const dailyTarget = parseInt(getVal('habit-daily-target') || (dailyTargetInput ? dailyTargetInput.value : '1'), 10) || 1;
    const colorRadio = (formEl && typeof formEl.querySelector === 'function') ? formEl.querySelector('input[name="habit-color"]:checked') : null;
    const selectedColorRadio = colorRadio ? colorRadio.value : (getVal('habit-color') || 'green');
    const parentIdVal = (getVal('habit-parent') || (document.getElementById('habit-parent') ? document.getElementById('habit-parent').value : '')).trim();
    const parentId = parentIdVal ? parentIdVal : null;
    const parentDepSelect = document.getElementById('habit-parent-dependency');
    const parentDependency = parentId ? (getVal('habit-parent-dependency') || (parentDepSelect ? parentDepSelect.value : 'none')) : 'none';
    const showStreakInput = core.elements.habitShowStreak || document.getElementById('habit-show-streak');
    const showStreak = (showStreakInput && typeof showStreakInput.checked === 'boolean') ? showStreakInput.checked : hasVal('habit-show-streak');

    const showCountInput = core.elements.habitShowCount || document.getElementById('habit-show-count');
    const showCount = (showCountInput && typeof showCountInput.checked === 'boolean') ? showCountInput.checked : (hasVal('habit-show-count') || true);

    const showDurationInput = core.elements.habitShowDuration || document.getElementById('habit-show-duration');
    const showDuration = (showDurationInput && typeof showDurationInput.checked === 'boolean') ? showDurationInput.checked : hasVal('habit-show-duration');

    const hideFromAllInput = core.elements.habitHideFromAll || document.getElementById('habit-hide-from-all');
    const hideFromAll = (hideFromAllInput && typeof hideFromAllInput.checked === 'boolean') ? hideFromAllInput.checked : hasVal('habit-hide-from-all');

    const isPausedInput = core.elements.habitIsPaused || document.getElementById('habit-is-paused');
    const isPaused = (isPausedInput && typeof isPausedInput.checked === 'boolean') ? isPausedInput.checked : hasVal('habit-is-paused');

    const hideHeatmapWhenPausedInput = core.elements.habitHideHeatmapWhenPaused || document.getElementById('habit-hide-heatmap-when-paused');
    const hideHeatmapWhenPaused = (hideHeatmapWhenPausedInput && typeof hideHeatmapWhenPausedInput.checked === 'boolean') ? hideHeatmapWhenPausedInput.checked : hasVal('habit-hide-heatmap-when-paused');

    const hideHeatmapInput = core.elements.habitHideHeatmap || document.getElementById('habit-hide-heatmap');
    const hideHeatmap = (hideHeatmapInput && typeof hideHeatmapInput.checked === 'boolean') ? hideHeatmapInput.checked : hasVal('habit-hide-heatmap');

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
      const checkedBtns = (formEl && typeof formEl.querySelectorAll === 'function') ? Array.from(formEl.querySelectorAll('input[name="target-days"]:checked')) : [];
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

    const calSelect = document.getElementById('habit-calendar-color-select');
    const calVal = (calSelect && calSelect.value) ? calSelect.value : (getVal('habit-calendar-color-select') || '');
    const hexInput = document.getElementById('habit-custom-color-hex');
    const hexVal = (hexInput && hexInput.value) ? hexInput.value : (core.elements.customColorHex ? core.elements.customColorHex.value : (getVal('habit-custom-color-hex') || ''));
    const pickerInput = document.getElementById('habit-custom-color-picker');
    const pickerVal = (pickerInput && pickerInput.value) ? pickerInput.value : (getVal('habit-custom-color-picker') || '');

    const idFn = (typeof core.idFromName === 'function') ? core.idFromName : function(n) { return 'habit_' + String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    const derivedIdKey = id || (parentId ? parentId + '_' : '') + idFn(name) || name || 'default';
    const defaultColorFn = (typeof core.getDefaultColorForId === 'function') ? core.getDefaultColorForId : function() { return '#33B679'; };
    const derivedDefaultColor = defaultColorFn(derivedIdKey);
    const normFn = (typeof core.normalizeHex === 'function') ? core.normalizeHex : function(x) { return x; };
    const normalizedDerived = derivedDefaultColor.startsWith('#') ? normFn(derivedDefaultColor) : derivedDefaultColor;

    const chosenColor = calVal || hexVal || pickerVal;
    const parseHexFn = (typeof core.parseHexColor === 'function') ? core.parseHexColor : function(x) { return x; };
    let colorTheme = (chosenColor && parseHexFn(chosenColor))
      ? normFn(chosenColor)
      : normalizedDerived;

    if (colorTheme && colorTheme.toUpperCase() === normalizedDerived.toUpperCase()) {
      colorTheme = undefined;
    }

    const chkSharing = document.getElementById('habit-enable-sharing');
    const inputShareCol = document.getElementById('habit-share-collection');
    const inputSharePwd = document.getElementById('habit-share-password');
    const chkShareChildren = document.getElementById('habit-share-include-children');
    const enableSharing = chkSharing ? chkSharing.checked : false;
    let shareDocId = inputShareCol ? inputShareCol.value.trim() : '';
    let sharePwd = inputSharePwd ? inputSharePwd.value.trim() : '';
    const includeChildren = chkShareChildren ? chkShareChildren.checked : false;

    const existingHabitObj = id ? core.state.habits.find(h => h.id === id) : null;
    if (enableSharing) {
      if (existingHabitObj && existingHabitObj.sharing) {
        if (!shareDocId && (existingHabitObj.sharing.docId || existingHabitObj.sharing.collection)) {
          shareDocId = existingHabitObj.sharing.docId || existingHabitObj.sharing.collection;
        }
        if (!sharePwd && existingHabitObj.sharing.password) sharePwd = existingHabitObj.sharing.password;
      }
      if (!shareDocId) shareDocId = core.generateShareDocId();
      if (!sharePwd) sharePwd = core.generateRandomPassword(16);
    }

    const sharingConfig = enableSharing ? {
      enabled: true,
      docId: shareDocId,
      collection: shareDocId,
      password: sharePwd,
      includeChildren: includeChildren
    } : null;

    const selectSortOrder = document.getElementById('habit-subhabit-sort-order');
    const subhabitSortOrder = selectSortOrder ? selectSortOrder.value : 'manual';

    if (!name) return;

    let savedTargetHabit = null;

    if (id) {
      const habit = core.state.habits.find(h => h.id === id);
      if (habit) {
        savedTargetHabit = habit;
        const previousHideFromAll = Boolean(habit.hideFromAll);
        habit.name = name; habit.type = type; habit.description = description; habit.category = category; habit.dailyTarget = dailyTarget; habit.showStreak = showStreak; habit.showCount = showCount; habit.showDuration = showDuration; habit.hideFromAll = hideFromAll; habit.hideHeatmapWhenPaused = hideHeatmapWhenPaused; habit.hideHeatmap = hideHeatmap;
        habit.subhabitSortOrder = subhabitSortOrder;
        core.setHabitPauseState(habit, isPaused, core.getTodayKey(), { hideHeatmap: hideHeatmapWhenPaused });
        habit.frequencyType = freqType; habit.targetDays = targetDays; habit.weeklyTarget = weeklyTarget; habit.monthlyDay = monthlyDay; habit.monthlyTarget = monthlyTarget; habit.colorWholeWeek = colorWholeWeek; habit.colorWholeMonth = colorWholeMonth; habit.customTarget = customTarget; habit.customInterval = customInterval; habit.customUnit = customUnit; habit.parentId = parentId; habit.parentDependency = parentDependency;
        if (colorTheme) {
          habit.colorTheme = colorTheme;
        } else {
          delete habit.colorTheme;
        }

        const directSubhabits = core.state.habits.filter(h => h.parentId === habit.id);
        if (directSubhabits.length > 0) {
          const askCascade = await core.showConfirmModal(
            `Would you like all ${directSubhabits.length} sub-habits to also update to matching options?`,
            { title: 'Update Sub-Habits?', yesText: 'Yes', noText: 'No' }
          );

          if (askCascade) {
            if (core.cascadeSubhabitPreferences) {
              core.cascadeSubhabitPreferences(habit);
            }
            const descendantIds = core.getAllDescendantIds(habit.id);
            descendantIds.forEach(descId => {
              if (descId !== habit.id) {
                const desc = core.state.habits.find(h => h.id === descId);
                if (desc) {
                  desc.colorTheme = habit.colorTheme;
                  desc.showStreak = habit.showStreak;
                  desc.showCount = habit.showCount;
                  desc.showDuration = habit.showDuration;
                  desc.hideFromAll = habit.hideFromAll;
                  desc.hideHeatmap = habit.hideHeatmap;
                  desc.hideHeatmapWhenPaused = habit.hideHeatmapWhenPaused;
                  desc.subhabitSortOrder = habit.subhabitSortOrder;
                  desc.updatedAt = Date.now();
                }
              }
            });
          }
        }

        if (sharingConfig) {
          habit.sharing = sharingConfig;
        } else {
          if (habit.sharing) habit.sharing.enabled = false;
          if (core.SyncTargets && core.SyncTargets.Firestore) {
            core.SyncTargets.Firestore.stopPerHabitLiveSync(habit.id);
          }
        }

        habit.updatedAt = Date.now();
        if (previousHideFromAll !== hideFromAll) {
          const descendantIds = core.getAllDescendantIds(habit.id);
          descendantIds.forEach(descId => {
            if (descId !== habit.id) {
              const descendant = core.state.habits.find(h => h.id === descId);
              if (descendant) {
                descendant.hideFromAll = hideFromAll;
              }
            }
          });
        }

        if (core.elements.habitEnableBackfill && core.elements.habitEnableBackfill.checked) {
          const durationVal = (core.elements.habitHistoryStartDate && core.elements.habitHistoryStartDate.value) ? core.elements.habitHistoryStartDate.value : (core.elements.habitHistoryDuration ? core.elements.habitHistoryDuration.value : '30');
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
      let createdAtKey = (typeof core.getTodayKey === 'function') ? core.getTodayKey() : new Date().toISOString().split('T')[0];
      if (core.elements.habitEnableBackfill && core.elements.habitEnableBackfill.checked) {
        const durationVal = (core.elements.habitHistoryStartDate && core.elements.habitHistoryStartDate.value) ? core.elements.habitHistoryStartDate.value : (core.elements.habitHistoryDuration ? core.elements.habitHistoryDuration.value : '30');
        const frequencyVal = core.elements.habitHistoryFrequency ? core.elements.habitHistoryFrequency.value : 'frequent';
        const instancesVal = core.elements.habitHistoryInstances ? core.elements.habitHistoryInstances.value : '1';
        const result = core.generateBackfillLogs(durationVal, frequencyVal, instancesVal, dailyTarget, type, freqType, targetDays, monthlyDay, monthlyTarget, weeklyTarget);
        backfilledLogs = result.logs;
        createdAtKey = result.startDateKey;
      }
      const idGen = (typeof core.idFromName === 'function') ? core.idFromName : function(n) { return 'habit_' + String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      const todayKeyGen = (typeof core.getTodayKey === 'function') ? core.getTodayKey : function() { return new Date().toISOString().split('T')[0]; };
      const parentObj = parentId ? core.state.habits.find(h => h.id === parentId) : null;
      const initialParent = (parentObj && parentObj.subhabitSortOrder) ? parentObj : null;
      const inheritedSortOrder = initialParent ? initialParent.subhabitSortOrder || 'manual' : subhabitSortOrder;

      const newHabit = {
        id: (parentId ? parentId + '_' : '') + idGen(name),
        name, type, description, category, showStreak, showCount, showDuration, hideFromAll, isPaused, hideHeatmapWhenPaused, hideHeatmap, pauseHistory: isPaused ? [{ startDate: todayKeyGen(), endDate: null, hideHeatmap: hideHeatmapWhenPaused }] : [],
        subhabitSortOrder: inheritedSortOrder,
        dailyTarget, frequencyType: freqType, targetDays, weeklyTarget, monthlyDay, monthlyTarget, colorWholeWeek, colorWholeMonth, customTarget, customInterval, customUnit, parentId, parentDependency, createdAt: createdAtKey, updatedAt: Date.now(), logs: backfilledLogs
      };
      if (colorTheme) {
        newHabit.colorTheme = colorTheme;
      }
      if (sharingConfig) {
        newHabit.sharing = sharingConfig;
      }
      savedTargetHabit = newHabit;
      if (!core.state) core.state = { habits: [] };
      if (!Array.isArray(core.state.habits)) core.state.habits = [];
      core.state.habits.push(newHabit);
      core.state.selectedHabitId = newHabit.id;
    }

    if (core.elements.modalHabit) {
      core.elements.modalHabit.classList.add('hidden');
      core.toggleModalScrollLock(false);
    }
    if (core.renderAll) core.renderAll();
    if (core.saveState) core.saveState();

    let rootSharedTarget = savedTargetHabit;
    if (savedTargetHabit && savedTargetHabit.parentId) {
      let topParent = core.state.habits.find(h => h.id === savedTargetHabit.parentId);
      while (topParent && topParent.parentId) {
        topParent = core.state.habits.find(h => h.id === topParent.parentId);
      }
      if (topParent && topParent.sharing && topParent.sharing.enabled) {
        rootSharedTarget = topParent;
      }
    }

    if (rootSharedTarget && rootSharedTarget.sharing && rootSharedTarget.sharing.enabled && core.SyncTargets && core.SyncTargets.Firestore) {
      core.SyncTargets.Firestore.startPerHabitLiveSync(rootSharedTarget);
      core.SyncTargets.Firestore.uploadPerHabitBackup(rootSharedTarget);
    }

    if (core.pendingQuickLogAfterHabit) {
      core.pendingQuickLogAfterHabit = false;
      const createdHabitId = id || (core.state.habits.length > 0 ? core.state.habits[core.state.habits.length - 1].id : null);
      core.openLogModal(core.activeLogDateKey || core.getTodayKey(), createdHabitId);
    } else if (!id) {
      if (parentId) core.navigateTo(`#/habit/${parentId}`);
      else core.navigateTo(`#/habit/${core.state.selectedHabitId}`);
    }
  };

  core.tombstoneAndRemoveHabits = function(idsToDelete) {
    const ids = Array.isArray(idsToDelete) ? idsToDelete : [idsToDelete];
    if (ids.length === 0) return;
    const idsSet = new Set(ids);
    core.state.habits = core.state.habits.filter(h => !idsSet.has(h.id));
    if (!core.state.deletedHabitIds) core.state.deletedHabitIds = [];
    for (let i = 0; i < ids.length; i++) {
      if (!core.state.deletedHabitIds.includes(ids[i])) {
        core.state.deletedHabitIds.push(ids[i]);
      }
      if (core.recordUpdateEvent) {
        core.recordUpdateEvent({
          type: 'habit_delete',
          habitId: ids[i]
        });
      }
    }
  };

  core.deleteHabit = function(habitId) {
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit) return;
    const subHabits = core.state.habits.filter(h => h.parentId === habitId);

    let deleteSubHabits = false;
    let confirmed = false;

    if (subHabits.length > 0) {
      const msg = `Are you sure you want to delete "${habit.name}"?\n\nIt has ${subHabits.length} sub-habit(s).\n\n• Click OK to delete "${habit.name}" AND all its sub-habits.\n• Click Cancel to options for keeping sub-habits.`;
      if (confirm(msg)) {
        confirmed = true;
        deleteSubHabits = true;
      } else {
        const msg2 = `Do you want to keep the sub-habits (promote them to top-level habits)?\n\n• Click OK to keep/promote sub-habits.\n• Click Cancel to abort deletion entirely.`;
        if (confirm(msg2)) {
          confirmed = true;
          deleteSubHabits = false;
        } else {
          confirmed = false;
        }
      }
    } else {
      if (confirm(`Are you sure you want to delete "${habit.name}"?`)) {
        confirmed = true;
      }
    }

    if (confirmed) {
      if (deleteSubHabits) {
        const allIdsToDelete = core.getAllDescendantIds ? core.getAllDescendantIds(habitId) : [habitId];
        core.tombstoneAndRemoveHabits(allIdsToDelete);
      } else {
        core.tombstoneAndRemoveHabits(habitId);
        subHabits.forEach(sub => { sub.parentId = habit.parentId || null; });
      }

      const route = core.parseHash ? core.parseHash() : { view: 'home' };
      if (route.view === 'habit' && (route.habitId === habitId || (deleteSubHabits && route.habitId))) {
        if (habit.parentId && !deleteSubHabits) core.navigateTo(`#/habit/${habit.parentId}`);
        else core.navigateTo('#/');
      } else {
        if (core.renderAll) core.renderAll();
      }
      if (core.saveState) core.saveState();
      core.showToast(deleteSubHabits ? `Deleted "${habit.name}" and its sub-habits` : `Deleted "${habit.name}"`);
    }
  };

  core.deleteSelectedHabit = function() {
    if (core.state.selectedHabitId === 'all') return;
    core.deleteHabit(core.state.selectedHabitId);
  };

  core.openLogModal = function(dateStr, preferredHabitId = null) {
    if (dateStr && core.getCursorDateKey && core.getCursorDateKey() !== dateStr) {
      if (core.setCursorDateKey) core.setCursorDateKey(dateStr, true);
    }
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
        habitSelectHTML += `<option value="${h.id}">${indent}${icon}${core.escapeHTML(h.name)}${pausedSuffix}</option>`;
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
    if (core.elements.modalLog) {
      core.toggleModalScrollLock(true);
      core.elements.modalLog.classList.remove('hidden');
    }
  };

  core.shiftModalLogDate = function(days) {
    if (!core.activeLogDateKey) core.activeLogDateKey = core.getTodayKey();
    const d = core.parseDateKey(core.activeLogDateKey);
    d.setDate(d.getDate() + days);
    core.activeLogDateKey = core.formatDateKey(d);
    if (core.setCursorDateKey) core.setCursorDateKey(core.activeLogDateKey, true);
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
    const modalDateLabel = document.querySelector('label[for="modal-log-date-input"]');
    if (modalDateLabel) {
      modalDateLabel.textContent = (core.activeLogDateKey === todayStr) ? 'Select Date (Today)' : 'Select Date';
    }

    const reminderBox = document.getElementById('modal-log-reminder-box');
    if (reminderBox) {
      if (core.activeLogDateKey > todayStr) {
        reminderBox.classList.remove('hidden');
        core.updateReminderLinks(habit ? habit.name : 'Habit', core.activeLogDateKey);
        let badgeEl = reminderBox.querySelector('.unverified-prelog-badge');
        if (!badgeEl) {
          badgeEl = document.createElement('div');
          badgeEl.className = 'unverified-prelog-badge';
          reminderBox.appendChild(badgeEl);
        }
        badgeEl.textContent = `⏳ Upcoming Pre-log: Entry will remain unverified until ${core.formatPrettyDate(core.activeLogDateKey)}.`;
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
    const todayStr = core.getTodayKey();
    const isFuture = core.activeLogDateKey > todayStr;

    const logObj = { count, note };
    if (isFuture && count > 0) {
      logObj.unverified = true;
    }
    habit.logs[core.activeLogDateKey] = logObj;

    core.applyParentDependencyOnLog(habit, core.activeLogDateKey, count);
    if (core.elements.modalLog) {
      core.elements.modalLog.classList.add('hidden');
      core.toggleModalScrollLock(false);
    }
    if (core.renderAll) core.renderAll();

    if (isFuture && count > 0 && core.showToast) {
      core.showToast(`⏳ Pre-logged "${habit.name}" for ${core.formatPrettyDate(core.activeLogDateKey)}! We'll double-check with you on that day.`, 'info');
    }

    if (core.saveLog) {
      core.saveLog(habitId, core.activeLogDateKey, count, note, logObj.unverified);
    } else if (core.saveState) {
      core.saveState();
    }

    if (core.checkPendingVerifications) {
      core.checkPendingVerifications();
    }
  };

  core.handleClearLog = function() {
    const habitId = core.elements.modalLogHabitSelect.value;
    const habit = core.state.habits.find(h => h.id === habitId);
    if (habit && habit.logs) {
      habit.logs[core.activeLogDateKey] = { count: 0 };
      habit.updatedAt = Date.now();
      if (core.recordUpdateEvent) {
        core.recordUpdateEvent({
          type: 'log_update',
          habitId: habitId,
          dateKey: core.activeLogDateKey,
          count: 0,
          note: ''
        });
      }
      if (core.elements.modalLog) {
        core.elements.modalLog.classList.add('hidden');
        core.toggleModalScrollLock(false);
      }
      if (core.renderAll) core.renderAll();
      if (core.saveLog) {
        core.saveLog(habitId, core.activeLogDateKey, 0, '');
      } else if (core.saveState) {
        core.saveState();
      }
    }
  };

  // --- SHARE HABIT HELPERS & EVENT LISTENERS ---
  core.generateRandomKey = function(prefix, len) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let res = prefix || '';
    for (let i = 0; i < (len || 10); i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  core.updateShareLinkAndQR = function() {
    const inputCol = document.getElementById('habit-share-collection');
    const inputPwd = document.getElementById('habit-share-password');
    const inputName = document.getElementById('habit-name');
    const inputColorHex = document.getElementById('habit-custom-color-hex');
    const inputColorSelect = document.getElementById('habit-calendar-color-select');
    const qrDisplay = document.getElementById('qr-code-display');

    const docId = inputCol ? inputCol.value.trim() : '';
    const pwd = inputPwd ? inputPwd.value.trim() : '';
    const name = inputName ? inputName.value.trim() : 'Habit Goal';
    const color = (inputColorSelect && inputColorSelect.value) ? inputColorSelect.value : (inputColorHex ? inputColorHex.value.trim() : '');

    if (!docId || !pwd) {
      if (qrDisplay) qrDisplay.innerHTML = '<small class="muted-text">Fill document ID & password to generate QR code</small>';
      return '';
    }

    const baseUrl = (typeof window !== 'undefined' && window.location) ? (window.location.origin + window.location.pathname) : '';
    const shareUrl = `${baseUrl}#share?col=${encodeURIComponent(docId)}&pwd=${encodeURIComponent(pwd)}`;

    if (qrDisplay && core.generateQRCodeSVG) {
      qrDisplay.innerHTML = core.generateQRCodeSVG(shareUrl, 200);
    }

    return shareUrl;
  };

  core.ensureCurrentModalHabitSharedAndUploaded = function() {
    const habitIdInput = document.getElementById('habit-id');
    const inputShareCol = document.getElementById('habit-share-collection');
    const inputSharePwd = document.getElementById('habit-share-password');
    const chkShareChildren = document.getElementById('habit-share-include-children');
    const chkSharing = document.getElementById('habit-enable-sharing');

    const editingId = habitIdInput ? habitIdInput.value.trim() : null;
    let habit = editingId ? core.state.habits.find(h => h.id === editingId) : null;

    if (inputShareCol && !inputShareCol.value.trim()) {
      inputShareCol.value = core.generateShareDocId();
    }
    if (inputSharePwd && !inputSharePwd.value.trim()) {
      inputSharePwd.value = core.generateRandomPassword(16);
    }

    const shareDocId = inputShareCol ? inputShareCol.value.trim() : '';
    const sharePwd = inputSharePwd ? inputSharePwd.value.trim() : '';
    const includeChildren = chkShareChildren ? chkShareChildren.checked : true;

    if (!shareDocId || !sharePwd) return;

    if (habit) {
      habit.sharing = {
        enabled: true,
        docId: shareDocId,
        collection: shareDocId,
        password: sharePwd,
        includeChildren: includeChildren
      };

      if (core.saveState) core.saveState();

      if (core.SyncTargets && core.SyncTargets.Firestore) {
        core.SyncTargets.Firestore.startPerHabitLiveSync(habit);
        core.SyncTargets.Firestore.uploadPerHabitBackup(habit).catch(function(err) {
          const errMsg = err && err.message ? err.message : String(err);
          if (core.showToast) core.showToast(`❌ Firestore upload error: ${errMsg}`, 'error');
        });
      }
    } else {
      const nameInput = document.getElementById('habit-name');
      const habitName = nameInput ? nameInput.value.trim() : 'New Shared Habit';
      if (habitName) {
        const draftId = editingId || ('habit_' + Date.now().toString(36));
        if (habitIdInput) habitIdInput.value = draftId;

        const draftHabit = {
          id: draftId,
          name: habitName,
          type: 'positive',
          colorTheme: core.getDefaultColorForId(draftId),
          dailyTarget: 1,
          createdAt: core.getTodayKey(),
          logs: {},
          sharing: {
            enabled: true,
            docId: shareDocId,
            collection: shareDocId,
            password: sharePwd,
            includeChildren: includeChildren
          }
        };

        const existingIdx = core.state.habits.findIndex(h => h.id === draftId);
        if (existingIdx !== -1) {
          core.state.habits[existingIdx].sharing = draftHabit.sharing;
          habit = core.state.habits[existingIdx];
        } else {
          core.state.habits.push(draftHabit);
          habit = draftHabit;
        }

        if (core.saveState) core.saveState();
        if (core.SyncTargets && core.SyncTargets.Firestore) {
          core.SyncTargets.Firestore.startPerHabitLiveSync(habit);
          core.SyncTargets.Firestore.uploadPerHabitBackup(habit).catch(function(err) {
            const errMsg = err && err.message ? err.message : String(err);
            if (core.showToast) core.showToast(`❌ Firestore upload error: ${errMsg}`, 'error');
          });
        }
      }
    }

    if (chkSharing) chkSharing.checked = true;
    core.updateShareLinkAndQR();
    if (core.showToast) core.showToast(`🔥 Habit uploaded to Firestore (Document: ${shareDocId})!`, 'success');
  };

  // Wire up event listeners for Share Habit controls
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', function() {
      const chkSharing = document.getElementById('habit-enable-sharing');
      const inputShareCol = document.getElementById('habit-share-collection');
      const inputSharePwd = document.getElementById('habit-share-password');
      const inputHabitName = document.getElementById('habit-name');
      const sharePanel = document.getElementById('share-habit-panel');
      const btnToggleShare = document.getElementById('btn-toggle-share-habit-panel');
      const btnCopyShareLink = document.getElementById('btn-copy-share-link');
      const btnRegenShareCreds = document.getElementById('btn-regen-share-creds');

      if (chkSharing) {
        chkSharing.addEventListener('change', function() {
          if (chkSharing.checked) {
            if (sharePanel) sharePanel.classList.remove('hidden');
            if (btnToggleShare) btnToggleShare.classList.remove('hidden');
            core.ensureCurrentModalHabitSharedAndUploaded();
          } else {
            if (sharePanel) sharePanel.classList.add('hidden');
            if (btnToggleShare) btnToggleShare.classList.add('hidden');
          }
        });
      }

      if (btnToggleShare) {
        btnToggleShare.addEventListener('click', function() {
          if (sharePanel) sharePanel.classList.toggle('hidden');
          if (!sharePanel.classList.contains('hidden')) {
            core.ensureCurrentModalHabitSharedAndUploaded();
          }
        });
      }

      if (btnRegenShareCreds) {
        btnRegenShareCreds.addEventListener('click', function() {
          if (inputShareCol) inputShareCol.value = core.generateShareDocId();
          if (inputSharePwd) inputSharePwd.value = core.generateRandomPassword(16);
          core.ensureCurrentModalHabitSharedAndUploaded();
        });
      }

      if (btnCopyShareLink) {
        btnCopyShareLink.addEventListener('click', function() {
          core.ensureCurrentModalHabitSharedAndUploaded();
          const link = core.updateShareLinkAndQR();
          if (link && navigator.clipboard) {
            navigator.clipboard.writeText(link).then(function() {
              if (core.showToast) core.showToast('📋 Share link copied & habit uploaded to Firestore!', 'success');
            }).catch(function() {
              alert('Share link: ' + link);
            });
          } else if (link) {
            alert('Share link: ' + link);
          }
        });
      }

      [inputShareCol, inputSharePwd].forEach(el => {
        if (el) el.addEventListener('change', () => {
          core.ensureCurrentModalHabitSharedAndUploaded();
        });
        if (el) el.addEventListener('input', () => {
          core.updateShareLinkAndQR();
        });
      });
      if (inputHabitName) {
        inputHabitName.addEventListener('input', () => core.updateShareLinkAndQR());
      }

      // Check URL Hash for shared habit invitation or device sync connection on load
      core.checkURLHashForSharedHabit();
      core.checkURLHashForSyncConnection();
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('hashchange', function() {
      if (core.checkURLHashForSharedHabit) core.checkURLHashForSharedHabit();
      if (core.checkURLHashForSyncConnection) core.checkURLHashForSyncConnection();
    });
  }

  core.checkURLHashForSyncConnection = function() {
    const hash = (typeof window !== 'undefined' && window.location && window.location.hash) ? String(window.location.hash).trim() : '';
    if (!hash.includes('sync?') && !hash.includes('code=')) return;

    try {
      const queryStr = hash.substring(hash.indexOf('?') + 1);
      const params = new URLSearchParams(queryStr);
      const code = params.get('code') || params.get('col') || params.get('doc');
      const pass = params.get('pass') || params.get('pwd');

      if (!code || !pass) return;

      if (core.SyncManager) {
        core.SyncManager.settings.passphrase = pass;
        localStorage.setItem('habitual_sync_passphrase', pass);
        if (core.E2EE && core.E2EE._keyCache) core.E2EE._keyCache.clear();

        if (core.SyncManager.setFirestoreSyncCode) {
          core.SyncManager.setFirestoreSyncCode(code);
        } else if (core.SyncTargets && core.SyncTargets.Firestore && core.SyncTargets.Firestore.setSyncCode) {
          core.SyncTargets.Firestore.setSyncCode(code);
        }
        if (core.SyncManager.setFirestoreEnabled) {
          core.SyncManager.setFirestoreEnabled(true);
        } else if (core.SyncManager.toggleTarget) {
          core.SyncManager.toggleTarget('firestore', true);
        }
        localStorage.setItem('habitual_firestore_share_mode', 'true');
      }

      if (core.updateFirestoreCodeUIState) core.updateFirestoreCodeUIState();
      if (core.updatePassphraseStatusUI) core.updatePassphraseStatusUI();
      if (core.updateSyncPagePassphraseAndQRUI) core.updateSyncPagePassphraseAndQRUI();

      if (core.showToast) {
        core.showToast(`📲 Personal Device Connected! Master Password & Store Sync configured (Channel ${code}).`, 'success');
      }

      if (core.SyncManager && typeof core.SyncManager.pullAndMergeAll === 'function') {
        core.SyncManager.pullAndMergeAll();
      }

      if (window.history && window.history.replaceState) {
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState(null, '', cleanUrl);
      }
    } catch(e) {
      console.warn('Error parsing sync URL hash:', e);
    }
  };

  core.checkURLHashForSharedHabit = function() {
    const hash = (typeof window !== 'undefined' && window.location && window.location.hash) ? String(window.location.hash).trim() : '';
    const search = (typeof window !== 'undefined' && window.location && window.location.search) ? String(window.location.search).trim() : '';

    if (!hash.includes('share') && !hash.includes('col=') && !hash.includes('doc=') &&
        !search.includes('share') && !search.includes('col=') && !search.includes('doc=')) return;

    try {
      let col = null;
      let pwd = null;

      if (hash.includes('col=') || hash.includes('doc=') || hash.includes('share')) {
        const queryStr = hash.includes('?') ? hash.substring(hash.indexOf('?') + 1) : hash.replace(/^#\/?/, '');
        const params = new URLSearchParams(queryStr);
        col = params.get('col') || params.get('doc') || params.get('collection');
        pwd = params.get('pwd') || params.get('pass') || params.get('password');
      }

      if ((!col || !pwd) && (search.includes('col=') || search.includes('doc=') || search.includes('share'))) {
        const queryStr = search.startsWith('?') ? search.substring(1) : search;
        const params = new URLSearchParams(queryStr);
        col = col || params.get('col') || params.get('doc') || params.get('collection');
        pwd = pwd || params.get('pwd') || params.get('pass') || params.get('password');
      }

      if (!col || !pwd) return;

      // If user ALREADY has this habit in state, take them directly to the habit page instead of showing preview
      const existingInState = (core.state && Array.isArray(core.state.habits)) ? core.state.habits.find(h =>
        h.id === col ||
        (h.sharing && (h.sharing.collection === col || h.sharing.docId === col))
      ) : null;

      if (existingInState) {
        let targetHabit = existingInState;
        while (targetHabit && targetHabit.parentId) {
          const p = core.state.habits.find(h => h.id === targetHabit.parentId);
          if (!p) break;
          targetHabit = p;
        }

        const modalImport = document.getElementById('modal-import-shared-habit');
        if (modalImport) modalImport.classList.add('hidden');

        core.state.selectedHabitId = targetHabit.id;
        if (core.saveState) core.saveState();

        const targetHash = '#/habit/' + targetHabit.id;
        if (typeof window !== 'undefined' && window.location) {
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + targetHash);
          } else {
            window.location.hash = targetHash;
          }
        }

        if (core.renderAll) core.renderAll();
        if (core.showToast) core.showToast(`👥 Opened existing habit "${existingInState.name}"!`, 'info');
        return;
      }

      const modalImport = document.getElementById('modal-import-shared-habit');
      const nameEl = document.getElementById('import-shared-habit-name');
      const colEl = document.getElementById('import-shared-habit-collection');
      const pillEl = document.getElementById('import-shared-habit-color-pill');
      const logsInfoEl = document.getElementById('import-shared-habit-logs-info');
      const heatmapContainer = document.getElementById('import-shared-habit-heatmap-container');
      const heatmapSvgEl = document.getElementById('import-shared-habit-heatmap-svg');
      const subhabitsPreviewEl = document.getElementById('import-shared-habit-subhabits-preview');
      const yearBadgeEl = document.getElementById('import-shared-habit-year-badge');
      const btnConfirm = document.getElementById('btn-confirm-import-shared');
      const btnCancel = document.getElementById('btn-cancel-import-shared');
      const btnClose = document.getElementById('modal-import-close');

      if (!modalImport) {
        if (typeof window !== 'undefined' && window.location) {
          const currentPath = window.location.pathname;
          if (!currentPath.endsWith('index.html') && !currentPath.endsWith('/')) {
            window.location.href = 'index.html#share?col=' + encodeURIComponent(col) + '&pwd=' + encodeURIComponent(pwd);
          }
        }
        return;
      }

      if (nameEl) nameEl.textContent = 'Shared Habit';
      if (colEl) colEl.textContent = col;
      if (logsInfoEl) logsInfoEl.innerHTML = '<span>⏳ Fetching cloud habit history...</span>';
      if (heatmapContainer) heatmapContainer.classList.add('hidden');
      if (heatmapSvgEl) heatmapSvgEl.innerHTML = '';
      if (subhabitsPreviewEl) { subhabitsPreviewEl.innerHTML = ''; subhabitsPreviewEl.classList.add('hidden'); }

      const initialHexColor = core.getDefaultColorForId(col);
      if (pillEl) pillEl.style.backgroundColor = initialHexColor;

      modalImport.classList.remove('hidden');

      let fetchedRemotePayload = null;

      if (core.SyncTargets && core.SyncTargets.Firestore && core.SyncTargets.Firestore.downloadPerHabitBackup) {
        core.SyncTargets.Firestore.downloadPerHabitBackup(col, pwd).then(function(remoteData) {
          if (remoteData) {
            fetchedRemotePayload = remoteData;
            const logEntries = remoteData.logs ? Object.keys(remoteData.logs).filter(k => (remoteData.logs[k].count > 0 || remoteData.logs[k].note)) : [];
            const logCount = logEntries.length;
            const childCount = (remoteData.children && Array.isArray(remoteData.children)) ? remoteData.children.length : 0;
            const habitName = remoteData.name || 'Shared Habit';
            if (nameEl) nameEl.textContent = habitName;
            const habitColor = (remoteData.colorTheme && core.normalizeHex) ? core.normalizeHex(remoteData.colorTheme) : initialHexColor;
            if (pillEl) pillEl.style.backgroundColor = habitColor;

            if (logsInfoEl) {
              let infoText = `<span>📅 ${logCount} past check-in log${logCount === 1 ? '' : 's'}`;
              if (childCount > 0) {
                infoText += ` & ${childCount} sub-habit${childCount === 1 ? '' : 's'}`;
              }
              infoText += ` included in cloud history!</span>`;
              logsInfoEl.innerHTML = infoText;
            }

            // Render Heatmap Preview Card from loaded Firestore logs
            const buildCard = core.buildHeatmapCard || core.buildSvgHeatmapGrid;
            if (heatmapSvgEl && buildCard) {
              const previewYear = (core.CURRENT_YEAR) ? core.CURRENT_YEAR : new Date().getFullYear();
              if (yearBadgeEl) yearBadgeEl.textContent = previewYear;

              const habitPreview = {
                id: 'preview_shared_' + col,
                name: habitName,
                type: remoteData.type || 'positive',
                description: remoteData.description || '',
                category: remoteData.category || 'General',
                dailyTarget: remoteData.dailyTarget || 1,
                frequencyType: remoteData.frequencyType || 'daily',
                targetDays: remoteData.targetDays || [1, 2, 3, 4, 5, 6, 0],
                weeklyTarget: remoteData.weeklyTarget || 1,
                monthlyDay: remoteData.monthlyDay || 1,
                monthlyTarget: remoteData.monthlyTarget || 1,
                customTarget: remoteData.customTarget || 1,
                customInterval: remoteData.customInterval || 3,
                customUnit: remoteData.customUnit || 'days',
                colorTheme: habitColor,
                colorWholeWeek: remoteData.colorWholeWeek !== false,
                colorWholeMonth: remoteData.colorWholeMonth !== false,
                logs: remoteData.logs || {}
              };

              heatmapSvgEl.innerHTML = '';
              if (core.buildHeatmapCard) {
                const cardNode = core.buildHeatmapCard(habitPreview, previewYear);
                heatmapSvgEl.appendChild(cardNode);
              } else {
                const themeName = habitColor.startsWith('#') ? 'custom' : (habitColor || 'green');
                const svgGrid = core.buildSvgHeatmapGrid(habitPreview, previewYear, habitPreview.id, themeName, habitPreview);
                heatmapSvgEl.innerHTML = svgGrid;
              }

              // Render Sub-habits Preview Cards if sub-habits exist in cloud payload
              if (remoteData.children && Array.isArray(remoteData.children) && remoteData.children.length > 0 && subhabitsPreviewEl) {
                subhabitsPreviewEl.innerHTML = `<div style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">📁 Included Sub-Habits (${remoteData.children.length}):</div>`;
                remoteData.children.forEach(child => {
                  const childColor = (child.colorTheme && core.normalizeHex) ? core.normalizeHex(child.colorTheme) : habitColor;
                  const childPreview = {
                    id: 'preview_sub_' + (child.habitId || child.name),
                    name: child.name,
                    type: child.type || 'positive',
                    colorTheme: childColor,
                    dailyTarget: child.dailyTarget || 1,
                    logs: child.logs || {}
                  };
                  if (core.buildHeatmapCard) {
                    const childCardNode = core.buildHeatmapCard(childPreview, previewYear);
                    subhabitsPreviewEl.appendChild(childCardNode);
                  } else {
                    const childSvg = core.buildSvgHeatmapGrid(childPreview, previewYear, childPreview.id, childColor.startsWith('#') ? 'custom' : 'green', childPreview);
                    const childWrapper = document.createElement('div');
                    childWrapper.innerHTML = childSvg;
                    subhabitsPreviewEl.appendChild(childWrapper);
                  }
                });
                subhabitsPreviewEl.classList.remove('hidden');
              }

              if (heatmapContainer) heatmapContainer.classList.remove('hidden');
            }
          } else if (logsInfoEl) {
            logsInfoEl.innerHTML = `<span style="color: #ff5555; font-weight: 600; display: flex; align-items: center; gap: 6px;">❌ Could not load habit from Firestore. Please check the collection ID and password.</span>`;
          }
        }).catch(function(err) {
          const errMsg = err && err.message ? err.message : String(err);
          if (logsInfoEl) logsInfoEl.innerHTML = `<span style="color: #ff5555; font-weight: 600; display: flex; align-items: center; gap: 6px;">❌ Error loading from Firestore: ${core.escapeHTML(errMsg)}</span>`;
        });
      } else if (logsInfoEl) {
        logsInfoEl.innerHTML = `<span style="color: #ff5555; font-weight: 600; display: flex; align-items: center; gap: 6px;">❌ Firestore client not initialized.</span>`;
      }

      function closeModal() {
        modalImport.classList.add('hidden');
        if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        } else if (typeof window !== 'undefined' && window.location) {
          window.location.hash = '';
        }
      }

      if (btnCancel) btnCancel.onclick = closeModal;
      if (btnClose) btnClose.onclick = closeModal;

      if (btnConfirm) {
        btnConfirm.onclick = function() {
          if (!fetchedRemotePayload) {
            if (core.showToast) core.showToast('❌ Cannot join habit: Could not load data from Firestore.', 'error');
            alert('Cannot join habit: Unable to load habit data from Firestore. Please verify the share link and password.');
            return;
          }

          const payload = fetchedRemotePayload;
          const habitName = payload.name || 'Shared Habit';
          const habitColor = payload.colorTheme || core.getDefaultColorForId(col);
          const hasRemoteChildren = Boolean(payload.children && Array.isArray(payload.children) && payload.children.length > 0);

          const canonicalId = payload.habitId || payload.id || ('shared_' + core.idFromName(habitName) + '_' + Date.now().toString(36));
          let existing = core.state.habits.find(h => h.id === canonicalId || (h.sharing && (h.sharing.collection === col || h.sharing.docId === col)));
          if (!existing) {
            existing = {
              id: canonicalId,
              name: habitName,
              type: payload.type || 'positive',
              description: payload.description || '',
              category: payload.category || 'General',
              dailyTarget: payload.dailyTarget || 1,
              frequencyType: payload.frequencyType || 'daily',
              targetDays: payload.targetDays || [1],
              weeklyTarget: payload.weeklyTarget || 1,
              monthlyDay: payload.monthlyDay || '1',
              monthlyTarget: payload.monthlyTarget || 1,
              colorWholeWeek: payload.colorWholeWeek !== false,
              colorWholeMonth: payload.colorWholeMonth !== false,
              customTarget: payload.customTarget || 1,
              customInterval: payload.customInterval || 3,
              customUnit: payload.customUnit || 'days',
              colorTheme: habitColor,
              createdAt: payload.createdAt || core.getTodayKey(),
              sharing: {
                enabled: true,
                docId: col,
                collection: col,
                password: pwd,
                includeChildren: hasRemoteChildren
              },
              logs: payload.logs || {}
            };
            core.state.habits.push(existing);
            core.state.selectedHabitId = existing.id;
          } else {
            existing.name = habitName;
            if (habitColor) existing.colorTheme = habitColor;
            existing.sharing = { enabled: true, docId: col, collection: col, password: pwd, includeChildren: hasRemoteChildren };
            if (payload.logs) {
              if (!existing.logs) existing.logs = {};
              Object.assign(existing.logs, payload.logs);
            }
          }

          if (hasRemoteChildren) {
            payload.children.forEach(childData => {
              let existingChild = core.state.habits.find(h => h.id === childData.habitId || (h.parentId === existing.id && h.name === childData.name));
              if (!existingChild) {
                existingChild = {
                  id: childData.habitId || (existing.id + '_' + core.idFromName(childData.name)),
                  name: childData.name,
                  type: childData.type || 'positive',
                  description: childData.description || '',
                  category: childData.category || 'General',
                  dailyTarget: childData.dailyTarget || 1,
                  frequencyType: childData.frequencyType || 'daily',
                  targetDays: childData.targetDays || [1],
                  weeklyTarget: childData.weeklyTarget || 1,
                  monthlyDay: childData.monthlyDay || '1',
                  monthlyTarget: childData.monthlyTarget || 1,
                  colorWholeWeek: childData.colorWholeWeek !== false,
                  colorWholeMonth: childData.colorWholeMonth !== false,
                  customTarget: childData.customTarget || 1,
                  customInterval: childData.customInterval || 3,
                  customUnit: childData.customUnit || 'days',
                  colorTheme: childData.colorTheme,
                  showStreak: childData.showStreak,
                  showCount: childData.showCount,
                  showDuration: childData.showDuration,
                  hideFromAll: childData.hideFromAll,
                  isPaused: childData.isPaused,
                  parentId: existing.id,
                  parentDependency: childData.parentDependency || 'none',
                  createdAt: childData.createdAt || core.getTodayKey(),
                  logs: childData.logs || {}
                };
                core.state.habits.push(existingChild);
              } else {
                existingChild.name = childData.name;
                existingChild.parentId = existing.id;
                if (!existingChild.logs) existingChild.logs = {};
                if (childData.logs) {
                  Object.assign(existingChild.logs, childData.logs);
                }
              }
            });
          }

          core.saveState();
          if (core.renderAll) core.renderAll();

          if (core.SyncTargets && core.SyncTargets.Firestore) {
            core.SyncTargets.Firestore.startPerHabitLiveSync(existing);
          }

          const totalLogs = Object.keys(existing.logs || {}).length;
          const subInfo = hasRemoteChildren ? ` & ${payload.children.length} sub-habits` : '';
          if (core.showToast) core.showToast(`👥 Joined shared habit "${habitName}" (${totalLogs} past check-ins${subInfo} synced)!`, 'success');
          closeModal();
          if (core.navigateTo) core.navigateTo('#/habit/' + existing.id);
        };
      }
    } catch (e) {
      console.warn('Error handling share URL hash:', e);
    }
  };

  // --- PRE-LOGGED FUTURE HABIT VERIFICATION & FUTURE EVENTS CLEARING ENGINE ---
  core.getUnverifiedLogs = function() {
    const todayStr = core.getTodayKey();
    const results = [];
    if (!core.state || !core.state.habits) return results;

    core.state.habits.forEach(habit => {
      if (!habit.logs) return;
      Object.keys(habit.logs).forEach(dateKey => {
        const log = habit.logs[dateKey];
        if (dateKey <= todayStr && log && log.count > 0 && log.unverified) {
          results.push({
            habit: habit,
            habitId: habit.id,
            dateKey: dateKey,
            log: log
          });
        }
      });
    });

    results.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return results;
  };

  core.updateHeaderVerifyBadge = function() {
    const btnBadge = document.getElementById('btn-header-verify-checkin');
    if (!btnBadge) return;
    const unverifiedList = core.getUnverifiedLogs();
    if (unverifiedList.length > 0) {
      btnBadge.classList.remove('hidden');
      btnBadge.innerHTML = `✨ Check-In (${unverifiedList.length})`;
    } else {
      btnBadge.classList.add('hidden');
    }
  };

  core.checkPendingVerifications = function() {
    core.updateHeaderVerifyBadge();
    const unverifiedList = core.getUnverifiedLogs();
    if (unverifiedList.length > 0) {
      const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
      if (!openModal) {
        core.openVerifyLogsModal(unverifiedList);
      }
    }
  };

  core.openVerifyLogsModal = function(unverifiedList = null) {
    const list = unverifiedList || core.getUnverifiedLogs();
    const modalEl = document.getElementById('modal-verify-logs');
    const container = document.getElementById('modal-verify-logs-list');
    if (!modalEl || !container) return;

    if (list.length === 0) {
      modalEl.classList.add('hidden');
      core.toggleModalScrollLock(false);
      return;
    }

    let html = '';
    list.forEach(item => {
      const h = item.habit;
      const hex = core.getHabitHexColor(h);
      const prettyDate = core.formatPrettyDate(item.dateKey);
      const todayStr = core.getTodayKey();
      const relativeDateStr = (item.dateKey === todayStr) ? 'Today' : prettyDate;
      const noteHtml = item.log.note ? `<div class="verify-log-note">📝 "${core.escapeHTML(item.log.note)}"</div>` : '';

      html += `
        <div class="verify-log-card" data-habit-id="${h.id}" data-date-key="${item.dateKey}">
          <div class="verify-log-header">
            <span class="verify-habit-badge" style="background: ${hex};">${core.escapeHTML(h.name)}</span>
            <span class="verify-date-badge">📅 ${core.escapeHTML(relativeDateStr)}</span>
          </div>
          <div class="verify-log-body">
            <div class="verify-log-info">
              <span>Recorded Count: <strong>${item.log.count}</strong></span>
              ${noteHtml}
            </div>
            <div class="verify-card-actions">
              <button type="button" class="btn btn-primary btn-sm btn-verify-yes" data-habit-id="${h.id}" data-date-key="${item.dateKey}">
                ✅ Yes, completed!
              </button>
              <button type="button" class="btn btn-secondary btn-sm btn-verify-no" data-habit-id="${h.id}" data-date-key="${item.dateKey}">
                ❌ Didn't do it
              </button>
              <button type="button" class="btn btn-ghost btn-sm btn-verify-edit" data-habit-id="${h.id}" data-date-key="${item.dateKey}">
                ✏️ Edit
              </button>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.btn-verify-yes').forEach(btn => {
      btn.onclick = () => core.verifyLog(btn.dataset.habitId, btn.dataset.dateKey, true);
    });
    container.querySelectorAll('.btn-verify-no').forEach(btn => {
      btn.onclick = () => core.verifyLog(btn.dataset.habitId, btn.dataset.dateKey, false);
    });
    container.querySelectorAll('.btn-verify-edit').forEach(btn => {
      btn.onclick = () => {
        modalEl.classList.add('hidden');
        core.toggleModalScrollLock(false);
        core.openLogModal(btn.dataset.dateKey, btn.dataset.habitId);
      };
    });

    core.toggleModalScrollLock(true);
    modalEl.classList.remove('hidden');
  };

  core.verifyLog = function(habitId, dateKey, confirmed) {
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit || !habit.logs || !habit.logs[dateKey]) return;

    if (confirmed) {
      delete habit.logs[dateKey].unverified;
      if (core.showToast) core.showToast(`✨ Verified "${habit.name}" for ${core.formatPrettyDate(dateKey)}!`, 'success');
    } else {
      delete habit.logs[dateKey];
      if (core.showToast) core.showToast(`Cleared pre-logged entry for "${habit.name}".`, 'info');
    }

    if (core.saveLog) {
      const count = habit.logs[dateKey] ? habit.logs[dateKey].count : 0;
      const note = habit.logs[dateKey] ? habit.logs[dateKey].note : '';
      core.saveLog(habitId, dateKey, count, note, false);
    } else if (core.saveState) {
      core.saveState();
    }

    if (core.renderAll) core.renderAll();
    core.updateHeaderVerifyBadge();

    const remaining = core.getUnverifiedLogs();
    if (remaining.length > 0) {
      core.openVerifyLogsModal(remaining);
    } else {
      const modalEl = document.getElementById('modal-verify-logs');
      if (modalEl) modalEl.classList.add('hidden');
      core.toggleModalScrollLock(false);
      if (core.showToast) core.showToast('🎉 All caught up on habit check-ins!', 'success');
    }
  };

  core.verifyAllLogs = function() {
    const list = core.getUnverifiedLogs();
    if (list.length === 0) return;

    list.forEach(item => {
      if (item.habit && item.habit.logs && item.habit.logs[item.dateKey]) {
        delete item.habit.logs[item.dateKey].unverified;
        if (core.saveLog) {
          core.saveLog(item.habit.id, item.dateKey, item.habit.logs[item.dateKey].count, item.habit.logs[item.dateKey].note || '', false);
        }
      }
    });

    if (core.saveState) core.saveState();
    if (core.renderAll) core.renderAll();
    core.updateHeaderVerifyBadge();

    const modalEl = document.getElementById('modal-verify-logs');
    if (modalEl) modalEl.classList.add('hidden');
    core.toggleModalScrollLock(false);
    if (core.showToast) core.showToast(`🎉 Verified ${list.length} pre-logged habits!`, 'success');
  };

  core.activeClearBeforeHabitId = null;

  core.openClearBeforeDateModal = function(habitId) {
    core.activeClearBeforeHabitId = habitId;
    const modalEl = document.getElementById('modal-clear-before-date');
    const inputDate = document.getElementById('input-clear-before-date');
    if (inputDate) {
      inputDate.value = core.getDaysAgoKey ? core.getDaysAgoKey(30) : '';
    }
    if (modalEl) {
      core.toggleModalScrollLock(true);
      modalEl.classList.remove('hidden');
    }
  };

  core.closeClearBeforeDateModal = function() {
    const modalEl = document.getElementById('modal-clear-before-date');
    if (modalEl) {
      modalEl.classList.add('hidden');
      core.toggleModalScrollLock(false);
    }
  };

  // Wire event listeners for Clear Before Date modal
  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    const btnClose = document.getElementById('modal-clear-before-date-close');
    const btnCancel = document.getElementById('btn-cancel-clear-before-date');
    const btnConfirm = document.getElementById('btn-confirm-clear-before-date');

    if (btnClose) btnClose.addEventListener('click', core.closeClearBeforeDateModal);
    if (btnCancel) btnCancel.addEventListener('click', core.closeClearBeforeDateModal);

    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        const inputDate = document.getElementById('input-clear-before-date');
        const beforeDate = inputDate ? inputDate.value : '';
        if (!beforeDate) {
          if (core.showToast) core.showToast('Please select a valid date.', 'error');
          return;
        }
        if (core.activeClearBeforeHabitId && core.clearLogsBeforeDateForHabit) {
          core.clearLogsBeforeDateForHabit(core.activeClearBeforeHabitId, beforeDate);
        }
        core.closeClearBeforeDateModal();
      });
    }

    if (document.querySelectorAll) {
      document.querySelectorAll('.quick-clear-date-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const daysAgo = parseInt(btn.dataset.daysAgo, 10) || 30;
          const inputDate = document.getElementById('input-clear-before-date');
          if (inputDate && core.getDaysAgoKey) {
            inputDate.value = core.getDaysAgoKey(daysAgo);
          }
        });
      });
    }
  }

  core.clearFutureLogsForHabit = function(habitId) {
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit || !habit.logs) return 0;
    const todayStr = core.getTodayKey();
    let clearedCount = 0;

    Object.keys(habit.logs).forEach(dateKey => {
      if (dateKey > todayStr) {
        delete habit.logs[dateKey];
        clearedCount++;
        if (core.saveLog) {
          core.saveLog(habitId, dateKey, 0, '');
        }
      }
    });

    if (clearedCount > 0) {
      if (core.saveState) core.saveState();
      if (core.renderAll) core.renderAll();
      if (core.showToast) core.showToast(`🧹 Cleared ${clearedCount} future event(s) for "${habit.name}".`, 'info');
    } else {
      if (core.showToast) core.showToast(`No future events found for "${habit.name}".`, 'info');
    }
    return clearedCount;
  };

})(window.HabitualCore);
