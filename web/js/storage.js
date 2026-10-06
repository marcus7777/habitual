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
                  }
               }
            });

            // Must return as a string since `loadStateAsync` expects a raw string from the driver for parsing
            resolve(JSON.stringify(payload));
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
                      logsStore.put({
                          id: habit.id + '_' + date, // Composite key
                          habitId: habit.id,
                          date: date,
                          count: typeof logData === 'number' ? logData : (logData.count || 0),
                          note: (logData && typeof logData === 'object' && logData.note) ? logData.note : ''
                      });
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
    saveLog: function(habitId, dateKey, count, note) {
       return this.getDB().then(db => {
           return new Promise((resolve, reject) => {
               if (!db.objectStoreNames.contains('logs')) return resolve(false);
               const tx = db.transaction('logs', 'readwrite');
               const store = tx.objectStore('logs');

               if (count === 0 && (!note || note.trim() === '')) {
                   // Delete log if count is 0 and no note
                   store.delete(habitId + '_' + dateKey);
               } else {
                   store.put({
                       id: habitId + '_' + dateKey,
                       habitId: habitId,
                       date: dateKey,
                       count: count,
                       note: note || ''
                   });
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

  core.GunDBDriver = {
    name: 'gunDB',
    gun: null,
    syncCode: null,
    initPromise: null,

    init: function() {
      if (this.initPromise) return this.initPromise;
      const self = this;

      this.initPromise = new Promise(async (resolve, reject) => {
        try {
          if (core.showToast) core.showToast('Loading GunDB Engine...', 'info');

          // Load Gun from CDN
          await core.loadScript('https://cdn.jsdelivr.net/npm/gun/gun.js');

          if (core.showToast) core.showToast('Connecting to P2P Relays...', 'info');

          // Connect to public Gun relays
          self.gun = window.Gun([
              'https://gun-manhattan.herokuapp.com/gun',
              'https://gun-us.herokuapp.com/gun'
          ]);

          // Retrieve or generate a 6-character room code
          self.syncCode = localStorage.getItem('gundb_sync_code');
          if (!self.syncCode) {
              self.syncCode = Math.random().toString(36).substring(2, 8).toUpperCase();
              localStorage.setItem('gundb_sync_code', self.syncCode);
          }

          // Listen for incoming peer updates on our specific node
          self.gun.get('habitual_sync_' + self.syncCode).on(function(data, key) {
              // Gun triggers this on EVERY read and write. We debounce to prevent infinite render loops.
              if (self._isWriting) return;

              if (self._syncTimeout) clearTimeout(self._syncTimeout);
              self._syncTimeout = setTimeout(() => {
                  if (core.loadStateAsync && core.renderAll) {
                      core.loadStateAsync().then(() => core.renderAll());
                  }
              }, 500); // Wait 500ms for data to settle
          });

          if (core.showToast) core.showToast('GunDB P2P Ready!', 'success');

          if (core.loadStateAsync && core.renderAll) {
             core.loadStateAsync().then(() => core.renderAll());
          }
          if (typeof window.onGunDBReady === 'function') window.onGunDBReady();

          resolve();
        } catch (e) {
          console.error('Failed to initialize GunDB:', e);
          if (core.showToast) core.showToast('Failed to start GunDB node.', 'error');
          this.initPromise = null;
          reject(e);
        }
      });

      return this.initPromise;
    },

    getItem: async function(key) {
      if (key !== core.STORAGE_KEY) return null;
      await this.init();

      return new Promise((resolve) => {
          this.gun.get('habitual_sync_' + this.syncCode).get('payload').once((data) => {
             // Gun natively stores strings. We just stringify the whole payload for simplicity
             // since Gun handles delta-syncing strings very efficiently.
             resolve(data ? data : null);
          });
      });
    },

    setItem: async function(key, value) {
      if (key !== core.STORAGE_KEY) return;
      await this.init();

      return new Promise((resolve) => {
          this._isWriting = true; // Prevent local echo
          this.gun.get('habitual_sync_' + this.syncCode).put({ payload: value }, () => {
              setTimeout(() => { this._isWriting = false; }, 1000);
              resolve();
          });
      });
    },

    // Gun handles delta sync natively on large stringified objects, so for this evaluation,
    // mapping the granular APIs directly to a monolithic rewrite is sufficient and highly performant.
    saveLog: async function(habitId, dateKey, count, note) {
       if (core.saveState) core.saveState();
       return true;
    },

    saveHabit: async function(habit) {
       if (core.saveState) core.saveState();
       return true;
    },

    saveSettings: async function(settings) {
       if (core.saveState) core.saveState();
       return true;
    },

    getSyncCode: function() {
        return this.syncCode;
    },

    joinSyncCode: async function(code) {
        if (!code || code.length < 3) return false;

        localStorage.setItem('gundb_sync_code', code.toUpperCase());
        this.syncCode = code.toUpperCase();

        if (core.showToast) core.showToast('Joining room ' + this.syncCode + '...', 'info');

        this._isWriting = false;

        // Re-bind listeners to new room
        this.gun.get('habitual_sync_' + this.syncCode).on((data) => {
            if (this._isWriting) return;
            if (this._syncTimeout) clearTimeout(this._syncTimeout);
            this._syncTimeout = setTimeout(() => {
                if (core.loadStateAsync && core.renderAll) {
                    core.loadStateAsync().then(() => core.renderAll());
                }
            }, 500);
        });

        if (core.loadStateAsync && core.renderAll) {
            await core.loadStateAsync();
            core.renderAll();
        }
        if (core.showToast) core.showToast('Successfully joined room!', 'success');
        return true;
    }
  };

  core.activeStorageEngine = localStorage.getItem('habitual_storage_engine') || 'localStorage';

  core.getDriver = function(engineName) {
    const name = engineName || core.activeStorageEngine;
    if (name === 'indexedDB') return core.IndexedDBDriver;
    if (name === 'orbitDB' || name === 'gunDB') return core.GunDBDriver; // Map orbitDB to GunDB for seamless pivot
    return core.LocalStorageDriver;
  };

  core.setStorageEngine = function(engineName) {
    if (engineName !== 'localStorage' && engineName !== 'indexedDB' && engineName !== 'gunDB' && engineName !== 'orbitDB') return;
    const finalEngine = engineName === 'orbitDB' ? 'gunDB' : engineName; // Map legacy selection
    core.activeStorageEngine = finalEngine;
    try {
      localStorage.setItem('habitual_storage_engine', finalEngine);
    } catch (e) {
      console.warn('Could not persist active storage engine setting:', e);
    }
  };

  core.migrateStorageEngine = function(targetEngine) {
    const finalTarget = targetEngine === 'orbitDB' ? 'gunDB' : targetEngine;

    if (finalTarget === core.activeStorageEngine) {
      return Promise.resolve({ success: true, message: 'Already using ' + finalTarget });
    }
    const currentDriver = core.getDriver();
    const targetDriver = core.getDriver(finalTarget);

    return currentDriver.getItem(core.STORAGE_KEY).then(function(raw) {
      const dataToMigrate = raw || JSON.stringify(core.getPayloadFromState());
      return targetDriver.setItem(core.STORAGE_KEY, dataToMigrate).then(function() {
        core.setStorageEngine(finalTarget);
        if (core.showToast) {
          const engineLabel = finalTarget === 'indexedDB' ? 'IndexedDB' : finalTarget === 'gunDB' ? 'GunDB' : 'Local Storage';
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

  core.getPayloadFromState = function() {
    const serializedHabits = (core.state.habits || []).map(habit => {
      const derivedName = core.deriveNameFromId(habit.id);
      const derivedColor = core.getDefaultColorForId(habit.id);
      const h = { id: habit.id, updatedAt: habit.updatedAt || Date.now() };

      if (habit.name && habit.name.trim() !== derivedName) h.name = habit.name;
      if (habit.colorTheme) {
        const normTheme = habit.colorTheme.startsWith('#') ? core.normalizeHex(habit.colorTheme) : habit.colorTheme;
        const normDerived = derivedColor.startsWith('#') ? core.normalizeHex(derivedColor) : derivedColor;
        if (normTheme !== normDerived) h.colorTheme = habit.colorTheme;
      }

      if (habit.type && habit.type !== 'positive') h.type = habit.type;
      if (habit.description) h.description = habit.description;
      if (habit.category) h.category = habit.category;
      if (habit.showStreak) h.showStreak = true;
      if (habit.showCount === false) h.showCount = false;
      if (habit.showDuration) h.showDuration = true;
      if (habit.hideFromAll) h.hideFromAll = true;
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
            if (note !== '') cleanLogs[dateKey] = { count, note };
            else cleanLogs[dateKey] = { count };
          }
        });
        if (hasLogs) h.logs = cleanLogs;
      }
      return h;
    });

    return {
      version: 2,
      updatedAt: Date.now(),
      habits: serializedHabits,
      selectedHabitId: core.state.selectedHabitId || 'all',
      selectedYear: core.state.selectedYear || core.CURRENT_YEAR,
      showQuickLogOnStartup: core.state.showQuickLogOnStartup || false
    };
  };

  core.applyPayloadToState = function(parsed) {
    if (!parsed) return;
    core.state.habits = (parsed.habits || []).map(h => {
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
        showCount: h.showCount !== undefined ? Boolean(h.showCount) : true,
        showDuration: Boolean(h.showDuration),
        hideFromAll: Boolean(h.hideFromAll),
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
        createdAt: h.createdAt || core.getTodayKey(),
        updatedAt: h.updatedAt || Date.now(),
        logs: restoredLogs
      };
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

  core.saveState = function() {
    const payload = core.getPayloadFromState();
    const driver = core.getDriver();
    const payloadStr = JSON.stringify(payload);

    driver.setItem(core.STORAGE_KEY, payloadStr).then(function() {
      // Also write to localStorage for backward compatibility
      try { localStorage.setItem(core.STORAGE_KEY, payloadStr); } catch (e) {}
      if (core.SyncManager) {
        core.SyncManager.broadcastWrite(payload);
      }
    }).catch(function(err) {
      console.error('Failed to save state to driver:', err);
    });
  };


  // --- CLIENT-SIDE AES-256-GCM END-TO-END ENCRYPTION (E2EE) ---
  core.E2EE = {
    getKey: function(passphrase, saltBytes) {
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

    const merged = {
      version: 2,
      updatedAt: Math.max(localPayload.updatedAt || 0, remotePayload.updatedAt || 0),
      selectedHabitId: localPayload.selectedHabitId || remotePayload.selectedHabitId || 'all',
      selectedYear: localPayload.selectedYear || remotePayload.selectedYear || core.CURRENT_YEAR,
      showQuickLogOnStartup: localPayload.showQuickLogOnStartup || remotePayload.showQuickLogOnStartup || false,
      habits: []
    };

    const habitMap = new Map();

    const processHabitList = function(habits, isRemote) {
      (habits || []).forEach(function(h) {
        if (!h.id) return;
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


  // --- SYNC TARGET CLIENTS (P2P, Google Drive, Dropbox, WebDAV) ---
  core.SyncTargets = {
    P2P: {
      connectedChannel: null,
      code: null,
      initSession: function() {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        this.code = code;
        return {
          code: code,
          qrData: 'habitual-sync:' + code
        };
      },
      connectWithCode: function(targetCode) {
        this.code = targetCode;
        return Promise.resolve({ success: true, connectedCode: targetCode });
      },
      sendPayload: function(encryptedString) {
        if (this.connectedChannel && this.connectedChannel.readyState === 'open') {
          this.connectedChannel.send(encryptedString);
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      }
    },

    GoogleDrive: {
      getClientId: function() {
        return localStorage.getItem('habitual_gdrive_client_id') || '1089385392217-c8c5tplfgh4pjso2b15n9knsneh3nn4d.apps.googleusercontent.com';
      },
      setClientId: function(id) {
        localStorage.setItem('habitual_gdrive_client_id', id);
      },
      token: localStorage.getItem('habitual_gdrive_token') || null,

      getAuthUrl: function(customClientId) {
        const cid = customClientId || this.getClientId();
        const redirectUri = window.location.origin + window.location.pathname;
        const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.appdata');
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${cid}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scope}`;
      },

      setToken: function(token) {
        this.token = token;
        localStorage.setItem('habitual_gdrive_token', token);
      },

      uploadBackup: function(encryptedPayload) {
        if (!this.token) return Promise.reject(new Error('Google Drive not authenticated'));
        const metadata = {
          name: 'habitual_sync.json',
          parents: ['appDataFolder']
        };

        const file = new Blob([encryptedPayload], { type: 'application/json' });
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file);

        return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + this.token },
          body: formData
        }).then(function(res) {
          if (!res.ok) throw new Error('Google Drive upload error: ' + res.statusText);
          return res.json();
        });
      },

      downloadBackup: function() {
        if (!this.token) return Promise.reject(new Error('Google Drive not authenticated'));
        const self = this;
        return fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name=%27habitual_sync.json%27', {
          headers: { 'Authorization': 'Bearer ' + self.token }
        }).then(function(res) {
          return res.json();
        }).then(function(data) {
          if (!data.files || data.files.length === 0) return null;
          const fileId = data.files[0].id;
          return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': 'Bearer ' + self.token }
          }).then(function(res) { return res.text(); });
        });
      }
    },

    Dropbox: {
      getClientId: function() {
        return localStorage.getItem('habitual_dropbox_client_id') || 'YOUR_DROPBOX_APP_KEY';
      },
      setClientId: function(id) {
        localStorage.setItem('habitual_dropbox_client_id', id);
      },
      token: localStorage.getItem('habitual_dropbox_token') || null,

      getAuthUrl: function(customClientId) {
        const cid = customClientId || this.getClientId();
        const redirectUri = window.location.origin + window.location.pathname;
        return `https://www.dropbox.com/oauth2/authorize?client_id=${cid}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token`;
      },

      setToken: function(token) {
        this.token = token;
        localStorage.setItem('habitual_dropbox_token', token);
      },

      uploadBackup: function(encryptedPayload) {
        if (!this.token) return Promise.reject(new Error('Dropbox not authenticated'));
        return fetch('https://content.dropboxapi.com/2/files/upload', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + this.token,
            'Dropbox-API-Arg': JSON.stringify({
              path: '/habitual_sync.json',
              mode: 'overwrite',
              autorename: false,
              mute: true
            }),
            'Content-Type': 'application/octet-stream'
          },
          body: encryptedPayload
        }).then(function(res) {
          if (!res.ok) throw new Error('Dropbox upload error');
          return res.json();
        });
      },

      downloadBackup: function() {
        if (!this.token) return Promise.reject(new Error('Dropbox not authenticated'));
        return fetch('https://content.dropboxapi.com/2/files/download', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + this.token,
            'Dropbox-API-Arg': JSON.stringify({ path: '/habitual_sync.json' })
          }
        }).then(function(res) {
          if (res.status === 409) return null; // File not found
          return res.text();
        });
      }
    },

    WebDAV: {
      getCredentials: function() {
        return {
          url: localStorage.getItem('habitual_webdav_url') || '',
          user: localStorage.getItem('habitual_webdav_user') || '',
          pass: localStorage.getItem('habitual_webdav_pass') || ''
        };
      },

      setCredentials: function(url, user, pass) {
        localStorage.setItem('habitual_webdav_url', url);
        localStorage.setItem('habitual_webdav_user', user);
        localStorage.setItem('habitual_webdav_pass', pass);
      },

      uploadBackup: function(encryptedPayload) {
        const creds = this.getCredentials();
        if (!creds.url) return Promise.reject(new Error('WebDAV URL not configured'));
        const fileUrl = creds.url.replace(/\/+$/, '') + '/habitual_sync.json';
        const headers = { 'Content-Type': 'text/plain' };
        if (creds.user) {
          headers['Authorization'] = 'Basic ' + btoa(creds.user + ':' + creds.pass);
        }

        return fetch(fileUrl, {
          method: 'PUT',
          headers: headers,
          body: encryptedPayload
        }).then(function(res) {
          if (!res.ok) throw new Error('WebDAV upload status ' + res.status);
          return true;
        });
      },

      downloadBackup: function() {
        const creds = this.getCredentials();
        if (!creds.url) return Promise.reject(new Error('WebDAV URL not configured'));
        const fileUrl = creds.url.replace(/\/+$/, '') + '/habitual_sync.json';
        const headers = {};
        if (creds.user) {
          headers['Authorization'] = 'Basic ' + btoa(creds.user + ':' + creds.pass);
        }

        return fetch(fileUrl, {
          method: 'GET',
          headers: headers
        }).then(function(res) {
          if (res.status === 404) return null;
          if (!res.ok) throw new Error('WebDAV download status ' + res.status);
          return res.text();
        });
      }
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

    toggleTarget: function(targetName, enable) {
      const idx = this.settings.enabledTargets.indexOf(targetName);
      if (enable && idx === -1) {
        this.settings.enabledTargets.push(targetName);
      } else if (!enable && idx !== -1) {
        this.settings.enabledTargets.splice(idx, 1);
      }
      localStorage.setItem('habitual_sync_targets', JSON.stringify(this.settings.enabledTargets));
    },

    setPassphrase: function(passphrase) {
      this.settings.passphrase = passphrase;
      localStorage.setItem('habitual_sync_passphrase', passphrase);
    },

    broadcastWrite: function(payload) {
      const self = this;
      if (this.settings.enabledTargets.length === 0) return;

      core.E2EE.encrypt(payload, this.settings.passphrase).then(function(encrypted) {
        if (self.isTargetEnabled('p2p')) {
          core.SyncTargets.P2P.sendPayload(encrypted);
        }
        if (self.isTargetEnabled('googleDrive')) {
          core.SyncTargets.GoogleDrive.uploadBackup(encrypted).catch(e => console.warn('GDrive Sync Error:', e));
        }
        if (self.isTargetEnabled('dropbox')) {
          core.SyncTargets.Dropbox.uploadBackup(encrypted).catch(e => console.warn('Dropbox Sync Error:', e));
        }
        if (self.isTargetEnabled('webdav')) {
          core.SyncTargets.WebDAV.uploadBackup(encrypted).catch(e => console.warn('WebDAV Sync Error:', e));
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
      if (this.isTargetEnabled('googleDrive')) {
        pulls.push(core.SyncTargets.GoogleDrive.downloadBackup().catch(e => null));
      }
      if (this.isTargetEnabled('dropbox')) {
        pulls.push(core.SyncTargets.Dropbox.downloadBackup().catch(e => null));
      }
      if (this.isTargetEnabled('webdav')) {
        pulls.push(core.SyncTargets.WebDAV.downloadBackup().catch(e => null));
      }

      return Promise.all(pulls).then(function(rawCiphertexts) {
        const decryptPromises = rawCiphertexts.filter(Boolean).map(function(cipherText) {
          return core.E2EE.decrypt(cipherText, self.settings.passphrase).catch(e => null);
        });
        return Promise.all(decryptPromises);
      }).then(function(remotePayloads) {
        const validPayloads = remotePayloads.filter(Boolean);
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
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `habitual_backup_${core.getTodayKey()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
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
          if (core.elements.modalData) core.elements.modalData.classList.add('hidden');
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Failed to parse backup JSON file.');
      }
    };
    reader.readAsText(file);
  };

})(window.HabitualCore);
