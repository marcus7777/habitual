# Habitual - GitHub-Style Habit Progression Engine

Habitual is a long-term, privacy-first habit progression tracker and visualizer featuring GitHub-style 7x52 year contribution heatmaps, 255-level continuous transparency shading, customizable color themes, flexible scheduling, nested sub-habits with concertina accordions, pause history, backfilling, CSV data importing, calendar reminders, and support for both positive (building) and negative (quitting) habit goals.

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

## 🧪 Automated Testing Suite

Habitual includes a comprehensive automated test suite covering all core features across **53 individual test specifications in 22 test suites** (100% pass rate).

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
│   └── run-tests.js       # Node.js DOM-mocked automated test suite (53 tests)
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
