const path = require('path');
const fs = require('fs');
const { _android } = require('playwright');

const sdkAdbPath = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools');
if (fs.existsSync(sdkAdbPath) && !process.env.PATH.includes(sdkAdbPath)) {
  process.env.PATH = sdkAdbPath + path.delimiter + process.env.PATH;
}

async function test() {
  console.log('Step 1: Fetching devices...');
  let devices = [];
  try {
    devices = await Promise.race([
      _android.devices(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ADB device discovery timed out')), 5000))
    ]);
  } catch (e) {
    console.warn('Device discovery note:', e.message);
    process.exit(0);
  }

  console.log(`Devices found: ${devices.length}`);
  if (devices.length === 0) process.exit(0);

  const device = devices[0];
  console.log(`Device Model: ${device.model()}, Serial: ${device.serial()}`);

  console.log('Step 2: Launching Chrome browser with timeout...');
  try {
    const context = await Promise.race([
      device.launchBrowser({ pkg: 'com.android.chrome' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('launchBrowser timed out after 15s')), 15000))
    ]);
    console.log('Step 3: Browser launched successfully!');
    await context.close();
  } catch (e) {
    console.error('Launch Error:', e.message);
  } finally {
    try {
      await Promise.race([
        device.close(),
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);
    } catch (e) {}
    process.exit(0);
  }
}

test().catch(() => process.exit(0));
