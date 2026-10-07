# Habitual - GitHub-Style Habit Progression Engine

Habitual is a long-term, privacy-first habit progression tracker and visualizer featuring GitHub-style 7x52 year contribution heatmaps, 255-level continuous transparency shading, customizable color themes, flexible scheduling, drag-and-drop & tap-to-move habit reordering handles, nested sub-habits with concertina accordions, pause history, backfilling, CSV data importing, calendar reminders, and support for both positive (building) and negative (quitting) habit goals.

---

## 🌟 Comprehensive Features

### 📊 1. GitHub-Style 7x52 Heatmap Grid & Continuous Shading
- **Year-at-a-Glance Contribution Grid**: Visualize daily habit progress across a 52-week horizontal matrix (7 vertical days $\times$ 52 horizontal columns) for any selected year.
- **255-Level Transparency Shading**: Heatmap cells utilize continuous 8-character hex transparency (`#RRGGBBAA`) based on exact progress ratios (from 0% to 100% target completion count).
- **Interactive Day Focus & Tooltips**: Click any cell to inspect completion counts, dates, day notes/journal entries, and goal metrics.
- **Year Selector Navigation**: Seamlessly switch between current, past, or future years to review long-term consistency trends.

---

### 🎯 2. Positive & Negative Habit Types
- **Build Habits (Positive Goals)**: Track daily achievements and target completion counts (e.g., *Daily Coding*, *Gym Workouts*, *Meditation*).
- **Quit Habits (Negative Goals)**: Track abstinence from unwanted behaviors (e.g., *Days Since Caffeine*, *Quit Smoking*, *Sugar Fast*).
- **Automated Clean Days**: Days without relapses are automatically calculated, rendered on the heatmap, and celebrated as active clean streak days. Relapses are highlighted with distinct warning indicators.

---

### 📅 3. Flexible Schedules & Target Frequencies
Customizable schedules to match any habit tracking cadence:
- **Daily Target**: Set specific target counts per active day (1 to 100 completions/day).
- **Weekly Target**: Set target days of the week (e.g., *Every Monday*) with custom repeat week intervals (e.g., *Bi-weekly*) and full-week heatmap block coloring upon completion.
- **Monthly Target**: Track monthly goals (e.g., *1st, 15th, or last day of the month*) with repeat month intervals (e.g., *Quarterly*) and full-month block shading.
- **Specific Days of Week**: Select active days (e.g., *Mon, Wed, Fri*) and custom weekly repeat cycles.
- **Custom Interval / Arbitrary Periods**: Define custom frequencies such as *X times every N days, weeks, or months*.

---

### 🌲 4. Hierarchical Sub-Habits, Accordions & Dependency Rules
Organize complex habit routines into structured parent-child trees:
- **Nested Habit Navigation**: Create sub-habits (e.g., *"Leg Day"* or *"Upper Body"* nested inside *"Gym"*). Includes dedicated sub-habit URLs (`#/habit/parent_child`) and breadcrumb header navigation.
- **Concertina Accordion Drawers**: Sub-habits render inside interactive concertina accordions (`📁 X sub-habits ▲/▼`) with expandable drawers and a convenient *"Put away sub-habits"* collapse bar.
- **5 Parent Task Dependency Rules**:
  1. **Independent**: Logged freely on any day.
  2. **Requires Parent Completed First**: Sub-habit can only be logged after the parent task is marked complete for that day.
  3. **Auto-Log Parent Task**: Logging a sub-habit automatically logs the parent task.
  4. **Auto-Complete with Parent**: Completing the parent task automatically completes the sub-habit.
  5. **Only Active on Parent Days**: Goal and streak evaluations apply exclusively to days when the parent task was logged.
- **Combined Heatmap Aggregation**: Parent habits and home page groups feature aggregated heatmaps displaying multi-color diagonal gradients when multiple sub-habits are active on the same day.

---

### 🎨 5. Color Themes, Custom HEX Picker & Coloured Tab Headings
- **10 Preset Color Themes**: Select from 10 custom color palettes: `green` (Emerald), `blue` (GitHub Blue), `purple` (Electric Purple), `orange` (Fire), `crimson`, `cyan`, `emerald`, `amber`, `indigo`, and `rose`.
- **Custom HEX Color Picker**: Choose any custom HEX color code (`#RRGGBB`). Dynamic gradient level calculations generate seamless heatmap shade levels automatically.
- **Coloured Habit Tab Headings**: Habit cards feature distinctive colored tab headers with theme color pills, subtle border tinting, and glowing shadows.
- **Smart Palette Generation**: Automated hash-based color assignments via 24 Google Calendar colors (`colours.js`).

---

### 🎯 6. Prominent Quick Log Button & Goal Reached Tick Marks
- **Header Check-in Button**: Prominent quick log button (`btn-card-quick-log`) integrated directly into each habit card header.
- **Dynamic State Feedback**: Displays a checkmark `✓` in solid theme color when daily goal is reached, or a `+` icon with semi-transparent tint when progress is in flight.
- **One-Click Progress**: Click to increment progress (+1) instantly without opening dialogs.

---

### ⏱️ 7. Quick Logging, Date Navigation & Future Reminders
- **Date Navigator Controls**: Modal date picker includes shift buttons (`◀`, `▶`) to step backward or forward by single days easily.
- **Long-Press & Context Interactions**: Long-press or right-click any heatmap square to open the log dialog for that specific date.
- **Journal Entries & Note Indicators**: Attach notes or journal entries to individual days. Heatmap cells display a cut-off top-right corner indicator (`has-note`) when a note exists.
- **Future Date Calendar Reminders**: One-click Google Calendar event generation and downloadable `.ics` iCalendar files for future habit reminders.

---

### ⏸️ 8. Habit Pausing & Pause History Engine
- **Pause & Resume**: Pause inactive habits via card options menu or edit dialogue.
- **Pause History Tracking**: Maintains historical `pauseHistory` records (start/end date ranges) to preserve past pause periods.
- **Visual Paused Indicators**: Display `⏸️ Paused` badges on habit headers and distinct `is-paused-day` styling on heatmap cells so paused days do not affect streak calculations.

---

### ⌛ 9. Dialogue Backfilling & History Backfill Engine
- **Past Canvas Backfilling**: Pre-fill past history for up to 3,650 days (~10 years) to avoid starting with a blank canvas.
- **Edit Dialogue Integration**: Configure backfilling directly during habit creation or editing.
- **Context-Aware UI Wording**: Automatically adjusts labels for Quit/Negative habits (*"Backfill Clean Days"* vs *"Backfill Completions"*).
- **Configurable Profiles**: Configure completion frequency (100%, 80%, 50%, 25%) and daily instance counts.

---

### 🔥 10. Streak & Year Analytics Engine
- **Active Streak Counter (🔥)**: Displays current active streak badges directly on habit card headers for daily, weekly, or monthly cadences.
- **Longest Streaks**: Calculates personal best streak records.
- **Yearly Progress**: Tracks annual total completion counts, clean days, consistency percentages, and completed week/month totals.

---

### 📥 11. CSV Data Import Engine
- **Flexible CSV Importing**: Import activity logs directly from external habit trackers or custom CSV files (e.g., `hellohabit_habit_activity.csv`).
- **Flexible Date Parsing**: Auto-detects date formats including `DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`, and timestamps.
- **Automatic Habit Mapping**: Auto-creates missing habits, maps columns, and auto-detects quit/negative habits based on keywords.

---

### 💾 12. Data Backups & 100% Client-Side Privacy
- **100% Client-Side Local Storage**: All habit data and logs remain strictly private inside your browser's Local Storage.
- **Minimized Schema Storage**: Optimized state format inherits default values (names, colors) to minimize storage footprint.
- **JSON Backup Export & Restore**: Export full database backups in JSON format or restore backups on new devices instantly.
- **Data Reset**: Reset local storage data safely via the Data Management modal.

---

### 📱 13. Progressive Web App (PWA) & Mobile Ready
- **Offline Support**: Equipped with a Service Worker (`sw.js`) and Web Manifest (`manifest.json`) for full offline capability.
- **Installable Desktop & Mobile App**: Install as a standalone web application on iOS, Android, macOS, and Windows.
- **Responsive Dark Mode UI**: Dark-themed aesthetic inspired by modern developer dashboards and GitHub design guidelines.

---

### ↕️ 14. Drag & Drop Reordering & Tap-to-Move Handles
- **Mouse Drag-and-Drop**: Easily reorder habit cards across your gallery using the dedicated drag handle (`⋮⋮`).
- **Tap-to-Move Arrows**: Tap or click the drag handle to reveal floating Up (▲) and Down (▼) arrow controls for precise reordering on mobile or desktop.
- **Smart Position Sensing**: Automatically hides the Up arrow when a habit is at the top of its list, and hides the Down arrow when at the bottom.
- **Accessible Focus & Auto-Dismiss**: The move pop-up automatically receives focus when opened, supports keyboard navigation, and closes on focus loss (`blur`) or when clicking outside.

---

### 🎯 15. Arrow & WASD Key Date Cursor Navigation, Glowing Ring & Proximity Tooltips
- **Keyboard Navigation**: Use **Arrow keys** or **WASD keys** (`W` = Up 1 day, `S` = Down 1 day, `A` = Left 1 week, `D` = Right 1 week) to navigate the date cursor across the heatmap grid.
- **Glowing Gold Cursor Ring**: Every heatmap card highlights the active cursor box across all habits simultaneously with a high-contrast glowing gold outline ring (`#f1e05a`).
- **Mouse & Mobile Proximity Tooltips**: Moving the date cursor automatically displays a 1.2-second tooltip over the cursor square **closest to your mouse pointer** (or closest to the **center of your mobile screen**).
- **Hover & Enter Key Logging**: Press `Enter` while hovering your mouse over any heatmap card to instantly log +1 check-in for the active cursor date on that habit.
- **Cursor Date Target Logging**: The Quick Log button (`+`) on every card logs directly to the active cursor date if set to a different day than today.

---

### ☁️ 16. Multi-Target Cloud Sync, E2EE Encryption & High-Performance Granular Storage Engine
- **🔥 Encrypted Firebase Firestore Live Sync (`habit_data`)**: Real-time Zero-Knowledge client-side encrypted cloud synchronization across devices via Firestore `onSnapshot`. Disabled by default & requires a Master Passphrase.
- **Sync Channel Identifier Code**: Allows devices to pair and subscribe to the same encrypted document channel (`habit_data/{syncCode}`) without requiring server authentication or user login.
- **High-Performance Granular Persistence ($O(1)$ Writes)**: Daily check-ins, journal notes, and habit updates save directly to targeted IndexedDB records (`saveLog`, `saveHabit`, `saveSettings`) without stringifying or rewriting the monolithic application state.
- **Direct Object Payload Deserialization**: Reads structured objects directly from IndexedDB stores on app load, eliminating redundant `JSON.stringify` $\to$ `JSON.parse` roundtrips.
- **Smart LocalStorage Fallback**: Prevents main-thread UI blocking and `QuotaExceededError` storage limits by executing full string writes only when `localStorage` is the active engine.
- **Debounced Save Coalescing (`saveStateDebounced`)**: Coalesces rapid sequential flushes into a single debounced disk write.
- **Multi-Target Cloud Syncing**: Sync habit data across multiple providers including **Firebase Firestore**, **Google Drive**, **Dropbox**, **WebDAV**, and Local Storage.
- **End-to-End Encryption (AES-256-GCM)**: All synced backups are encrypted client-side using Web Crypto API AES-256-GCM prior to transmission. Raw unencrypted data never touches external servers.
- **CRDT-Inspired Non-Destructive Merging**: Pulls and merges updates from all active cloud providers using timestamped, non-destructive state payloads to ensure no data loss.
- **Multiple Local Storage Engines**: Toggle between `localStorage`, `IndexedDB`, and `GunDB` P2P storage drivers with automatic data migration.

---

## 🧪 Automated Testing Suite

Habitual includes a comprehensive automated test suite covering all core features across **80 individual test specifications in 27 test suites** (100% pass rate).

### Running Tests via Terminal (Node.js)
To execute the automated test suite in command line:
```bash
node tests/run-tests.js
```

### Running Tests via Web Browser
Open `web/tests.html` directly in any web browser to view the interactive test suite visual dashboard and real-time pass/fail report!

---

## 🛠️ Project Structure & Architecture

```
habitual/
├── web/
│   ├── index.html         # Application markup and modal dialogues
│   ├── styles.css         # Heatmap styles, dark theme, and responsive UI
│   ├── app.js             # Application entry point, routing & SW registration
│   ├── sw.js              # Service worker for offline PWA caching
│   ├── manifest.json      # Web app manifest configuration
│   ├── tests.html         # In-browser interactive test runner dashboard
│   └── js/
│       ├── state.js       # Core state management, color blending & ancestry helpers
│       ├── storage.js     # LocalStorage persistence, JSON export/restore
│       ├── render.js      # Heatmap card rendering, combined grids & concertina drawers
│       └── ui.js          # Modal controls, date navigation, ICS calendar & CSV importer
├── tests/
│   └── run-tests.js       # Node.js DOM-mocked automated test suite (74 tests)
├── assets/                # Application logo assets and artwork
├── firebase.json          # Firebase Hosting configuration
├── .firebaserc            # Firebase project target definition
└── package.json           # Node project manifest and npm test script
```

---

## 🚀 Deployment & Local Development

### Local Development Server
Serve the `web/` folder using any static HTTP server:
```bash
# Using Python built-in static server
python -m http.server --directory web 8080
```
Then open `http://localhost:8080` in your web browser.

### Firebase Hosting Deployment
Habitual is configured for single-command deployment to Firebase Hosting:
```bash
npx firebase deploy
```
