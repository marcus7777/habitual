# Background Sync & Version-Check Web Worker Implementation Plan

Introduce a dedicated Web Worker (`web/js/sync.worker.js`) and a lightweight `web/version.json` endpoint to handle background Firebase synchronization, E2EE decryption/encryption, state merging, and app version polling off the main UI thread. Background sync will be controllable via a settings toggle and **off by default**.

## User Review Required

> [!IMPORTANT]
> - **Web Worker Architecture**: Moving Firebase sync & E2EE operations to a Web Worker keeps the main UI thread fully unblocked (preventing any jank during heavy check-in rendering or rapid logging).
> - **Opt-In Background Sync**: A new settings option for "Background Sync" will be introduced and **off by default**. When disabled, the worker stays idle or only performs manual sync on demand. When enabled, it performs background polling every few hours.
> - **version.json**: A static JSON file at `web/version.json` containing the current deployed version (e.g., `{"version": "1.21.22"}`).

## Open Questions

- None.

## Proposed Changes

### [NEW] [version.json](file:///C:/Users/marcu/Documents/antigravity/habitual/web/version.json)
- Lightweight version metadata endpoint (`{"version": "1.21.22"}`) updated automatically during deployment or bump scripts.

### [NEW] [sync.worker.js](file:///C:/Users/marcu/Documents/antigravity/habitual/web/js/sync.worker.js)
- Background Web Worker script.
- Listens for initialization commands and user background sync preference. When background sync is enabled, periodically polls `version.json` and sync targets.
- Posts messages (`STATE_UPDATED`, `VERSION_UPDATE_AVAILABLE`) back to main thread.

### [MODIFY] [core.js](file:///C:/Users/marcu/Documents/antigravity/habitual/web/js/core.js)
- Initialize and manage `sync.worker.js` instance.
- Add background sync setting toggle persistence (`backgroundSync: false` by default).

### [MODIFY] [sync.html](file:///C:/Users/marcu/Documents/antigravity/habitual/web/sync.html)
- Add UI toggle for enabling/disabling Background Sync.

### [MODIFY] [run-tests.js](file:///C:/Users/marcu/Documents/antigravity/habitual/tests/run-tests.js)
- Add unit tests verifying background sync default state (`false`), toggle persistence, and worker messaging protocol.

## Verification Plan

### Automated Tests
- Run `cmd /c npm test` to execute core test suite including new worker messaging tests.
- Run Playwright widget and sync E2EE round-trip test suites.

### Manual Verification
- Deploy to Firebase Hosting and verify smooth background sync and version detection.
