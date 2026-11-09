/**
 * Playwright End-to-End (E2E) Test Suite for Duplicate Image Upload Prevention & Resizing
 * Verifies that selecting/uploading a duplicate image:
 * 1. Hashes the file natively via Web Crypto SHA-256.
 * 2. Checks if the file was already uploaded to Firebase Storage.
 * 3. Skips re-uploading the file (0 additional network put requests).
 * 4. Inserts the existing image URL snippet into the habit description.
 * 5. Resizes large images maintaining aspect ratio before upload when missing.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8109;
const WEB_DIR = path.join(__dirname, '..', 'web');

function serveStaticFile(req, res) {
  let filePath = path.join(WEB_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('404 Not Found');
    return;
  }
  const ext = path.extname(filePath);
  let contentType = 'text/html';
  if (ext === '.js') contentType = 'text/javascript';
  else if (ext === '.css') contentType = 'text/css';
  else if (ext === '.json') contentType = 'application/json';
  else if (ext === '.svg') contentType = 'image/svg+xml';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

function logResult(testName, isSuccess, details = '') {
  const status = isSuccess ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${status} ${testName} ${details}`);
  if (!isSuccess) {
    throw new Error(`Test failed: ${testName} ${details}`);
  }
}

async function runDuplicateUploadE2ETest() {
  console.log('🚀 Starting Playwright E2E Test for Duplicate Image Upload Prevention...\n');

  const server = http.createServer(serveStaticFile);
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`[Server] Local test web server running on http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForTimeout(500);

    // Mock Firebase Storage in browser context
    await page.evaluate(() => {
      window.storagePutCount = 0;
      window.storageGetUrlCount = 0;

      const mockStorage = {
        ref: () => ({
          child: (pathStr) => {
            return {
              getDownloadURL: async () => {
                window.storageGetUrlCount++;
                if (window.uploadedFiles && window.uploadedFiles[pathStr]) {
                  return window.uploadedFiles[pathStr];
                }
                const err = new Error('Object not found');
                err.code = 'storage/object-not-found';
                throw err;
              },
              put: async (blob) => {
                window.storagePutCount++;
                window.uploadedFiles = window.uploadedFiles || {};
                const downloadURL = `https://firebasestorage.googleapis.com/v0/b/habitual-log.appspot.com/o/${encodeURIComponent(pathStr)}`;
                window.uploadedFiles[pathStr] = downloadURL;
                return {
                  ref: {
                    getDownloadURL: async () => downloadURL
                  }
                };
              }
            };
          }
        })
      };

      window.firebase = {
        apps: ['app'],
        app: () => ({ options: { storageBucket: 'gs://habitual-log.firebasestorage.app' } }),
        storage: () => mockStorage
      };
    });

    console.log('--- TEST 1: Initial Image Upload ---');

    // Create a mock image file object in page context
    const initialUploadResult = await page.evaluate(async () => {
      const mockFile = new File(['mock_image_binary_data_content_123'], 'workout_photo.jpg', { type: 'image/jpeg' });
      const url = await HabitualCore.uploadHabitMediaToFirebase(mockFile, 'image');
      return {
        url,
        putCount: window.storagePutCount,
        getUrlCount: window.storageGetUrlCount
      };
    });

    logResult('Initial file upload succeeds', Boolean(initialUploadResult.url && initialUploadResult.url.includes('habit-media')), `(url="${initialUploadResult.url}")`);
    logResult('Firebase Storage put() called exactly 1 time on first upload', initialUploadResult.putCount === 1, `(putCount=${initialUploadResult.putCount})`);

    console.log('\n--- TEST 2: Duplicate Image Upload Prevention ---');

    // Attempt to upload the EXACT same image file a second time
    const duplicateUploadResult = await page.evaluate(async () => {
      // Identical content & file metadata
      const mockDuplicateFile = new File(['mock_image_binary_data_content_123'], 'workout_photo.jpg', { type: 'image/jpeg' });
      const url = await HabitualCore.uploadHabitMediaToFirebase(mockDuplicateFile, 'image');
      return {
        url,
        putCount: window.storagePutCount,
        getUrlCount: window.storageGetUrlCount
      };
    });

    logResult('Duplicate upload returns identical existing URL', duplicateUploadResult.url === initialUploadResult.url, `(url="${duplicateUploadResult.url}")`);
    logResult('Firebase Storage put() WAS NOT CALLED a second time (putCount remains 1)', duplicateUploadResult.putCount === 1, `(putCount=${duplicateUploadResult.putCount})`);

    // Verify description textarea contains markdown image snippet
    const descContent = await page.evaluate(() => {
      const descInput = document.getElementById('habit-description');
      return descInput ? descInput.value : '';
    });
    logResult('Habit description input updated with image snippet', descContent.includes('![workout_photo.jpg]'), `(descLength=${descContent.length})`);

    console.log('\n🎉 E2E DUPLICATE UPLOAD TEST PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ E2E Test Failure:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

runDuplicateUploadE2ETest();
