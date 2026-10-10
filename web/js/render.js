window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  core.renderAll = function() {
    if (!core.elements.yearSelector || !core.elements.heatmapsGallery) return;
    core.renderYearSelector();
    core.renderHeatmapsGallery();
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

      const navAddSub = document.getElementById('btn-nav-add-sub');
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
    core.state.habits.forEach(h => {
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
    if (!years.includes(core.state.selectedYear)) {
      core.state.selectedYear = years[0];
    }
    core.elements.yearSelector.innerHTML = years
      .map(y => `<option value="${y}" ${y === core.state.selectedYear ? 'selected' : ''}>${y}</option>`)
      .join('');
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

    if (core.state.habits.length === 0) {
      if (core.elements.headerMenuContent && core.elements.btnHeaderMenu) {
        const isHidden = core.elements.headerMenuContent.classList.toggle('hidden');
        core.elements.btnHeaderMenu.setAttribute('aria-expanded', !isHidden);
      }
      return;
    }

    const fragment = (typeof document !== 'undefined' && typeof document.createDocumentFragment === 'function')
      ? document.createDocumentFragment()
      : document.createElement('div');

    if (route.view === 'home') {
      const topLevelHabits = core.state.habits.filter(h => !h.parentId);
      const habitsInAll = core.state.habits.filter(h => !h.hideFromAll);
      if (topLevelHabits.length > 1 && habitsInAll.length > 0) {
        const combinedCard = core.buildHeatmapCard(null, core.state.selectedYear);
        fragment.appendChild(combinedCard);
      }

      topLevelHabits.forEach(habit => {
        const habitNode = core.renderHabitTree(habit, core.state.selectedYear);
        fragment.appendChild(habitNode);
      });
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

    core.elements.heatmapsGallery.appendChild(fragment);

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

  core.buildHeatmapCard = function(targetOrNull, year) {
    const todayStr = core.getTodayKey();
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

    const isCardFocused = core.focusedDayState.habitId === cardHabitId && core.focusedDayState.dateStr;

    const streakData = core.calculateStreakForTarget(isAll ? 'all' : (isGroup ? targetOrNull : habit));
    const stats = core.calculateYearStatsForTarget(isAll ? 'all' : (isGroup ? targetOrNull : habit), year);

    const isTopLevelGroup = isGroup && habit && !habit.parentId;
    const isDraggable = (!isAll && (!isGroup || isTopLevelGroup));

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

    const colorHex = isAll ? '#39d353' : core.getHabitHexColor(habit || targetOrNull);

    let titleContent = core.escapeHTML(titleText);
    if (habit && !isCurrentOpenPage) {
      titleContent = `<a href="#/habit/${habit.id}" class="card-title-link" title="Open ${core.escapeHTML(titleText)}">${core.escapeHTML(titleText)}</a>`;
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
      const cellData = core.getCellData(cursorDateStr, habit, todayStr);
      const ratio = Math.min(1.0, Math.max(0, cellData.ratio || 0));
      const isGoalMet = ratio >= 1.0;
      const hexColor = core.getHabitHexColor(habit);

      const log = (habit.logs && habit.logs[cursorDateStr]) ? habit.logs[cursorDateStr] : null;
      const count = log ? log.count : 0;
      const target = Math.max(1, habit.dailyTarget || 1);

      let iconHTML = isGoalMet ? '✓' : '+';

      let bgStyle = '';
      if (isGoalMet) {
        bgStyle = `background-color: ${hexColor}; color: #ffffff; border-color: ${hexColor}; box-shadow: 0 0 12px ${core.getHabitHexWithAlpha(habit, 0.5)};`;
      } else {
        const alphaHex = core.getHabitHexWithAlpha(habit, Math.max(0.18, ratio * 0.85));
        bgStyle = `background-color: ${alphaHex}; border-color: ${hexColor}; color: var(--text-main);`;
      }

      const formattedCursorDate = core.formatPrettyDate(cursorDateStr);

      const tooltipText = isGoalMet
        ? `${core.escapeHTML(habit.name)}: Goal Met (${count}/${target}) on ${formattedCursorDate}. Click to open log details.`
        : `${core.escapeHTML(habit.name)}: ${count}/${target} completed on ${formattedCursorDate}. Click to log +1.`;

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
        const siblings = core.state.habits.filter(h => h.parentId === habit.parentId);
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
          <div class="card-context-menu-dropdown">
            <button type="button" class="btn-card-menu-toggle" title="Options" aria-label="Habit Options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
            <div class="card-menu-content hidden">
              ${openMenuItem}
              <button type="button" class="card-menu-item btn-card-add-sub" data-habit-id="${habit.id}">+ Add Sub-habit</button>
              <button type="button" class="card-menu-item btn-card-edit" data-habit-id="${habit.id}">Edit Habit</button>
              <button type="button" class="card-menu-item btn-card-pause" data-habit-id="${habit.id}">${habit.isPaused ? '▶️ Resume Habit' : '⏸️ Pause Habit'}</button>
              <button type="button" class="card-menu-item btn-card-delete text-danger" data-habit-id="${habit.id}">Delete Habit</button>
            </div>
          </div>
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

    let gridHTML = `<div class="heatmap-weeks-grid theme-${theme}">`;
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
               data-has-note="${cellData.hasNote ? 'true' : 'false'}"
               data-note="${core.escapeHTML(cellData.note)}" ${habitsDoneAttr}>
          </div>`;
      });
      gridHTML += '</div>';
    });
    gridHTML += '</div>';

    card.innerHTML = headerHTML + focusedToolbarHTML + `<div class="heatmap-wrapper"><div class="heatmap-grid-container">${gridHTML}</div></div>`;
    return card;
  };

})(window.HabitualCore);
