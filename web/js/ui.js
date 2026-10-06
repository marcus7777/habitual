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
    core.mouseX = -1;
    core.mouseY = -1;

    core.elements.yearSelector = document.getElementById('year-selector');
    core.elements.heatmapsGallery = document.getElementById('heatmaps-gallery');
    core.elements.customTooltip = document.getElementById('custom-tooltip');

    if (typeof window !== 'undefined' && window.addEventListener) {
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

    if (core.elements.calendarColorSelect) {
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

    if (core.elements.customColorPicker) {
      core.elements.customColorPicker.addEventListener('input', (e) => {
        const color = e.target.value;
        if (core.elements.customColorHex) core.elements.customColorHex.value = color;
        if (core.elements.customSwatchPreview && core.elements.customSwatchPreview.style) {
          core.elements.customSwatchPreview.style.backgroundColor = color;
        }
        core.syncCalendarColorDropdown(color);
      });
    }

    if (core.elements.customColorHex) {
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
    if (menuQuickLog) menuQuickLog.addEventListener('click', () => {
      if (core.elements.headerMenuContent) core.elements.headerMenuContent.classList.add('hidden');
      const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : core.getTodayKey();
      core.openLogModal(targetDate);
    });

    const menuDataModal = document.getElementById('menu-btn-data-modal');
    if (menuDataModal) menuDataModal.addEventListener('click', () => {
    if (core.elements.headerMenuContent) core.elements.headerMenuContent.classList.add('hidden');
    core.elements.modalData.classList.remove('hidden');
    core.state.selectedYear = core.CURRENT_YEAR;
    if (core.renderAll) core.renderAll();
    if (selectStorageEngine) {
      selectStorageEngine.value = core.activeStorageEngine;
      toggleOrbitDBSyncPanel();
    }
  });

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

    if (core.elements.yearSelector) {
      core.elements.yearSelector.addEventListener('change', (e) => {
        core.state.selectedYear = parseInt(e.target.value, 10);
        if (core.saveState) core.saveState();
        if (core.renderAll) core.renderAll();
      });
    }

    // --- DATA MANAGEMENT & FEATURE FLAGS ---
    const urlParams = new URLSearchParams(window.location.search);
    const isCloudSyncEnabled = urlParams.get('cloudSync') === '1' || urlParams.get('cloudSync') === 'true';
    const isP2PEnabled = urlParams.get('p2p') === '1' || urlParams.get('P2P') === '1' || urlParams.get('p2p') === 'true';

    const sectionP2P = document.getElementById('section-p2p-sync');
    if (sectionP2P) {
      if (isP2PEnabled) sectionP2P.classList.remove('hidden');
      else sectionP2P.classList.add('hidden');
    }

    const sectionCloud = document.getElementById('section-cloud-sync');
    if (sectionCloud) {
      if (isCloudSyncEnabled) sectionCloud.classList.remove('hidden');
      else sectionCloud.classList.add('hidden');
    }

    const sectionE2EE = document.getElementById('section-e2ee-passphrase');
    const sectionTrigger = document.getElementById('section-trigger-sync');
    if (sectionE2EE) {
      if (isCloudSyncEnabled || isP2PEnabled) sectionE2EE.classList.remove('hidden');
      else sectionE2EE.classList.add('hidden');
    }
    if (sectionTrigger) {
      if (isCloudSyncEnabled || isP2PEnabled) sectionTrigger.classList.remove('hidden');
      else sectionTrigger.classList.add('hidden');
    }

    const selectStorageEngine = document.getElementById('select-storage-engine');
  function toggleOrbitDBSyncPanel() {
      if (!orbitdbSyncPanel) return;
      const isActive = core.activeStorageEngine === 'orbitDB';
      const isSelected = selectStorageEngine && selectStorageEngine.value === 'orbitDB';
      orbitdbSyncPanel.style.display = (isActive || isSelected) ? 'block' : 'none';

      if (orbitdbSyncPanel.style.display === 'block' && core.OrbitDBDriver && orbitdbSyncCodeOutput) {
          if (core.OrbitDBDriver.getSyncCode()) {
              orbitdbSyncCodeOutput.value = core.OrbitDBDriver.getSyncCode();
          } else if (core.OrbitDBDriver.initPromise) {
              orbitdbSyncCodeOutput.value = 'Initializing... Please wait.';
              core.OrbitDBDriver.initPromise.then(() => {
                  orbitdbSyncCodeOutput.value = core.OrbitDBDriver.getSyncCode() || 'Failed to generate code.';
              }).catch(() => {
                  orbitdbSyncCodeOutput.value = 'Initialization failed.';
              });
          } else {
              if (isActive) {
                 orbitdbSyncCodeOutput.value = 'Starting IPFS Node... Please wait.';
                 // Force initialize if it hasn't started yet but is the active engine
                 core.OrbitDBDriver.init().then(() => {
                     orbitdbSyncCodeOutput.value = core.OrbitDBDriver.getSyncCode() || 'Failed to generate code.';
                 }).catch(() => {
                     orbitdbSyncCodeOutput.value = 'Initialization failed.';
                 });
              } else {
                 orbitdbSyncCodeOutput.value = 'Click "Migrate Data" to start OrbitDB.';
              }
          }
      }
  }

  // Ensure window-level callback actually gets attached immediately
  window.onOrbitDBReady = function() {
      if (core.elements && core.elements.modalData && !core.elements.modalData.classList.contains('hidden')) {
          toggleOrbitDBSyncPanel();
      }
  };

  if (selectStorageEngine) {
    selectStorageEngine.value = core.activeStorageEngine || 'localStorage';
    selectStorageEngine.addEventListener('change', toggleOrbitDBSyncPanel);
  }

    const btnMigrateEngine = document.getElementById('btn-migrate-engine');

  // OrbitDB Sync Elements
  const orbitdbSyncPanel = document.getElementById('orbitdb-sync-panel');
  const orbitdbSyncCodeOutput = document.getElementById('orbitdb-sync-code-output');
  const btnCopyOrbitdbCode = document.getElementById('btn-copy-orbitdb-code');
  const orbitdbSyncCodeInput = document.getElementById('orbitdb-sync-code-input');
  const btnJoinOrbitdb = document.getElementById('btn-join-orbitdb');
  if (btnMigrateEngine) {
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
        toggleOrbitDBSyncPanel();
      }).catch(function(err) {
        btnMigrateEngine.textContent = originalText;
        btnMigrateEngine.disabled = false;
      });
    });
  }

  if (btnCopyOrbitdbCode && orbitdbSyncCodeOutput) {
     btnCopyOrbitdbCode.addEventListener('click', function() {
        if (!orbitdbSyncCodeOutput.value || orbitdbSyncCodeOutput.value.includes('Initializing')) {
           if (core.showToast) core.showToast('Code not ready yet.', 'error');
           return;
        }
        navigator.clipboard.writeText(orbitdbSyncCodeOutput.value).then(() => {
           if (core.showToast) core.showToast('Sync Code copied to clipboard!', 'success');
        }).catch(err => {
           console.error('Failed to copy text: ', err);
           if (core.showToast) core.showToast('Failed to copy. Select and copy manually.', 'error');
        });
     });
  }

  if (btnJoinOrbitdb && orbitdbSyncCodeInput) {
     btnJoinOrbitdb.addEventListener('click', function() {
         const code = orbitdbSyncCodeInput.value.trim();
         if (!code) {
             if (core.showToast) core.showToast('Please paste a Sync Code first.', 'error');
             return;
         }

         const originalText = btnJoinOrbitdb.textContent;
         btnJoinOrbitdb.textContent = 'Joining...';
         btnJoinOrbitdb.disabled = true;

         core.OrbitDBDriver.joinSyncCode(code).then(success => {
             btnJoinOrbitdb.textContent = originalText;
             btnJoinOrbitdb.disabled = false;
             if (success) {
                orbitdbSyncCodeInput.value = '';
                toggleOrbitDBSyncPanel(); // Refresh the sync code field
             }
         });
     });
  }

  const inputPassphrase = document.getElementById('input-sync-passphrase');
    if (inputPassphrase) {
      inputPassphrase.value = core.SyncManager.settings.passphrase || '';
    }

    const btnSavePassphrase = document.getElementById('btn-save-passphrase');
    if (btnSavePassphrase && inputPassphrase) {
      btnSavePassphrase.addEventListener('click', () => {
        core.SyncManager.setPassphrase(inputPassphrase.value);
        if (core.showToast) core.showToast('Master encryption key saved!');
      });
    }

    // P2P Controls
    const chkP2P = document.getElementById('chk-sync-p2p');
    if (chkP2P) {
      chkP2P.checked = core.SyncManager.isTargetEnabled('p2p');
      chkP2P.addEventListener('change', (e) => {
        core.SyncManager.toggleTarget('p2p', e.target.checked);
      });
    }

    const btnP2PPair = document.getElementById('btn-p2p-pair');
    const p2pBox = document.getElementById('p2p-pairing-box');
    const p2pCodeDisplay = document.getElementById('p2p-code-display');
    if (btnP2PPair) {
      btnP2PPair.addEventListener('click', () => {
        const session = core.SyncTargets.P2P.initSession();
        if (p2pCodeDisplay) p2pCodeDisplay.textContent = session.code;
        if (p2pBox) p2pBox.classList.remove('hidden');
      });
    }

    const btnP2PConnect = document.getElementById('btn-p2p-connect');
    const inputP2PRemote = document.getElementById('input-p2p-remote-code');
    if (btnP2PConnect && inputP2PRemote) {
      btnP2PConnect.addEventListener('click', () => {
        const code = inputP2PRemote.value.trim();
        if (code.length === 6) {
          core.SyncTargets.P2P.connectWithCode(code).then(() => {
            if (core.showToast) core.showToast('P2P Peer paired successfully!');
          });
        } else {
          alert('Please enter a 6-digit pair code.');
        }
      });
    }

    // Google Drive
    const chkGDrive = document.getElementById('chk-sync-gdrive');
    if (chkGDrive) {
      chkGDrive.checked = core.SyncManager.isTargetEnabled('googleDrive');
      chkGDrive.addEventListener('change', (e) => {
        core.SyncManager.toggleTarget('googleDrive', e.target.checked);
      });
    }

    const inputGDriveClientId = document.getElementById('input-gdrive-client-id');
    if (inputGDriveClientId) {
      inputGDriveClientId.value = core.SyncTargets.GoogleDrive.getClientId();
    }

    const btnSaveGDriveClientId = document.getElementById('btn-save-gdrive-client-id');
    if (btnSaveGDriveClientId && inputGDriveClientId) {
      btnSaveGDriveClientId.addEventListener('click', () => {
        const val = inputGDriveClientId.value.trim();
        if (val) {
          core.SyncTargets.GoogleDrive.setClientId(val);
          if (core.showToast) core.showToast('Google Drive Client ID saved!');
        }
      });
    }

    const btnAuthGDrive = document.getElementById('btn-auth-gdrive');
    if (btnAuthGDrive) {
      btnAuthGDrive.addEventListener('click', () => {
        const cid = inputGDriveClientId ? inputGDriveClientId.value.trim() : null;
        if (!cid || cid.includes('YOUR_GOOGLE_CLIENT_ID')) {
          alert('Please enter and save your Google Cloud OAuth Client ID first.');
          return;
        }
        window.location.href = core.SyncTargets.GoogleDrive.getAuthUrl(cid);
      });
    }

    // Dropbox
    const chkDropbox = document.getElementById('chk-sync-dropbox');
    if (chkDropbox) {
      chkDropbox.checked = core.SyncManager.isTargetEnabled('dropbox');
      chkDropbox.addEventListener('change', (e) => {
        core.SyncManager.toggleTarget('dropbox', e.target.checked);
      });
    }

    const inputDropboxClientId = document.getElementById('input-dropbox-client-id');
    if (inputDropboxClientId) {
      inputDropboxClientId.value = core.SyncTargets.Dropbox.getClientId();
    }

    const btnSaveDropboxClientId = document.getElementById('btn-save-dropbox-client-id');
    if (btnSaveDropboxClientId && inputDropboxClientId) {
      btnSaveDropboxClientId.addEventListener('click', () => {
        const val = inputDropboxClientId.value.trim();
        if (val) {
          core.SyncTargets.Dropbox.setClientId(val);
          if (core.showToast) core.showToast('Dropbox App Key saved!');
        }
      });
    }

    const btnAuthDropbox = document.getElementById('btn-auth-dropbox');
    if (btnAuthDropbox) {
      btnAuthDropbox.addEventListener('click', () => {
        const cid = inputDropboxClientId ? inputDropboxClientId.value.trim() : null;
        if (!cid || cid.includes('YOUR_DROPBOX_APP_KEY')) {
          alert('Please enter and save your Dropbox App Key first.');
          return;
        }
        window.location.href = core.SyncTargets.Dropbox.getAuthUrl(cid);
      });
    }

    // WebDAV
    const chkWebDAV = document.getElementById('chk-sync-webdav');
    const webdavBox = document.getElementById('webdav-credentials-box');
    if (chkWebDAV) {
      chkWebDAV.checked = core.SyncManager.isTargetEnabled('webdav');
      if (webdavBox && chkWebDAV.checked) webdavBox.classList.remove('hidden');
      chkWebDAV.addEventListener('change', (e) => {
        core.SyncManager.toggleTarget('webdav', e.target.checked);
        if (webdavBox) {
          if (e.target.checked) webdavBox.classList.remove('hidden');
          else webdavBox.classList.add('hidden');
        }
      });
    }

    const inputWebDAVUrl = document.getElementById('input-webdav-url');
    const inputWebDAVUser = document.getElementById('input-webdav-user');
    const inputWebDAVPass = document.getElementById('input-webdav-pass');
    if (inputWebDAVUrl && inputWebDAVUser && inputWebDAVPass) {
      const creds = core.SyncTargets.WebDAV.getCredentials();
      inputWebDAVUrl.value = creds.url;
      inputWebDAVUser.value = creds.user;
      inputWebDAVPass.value = creds.pass;
    }

    const btnSaveWebDAV = document.getElementById('btn-save-webdav');
    if (btnSaveWebDAV && inputWebDAVUrl && inputWebDAVUser && inputWebDAVPass) {
      btnSaveWebDAV.addEventListener('click', () => {
        core.SyncTargets.WebDAV.setCredentials(
          inputWebDAVUrl.value.trim(),
          inputWebDAVUser.value.trim(),
          inputWebDAVPass.value.trim()
        );
        if (core.showToast) core.showToast('WebDAV credentials saved!');
      });
    }

    // Manual Trigger Sync
    const btnTriggerSync = document.getElementById('btn-trigger-sync');
    if (btnTriggerSync) {
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
        if (window.location.hash.includes('google')) {
          core.SyncTargets.GoogleDrive.setToken(accessToken);
          core.SyncManager.toggleTarget('googleDrive', true);
          if (core.showToast) core.showToast('Google Drive authenticated successfully!');
        } else {
          core.SyncTargets.Dropbox.setToken(accessToken);
          core.SyncManager.toggleTarget('dropbox', true);
          if (core.showToast) core.showToast('Dropbox authenticated successfully!');
        }
        window.history.replaceState(null, null, window.location.pathname);
      }
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

    document.addEventListener('mouseover', (e) => {
      const card = e.target.closest('.heatmap-card');
      if (card) {
        core.hoveredCard = card;
      }
    });

    document.addEventListener('mouseout', (e) => {
      const card = e.target.closest('.heatmap-card');
      if (card && card === core.hoveredCard) {
        const relatedCard = e.relatedTarget ? e.relatedTarget.closest('.heatmap-card') : null;
        core.hoveredCard = relatedCard;
      }
    });

    document.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      const activeTag = activeEl ? activeEl.tagName.toUpperCase() : '';
      const isEditable = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || (activeEl && activeEl.isContentEditable);
      if (isEditable) return;

      const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
      if (openModal) return;

      const key = e.key;
      const lowerKey = key ? key.toLowerCase() : '';

      if (key === 'ArrowLeft' || lowerKey === 'a') {
        e.preventDefault();
        if (core.moveCursorDateByDays) core.moveCursorDateByDays(-7);
      } else if (key === 'ArrowRight' || lowerKey === 'd') {
        e.preventDefault();
        if (core.moveCursorDateByDays) core.moveCursorDateByDays(7);
      } else if (key === 'ArrowUp' || lowerKey === 'w') {
        e.preventDefault();
        if (core.moveCursorDateByDays) core.moveCursorDateByDays(-1);
      } else if (key === 'ArrowDown' || lowerKey === 's') {
        e.preventDefault();
        if (core.moveCursorDateByDays) core.moveCursorDateByDays(1);
      } else if (key === 'Enter') {
        const hoveredCard = (document.querySelector && document.querySelector('.heatmap-card:hover')) || core.hoveredCard;
        if (hoveredCard) {
          const quickLogBtn = hoveredCard.querySelector('.btn-card-quick-log');
          if (quickLogBtn) {
            e.preventDefault();
            quickLogBtn.click();
          }
        }
      }
    });
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
      const habit = (core.state && core.state.habits) ? core.state.habits.find(h => h.id === habitId) : null;
      if (habit && habit.type === 'negative') text = count > 0 ? `✨ <strong>Clean Day Success</strong> on ${formattedDate}` : `No data for ${formattedDate}`;
      else {
        const dailyTarget = habit ? Math.max(1, habit.dailyTarget || 1) : 1;
        if (dailyTarget > 1) {
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
    if (!core.elements || !core.elements.heatmapsGallery) return;

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
    } else if (core.hoveredCard) {
      const hoveredSq = core.hoveredCard.querySelector('.day-square.cursor-day');
      if (hoveredSq && candidateSquares.includes(hoveredSq)) {
        chosenSq = hoveredSq;
      }
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
        if (e.target.closest('.focused-day-toolbar') || e.target.closest('.card-header-actions') || e.target.closest('.card-context-menu-dropdown') || e.target.closest('.btn-card-menu-toggle') || e.target.closest('.card-title-link') || e.target.closest('.btn-card-quick-log')) return;
        const sq = e.target.closest('.day-square[data-date]');
        if (sq && sq._isLongPressTriggered) { sq._isLongPressTriggered = false; e.stopPropagation(); e.preventDefault(); return; }
        e.stopPropagation();
        if (core.elements.customTooltip) core.elements.customTooltip.classList.add('hidden');

        const hasSubhabits = card.getAttribute('data-has-subhabits') === 'true';
        const rawHabitId = card.getAttribute('data-habit-id-raw');

        if (hasSubhabits && rawHabitId) {
          core.toggleConcertina(rawHabitId);
          return;
        }

        const cardHabitId = card.getAttribute('data-habit-id') || 'all';
        let targetHabitId = cardHabitId;
        if (sq && sq.dataset.habitId && sq.dataset.habitId !== 'all' && !sq.dataset.habitId.startsWith('group_')) targetHabitId = sq.dataset.habitId;
        const targetDate = sq ? sq.dataset.date : (core.getCursorDateKey ? core.getCursorDateKey() : core.getTodayKey());
        if (sq && sq.dataset.date && core.setCursorDateKey) {
          core.setCursorDateKey(sq.dataset.date);
        }
        core.openLogModal(targetDate, targetHabitId);
      });
    });

    const squares = core.elements.heatmapsGallery.querySelectorAll('.day-square[data-date]');
    squares.forEach(sq => {
      sq.addEventListener('mouseenter', () => {
        core.showTooltipForSquare(sq, 0);
      });
      sq.addEventListener('mouseleave', () => {
        if (core._cursorTooltipTimer) {
          clearTimeout(core._cursorTooltipTimer);
          core._cursorTooltipTimer = null;
        }
        if (core.elements.customTooltip) {
          core.elements.customTooltip.classList.add('hidden');
        }
      });
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

    core.elements.heatmapsGallery.querySelectorAll('.drag-handle').forEach(handle => {
      let arrowsWasOpen = false;

      handle.addEventListener('pointerdown', () => {
        const container = handle.closest('.drag-handle-container');
        const arrows = container ? container.querySelector('.drag-arrows') : null;
        arrowsWasOpen = arrows && !arrows.classList.contains('hidden');
      });

      handle.addEventListener('click', (e) => {
        e.stopPropagation();
        const container = handle.closest('.drag-handle-container');
        if (!container) return;
        const arrows = container.querySelector('.drag-arrows');
        if (!arrows) return;

        core.elements.heatmapsGallery.querySelectorAll('.drag-arrows').forEach(arr => {
          if (arr !== arrows) arr.classList.add('hidden');
        });

        if (arrowsWasOpen) {
          arrows.classList.add('hidden');
        } else {
          arrows.classList.remove('hidden');
          const firstBtn = arrows.querySelector('button');
          if (firstBtn) {
            firstBtn.focus();
          } else {
            arrows.focus();
          }
        }
        arrowsWasOpen = false;
      });
    });

    core.elements.heatmapsGallery.querySelectorAll('.drag-arrows').forEach(arrows => {
      arrows.addEventListener('focusout', (e) => {
        const container = arrows.closest('.drag-handle-container');
        if (e.relatedTarget && container && container.contains(e.relatedTarget)) {
          return;
        }
        arrows.classList.add('hidden');
      });
    });

    core.elements.heatmapsGallery.querySelectorAll('.btn-move-up, .btn-move-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        const habitId = btn.dataset.habitId;
        const isUp = btn.classList.contains('btn-move-up');

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
          if (core.saveState) core.saveState();
          if (core.renderAll) core.renderAll();
        } else if (!isUp && siblingIndex < siblings.length - 1) {
          const nextSibling = siblings[siblingIndex + 1];
          const fromIndex = core.state.habits.findIndex(h => h.id === habitId);
          const [movedHabit] = core.state.habits.splice(fromIndex, 1);
          const newToIndex = core.state.habits.findIndex(h => h.id === nextSibling.id);
          core.state.habits.splice(newToIndex + 1, 0, movedHabit);
          if (core.saveState) core.saveState();
          if (core.renderAll) core.renderAll();
        }
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.card-context-menu-dropdown') && core.elements.heatmapsGallery) {
        core.elements.heatmapsGallery.querySelectorAll('.card-menu-content').forEach(m => m.classList.add('hidden'));
        core.elements.heatmapsGallery.querySelectorAll('.heatmap-card.menu-open').forEach(c => c.classList.remove('menu-open'));
        core.elements.heatmapsGallery.querySelectorAll('.heatmap-group-wrapper.menu-open').forEach(w => w.classList.remove('menu-open'));
      }
      if (!e.target.closest('.drag-handle-container') && core.elements.heatmapsGallery) {
        core.elements.heatmapsGallery.querySelectorAll('.drag-arrows').forEach(arr => arr.classList.add('hidden'));
      }
    });

    core.elements.heatmapsGallery.querySelectorAll('.btn-card-add-sub').forEach(btn => {
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

    core.elements.heatmapsGallery.querySelectorAll('.btn-card-edit').forEach(btn => {
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

    core.elements.heatmapsGallery.querySelectorAll('.btn-card-pause').forEach(btn => {
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
        const parentWrapper = btn.closest('.heatmap-group-wrapper');
        if (parentWrapper) parentWrapper.classList.remove('menu-open');
        core.deleteHabit(btn.dataset.habitId);
      });
    });

    core.elements.heatmapsGallery.querySelectorAll('.btn-toggle-concertina, .btn-put-away').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const habitId = btn.dataset.habitId || btn.dataset.parentId;
        if (habitId) core.toggleConcertina(habitId);
      });
    });

    core.elements.heatmapsGallery.querySelectorAll('.btn-card-quick-log').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const habitId = btn.dataset.habitId;
        const isGoalMet = btn.dataset.goalMet === 'true';

        if (!habitId) return;

        const targetDate = core.getCursorDateKey ? core.getCursorDateKey() : core.getTodayKey();

        if (isGoalMet) {
          core.openLogModal(targetDate, habitId);
        } else {
          core.toggleHabitForDate(habitId, targetDate);
        }
      });
    });

    core.elements.heatmapsGallery.querySelectorAll('.card-title-link').forEach(el => {
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
        if (!habitToEdit) {
          const selectedPId = parentSelect.value;
          const parentObj = selectedPId ? core.state.habits.find(h => h.id === selectedPId) : null;
          if (core.elements.habitShowCount) core.elements.habitShowCount.checked = parentObj ? parentObj.showCount !== false : true;
          if (core.elements.habitShowDuration) core.elements.habitShowDuration.checked = parentObj ? parentObj.showDuration === true : false;
          if (core.elements.habitHideFromAll) core.elements.habitHideFromAll.checked = parentObj ? parentObj.hideFromAll === true : false;
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

      const rawColor = habitToEdit.colorTheme || core.getDefaultColorForId(habitToEdit.id);
      const normalized = rawColor.startsWith('#') ? core.normalizeHex(rawColor) : (core.PRESET_THEME_HEX[rawColor] || core.getDefaultColorForId(habitToEdit.id));
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
      core.syncCalendarColorDropdown('');
      const initialParent = selectedParentId ? core.state.habits.find(h => h.id === selectedParentId) : null;
      if (core.elements.habitShowStreak) core.elements.habitShowStreak.checked = false;
      if (core.elements.habitShowCount) core.elements.habitShowCount.checked = initialParent ? initialParent.showCount !== false : true;
      if (core.elements.habitShowDuration) core.elements.habitShowDuration.checked = initialParent ? initialParent.showDuration === true : false;
      if (core.elements.habitHideFromAll) core.elements.habitHideFromAll.checked = initialParent ? initialParent.hideFromAll === true : false;
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
      let derivedId = currentId;
      if (!isEditMode) derivedId = (parentIdVal ? parentIdVal + '_' : '') + core.idFromName(nameVal);

      if (core.elements.habitIdDisplay) core.elements.habitIdDisplay.textContent = derivedId;
      if (core.elements.habitIdPreview) core.elements.habitIdPreview.classList.remove('hidden');
      if (core.elements.habitFormDetails) core.elements.habitFormDetails.classList.remove('hidden');

      if (!isEditMode) {
        const derivedColor = core.getDefaultColorForId(derivedId);
        if (derivedColor && typeof derivedColor === 'string') {
          const normalized = core.normalizeHex(derivedColor);
          if (core.elements.radioColorCustom) core.elements.radioColorCustom.checked = true;
          if (core.elements.customColorHex) core.elements.customColorHex.value = normalized;
          if (core.elements.customColorPicker) core.elements.customColorPicker.value = normalized;
          if (core.elements.customSwatchPreview && core.elements.customSwatchPreview.style) {
            core.elements.customSwatchPreview.style.backgroundColor = normalized;
          }
          core.syncCalendarColorDropdown(normalized);
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
    const showCount = core.elements.habitShowCount ? core.elements.habitShowCount.checked : (hasVal('habit-show-count') || true);
    const showDuration = core.elements.habitShowDuration ? core.elements.habitShowDuration.checked : hasVal('habit-show-duration');
    const hideFromAll = core.elements.habitHideFromAll ? core.elements.habitHideFromAll.checked : hasVal('habit-hide-from-all');
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

    const calSelect = document.getElementById('habit-calendar-color-select');
    const calVal = (calSelect && calSelect.value) ? calSelect.value : (getVal('habit-calendar-color-select') || '');
    const hexInput = document.getElementById('habit-custom-color-hex');
    const hexVal = (hexInput && hexInput.value) ? hexInput.value : (core.elements.customColorHex ? core.elements.customColorHex.value : (getVal('habit-custom-color-hex') || ''));
    const pickerInput = document.getElementById('habit-custom-color-picker');
    const pickerVal = (pickerInput && pickerInput.value) ? pickerInput.value : (getVal('habit-custom-color-picker') || '');

    const chosenColor = calVal || hexVal || pickerVal;
    let colorTheme = (chosenColor && core.parseHexColor(chosenColor))
      ? core.normalizeHex(chosenColor)
      : core.getDefaultColorForId(id || name || 'default');

    if (!name) return;

    if (id) {
      const habit = core.state.habits.find(h => h.id === id);
      if (habit) {
        const previousHideFromAll = Boolean(habit.hideFromAll);
        habit.name = name; habit.type = type; habit.description = description; habit.category = category; habit.dailyTarget = dailyTarget; habit.showStreak = showStreak; habit.showCount = showCount; habit.showDuration = showDuration; habit.hideFromAll = hideFromAll;
        core.setHabitPauseState(habit, isPaused);
        habit.frequencyType = freqType; habit.targetDays = targetDays; habit.weeklyTarget = weeklyTarget; habit.monthlyDay = monthlyDay; habit.monthlyTarget = monthlyTarget; habit.colorWholeWeek = colorWholeWeek; habit.colorWholeMonth = colorWholeMonth; habit.customTarget = customTarget; habit.customInterval = customInterval; habit.customUnit = customUnit; habit.colorTheme = colorTheme; habit.parentId = parentId; habit.parentDependency = parentDependency;

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
        name, type, description, category, showStreak, showCount, showDuration, hideFromAll, isPaused, pauseHistory: isPaused ? [{ startDate: core.getTodayKey(), endDate: null }] : [],
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
    if (dateStr && core.getCursorDateKey && core.getCursorDateKey() !== dateStr) {
      if (core.setCursorDateKey) core.setCursorDateKey(dateStr);
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
