const path = require('path');
const fs = require('fs');
const { _android } = require('playwright');

const sdkAdbPath = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools');
if (fs.existsSync(sdkAdbPath) && !process.env.PATH.includes(sdkAdbPath)) {
  process.env.PATH = sdkAdbPath + path.delimiter + process.env.PATH;
}

async function test() {
  console.log('Step 1: Fetching devices...');
  const devices = await _android.devices();
  console.log(`Devices found: ${devices.length}`);
  if (devices.length === 0) return;

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
    await device.close();
  }
}

test();
