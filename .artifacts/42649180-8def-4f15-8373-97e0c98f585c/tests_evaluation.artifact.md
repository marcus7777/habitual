# Habitual Test Suite Audit & Expansion Strategy

Good morning! Reviewing our test suites is a fantastic initiative to ensure our test coverage remains comprehensive, reliable, and future-proof. Below is a detailed audit of our existing tests and a roadmap for expanding test coverage into newly added features.

## 1. Existing Test Suites Audit

| Test File | Scope & Purpose | Status | Coverage Highlights |
| :--- | :--- | :--- | :--- |
| **`tests/run-tests.js`** | Core Unit & Logic Test Suite (32 Features) | **117/117 Passing** ✅ | Dates, positive/negative habits, sub-habit hierarchies, color themes, backfilling, streak analytics, CSV import, backups, PWA offline, E2EE sync, widgets payload, shared habits, and toast alerts. |
| **`tests/test-share-roundtrip-playwright.js`** | Multi-Context Firestore Share & Sync Roundtrip | **15/15 Passing** ✅ | Context 1 upload/encryption, Context 2 join flow, preview modal, sub-habit linkage, error handling, and direct redirect for already-owned habits. |
| **`tests/test-widgets-playwright.js`** | Standalone PWA Widgets (`add`, `heatmaps`, `settings`) | **13/14 Passing** ✅ | Page title checks, habit list rendering, check-in quick actions, mini heatmap matrix rendering, sync page integration. |
| **`tests/test-android-playwright.js`** | Android Mobile Emulation (Pixel 5 Viewport) | **20/20 Passing** ✅ | App shell boot, create habit flow, quick check-in, scroll lock/unlock verification during modals, JSON backup export & restore roundtrip. |
| **`tests/test-firefox-android-playwright.js`** | Firefox Mobile Emulation (Pixel 5 Viewport) | **5/5 Passing** ✅ | Cross-browser mobile viewport loading, habit creation, scroll locking. |
| **`tests/benchmark-playwright.js`** | Performance Benchmarking Suite | **Passing / Tracked** ⚡ | Boot duration, HTML vs SVG render latency across 10, 50, and 100 habits, INP check-in latency, storage throughput (localStorage & IndexedDB). |

---

## 2. Identified Coverage Gaps & Opportunities

With our recent additions (widget reordering, in-page title filtering for sub-habits, and concertina sub-habit accordions), we have several prime candidates for new test cases:

### [NEW] Proposed Unit Test Additions (`tests/run-tests.js`)
1. **Feature 33: Widget In-Page Filtering & Descendant Tree Parsing**
   - Test `getDescendantIds(habitId)` correctly gathers all nested sub-habit IDs recursively.
   - Test that filtering habit lists excludes unrelated top-level habits while retaining the requested sub-habit branch.
2. **Feature 34: Widget Habit Reordering State Persistence**
   - Test `reorderHabitsInState(fromId, toId)` and `moveHabitInState(habitId, direction)` correctly update array indices and persist state to localStorage.
3. **Feature 35: Sub-Habit Concertina Accordion State & Default Collapse**
   - Test that sub-habit concertinas default to closed state on initial load and toggle correctly upon interaction.

### [NEW] Proposed Playwright E2E Test Additions (`tests/test-widgets-playwright.js`)
1. **Widget Filtering E2E Test**:
   - Open `widgets/add.html`, click a habit title link, verify that only the target habit and its sub-habits are displayed, and click "Show All Habits" to reset.
2. **Widget Reordering & Concertina E2E Test**:
   - Click the sub-habit concertina toggle badge (`📁 N sub-habits`), verify sub-habits expand, and test moving a habit up/down using the arrow popover menu.

---

## 3. Recommended Action Plan

Would you like me to implement these new test cases in `tests/run-tests.js` and `tests/test-widgets-playwright.js` to ensure 100% coverage of our newest widget filtering, reordering, and concertina features?
