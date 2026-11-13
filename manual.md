# 📖 Habitual — Complete User Manual & Visual Guide

Welcome to the official User Manual for **Habitual**, a minimalist, local-first, zero-knowledge encrypted habit progression visualizer. This manual covers every feature, screen, setting, and workflow in the application, complete with high-resolution visual screenshots.

---

## 🚀 1. Architecture & Privacy Core

Habitual is engineered with a strict **local-first, privacy-first** philosophy:

> **Zero-Knowledge Encryption:** All shared habits, sync payloads, and collaborator chat messages are encrypted client-side using **AES-256-GCM** encryption and cryptographically signed with **ECDSA P-256** WebCrypto keypairs.
>
> **Offline Capability:** Data is stored locally in `localStorage` / `IndexedDB` with PWA Service Worker offline caching.
>
> **No Plaintext Servers:** Cloud databases and functions only process encrypted ciphertexts and verified digital signatures.

---

## 📊 2. Main Dashboard & Navigation

### 2.1 Main Overview Heatmaps View

The primary dashboard provides a fluid, GitHub-style 7x52 heatmap activity grid for all your active habits.

![Main Overview Heatmaps](/home/marcus/habitual/tests/screenshots/manual/01_main_habits_heatmap_overview.png)

#### Key Interface Elements:
1. **GitHub-Style 7x52 Heatmap Grid:** Displays 365 days of activity. Cell transparency and color intensity dynamically scale based on your completion ratio (`count / dailyTarget`).
2. **Streak & Annual Analytics:** Displays current active unbroken streak 🔥 and total completed units for the year.
3. **Quick Action Bar:** Check-in buttons (+1 / -1), habit options gear ⚙️, and sharing indicators.
4. **Header Navigation Dropdown:** Access the **Todo Page**, **Sync Page**, **Template Gallery**, and **Global App Settings**.

---

### 2.2 Sub-Habit Concertina Accordion

Habitual supports multi-level hierarchical habit trees (parent habits with nested sub-habits).

![Concertina Sub-Habit Accordion](/home/marcus/habitual/tests/screenshots/manual/02_subhabit_accordion_expanded.png)

#### Accordion Workflows:
- **Collapsing / Expanding Sub-Habits:** Click the concertina button (`▼ 2 sub-habits`) on any parent habit card to expand or collapse nested sub-habits underneath.
- **Combined Progress Calculation:** Parent habits can automatically derive progress from sub-habits or auto-complete when sub-habits are logged.

---

### 2.3 Single Habit Focus View

Clicking any habit title navigates to a dedicated single-habit page (`#/habit/:id`).

![Single Habit Focus Page View](/home/marcus/habitual/tests/screenshots/manual/03_single_habit_page_view.png)

#### Features:
- **Full-Width Heatmap:** Enlarged view showing complete historical check-in squares.
- **Dedicated Sub-Habit Tree:** Expanded view of all sub-habits under this specific habit.
- **Focused Statistics:** Detailed breakdown of best streak, total check-ins, and target frequency.

---

## ⚙️ 3. Habit Options & Configuration Modal

Opening the Habit Options modal (clicking ⚙️ on any habit) reveals four tabs and an advanced settings accordion.

### 3.1 Tab 1: Parent Options & Theme Picker

![Habit Options Modal Parent Tab](/home/marcus/habitual/tests/screenshots/manual/04_edit_habit_modal_parent_tab.png)

- **Positive vs Negative (Quit) Habits:** Positive habits build daily routines (e.g. Reading, Exercise). Negative Quit habits automatically calculate clean days and track slip-ups.
- **Color Themes:** Choose from preset Google Calendar palette colors or enter any custom 6-digit **HEX color picker** code. Habitual automatically generates 4 gradient alpha levels for your heatmap squares.

---

### 3.2 Tab 2: Sub-Habit Auto-Sorting

![Sub-Habit Auto-Sort Tab](/home/marcus/habitual/tests/screenshots/manual/05_edit_habit_modal_subhabit_tab.png)

#### Sorting & Display Modes:
- **Alphabetical Sorting:** Automatically sorts sub-habits A–Z or Z–A.
- **Incomplete First:** Pushes pending sub-habits to the top of the list until logged.
- **Incomplete First (7 Days):** Considers sub-habit check-ins over the last 7 days.
- **Manual Drag-and-Drop:** Reorder sub-habits manually using left-side reorder arrows (▲/▼).

---

### 3.3 Tab 3: Circumstantial Hiding Rules

![Circumstantial Hiding Rules Tab](/home/marcus/habitual/tests/screenshots/manual/06_edit_habit_modal_hiding_rules.png)

#### Hiding Rules Engine:
- **Time-of-Day Rules:** Hide habits before or after specific hours (e.g. hide "Evening Reflection" until 6:00 PM).
- **Location Geohash Rules:** Hide habits when at or away from specific location geohashes (e.g. hide "Gym Workout" when away from gym).
- **Prerequisite Dependencies:** Hide a sub-habit until a required parent task is completed.

---

### 3.4 Tab 4: Encrypted Collaborator Chat Space

![Encrypted Chat Space Tab](/home/marcus/habitual/tests/screenshots/manual/07_edit_habit_modal_chat_tab.png)

- **Zero-Knowledge Chat:** All messages typed into the collaborator chat space are encrypted client-side using AES-256-GCM before transmission.
- **Signature Verification:** Every message is cryptographically signed with your device's WebCrypto ECDSA private key. Unsigned or unauthorized messages are automatically rejected.

---

### 3.5 Advanced Settings Accordion

Clicking the **Advanced Settings Accordion** (`▼ Advanced Settings`) expands specialized data tools.

![Advanced Settings Accordion](/home/marcus/habitual/tests/screenshots/manual/08_edit_habit_modal_advanced_accordion.png)

#### Accordion Tools:
- **Past History Backfilling:** Automatically populate past check-in history over 30, 60, 90, or 365 days so you don't start from a blank canvas.
- **Clear History Before Date:** Wipe historical check-in logs prior to a chosen date while keeping current data intact.
- **SVG Vector Export:** Download a crisp, scalable SVG vector graphic of the habit's 365-day heatmap grid.
- **Habit Deletion:** Delete the habit, with options to delete or promote sub-habits.

---

## 📝 4. Daily Check-Ins & Journaling

### 4.1 Quick Check-In & Activity Log Modal

Clicking any day square on a heatmap opens the Activity Log modal.

![Quick Check-In Activity Log Modal](/home/marcus/habitual/tests/screenshots/manual/09_quick_log_modal.png)

#### Features:
- **Date Navigation:** Shift check-in dates backward or forward with arrow buttons (`◄` / `►`).
- **Completion Counter:** Increment or decrement completion units.
- **Journal Notes:** Add personal journal entries or reflections for that specific day.
- **Calendar Reminders:** Generate `.ics` iCalendar files or open pre-filled Google Calendar event creation links.

---

## 🎨 5. App Customization & Global Preferences

### 5.1 Global Page Preferences Modal

Clicking **Page Settings** opens the global default preferences dialog.

![All Page Default Preferences Modal](/home/marcus/habitual/tests/screenshots/manual/10_all_preferences_modal.png)

- **Default Habit Preferences:** Set default goal types, target frequencies, and color themes that automatically apply to all newly created habits.
- **Global Sorting:** Configure main dashboard habit list sorting (Manual, Alphabetical, Streak-based).

---

## 👥 6. Collaboration, E2EE Sharing & Templates

### 6.1 Importing Shared Habits

Opening a shared habit link or scanning a QR code opens the Import Shared Habit modal.

![Import Shared Habit Modal](/home/marcus/habitual/tests/screenshots/manual/11_import_shared_habit_modal.png)

- **Live Preview:** View the shared habit title, sub-habits, and check-in history before importing.
- **Permissions:** Shared habit creators can issue read-only (`ro=1`) or collaborative editor invite tokens (`createInviteToken` / `redeemInviteToken`).

---

### 6.2 Template Import & Discussion Space

![Template Import Modal](/home/marcus/habitual/tests/screenshots/manual/12_template_import_modal.png)

- **Routine Templates:** Import pre-configured multi-step habit templates (e.g. "30-Day Health Transformation", "Morning Routine").
- **Template Discussion:** Embedded chat section for discussing routine tips with template creators.

---

## 📱 7. Dedicated Pages & Standalone Widgets

### 7.1 Standalone Todo Page (`/todo.html`)

A focused daily task execution page.

![Standalone Todo Page](/home/marcus/habitual/tests/screenshots/manual/13_todo_page_view.png)

- **Countdown Timer:** Displays remaining hours and minutes until midnight.
- **Daily Checklist:** Shows all pending check-ins for today with one-tap completion checkboxes.

---

### 7.2 Standalone Sync & Backup Management Page (`/sync.html`)

Manage multi-device synchronization, master passphrases, and backups.

![Standalone Sync & Backup Page](/home/marcus/habitual/tests/screenshots/manual/14_sync_and_backup_page.png)

- **Multi-Device E2EE Sync:** Pair devices using a 6-character Sync Code or Master Passphrase.
- **AudioSync GGWave Transfer:** Acoustic data transfer over sound waves between nearby mobile devices.
- **JSON Backup & Restore:** Export complete encrypted JSON backups or restore state from local files.

---

### 7.3 Standalone Widgets (`/widgets/*.html`)

Habitual includes embeddable, lightweight widget pages:

| Widget | URL | Description | Screenshot |
| :--- | :--- | :--- | :--- |
| **Add Widget** | `/widgets/add.html` | Compact form for quick habit creation in sidebars or webviews. | ![Add Widget](/home/marcus/habitual/tests/screenshots/manual/15_widget_add_page.png) |
| **Heatmaps Widget** | `/widgets/heatmaps.html` | Embedded progress heatmaps for home screens and dashboards. | ![Heatmaps Widget](/home/marcus/habitual/tests/screenshots/manual/16_widget_heatmaps_page.png) |
| **Settings Widget** | `/widgets/settings.html` | Compact settings management for widget display options. | ![Settings Widget](/home/marcus/habitual/tests/screenshots/manual/17_widget_settings_page.png) |

---

## ⌨️ 8. Keyboard Shortcuts Quick Reference

| Key Combo | Action |
| :--- | :--- |
| **`◄` / `►` (Arrow Keys)** | Move date cursor backward / forward by 1 day |
| **`▲` / `▼` (Arrow Keys)** | Select previous / next habit card on the page |
| **`Spacebar`** | Expand or collapse sub-habit concertina accordion |
| **`Enter`** | Open quick check-in log modal for selected card and date |
| **`Escape`** | Close any open modal dialog |
