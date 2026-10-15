/**
 * Habitual - Background Sync & Version-Check Web Worker
 * Offloads background version checks and optional background sync polling off the main UI thread.
 */

let backgroundSyncEnabled = false;
let syncCode = null;
let passphrase = null;
let currentVersion = '1.21.22';

const VERSION_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // Every 4 hours
let versionTimer = null;
let syncTimer = null;

self.onmessage = function(e) {
  const { type, data } = e.data || {};

  switch (type) {
    case 'INIT':
      backgroundSyncEnabled = Boolean(data && data.backgroundSync);
      syncCode = data ? data.syncCode : null;
      passphrase = data ? data.passphrase : null;
      if (data && data.version) {
        currentVersion = data.version;
      }
      startTimers();
      break;

    case 'SET_BACKGROUND_SYNC':
      backgroundSyncEnabled = Boolean(data && data.enabled);
      startTimers();
      break;

    case 'CHECK_VERSION':
      checkForNewVersion();
      break;

    case 'TRIGGER_SYNC':
      performBackgroundSync();
      break;

    default:
      break;
  }
};

function startTimers() {
  if (versionTimer) clearInterval(versionTimer);
  if (syncTimer) clearInterval(syncTimer);

  // Check version immediately on init, then every few hours
  checkForNewVersion();
  versionTimer = setInterval(checkForNewVersion, VERSION_CHECK_INTERVAL_MS);

  if (backgroundSyncEnabled) {
    // Perform background sync every 30 minutes when enabled
    syncTimer = setInterval(performBackgroundSync, 30 * 60 * 1000);
  }
}

async function checkForNewVersion() {
  try {
    const res = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    const remoteVersion = json.version;
    if (remoteVersion && remoteVersion !== currentVersion) {
      self.postMessage({
        type: 'VERSION_UPDATE_AVAILABLE',
        version: remoteVersion,
        currentVersion: currentVersion
      });
    }
  } catch (err) {
    // Silently ignore offline network failures during version checks
  }
}

async function performBackgroundSync() {
  if (!backgroundSyncEnabled || !syncCode) return;
  try {
    // Notify main thread to execute background sync snapshot fetch
    self.postMessage({
      type: 'PERFORM_SYNC_REQUEST',
      syncCode: syncCode
    });
  } catch (err) {
    // Handle error silently
  }
}
