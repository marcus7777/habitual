# Habitual - GitHub-Style Habit Progression Engine

Habitual is a long-term habit progression tracker featuring GitHub-style 7x52 year contribution heatmaps, customizable habit color themes, CSV data importing, and support for both positive habits (building) and negative habits (quitting).

## Key Features

- **CSV Data Import**: Import activity logs directly from CSV files (including `hellohabit_habit_activity.csv`). Automatically parses dates (`DD/MM/YYYY`, `YYYY-MM-DD`), maps columns to habits, and auto-detects quit goals.
- **7 Tall x 52 Wide Year Map Grid**: Visualize your daily progress across 52 weeks (7 days vertical by 52 columns horizontal) for any selected year.
- **Customizable Goals & Themes**: Edit habit names, descriptions, categories, daily targets, and select from 10 custom color themes (`green`, `blue`, `purple`, `orange`, `crimson`, `cyan`, `emerald`, `amber`, `indigo`, `rose`).
- **Negative / Quit Habits**: Support for quit tasks (e.g., *Days since Caffeine*, *Quit Smoking*). Days without a relapse are automatically tracked and celebrated as clean days on your heatmap!
- **Yearly Progression & Stats**: Track current streaks, personal best longest streaks, annual consistency rates, and overall yearly progress.
- **Local Storage & Data Backups**: Export and restore JSON backups or CSV activity logs anytime.
