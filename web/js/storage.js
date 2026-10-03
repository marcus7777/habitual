window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  core.loadState = function() {
    try {
      const raw = localStorage.getItem(core.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
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
            logs: restoredLogs
          };
        });
        core.state.selectedHabitId = parsed.selectedHabitId || 'all';
        core.state.selectedYear = parsed.selectedYear || core.CURRENT_YEAR;
        core.state.showQuickLogOnStartup = parsed.showQuickLogOnStartup || false;
      }
    } catch (e) {
      console.error('Failed to load state from LocalStorage:', e);
      core.state.habits = [];
    }
  };

  core.saveState = function() {
    try {
      const serializedHabits = core.state.habits.map(habit => {
        const derivedName = core.deriveNameFromId(habit.id);
        const derivedColor = core.getDefaultColorForId(habit.id);
        const h = { id: habit.id };

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

      const payload = {
        habits: serializedHabits,
        selectedHabitId: core.state.selectedHabitId || 'all',
        selectedYear: core.state.selectedYear || core.CURRENT_YEAR,
        showQuickLogOnStartup: core.state.showQuickLogOnStartup || false
      };

      localStorage.setItem(core.STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to save state to LocalStorage:', e);
    }
  };

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
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(core.state, null, 2));
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
        if (imported && Array.isArray(imported.habits)) {
          core.state = imported;
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
