'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { today } = require('../cli');
const { makeHomeLines, makeDetailLines, makeHelpLines, startTui } = require('../tui');

const sampleHabit = {
  id: 'morning-walk',
  name: 'Morning walk',
  type: 'positive',
  dailyTarget: 1,
  createdAt: '2026-01-01',
  logs: { [today()]: { count: 1, note: 'Park loop' } }
};

function plain(lines) {
  return lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
}

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.stack}`);
    process.exitCode = 1;
  }
}

console.log('\nHabitual TUI tests');
test('home screen shows goals, progress, and keyboard shortcuts', () => {
  const lines = plain(makeHomeLines({ habits: [sampleHabit] }, 0, '/tmp/habitual.json', 80));
  assert.match(lines, /TODAY/);
  assert.match(lines, /Morning walk/);
  assert.match(lines, /1\/1/);
  assert.match(lines, /enter details/);
  assert.match(lines, /backup/);
});

test('habit detail shows streaks and recent notes', () => {
  const lines = plain(makeDetailLines(sampleHabit, '/tmp/habitual.json', 80));
  assert.match(lines, /Morning walk/);
  assert.match(lines, /STREAK/);
  assert.match(lines, /Park loop/);
});

test('help screen explains key controls and local data', () => {
  const lines = plain(makeHelpLines('/tmp/habitual.json', 80));
  assert.match(lines, /↑ \/ k/);
  assert.match(lines, /Your data stays in your local JSON file/);
});

test('refuses to launch without an interactive terminal', async () => {
  await assert.rejects(
    startTui(path.join('/tmp', 'habitual.json'), { input: {}, output: {} }),
    /needs an interactive terminal/
  );
});
