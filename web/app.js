/**
 * Habitual - Minimalist Habit Progress Visualizer
 * Vanilla JavaScript & LocalStorage Implementation with Pure Heatmap Mode & Interactive Day Focus
 */

window.HabitualCore = window.HabitualCore || {};

(function(core) {
  'use strict';

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('[PWA] Service Worker registered:', reg.scope))
          .catch((err) => console.warn('[PWA] Service Worker registration error:', err));
      });
    }
  }

  function handleUrlParamsOnStartup() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const action = urlParams.get('action');
      const habitId = urlParams.get('habitId');

      if (action === 'quick-log') {
        if (core.openLogModal && core.getTodayKey) {
          core.openLogModal(core.getTodayKey(), habitId || null);
        }
      } else if (action === 'heatmaps' || action === 'widgets') {
        if (habitId && core.state) {
          core.state.selectedHabitId = habitId;
          if (core.renderAll) core.renderAll();
        }
        if (action === 'widgets' && core.openWidgetsModal) {
          core.openWidgetsModal();
        }
      }
    } catch (e) {
      console.warn('Failed to parse URL startup params:', e);
    }
  }

  // --- INITIALIZATION ---
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => {
      if (core.loadState) core.loadState();
      if (core.initUI) core.initUI();
      registerServiceWorker();

      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('hashchange', () => {
          if (core.renderAll) core.renderAll();
        });
      }

      if (core.renderAll) core.renderAll();
      if (core.updatePWAWidgets) core.updatePWAWidgets();

      handleUrlParamsOnStartup();

      if (core.state && core.state.showQuickLogOnStartup) {
        if (core.openLogModal && core.getTodayKey) {
          core.openLogModal(core.getTodayKey());
        }
      }
    });
  }

  // --- EXPORT ---
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
  }

})(window.HabitualCore);
