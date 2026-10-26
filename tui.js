'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const {
  readData,
  writeData,
  today,
  habitName,
  logCount,
  currentDailyStreak,
  addHabitToData,
  logHabitInData,
  validateData
} = require('./cli');

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  inverse: '\x1b[7m'
};

function shorten(text, width) {
  const value = String(text);
  if (value.length <= width) return value;
  return width < 2 ? value.slice(0, width) : `${value.slice(0, width - 1)}…`;
}

function pad(text, width) {
  const value = shorten(text, width);
  return value + ' '.repeat(Math.max(0, width - value.length));
}

function bar(value, target, width = 14) {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, target)));
  const filled = Math.round(ratio * width);
  return `${ansi.green}${'█'.repeat(filled)}${ansi.dim}${'░'.repeat(width - filled)}${ansi.reset}`;
}

function dayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function relativePath(file) {
  const relative = path.relative(process.cwd(), file);
  return relative.startsWith('..') ? file : `./${relative}`;
}

function getTodayCount(habit) {
  return logCount(habit.logs && habit.logs[today()]);
}

function makeHomeLines(data, selected, file, width, rows = process.stdout.rows || 24) {
  const habits = data.habits;
  const dailyHabits = habits.filter(habit => (habit.frequencyType || 'daily') === 'daily' && habit.type !== 'negative');
  const completed = dailyHabits.filter(habit => getTodayCount(habit) >= (habit.dailyTarget || 1)).length;
  const lines = [
    `${ansi.bold}${ansi.cyan}  HABITUAL${ansi.reset}  ${ansi.dim}personal habit tracker${ansi.reset}`,
    `  ${dayLabel()}`,
    '',
    `  ${ansi.bold}TODAY${ansi.reset}  ${ansi.green}${completed}${ansi.reset} of ${dailyHabits.length} daily goals complete`
      + `   ${ansi.dim}·${ansi.reset}   ${habits.length} habit${habits.length === 1 ? '' : 's'}`,
    '',
    `  ${ansi.bold}YOUR HABITS${ansi.reset}`
  ];

  if (habits.length === 0) {
    lines.push('', `  ${ansi.dim}A fresh start. Press a to create your first habit.${ansi.reset}`);
  } else {
    const displayRows = Math.max(1, rows - 13);
    const first = Math.max(0, Math.min(selected - displayRows + 1, habits.length - displayRows));
    const visible = habits.slice(first, first + displayRows);
    visible.forEach((habit, index) => {
      const absoluteIndex = first + index;
      const isSelected = absoluteIndex === selected;
      const count = getTodayCount(habit);
      const target = habit.dailyTarget || 1;
      const title = pad(`${habitName(habit)}  ${habit.id}`, Math.floor(width * 0.48));
      const progress = habit.type === 'negative'
        ? `${count ? `${ansi.red}${count} relapse${count === 1 ? '' : 's'}` : `${ansi.green}clean today`}${ansi.reset}`
        : `${bar(count, target, Math.min(12, Math.max(4, width - 48)))}  ${count}/${target}`;
      const marker = isSelected ? `${ansi.cyan}›${ansi.reset}` : ' ';
      const paused = habit.isPaused ? ` ${ansi.yellow}PAUSED${ansi.reset}` : '';
      const row = `${marker} ${title}  ${progress}${paused}`;
      lines.push(`  ${isSelected ? `${ansi.inverse}${row}${ansi.reset}` : row}`);
    });
    if (habits.length > displayRows) {
      lines.push(`  ${ansi.dim}Showing ${first + 1}–${Math.min(first + displayRows, habits.length)} of ${habits.length}${ansi.reset}`);
    }
  }
  lines.push(
    '',
    `  ${ansi.dim}Data  ${shorten(relativePath(file), width - 10)}${ansi.reset}`,
    '',
    `  ${ansi.bold}↑/↓${ansi.reset} move   ${ansi.bold}enter${ansi.reset} details   ${ansi.bold}l${ansi.reset} log   ${ansi.bold}a${ansi.reset} add   ${ansi.bold}b${ansi.reset} backup   ${ansi.bold}?${ansi.reset} help   ${ansi.bold}q${ansi.reset} quit`
  );
  return lines;
}

function makeDetailLines(habit, file, width) {
  const isNegative = habit.type === 'negative';
  const count = getTodayCount(habit);
  const target = habit.dailyTarget || 1;
  const streak = currentDailyStreak(habit);
  const logs = Object.entries(habit.logs || {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, 8);
  const lines = [
    `${ansi.bold}${ansi.cyan}  HABITUAL${ansi.reset}  ${ansi.dim}habit details${ansi.reset}`,
    `  ${ansi.bold}${habitName(habit)}${ansi.reset}`,
    `  ${ansi.dim}${habit.id}${ansi.reset}`,
    '',
    `  ${ansi.bold}TYPE${ansi.reset}       ${isNegative ? 'Quit habit' : 'Build habit'}`,
    `  ${ansi.bold}TODAY${ansi.reset}      ${isNegative ? (count ? `${count} relapse${count === 1 ? '' : 's'}` : 'Clean day') : `${count} of ${target} complete`}`,
    `  ${ansi.bold}STREAK${ansi.reset}     ${isNegative ? `${streak} clean day${streak === 1 ? '' : 's'}` : `${streak} day${streak === 1 ? '' : 's'}`}`,
    `  ${ansi.bold}CATEGORY${ansi.reset}   ${habit.category || '—'}`,
    `  ${ansi.bold}SCHEDULE${ansi.reset}   ${habit.frequencyType || 'daily'}${habit.isPaused ? `  ${ansi.yellow}· paused${ansi.reset}` : ''}`,
    habit.description ? `  ${ansi.bold}ABOUT${ansi.reset}      ${shorten(habit.description, width - 14)}` : '',
    '',
    `  ${ansi.bold}RECENT CHECK-INS${ansi.reset}`
  ];
  if (!logs.length) lines.push(`  ${ansi.dim}No check-ins recorded yet.${ansi.reset}`);
  logs.forEach(([date, entry]) => {
    const value = logCount(entry);
    const note = typeof entry === 'object' && entry ? entry.note : '';
    const suffix = note ? `  ${ansi.dim}${note}${ansi.reset}` : '';
    lines.push(`  ${date}   ${isNegative ? `${value} relapse${value === 1 ? '' : 's'}` : `${value} completion${value === 1 ? '' : 's'}`}${suffix}`);
  });
  lines.push(
    '',
    `  ${ansi.bold}l${ansi.reset} log progress   ${ansi.bold}a${ansi.reset} add another   ${ansi.bold}b${ansi.reset} backup   ${ansi.bold}esc${ansi.reset} back   ${ansi.bold}q${ansi.reset} quit`
  );
  return lines.filter(Boolean);
}

function makeHelpLines(file, width) {
  return [
    `${ansi.bold}${ansi.cyan}  KEYBOARD GUIDE${ansi.reset}`,
    '',
    '  ↑ / k       Move through your habits',
    '  ↓ / j       Move through your habits',
    '  enter       Open selected habit details',
    '  l           Log progress for selected habit',
    '  a           Add a new habit',
    '  b           Import or export a JSON backup',
    '  ?           Show this guide',
    '  esc         Return to the previous screen',
    '  q           Quit Habitual',
    '',
    `  ${ansi.dim}Your data stays in your local JSON file: ${shorten(relativePath(file), width - 46)}${ansi.reset}`,
    '',
    `  ${ansi.bold}Press any key to return${ansi.reset}`
  ];
}

function draw(output, data, screen, selected, message, file) {
  const width = Math.max(30, Math.min(100, output.columns || 80));
  const lines = screen.type === 'detail' && screen.habit
    ? makeDetailLines(screen.habit, file, width)
    : screen.type === 'help'
      ? makeHelpLines(file, width)
      : makeHomeLines(data, selected, file, width, output.rows || 24);
  if (message) lines.push('', `  ${ansi.yellow}${shorten(message, width - 4)}${ansi.reset}`);
  const content = lines.map(line => `\x1b[2K${line}`).join('\n');
  output.write(`\x1b[?25l\x1b[H\x1b[2J${content}\n`);
}

async function ask(input, output, questions) {
  input.setRawMode(false);
  input.pause();
  output.write(`\x1b[?25h\n`);
  const prompt = readline.createInterface({ input, output });
  const answers = [];
  try {
    for (const question of questions) {
      answers.push(await prompt.question(question));
    }
  } finally {
    prompt.close();
    if (!input.destroyed) {
      input.setRawMode(true);
      input.resume();
    }
    output.write('\x1b[?25l');
  }
  return answers;
}

async function startTui(file, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('The Habitual TUI needs an interactive terminal. Run "habitual --help" for command-line usage.');
  }

  const dataFile = path.resolve(file);
  let data = readData(dataFile);
  let screen = { type: 'home' };
  let selected = 0;
  let message = '';
  let busy = false;
  let finished = false;
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  const useColor = !process.env.NO_COLOR && output.isTTY;
  const original = { reset: ansi.reset, bold: ansi.bold, dim: ansi.dim, green: ansi.green, cyan: ansi.cyan, yellow: ansi.yellow, red: ansi.red, blue: ansi.blue, inverse: ansi.inverse };

  if (!useColor) Object.keys(ansi).forEach(key => { ansi[key] = ''; });

  const restore = () => {
    if (finished) return;
    finished = true;
    input.removeListener('keypress', onKeypress);
    output.removeListener('resize', onResize);
    if (input.isTTY) input.setRawMode(false);
    input.pause();
    output.write('\x1b[?25h\x1b[0m\n');
    Object.assign(ansi, original);
    finish();
  };

  const repaint = () => draw(output, data, screen, selected, message, dataFile);
  const refresh = (clearMessage = true) => {
    data = readData(dataFile);
    if (data.habits.length) selected = Math.min(selected, data.habits.length - 1);
    else selected = 0;
    if (screen.type === 'detail' && screen.habit) {
      screen.habit = data.habits.find(habit => habit.id === screen.habit.id) || null;
      if (!screen.habit) screen = { type: 'home' };
    }
    if (clearMessage) message = '';
  };
  const promptAction = async (questions, action) => {
    if (busy) return;
    busy = true;
    try {
      const answers = await ask(input, output, questions);
      if (answers.length) {
        await action(answers);
        refresh(false);
      }
    } catch (error) {
      if (error.code !== 'ABORT_ERR') message = error.message;
    } finally {
      busy = false;
      if (!finished) repaint();
    }
  };
  const selectedHabit = () => data.habits[selected];

  async function onKeypress(_text, key = {}) {
    if (finished || busy) return;
    const name = key.name;
    const character = key.sequence && key.sequence.length === 1 ? key.sequence.toLowerCase() : '';
    if (key.ctrl && name === 'c') {
      restore();
      return;
    }
    if (screen.type === 'help') {
      screen = { type: 'home' };
      repaint();
      return;
    }
    if (name === 'escape' || name === 'backspace' || name === 'left') {
      screen = { type: 'home' };
      message = '';
      repaint();
      return;
    }
    if (character === 'q') {
      restore();
      return;
    }
    if (screen.type === 'detail' && screen.habit) {
      if (character === 'l') {
        const habit = screen.habit;
        await promptAction([
          `Date [${today()}]: `,
          'Number of completions/relapses [1]: ',
          'Note (optional): '
        ], ([dateInput, countInput, note]) => {
          const result = logHabitInData(data, habit.id, {
            date: dateInput.trim() || today(),
            count: countInput.trim() || '1',
            note
          });
          writeData(dataFile, data);
          screen = { type: 'detail', habit: result.habit };
          message = `Saved ${result.habit.type === 'negative' ? 'relapse' : 'progress'} for ${result.date}.`;
        });
        return;
      }
      if (character === 'a') {
        screen = { type: 'home' };
        selected = data.habits.length;
        await addHabit();
        return;
      }
      if (character === 'b') {
        await backup();
        return;
      }
      if (name === 'return' || name === 'enter') {
        screen = { type: 'home' };
        repaint();
        return;
      }
    } else {
      if (name === 'up' || character === 'k') {
        selected = Math.max(0, selected - 1);
        message = '';
      } else if (name === 'down' || character === 'j') {
        selected = Math.min(Math.max(0, data.habits.length - 1), selected + 1);
        message = '';
      } else if (name === 'return' || name === 'enter') {
        if (selectedHabit()) screen = { type: 'detail', habit: selectedHabit() };
      } else if (character === 'l') {
        if (!selectedHabit()) message = 'Add a habit first to start logging progress.';
        else {
          const habit = selectedHabit();
          screen = { type: 'detail', habit };
          repaint();
          await onKeypress('l', { sequence: 'l', name: 'l' });
          return;
        }
      } else if (character === 'a') {
        await addHabit();
        return;
      } else if (character === 'b') {
        await backup();
        return;
      } else if (character === '?') {
        screen = { type: 'help' };
      } else if (character === 'r') {
        refresh();
        message = 'Data reloaded from disk.';
      }
    }
    repaint();
  }

  async function addHabit() {
    await promptAction([
      'Habit name: ',
      'Type — positive or negative [positive]: ',
      'Daily target [1]: ',
      'Category (optional): ',
      'Description (optional): '
    ], ([name, type, target, category, description]) => {
      const habit = addHabitToData(data, name, {
        type: type.trim() || 'positive',
        target: target.trim() || '1',
        category: category.trim(),
        description: description.trim()
      });
      writeData(dataFile, data);
      selected = data.habits.indexOf(habit);
      screen = { type: 'detail', habit };
      message = `Created ${habitName(habit)}.`;
    });
  }

  async function backup() {
    await promptAction([
      'Backup action — export or import [export]: ',
      'JSON file path: '
    ], async ([actionInput, fileInput]) => {
      const action = actionInput.trim().toLowerCase() || 'export';
      if (!['export', 'import'].includes(action)) throw new Error('Choose "export" or "import".');
      if (!fileInput.trim()) throw new Error('A backup file path is required.');
      const backupFile = path.resolve(fileInput.trim());
      if (action === 'export') {
        fs.mkdirSync(path.dirname(backupFile), { recursive: true });
        fs.writeFileSync(backupFile, `${JSON.stringify(data, null, 2)}\n`, { flag: 'w' });
        message = `Backup exported to ${backupFile}.`;
      } else {
        const [confirmation] = await ask(input, output, ['This replaces your current habits. Type YES to continue: ']);
        if (confirmation !== 'YES') {
          message = 'Restore cancelled; your data was not changed.';
          return;
        }
        const imported = validateData(JSON.parse(fs.readFileSync(backupFile, 'utf8')), `Backup "${backupFile}"`);
        writeData(dataFile, imported);
        data = imported;
        selected = 0;
        message = `Restored ${data.habits.length} habit(s) from backup.`;
      }
    });
  }

  function onResize() {
    if (!busy && !finished) repaint();
  }

  input.setEncoding('utf8');
  require('node:readline').emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  input.on('keypress', onKeypress);
  output.on('resize', onResize);
  repaint();
  await done;
}

module.exports = { startTui, makeHomeLines, makeDetailLines, makeHelpLines };
