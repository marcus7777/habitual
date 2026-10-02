# Habitual - GitHub-Style Habit Progression Engine

Habitual is a long-term, privacy-first habit progression tracker and visualizer featuring GitHub-style 7x52 year contribution heatmaps, customizable color themes, flexible scheduling, nested sub-habits, CSV data importing, and support for both positive (building) and negative (quitting) habit goals.

---

## 🌟 Comprehensive Features

### 📊 1. GitHub-Style 7x52 Heatmap Grid
- **Year-at-a-Glance Contribution Grid**: Visualize daily habit progress across a 52-week horizontal matrix (7 vertical days $\times$ 52 horizontal columns) for any selected year.
- **Dynamic Intensity Shading**: Heatmap cells automatically scale through 5 color intensity levels ($0$ to $4$) based on target completion count, completion ratios, or streak streaks.
- **Interactive Day Focus & Tooltips**: Hover or click any cell to inspect exact completion counts, dates, day notes/journal entries, and goal metrics.
- **Year Selector Navigation**: Seamlessly switch between current, past, or future years to review long-term consistency trends.

---

### 🎯 2. Positive & Negative Habit Types
- **Build Habits (Positive Goals)**: Track daily achievements and target completion counts (e.g., *Daily Coding*, *Gym Workouts*, *Meditation*).
- **Quit Habits (Negative Goals)**: Track abstinence from unwanted behaviors (e.g., *Days Since Caffeine*, *Quit Smoking*, *Sugar Fast*).
- **Automated Clean Days**: Days without relapses are automatically calculated, rendered on the heatmap, and celebrated as active clean streak days.

---

### 📅 3. Flexible Schedules & Target Frequencies
Customizable schedules to match any habit tracking cadence:
- **Daily Target**: Track specific target counts per active day (1 to 100 completions/day).
- **Weekly Target**: Set specific target days of the week (e.g., *Every Monday*) with custom repeat week intervals (e.g., *Bi-weekly*) and optional full-week heatmap block coloring upon completion.
- **Monthly Target**: Track monthly goals (e.g., *1st, 15th, or last day of the month*) with repeat month intervals (e.g., *Quarterly*) and full-month block shading.
- **Specific Days of Week**: Choose specific active days (e.g., *Mon, Wed, Fri*) and custom weekly repeat cycles.
- **Custom Interval / Arbitrary Periods**: Define custom frequencies such as *X times every N days, weeks, or months*.

---

### 🌲 4. Hierarchical Sub-Habits & Dependency Rules
Organize complex habit routines into structured parent-child trees:
- **Nested Habit Navigation**: Create sub-habits (e.g., *"Leg Day"* or *"Upper Body"* nested inside *"Gym"*). Dedicated sub-habit URLs (`#/habit/parent_child`) and breadcrumb header navigation.
- **5 Parent Task Dependency Rules**:
  1. **Independent**: Can be logged freely on any day.
  2. **Requires Parent Completed First**: Sub-habit can only be logged after the parent task is marked complete for that day.
  3. **Auto-Log Parent Task**: Logging a sub-habit automatically logs the parent task.
  4. **Auto-Complete with Parent**: Completing the parent task automatically completes the sub-habit.
  5. **Only Active on Parent Days**: Goal and streak evaluations apply exclusively to days when the parent task was logged.

---

### 🎨 5. Color Themes & Custom HEX Color Picker
- **10 Preset Themes**: Select from 10 custom color palettes: `green` (Emerald), `blue` (GitHub Blue), `purple` (Electric Purple), `orange` (Fire), `crimson`, `cyan`, `emerald`, `amber`, `indigo`, and `rose`.
- **Custom HEX Color Picker**: Choose any custom HEX color code (`#RRGGBB`). Dynamic gradient level calculations generate seamless heatmap shade levels automatically.
- **Smart Palette Generation**: Automated color assignments via `Please.js` for quick hash-based color generation.

---

### ⏱️ 6. Quick Logging & Calendar Date Picker
- **Quick Check-in Today**: Fast +1 check-in trigger directly from the main header menu.
- **Calendar Date Selector**: Quickly select past or future dates with quick date pills (*Today*, *Yesterday*, *2 Days Ago*, *3 Days Ago*) or a native calendar date picker.
- **Day Notes & Journal Entries**: Attach notes or mini-journal logs to individual entry days.
- **Show on Startup**: Optional setting to prompt entry dialogs on app load.

---

### ⌛ 7. Past History Backfilling
- **Canvas Backfill**: Avoid starting with a blank canvas when adding an existing habit. Pre-fill past history for up to 3,650 days (~10 years).
- **Customizable Backfill Profiles**: Configure completion frequency (100%, 80%, 50%, 25%) and instance counts (1 to 10 instances/day or random variable counts).

---

### 🔥 8. Streak & Year Analytics Engine
- **Active Streak Counter (🔥)**: Display current active streak badges directly on habit card headers.
- **Longest Streaks**: Calculate personal best streak records.
- **Yearly Progress**: Track annual total completion counts, consistency percentages, and completed week/month totals.

---

### 📥 9. CSV Data Import Engine
- **Flexible CSV Importing**: Import activity logs directly from external habit trackers or custom CSV files (e.g., `hellohabit_habit_activity.csv`).
- **Flexible Date Parsing**: Auto-detects date formats including `DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`, and timestamps.
- **Automatic Habit Mapping**: Auto-creates missing habits, maps columns, and auto-detects quit/negative habits based on keywords.

---

### 💾 10. Data Backups & 100% Privacy
- **100% Client-Side Local Storage**: All habit data and logs remain strictly private inside your browser's Local Storage.
- **JSON Backup Export & Restore**: Export full database backups in JSON format or restore backups on new devices instantly.
- **Data Reset**: Reset local storage data safely via the Data Management modal.

---

### 📱 11. Progressive Web App (PWA) & Mobile Ready
- **Offline Support**: Equipped with a Service Worker (`sw.js`) and Web Manifest (`manifest.json`) for full offline capability.
- **Installable Desktop & Mobile App**: Install as a standalone web application on iOS, Android, macOS, and Windows.
- **Responsive Dark Mode UI**: Dark-themed aesthetic inspired by modern developer dashboards and GitHub design guidelines.

---

## 🧪 Automated Testing Suite

Habitual includes a comprehensive automated test suite covering all 11 core features (28 individual test specifications).

### Running Tests via Terminal (Node.js)
To execute the automated test suite in command line:
```bash
node tests/run-tests.js
```

### Running Tests via Web Browser
Open `web/tests.html` directly in any web browser to view the interactive test suite visual dashboard and real-time pass/fail report!
