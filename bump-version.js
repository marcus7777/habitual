/**
 * Version Bumping Script for Habitual
 *
 * Usage:
 *   node bump-version.js bugfix  (or patch, fix) -> 1.0.35 -> 1.0.36
 *   node bump-version.js minor                   -> 1.0.35 -> 1.1.0
 *   node bump-version.js major                   -> 1.0.35 -> 2.0.0
 *   node bump-version.js 1.2.3                   -> set specific version
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const packageJsonPath = path.join(rootDir, 'package.json');
const htmlPath = path.join(rootDir, 'web', 'index.html');
const swPath = path.join(rootDir, 'web', 'sw.js');

// 1. Read current version from package.json
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = pkg.version;

function parseVersion(vStr) {
  const parts = vStr.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid M.m.b version format: "${vStr}"`);
  }
  return { major: parts[0], minor: parts[1], bugfix: parts[2] };
}

const arg = (process.argv[2] || '').toLowerCase().trim();

if (!arg || arg === '-h' || arg === '--help') {
  console.log(`Current version: ${currentVersion}\n`);
  console.log('Usage: node bump-version.js <type|version>\n');
  console.log('  bugfix | patch | fix  Bump bugfix version (M.m.b+1)');
  console.log('  minor                 Bump minor version  (M.m+1.0)');
  console.log('  major                 Bump major version  (M+1.0.0)');
  console.log('  <M.m.b>               Set explicit version (e.g. 1.2.0)');
  process.exit(0);
}

const { major, minor, bugfix } = parseVersion(currentVersion);
let newVersion = '';

if (['bugfix', 'bug', 'patch', 'fix', 'b'].includes(arg)) {
  newVersion = `${major}.${minor}.${bugfix + 1}`;
} else if (['minor', 'm'].includes(arg)) {
  newVersion = `${major}.${minor + 1}.0`;
} else if (['major', 'M'].includes(arg)) {
  newVersion = `${major + 1}.0.0`;
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  newVersion = arg;
} else {
  console.error(`Error: Unknown bump type or invalid version "${process.argv[2]}"`);
  console.error('Allowed types: bugfix, minor, major, or a specific version like 1.2.3');
  process.exit(1);
}

console.log(`Bumping version: ${currentVersion} -> ${newVersion}\n`);

// 2. Update package.json
pkg.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(` [✓] Updated package.json -> ${newVersion}`);

// 3. Update web/index.html
if (fs.existsSync(htmlPath)) {
  let htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const updatedHtml = htmlContent.replace(/v\d+\.\d+\.\d+/g, `v${newVersion}`);
  fs.writeFileSync(htmlPath, updatedHtml, 'utf8');
  console.log(` [✓] Updated web/index.html -> v${newVersion}`);
}

// 4. Update web/sw.js
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');
  const updatedSw = swContent.replace(
    /CACHE_NAME\s*=\s*['"]habitual-v[^'"]+['"]/g,
    `CACHE_NAME = 'habitual-v${newVersion}'`
  );
  fs.writeFileSync(swPath, updatedSw, 'utf8');
  console.log(` [✓] Updated web/sw.js -> habitual-v${newVersion}`);
}

console.log(`\nSuccessfully bumped version to ${newVersion}!`);
