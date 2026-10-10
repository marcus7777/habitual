window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  core.STORAGE_KEY = 'habitual_tracker_v1';
  core.CURRENT_YEAR = new Date().getFullYear();
  core.COLOR_PALETTE = ['green', 'blue', 'purple', 'orange', 'crimson', 'cyan', 'emerald', 'amber', 'indigo', 'rose'];

  core.PRESET_THEME_HEX = {
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

  core.state = {
    habits: [],
    selectedHabitId: 'all',
    selectedYear: core.CURRENT_YEAR,
    showQuickLogOnStartup: false,
    expandedHabitIds: new Set()
  };

  core.activeCalendarHabit = null;
  core.focusedDayState = { habitId: null, dateStr: null };
  core.pendingQuickLogAfterHabit = false;
  core.activeLogDateKey = null;

  core.elements = {};

  core.deriveNameFromId = function(id) {
    if (!id) return '';
    let baseId = id;
    if (baseId.includes('_')) {
      const parts = baseId.split('_');
      baseId = parts[parts.length - 1];
    }
    const name = baseId.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  core.nameFromId = function(id) {
    const habit = (core.state && core.state.habits) ? core.state.habits.find(h => h.id === id) : null;
    if (habit && habit.name) return habit.name;
    return core.deriveNameFromId(id);
  };

  core.idFromName = function(name) {
    if (!name) return 'habit_' + Math.random().toString(36).substring(2, 8);
    return String(name).trim().replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
      return index == 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  };

  core.getDefaultColorForId = function(id) {
    if (!id) return 'green';
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global);
    if (typeof globalScope.colourFromString === 'function') {
      return globalScope.colourFromString(id);
    }
    return 'green';
  };

  core.getHabitHexColor = function(habit) {
    const defaultColour = core.getDefaultColorForId(habit ? habit.id : 'default');
    const defaultHex = defaultColour.startsWith('#') ? defaultColour : (core.PRESET_THEME_HEX[defaultColour] || core.PRESET_THEME_HEX.green);
    if (!habit || !habit.colorTheme) return defaultHex;
    if (habit.colorTheme.startsWith('#')) return habit.colorTheme;
    return core.PRESET_THEME_HEX[habit.colorTheme] || defaultHex;
  };

  core.getAncestryChain = function(habitId) {
    const chain = [];
    let cur = core.state.habits.find(h => h.id === habitId);
    const visited = new Set();
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      chain.unshift(cur);
      cur = cur.parentId ? core.state.habits.find(h => h.id === cur.parentId) : null;
    }
    return chain;
  };

  core.getAllDescendantIds = function(habitId) {
    const ids = [habitId];
    const children = core.state.habits.filter(h => h.parentId === habitId);
    children.forEach(c => {
      ids.push(...core.getAllDescendantIds(c.id));
    });
    return ids;
  };

  core.parseHexColor = function(hexStr) {
    if (!hexStr || typeof hexStr !== 'string') return null;
    hexStr = hexStr.trim().replace(/^#/, '');
    if (hexStr.length === 3) {
      hexStr = hexStr.split('').map(c => c + c).join('');
    }
    if (hexStr.length !== 6) return null;
    const num = parseInt(hexStr, 16);
    if (isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  };

  core._rgbToHex = function(r, g, b) {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };

  core.blendColors = function(rgb1, rgb2, factor) {
    const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * factor);
    const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * factor);
    const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * factor);
    return core._rgbToHex(r, g, b);
  };

  core.getCustomThemeLevels = function(hexStr) {
    const baseRgb = { r: 0x16, g: 0x1b, b: 0x22 };
    const targetRgb = core.parseHexColor(hexStr) || { r: 0x39, g: 0xd3, b: 0x53 };
    return {
      level0: '#161b22',
      level1: core.blendColors(baseRgb, targetRgb, 0.25),
      level2: core.blendColors(baseRgb, targetRgb, 0.50),
      level3: core.blendColors(baseRgb, targetRgb, 0.75),
      level4: core._rgbToHex(targetRgb.r, targetRgb.g, targetRgb.b)
    };
  };

  core.normalizeHex = function(hexStr) {
    const parsed = core.parseHexColor(hexStr);
    if (!parsed) return '#39d353';
    return core._rgbToHex(parsed.r, parsed.g, parsed.b);
  };

  core.getHabitHexWithAlpha = function(habit, ratio) {
    const hex = core.normalizeHex(core.getHabitHexColor(habit));
    if (!ratio || ratio <= 0) return hex + '00';
    const minAlpha = 34; // 0x22 floor for active progress
    const alpha = Math.min(255, Math.max(minAlpha, Math.round(minAlpha + Math.min(1.0, ratio) * (255 - minAlpha))));
    const alphaHex = alpha.toString(16).padStart(2, '0');
    return hex + alphaHex;
  };

  core.formatDateKey = function(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  core.parseDateKey = function(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  };

  core.parseFlexibleDate = function(str) {
    if (!str || typeof str !== 'string') return null;
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
      if (parts.length === 3 && parts[0].length === 4) return str;
    }
    return null;
  };

  core.getTodayKey = function() {
    return core.formatDateKey(new Date());
  };

  core.cursorDateKey = null;

  core.getCursorDateKey = function() {
    if (!core.cursorDateKey) {
      core.cursorDateKey = core.getTodayKey();
    }
    return core.cursorDateKey;
  };

  core.setCursorDateKey = function(dateStr) {
    if (!dateStr) return;
    const isNew = core.cursorDateKey !== dateStr;
    core.cursorDateKey = dateStr;
    const year = parseInt(dateStr.split('-')[0], 10);
    if (year && year !== core.state.selectedYear) {
      if (core.getAvailableYears && core.getAvailableYears().includes(year)) {
        core.state.selectedYear = year;
      }
    }
    if (core.renderAll && core.elements && core.elements.heatmapsGallery && typeof core.elements.heatmapsGallery.appendChild === 'function') {
      core.renderAll();
    }
    if (isNew && core.showCursorTooltip) {
      core.showCursorTooltip(1200);
    }
  };

  core.moveCursorDateByDays = function(days) {
    const currentKey = core.getCursorDateKey();
    const d = core.parseDateKey(currentKey);
    d.setDate(d.getDate() + days);
    const newKey = core.formatDateKey(d);
    core.setCursorDateKey(newKey);
  };

  core.getDaysAgoKey = function(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return core.formatDateKey(d);
  };

  core.formatPrettyDate = function(dateStr) {
    const d = core.parseDateKey(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  core.applyParentDependencyOnLog = function(habit, dateKey, newCount) {
    if (!habit) return;
    if (habit.parentId && habit.parentDependency && habit.parentDependency !== 'none' && newCount > 0) {
      const parent = core.state.habits.find(h => h.id === habit.parentId);
      if (parent) {
        if (!parent.logs) parent.logs = {};
        const parentLog = parent.logs[dateKey];
        const parentCount = parentLog ? parentLog.count : 0;
        if (habit.parentDependency === 'requires_parent' || habit.parentDependency === 'auto_log_parent') {
          const reqTarget = parent.type === 'negative' ? 0 : (parent.dailyTarget || 1);
          if (parent.type !== 'negative' && parentCount < reqTarget) {
            parent.logs[dateKey] = { count: reqTarget, note: (parentLog && parentLog.note) ? parentLog.note : '' };
            if (core.saveLog) core.saveLog(parent.id, dateKey, reqTarget, (parentLog && parentLog.note) ? parentLog.note : '');
            if (core.showToast) core.showToast(`Logged "${habit.name}" & auto-logged parent task "${parent.name}"!`);
          }
        }
      }
    }
    if (newCount > 0) {
      const autoSubs = core.state.habits.filter(h => h.parentId === habit.id && h.parentDependency === 'auto_complete_from_parent');
      autoSubs.forEach(sub => {
        if (!sub.logs) sub.logs = {};
        const subLog = sub.logs[dateKey];
        const subTarget = sub.type === 'negative' ? 0 : (sub.dailyTarget || 1);
        if (sub.type !== 'negative') {
          const subCount = subLog ? subLog.count : 0;
          if (subCount < subTarget) {
            sub.logs[dateKey] = { count: subTarget, note: (subLog && subLog.note) ? subLog.note : '' };
            if (core.saveLog) core.saveLog(sub.id, dateKey, subTarget, (subLog && subLog.note) ? subLog.note : '');
            if (core.showToast) core.showToast(`Logged "${habit.name}" & auto-completed sub-habit "${sub.name}"!`);
          }
        }
      });
    }
  };

  core.setHabitPauseState = function(habit, newIsPaused, dateStr = core.getTodayKey(), options = {}) {
    if (!habit) return;
    const wasPaused = Boolean(habit.isPaused);
    habit.isPaused = Boolean(newIsPaused);

    const pauseStart = options.startDate || dateStr;
    const pauseResume = options.endDate || options.resumeDate || null;
    const pauseNote = options.note || '';
    const hideHeatmap = options.hideHeatmap !== undefined ? Boolean(options.hideHeatmap) : Boolean(habit.hideHeatmapWhenPaused);

    if (newIsPaused) {
      habit.hideHeatmapWhenPaused = hideHeatmap;
    }

    if (!Array.isArray(habit.pauseHistory)) habit.pauseHistory = [];
    if (!habit.logs) habit.logs = {};

    if (newIsPaused) {
      habit.pauseHistory.push({
        startDate: pauseStart,
        endDate: pauseResume,
        note: pauseNote,
        hideHeatmap: hideHeatmap
      });

      // Log Pause event on start date
      const pauseNoteText = pauseNote ? `Paused: ${pauseNote}` : 'Habit Paused';
      habit.logs[pauseStart] = {
        count: 0,
        isPauseEvent: true,
        eventType: 'pause',
        note: pauseNoteText,
        resumeDate: pauseResume
      };
      if (core.saveLog) core.saveLog(habit.id, pauseStart, 0, pauseNoteText);

      // If an expected resume date was given, log Resume event on that date
      if (pauseResume) {
        const resumeNoteText = `Resumes: Scheduled to resume (Paused ${pauseStart})`;
        habit.logs[pauseResume] = {
          count: 0,
          isPauseEvent: true,
          eventType: 'resume',
          note: resumeNoteText,
          startDate: pauseStart
        };
        if (core.saveLog) core.saveLog(habit.id, pauseResume, 0, resumeNoteText);
      }
    } else if (!newIsPaused && wasPaused) {
      if (habit.pauseHistory.length > 0) {
        const lastEntry = habit.pauseHistory[habit.pauseHistory.length - 1];
        if (!lastEntry.endDate) lastEntry.endDate = dateStr;
      }
      // Log Resume event on resume date
      const resumeNoteText = 'Resumed: Habit Resumed';
      habit.logs[dateStr] = {
        count: 0,
        isPauseEvent: true,
        eventType: 'resume',
        note: resumeNoteText
      };
      if (core.saveLog) core.saveLog(habit.id, dateStr, 0, resumeNoteText);
    }
  };

  core.isHabitPausedOnDate = function(habit, dateStr) {
    if (!habit) return false;
    if (Array.isArray(habit.pauseHistory) && habit.pauseHistory.length > 0) {
      for (const range of habit.pauseHistory) {
        if (range.startDate && dateStr >= range.startDate) {
          if (!range.endDate || dateStr <= range.endDate) return true;
        }
      }
    }
    if (habit.isPaused) {
      if (Array.isArray(habit.pauseHistory) && habit.pauseHistory.length > 0) {
        const lastEntry = habit.pauseHistory[habit.pauseHistory.length - 1];
        if (lastEntry && lastEntry.endDate && dateStr > lastEntry.endDate) {
          return false;
        }
      }
      const createdAt = habit.createdAt || core.getTodayKey();
      if (dateStr >= createdAt || dateStr === core.getTodayKey()) return true;
    }
    return false;
  };

  core.toggleHabitForDate = function(habitId, dateKey) {
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit) return;
    if (!habit.logs) habit.logs = {};
    const currentLog = habit.logs[dateKey];
    const currentCount = currentLog ? currentLog.count : 0;
    const currentNote = currentLog ? currentLog.note : '';
    let newCount = currentCount + 1;
    const todayStr = core.getTodayKey();
    const isFuture = dateKey > todayStr;

    const logObj = { count: newCount, note: currentNote };
    if (isFuture && newCount > 0) {
      logObj.unverified = true;
    }
    habit.logs[dateKey] = logObj;

    core.applyParentDependencyOnLog(habit, dateKey, newCount);

    if (isFuture && newCount > 0 && core.showToast) {
      core.showToast(`⏳ Pre-logged "${habit.name}" for ${core.formatPrettyDate(dateKey)}! We'll double-check with you on that day.`, 'info');
    }

    // 1. Optimistically update UI first
    if (core.updateHabitCard && core.updateHabitCard(habitId)) {
      // Surgical update completed
    } else if (core.renderAll) {
      core.renderAll();
    }
    // 2. Persist to storage asynchronously
    if (core.saveLog) {
      core.saveLog(habitId, dateKey, newCount, currentNote, logObj.unverified);
    } else if (core.saveState) {
      core.saveState();
    }

    if (core.checkPendingVerifications) {
      core.checkPendingVerifications();
    }
  };

  core.getOrdinalSuffix = function(i) {
    const j = i % 10, k = i % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  };

  core.getWeekRangeForDate = function(dInput, weekStartDay = 1) {
    const d = new Date(typeof dInput === 'string' ? dInput + 'T00:00:00' : dInput);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day - weekStartDay + 7) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startKey: core.formatDateKey(start), endKey: core.formatDateKey(end), startDate: start, endDate: end };
  };

  core._getHabitListForTarget = function(target) {
    if (target === 'all') return core.state.habits.filter(h => !h.hideFromAll);
    if (Array.isArray(target)) return target;
    if (target && target.habitIds) return core.state.habits.filter(h => target.habitIds.includes(h.id));
    if (target) return [target];
    return [];
  };

  core._aggregateLogRange = function(habit, startKey, endKey, countActiveDaysOnly = false) {
    if (!habit || !habit.logs) return 0;
    let result = 0;
    const cur = new Date(startKey + 'T00:00:00');
    const end = new Date(endKey + 'T00:00:00');
    while (cur <= end) {
      const key = core.formatDateKey(cur);
      const log = habit.logs[key];
      if (log && log.count > 0) {
        if (countActiveDaysOnly) result++;
        else result += log.count;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  };

  core.getWeeklyLogCount = function(habit, startKey, endKey) {
    return core._aggregateLogRange(habit, startKey, endKey, false);
  };

  core.getWeeklyActiveDaysCount = function(habit, startKey, endKey) {
    return core._aggregateLogRange(habit, startKey, endKey, true);
  };

  core.getMonthRangeForDate = function(dInput) {
    const d = new Date(typeof dInput === 'string' ? dInput + 'T00:00:00' : dInput);
    const year = d.getFullYear();
    const month = d.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { startKey: core.formatDateKey(start), endKey: core.formatDateKey(end), startDate: start, endDate: end, year, month };
  };

  core.getMonthlyLogCount = function(habit, startKey, endKey) {
    return core._aggregateLogRange(habit, startKey, endKey, false);
  };

  core.getTargetDayOfMonthDate = function(year, month, targetDaySetting) {
    const maxDays = new Date(year, month + 1, 0).getDate();
    let day = 1;
    if (targetDaySetting === 'last') day = maxDays;
    else {
      const parsed = parseInt(targetDaySetting, 10);
      day = (!isNaN(parsed) && parsed > 0) ? Math.min(parsed, maxDays) : 1;
    }
    return new Date(year, month, day);
  };

  core.getHabitDurationDays = function(habit) {
    if (!habit) return 0;
    const todayStr = core.getTodayKey();
    let startStr = habit.createdAt || todayStr;
    if (habit.logs) {
      const logKeys = Object.keys(habit.logs).filter(k => habit.logs[k] && habit.logs[k].count > 0);
      if (logKeys.length > 0) {
        logKeys.sort();
        if (logKeys[0] < startStr) {
          startStr = logKeys[0];
        }
      }
    }
    const startDate = new Date(startStr + 'T00:00:00');
    const todayDate = new Date(todayStr + 'T00:00:00');
    const diffTime = todayDate - startDate;
    return Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
  };

  core.getCellData = function(dateStr, target, todayStr) {
    const habitList = core._getHabitListForTarget(target);

    if (target === 'all' || Array.isArray(target) || (target && target.habitIds)) {
      const activeHabits = [];
      let totalRatios = 0;
      const habitData = habitList.map(h => {
        const log = (h.logs && h.logs[dateStr]) ? h.logs[dateStr] : null;
        let isDone = false, ratio = 0;
        if (h.type === 'negative') {
          if (log && log.count > 0) { isDone = false; ratio = 0; }
          else if (dateStr <= todayStr) { isDone = true; ratio = 1.0; }
        } else {
          const count = log ? log.count : 0;
          if (h.frequencyType === 'weekly' && h.colorWholeWeek !== false) {
            const anchor = (h.targetDays && h.targetDays.length > 0) ? h.targetDays[0] : 1;
            const range = core.getWeekRangeForDate(dateStr, anchor);
            const wCount = core.getWeeklyLogCount(h, range.startKey, range.endKey);
            const req = h.weeklyTarget || 1;
            if (wCount >= req) { isDone = true; ratio = 1.0; }
            else if (count > 0) { isDone = true; ratio = Math.min(1.0, count / req); }
          } else if (h.frequencyType === 'monthly' && h.colorWholeMonth !== false) {
            const mRange = core.getMonthRangeForDate(dateStr);
            const mCount = core.getMonthlyLogCount(h, mRange.startKey, mRange.endKey);
            const req = h.monthlyTarget || 1;
            if (mCount >= req) { isDone = true; ratio = 1.0; }
            else if (count > 0) { isDone = true; ratio = Math.min(1.0, count / req); }
          } else if (h.frequencyType === 'specific_days' && h.colorWholeWeek !== false) {
            const targetDays = h.targetDays || [1, 3, 5];
            const anchor = targetDays[0] || 1;
            const range = core.getWeekRangeForDate(dateStr, anchor);
            const activeDays = core.getWeeklyActiveDaysCount(h, range.startKey, range.endKey);
            const req = targetDays.length;
            if (activeDays >= req) { isDone = true; ratio = 1.0; }
            else if (count > 0) { isDone = true; ratio = Math.min(1.0, count / (req || 1)); }
          } else {
            const dailyTarget = Math.max(1, h.dailyTarget || 1);
            if (count > 0) { isDone = true; ratio = Math.min(1.0, count / dailyTarget); }
          }
        }
        if (isDone) totalRatios += ratio;
        return { habit: h, isDone, ratio };
      });
      const activeCount = habitData.filter(d => d.isDone).length;
      habitData.forEach(item => {
        if (item.isDone && item.ratio > 0) {
          activeHabits.push({ id: item.habit.id, name: item.habit.name, ratio: item.ratio, color: core.getHabitHexWithAlpha(item.habit, item.ratio) });
        }
      });
      const allPaused = (habitList.length > 0) && habitList.every(h => core.isHabitPausedOnDate(h, dateStr));
      const avgRatio = habitList.length > 0 ? (totalRatios / habitList.length) : 0;
      const hasNote = habitList.some(h => h.logs && h.logs[dateStr] && h.logs[dateStr].note && String(h.logs[dateStr].note).trim() !== '');
      return { count: activeCount, ratio: avgRatio, activeHabits, isRelapse: false, isPaused: allPaused, note: allPaused ? '⏸️ Paused' : '', isTargetDay: false, hasNote };
    }

    const habit = target;
    const log = (habit.logs && habit.logs[dateStr]) ? habit.logs[dateStr] : null;
    const isPaused = core.isHabitPausedOnDate(habit, dateStr);
    const hasNote = Boolean(log && log.note && String(log.note).trim() !== '');
    const isUnverified = Boolean(log && log.unverified);

    if (isPaused && (!log || log.count === 0)) {
      return { count: 0, ratio: 0, isRelapse: false, isPaused: true, note: (log && log.note) ? log.note : '⏸️ Paused (Tracking paused)', isTargetDay: false, hasNote, isUnverified };
    }

    if (habit.type === 'negative') {
      if (log && log.count > 0) return { count: log.count, ratio: 0, isRelapse: true, note: log.note || 'Relapse logged', isTargetDay: false, hasNote, isUnverified };
      if (dateStr <= todayStr) return { count: 1, ratio: 1.0, isRelapse: false, note: 'Clean day', isTargetDay: false, hasNote, isUnverified };
      return { count: 0, ratio: 0, isRelapse: false, note: '', isTargetDay: false, hasNote, isUnverified };
    }

    const dObj = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = dObj.getDay();
    const count = log ? log.count : 0;
    const note = log ? log.note : '';

    if (habit.parentId && habit.parentDependency === 'parent_days_only') {
      const parent = core.state.habits.find(h => h.id === habit.parentId);
      if (parent) {
        const parentLog = parent.logs ? parent.logs[dateStr] : null;
        let isParentDoneOnDate = parent.type === 'negative' ? ((!parentLog || parentLog.count === 0) && dateStr <= todayStr) : (parentLog && parentLog.count > 0);
        if (!isParentDoneOnDate && count === 0) {
          return { count: 0, ratio: 0, isRelapse: false, note: note || `Parent task "${parent.name}" was not completed on this date (Sub-habit inactive)`, isTargetDay: false, hasNote, isUnverified };
        }
      }
    }

    if (habit.frequencyType === 'weekly') {
      const anchorDay = (habit.targetDays && habit.targetDays.length > 0) ? habit.targetDays[0] : 1;
      const isTargetDay = dayOfWeek === anchorDay;
      const weekRange = core.getWeekRangeForDate(dateStr, anchorDay);
      const weeklyTarget = habit.weeklyTarget || 1;
      const weeklyCount = core.getWeeklyLogCount(habit, weekRange.startKey, weekRange.endKey);
      if (weeklyCount >= weeklyTarget && habit.colorWholeWeek !== false) {
        return { count: count || 1, ratio: 1.0, isRelapse: false, note: note || `Weekly goal met (${weeklyCount}/${weeklyTarget})`, isTargetDay, hasNote, isUnverified };
      }
      return { count, ratio: count > 0 ? Math.min(1.0, count / weeklyTarget) : 0, isRelapse: false, note: note || (isTargetDay && count === 0 ? 'Target Day' : ''), isTargetDay, hasNote, isUnverified };
    } else if (habit.frequencyType === 'monthly') {
      const monthRange = core.getMonthRangeForDate(dateStr);
      const targetDate = core.getTargetDayOfMonthDate(monthRange.year, monthRange.month, habit.monthlyDay || '1');
      const isTargetDay = dateStr === core.formatDateKey(targetDate);
      const monthlyTarget = habit.monthlyTarget || 1;
      const monthlyCount = core.getMonthlyLogCount(habit, monthRange.startKey, monthRange.endKey);
      if (monthlyCount >= monthlyTarget && habit.colorWholeMonth !== false) {
        return { count: count || 1, ratio: 1.0, isRelapse: false, note: note || `Monthly goal met (${monthlyCount}/${monthlyTarget})`, isTargetDay, hasNote, isUnverified };
      }
      return { count, ratio: count > 0 ? Math.min(1.0, count / monthlyTarget) : 0, isRelapse: false, note: note || (isTargetDay && count === 0 ? 'Target Day' : ''), isTargetDay, hasNote, isUnverified };
    } else if (habit.frequencyType === 'specific_days') {
      const targetDays = habit.targetDays || [1, 3, 5];
      const isTargetDay = targetDays.includes(dayOfWeek);
      const weekRange = core.getWeekRangeForDate(dateStr, targetDays[0] || 1);
      const activeDaysCount = core.getWeeklyActiveDaysCount(habit, weekRange.startKey, weekRange.endKey);
      if (activeDaysCount >= targetDays.length && habit.colorWholeWeek !== false) {
        return { count: count || 1, ratio: 1.0, isRelapse: false, note: note || 'Weekly target met', isTargetDay, hasNote, isUnverified };
      }
      return { count, ratio: count > 0 ? 1.0 : 0, isRelapse: false, note: note || (isTargetDay && count === 0 ? 'Target Day' : ''), isTargetDay, hasNote, isUnverified };
    }

    const dailyTarget = Math.max(1, habit.dailyTarget || 1);
    return { count, ratio: count > 0 ? Math.min(1.0, count / dailyTarget) : 0, isRelapse: false, note, isTargetDay: false, hasNote, isUnverified };
  };

  core.calculateStreakForTarget = function(target) {
    const today = new Date();
    if (target !== 'all' && target && !target.habitIds && target.type === 'negative') {
      let currentStreak = 0;
      let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      while (true) {
        let key = core.formatDateKey(checkDate);
        let log = target.logs ? target.logs[key] : null;
        if (!log || log.count === 0) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1); }
        else break;
      }
      return { current: currentStreak, isWeekly: false, isMonthly: false };
    }
    if (target !== 'all' && target && !target.habitIds && target.frequencyType === 'monthly') {
      const monthlyTarget = target.monthlyTarget || 1;
      let curMonthRange = core.getMonthRangeForDate(core.formatDateKey(today));
      let monthStreak = 0, checkYear = curMonthRange.year, checkMonth = curMonthRange.month;
      let curCount = core.getMonthlyLogCount(target, curMonthRange.startKey, curMonthRange.endKey);
      if (curCount >= monthlyTarget) {
        monthStreak++; checkMonth--; if (checkMonth < 0) { checkMonth = 11; checkYear--; }
      } else {
        let prevM = checkMonth - 1, prevY = checkYear;
        if (prevM < 0) { prevM = 11; prevY--; }
        const prevRange = core.getMonthRangeForDate(new Date(prevY, prevM, 1));
        if (core.getMonthlyLogCount(target, prevRange.startKey, prevRange.endKey) >= monthlyTarget) { checkMonth = prevM; checkYear = prevY; }
        else return { current: 0, isMonthly: true };
      }
      while (true) {
        const mRange = core.getMonthRangeForDate(new Date(checkYear, checkMonth, 1));
        if (core.getMonthlyLogCount(target, mRange.startKey, mRange.endKey) >= monthlyTarget) {
          monthStreak++; checkMonth--; if (checkMonth < 0) { checkMonth = 11; checkYear--; }
        } else break;
      }
      return { current: monthStreak, isMonthly: true };
    }
    if (target !== 'all' && target && !target.habitIds && (target.frequencyType === 'weekly' || target.frequencyType === 'specific_days')) {
      const anchorDay = (target.targetDays && target.targetDays.length > 0) ? target.targetDays[0] : 1;
      const reqTarget = target.frequencyType === 'weekly' ? (target.weeklyTarget || 1) : (target.targetDays ? target.targetDays.length : 1);
      let currentWeekRange = core.getWeekRangeForDate(core.formatDateKey(today), anchorDay);
      let weekStreak = 0; let curWeekStart = new Date(currentWeekRange.startDate);
      let curLogCount = target.frequencyType === 'weekly' ? core.getWeeklyLogCount(target, currentWeekRange.startKey, currentWeekRange.endKey) : core.getWeeklyActiveDaysCount(target, currentWeekRange.startKey, currentWeekRange.endKey);
      if (curLogCount >= reqTarget) { weekStreak++; curWeekStart.setDate(curWeekStart.getDate() - 7); }
      else {
        const prevStart = new Date(curWeekStart); prevStart.setDate(prevStart.getDate() - 7);
        const prevRange = core.getWeekRangeForDate(core.formatDateKey(prevStart), anchorDay);
        let prevLogCount = target.frequencyType === 'weekly' ? core.getWeeklyLogCount(target, prevRange.startKey, prevRange.endKey) : core.getWeeklyActiveDaysCount(target, prevRange.startKey, prevRange.endKey);
        if (prevLogCount >= reqTarget) curWeekStart.setDate(curWeekStart.getDate() - 7);
        else return { current: 0, isWeekly: true };
      }
      while (true) {
        const range = core.getWeekRangeForDate(core.formatDateKey(curWeekStart), anchorDay);
        let count = target.frequencyType === 'weekly' ? core.getWeeklyLogCount(target, range.startKey, range.endKey) : core.getWeeklyActiveDaysCount(target, range.startKey, range.endKey);
        if (count >= reqTarget) { weekStreak++; curWeekStart.setDate(curWeekStart.getDate() - 7); } else break;
      }
      return { current: weekStreak, isWeekly: true };
    }
    if (target !== 'all' && target && !target.habitIds && target.parentId && target.parentDependency === 'parent_days_only') {
      const parent = core.state.habits.find(h => h.id === target.parentId);
      if (parent) {
        let currentStreak = 0; let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const minDate = new Date(today.getFullYear() - 3, 0, 1);
        while (checkDate >= minDate) {
          let key = core.formatDateKey(checkDate);
          let parentLog = parent.logs ? parent.logs[key] : null;
          let isParentDone = parent.type === 'negative' ? ((!parentLog || parentLog.count === 0) && key <= core.formatDateKey(today)) : (parentLog && parentLog.count > 0);
          if (!isParentDone) { checkDate.setDate(checkDate.getDate() - 1); continue; }
          let subLog = target.logs ? target.logs[key] : null;
          let isSubDone = target.type === 'negative' ? (!subLog || subLog.count === 0) : (subLog && subLog.count >= (target.dailyTarget || 1));
          if (isSubDone) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1); }
          else { if (key === core.formatDateKey(today)) { checkDate.setDate(checkDate.getDate() - 1); continue; } break; }
        }
        return { current: currentStreak, isWeekly: false, isMonthly: false };
      }
    }
    const activeDateMap = {};
    const habitList = core._getHabitListForTarget(target);
    habitList.forEach(h => {
      if (h.logs) { Object.keys(h.logs).forEach(dateStr => { if (h.logs[dateStr] && h.logs[dateStr].count > 0) activeDateMap[dateStr] = true; }); }
    });
    let currentStreak = 0; let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let todayKey = core.formatDateKey(checkDate);
    if (!activeDateMap[todayKey]) checkDate.setDate(checkDate.getDate() - 1);
    while (true) {
      let key = core.formatDateKey(checkDate);
      if (activeDateMap[key]) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1); } else break;
    }
    return { current: currentStreak, isWeekly: false };
  };

  core.calculateYearStatsForTarget = function(target, year) {
    let totalCount = 0; const now = new Date();
    if (target !== 'all' && target && !target.habitIds && target.frequencyType === 'monthly') {
      let completedMonths = 0;
      for (let m = 0; m < 12; m++) {
        const mRange = core.getMonthRangeForDate(new Date(year, m, 1));
        if (core.getMonthlyLogCount(target, mRange.startKey, mRange.endKey) >= (target.monthlyTarget || 1)) completedMonths++;
      }
      return { totalCount: completedMonths, isMonthly: true };
    }
    if (target !== 'all' && target && !target.habitIds && (target.frequencyType === 'weekly' || target.frequencyType === 'specific_days')) {
      const anchorDay = (target.targetDays && target.targetDays.length > 0) ? target.targetDays[0] : 1;
      const reqTarget = target.frequencyType === 'weekly' ? (target.weeklyTarget || 1) : (target.targetDays ? target.targetDays.length : 1);
      let completedWeeks = 0; const yearStart = new Date(year, 0, 1), yearEnd = new Date(year, 11, 31);
      let curWeek = core.getWeekRangeForDate(core.formatDateKey(yearStart), anchorDay);
      let curWeekStart = new Date(curWeek.startDate);
      while (curWeekStart <= yearEnd) {
        const range = core.getWeekRangeForDate(core.formatDateKey(curWeekStart), anchorDay);
        let count = target.frequencyType === 'weekly' ? core.getWeeklyLogCount(target, range.startKey, range.endKey) : core.getWeeklyActiveDaysCount(target, range.startKey, range.endKey);
        if (count >= reqTarget) completedWeeks++;
        curWeekStart.setDate(curWeekStart.getDate() + 7);
      }
      return { totalCount: completedWeeks, isWeekly: true };
    }
    if (target !== 'all' && target && !target.habitIds && target.type === 'negative') {
      const startOfYear = new Date(year, 0, 1);
      const endYearDate = (year === now.getFullYear()) ? now : new Date(year, 11, 31);
      let cur = new Date(startOfYear);
      while (cur <= endYearDate) {
        let key = core.formatDateKey(cur);
        let log = target.logs ? target.logs[key] : null;
        if (!log || log.count === 0) totalCount++;
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      const habitList = core._getHabitListForTarget(target);
      habitList.forEach(h => {
        if (h.logs) {
          Object.entries(h.logs).forEach(([dateStr, log]) => {
            if (dateStr.startsWith(`${year}-`) && log && log.count > 0) totalCount += log.count;
          });
        }
      });
    }
    return { totalCount, isWeekly: false };
  };

  core.generateBackfillLogs = function(daysToBackfill, frequencyVal, instancesVal, dailyTarget = 1, habitType = 'positive', frequencyType = 'daily', targetDays = [1], monthlyDay = '1', monthlyTarget = 1, weeklyTarget = 1) {
    const logs = {}; const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.max(1, Math.min(3650, parseInt(daysToBackfill, 10) || 30));
    let frequencyRatio = 0.8;
    if (frequencyVal === 'daily') frequencyRatio = 1.0;
    else if (frequencyVal === 'frequent') frequencyRatio = 0.8;
    else if (frequencyVal === 'moderate') frequencyRatio = 0.5;
    else if (frequencyVal === 'occasional') frequencyRatio = 0.25;
    const startDate = new Date(today); startDate.setDate(today.getDate() - days);

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
      if (habitType === 'negative') return Math.random() >= frequencyRatio;
      return Math.random() < frequencyRatio;
    }

    if (frequencyType === 'monthly') {
      let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      while (cur <= todayMonthStart) {
        if (shouldCreateLog()) {
          const logDate = core.getTargetDayOfMonthDate(cur.getFullYear(), cur.getMonth(), monthlyDay);
          if (logDate >= startDate && logDate <= today) logs[core.formatDateKey(logDate)] = { count: getCountForLog() };
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (frequencyType === 'weekly') {
      const targetWeekDay = (targetDays && targetDays.length > 0) ? targetDays[0] : 1;
      let curWeekRange = core.getWeekRangeForDate(startDate, targetWeekDay);
      let curStart = new Date(curWeekRange.startDate);
      while (curStart <= today) {
        if (shouldCreateLog()) {
          const targetDate = new Date(curStart);
          const dayDiff = (targetWeekDay - targetDate.getDay() + 7) % 7;
          targetDate.setDate(targetDate.getDate() + dayDiff);
          if (targetDate >= startDate && targetDate <= today) logs[core.formatDateKey(targetDate)] = { count: getCountForLog() };
        }
        curStart.setDate(curStart.getDate() + 7);
      }
    } else if (frequencyType === 'specific_days') {
      for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
        if (targetDays.includes(d.getDay()) && shouldCreateLog()) logs[core.formatDateKey(d)] = { count: getCountForLog() };
      }
    } else {
      for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
        if (shouldCreateLog()) logs[core.formatDateKey(d)] = { count: getCountForLog() };
      }
    }
    return { logs, startDateKey: core.formatDateKey(startDate) };
  };

  core.escapeHTML = function(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  };

})(window.HabitualCore);
