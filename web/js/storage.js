window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  // --- DYNAMIC ON-DEMAND SCRIPT LOADER ---
  core.loadedScripts = core.loadedScripts || {};
  core.loadScript = function(url) {
    if (core.loadedScripts[url]) {
      return core.loadedScripts[url];
    }
    const promise = new Promise(function(resolve, reject) {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function() {
        resolve();
      };
      script.onerror = function(err) {
        delete core.loadedScripts[url];
        reject(new Error('Failed to load script: ' + url));
      };
      document.head.appendChild(script);
    });
    core.loadedScripts[url] = promise;
    return promise;
  };

  // --- STORAGE DRIVERS (LocalStorage & IndexedDB) ---
  core.LocalStorageDriver = {
    name: 'localStorage',
    getItem: function(key) {
      try {
        return Promise.resolve(localStorage.getItem(key));
      } catch (e) {
        return Promise.reject(e);
      }
    },
    setItem: function(key, value) {
      try {
        localStorage.setItem(key, value);
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    },
    removeItem: function(key) {
      try {
        localStorage.removeItem(key);
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    },
    saveLog: function(habitId, dateKey, count, note) {
      if (core.saveState) core.saveState();
      return Promise.resolve(true);
    },
    saveHabit: function(habit) {
      if (core.saveState) core.saveState();
      return Promise.resolve(true);
    },
    saveSettings: function(settings) {
      if (core.saveState) core.saveState();
      return Promise.resolve(true);
    }
  };

  core.IndexedDBDriver = {
    name: 'indexedDB',
    dbName: 'habitual_db',
    storeName: 'kv_store', // Legacy
    dbPromise: null,
    getDB: function() {
      if (this.dbPromise) return this.dbPromise;
      const self = this;
      this.dbPromise = new Promise(function(resolve, reject) {
        if (!window.indexedDB) {
          reject(new Error('IndexedDB not supported in this browser.'));
          return;
        }
        // Increment version to 2 for new schema
        const req = indexedDB.open(self.dbName, 2);
        req.onupgradeneeded = function(e) {
          const db = e.target.result;
          const oldVersion = e.oldVersion;

          // V1 to V2 migration (or fresh setup)
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains('habits')) {
            db.createObjectStore('habits', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('logs')) {
            // Use composite key string `${habitId}_${date}`
            db.createObjectStore('logs', { keyPath: 'id' });
          }

          // Keep legacy store for backward compatibility during migration
          if (!db.objectStoreNames.contains(self.storeName)) {
            db.createObjectStore(self.storeName);
          }
        };
        req.onsuccess = function(e) {
          resolve(e.target.result);
        };
        req.onerror = function(e) {
          reject(e.target.error);
        };
      });
      return this.dbPromise;
    },
    getItem: function(key) {
      if (key !== core.STORAGE_KEY) {
        // Fallback for non-core storage keys (though shouldn't be used)
        const self = this;
        return this.getDB().then(function(db) {
          return new Promise(function(resolve, reject) {
            const tx = db.transaction(self.storeName, 'readonly');
            const store = tx.objectStore(self.storeName);
            const req = store.get(key);
            req.onsuccess = function() {
              resolve(req.result !== undefined ? req.result : null);
            };
            req.onerror = function(e) {
              reject(e.target.error);
            };
          });
        });
      }

      // Reconstruct monolithic state from granular stores
      const self = this;
      return this.getDB().then(function(db) {
        return new Promise(function(resolve, reject) {
          if (!db.objectStoreNames.contains('settings') || !db.objectStoreNames.contains('habits') || !db.objectStoreNames.contains('logs')) {
             // Fallback to V1 storage if V2 schema is somehow not present yet
             const tx = db.transaction(self.storeName, 'readonly');
             const req = tx.objectStore(self.storeName).get(key);
             req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
             req.onerror = (e) => reject(e.target.error);
             return;
          }

          const tx = db.transaction(['settings', 'habits', 'logs', self.storeName], 'readonly');

          const settingsStore = tx.objectStore('settings');
          const habitsStore = tx.objectStore('habits');
          const logsStore = tx.objectStore('logs');

          const settingsReq = settingsStore.getAll();
          const habitsReq = habitsStore.getAll();
          const logsReq = logsStore.getAll();
          const legacyReq = tx.objectStore(self.storeName).get(key); // Fallback data

          tx.oncomplete = function() {
            const settingsArr = settingsReq.result || [];
            const habitsArr = habitsReq.result || [];
            const logsArr = logsReq.result || [];
            const legacyData = legacyReq.result;

            if (settingsArr.length === 0 && habitsArr.length === 0 && logsArr.length === 0) {
                // If granular stores are completely empty, try returning legacy JSON string
                resolve(legacyData !== undefined ? legacyData : null);
                return;
            }

            const payload = { habits: [] };

            // Map settings array back to object keys
            settingsArr.forEach(s => {
              if (s.key === 'version') payload.version = s.value;
              else if (s.key === 'updatedAt') payload.updatedAt = s.value;
              else if (s.key === 'selectedHabitId') payload.selectedHabitId = s.value;
              else if (s.key === 'selectedYear') payload.selectedYear = s.value;
              else if (s.key === 'showQuickLogOnStartup') payload.showQuickLogOnStartup = s.value;
            });

            // Reconstruct habits and logs
            const habitsMap = new Map();
            habitsArr.forEach(h => {
               h.logs = {}; // Initialize empty logs
               habitsMap.set(h.id, h);
               payload.habits.push(h);
            });

            logsArr.forEach(logEntry => {
               // logEntry id is `${habitId}_${date}`
               const parts = logEntry.id.split('_');
               if (parts.length >= 3) {
                  // habitId usually has an underscore (e.g. habit_123_1), and then we append _date
                  // We need to carefully split off the date. Date is always 10 chars (YYYY-MM-DD)
                  const date = logEntry.id.substring(logEntry.id.length - 10);
                  const habitId = logEntry.id.substring(0, logEntry.id.length - 11);

                  const habit = habitsMap.get(habitId);
                  if (habit) {
                      habit.logs[date] = { count: logEntry.count };
                      if (logEntry.note) habit.logs[date].note = logEntry.note;
                      if (logEntry.unverified) habit.logs[date].unverified = true;
                  }
               }
            });

            // Return structured payload object directly to avoid redundant stringify/parse
            resolve(payload);
          };

          tx.onerror = function(e) {
            reject(e.target.error);
          };
        });
      });
    },
    setItem: function(key, value) {
      if (key !== core.STORAGE_KEY) {
        const self = this;
        return this.getDB().then(function(db) {
          return new Promise(function(resolve, reject) {
            const tx = db.transaction(self.storeName, 'readwrite');
            const store = tx.objectStore(self.storeName);
            const req = store.put(value, key);
            req.onsuccess = function() {
              resolve();
            };
            req.onerror = function(e) {
              reject(e.target.error);
            };
          });
        });
      }

      // Break down monolithic JSON string into granular stores
      const self = this;
      return this.getDB().then(function(db) {
        return new Promise(function(resolve, reject) {
          let payload;
          try {
            payload = JSON.parse(value);
          } catch(e) {
            reject(new Error('Failed to parse state for granular save.'));
            return;
          }

          if (!db.objectStoreNames.contains('settings') || !db.objectStoreNames.contains('habits') || !db.objectStoreNames.contains('logs')) {
             // Fallback to V1 storage
             const tx = db.transaction(self.storeName, 'readwrite');
             const req = tx.objectStore(self.storeName).put(value, key);
             req.onsuccess = () => resolve();
             req.onerror = (e) => reject(e.target.error);
             return;
          }

          const tx = db.transaction(['settings', 'habits', 'logs', self.storeName], 'readwrite');

          // Legacy backup
          tx.objectStore(self.storeName).put(value, key);

          const settingsStore = tx.objectStore('settings');
          if (payload.version !== undefined) settingsStore.put({ key: 'version', value: payload.version });
          if (payload.updatedAt !== undefined) settingsStore.put({ key: 'updatedAt', value: payload.updatedAt });
          if (payload.selectedHabitId !== undefined) settingsStore.put({ key: 'selectedHabitId', value: payload.selectedHabitId });
          if (payload.selectedYear !== undefined) settingsStore.put({ key: 'selectedYear', value: payload.selectedYear });
          if (payload.showQuickLogOnStartup !== undefined) settingsStore.put({ key: 'showQuickLogOnStartup', value: payload.showQuickLogOnStartup });

          const habitsStore = tx.objectStore('habits');
          const logsStore = tx.objectStore('logs');

          // Optional: we might want to clear old habits/logs, but a put/upsert works for existing ones.
          // However, deleted habits wouldn't be removed this way. Since it's a monolithic rewrite, clear first:
          habitsStore.clear();
          logsStore.clear();

          (payload.habits || []).forEach(habit => {
              const habitCopy = Object.assign({}, habit);
              const logs = habitCopy.logs;
              delete habitCopy.logs; // Do not store logs in habit object
              habitsStore.put(habitCopy);

              if (logs) {
                  Object.keys(logs).forEach(date => {
                      const logData = logs[date];
                      const logRec = {
                          id: habit.id + '_' + date, // Composite key
                          habitId: habit.id,
                          date: date,
                          count: typeof logData === 'number' ? logData : (logData.count || 0),
                          note: (logData && typeof logData === 'object' && logData.note) ? logData.note : ''
                      };
                      if (logData && typeof logData === 'object' && logData.unverified) {
                          logRec.unverified = true;
                      }
                      logsStore.put(logRec);
                  });
              }
          });

          tx.oncomplete = function() {
            resolve();
          };
          tx.onerror = function(e) {
            reject(e.target.error);
          };
        });
      });
    },
    removeItem: function(key) {
      const self = this;
      return this.getDB().then(function(db) {
        return new Promise(function(resolve, reject) {
          const tx = db.transaction(self.storeName, 'readwrite');
          const store = tx.objectStore(self.storeName);
          const req = store.delete(key);
          req.onsuccess = function() {
            resolve();
          };
          req.onerror = function(e) {
            reject(e.target.error);
          };
        });
      });
    },

    // --- New Granular API Methods ---
    saveLog: function(habitId, dateKey, count, note, unverified) {
       return this.getDB().then(db => {
           return new Promise((resolve, reject) => {
               if (!db.objectStoreNames.contains('logs')) return resolve(false);
               const tx = db.transaction('logs', 'readwrite');
               const store = tx.objectStore('logs');

               if (count === 0 && (!note || note.trim() === '')) {
                   // Delete log if count is 0 and no note
                   store.delete(habitId + '_' + dateKey);
               } else {
                   const rec = {
                       id: habitId + '_' + dateKey,
                       habitId: habitId,
                       date: dateKey,
                       count: count,
                       note: note || ''
                   };
                   if (unverified) rec.unverified = true;
                   store.put(rec);
               }

               tx.oncomplete = () => resolve(true);
               tx.onerror = (e) => reject(e.target.error);
           });
       });
    },

    saveHabit: function(habit) {
       return this.getDB().then(db => {
           return new Promise((resolve, reject) => {
               if (!db.objectStoreNames.contains('habits')) return resolve(false);
               const tx = db.transaction('habits', 'readwrite');
               const store = tx.objectStore('habits');

               const habitCopy = Object.assign({}, habit);
               delete habitCopy.logs;
               store.put(habitCopy);

               tx.oncomplete = () => resolve(true);
               tx.onerror = (e) => reject(e.target.error);
           });
       });
    },

    saveSettings: function(settings) {
       return this.getDB().then(db => {
           return new Promise((resolve, reject) => {
               if (!db.objectStoreNames.contains('settings')) return resolve(false);
               const tx = db.transaction('settings', 'readwrite');
               const store = tx.objectStore('settings');

               Object.keys(settings).forEach(key => {
                   store.put({ key: key, value: settings[key] });
               });

               tx.oncomplete = () => resolve(true);
               tx.onerror = (e) => reject(e.target.error);
           });
       });
    }
  };

  core.activeStorageEngine = localStorage.getItem('habitual_storage_engine') || 'localStorage';

  core.getDriver = function(engineName) {
    const name = engineName || core.activeStorageEngine;
    if (name === 'indexedDB') return core.IndexedDBDriver;
    return core.LocalStorageDriver;
  };

  core.setStorageEngine = function(engineName) {
    if (engineName !== 'localStorage' && engineName !== 'indexedDB') return;
    core.activeStorageEngine = engineName;
    try {
      localStorage.setItem('habitual_storage_engine', engineName);
    } catch (e) {
      console.warn('Could not persist active storage engine setting:', e);
    }
  };

  core.migrateStorageEngine = function(targetEngine) {
    if (targetEngine === core.activeStorageEngine) {
      return Promise.resolve({ success: true, message: 'Already using ' + targetEngine });
    }
    const currentDriver = core.getDriver();
    const targetDriver = core.getDriver(targetEngine);

    return currentDriver.getItem(core.STORAGE_KEY).then(function(raw) {
      const dataToMigrate = raw || JSON.stringify(core.getPayloadFromState());
      return targetDriver.setItem(core.STORAGE_KEY, dataToMigrate).then(function() {
        core.setStorageEngine(targetEngine);
        if (core.showToast) {
          const engineLabel = targetEngine === 'indexedDB' ? 'IndexedDB' : 'Local Storage';
          core.showToast(`Migrated data storage engine to ${engineLabel}!`, 'success');
        }
        return { success: true, message: 'Migration successful' };
      });
    }).catch(function(err) {
      console.error('Storage engine migration failed:', err);
      if (core.showToast) core.showToast('Failed to migrate storage engine.', 'error');
      return { success: false, error: err };
    });
  };

  core._serializeHabit = function(habit, cutoffKey) {
    const derivedName = core.deriveNameFromId(habit.id);
    const derivedColor = core.getDefaultColorForId(habit.id);
    const h = { id: habit.id, updatedAt: habit.updatedAt || Date.now() };

    if (habit.name && habit.name.trim() !== derivedName) h.name = habit.name;
    if (habit.colorTheme) {
      const normTheme = habit.colorTheme.startsWith('#') ? core.normalizeHex(habit.colorTheme) : habit.colorTheme;
      const normDerived = derivedColor.startsWith('#') ? core.normalizeHex(derivedColor) : derivedColor;
      if (normTheme !== normDerived || (habit.sharing && habit.sharing.enabled)) h.colorTheme = habit.colorTheme;
    }

    if (habit.type && habit.type !== 'positive') h.type = habit.type;
    if (habit.description) h.description = habit.description;
    if (habit.category) h.category = habit.category;
    if (habit.showStreak) h.showStreak = true;
    if (habit.showCount === false) h.showCount = false;
    if (habit.showDuration) h.showDuration = true;
    if (habit.hideFromAll) h.hideFromAll = true;
    if (habit.isPaused) h.isPaused = true;
    if (habit.hideHeatmapWhenPaused) h.hideHeatmapWhenPaused = true;
    if (habit.hideHeatmap) h.hideHeatmap = true;
    if (Array.isArray(habit.pauseHistory) && habit.pauseHistory.length > 0) h.pauseHistory = habit.pauseHistory;
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
    if (habit.customTarget && habit.customTarget !== 1) h.customTarget = habit.customTarget;
    if (habit.customInterval && habit.customInterval !== 3) h.customInterval = habit.customInterval;
    if (habit.customUnit && habit.customUnit !== 'days') h.customUnit = habit.customUnit;
    if (habit.colorWholeWeek) h.colorWholeWeek = true;
    if (habit.colorWholeMonth) h.colorWholeMonth = true;
    if (habit.parentId) h.parentId = habit.parentId;
    if (habit.parentDependency && habit.parentDependency !== 'none') h.parentDependency = habit.parentDependency;
    if (habit.createdAt) h.createdAt = habit.createdAt;
    if (habit.sharing) h.sharing = habit.sharing;

    if (habit.logs) {
      const cleanLogs = {};
      let hasLogs = false;
      let effectiveCutoff = cutoffKey;

      Object.keys(habit.logs).forEach(dateKey => {
        if (effectiveCutoff && dateKey < effectiveCutoff) return;
        const log = habit.logs[dateKey];
        if (!log) return;
        const count = log.count || 0;
        const note = (log.note || '').trim();
        if (count > 0 || note !== '') {
          hasLogs = true;
          const logData = { count };
          if (note !== '') logData.note = note;
          if (log.unverified) logData.unverified = true;
          cleanLogs[dateKey] = logData;
        }
      });
      if (hasLogs || cutoffKey) h.logs = cleanLogs;
    }
    return h;
  };

  core.getPayloadFromState = function() {
    const deleted = core.state.deletedHabitIds;
    return {
      version: 2,
      updatedAt: Date.now(),
      habits: (core.state.habits || []).map(h => core._serializeHabit(h)),
      deletedHabitIds: (deleted && deleted.length > 0) ? Array.from(new Set(deleted)) : [],
      remoteHashHistory: (core.state.remoteHashHistory || []).slice(0, 30),
      selectedHabitId: core.state.selectedHabitId || 'all',
      selectedYear: core.state.selectedYear || core.CURRENT_YEAR,
      showQuickLogOnStartup: core.state.showQuickLogOnStartup || false
    };
  };

  core.getDeltaPayloadFromState = function(daysBack = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffKey = core.formatDateKey ? core.formatDateKey(cutoffDate) : '2020-01-01';

    const deleted = core.state.deletedHabitIds;
    const delta = {
      version: 2,
      updatedAt: Date.now(),
      isDelta: true,
      habits: (core.state.habits || []).map(h => core._serializeHabit(h, cutoffKey)),
      deletedHabitIds: (deleted && deleted.length > 0) ? Array.from(new Set(deleted)) : []
    };

    if (core.state.selectedHabitId && core.state.selectedHabitId !== 'all') {
      delta.selectedHabitId = core.state.selectedHabitId;
    }
    if (core.state.selectedYear && core.state.selectedYear !== core.CURRENT_YEAR) {
      delta.selectedYear = core.state.selectedYear;
    }

    return delta;
  };

  core.applyPayloadToState = function(parsed) {
    if (!parsed) return;

    if (parsed.remoteHashHistory && Array.isArray(parsed.remoteHashHistory)) {
      const hashMap = new Map();
      [...(core.state.remoteHashHistory || []), ...parsed.remoteHashHistory].forEach(item => {
        if (item && item.hash) {
          if (!hashMap.has(item.hash) || (item.timestamp || 0) > (hashMap.get(item.hash).timestamp || 0)) {
            hashMap.set(item.hash, item);
          }
        }
      });
      core.state.remoteHashHistory = Array.from(hashMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 30);
    }

    if (parsed.deletedHabitIds && parsed.deletedHabitIds.length > 0) {
      const mergedDeleted = new Set([
        ...(core.state.deletedHabitIds || []),
        ...parsed.deletedHabitIds
      ]);
      core.state.deletedHabitIds = Array.from(mergedDeleted);
    }

    const hasDeleted = core.state.deletedHabitIds && core.state.deletedHabitIds.length > 0;
    const deletedSet = hasDeleted ? new Set(core.state.deletedHabitIds) : null;

    let rawHabits = parsed.habits || [];
    if (hasDeleted) {
      rawHabits = rawHabits.filter(h => h && h.id && !deletedSet.has(h.id));
    }

    core.state.habits = rawHabits.map(h => {
      const id = h.id;
      const derivedName = core.deriveNameFromId(id);
      const derivedColor = core.getDefaultColorForId(id);

      const restoredLogs = {};
      if (h.logs) {
        Object.keys(h.logs).forEach(dateKey => {
          const entry = h.logs[dateKey];
          if (typeof entry === 'number') {
            restoredLogs[dateKey] = { count: entry, note: '' };
          } else if (entry && typeof entry === 'object') {
            restoredLogs[dateKey] = {
              count: entry.count || 0,
              note: entry.note || '',
              unverified: Boolean(entry.unverified)
            };
          }
        });
      }

      const habitObj = {
        id: id,
        name: h.name || derivedName,
        type: h.type || 'positive',
        description: h.description || '',
        category: h.category || '',
        showStreak: Boolean(h.showStreak),
        showCount: h.showCount !== undefined ? Boolean(h.showCount) : true,
        showDuration: Boolean(h.showDuration),
        hideFromAll: Boolean(h.hideFromAll),
        isPaused: Boolean(h.isPaused),
        hideHeatmapWhenPaused: Boolean(h.hideHeatmapWhenPaused),
        hideHeatmap: Boolean(h.hideHeatmap),
        pauseHistory: Array.isArray(h.pauseHistory) ? h.pauseHistory : [],
        colorTheme: h.colorTheme || derivedColor,
        dailyTarget: h.dailyTarget || 1,
        frequencyType: h.frequencyType || 'daily',
        targetDays: h.targetDays || [1, 2, 3, 4, 5, 6, 0],
        weeklyTarget: h.weeklyTarget || 1,
        monthlyDay: h.monthlyDay || 1,
        monthlyTarget: h.monthlyTarget || 1,
        customTarget: h.customTarget || 1,
        customInterval: h.customInterval || 3,
        customUnit: h.customUnit || 'days',
        colorWholeWeek: Boolean(h.colorWholeWeek),
        colorWholeMonth: Boolean(h.colorWholeMonth),
        parentId: h.parentId || null,
        parentDependency: h.parentDependency || 'none',
        createdAt: h.createdAt || core.getTodayKey(),
        updatedAt: h.updatedAt || Date.now(),
        logs: restoredLogs
      };

      if (h.sharing) habitObj.sharing = h.sharing;
      return habitObj;
    });

    core.state.selectedHabitId = parsed.selectedHabitId || 'all';
    core.state.selectedYear = parsed.selectedYear || core.CURRENT_YEAR;
    core.state.showQuickLogOnStartup = parsed.showQuickLogOnStartup || false;
  };

  core.loadState = function() {
    // Synchronous fallback for legacy callers
    try {
      const raw = localStorage.getItem(core.STORAGE_KEY);
      if (raw) {
        core.applyPayloadToState(JSON.parse(raw));
      }
    } catch (e) {
      console.error('Failed synchronous loadState:', e);
    }
  };

  core.loadStateAsync = function() {
    const driver = core.getDriver();
    return driver.getItem(core.STORAGE_KEY).then(function(raw) {
      if (raw) {
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          core.applyPayloadToState(parsed);
        } catch (e) {
          console.error('Failed to parse loaded state:', e);
        }
      }
      if (core.renderAll) core.renderAll();
      return core.state;
    }).catch(function(err) {
      console.error('Failed async loadState from driver:', err);
      core.loadState();
    });
  };

  core.saveState = function(skipRemoteSync) {
    const payload = core.getPayloadFromState();
    const payloadStr = JSON.stringify(payload);

    // Synchronously update LocalStorage fallback for instant synchronous reads & zero latency on page refresh
    try {
      localStorage.setItem(core.STORAGE_KEY, payloadStr);
      localStorage.setItem('habitual_v2_active_engine', core.activeStorageEngine);
    } catch (e) {
      console.warn('LocalStorage save fallback warning:', e);
    }

    if (!skipRemoteSync) {
      // Synchronize all shared habits to Firebase at the exact same time
      if (core.SyncTargets && core.SyncTargets.Firestore && typeof core.SyncTargets.Firestore.syncAllSharedHabits === 'function') {
        core.SyncTargets.Firestore.syncAllSharedHabits();
      }
      if (core.SyncManager && core.SyncManager.isTargetEnabled('firestore')) {
        core.SyncManager.broadcastWriteDebounced(payload, 300);
      }
    }

    // Persist to active driver (IndexedDB or LocalStorage)
    const driver = core.getDriver();
    driver.setItem(core.STORAGE_KEY, payloadStr).catch(function(err) {
      console.error('Failed to save state to driver:', err);
    });
  };

  let _saveStateDebounceTimer = null;
  core.saveStateDebounced = function(delay) {
    const waitTime = typeof delay === 'number' ? delay : 300;
    if (_saveStateDebounceTimer) clearTimeout(_saveStateDebounceTimer);
    _saveStateDebounceTimer = setTimeout(function() {
      _saveStateDebounceTimer = null;
      core.saveState();
    }, waitTime);
  };

  core.saveLog = function(habitId, dateKey, count, note) {
    // Always update local storage and Firebase at the exact same time
    core.saveState();
    const driver = core.getDriver();
    if (driver && typeof driver.saveLog === 'function') {
      return Promise.resolve(driver.saveLog(habitId, dateKey, count, note));
    }
    return Promise.resolve(true);
  };

  core.saveHabit = function(habit) {
    if (habit) habit.updatedAt = Date.now();
    // Always update local storage and Firebase at the exact same time
    core.saveState();
    let firestorePromise = Promise.resolve(true);
    if (core.SyncTargets && core.SyncTargets.Firestore && habit && habit.sharing && habit.sharing.enabled) {
      firestorePromise = core.SyncTargets.Firestore.uploadPerHabitBackup(habit).catch(function(e) {
        console.warn('Auto upload per-habit backup on saveHabit error:', e);
      });
    }
    const driver = core.getDriver();
    if (driver && typeof driver.saveHabit === 'function') {
      return firestorePromise.then(function() {
        return driver.saveHabit(habit);
      });
    }
    return firestorePromise;
  };

  core.saveSettings = function(settings) {
    // Always update local storage and Firebase at the exact same time
    core.saveState();
    const driver = core.getDriver();
    if (driver && typeof driver.saveSettings === 'function') {
      return Promise.resolve(driver.saveSettings(settings));
    }
    return Promise.resolve(true);
  };


  // --- CLIENT-SIDE AES-256-GCM END-TO-END ENCRYPTION (E2EE) WITH KEY CACHING ---
  core.E2EE = {
    _keyCache: new Map(),

    _getSaltHex: function(saltBytes) {
      if (!saltBytes) return '';
      let hex = '';
      for (let i = 0; i < saltBytes.length; i++) {
        hex += saltBytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    },

    getKey: function(passphrase, saltBytes) {
      const self = this;
      const saltHex = this._getSaltHex(saltBytes);
      const cacheKey = passphrase + '_' + saltHex;

      if (this._keyCache.has(cacheKey)) {
        return Promise.resolve(this._keyCache.get(cacheKey));
      }

      const enc = new TextEncoder();
      return crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
      ).then(function(baseKey) {
        return crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 100000,
            hash: 'SHA-256'
          },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      }).then(function(derivedKey) {
        self._keyCache.set(cacheKey, derivedKey);
        if (self._keyCache.size > 50) {
          const firstKey = self._keyCache.keys().next().value;
          self._keyCache.delete(firstKey);
        }
        return derivedKey;
      });
    },

    encrypt: function(jsonPayload, passphrase) {
      if (!passphrase || passphrase.trim() === '') {
        return Promise.resolve(JSON.stringify(jsonPayload));
      }
      const enc = new TextEncoder();
      const plaintext = enc.encode(JSON.stringify(jsonPayload));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      return core.E2EE.getKey(passphrase, salt).then(function(key) {
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);
      }).then(function(encryptedBuffer) {
        const encryptedArr = new Uint8Array(encryptedBuffer);
        const combined = new Uint8Array(salt.length + iv.length + encryptedArr.length);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(encryptedArr, salt.length + iv.length);

        let binary = '';
        for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
        return 'ENC:' + btoa(binary);
      });
    },

    decrypt: function(cipherTextString, passphrase) {
      if (!cipherTextString) return Promise.reject(new Error('Empty ciphertext'));
      if (!cipherTextString.startsWith('ENC:')) {
        // Unencrypted payload
        try {
          return Promise.resolve(JSON.parse(cipherTextString));
        } catch (e) {
          return Promise.reject(new Error('Invalid unencrypted JSON format'));
        }
      }

      if (!passphrase || passphrase.trim() === '') {
        return Promise.reject(new Error('Passphrase required for encrypted sync file.'));
      }

      const binaryStr = atob(cipherTextString.slice(4));
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const salt = bytes.slice(0, 16);
      const iv = bytes.slice(16, 28);
      const ciphertext = bytes.slice(28);

      return core.E2EE.getKey(passphrase, salt).then(function(key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
      }).then(function(decryptedBuffer) {
        const dec = new TextDecoder();
        return JSON.parse(dec.decode(decryptedBuffer));
      });
    }
  };


  // --- SMART PAYLOAD MERGER (Conflict Resolution) ---
  core.mergeStatePayloads = function(localPayload, remotePayload) {
    if (!localPayload) return remotePayload;
    if (!remotePayload) return localPayload;

    const localDel = (localPayload && localPayload.deletedHabitIds) || [];
    const remoteDel = (remotePayload && remotePayload.deletedHabitIds) || [];
    const hasDeleted = localDel.length > 0 || remoteDel.length > 0;

    let mergedDeletedHabitIds = [];
    let deletedSet = null;

    if (hasDeleted) {
      mergedDeletedHabitIds = Array.from(new Set([...localDel, ...remoteDel]));
      deletedSet = new Set(mergedDeletedHabitIds);
    }

    const merged = {
      version: 2,
      updatedAt: Math.max(localPayload.updatedAt || 0, remotePayload.updatedAt || 0),
      selectedHabitId: localPayload.selectedHabitId || remotePayload.selectedHabitId || 'all',
      selectedYear: localPayload.selectedYear || remotePayload.selectedYear || core.CURRENT_YEAR,
      showQuickLogOnStartup: localPayload.showQuickLogOnStartup || remotePayload.showQuickLogOnStartup || false,
      deletedHabitIds: mergedDeletedHabitIds,
      habits: []
    };

    const habitMap = new Map();

    const processHabitList = function(habits, isRemote) {
      (habits || []).forEach(function(h) {
        if (!h.id) return;
        if (deletedSet && deletedSet.has(h.id)) return;
        if (!habitMap.has(h.id)) {
          habitMap.set(h.id, JSON.parse(JSON.stringify(h)));
        } else {
          const existing = habitMap.get(h.id);
          const existingUpdated = existing.updatedAt || 0;
          const incomingUpdated = h.updatedAt || 0;

          if (incomingUpdated > existingUpdated) {
            // Keep newer metadata but merge logs
            const mergedLogs = Object.assign({}, existing.logs || {}, h.logs || {});
            Object.keys(mergedLogs).forEach(function(dateKey) {
              const el = (existing.logs || {})[dateKey] || { count: 0, note: '' };
              const il = (h.logs || {})[dateKey] || { count: 0, note: '' };
              mergedLogs[dateKey] = {
                count: Math.max(el.count || 0, il.count || 0),
                note: (il.note && il.note.trim() !== '') ? il.note : el.note
              };
            });
            const updatedHabit = JSON.parse(JSON.stringify(h));
            updatedHabit.logs = mergedLogs;
            habitMap.set(h.id, updatedHabit);
          } else {
            // Merge logs into existing habit
            const mergedLogs = Object.assign({}, existing.logs || {}, h.logs || {});
            Object.keys(mergedLogs).forEach(function(dateKey) {
              const el = (existing.logs || {})[dateKey] || { count: 0, note: '' };
              const il = (h.logs || {})[dateKey] || { count: 0, note: '' };
              mergedLogs[dateKey] = {
                count: Math.max(el.count || 0, il.count || 0),
                note: (el.note && el.note.trim() !== '') ? el.note : il.note
              };
            });
            existing.logs = mergedLogs;
          }
        }
      });
    };

    processHabitList(localPayload.habits, false);
    processHabitList(remotePayload.habits, true);

    merged.habits = Array.from(habitMap.values());
    return merged;
  };

  // Sync Page Identification Helper
  core.isSyncPage = function() {
    if (typeof window === 'undefined' || !window.location) return false;
    const path = window.location.pathname || '';
    const href = window.location.href || '';
    return path.endsWith('sync.html') || href.includes('sync.html');
  };

  // Unique Client Instance Identifier for Self-Write Echo Suppression
  core.CLIENT_ID = (function() {
    if (typeof window !== 'undefined' && window.HabitualCore && window.HabitualCore.CLIENT_ID) {
      return window.HabitualCore.CLIENT_ID;
    }
    return 'cli_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  })();

  // --- UNENCRYPTED DATA HASHING (Sync Status & Messaging Optimization) ---
  core.canonicalJson = function(obj, ignoredKeys) {
    if (!ignoredKeys) ignoredKeys = ['updatedAt', 'writerId', 'ciphertext', 'lastSentCiphertext'];
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => core.canonicalJson(item, ignoredKeys)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const parts = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (ignoredKeys.includes(key)) continue;
      const val = obj[key];
      if (val === undefined) continue;
      parts.push(JSON.stringify(key) + ':' + core.canonicalJson(val, ignoredKeys));
    }
    return '{' + parts.join(',') + '}';
  };

  core.computeDataHash = function(data) {
    if (data === null || data === undefined) return '';
    const str = (typeof data === 'string') ? data : core.canonicalJson(data);
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 0x01000193);
      h2 = Math.imul(h2 ^ ch, 0x85ebca6b);
    }
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  };

  core.generateShareDocId = function() {
    try {
      if (core.SyncTargets && core.SyncTargets.Firestore && core.SyncTargets.Firestore.db) {
        return core.SyncTargets.Firestore.db.collection('share').doc().id;
      } else if (typeof firebase !== 'undefined' && firebase.firestore) {
        return firebase.firestore().collection('share').doc().id;
      }
    } catch (e) {}

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let autoId = '';
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const vals = new Uint8Array(20);
      crypto.getRandomValues(vals);
      for (let i = 0; i < 20; i++) {
        autoId += chars.charAt(vals[i] % chars.length);
      }
      return autoId;
    }
    for (let i = 0; i < 20; i++) {
      autoId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return autoId;
  };

  core.generateRandomPassword = function(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let res = '';
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const vals = new Uint8Array(length);
      crypto.getRandomValues(vals);
      for (let i = 0; i < length; i++) {
        res += chars.charAt(vals[i] % chars.length);
      }
      return res;
    }
    for (let i = 0; i < length; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  core.getPerHabitPayload = function(habit) {
    if (!habit) return null;
    const todayStr = core.getTodayKey ? core.getTodayKey() : '';
    const payload = {
      habitId: habit.id,
      updatedAt: habit.updatedAt || Date.now(),
      name: habit.name,
      type: habit.type || 'positive',
      description: habit.description || '',
      category: habit.category || 'General',
      dailyTarget: habit.dailyTarget || 1,
      frequencyType: habit.frequencyType || 'daily',
      targetDays: habit.targetDays || [1, 2, 3, 4, 5, 6, 0],
      weeklyTarget: habit.weeklyTarget || 1,
      monthlyDay: habit.monthlyDay || '1',
      monthlyTarget: habit.monthlyTarget || 1,
      colorWholeWeek: habit.colorWholeWeek !== false,
      colorWholeMonth: habit.colorWholeMonth !== false,
      customTarget: habit.customTarget || 1,
      customInterval: habit.customInterval || 3,
      customUnit: habit.customUnit || 'days',
      colorTheme: habit.colorTheme || (core.getHabitHexColor ? core.getHabitHexColor(habit) : undefined),
      showStreak: habit.showStreak,
      showCount: habit.showCount,
      showDuration: habit.showDuration,
      hideFromAll: habit.hideFromAll,
      isPaused: habit.isPaused,
      createdAt: habit.createdAt || todayStr,
      logs: habit.logs || {}
    };

    if ((!habit.sharing || habit.sharing.includeChildren !== false) && core.state && core.state.habits) {
      const descendantIds = core.getAllDescendantIds ? core.getAllDescendantIds(habit.id) : [];
      const childIds = descendantIds.filter(id => id !== habit.id);
      const childHabits = childIds.map(cid => core.state.habits.find(h => h.id === cid)).filter(Boolean);

      if (childHabits.length > 0) {
        payload.includeChildren = true;
        payload.children = childHabits.map(child => ({
          habitId: child.id,
          parentId: child.parentId,
          parentDependency: child.parentDependency || 'none',
          name: child.name,
          type: child.type || 'positive',
          description: child.description || '',
          category: child.category || 'General',
          dailyTarget: child.dailyTarget || 1,
          frequencyType: child.frequencyType || 'daily',
          targetDays: child.targetDays || [1],
          weeklyTarget: child.weeklyTarget || 1,
          monthlyDay: child.monthlyDay || '1',
          monthlyTarget: child.monthlyTarget || 1,
          colorWholeWeek: child.colorWholeWeek !== false,
          colorWholeMonth: child.colorWholeMonth !== false,
          customTarget: child.customTarget || 1,
          customInterval: child.customInterval || 3,
          customUnit: child.customUnit || 'days',
          colorTheme: child.colorTheme || (core.getHabitHexColor ? core.getHabitHexColor(child) : undefined),
          showStreak: child.showStreak,
          showCount: child.showCount,
          showDuration: child.showDuration,
          hideFromAll: child.hideFromAll,
          isPaused: child.isPaused,
          createdAt: child.createdAt || todayStr,
          logs: child.logs || {}
        }));
      }
    }

    return payload;
  };


  // --- SYNC TARGET CLIENTS (Google Drive, Dropbox, WebDAV) ---
  core.SyncTargets = {
    // --- FIRESTORE E2EE CLOUD SYNC (collection: habit_data) ---
    Firestore: {
      db: null,
      unsubscribeListener: null,
      isListening: false,
      lastUpdatedServerTime: 0,
      lastSentCiphertext: null,
      pendingSnapshotData: null,
      syncThrottleTimer: null,
      minSyncInterval: 1500,
      lastProcessedTime: 0,

      hasSyncCode: function() {
        return !!localStorage.getItem('habitual_firestore_sync_code');
      },

      getExistingSyncCode: function() {
        return (localStorage.getItem('habitual_firestore_sync_code') || '').toUpperCase().trim();
      },

      getSyncCode: function() {
        let code = localStorage.getItem('habitual_firestore_sync_code');
        if (!code) {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let rnd = 'HAB-';
          for (let i = 0; i < 6; i++) {
            rnd += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          code = rnd;
          localStorage.setItem('habitual_firestore_sync_code', code);
        }
        return code.toUpperCase().trim();
      },

      generateNewSyncCode: function() {
        let autoId = null;
        try {
          if (this.db) {
            autoId = this.db.collection('habit_data').doc().id;
          } else if (typeof firebase !== 'undefined' && firebase.firestore) {
            autoId = firebase.firestore().collection('habit_data').doc().id;
          }
        } catch (e) {
          console.warn('Firebase auto-ID generation note:', e);
        }

        if (!autoId) {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
          autoId = '';
          for (let i = 0; i < 20; i++) {
            autoId += chars.charAt(Math.floor(Math.random() * chars.length));
          }
        }

        return this.setSyncCode(autoId);
      },

      setSyncCode: function(newCode) {
        if (!newCode || !newCode.trim()) return;
        const formatted = newCode.trim();
        localStorage.setItem('habitual_firestore_sync_code', formatted);
        if (this.isListening) {
          this.stopLiveSync();
          this.startLiveSync();
        }
        return formatted;
      },

      _setupEmulatorIfRequested: function(db) {
        if (!db) return;
        try {
          const urlParams = (typeof window !== 'undefined' && window.location && window.location.search) ? new URLSearchParams(window.location.search) : null;
          const useEmul = (urlParams && urlParams.get('emulator') === 'true') ||
            (typeof localStorage !== 'undefined' && localStorage.getItem('habitual_use_firestore_emulator') === 'true');
          if (useEmul && typeof db.useEmulator === 'function' && !db._emulatorConnected) {
            const host = (urlParams && urlParams.get('emulatorHost')) || 'localhost';
            const port = parseInt((urlParams && urlParams.get('emulatorPort')) || '8080', 10);
            db.useEmulator(host, port);
            db._emulatorConnected = true;
            console.log(`🔥 Connected to Firestore Emulator at ${host}:${port}`);
          }
        } catch (e) {
          // Ignore error if emulator already connected or unsupported
        }
      },

      _enableOfflinePersistence: function(db) {
        if (!db || db._persistenceEnabled) return;
        db._persistenceEnabled = true;
        if (typeof db.enablePersistence === 'function') {
          db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
            // Ignore error if already enabled in another tab or unsupported
          });
        }
      },

      init: function() {
        if (this.db) {
          return Promise.resolve(this.db);
        }
        const self = this;
        const ensureFirebaseLibs = function() {
          if (typeof firebase !== 'undefined' && firebase.firestore) {
            return Promise.resolve();
          }
          return core.loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js')
            .then(function() {
              return core.loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js');
            });
        };

        return ensureFirebaseLibs().then(function() {
          if (!firebase.apps.length) {
            return core.loadScript('/__/firebase/init.js').catch(function() {
              if (!firebase.apps.length) {
                firebase.initializeApp({ projectId: "habitual-log" });
              }
            });
          }
        }).then(function() {
          if (!firebase.apps.length) {
            firebase.initializeApp({ projectId: "habitual-log" });
          }
          self.db = firebase.firestore();
          self._setupEmulatorIfRequested(self.db);
          self._enableOfflinePersistence(self.db);
          return self.db;
        }).catch(function(err) {
          if (typeof firebase !== 'undefined' && firebase.firestore) {
            if (!firebase.apps.length) {
              try { firebase.initializeApp({ projectId: "habitual-log" }); } catch (e) {}
            }
            self.db = firebase.firestore();
            return self.db;
          }
          return Promise.reject(err);
        });
      },

      validateChannelAccess: function(syncCodeParam, passphraseParam) {
        const self = this;
        const syncCode = syncCodeParam || this.getSyncCode();
        const passphrase = passphraseParam || core.SyncManager.settings.passphrase;

        if (!passphrase || passphrase.trim().length === 0) {
          return Promise.reject(new Error('Master Passphrase required to access channel.'));
        }

        return this.init().then(function() {
          return self.db.collection('habit_data').doc(syncCode).get();
        }).then(function(doc) {
          if (!doc || !doc.exists) {
            return { isValid: true, isNew: true, payload: null };
          }
          const data = doc.data();
          if (!data || !data.ciphertext) {
            return { isValid: true, isNew: true, payload: null };
          }
          return core.E2EE.decrypt(data.ciphertext, passphrase).then(function(payload) {
            return { isValid: true, isNew: false, payload: payload };
          }).catch(function(err) {
            const errMsg = '❌ Cannot write to channel: Existing channel data cannot be decrypted with current Master Passphrase!';
            if (core.showToast) core.showToast(errMsg, 'error');
            return Promise.reject(new Error(errMsg));
          });
        });
      },

      lastUploadedPayloadStr: null,

      uploadBackup: function(encryptedText) {
        const self = this;
        const passphrase = core.SyncManager.settings.passphrase;
        if (!passphrase) {
          return Promise.reject(new Error('E2EE Master Passphrase is required for Firestore Cloud Sync'));
        }
        const syncCode = this.getSyncCode();

        const payload = core.getPayloadFromState();
        const dataHash = core.computeDataHash(payload);

        // Check if payload content matches last uploaded payload
        if (!encryptedText) {
          const currentStr = JSON.stringify(payload.habits || []);
          if (self.lastUploadedPayloadStr && self.lastUploadedPayloadStr === currentStr) {
            return Promise.resolve(null);
          }
          self.lastUploadedPayloadStr = currentStr;
        }

        return self.init().then(function() {
          return self.db.collection('habit_data').doc(syncCode).get();
        }).then(function(doc) {
          if (doc && doc.exists && doc.data() && doc.data().ciphertext) {
            // Verify existing data can be decrypted with current passphrase
            return core.E2EE.decrypt(doc.data().ciphertext, passphrase).catch(function(e) {
              const errMsg = '❌ Cannot decrypt existing Firebase data: Passwords do not match!';
              if (core.showToast) core.showToast(errMsg, 'error');
              return Promise.reject(new Error(errMsg));
            });
          }
          return Promise.resolve(null);
        }).then(function() {
          const encryptPromise = encryptedText
            ? Promise.resolve(encryptedText)
            : core.E2EE.encrypt(payload, passphrase);

          return encryptPromise.then(function(cipher) {
            self.lastSentCiphertext = cipher;
            const serverTs = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
              ? firebase.firestore.FieldValue.serverTimestamp()
              : Date.now();
            return self.db.collection('habit_data').doc(syncCode).set({
              ciphertext: cipher,
              updatedAt: serverTs,
              hashOfdata: dataHash
            });
          });
        });
      },

      downloadBackup: function() {
        const self = this;
        const passphrase = core.SyncManager.settings.passphrase;
        if (!passphrase) return Promise.resolve(null);
        const syncCode = this.getSyncCode();

        return this.init().then(function() {
          return self.db.collection('habit_data').doc(syncCode).get();
        }).then(function(doc) {
          if (doc && doc.exists && doc.data().ciphertext) {
            return doc.data().ciphertext;
          }
          return null;
        });
      },

      startLiveSync: function() {
        if (core.isSyncPage()) return Promise.resolve(null);
        const self = this;
        const passphrase = core.SyncManager.settings.passphrase;
        if (!passphrase) return Promise.resolve(null);
        const syncCode = this.getSyncCode();

        if (this.isListening && this._activeSyncCode === syncCode && this._activePassphrase === passphrase) {
          return Promise.resolve(null);
        }

        if (this.isListening) {
          this.stopLiveSync();
        }

        this._activeSyncCode = syncCode;
        this._activePassphrase = passphrase;

        return this.init().then(function() {
          self.isListening = true;
          self.unsubscribeListener = self.db.collection('habit_data').doc(syncCode)
            .onSnapshot(function(doc) {
              if (!doc.exists) return;
              if (doc.metadata && doc.metadata.hasPendingWrites) return;

              const data = doc.data();
              if (!data || !data.ciphertext) return;

              // Check if unencrypted data hash matches local state to suppress re-decryption
              const remoteHash = data.hashOfdata || data.hashOfData || data.dataHash || data.data_hash || data.hash;
              if (remoteHash) {
                const localPayload = core.getPayloadFromState();
                const localHash = core.computeDataHash(localPayload);
                if (localHash === remoteHash) return;
              } else if (data.writerId && data.writerId === core.CLIENT_ID) {
                return;
              }

              if (data.ciphertext === self.lastSentCiphertext) return;

              if (data.updatedAt && data.updatedAt.toMillis && data.updatedAt.toMillis() < self.lastUpdatedServerTime) {
                return;
              }
              if (data.updatedAt && data.updatedAt.toMillis) {
                self.lastUpdatedServerTime = data.updatedAt.toMillis();
              }

              // Queue snapshot for rate-limited / throttled processing
              self.pendingSnapshotData = data;
              self._scheduleThrottledSync(passphrase);
            }, function(err) {
              console.warn('Firestore Live Snapshot Error:', err);
            });
        });
      },

      _scheduleThrottledSync: function(passphrase) {
        const self = this;
        if (this.syncThrottleTimer) return;

        const now = Date.now();
        const elapsed = now - this.lastProcessedTime;
        const delay = Math.max(0, this.minSyncInterval - elapsed);

        this.syncThrottleTimer = setTimeout(function() {
          self.syncThrottleTimer = null;
          self.lastProcessedTime = Date.now();

          const data = self.pendingSnapshotData;
          self.pendingSnapshotData = null;
          if (!data || !data.ciphertext) return;

          core.E2EE.decrypt(data.ciphertext, passphrase).then(function(remotePayload) {
            if (!remotePayload) return;

            const remoteHash = data.hashOfdata || data.hashOfData || data.dataHash || data.data_hash || data.hash;
            const remoteTs = (data.updatedAt && data.updatedAt.toMillis) ? data.updatedAt.toMillis() : Date.now();
            const snapshotAgeMs = Math.max(0, Date.now() - remoteTs);

            if (!core.state.remoteHashHistory) core.state.remoteHashHistory = [];
            if (remoteHash && !core.state.remoteHashHistory.some(x => x.hash === remoteHash)) {
              core.state.remoteHashHistory.unshift({
                hash: remoteHash,
                timestamp: remoteTs,
                ageMs: snapshotAgeMs
              });
              core.state.remoteHashHistory = core.state.remoteHashHistory.slice(0, 30);
            }

            const localPayload = core.getPayloadFromState();
            const merged = core.mergeStatePayloads(localPayload, remotePayload);

            const currentStr = JSON.stringify(localPayload.habits || []);
            const mergedStr = JSON.stringify(merged.habits || []);

            core.applyPayloadToState(merged);
            core.saveState(true);
            if (core.renderAll) core.renderAll();

            if (currentStr !== mergedStr && core.showToast) {
              core.showToast('⚡ Encrypted Firestore Live Sync Received!', 'info');
            }
          }).catch(function(e) {
            console.warn('Firestore Decrypt Error (wrong passphrase?):', e);
            if (core.showToast) {
              core.showToast('❌ Unable to decrypt Firebase data: Passwords do not match.', 'error');
            }
          });
        }, delay);
      },

      stopLiveSync: function() {
        if (this.unsubscribeListener) {
          this.unsubscribeListener();
          this.unsubscribeListener = null;
        }
        if (this.syncThrottleTimer) {
          clearTimeout(this.syncThrottleTimer);
          this.syncThrottleTimer = null;
        }
        this.pendingSnapshotData = null;
        this.isListening = false;
      },

      perHabitListeners: {},

      startPerHabitLiveSync: function(habit) {
        if (!habit || !habit.sharing || !habit.sharing.enabled) return Promise.resolve(null);
        const docId = String(habit.sharing.docId || habit.sharing.collection || '').trim();
        const passphrase = String(habit.sharing.password || '').trim();
        if (!docId || !passphrase) return Promise.resolve(null);
        const self = this;
        const habitId = habit.id;

        if (self.perHabitListeners[habitId]) {
          self.perHabitListeners[habitId]();
          delete self.perHabitListeners[habitId];
        }

        return self.init().then(function() {
          const unsub = self.db.collection('share').doc(docId)
            .onSnapshot(function(doc) {
              if (!doc.exists) return;
              if (doc.metadata && doc.metadata.hasPendingWrites) return;

              const data = doc.data();
              if (!data || !data.ciphertext) return;

              const targetHabit = core.state.habits.find(h => (h.sharing && (h.sharing.docId === docId || h.sharing.collection === docId)) || h.id === habitId);
              const remoteHash = data.hashOfdata || data.hashOfData || data.dataHash || data.data_hash || data.hash;

              if (remoteHash && targetHabit) {
                const localPayload = core.getPerHabitPayload(targetHabit);
                const localHash = core.computeDataHash(localPayload);
                if (localHash === remoteHash) return;
              } else if (data.writerId && data.writerId === core.CLIENT_ID) {
                return;
              }

              core.E2EE.decrypt(data.ciphertext, passphrase).then(function(remoteHabit) {
                if (!remoteHabit) return;
                const targetHabit = core.state.habits.find(h => (h.sharing && (h.sharing.docId === docId || h.sharing.collection === docId)) || h.id === habitId);
                if (!targetHabit) return;

                let updated = false;

                // 1. Synchronize Metadata & Display Settings on Parent Habit
                const metaFields = [
                  'name', 'type', 'description', 'category', 'dailyTarget', 'frequencyType',
                  'weeklyTarget', 'monthlyDay', 'monthlyTarget', 'customTarget', 'customInterval', 'customUnit',
                  'colorWholeWeek', 'colorWholeMonth', 'showStreak', 'showCount', 'showDuration',
                  'hideFromAll', 'isPaused', 'hideHeatmapWhenPaused', 'hideHeatmap'
                ];

                metaFields.forEach(field => {
                  if (remoteHabit[field] !== undefined && remoteHabit[field] !== targetHabit[field]) {
                    targetHabit[field] = remoteHabit[field];
                    updated = true;
                  }
                });

                if (remoteHabit.colorTheme && remoteHabit.colorTheme !== targetHabit.colorTheme) {
                  targetHabit.colorTheme = remoteHabit.colorTheme;
                  updated = true;
                }

                if (remoteHabit.targetDays && Array.isArray(remoteHabit.targetDays)) {
                  const currDays = targetHabit.targetDays || [];
                  if (currDays.length !== remoteHabit.targetDays.length || !currDays.every((v, i) => v === remoteHabit.targetDays[i])) {
                    targetHabit.targetDays = remoteHabit.targetDays;
                    updated = true;
                  }
                }

                // 2. Synchronize Check-In Logs on Parent Habit
                if (remoteHabit.logs) {
                  if (!targetHabit.logs) targetHabit.logs = {};
                  Object.keys(remoteHabit.logs).forEach(dateKey => {
                    const rLog = remoteHabit.logs[dateKey];
                    const lLog = targetHabit.logs[dateKey];
                    if (!rLog) return;

                    if (!lLog) {
                      targetHabit.logs[dateKey] = { count: rLog.count || 0, note: rLog.note || '' };
                      if (rLog.unverified) targetHabit.logs[dateKey].unverified = true;
                      updated = true;
                    } else {
                      const newCount = Math.max(lLog.count || 0, rLog.count || 0);
                      const newNote = (rLog.note && rLog.note.trim() !== '') ? rLog.note : (lLog.note || '');
                      const newUnverified = Boolean(lLog.unverified || rLog.unverified);
                      if (lLog.count !== newCount || (lLog.note || '') !== newNote || Boolean(lLog.unverified) !== newUnverified) {
                        targetHabit.logs[dateKey] = { count: newCount, note: newNote };
                        if (newUnverified) targetHabit.logs[dateKey].unverified = true;
                        updated = true;
                      }
                    }
                  });
                }

                // 3. Synchronize Sub-Habits (Children) Metadata, Settings & Logs
                if (remoteHabit.children && Array.isArray(remoteHabit.children)) {
                  remoteHabit.children.forEach(cData => {
                    let childHabit = core.state.habits.find(h => h.id === cData.habitId || (h.parentId === targetHabit.id && h.name === cData.name));
                    if (!childHabit) {
                      childHabit = {
                        id: cData.habitId || (targetHabit.id + '_' + core.idFromName(cData.name)),
                        name: cData.name,
                        type: cData.type || 'positive',
                        description: cData.description || '',
                        category: cData.category || 'General',
                        dailyTarget: cData.dailyTarget || 1,
                        frequencyType: cData.frequencyType || 'daily',
                        targetDays: cData.targetDays || [1, 2, 3, 4, 5, 6, 0],
                        weeklyTarget: cData.weeklyTarget || 1,
                        monthlyDay: cData.monthlyDay || '1',
                        monthlyTarget: cData.monthlyTarget || 1,
                        colorWholeWeek: cData.colorWholeWeek !== false,
                        colorWholeMonth: cData.colorWholeMonth !== false,
                        customTarget: cData.customTarget || 1,
                        customInterval: cData.customInterval || 3,
                        customUnit: cData.customUnit || 'days',
                        colorTheme: cData.colorTheme,
                        showStreak: cData.showStreak,
                        showCount: cData.showCount,
                        showDuration: cData.showDuration,
                        hideFromAll: cData.hideFromAll,
                        isPaused: cData.isPaused,
                        parentId: targetHabit.id,
                        parentDependency: cData.parentDependency || 'none',
                        createdAt: cData.createdAt || core.getTodayKey(),
                        logs: cData.logs || {}
                      };
                      core.state.habits.push(childHabit);
                      updated = true;
                    } else {
                      metaFields.forEach(field => {
                        if (cData[field] !== undefined && cData[field] !== childHabit[field]) {
                          childHabit[field] = cData[field];
                          updated = true;
                        }
                      });

                      if (cData.colorTheme && cData.colorTheme !== childHabit.colorTheme) {
                        childHabit.colorTheme = cData.colorTheme;
                        updated = true;
                      }

                      if (!childHabit.logs) childHabit.logs = {};
                      if (cData.logs) {
                        Object.keys(cData.logs).forEach(dateKey => {
                          const rLog = cData.logs[dateKey];
                          const lLog = childHabit.logs[dateKey];
                          if (!rLog) return;

                          if (!lLog) {
                            childHabit.logs[dateKey] = { count: rLog.count || 0, note: rLog.note || '' };
                            if (rLog.unverified) childHabit.logs[dateKey].unverified = true;
                            updated = true;
                          } else {
                            const newCount = Math.max(lLog.count || 0, rLog.count || 0);
                            const newNote = (rLog.note && rLog.note.trim() !== '') ? rLog.note : (lLog.note || '');
                            const newUnverified = Boolean(lLog.unverified || rLog.unverified);
                            if (lLog.count !== newCount || (lLog.note || '') !== newNote || Boolean(lLog.unverified) !== newUnverified) {
                              childHabit.logs[dateKey] = { count: newCount, note: newNote };
                              if (newUnverified) childHabit.logs[dateKey].unverified = true;
                              updated = true;
                            }
                          }
                        });
                      }
                    }
                  });
                }

                if (updated) {
                  targetHabit.updatedAt = remoteHabit.updatedAt || ((data.updatedAt && data.updatedAt.toMillis) ? data.updatedAt.toMillis() : Date.now());
                  core.saveState(true);
                  if (core.renderAll) core.renderAll();
                  if (core.showToast) core.showToast(`⚡ Shared habit "${targetHabit.name}" updated!`, 'info');
                }
              }).catch(function(e) {
                console.warn('Per-habit Firestore decrypt error:', e);
              });
            }, function(err) {
              console.warn('Per-habit Firestore snapshot error:', err);
            });

          self.perHabitListeners[habitId] = unsub;
        }).catch(function(e) {
          console.warn('Per-habit Firestore init error:', e);
        });
      },

      uploadPerHabitBackup: function(habit) {
        if (!habit || !habit.sharing || !habit.sharing.enabled) return Promise.resolve(null);
        const docId = String(habit.sharing.docId || habit.sharing.collection || '').trim();
        const passphrase = String(habit.sharing.password || '').trim();
        if (!docId || !passphrase) return Promise.resolve(null);

        const self = this;
        const payload = core.getPerHabitPayload(habit);
        const dataHash = core.computeDataHash(payload);

        return self.init().then(function() {
          return core.E2EE.encrypt(payload, passphrase);
        }).then(function(cipher) {
          const serverTs = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
            ? firebase.firestore.FieldValue.serverTimestamp()
            : Date.now();
          return self.db.collection('share').doc(docId).set({
            ciphertext: cipher,
            updatedAt: serverTs,
            hashOfdata: dataHash
          });
        }).catch(function(e) {
          console.warn('Upload per-habit backup error:', e);
          const errMsg = e && e.message ? e.message : String(e);
          if (core.showToast) {
            core.showToast('❌ Firestore Upload Error: ' + errMsg, 'error');
          }
          return Promise.reject(e);
        });
      },

      downloadPerHabitBackup: function(docIdParam, passphrase) {
        if (!docIdParam || !passphrase) return Promise.resolve(null);
        const self = this;
        const docId = String(docIdParam).trim();
        const pwd = String(passphrase).trim();

        return self.init().then(function() {
          return self.db.collection('share').doc(docId).get();
        }).then(function(doc) {
          if (!doc || !doc.exists || !doc.data() || !doc.data().ciphertext) return null;
          return core.E2EE.decrypt(doc.data().ciphertext, pwd);
        }).catch(function(err) {
          console.warn('Error downloading per-habit backup:', err);
          return Promise.reject(err);
        });
      },

      stopPerHabitLiveSync: function(habitId) {
        if (this.perHabitListeners && this.perHabitListeners[habitId]) {
          this.perHabitListeners[habitId]();
          delete this.perHabitListeners[habitId];
        }
      },

      startAllPerHabitLiveSyncs: function() {
        const self = this;
        if (!core.state || !core.state.habits) return;
        core.state.habits.forEach(h => {
          if (h.sharing && h.sharing.enabled) {
            self.startPerHabitLiveSync(h);
          }
        });
      },

      syncAllSharedHabits: function() {
        const self = this;
        if (!core.state || !core.state.habits) return;
        core.state.habits.forEach(h => {
          if (h.sharing && h.sharing.enabled) {
            self.uploadPerHabitBackup(h);
          }
        });
      }
    }
  };

  // --- BACKGROUND WORKER & VERSION POLLING ---
  let backgroundWorker = null;

  core.initBackgroundWorker = function() {
    if (window.Worker && !backgroundWorker) {
      try {
        backgroundWorker = new Worker('js/sync.worker.js');
        const backgroundSync = core.state && core.state.backgroundSync ? true : false;
        const syncCode = (core.SyncManager && core.SyncManager.settings) ? core.SyncManager.settings.collection : null;
        const passphrase = (core.SyncManager && core.SyncManager.settings) ? core.SyncManager.settings.passphrase : null;

        backgroundWorker.postMessage({
          type: 'INIT',
          data: {
            backgroundSync: backgroundSync,
            syncCode: syncCode,
            passphrase: passphrase,
            version: '1.21.22'
          }
        });

        backgroundWorker.onmessage = function(e) {
          const { type, version } = e.data || {};
          if (type === 'VERSION_UPDATE_AVAILABLE') {
            if (core.showToast) {
              core.showToast(`New version v${version} available! Refresh to update.`);
            }
          } else if (type === 'PERFORM_SYNC_REQUEST') {
            if (core.SyncManager && typeof core.SyncManager.pullRemoteSnapshot === 'function') {
              core.SyncManager.pullRemoteSnapshot();
            }
          }
        };
      } catch (err) {
        // Fallback gracefully
      }
    }
  };

  core.setBackgroundSync = function(enabled) {
    if (!core.state) core.state = {};
    core.state.backgroundSync = Boolean(enabled);
    if (core.saveState) core.saveState();
    if (backgroundWorker) {
      backgroundWorker.postMessage({
        type: 'SET_BACKGROUND_SYNC',
        data: { enabled: core.state.backgroundSync }
      });
    }
    if (core.showToast) {
      core.showToast(`Background sync ${core.state.backgroundSync ? 'enabled' : 'disabled'}.`);
    }
  };


  // --- SYNC MANAGER ORCHESTRATOR ---
  core.SyncManager = {
    settings: {
      enabledTargets: JSON.parse(localStorage.getItem('habitual_sync_targets') || '[]'),
      passphrase: localStorage.getItem('habitual_sync_passphrase') || ''
    },

    isTargetEnabled: function(targetName) {
      return this.settings.enabledTargets.includes(targetName);
    },

    postToFirestoreIfReady: function() {
      if (!this.isTargetEnabled('firestore') || !this.settings.passphrase) {
        return Promise.resolve(null);
      }
      const syncCode = core.SyncTargets.Firestore.getSyncCode();
      if (!syncCode) {
        return Promise.resolve(null);
      }
      if (core.showToast) core.showToast('⏳ Syncing data to Firestore cloud...', 'info');
      return core.SyncTargets.Firestore.uploadBackup().then(function(res) {
        if (core.showToast) core.showToast('🔥 Firestore Cloud Sync Complete!', 'success');
        return res;
      }).catch(function(err) {
        console.warn('Firestore sync upload error:', err);
        const errMsg = err && err.message ? err.message : String(err);
        if (core.showToast) core.showToast('❌ Firestore Sync Error: ' + errMsg, 'error');
        return null;
      });
    },

    toggleTarget: function(targetName, enable) {
      const idx = this.settings.enabledTargets.indexOf(targetName);
      if (enable && idx === -1) {
        this.settings.enabledTargets.push(targetName);
      } else if (!enable && idx !== -1) {
        this.settings.enabledTargets.splice(idx, 1);
      }
      localStorage.setItem('habitual_sync_targets', JSON.stringify(this.settings.enabledTargets));

      if (targetName === 'firestore') {
        if (enable && this.settings.passphrase) {
          if (!core.isSyncPage()) {
            core.SyncTargets.Firestore.startLiveSync();
          }
          if (core.state.habits && core.state.habits.length > 0) {
            this.postToFirestoreIfReady();
          }
        } else {
          core.SyncTargets.Firestore.stopLiveSync();
        }
      }
    },

    updatePassphrase: function(newPassphrase) {
      const self = this;
      const trimmedNew = (newPassphrase || '').trim();

      if (!trimmedNew) {
        const err = new Error('⚠️ Passphrase cannot be empty.');
        if (core.showToast) core.showToast(err.message, 'warning');
        return Promise.reject(err);
      }

      // Step 1: Compute canonical hash of current local payload before changing passphrase
      const payload = core.getPayloadFromState();
      const oldDataHash = core.computeDataHash(payload);

      // Step 2: Re-encrypt payload using new passphrase
      return core.E2EE.encrypt(payload, trimmedNew).then(function(newCipher) {
        // Step 3: Decrypt newly generated ciphertext with new passphrase to verify hash consistency
        return core.E2EE.decrypt(newCipher, trimmedNew).then(function(decryptedPayload) {
          const newDataHash = core.computeDataHash(decryptedPayload);

          if (oldDataHash !== newDataHash) {
            const hashErr = new Error('❌ Passphrase update aborted: Data hash mismatch after re-encryption!');
            if (core.showToast) core.showToast(hashErr.message, 'error');
            return Promise.reject(hashErr);
          }

          // Step 4: Hashes match! Update stored passphrase and clear cached E2EE keys
          self.settings.passphrase = trimmedNew;
          localStorage.setItem('habitual_sync_passphrase', trimmedNew);
          if (core.E2EE && core.E2EE._keyCache) {
            core.E2EE._keyCache.clear();
          }

          // Step 5: Write re-encrypted backup to Firestore if sync enabled
          if (self.isTargetEnabled('firestore')) {
            core.SyncTargets.Firestore.stopLiveSync();
            return core.SyncTargets.Firestore.uploadBackup(newCipher).then(function() {
              if (!core.isSyncPage()) {
                core.SyncTargets.Firestore.startLiveSync();
              }
              if (core.showToast) core.showToast('🔑 Master Passphrase updated and verified across sync targets!', 'success');
              return true;
            });
          } else {
            if (core.showToast) core.showToast('🔑 Master Passphrase updated and verified locally!', 'success');
            return Promise.resolve(true);
          }
        });
      });
    },

    setPassphrase: function(passphrase) {
      return this.updatePassphrase(passphrase);
    },

    _broadcastTimer: null,

    broadcastWriteDebounced: function(customPayload, delay) {
      const self = this;
      const waitTime = typeof delay === 'number' ? delay : 600;
      if (this._broadcastTimer) clearTimeout(this._broadcastTimer);
      this._broadcastTimer = setTimeout(function() {
        self._broadcastTimer = null;
        self.broadcastWrite(core.getPayloadFromState());
      }, waitTime);
    },

    broadcastWrite: function(payload) {
      const self = this;
      if (this.settings.enabledTargets.length === 0) return;

      core.E2EE.encrypt(payload, this.settings.passphrase).then(function(encrypted) {
        if (self.isTargetEnabled('firestore')) {
          core.SyncTargets.Firestore.uploadBackup(encrypted).catch(e => console.warn('Firestore Sync Error:', e));
        }
      }).catch(function(err) {
        console.error('Failed to encrypt write payload:', err);
      });
    },

    pullAndMergeAll: function() {
      const self = this;
      const activeTargets = this.settings.enabledTargets;
      if (activeTargets.length === 0) {
        return Promise.resolve({ merged: false, message: 'No sync targets enabled' });
      }

      const pulls = [];
      let firestoreIdx = -1;
      if (this.isTargetEnabled('firestore')) {
        firestoreIdx = pulls.length;
        pulls.push(core.SyncTargets.Firestore.downloadBackup().catch(e => null));
      }

      return Promise.all(pulls).then(function(rawCiphertexts) {
        let firestoreDecryptFailed = false;
        const decryptPromises = rawCiphertexts.map(function(cipherText, idx) {
          if (!cipherText) return Promise.resolve(null);
          return core.E2EE.decrypt(cipherText, self.settings.passphrase).catch(function(err) {
            if (idx === firestoreIdx) {
              firestoreDecryptFailed = true;
            }
            return null;
          });
        });

        return Promise.all(decryptPromises).then(function(remotePayloads) {
          return {
            remotePayloads: remotePayloads,
            firestoreDecryptFailed: firestoreDecryptFailed,
            firestoreHadData: firestoreIdx !== -1 && !!rawCiphertexts[firestoreIdx]
          };
        });
      }).then(function(res) {
        if (res.firestoreDecryptFailed) {
          const errMsg = '❌ Unable to decrypt Firebase data: Passwords do not match.';
          if (core.showToast) core.showToast(errMsg, 'error');
          return { merged: false, error: 'DECRYPT_FAILED', message: errMsg };
        }

        const validPayloads = res.remotePayloads.filter(Boolean);
        if (validPayloads.length === 0) {
          return { merged: false, message: 'No remote sync files found' };
        }

        let mergedPayload = core.getPayloadFromState();
        validPayloads.forEach(function(remote) {
          mergedPayload = core.mergeStatePayloads(mergedPayload, remote);
        });

        core.applyPayloadToState(mergedPayload);
        core.saveState();
        if (core.renderAll) core.renderAll();
        if (core.showToast) core.showToast('Data synchronized across active targets!');
        return { merged: true, payload: mergedPayload };
      });
    }
  };


  // --- PARSE & EXPORT HELPERS ---
  core.parseCSVLine = function(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        if (inQuotes && line[i + 1] === char) {
          current += char; i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim()); current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  core.parseCSVAndImport = function(csvText, sourceName = 'CSV') {
    if (!csvText) return;
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) { alert('CSV file appears empty or missing rows.'); return; }

    const header = core.parseCSVLine(lines[0]);
    if (header.length < 2) { alert('Invalid CSV header structure.'); return; }

    const colHabitMap = [];
    let unnamedCount = 1;

    for (let c = 1; c < header.length; c++) {
      let rawName = header[c].trim();
      if (!rawName) rawName = `Activity Column ${unnamedCount++}`;
      let existing = core.state.habits.find(h => h.name.toLowerCase() === rawName.toLowerCase());

      if (!existing) {
        const lowerName = rawName.toLowerCase();
        const isNegative = lowerName.includes('days since') || lowerName.includes('quit') || lowerName.includes('stop') || lowerName.startsWith('no ') || lowerName.includes('avoid');
        const themeColor = core.COLOR_PALETTE[core.state.habits.length % core.COLOR_PALETTE.length];
        existing = {
          id: 'habit_' + Date.now() + '_' + c,
          name: rawName,
          description: isNegative ? 'Quit habit goal' : 'Build habit goal',
          category: isNegative ? 'Wellness' : 'General',
          type: isNegative ? 'negative' : 'positive',
          colorTheme: themeColor,
          dailyTarget: 1,
          parentId: null,
          createdAt: core.getTodayKey(),
          updatedAt: Date.now(),
          logs: {}
        };
        core.state.habits.push(existing);
      }
      colHabitMap[c] = existing;
    }

    let logsImportedCount = 0;
    const yearsFound = new Set();

    for (let i = 1; i < lines.length; i++) {
      const row = core.parseCSVLine(lines[i]);
      if (row.length === 0) continue;
      const rawDate = row[0];
      const isoDate = core.parseFlexibleDate(rawDate);
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
            count = 1; note = 'Reset';
          } else {
            count = 1; note = val;
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
      core.state.selectedYear = sortedYears[0];
    }

    core.saveState();
    if (core.renderAll) core.renderAll();
    if (core.showToast) core.showToast(`Imported ${colHabitMap.length - 1} habits and ${logsImportedCount} check-in logs from ${sourceName}!`);
  };

  core.exportDataJSON = function() {
    const payload = core.getPayloadFromState();
    const jsonStr = JSON.stringify(payload, null, 2);
    const fileName = `habitual_backup_${core.getTodayKey()}.json`;

    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', url);
      downloadAnchor.setAttribute('download', fileName);
      downloadAnchor.style.display = 'none';
      (document.body || document.documentElement).appendChild(downloadAnchor);
      downloadAnchor.click();
      setTimeout(function() {
        if (downloadAnchor.parentNode) {
          downloadAnchor.parentNode.removeChild(downloadAnchor);
        }
        URL.revokeObjectURL(url);
      }, 500);
    } else {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(jsonStr);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', fileName);
      (document.body || document.documentElement).appendChild(downloadAnchor);
      downloadAnchor.click();
      if (downloadAnchor.parentNode) {
        downloadAnchor.parentNode.removeChild(downloadAnchor);
      }
    }
  };

  core.importDataJSON = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported && (Array.isArray(imported.habits) || imported.habits)) {
          core.applyPayloadToState(imported);
          core.saveState();
          if (core.renderAll) core.renderAll();
          if (core.showToast) core.showToast('JSON Backup restored successfully!');
          if (core.elements && core.elements.modalData) core.elements.modalData.classList.add('hidden');
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Failed to parse backup JSON file.');
      }
    };
    reader.readAsText(file);
  };

  // Page Visibility Gating: Pause live sync when page is hidden
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        if (core.SyncTargets && core.SyncTargets.Firestore) {
          core.SyncTargets.Firestore.stopLiveSync();
        }
      } else {
        if (!core.isSyncPage() && core.SyncManager && core.SyncManager.isTargetEnabled('firestore') && core.SyncManager.settings.passphrase) {
          core.SyncTargets.Firestore.startLiveSync();
        }
      }
    });
  }

  // Online Reconnection Handler: Trigger sync when coming back online
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', function() {
      console.log('⚡ Network connection restored. Syncing pending offline updates with Firestore...');
      if (!core.isSyncPage() && core.SyncManager && core.SyncManager.isTargetEnabled('firestore')) {
        core.SyncManager.postToFirestoreIfReady();
      }
    });
  }

  // Auto-start Firestore Live Sync if enabled, passphrase set, and not on sync.html page
  setTimeout(function() {
    if (!core.isSyncPage() && core.SyncManager && core.SyncManager.isTargetEnabled('firestore') && core.SyncManager.settings.passphrase) {
      core.SyncTargets.Firestore.startLiveSync();
    }
    if (!core.isSyncPage() && core.SyncTargets && core.SyncTargets.Firestore) {
      core.SyncTargets.Firestore.startAllPerHabitLiveSyncs();
    }
  }, 500);

})(window.HabitualCore);
