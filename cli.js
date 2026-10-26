#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VERSION = '1.0.0';
const DEFAULT_DATA_FILE = path.join(os.homedir(), '.habitual', 'data.json');
const VALUE_OPTIONS = new Set(['--type', '--target', '--category', '--description', '--date', '--count', '--note', '--from', '--to']);

function usage() {
  return `Habitual CLI v${VERSION}

Usage:
  habitual [--data <file>] <command> [arguments]

Commands:
  tui                                        Open the interactive terminal interface
  list [--json]                              List habits and today's progress
  add <name> [--type positive|negative]      Create a habit
          [--target <count>] [--category <name>] [--description <text>]
  log <habit> [--date YYYY-MM-DD] [--count <count>] [--note <text>]
                                             Add progress (or a relapse for negative habits)
  history <habit> [--from YYYY-MM-DD] [--to YYYY-MM-DD]
                                             Show logged history
  backup export [file]                       Export a JSON backup (stdout if omitted)
  backup import <file>                        Replace CLI data with a JSON backup

Options:
  -d, --data <file>  Use a specific data file (or set HABITUAL_DATA_FILE)
  -h, --help         Show this help
  -v, --version      Show the CLI version

Default data file: ${DEFAULT_DATA_FILE}`;
}

function fail(message) {
  const error = new Error(message);
  error.isUsageError = true;
  throw error;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateData(data, source) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.habits)) {
    fail(`${source} must be a JSON object containing a habits array.`);
  }
  const ids = new Set();
  data.habits.forEach((habit, index) => {
    if (!habit || typeof habit !== 'object' || Array.isArray(habit) || typeof habit.id !== 'string' || !habit.id.trim()) {
      fail(`${source} contains a habit without a valid id at index ${index}.`);
    }
    if (ids.has(habit.id)) fail(`${source} contains duplicate habit id "${habit.id}".`);
    ids.add(habit.id);
    if (habit.logs !== undefined && (!habit.logs || typeof habit.logs !== 'object' || Array.isArray(habit.logs))) {
      fail(`${source} has invalid logs for habit "${habit.id}".`);
    }
    Object.entries(habit.logs || {}).forEach(([date, entry]) => {
      if (!validDate(date)) fail(`${source} contains an invalid log date "${date}" for "${habit.id}".`);
      const count = typeof entry === 'number' ? entry : entry && entry.count;
      if (!Number.isFinite(count) || count < 0) {
        fail(`${source} contains an invalid log count for "${habit.id}" on ${date}.`);
      }
    });
  });
  return data;
}

function readData(file) {
  if (!fs.existsSync(file)) return { habits: [] };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Could not read JSON data from "${file}": ${error.message}`);
  }
  return validateData(parsed, `Data file "${file}"`);
}

function writeData(file, data) {
  validateData(data, 'Habit data');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(tempFile, file);
  } catch (error) {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    throw error;
  }
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function habitName(habit) {
  return habit.name || habit.id;
}

function findHabit(habits, ref) {
  const matches = habits.filter(habit => habit.id === ref || habitName(habit).toLowerCase() === ref.toLowerCase());
  if (!matches.length) fail(`No habit found for "${ref}". Run "habitual list" to see available habits.`);
  if (matches.length > 1) fail(`"${ref}" matches multiple habits; use a habit id instead.`);
  return matches[0];
}

function parseOptions(args) {
  const positional = [];
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--json') {
      options.json = true;
    } else if (VALUE_OPTIONS.has(token)) {
      if (options[token] !== undefined) fail(`Option ${token} may only be supplied once.`);
      if (i + 1 >= args.length || args[i + 1].startsWith('--')) fail(`Option ${token} requires a value.`);
      options[token] = args[++i];
    } else if (token.startsWith('-')) {
      fail(`Unknown option "${token}".`);
    } else {
      positional.push(token);
    }
  }
  return { positional, options };
}

function positiveInteger(value, optionName) {
  if (!/^\d+$/.test(String(value))) fail(`${optionName} must be a positive whole number.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail(`${optionName} must be a positive whole number.`);
  return number;
}

function validateDateOption(value, optionName) {
  if (!validDate(value)) fail(`${optionName} must be a real date in YYYY-MM-DD format.`);
  return value;
}

function slugify(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function createHabitId(name, habits) {
  const base = slugify(name) || 'habit';
  let id = base;
  let suffix = 2;
  while (habits.some(habit => habit.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function addHabitToData(data, name, options = {}) {
  if (typeof name !== 'string' || !name.trim()) fail('Habit name cannot be empty.');
  const type = options.type || 'positive';
  if (!['positive', 'negative'].includes(type)) fail('--type must be "positive" or "negative".');
  const target = options.target === undefined ? 1 : positiveInteger(options.target, '--target');
  const habit = {
    id: createHabitId(name.trim(), data.habits),
    name: name.trim(),
    type,
    dailyTarget: target,
    createdAt: today(),
    logs: {}
  };
  if (options.category) habit.category = options.category;
  if (options.description) habit.description = options.description;
  data.habits.push(habit);
  return habit;
}

function logHabitInData(data, ref, options = {}) {
  const habit = findHabit(data.habits, ref);
  const date = options.date === undefined ? today() : validateDateOption(options.date, '--date');
  const amount = options.count === undefined ? 1 : positiveInteger(options.count, '--count');
  if (!habit.logs) habit.logs = {};
  const previous = habit.logs[date];
  const count = logCount(previous) + amount;
  const note = options.note === undefined
    ? (typeof previous === 'object' && previous ? (previous.note || '') : '')
    : options.note;
  habit.logs[date] = { count, note };
  return { habit, date, amount, count };
}

function outputHabitList(habits, asJson) {
  const date = today();
  const rows = habits.map(habit => {
    const entry = habit.logs && habit.logs[date];
    const count = typeof entry === 'number' ? entry : (entry ? entry.count : 0);
    return {
      id: habit.id,
      name: habitName(habit),
      type: habit.type || 'positive',
      today: count,
      target: habit.dailyTarget || 1,
      paused: Boolean(habit.isPaused)
    };
  });
  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log('No habits yet. Create one with: habitual add "My habit"');
    return;
  }
  rows.forEach(row => {
    const status = row.paused ? ' [paused]' : '';
    const progress = row.type === 'negative'
      ? `${row.today} relapse${row.today === 1 ? '' : 's'} today`
      : `${row.today}/${row.target} today`;
    console.log(`${row.name} (${row.id}) - ${row.type}; ${progress}${status}`);
  });
}

function logCount(entry) {
  return typeof entry === 'number' ? entry : (entry ? entry.count : 0);
}

function currentDailyStreak(habit) {
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const todayKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
  if (habit.type !== 'negative' && logCount(habit.logs && habit.logs[todayKey]) === 0) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  const earliest = habit.createdAt && validDate(habit.createdAt) ? habit.createdAt : '0000-01-01';
  while (streak < 36500) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (key < earliest) break;
    const count = logCount(habit.logs && habit.logs[key]);
    if (habit.type === 'negative' ? count > 0 : count === 0) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function run(argv) {
  let dataFile = process.env.HABITUAL_DATA_FILE || DEFAULT_DATA_FILE;
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data' || argv[i] === '-d') {
      if (!argv[i + 1] || argv[i + 1].startsWith('-')) fail(`${argv[i]} requires a file path.`);
      dataFile = path.resolve(argv[++i]);
    } else {
      args.push(argv[i]);
    }
  }
  dataFile = path.resolve(dataFile);
  if (!args.length) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      return require('./tui').startTui(dataFile);
    }
    console.log(usage());
    return;
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    return;
  }

  const command = args.shift();
  if (command === 'tui') return require('./tui').startTui(dataFile);
  const { positional, options } = parseOptions(args);
  const data = command === 'backup' && positional[0] === 'import' ? { habits: [] } : readData(dataFile);

  if (command === 'list') {
    if (positional.length) fail('Usage: habitual list [--json]');
    outputHabitList(data.habits, options.json);
  } else if (command === 'add') {
    if (positional.length !== 1 || !positional[0].trim()) fail('Usage: habitual add <name> [--type positive|negative] [--target <count>] [--category <name>] [--description <text>]');
    const habit = addHabitToData(data, positional[0], {
      type: options['--type'],
      target: options['--target'],
      category: options['--category'],
      description: options['--description']
    });
    writeData(dataFile, data);
    console.log(`Created ${habitName(habit)} (${habit.id}).`);
  } else if (command === 'log') {
    if (positional.length !== 1) fail('Usage: habitual log <habit> [--date YYYY-MM-DD] [--count <count>] [--note <text>]');
    const { habit, date, amount, count } = logHabitInData(data, positional[0], {
      date: options['--date'],
      count: options['--count'],
      note: options['--note']
    });
    writeData(dataFile, data);
    const label = habit.type === 'negative' ? 'relapse' : 'completion';
    console.log(`Logged ${amount} ${label}${amount === 1 ? '' : 's'} for ${habitName(habit)} on ${date} (total: ${count}).`);
  } else if (command === 'history') {
    if (positional.length !== 1) fail('Usage: habitual history <habit> [--from YYYY-MM-DD] [--to YYYY-MM-DD]');
    const habit = findHabit(data.habits, positional[0]);
    const from = options['--from'] === undefined ? null : validateDateOption(options['--from'], '--from');
    const to = options['--to'] === undefined ? null : validateDateOption(options['--to'], '--to');
    if (from && to && from > to) fail('--from must be on or before --to.');
    const entries = Object.entries(habit.logs || {})
      .filter(([date]) => (!from || date >= from) && (!to || date <= to))
      .sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) {
      console.log(`No logged history for ${habitName(habit)} in the selected date range.`);
      return;
    }
    entries.forEach(([date, entry]) => {
      const count = typeof entry === 'number' ? entry : entry.count;
      const note = typeof entry === 'object' && entry.note ? ` - ${entry.note}` : '';
      console.log(`${date}: ${count}${note}`);
    });
    if (!habit.frequencyType || habit.frequencyType === 'daily') {
      const streak = currentDailyStreak(habit);
      console.log(`Current streak: ${streak} day${streak === 1 ? '' : 's'}`);
    } else {
      console.log('Current streak: not calculated for non-daily schedules.');
    }
  } else if (command === 'backup') {
    const subcommand = positional.shift();
    if (subcommand === 'export') {
      if (positional.length > 1) fail('Usage: habitual backup export [file]');
      const json = `${JSON.stringify(data, null, 2)}\n`;
      if (positional[0]) {
        const outputFile = path.resolve(positional[0]);
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        fs.writeFileSync(outputFile, json, { flag: 'w' });
        console.log(`Exported ${data.habits.length} habit(s) to ${outputFile}.`);
      } else {
        process.stdout.write(json);
      }
    } else if (subcommand === 'import') {
      if (positional.length !== 1) fail('Usage: habitual backup import <file>');
      const inputFile = path.resolve(positional[0]);
      let imported;
      try {
        imported = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
      } catch (error) {
        fail(`Could not read backup "${inputFile}": ${error.message}`);
      }
      validateData(imported, `Backup "${inputFile}"`);
      writeData(dataFile, imported);
      console.log(`Imported ${imported.habits.length} habit(s) from ${inputFile}.`);
    } else {
      fail('Usage: habitual backup <export [file]|import <file>>');
    }
  } else {
    fail(`Unknown command "${command}". Run "habitual --help" for usage.`);
  }
}

module.exports = {
  run, validateData, validDate, readData, writeData, today, habitName, logCount,
  currentDailyStreak, addHabitToData, logHabitInData
};

if (require.main === module) {
  try {
    Promise.resolve(run(process.argv.slice(2))).catch(error => {
      console.error(`Error: ${error.message}`);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
