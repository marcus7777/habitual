'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cli = path.resolve(__dirname, '../cli.js');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'habitual-cli-test-'));
const dataFile = path.join(tempDir, 'nested', 'data.json');

function execute(...args) {
  return spawnSync(process.execPath, [cli, '--data', dataFile, ...args], { encoding: 'utf8' });
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

console.log('\nHabitual CLI tests');
test('reports v1.0.0 and displays help', () => {
  assert.equal(execute('--version').stdout.trim(), '1.0.0');
  assert.match(execute('--help').stdout, /backup import/);
});

test('adds habits with unique ids and lists JSON progress', () => {
  assert.equal(execute('add', 'Read Daily', '--target', '2', '--category', 'Learning').status, 0);
  assert.equal(execute('add', 'Read Daily').status, 0);
  const result = execute('list', '--json');
  assert.equal(result.status, 0, result.stderr);
  const habits = JSON.parse(result.stdout);
  assert.equal(habits.length, 2);
  assert.equal(habits[0].id, 'read-daily');
  assert.equal(habits[0].target, 2);
  assert.equal(habits[1].id, 'read-daily-2');
});

test('logs dated progress, preserves notes, and filters history', () => {
  assert.equal(execute('log', 'read-daily', '--date', '2026-02-03', '--note', 'first session').status, 0);
  assert.equal(execute('log', 'read-daily', '--date', '2026-02-03').status, 0);
  const result = execute('history', 'read-daily', '--from', '2026-02-03', '--to', '2026-02-03');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2026-02-03: 2 - first session/);
});

test('shows the current streak for a daily habit', () => {
  assert.equal(execute('log', 'read-daily').status, 0);
  const result = execute('history', 'read-daily');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Current streak: 1 day/);
});

test('exports and imports Habitual-compatible backups', () => {
  const backupFile = path.join(tempDir, 'backup.json');
  assert.equal(execute('backup', 'export', backupFile).status, 0);
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  assert.equal(backup.habits[0].logs['2026-02-03'].count, 2);
  assert.equal(execute('backup', 'import', backupFile).status, 0);
  assert.equal(JSON.parse(execute('list', '--json').stdout).length, 2);
});

test('rejects invalid dates, counts, and ambiguous or missing habits', () => {
  assert.notEqual(execute('log', 'read-daily', '--date', '2026-02-30').status, 0);
  assert.notEqual(execute('log', 'read-daily', '--count', '0').status, 0);
  assert.notEqual(execute('log', 'missing-habit').status, 0);
});

test('can restore a backup even if the current data file is invalid', () => {
  fs.writeFileSync(dataFile, 'not valid json');
  const backupFile = path.join(tempDir, 'backup.json');
  fs.writeFileSync(backupFile, JSON.stringify({ habits: [{ id: 'restored', logs: {} }] }));
  const result = execute('backup', 'import', backupFile);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(execute('list', '--json').stdout)[0].id, 'restored');
});

fs.rmSync(tempDir, { recursive: true, force: true });
