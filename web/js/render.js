window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  core.renderAll = function() {
    if (!core.elements || !core.elements.yearSelector || !core.elements.heatmapsGallery) return;
    core.renderYearSelector();
    core.renderHeatmapsGallery();
  };

  core.patchHeatmapCard = function(habitId, dateKey) {
    if (!habitId) return false;
    const cards = document.querySelectorAll(`.heatmap-card[data-habit-id="${habitId}"]`);
    if (cards.length === 0) return false;

    const isAll = habitId === 'all';
    const isGroup = habitId.startsWith('group_');
    const habit = (!isAll && !isGroup) ? core.state.habits.find(h => h.id === habitId) : null;

    cards.forEach(card => {
      // 1. Update day square in-place if dateKey is supplied
      if (dateKey) {
        const squares = card.querySelectorAll(`.day-square[data-date="${dateKey}"]`);
        const cellData = core.getCellData ? core.getCellData(dateKey, isAll ? 'all' : (isGroup ? habitId : habit)) : null;
        if (cellData) {
          squares.forEach(sq => {
            const isCellCompleted = cellData.isCompleted || (cellData.ratio && cellData.ratio > 0);
            sq.className = `day-square ${isCellCompleted ? 'completed' : ''} ${cellData.isCursor ? 'cursor-day' : ''} ${cellData.hasNote ? 'has-note' : ''}`;
            sq.style.backgroundColor = cellData.bgColor || '';
            if (cellData.hasNote) {
              if (typeof sq.setAttribute === 'function') sq.setAttribute('data-has-note', 'true');
            } else {
              if (typeof sq.removeAttribute === 'function') sq.removeAttribute('data-has-note');
            }
          });
        }
      }

      // 2. In-place update for count badge
      const countBadge = card.querySelector('.badge-count');
      if (countBadge) {
        const target = isAll ? 'all' : (isGroup ? habitId : habit);
        const stats = core.calculateYearStatsForTarget(target, core.state.selectedYear);
        if (stats) {
          if (stats.isMonthly) countBadge.textContent = `${stats.totalCount} of 12 months met in ${core.state.selectedYear}`;
          else if (stats.isWeekly) countBadge.textContent = `${stats.totalCount} of 52 weeks met in ${core.state.selectedYear}`;
          else countBadge.textContent = (habit && habit.type === 'negative') ? `${stats.totalCount} clean days in ${core.state.selectedYear}` : `${stats.totalCount} in ${core.state.selectedYear}`;
        }
      }

      // 3. In-place update for streak badge
      const streakBadge = card.querySelector('.badge-streak');
      if (streakBadge) {
        const target = isAll ? 'all' : (isGroup ? habitId : habit);
        const streakData = core.calculateStreakForTarget(target);
        if (streakData && streakData.current > 0) {
          if (streakData.isMonthly) streakBadge.textContent = `🔥 ${streakData.current} mo${streakData.current === 1 ? '' : 's'}`;
          else if (streakData.isWeekly) streakBadge.textContent = `🔥 ${streakData.current} wk${streakData.current === 1 ? '' : 's'}`;
          else streakBadge.textContent = `🔥 ${streakData.current} d`;
          streakBadge.style.display = 'inline-flex';
        } else {
          streakBadge.style.display = 'none';
        }
      }

      // 4. In-place update for Quick Log button
      const quickLogBtn = card.querySelector('.btn-card-quick-log');
      if (quickLogBtn && habit) {
        const cursorDateStr = dateKey || (core.getCursorDateKey ? core.getCursorDateKey() : core.getTodayKey());
        const logs = habit.logs || {};
        const count = logs[cursorDateStr] ? (logs[cursorDateStr].count || 0) : 0;
        const target = habit.dailyTarget || 1;
        const ratio = count / target;
        const isGoalMet = ratio >= 1.0;

        const hexColor = core.getHabitHexColor ? core.getHabitHexColor(habit) : '#33B679';
        let bgStyle = '';
        if (isGoalMet) {
          bgStyle = `background-color: ${hexColor}; border-color: ${hexColor}; color: #ffffff;`;
        } else {
          const alphaHex = core.getHabitHexWithAlpha ? core.getHabitHexWithAlpha(habit, Math.max(0.18, ratio * 0.85)) : hexColor;
          bgStyle = `background-color: ${alphaHex}; border-color: ${hexColor}; color: var(--text-main);`;
        }

        const tickIcon = '<svg class="icon-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        const plusIcon = '<svg class="icon-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        const iconHTML = isGoalMet ? tickIcon : plusIcon;

        quickLogBtn.className = `btn-card-quick-log ${isGoalMet ? 'goal-met' : ''}`;
        quickLogBtn.setAttribute('data-goal-met', isGoalMet ? 'true' : 'false');
        quickLogBtn.style.cssText = bgStyle;

        const iconContainer = quickLogBtn.querySelector('.quick-log-icon');
        if (iconContainer) {
          iconContainer.innerHTML = iconHTML;
        }

        const isUpcoming = cursorDateStr > core.getTodayKey();
        const formattedCursorDate = core.formatPrettyDate ? core.formatPrettyDate(cursorDateStr) : cursorDateStr;
        let tooltipText = '';
        if (isUpcoming) {
          tooltipText = isGoalMet
            ? `${core.escapeHTML(habit.name)}: Upcoming Goal Pre-logged (${count}/${target}) on ${formattedCursorDate}. Click to log +1.`
            : `${core.escapeHTML(habit.name)}: Upcoming (${count}/${target} pre-logged) on ${formattedCursorDate}. Click to pre-log.`;
        } else {
          tooltipText = isGoalMet
            ? `${core.escapeHTML(habit.name)}: Goal Met (${count}/${target}) on ${formattedCursorDate}. Click to log +1.`
            : `${core.escapeHTML(habit.name)}: ${count}/${target} completed on ${formattedCursorDate}. Click to log +1.`;
        }
        quickLogBtn.title = tooltipText;
        quickLogBtn.setAttribute('aria-label', tooltipText);
      }
    });

    return true;
  };

  core.patchUI = function(habitId, dateKey) {
    if (!habitId) return false;
    let patched = false;
    patched = core.patchHeatmapCard(habitId, dateKey) || patched;
    patched = core.patchHeatmapCard('all', dateKey) || patched;
    if (habitId && habitId !== 'all') {
      const targetHabit = core.state.habits.find(h => h.id === habitId);
      if (targetHabit && targetHabit.parentId) {
        patched = core.patchHeatmapCard(targetHabit.parentId, dateKey) || patched;
      }
    }
    return patched;
  };

  core.renderViewNavigation = function(route) {
    const viewNav = document.getElementById('view-navigation');
    if (!viewNav) return;

    if (route.view === 'habit' && route.habitId) {
      const chain = core.getAncestryChain(route.habitId);
      if (chain.length === 0) {
        viewNav.classList.add('hidden');
        return;
      }

      const targetHabit = chain[chain.length - 1];
      let breadcrumbHTML = `<a href="#/" class="breadcrumb-item">🏠 All Habits</a>`;
      chain.forEach((h, idx) => {
        const isLast = idx === chain.length - 1;
        breadcrumbHTML += ` <span class="breadcrumb-sep">/</span> `;
        if (isLast) {
          breadcrumbHTML += `<span class="breadcrumb-current">${core.escapeHTML(h.name)}</span>`;
        } else {
          breadcrumbHTML += `<a href="#/habit/${h.id}" class="breadcrumb-item">${core.escapeHTML(h.name)}</a>`;
        }
      });

      viewNav.innerHTML = `
        <div class="nav-left">
          <div class="breadcrumb-trail">${breadcrumbHTML}</div>
        </div>
        <div class="nav-right">
          <button type="button" class="btn btn-primary btn-sm" id="btn-nav-add-sub">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Add Sub-habit
          </button>
        </div>
      `;

      viewNav.classList.remove('hidden');

      const navAddSub = (viewNav && viewNav.querySelector)
        ? (viewNav.querySelector('#btn-nav-add-sub') || document.getElementById('btn-nav-add-sub'))
        : document.getElementById('btn-nav-add-sub');
      if (navAddSub) {
        navAddSub.addEventListener('click', () => {
          if (core.openHabitModal) core.openHabitModal(null, targetHabit.id);
        });
      }
    } else {
      viewNav.classList.add('hidden');
    }
  };

  core.handleBackNavigation = function(currentHabit) {
    if (currentHabit && currentHabit.parentId) {
      core.navigateTo(`#/habit/${currentHabit.parentId}`);
    } else {
      if (window.history.length > 1 && document.referrer.includes(window.location.host)) {
        window.history.back();
      } else {
        core.navigateTo('#/');
      }
    }
  };

  core.getAvailableYears = function() {
    const yearsSet = new Set();
    yearsSet.add(core.CURRENT_YEAR);
    const habits = (core.state && core.state.habits) ? core.state.habits : [];
    habits.forEach(h => {
      if (h.logs) {
        Object.keys(h.logs).forEach(dateStr => {
          const y = parseInt(dateStr.split('-')[0], 10);
          if (y && !isNaN(y)) yearsSet.add(y);
        });
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  };

  core.renderYearSelector = function() {
    const years = core.getAvailableYears();
    const selYear = (core.state && core.state.selectedYear) ? core.state.selectedYear : (core.CURRENT_YEAR || new Date().getFullYear());
    if (core.state && !years.includes(selYear)) {
      core.state.selectedYear = years[0];
    }
    const activeYear = (core.state && core.state.selectedYear) ? core.state.selectedYear : selYear;
    if (core.elements && core.elements.yearSelector) {
      core.elements.yearSelector.innerHTML = years
        .map(y => `<option value="${y}" ${y === activeYear ? 'selected' : ''}>${y}</option>`)
        .join('');
    }
  };

  core.toggleConcertina = function(habitId) {
    if (!core.state.expandedHabitIds) core.state.expandedHabitIds = new Set();
    const isExpanded = core.state.expandedHabitIds.has(habitId);
    if (isExpanded) {
      core.state.expandedHabitIds.delete(habitId);
    } else {
      core.state.expandedHabitIds.add(habitId);
    }

    const concertinas = document.querySelectorAll(`.subhabits-concertina[data-parent-id="${habitId}"]`);
    concertinas.forEach(concertina => {
      if (isExpanded) {
        concertina.classList.remove('expanded');
      } else {
        concertina.classList.add('expanded');
      }
    });

    const badges = document.querySelectorAll(`.btn-toggle-concertina[data-habit-id="${habitId}"]`);
    badges.forEach(badge => {
      const arrow = badge.querySelector('.concertina-arrow');
      const directSubs = core.state.habits.filter(h => h.parentId === habitId);
      if (arrow) arrow.textContent = !isExpanded ? '▲' : '▼';
      badge.title = !isExpanded ? 'Click to put away sub-habits' : `Click to view ${directSubs.length} sub-habit${directSubs.length === 1 ? '' : 's'}`;
    });
  };

  core.renderHabitTree = function(habit, year) {
    const subhabits = core.state.habits.filter(h => h.parentId === habit.id);
    const hasSubhabits = subhabits.length > 0;

    let target;
    if (hasSubhabits) {
      const allDescendantIds = core.getAllDescendantIds(habit.id);
      target = {
        isGroup: true,
        habit: habit,
        title: habit.name,
        habitIds: allDescendantIds,
        colorTheme: habit.colorTheme
      };
    } else {
      target = habit;
    }

    const card = core.buildHeatmapCard(target, year);
    card.setAttribute('data-has-subhabits', hasSubhabits ? 'true' : 'false');
    card.setAttribute('data-habit-id-raw', habit.id);

    if (!hasSubhabits) return card;

    const wrapper = document.createElement('div');
    wrapper.className = 'heatmap-group-wrapper';
    wrapper.setAttribute('data-habit-id', habit.id);
    wrapper.appendChild(card);

    const isExpanded = core.state.expandedHabitIds && core.state.expandedHabitIds.has(habit.id);

    const concertina = document.createElement('div');
    concertina.className = `subhabits-concertina ${isExpanded ? 'expanded' : ''}`;
    concertina.setAttribute('data-parent-id', habit.id);

    subhabits.forEach(sub => {
      const subNode = core.renderHabitTree(sub, year);
      concertina.appendChild(subNode);
    });

    const putAwayBar = document.createElement('div');
    putAwayBar.className = 'put-away-bar';
    putAwayBar.innerHTML = `<button class="btn btn-secondary btn-sm btn-put-away" data-parent-id="${habit.id}" title="Put away sub-habits">▲ Put away sub-habits</button>`;
    concertina.appendChild(putAwayBar);

    wrapper.appendChild(concertina);
    return wrapper;
  };

  core.renderHeatmapsGallery = function() {
    core.elements.heatmapsGallery.innerHTML = '';
    const route = core.parseHash ? core.parseHash() : { view: 'home', habitId: null };
    core.renderViewNavigation(route);

    if (!core.state || !core.state.habits || core.state.habits.length === 0) {
      core.elements.heatmapsGallery.innerHTML = `
        <div class="empty-placeholder">
          <p style="font-size: 1.1rem; color: var(--text-muted); margin-bottom: 12px;">No habits yet! Start tracking your visual progression.</p>
          <button type="button" class="btn btn-primary btn-add-first-habit" id="btn-add-first-habit">
            ✨ Add Habit
          </button>
        </div>
      `;
      const btnAdd = (core.elements.heatmapsGallery && core.elements.heatmapsGallery.querySelector)
        ? (core.elements.heatmapsGallery.querySelector('#btn-add-first-habit') || core.elements.heatmapsGallery.querySelector('.btn-add-first-habit') || document.getElementById('btn-add-first-habit'))
        : document.getElementById('btn-add-first-habit');
      if (btnAdd) {
        btnAdd.addEventListener('click', () => {
          if (core.openHabitModal) core.openHabitModal();
        });
      }
      return;
    }

    const fragment = (typeof document !== 'undefined' && typeof document.createDocumentFragment === 'function')
      ? document.createDocumentFragment()
      : document.createElement('div');

    if (route.view === 'home') {
      const topLevelHabits = core.state.habits.filter(h => !h.parentId);
      const visibleTopLevelHabits = topLevelHabits.filter(h => !(h.isPaused && h.hideHeatmapWhenPaused));
      const habitsInAll = core.state.habits.filter(h => !h.hideFromAll);
      if (topLevelHabits.length > 1 && habitsInAll.length > 0) {
        const combinedCard = core.buildHeatmapCard(null, core.state.selectedYear);
        fragment.appendChild(combinedCard);
      }

      visibleTopLevelHabits.forEach(habit => {
        const habitNode = core.renderHabitTree(habit, core.state.selectedYear);
        fragment.appendChild(habitNode);
      });

      const hiddenPausedCount = topLevelHabits.length - visibleTopLevelHabits.length;
      if (hiddenPausedCount > 0) {
        const hiddenInfo = document.createElement('div');
        hiddenInfo.className = 'paused-hidden-info muted-text margin-top-sm';
        hiddenInfo.style.textAlign = 'center';
        hiddenInfo.style.padding = '8px';
        hiddenInfo.style.fontSize = '0.9em';
        hiddenInfo.innerHTML = `🙈 ${hiddenPausedCount} paused habit heatmap${hiddenPausedCount === 1 ? '' : 's'} hidden.`;
        fragment.appendChild(hiddenInfo);
      }
    } else if (route.view === 'habit') {
      const targetHabit = core.state.habits.find(h => h.id === route.habitId);

      if (!targetHabit) {
        core.elements.heatmapsGallery.innerHTML = `
          <div class="empty-placeholder">
            <p>Habit not found or may have been deleted.</p><br>
            <a href="#/" class="btn btn-primary">Return to All Habits</a>
          </div>
        `;
        return;
      }

      const habitNode = core.renderHabitTree(targetHabit, core.state.selectedYear);
      fragment.appendChild(habitNode);

      const subhabits = core.state.habits.filter(h => h.parentId === targetHabit.id);
      if (subhabits.length === 0) {
        const callout = document.createElement('div');
        callout.className = 'subhabit-callout';
        callout.innerHTML = `<button type="button" class="btn btn-secondary btn-sm btn-add-sub-callout">+ Add Sub-habit</button>`;
        fragment.appendChild(callout);

        callout.querySelector('.btn-add-sub-callout').addEventListener('click', () => {
          if (core.openHabitModal) core.openHabitModal(null, targetHabit.id);
        });
      }
    }

    if (core.elements.heatmapsGallery) {
      if (typeof core.elements.heatmapsGallery.appendChild === 'function') {
        core.elements.heatmapsGallery.appendChild(fragment);
      } else {
        const dummyDiv = document.createElement('div');
        dummyDiv.appendChild(fragment);
        core.elements.heatmapsGallery.innerHTML = dummyDiv.innerHTML;
      }
    }

    if (core.attachHeatmapSquareEvents) core.attachHeatmapSquareEvents();
    if (core.attachCardDragAndDropHandlers) core.attachCardDragAndDropHandlers();
  };

  core.updateHabitCard = function(habitId) {
    if (!core.elements || !core.elements.heatmapsGallery) return false;
    const habit = core.state.habits.find(h => h.id === habitId);
    if (!habit) return false;

    let topParent = habit;
    while (topParent.parentId) {
      const parent = core.state.habits.find(h => h.id === topParent.parentId);
      if (!parent) break;
      topParent = parent;
    }

    const selector = `.heatmap-group-wrapper[data-habit-id="${topParent.id}"], .heatmap-card[data-habit-id="${topParent.id}"]`;
    const existingNode = core.elements.heatmapsGallery.querySelector(selector);

    const combinedCard = core.elements.heatmapsGallery.querySelector('.heatmap-card[data-habit-id="all"]');
    if (combinedCard) {
      const newCombined = core.buildHeatmapCard(null, core.state.selectedYear);
      combinedCard.replaceWith(newCombined);
    }

    if (existingNode) {
      const newNode = core.renderHabitTree(topParent, core.state.selectedYear);
      existingNode.replaceWith(newNode);

      if (core.attachHeatmapSquareEvents) core.attachHeatmapSquareEvents();
      if (core.attachCardDragAndDropHandlers) core.attachCardDragAndDropHandlers();
      return true;
    }

    if (core.renderAll) core.renderAll();
    return true;
  };

  core.config = core.config || {};
  core.config.renderEngine = 'html'; // default to html
  core.svgCache = {};

  core.buildSvgHeatmapGrid = function(targetOrNull, year, cardHabitId, theme, habit) {
    const todayStr = core.getTodayKey();
    const cursorDateStr = core.getCursorDateKey ? core.getCursorDateKey() : todayStr;
    const isAll = targetOrNull === null;
    const isGroup = targetOrNull && targetOrNull.isGroup;

    // Check Cache
    // We invalidate based on the global state hash and the cursor date
    const cacheKey = `${cardHabitId}_${year}_${core._lastStateHash || ''}_${cursorDateStr}`;
    if (core.svgCache[cacheKey]) {
      return core.svgCache[cacheKey];
    }

    const startDate = new Date(year, 0, 1);
    const gridStart = new Date(startDate);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const endDate = new Date(year, 11, 31);
    const gridEnd = new Date(endDate);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

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

    const CELL_SIZE = 12;
    const CELL_GAP = 4;
    const COL_WIDTH = CELL_SIZE + CELL_GAP;

    const svgWidth = weekColumns.length * COL_WIDTH - CELL_GAP;
    const svgHeight = 7 * COL_WIDTH - CELL_GAP;

    let svgHTML = `<svg class="heatmap-svg-grid theme-${theme}" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%" preserveAspectRatio="xMinYMin meet">`;
    let defsHTML = '<defs>';
    let hasDefs = false;
    let rectsHTML = '';

    weekColumns.forEach((week, colIdx) => {
      const x = colIdx * COL_WIDTH;
      let colHTML = `<g transform="translate(${x}, 0)">`;

      week.forEach((d, rowIdx) => {
        const y = rowIdx * COL_WIDTH;
        const dateStr = core.formatDateKey(d);
        const isCurrentYear = d.getFullYear() === year;

        if (!isCurrentYear) {
          colHTML += `<rect x="0" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="3" fill="var(--color-square-empty)" opacity="0.12" />`;
          return;
        }

        const cellData = core.getCellData(dateStr, isAll ? 'all' : (isGroup ? targetOrNull : habit), todayStr);
        const isToday = dateStr === todayStr;
        const isCursorDay = dateStr === cursorDateStr;

        let fillValue = 'var(--color-square-empty)';
        let habitsDoneAttr = '';
        let classList = [];

        if (isAll || isGroup) {
          const numActive = cellData.activeHabits ? cellData.activeHabits.length : 0;
          if (numActive === 1) {
            fillValue = cellData.activeHabits[0].color;
          } else if (numActive > 1) {
            const gradId = `grad_${cardHabitId}_${dateStr}`;
            const colors = cellData.activeHabits.map(h => h.color);
            let stops = '';
            colors.forEach((col, idx) => {
              const p1 = (idx / colors.length) * 100;
              const p2 = ((idx + 1) / colors.length) * 100;
              stops += `<stop offset="${p1}%" stop-color="${col}" />`;
              stops += `<stop offset="${p2}%" stop-color="${col}" />`;
            });
            defsHTML += `<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">${stops}</linearGradient>`;
            hasDefs = true;
            fillValue = `url(#${gradId})`;
          }
          if (cellData.activeHabits && cellData.activeHabits.length > 0) {
            habitsDoneAttr = `data-habits-done="${core.escapeHTML(cellData.activeHabits.map(h => h.name).join(', '))}"`;
          }
        } else {
          const baseHex = core.normalizeHex(core.getHabitHexColor(habit));
          if (cellData.ratio > 0) {
            fillValue = core.getHabitHexWithAlpha(habit, cellData.ratio);
          } else {
            fillValue = `${baseHex}11`;
          }
        }

        if (cellData.isTargetDay && (!cellData.ratio || cellData.ratio === 0)) classList.push('target-day');
        if (cellData.isPaused) classList.push('is-paused-day');
        if (cellData.hasNote) classList.push('has-note');
        if (cellData.isRelapse) classList.push('relapse');
        if (isToday) classList.push('today');
        if (isCursorDay) classList.push('cursor-day');

        let rectElement = `<rect class="${classList.join(' ')}" x="0" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="3" fill="${fillValue}" ` +
             `data-date="${dateStr}" data-habit-id="${cardHabitId}" ` +
             `data-count="${cellData.count}" data-ratio="${cellData.ratio || 0}" ` +
             `data-relapse="${cellData.isRelapse ? 'true' : 'false'}" ` +
             `data-paused="${cellData.isPaused ? 'true' : 'false'}" ` +
             `data-unverified="${cellData.isUnverified ? 'true' : 'false'}" ` +
             `data-has-note="${cellData.hasNote ? 'true' : 'false'}" ` +
             `data-note="${core.escapeHTML(cellData.note)}" ${habitsDoneAttr} />`;

        // Add visual indicators (stroke or polygons)
        if (isCursorDay) {
            rectElement += `<rect x="-1" y="${y - 1}" width="${CELL_SIZE + 2}" height="${CELL_SIZE + 2}" rx="4" fill="none" class="cursor-day-stroke" />`;
        }
        if (isToday) {
             rectElement += `<rect x="-1" y="${y - 1}" width="${CELL_SIZE + 2}" height="${CELL_SIZE + 2}" rx="4" fill="none" class="today-stroke" />`;
        }
        if (cellData.hasNote) {
             rectElement += `<polygon points="${CELL_SIZE},${y} ${CELL_SIZE - 4},${y} ${CELL_SIZE},${y + 4}" class="note-indicator" />`;
        }
        if (cellData.isPaused) {
             rectElement += `<line x1="0" y1="${y}" x2="${CELL_SIZE}" y2="${y + CELL_SIZE}" class="paused-indicator" />`;
        }

        colHTML += rectElement;
      });
      colHTML += '</g>';
      rectsHTML += colHTML;
    });

    defsHTML += '</defs>';
    if (hasDefs) svgHTML += defsHTML;
    svgHTML += rectsHTML;
    svgHTML += '</svg>';

    core.svgCache[cacheKey] = svgHTML;
    return svgHTML;
  };

  core.downloadHeatmapSVG = function(habitId, year) {
    let target = null;
    let cardHabitId = 'all';
    let theme = 'green';
    let safeName = 'all_habits';

    if (habitId && habitId !== 'all') {
      const cleanId = String(habitId).replace(/^group_/, '');
      const rawHabit = core.state.habits.find(h => h.id === cleanId);
      if (!rawHabit) return;
      cardHabitId = rawHabit.id;
      theme = rawHabit.colorTheme || 'green';
      safeName = rawHabit.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      const descendantIds = core.getAllDescendantIds ? core.getAllDescendantIds(rawHabit.id) : [rawHabit.id];
      if (descendantIds.length > 1) {
        target = {
          isGroup: true,
          habit: rawHabit,
          title: rawHabit.name,
          habitIds: descendantIds,
          colorTheme: rawHabit.colorTheme
        };
      } else {
        target = rawHabit;
      }
    }

    const habitForGrid = target && target.isGroup ? target.habit : target;
    let svgString = core.buildSvgHeatmapGrid(target, year, cardHabitId, theme, habitForGrid);

    // Add XML namespace
    svgString = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');

    // Inject styling so it renders nicely when opened directly in a browser or image viewer
    const styleBlock = `
    <style>
      .heatmap-svg-grid { background-color: #0d1117; padding: 16px; border-radius: 6px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      rect { stroke-width: 0; }
      rect[fill="var(--color-square-empty)"] { fill: #161b22; }
      .cursor-day-stroke { stroke: #58a6ff; stroke-width: 2px; }
      .today-stroke { stroke: #8b949e; stroke-width: 2px; stroke-dasharray: 4,4; }
      .note-indicator { fill: #8b949e; }
      .paused-indicator { stroke: #8b949e; stroke-width: 1px; }
    </style>
    `;

    svgString = svgString.replace('>', '>' + styleBlock);

    // Trigger download
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habitual-${safeName}-${year}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  core.buildHeatmapCard = function(targetOrNull, year) {
    const todayStr = core.getTodayKey ? core.getTodayKey() : new Date().toISOString().split('T')[0];
    const cursorDateStr = core.getCursorDateKey ? core.getCursorDateKey() : todayStr;
    const isAll = targetOrNull === null;
    const isGroup = targetOrNull && targetOrNull.isGroup;
    const habit = (!isAll && !isGroup) ? targetOrNull : (isGroup && targetOrNull.habit ? targetOrNull.habit : null);

    let cardHabitId = 'all';
    if (isGroup) cardHabitId = 'group_' + targetOrNull.habitIds.join('_');
    else if (habit) cardHabitId = habit.id;

    const colorTheme = isAll ? null : (isGroup ? (targetOrNull.colorTheme || (habit ? habit.colorTheme : null)) : (habit ? habit.colorTheme : null));
    const isCustomHex = colorTheme && colorTheme.startsWith('#');
    const theme = isAll ? 'green' : (isCustomHex ? 'custom' : (colorTheme || 'green'));
    const isNegative = habit && habit.type === 'negative';

    const isCardFocused = core.focusedDayState && core.focusedDayState.habitId === cardHabitId && core.focusedDayState.dateStr;

    const streakData = core.calculateStreakForTarget ? core.calculateStreakForTarget(isAll ? 'all' : (isGroup ? targetOrNull : habit)) : { current: 0, longest: 0 };
    const stats = core.calculateYearStatsForTarget ? core.calculateYearStatsForTarget(isAll ? 'all' : (isGroup ? targetOrNull : habit), year) : { activeDaysCount: 0, totalCount: 0 };

    const isTopLevelGroup = isGroup && habit && !habit.parentId;
    const parentIdFilter = habit ? habit.parentId : null;
    const siblings = (habit || isTopLevelGroup) ? core.state.habits.filter(h => (h.parentId || null) === (parentIdFilter || null)) : [];
    const canMove = siblings.length > 1;
    const isDraggable = (!isAll && (!isGroup || isTopLevelGroup) && canMove);

    const card = document.createElement('div');
    card.className = `heatmap-card theme-${theme} ${isDraggable ? 'draggable-card' : ''} ${isCardFocused ? 'focused' : ''} ${(habit && habit.isPaused) ? 'is-paused' : ''}`;
    card.setAttribute('data-habit-id', cardHabitId);

    if (isDraggable) {
      card.setAttribute('draggable', 'true');
    }

    const route = core.parseHash ? core.parseHash() : { view: 'home' };
    const isCurrentOpenPage = route.view === 'habit' && route.habitId === (habit ? habit.id : null);

    let titleText = 'All';
    if (isGroup) titleText = targetOrNull.title;
    else if (habit) titleText = habit.name;

    let streakLabel = '';
    const shouldShowStreak = habit ? habit.showStreak === true : false;
    if (shouldShowStreak && streakData.current > 0) {
      if (streakData.isMonthly) streakLabel = `🔥 ${streakData.current} mo${streakData.current === 1 ? '' : 's'}`;
      else if (streakData.isWeekly) streakLabel = `🔥 ${streakData.current} wk${streakData.current === 1 ? '' : 's'}`;
      else streakLabel = `🔥 ${streakData.current} d`;
    }

    let countLabel = '';
    const shouldShowCount = habit ? habit.showCount !== false : true;
    if (stats.isMonthly) countLabel = `${stats.totalCount} of 12 months met in ${year}`;
    else if (stats.isWeekly) countLabel = `${stats.totalCount} of 52 weeks met in ${year}`;
    else countLabel = isNegative ? `${stats.totalCount} clean days in ${year}` : `${stats.totalCount} in ${year}`;

    let durationLabel = '';
    const shouldShowDuration = habit ? habit.showDuration === true : false;
    if (shouldShowDuration && habit) {
      const durationDays = core.getHabitDurationDays ? core.getHabitDurationDays(habit) : 0;
      if (durationDays > 0) {
        durationLabel = `⏱️ ${durationDays} day${durationDays === 1 ? '' : 's'}`;
      }
    }

    let frequencyBadgeHTML = '';
    if (habit) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      if (habit.frequencyType === 'weekly') {
        const dayIdx = (habit.targetDays && habit.targetDays.length > 0) ? habit.targetDays[0] : 1;
        frequencyBadgeHTML = `<span class="badge-frequency" title="Weekly target: Every ${dayNames[dayIdx]}">📅 Every ${dayNames[dayIdx]}</span>`;
      } else if (habit.frequencyType === 'monthly') {
        const mDay = habit.monthlyDay || '1';
        const dayLabel = mDay === 'last' ? 'Last day' : `${mDay}${core.getOrdinalSuffix(parseInt(mDay, 10))}`;
        frequencyBadgeHTML = `<span class="badge-frequency" title="Monthly goal: ${dayLabel} of month">📅 Every Month (${dayLabel})</span>`;
      } else if (habit.frequencyType === 'specific_days' && habit.targetDays && habit.targetDays.length > 0) {
        const daysStr = habit.targetDays.map(d => dayNames[d]).join(', ');
        frequencyBadgeHTML = `<span class="badge-frequency" title="Target days: ${daysStr}">📅 ${daysStr}</span>`;
      } else if (habit.frequencyType === 'custom_interval') {
        const cTarget = habit.customTarget || 1;
        const cInterval = habit.customInterval || 3;
        const cUnit = habit.customUnit || 'days';
        frequencyBadgeHTML = `<span class="badge-frequency" title="Custom schedule: ${cTarget}x every ${cInterval} ${cUnit}">📅 ${cTarget}x every ${cInterval} ${cUnit}</span>`;
      }
    }

    const colorHex = isAll ? '#39d353' : (core.getHabitHexColor ? core.getHabitHexColor(habit || targetOrNull) : '#33B679');

    const safeTitle = core.escapeHTML ? core.escapeHTML(titleText) : titleText;
    let titleContent = safeTitle;
    if (habit && !isCurrentOpenPage) {
      titleContent = `<a href="#/habit/${habit.id}" class="card-title-link" title="Open ${safeTitle}">${safeTitle}</a>`;
    }

    const habitTabHTML = `
      <div class="habit-color-tab" style="background-color: ${colorHex}1f; border-color: ${colorHex}4d; box-shadow: 0 0 10px ${colorHex}1f;">
        <span class="color-tab-pill" style="background-color: ${colorHex}; box-shadow: 0 0 6px ${colorHex};"></span>
        <h3 class="tab-title">${titleContent}</h3>
      </div>
    `;

    let subhabitsBadgeHTML = '';
    if (habit) {
      const directSubs = core.state.habits.filter(h => h.parentId === habit.id);
      if (directSubs.length > 0) {
        const isExpanded = core.state.expandedHabitIds && core.state.expandedHabitIds.has(habit.id);
        const arrowChar = isExpanded ? '▲' : '▼';
        const titleText = isExpanded ? 'Click to put away sub-habits' : `Click to view ${directSubs.length} sub-habit${directSubs.length === 1 ? '' : 's'}`;
        subhabitsBadgeHTML = `<button type="button" class="badge-subhabits btn-toggle-concertina" data-habit-id="${habit.id}" title="${titleText}">📁 ${directSubs.length} sub-habit${directSubs.length === 1 ? '' : 's'} <span class="concertina-arrow">${arrowChar}</span></button>`;
      }
    }

    let dependencyBadgeHTML = '';
    if (habit && habit.parentId && habit.parentDependency && habit.parentDependency !== 'none') {
      const parent = core.state.habits.find(h => h.id === habit.parentId);
      const pName = parent ? parent.name : 'Parent Task';
      if (habit.parentDependency === 'requires_parent') dependencyBadgeHTML = `<span class="badge-dependency" title="Requires '${core.escapeHTML(pName)}' to be completed first">🔗 Requires ${core.escapeHTML(pName)}</span>`;
      else if (habit.parentDependency === 'auto_log_parent') dependencyBadgeHTML = `<span class="badge-dependency" title="Logging this sub-habit auto-logs '${core.escapeHTML(pName)}'">⚡ Auto-logs ${core.escapeHTML(pName)}</span>`;
      else if (habit.parentDependency === 'auto_complete_from_parent') dependencyBadgeHTML = `<span class="badge-dependency" title="Logging '${core.escapeHTML(pName)}' auto-completes this sub-habit">🔄 Auto-completes with ${core.escapeHTML(pName)}</span>`;
      else if (habit.parentDependency === 'parent_days_only') dependencyBadgeHTML = `<span class="badge-dependency" title="Goal active only on days when '${core.escapeHTML(pName)}' is done">📅 Active on ${core.escapeHTML(pName)} Days</span>`;
    }

    let pausedBadgeHTML = (habit && habit.isPaused) ? '<span class="badge-paused" title="This habit is currently paused">⏸️ Paused</span>' : '';
    let sharedBadgeHTML = (habit && habit.sharing && habit.sharing.enabled) ? `<span class="badge-shared" title="Shared Habit (Collection: ${core.escapeHTML(habit.sharing.collection || '')})">👥 Shared</span>` : '';

    let bigLogButtonHTML = '';
    if (habit) {
      const cellData = core.getCellData ? core.getCellData(cursorDateStr, habit, todayStr) : { ratio: (habit.logs && habit.logs[cursorDateStr] && habit.logs[cursorDateStr].count) ? 1.0 : 0 };
      const ratio = Math.min(1.0, Math.max(0, cellData.ratio || 0));
      const isGoalMet = ratio >= 1.0;
      const hexColor = core.getHabitHexColor ? core.getHabitHexColor(habit) : '#33B679';

      const log = (habit.logs && habit.logs[cursorDateStr]) ? habit.logs[cursorDateStr] : null;
      const count = log ? log.count : 0;
      const target = Math.max(1, habit.dailyTarget || 1);

      const tickIcon = '<svg class="icon-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      const plusIcon = '<svg class="icon-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      const iconHTML = isGoalMet ? tickIcon : plusIcon;

      let bgStyle = '';
      if (isGoalMet) {
        const glowHex = core.getHabitHexWithAlpha ? core.getHabitHexWithAlpha(habit, 0.5) : hexColor;
        bgStyle = `background-color: ${hexColor}; color: #ffffff; border-color: ${hexColor}; box-shadow: 0 0 12px ${glowHex};`;
      } else {
        const alphaHex = core.getHabitHexWithAlpha ? core.getHabitHexWithAlpha(habit, Math.max(0.18, ratio * 0.85)) : hexColor;
        bgStyle = `background-color: ${alphaHex}; border-color: ${hexColor}; color: var(--text-main);`;
      }

      const isUpcoming = cursorDateStr > todayStr;
      const formattedCursorDate = core.formatPrettyDate ? core.formatPrettyDate(cursorDateStr) : cursorDateStr;

      const safeName = core.escapeHTML ? core.escapeHTML(habit.name) : habit.name;
      let tooltipText = '';
      if (isUpcoming) {
        tooltipText = isGoalMet
          ? `${safeName}: Upcoming Goal Pre-logged (${count}/${target}) on ${formattedCursorDate}. Click to log +1.`
          : `${safeName}: Upcoming (${count}/${target} pre-logged) on ${formattedCursorDate}. Click to pre-log.`;
      } else {
        tooltipText = isGoalMet
          ? `${safeName}: Goal Met (${count}/${target}) on ${formattedCursorDate}. Click to log +1.`
          : `${safeName}: ${count}/${target} completed on ${formattedCursorDate}. Click to log +1.`;
      }

      bigLogButtonHTML = `
        <button type="button" class="btn-card-quick-log ${isGoalMet ? 'goal-met' : ''}"
                style="${bgStyle}" data-habit-id="${habit.id}" data-goal-met="${isGoalMet ? 'true' : 'false'}" title="${tooltipText}" aria-label="${tooltipText}">
          <span class="quick-log-icon">${iconHTML}</span>
        </button>`;
    }

    let actionsHTML = '';
    if (habit) {
      const openMenuItem = !isCurrentOpenPage ? `<a href="#/habit/${habit.id}" class="card-menu-item">Open Habit Page</a>` : '';
      let dragHandleHTML = '';
      if (isDraggable) {
        const siblingIndex = siblings.findIndex(h => h.id === habit.id);
        const isFirstSibling = siblingIndex === 0;
        const isLastSibling = siblingIndex === siblings.length - 1;

        const hasArrows = !isFirstSibling || !isLastSibling;

        dragHandleHTML = `
          <div class="drag-handle-container">
            <div class="drag-handle" title="Tap to move, or drag to reorder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
            </div>
            ${hasArrows ? `
            <div class="drag-arrows hidden" tabindex="-1">
              ${!isFirstSibling ? `<button type="button" class="btn-move-up" data-habit-id="${habit.id}" aria-label="Move Up">▲</button>` : ''}
              ${!isLastSibling ? `<button type="button" class="btn-move-down" data-habit-id="${habit.id}" aria-label="Move Down">▼</button>` : ''}
            </div>
            ` : ''}
          </div>`;
      }

      actionsHTML = `
        <div class="card-header-actions">
          ${dragHandleHTML}
          <button type="button" class="btn-card-edit" data-habit-id="${habit.id}" title="Edit Habit" aria-label="Edit Habit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>`;
    } else if (!isAll) {
      actionsHTML = '';
    }

    let headerHTML = `
      <div class="heatmap-card-header ${actionsHTML ? 'has-actions' : ''}">
        <div class="heatmap-title-row">
          ${habitTabHTML}
          ${subhabitsBadgeHTML}
          ${dependencyBadgeHTML}
          ${frequencyBadgeHTML}
          ${pausedBadgeHTML}
          ${sharedBadgeHTML}
          ${streakLabel ? `<span class="badge-streak">${streakLabel}</span>` : ''}
          ${shouldShowCount ? `<span class="badge-count">${countLabel}</span>` : ''}
          ${durationLabel ? `<span class="badge-duration" title="Habit active duration">${durationLabel}</span>` : ''}
          ${bigLogButtonHTML}
        </div>
        ${actionsHTML}
      </div>`;

    let focusedToolbarHTML = '';
    if (isCardFocused && core.focusedDayState.dateStr) {
      const focusDateKey = core.focusedDayState.dateStr;
      let actionButtonsHTML = '';
      const habitsToInclude = isAll ? core.state.habits.filter(h => !h.hideFromAll) : (isGroup ? core.state.habits.filter(h => targetOrNull.habitIds.includes(h.id)) : (habit ? [habit] : []));

      habitsToInclude.forEach(h => {
        const hex = core.getHabitHexColor(h);
        const log = h.logs ? h.logs[focusDateKey] : null;
        let isDone = false;
        let labelText = '';

        if (h.type === 'negative') {
          const isClean = !log || log.count === 0;
          isDone = isClean;
          labelText = isClean ? `✨ ${h.name}` : `⚠️ Slip ${h.name} (${log.count})`;
        } else {
          const count = log ? log.count : 0;
          const target = h.dailyTarget || 1;
          isDone = count >= target;
          const targetText = target > 1 ? ` (${count}/${target})` : (count > 0 ? ` (${count})` : '');
          labelText = isDone ? `✓ +1 ${h.name}${targetText}` : `+1 ${h.name}${targetText}`;
        }

        actionButtonsHTML += `
          <button type="button" class="btn btn-secondary quick-log-btn ${isDone ? 'completed' : ''}"
                  style="--quick-btn-color: ${hex};" data-action-habit-id="${h.id}" data-action-date-key="${focusDateKey}" title="Click to add +1">
            ${core.escapeHTML(labelText)}
          </button>`;
      });

      focusedToolbarHTML = `
        <div class="focused-day-toolbar">
          <div class="focused-date-picker-wrap">
            <label for="focused-date-input-${cardHabitId}" class="focused-date-label">📅 Date:</label>
            <input type="date" id="focused-date-input-${cardHabitId}" class="focused-date-input" value="${focusDateKey}" max="${todayStr}">
          </div>
          <div class="focused-toolbar-actions">
            ${actionButtonsHTML}
            <button type="button" class="btn btn-ghost btn-close-toolbar" id="btn-close-focused-toolbar" title="Collapse details">&times; Close</button>
          </div>
        </div>`;
    }

    const startDate = new Date(year, 0, 1);
    const gridStart = new Date(startDate);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const endDate = new Date(year, 11, 31);
    const gridEnd = new Date(endDate);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

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

    let gridHTML = '';

    if (core.config.renderEngine === 'svg') {
      gridHTML = core.buildSvgHeatmapGrid(targetOrNull, year, cardHabitId, theme, habit);
    } else {
      gridHTML = `<div class="heatmap-weeks-grid theme-${theme}">`;
      weekColumns.forEach(week => {
        gridHTML += '<div class="heatmap-week-column">';
        week.forEach(d => {
          const dateStr = core.formatDateKey(d);
          const isCurrentYear = d.getFullYear() === year;

          if (!isCurrentYear) {
            gridHTML += '<div class="day-square" style="opacity: 0.12;"></div>';
            return;
          }

          const cellData = core.getCellData(dateStr, isAll ? 'all' : (isGroup ? targetOrNull : habit), todayStr);
          const isToday = dateStr === todayStr;
          const isCursorDay = dateStr === cursorDateStr;

          let squareStyle = '';
          let habitsDoneAttr = '';

          if (isAll || isGroup) {
            const numActive = cellData.activeHabits ? cellData.activeHabits.length : 0;
            if (numActive === 1) {
              squareStyle = `background-color: ${cellData.activeHabits[0].color};`;
            } else if (numActive > 1) {
              const colors = cellData.activeHabits.map(h => h.color);
              const stops = colors.map((col, idx) => {
                const p1 = ((idx / colors.length) * 100).toFixed(1);
                const p2 = (((idx + 1) / colors.length) * 100).toFixed(1);
                return `${col} ${p1}% ${p2}%`;
              }).join(', ');
              squareStyle = `background: linear-gradient(135deg, ${stops});`;
            }
            if (cellData.activeHabits && cellData.activeHabits.length > 0) {
              habitsDoneAttr = `data-habits-done="${core.escapeHTML(cellData.activeHabits.map(h => h.name).join(', '))}"`;
            }
          } else {
            const baseHex = core.normalizeHex(core.getHabitHexColor(habit));
            if (cellData.ratio > 0) {
              squareStyle = `background-color: ${core.getHabitHexWithAlpha(habit, cellData.ratio)};`;
            } else {
              squareStyle = `background-color: ${baseHex}11;`;
            }
          }

          const targetDayClass = (cellData.isTargetDay && (!cellData.ratio || cellData.ratio === 0)) ? 'target-day' : '';
          const isPausedDayClass = cellData.isPaused ? 'is-paused-day' : '';
          const hasNoteClass = cellData.hasNote ? 'has-note' : '';

          gridHTML += `
            <div class="day-square ${cellData.isRelapse ? 'relapse' : ''} ${isToday ? 'today' : ''} ${isCursorDay ? 'cursor-day' : ''} ${targetDayClass} ${isPausedDayClass} ${hasNoteClass}"
                 style="${squareStyle}" data-date="${dateStr}" data-habit-id="${cardHabitId}"
                 data-count="${cellData.count}" data-ratio="${cellData.ratio || 0}"
                 data-relapse="${cellData.isRelapse ? 'true' : 'false'}"
                 data-paused="${cellData.isPaused ? 'true' : 'false'}"
                 data-unverified="${cellData.isUnverified ? 'true' : 'false'}"
                 data-has-note="${cellData.hasNote ? 'true' : 'false'}"
                 data-note="${core.escapeHTML(cellData.note)}" ${habitsDoneAttr}>
            </div>`;
        });
        gridHTML += '</div>';
      });
      gridHTML += '</div>';
    }

    const shouldHideHeatmap = habit && (habit.hideHeatmap === true || (habit.isPaused && habit.hideHeatmapWhenPaused === true));

    if (shouldHideHeatmap) {
      card.classList.add('minimal-checkbox-card');
      card.innerHTML = headerHTML + focusedToolbarHTML;
      return card;
    }

    card.innerHTML = headerHTML + focusedToolbarHTML + `<div class="heatmap-wrapper"><div class="heatmap-grid-container">${gridHTML}</div></div>`;
    return card;
  };

})(window.HabitualCore);
