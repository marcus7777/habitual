/**
 * Habitual Deployment & Release Script
 *
 * Workflow:
 *  1. Bumps application version using `bump-version.js`
 *  2. Runs core test suite (`node tests/run-tests.js`)
 *  3. Runs all Playwright test scripts & benchmarks:
 *     - Share & Firestore Sync Roundtrip (`tests/test-share-roundtrip-playwright.js`)
 *     - Standalone Widgets E2E (`tests/test-widgets-playwright.js`)
 *     - Android Mobile Playwright E2E (`tests/test-android-playwright.js`)
 *     - Firefox Mobile Playwright E2E (`tests/test-firefox-android-playwright.js`)
 *     - Playwright Android Diagnostics (`tests/test-playwright-diag.js`)
 *     - Playwright Performance Benchmark (`tests/benchmark-playwright.js`)
 *  4. On success: Stages all changes (`git add .`), commits, and pushes to GitHub
 *  5. Deploys to Firebase Hosting (`npx firebase deploy --only hosting`)
 *
 * Usage:
 *  node deploy.js [bumpType] [--no-push] [--no-deploy] [--no-playwright]
 *  npm run deploy [-- [bumpType]]
 *
 * Examples:
 *  node deploy.js            -> Interactive prompt for bump type, full test/playwright/git/firebase pipeline
 *  node deploy.js bugfix     -> Bump bugfix version, run all tests & playwright scripts, git push, deploy
 *  node deploy.js minor      -> Bump minor version, test suite, playwright scripts, git push, deploy
 *  node deploy.js major      -> Bump major version, test suite, playwright scripts, git push, deploy
 *  node deploy.js 1.22.0     -> Set custom version, test suite, playwright scripts, git push, deploy
 *  node deploy.js bugfix --no-playwright -> Skip Playwright suite for quick deployment
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const packageJsonPath = path.join(rootDir, 'package.json');

function getVersion() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return pkg.version;
}

function runStep(command, description, options = {}) {
  console.log(`\n========================================`);
  console.log(`🚀 ${description}`);
  console.log(`========================================\n`);

  const result = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
    cwd: rootDir,
    ...options
  });

  if (result.status !== 0) {
    console.error(`\n❌ Step failed: ${description}`);
    return false;
  }
  return true;
}

async function deploy() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));

  const bumpType = positional[0] || '';
  const skipPush = flags.includes('--no-push');
  const skipDeploy = flags.includes('--no-deploy');
  const skipPlaywright = flags.includes('--no-playwright') || flags.includes('--skip-playwright');

  const oldVersion = getVersion();

  // 1. Version Bump using bump-version.js
  const bumpCmd = bumpType ? `node bump-version.js ${bumpType}` : 'node bump-version.js';
  if (!runStep(bumpCmd, 'Step 1/5: Bumping Version')) {
    console.error('\nAborting deployment because version bump failed or was cancelled.');
    process.exit(1);
  }

  const newVersion = getVersion();
  console.log(`\n[✓] Version successfully set to v${newVersion} (was v${oldVersion})`);

  // 2. Run Core Test Suite
  if (!runStep('node tests/run-tests.js', 'Step 2/5: Running Core Test Suite')) {
    console.error(`\n❌ Core test suite failed! Halting git push and deployment.`);
    console.error(`Note: Version was bumped to v${newVersion} in package.json and HTML/SW files.`);
    console.error(`Please fix test failures. You can restore modified files via "git restore ." if needed.`);
    process.exit(1);
  }

  // 3. Run Playwright Test Suite & Benchmarks
  if (!skipPlaywright) {
    console.log(`\n========================================`);
    console.log(`🎭 Step 3/5: Running Playwright E2E Suite & Benchmarks`);
    console.log(`========================================`);

    const playwrightScripts = [
      { cmd: 'node tests/test-quick-add-responsiveness-playwright.js', desc: 'Playwright: Instant Quick Add Button Responsiveness Test (<100ms)' },
      { cmd: 'node tests/test-all-settings-sync-playwright.js', desc: 'Playwright: All Settings & Habit Reordering Sync E2E Test' },
      { cmd: 'node tests/test-multi-device-sync-playwright.js', desc: 'Playwright: Multi-Device Sync E2E Test' },
      { cmd: 'node tests/test-color-sync-playwright.js', desc: 'Playwright: Habit Color Sync E2E Test' },
      { cmd: 'node tests/test-share-roundtrip-playwright.js', desc: 'Playwright: Share & Sync Roundtrip E2E Test' },
      { cmd: 'node tests/test-widgets-playwright.js', desc: 'Playwright: Standalone Widgets E2E Test' },
      { cmd: 'node tests/test-android-playwright.js', desc: 'Playwright: Android Mobile Browser E2E Test' },
      { cmd: 'node tests/test-firefox-android-playwright.js', desc: 'Playwright: Firefox Mobile Browser E2E Test' },
      { cmd: 'node tests/test-playwright-diag.js', desc: 'Playwright: Android Diagnostics Check' },
      { cmd: 'node tests/benchmark-playwright.js', desc: 'Playwright: Performance Benchmark' }
    ];

    for (const script of playwrightScripts) {
      const success = runStep(script.cmd, script.desc);
      if (!success) {
        console.error(`\n❌ Playwright test failed: ${script.desc}! Halting deployment immediately.`);
        console.error(`Use --no-playwright to bypass Playwright tests if needed.`);
        process.exit(1);
      }
    }
  } else {
    console.log('\n[Skipping Playwright Test Suite due to --no-playwright flag]');
  }

  // 4. Git Operations: Stage, Commit, Push
  if (!skipPush) {
    if (!runStep('git add .', 'Step 4/5: Staging Changes with Git')) {
      console.error('\n❌ Failed to stage changes with git.');
      process.exit(1);
    }

    const commitMsg = `Bump version to v${newVersion} and release`;
    if (!runStep(`git commit -m "${commitMsg}"`, 'Step 4/5: Committing Release to Git')) {
      console.warn('\n⚠️ Git commit returned non-zero exit (possibly no changes to commit). Proceeding...');
    }

    if (!runStep('git push', 'Step 4/5: Pushing Changes to GitHub')) {
      console.error('\n❌ Failed to push changes to GitHub. Aborting Firebase deployment.');
      process.exit(1);
    }
  } else {
    console.log('\n[Skipping Git Push due to --no-push flag]');
  }

  // 5. Deploy to Firebase Hosting
  if (!skipDeploy) {
    const firebaseCmd = 'npx firebase deploy --only hosting';
    if (!runStep(firebaseCmd, 'Step 5/5: Deploying to Firebase Hosting')) {
      console.error('\n❌ Firebase deployment failed!');
      process.exit(1);
    }
  } else {
    console.log('\n[Skipping Firebase Deploy due to --no-deploy flag]');
  }

  console.log(`\n========================================`);
  console.log(`🎉 DEPLOYMENT SUCCESSFUL!`);
  console.log(`   Version:    v${newVersion}`);
  console.log(`   Playwright: ${skipPlaywright ? 'Skipped' : 'All Playwright scripts passed'}`);
  console.log(`   Git Push:   ${skipPush ? 'Skipped' : 'Pushed to GitHub'}`);
  console.log(`   Firebase:   ${skipDeploy ? 'Skipped' : 'Deployed to Firebase Hosting'}`);
  console.log(`========================================\n`);
}

deploy().catch((err) => {
  console.error('Unexpected error during deployment:', err);
  process.exit(1);
});
