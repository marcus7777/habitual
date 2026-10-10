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

  // --- INITIALIZATION ---
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => {
      const initPromise = core.loadStateAsync ? core.loadStateAsync() : Promise.resolve(core.loadState ? core.loadState() : null);
      initPromise.then(() => {
        if (core.initUI) core.initUI();
        registerServiceWorker();

        if (typeof window !== 'undefined' && window.addEventListener) {
          window.addEventListener('hashchange', () => {
            if (core.renderAll) core.renderAll();
          });
        }

        if (core.renderAll) core.renderAll();

        if (core.checkPendingVerifications) {
          core.checkPendingVerifications();
        }

        if (core.state && core.state.showQuickLogOnStartup) {
          if (core.openLogModal && core.getTodayKey) {
            core.openLogModal(core.getTodayKey());
          }
        }
      });
    });
  }

  // --- EXPORT ---
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
  }

})(window.HabitualCore);