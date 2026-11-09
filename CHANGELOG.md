# Changelog

All notable changes to Habitual will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.36.4] - 2026-11-09

### Added
- 

### Changed
- 

## [1.36.3] - 2026-11-09

### Added
- 

### Changed
- 

## [1.36.2] - 2026-11-09

### Added
- 

### Changed
- 

## [1.36.1] - 2026-11-09

### Added
- 

### Changed
- 

## [1.36.0] - 2026-11-09

### Added
- 

### Changed
- 

## [1.35.9] - 2026-11-09

### Added
- 

### Changed
- 

## [1.35.8] - 2026-11-09

### Added
- 

### Changed
- 

## [1.35.7] - 2026-11-09

### Added
- 

### Changed
- 

## [1.35.6] - 2026-11-09

### Added
- 

### Changed
- 

## [1.35.5] - 2026-11-09

### Added
- 

### Changed
- 

## [1.35.4] - 2026-11-09

### Added
- 

### Changed
- 

## [1.35.3] - 2026-11-08

### Added
- Extended Playwright E2E test assertions across private data security, read-only sharing, and template sharing tests.

### Changed
- Updated automated benchmark results and preview screenshot artifacts.

## [1.35.2] - 2026-11-08

### Added
- New Playwright automated test suites:
  - `test-private-data-security-playwright.js`: Private habit data protection and access isolation.
  - `test-security-privacy-playwright.js`: Security boundary and user data privacy checks.
  - `test-shared-data-integrity-playwright.js`: Data integrity validation during sharing operations.
- Security isolation methods in `web/js/storage.js` / `storage.min.js`.

### Changed
- Updated deployment script `deploy.js` and storage state management.

## [1.34.20] - 2026-11-07

### Added
- Read-Only Share preview UI and Playwright test suite (`test-read-only-share-playwright.js`).
- Preview screenshot for read-only habit sharing (`read_only_shared_habit_preview.png`).

### Changed
- UI layout and rendering updates in `web/js/ui.js` and `web/index.html` for read-only share views.

## [1.34.18] - 2026-11-07

### Changed
- Refactored render flow and state management across `web/js/render.js`, `web/js/state.js`, `web/js/storage.js`, and `web/js/ui.js`.
- Synchronized state updates and UI re-rendering pipeline.

## [1.34.15] - 2026-11-07

### Added
- Encryption key storage and management helpers in `web/js/crypto-keys.js` and `web/js/storage.js`.

### Changed
- Updated `README.md` documentation.

## [1.34.8] - 2026-11-06

### Added
- Firebase Cloud Functions infrastructure (`functions/index.js`, `firestore.rules`, `firebase.json`).
- `web/js/crypto-keys.js` module for secure client-side key handling.
- Integrated test runner `tests/run-tests.js`.

### Changed
- Extended storage adapter in `web/js/storage.js` for cloud synchronization and encryption support.

## [1.34.2] - 2026-11-05

### Added
- Automated JavaScript and CSS minification pipeline via `build.js`.
- Pre-built minified distribution assets (`ui.min.js`, `storage.min.js`, `render.min.js`, `state.min.js`, `styles.min.css`).

## [1.33.17] - 2026-11-04

### Added
- Habit hiding / visibility toggle feature with state persistence.
- Playwright UI test suite for habit hiding (`test-habit-hiding-playwright.js`).

### Changed
- Updated UI controls and habit list rendering in `web/js/render.js`, `web/js/state.js`, and `web/js/ui.js`.

## [1.33.12] - 2026-11-04

### Added
- Template sharing capabilities and Playwright verification tests (`test-template-share-playwright.js`).

### Changed
- Enhanced state persistence and UI sharing actions.

## [1.33.3] - 2026-11-04

### Added
- Initial Playwright test suite for habit template sharing.

### Changed
- Refactored core application state machine in `web/js/state.js` and user interaction handlers in `web/js/ui.js`.
