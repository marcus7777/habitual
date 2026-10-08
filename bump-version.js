/**
 * Version Bumping Script for Habitual
 *
 * Usage:
 *   node bump-version.js          -> Prompts user to select bump type
 *   node bump-version.js bugfix   -> Bumps bugfix version (1.0.35 -> 1.0.36)
 *   node bump-version.js minor    -> Bumps minor version  (1.0.35 -> 1.1.0)
 *   node bump-version.js major    -> Bumps major version  (1.0.35 -> 2.0.0)
 *   node bump-version.js 1.2.3    -> Sets explicit version
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

function promptUser(currentVersion, { major, minor, bugfix }) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const patchPreview = `${major}.${minor}.${bugfix + 1}`;
    const minorPreview = `${major}.${minor + 1}.0`;
    const majorPreview = `${major + 1}.0.0`;

    console.log(`Current version: ${currentVersion}\n`);
    console.log('Select version bump type:');
    console.log(`  1) Bug fix  (${currentVersion} -> ${patchPreview}) [default]`);
    console.log(`  2) Minor    (${currentVersion} -> ${minorPreview})`);
    console.log(`  3) Major    (${currentVersion} -> ${majorPreview})`);
    console.log(`  4) Custom   (enter specific version string)\n`);

    rl.question('Enter choice [1-4] (default: 1): ', (answer) => {
      rl.close();
      const choice = answer.trim().toLowerCase();

      if (!choice || choice === '1' || choice === 'bugfix' || choice === 'patch' || choice === 'fix') {
        resolve('bugfix');
      } else if (choice === '2' || choice === 'minor') {
        resolve('minor');
      } else if (choice === '3' || choice === 'major') {
        resolve('major');
      } else if (choice === '4' || choice === 'custom') {
        const rl2 = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl2.question('Enter custom version (e.g. 1.2.3): ', (customVer) => {
          rl2.close();
          resolve(customVer.trim());
        });
      } else if (/^\d+\.\d+\.\d+$/.test(choice)) {
        resolve(choice);
      } else {
        console.log(`Unrecognized option "${answer}". Defaulting to bugfix.\n`);
        resolve('bugfix');
      }
    });
  });
}

async function main() {
  const arg = (process.argv[2] || '').toLowerCase().trim();

  if (arg === '-h' || arg === '--help') {
    console.log(`Current version: ${currentVersion}\n`);
    console.log('Usage: node bump-version.js [<type|version>]\n');
    console.log('  (no args)             Interactive prompt to choose bump type');
    console.log('  bugfix | patch | fix  Bump bugfix version (M.m.b+1)');
    console.log('  minor                 Bump minor version  (M.m+1.0)');
    console.log('  major                 Bump major version  (M+1.0.0)');
    console.log('  <M.m.b>               Set explicit version (e.g. 1.2.0)');
    process.exit(0);
  }

  const { major, minor, bugfix } = parseVersion(currentVersion);
  let bumpChoice = arg;

  if (!bumpChoice) {
    bumpChoice = await promptUser(currentVersion, { major, minor, bugfix });
  }

  let newVersion = '';

  if (['bugfix', 'bug', 'patch', 'fix', 'b'].includes(bumpChoice)) {
    newVersion = `${major}.${minor}.${bugfix + 1}`;
  } else if (['minor', 'm'].includes(bumpChoice)) {
    newVersion = `${major}.${minor + 1}.0`;
  } else if (['major', 'M'].includes(bumpChoice)) {
    newVersion = `${major + 1}.0.0`;
  } else if (/^\d+\.\d+\.\d+$/.test(bumpChoice)) {
    newVersion = bumpChoice;
  } else {
    console.error(`Error: Unknown bump type or invalid version format "${bumpChoice}"`);
    console.error('Expected: bugfix, minor, major, or a specific version like 1.2.3');
    process.exit(1);
  }

  console.log(`\nBumping version: ${currentVersion} -> ${newVersion}\n`);

  // 2. Update package.json
  pkg.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(` [✓] Updated package.json -> ${newVersion}`);

  // 3. Update HTML files (web/index.html, web/sync.html)
  const webDir = path.join(rootDir, 'web');
  const htmlFiles = ['index.html', 'sync.html'];
  htmlFiles.forEach((file) => {
    const filePath = path.join(webDir, file);
    if (fs.existsSync(filePath)) {
      let htmlContent = fs.readFileSync(filePath, 'utf8');
      const updatedHtml = htmlContent.replace(/v\d+\.\d+\.\d+/g, `v${newVersion}`);
      fs.writeFileSync(filePath, updatedHtml, 'utf8');
      console.log(` [✓] Updated web/${file} -> v${newVersion}`);
    }
  });

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
}

main().catch((err) => {
  console.error('Error running bump-version script:', err);
  process.exit(1);
});
