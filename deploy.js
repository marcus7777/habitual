/**
 * Habitual Deployment & Release Script
 *
 * Workflow:
 *  1. Bumps application version using `bump-version.js`
 *  2. Runs core test suite (`node tests/run-tests.js`)
 *  3. On success: Stages all changes (`git add .`), commits, and pushes to GitHub
 *  4. Deploys to Firebase Hosting (`npx firebase deploy --only hosting`)
 *
 * Usage:
 *  node deploy.js [bumpType] [--no-push] [--no-deploy]
 *  npm run deploy [-- [bumpType]]
 *
 * Examples:
 *  node deploy.js            -> Interactive prompt for bump type, then full test/git/firebase pipeline
 *  node deploy.js bugfix     -> Bump bugfix version, test, git commit/push, deploy to Firebase
 *  node deploy.js minor      -> Bump minor version, test, git commit/push, deploy to Firebase
 *  node deploy.js major      -> Bump major version, test, git commit/push, deploy to Firebase
 *  node deploy.js 1.22.0     -> Set custom version, test, git commit/push, deploy to Firebase
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

  const oldVersion = getVersion();

  // 1. Version Bump using bump-version.js
  const bumpCmd = bumpType ? `node bump-version.js ${bumpType}` : 'node bump-version.js';
  if (!runStep(bumpCmd, 'Step 1/4: Bumping Version')) {
    console.error('\nAborting deployment because version bump failed or was cancelled.');
    process.exit(1);
  }

  const newVersion = getVersion();
  console.log(`\n[✓] Version successfully set to v${newVersion} (was v${oldVersion})`);

  // 2. Run Test Suite
  if (!runStep('node tests/run-tests.js', 'Step 2/4: Running Core Test Suite')) {
    console.error(`\n❌ Test suite failed! Halting git push and deployment.`);
    console.error(`Note: Version was bumped to v${newVersion} in package.json and HTML/SW files.`);
    console.error(`Please fix test failures. You can restore modified files via "git restore ." if needed.`);
    process.exit(1);
  }

  // 3. Git Operations: Stage, Commit, Push
  if (!skipPush) {
    if (!runStep('git add .', 'Step 3/4: Staging Changes with Git')) {
      console.error('\n❌ Failed to stage changes with git.');
      process.exit(1);
    }

    const commitMsg = `Bump version to v${newVersion} and release`;
    if (!runStep(`git commit -m "${commitMsg}"`, 'Step 3/4: Committing Release to Git')) {
      console.warn('\n⚠️ Git commit returned non-zero exit (possibly no changes to commit). Proceeding...');
    }

    if (!runStep('git push', 'Step 3/4: Pushing Changes to GitHub')) {
      console.error('\n❌ Failed to push changes to GitHub. Aborting Firebase deployment.');
      process.exit(1);
    }
  } else {
    console.log('\n[Skipping Git Push due to --no-push flag]');
  }

  // 4. Deploy to Firebase Hosting
  if (!skipDeploy) {
    const firebaseCmd = 'npx firebase deploy --only hosting';
    if (!runStep(firebaseCmd, 'Step 4/4: Deploying to Firebase Hosting')) {
      console.error('\n❌ Firebase deployment failed!');
      process.exit(1);
    }
  } else {
    console.log('\n[Skipping Firebase Deploy due to --no-deploy flag]');
  }

  console.log(`\n========================================`);
  console.log(`🎉 DEPLOYMENT SUCCESSFUL!`);
  console.log(`   Version:  v${newVersion}`);
  console.log(`   Git Push: ${skipPush ? 'Skipped' : 'Pushed to GitHub'}`);
  console.log(`   Firebase: ${skipDeploy ? 'Skipped' : 'Deployed to Firebase Hosting'}`);
  console.log(`========================================\n`);
}

deploy().catch((err) => {
  console.error('Unexpected error during deployment:', err);
  process.exit(1);
});
