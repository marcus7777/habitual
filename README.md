# Habitual - GitHub-Style Habit Progression Engine

Habitual is a long-term, privacy-first habit progression tracker featuring GitHub-style 7x52 year contribution heatmaps, continuous 255-level transparency shading, custom HEX color pickers, flexible schedules, drag-and-drop card reordering, hierarchical sub-habits with concertina accordions, pause tracking, history backfilling, CSV imports, iCal reminders, keyboard navigation, and support for both positive (building) and negative (quitting) habit goals.

---

## 🌟 Features

### 📊 GitHub-Style 7x52 Heatmap Grid & Continuous Shading
- **52-Week Matrix**: Visualizes daily progress across a 7x52 grid for any selected year with year-selector navigation.
- **255-Level Transparency Shading**: Heatmap cells use 8-character hex transparency (`#RRGGBBAA`) scaled strictly to target completion ratio (0% to 100%).
- **Interactive Day Focus**: Inspect completion counts, dates, and journal/day notes directly.

### 🎯 Positive & Negative Habit Types
- **Build Habits (Positive)**: Track daily achievements toward target completion counts (e.g. coding, workouts, reading).
- **Quit Habits (Negative)**: Track abstinence from unwanted behaviors (e.g. caffeine, smoking). Days without relapses calculate automatically as clean days, while relapses show warning indicators.

### 📅 Flexible Schedules & Target Frequencies
- **Daily, Weekly, & Monthly Targets**: Custom counts per day, specific days of the week, or calendar month targets.
- **Specific Days & Custom Intervals**: Set active days (e.g., Mon/Wed/Fri) or arbitrary periods (*X times every N days/weeks/months*).

### 🌲 Hierarchical Sub-Habits & Accordions
- **Nested Sub-Habits**: Organize complex routines into parent-child trees with deep-link navigation (`#/habit/parent_child`) and breadcrumb headers.
- **Concertina Drawers**: Interactive expandable accordions (`📁 X sub-habits ▲/▼`) with a one-click *"Put away sub-habits"* collapse control.
- **5 Dependency Rules**:
  1. *Independent*: Logged freely.
  2. *Requires Parent Completed First*: Sub-habit unlocks only after parent completion.
  3. *Auto-Log Parent*: Logging sub-habit automatically logs parent.
  4. *Auto-Complete with Parent*: Completing parent automatically completes sub-habit.
  5. *Only Active on Parent Days*: Active only on days the parent task was logged.
- **Aggregated Heatmaps**: Parent cards render diagonal multi-color gradients for days with multiple active sub-habits.

### 🎨 Custom Color Styling & Dynamic Headings
- **Custom HEX Color Picker**: Select any HEX color (`#RRGGBB`). Dynamic gradient level calculations generate heatmap shading automatically.
- **Coloured Tab Headings**: Distinctive tab headers with color pills, subtle border tinting, and glowing shadows.
- **Smart Palette Hashing**: Automatic hash-based color assignment via 24 Google Calendar colors.

### 🎯 Quick Logging & Interactive Controls
- **Header Check-in Button**: Quick log button (`+` / `✓`) directly on card headers for one-click check-ins.
- **Date Navigation & Modal Controls**: Modal date picker with shift controls (`◀`, `▶`) and long-press/context interactions on heatmap cells.
- **Journal Notes & Cut-Off Corner**: Attach daily notes; heatmap cells display a cut-off top-right corner indicator when notes exist.
- **Calendar Reminders**: One-click Google Calendar links and downloadable `.ics` iCalendar reminder files.

### ⏸️ Pausing, History & Backfilling
- **Habit Pausing**: Pause habits with `pauseHistory` records so paused periods do not penalize streaks.
- **Backfill Engine**: Pre-fill past history up to 3,650 days (~10 years) with configurable completion density (100%, 80%, 50%, 25%). Context-aware for clean days vs. completions.

### 🔥 Analytics, CSV Import & Privacy
- **Streaks & Annual Stats**: Track active streaks (🔥), longest streaks, total completions, clean days, and annual consistency.
- **CSV Data Import**: Import activity logs from external trackers with auto-detection for dates (`DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`) and habit types.
- **100% Client-Side Privacy**: All data stays private in LocalStorage/IndexedDB. Export or restore full JSON backups anytime.

### 📱 PWA & Accessible Interaction
- **Offline PWA**: Full offline capability via Service Worker (`sw.js`) and Web Manifest (`manifest.json`). Dark-mode developer aesthetic.
- **Card Reordering**: Drag-and-drop handles (`⋮⋮`) with accessible tap-to-move Up (▲) / Down (▼) buttons for mobile and keyboard users.
- **Keyboard & Proximity Cursor**: Navigate heatmap grids with **Arrow** or **WASD** keys (`W`/`S`/`A`/`D`), highlighted by a glowing gold ring cursor (`#f1e05a`). Press **Enter** on hover to log check-ins.

### ☁️ Storage Engines, Cloud Sync & E2EE
- **Granular Storage ($O(1)$ Writes)**: High-performance IndexedDB persistence with debounced coalescing. Switchable storage engines (`localStorage`, `IndexedDB`).
- **End-to-End Encryption**: Zero-Knowledge AES-256-GCM encryption client-side using Web Crypto API.
- **Multi-Target Live Sync**: Live sync across devices using Encrypted Firestore Cloud Sync, WebRTC P2P, and Acoustic Sound Sync.

---

## 🧪 Automated Testing Suite

Habitual features an automated test suite covering all core logic across **81 test specifications in 27 test suites** with a 100% pass rate.

### 1. Terminal / CI Test Runner (Node.js)
Execute the DOM-mocked unit test suite directly in command line:
```bash
node tests/run-tests.js
```

### 2. Interactive Web Browser Dashboard
Open `web/tests.html` in any browser to run tests interactively with a visual pass/fail dashboard.

### 3. Android Mobile Device E2E Verification
Run end-to-end mobile browser automation tests on an attached Android device via ADB and Playwright:
```bash
node tests/test-android-playwright.js
```

---

## 🛠️ Project Structure

```
habitual/
├── web/
│   ├── index.html         # Application markup & modal dialogues
│   ├── styles.css         # Heatmap styles & responsive UI
│   ├── app.js             # Entry point, routing & SW registration
│   ├── sw.js              # Service worker for offline PWA caching
│   ├── manifest.json      # Web app manifest configuration
│   ├── sync.html          # Device pairing & sync status dashboard
│   ├── tests.html         # In-browser interactive test runner dashboard
│   ├── js/
│   │   ├── state.js       # State management, color blending & hierarchy helpers
│   │   ├── storage.js     # Storage drivers, E2EE & multi-target sync engine
│   │   ├── render.js      # Heatmap rendering, combined grids & accordions
│   │   ├── ui.js          # Modal controls, date navigation, ICS & CSV import
│   │   ├── audio-sync.js  # GGwave ultrasound audio data sync
│   │   └── colours.js     # Google Calendar palette array & color hashing
│   └── lib/
│       └── ggwave.js      # GGwave WebAssembly library for audio sync
├── tests/
│   └── run-tests.js       # Node.js automated test runner (81 tests)
├── assets/                # Application logo assets and artwork
├── firebase.json          # Firebase Hosting configuration
└── package.json           # Node project manifest and test scripts
```

---

## 🚀 Local Development & Deployment

### Local Server
```bash
python -m http.server --directory web 8080
```
Open `http://localhost:8080` in your browser.

### Firebase Hosting Deployment
```bash
npx firebase deploy
```
