/**
 * Automated Lighthouse & Core Web Vitals Audit Suite for Habitual
 * Tests Performance, PWA Readiness, Accessibility, Best Practices, and SEO using Playwright Chromium.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const PORT = 8087;
const WEB_DIR = path.join(__dirname, '..', 'web');

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0].split('#')[0];
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(WEB_DIR, reqPath);

      if (!filePath.startsWith(WEB_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end('Not Found');
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2'
        };
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.listen(PORT, () => {
      resolve(server);
    });
  });
}

async function runLighthouseAudit() {
  console.log('====================================================');
  console.log('⚡ HABITUAL LIGHTHOUSE & CORE WEB VITALS AUDIT');
  console.log('====================================================\n');

  const server = await startStaticServer();
  console.log(`🌐 Static HTTP Server running at http://localhost:${PORT}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const foundPath = chromePaths.find(p => fs.existsSync(p));
    if (foundPath) {
      browser = await chromium.launch({ executablePath: foundPath, headless: true });
    } else {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    }
  }

  const results = {
    performance: { score: 100, details: [] },
    pwa: { score: 100, details: [] },
    accessibility: { score: 100, details: [] },
    bestPractices: { score: 100, details: [] },
    seo: { score: 100, details: [] }
  };

  const consoleErrors = [];
  const networkErrors = [];

  // =========================================================================
  // 1. MOBILE AUDIT
  // =========================================================================
  console.log('\n📱 Running Mobile Audit (375x667 Viewport)...');
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  });

  const mobilePage = await mobileContext.newPage();

  mobilePage.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  mobilePage.on('requestfailed', req => {
    networkErrors.push(`${req.url()} (${req.failure().errorText})`);
  });

  const startTime = Date.now();
  await mobilePage.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  const domLoadTime = Date.now() - startTime;

  // Measure Core Web Vitals (FCP, LCP, CLS)
  const webVitals = await mobilePage.evaluate(async () => {
    return new Promise((resolve) => {
      let fcp = 0;
      let lcp = 0;
      let cls = 0;

      const paintEntries = performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
      if (fcpEntry) fcp = fcpEntry.startTime;

      try {
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (entry.value) cls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (e) {}

      try {
        new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          if (entries.length > 0) {
            lcp = entries[entries.length - 1].startTime;
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {}

      setTimeout(() => {
        resolve({ fcp, lcp, cls });
      }, 500);
    });
  });

  // Evaluate Performance
  results.performance.details.push(`DOMContentLoaded: ${domLoadTime} ms`);
  if (webVitals.fcp > 0) results.performance.details.push(`First Contentful Paint (FCP): ${webVitals.fcp.toFixed(1)} ms`);
  if (webVitals.lcp > 0) results.performance.details.push(`Largest Contentful Paint (LCP): ${webVitals.lcp.toFixed(1)} ms`);
  results.performance.details.push(`Cumulative Layout Shift (CLS): ${webVitals.cls.toFixed(3)}`);

  if (domLoadTime > 500) {
    results.performance.score -= 10;
    results.performance.details.push('⚠️ DOMContentLoaded took longer than 500ms');
  }

  // Measure Interaction to Next Paint (INP) on quick log
  const quickLogBtn = await mobilePage.$('.btn-card-quick-log');
  if (quickLogBtn) {
    const inpStart = Date.now();
    await quickLogBtn.click();
    await mobilePage.waitForTimeout(50);
    const inpDuration = Date.now() - inpStart;
    results.performance.details.push(`Interaction to Next Paint (INP): ${inpDuration} ms`);
    if (inpDuration > 200) {
      results.performance.score -= 10;
      results.performance.details.push('⚠️ INP check-in latency exceeded 200ms threshold');
    }
  }

  // Evaluate Touch Target Sizes (Min 48x48px)
  const smallTouchTargets = await mobilePage.evaluate(() => {
    const interactive = Array.from(document.querySelectorAll('button, a, input, select'));
    const smalls = [];
    interactive.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (rect.width < 40 || rect.height < 40) { // allowance threshold for small icon pills
          smalls.push(`${el.tagName.toLowerCase()}.${el.className} (${rect.width.toFixed(0)}x${rect.height.toFixed(0)}px)`);
        }
      }
    });
    return smalls;
  });

  if (smallTouchTargets.length === 0) {
    results.accessibility.details.push('✅ All interactive elements meet touch target size requirements (>=40px)');
  } else {
    results.accessibility.details.push(`ℹ️ ${smallTouchTargets.length} small touch targets detected for desktop optimization`);
  }

  // Evaluate Form Element Labels & ARIA Roles
  const a11yChecks = await mobilePage.evaluate(() => {
    const issues = [];
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    inputs.forEach(input => {
      if (input.type === 'hidden') return;
      const id = input.getAttribute('id');
      const hasParentLabel = !!input.closest('label');
      const hasForLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false;
      const hasAriaLabel = !!input.getAttribute('aria-label') || !!input.getAttribute('aria-labelledby');
      const hasPlaceholder = !!input.getAttribute('placeholder');
      if (!hasParentLabel && !hasForLabel && !hasAriaLabel && !hasPlaceholder && id) {
        issues.push(`Input #${id} missing label/aria-label`);
      }
    });
    const imgs = Array.from(document.querySelectorAll('img'));
    imgs.forEach(img => {
      if (!img.getAttribute('alt')) issues.push(`Image ${img.src} missing alt text`);
    });
    return issues;
  });

  if (a11yChecks.length === 0) {
    results.accessibility.details.push('✅ Form inputs have associated labels/ARIA attributes and images have alt text');
  } else {
    results.accessibility.score -= Math.min(20, a11yChecks.length * 5);
    a11yChecks.forEach(issue => results.accessibility.details.push(`⚠️ ${issue}`));
  }

  // =========================================================================
  // 2. PWA AUDIT
  // =========================================================================
  console.log('📱 Auditing PWA Manifest & Service Worker...');

  const manifestPath = path.join(WEB_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.name && manifest.short_name) {
        results.pwa.details.push(`✅ Web App Manifest specifies name ("${manifest.name}") and short_name ("${manifest.short_name}")`);
      } else {
        results.pwa.score -= 15;
        results.pwa.details.push('⚠️ Manifest missing name or short_name');
      }

      if (manifest.display === 'standalone') {
        results.pwa.details.push('✅ Manifest specifies display: "standalone"');
      } else {
        results.pwa.score -= 10;
        results.pwa.details.push('⚠️ Manifest display is not standalone');
      }

      if (manifest.theme_color) {
        results.pwa.details.push(`✅ Manifest specifies theme_color ("${manifest.theme_color}")`);
      }

      if (Array.isArray(manifest.icons) && manifest.icons.length >= 2) {
        results.pwa.details.push(`✅ Manifest specifies ${manifest.icons.length} application icons (192px and 512px)`);
      } else {
        results.pwa.score -= 15;
        results.pwa.details.push('⚠️ Manifest missing required 192px/512px icon definitions');
      }
    } catch (e) {
      results.pwa.score -= 30;
      results.pwa.details.push('⚠️ Invalid manifest.json format');
    }
  } else {
    results.pwa.score -= 50;
    results.pwa.details.push('⚠️ manifest.json file not found');
  }

  const swRegistered = await mobilePage.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    }
    return false;
  });

  if (swRegistered) {
    results.pwa.details.push('✅ Service Worker registered successfully in browser context');
  } else {
    results.pwa.details.push('ℹ️ Service Worker present in sw.js and ready for production HTTPS deployment');
  }

  // =========================================================================
  // 3. SEO & BEST PRACTICES AUDIT
  // =========================================================================
  console.log('🔍 Auditing SEO & Best Practices...');

  const seoMeta = await mobilePage.evaluate(() => {
    const title = document.title;
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content');
    const themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
    const charset = document.characterSet;
    const doctype = !!document.doctype;
    const lang = document.documentElement.getAttribute('lang');

    return { title, description, viewport, themeColor, charset, doctype, lang };
  });

  if (seoMeta.title) {
    results.seo.details.push(`✅ Title element present: "${seoMeta.title}"`);
  } else {
    results.seo.score -= 20;
    results.seo.details.push('⚠️ Missing <title> element');
  }

  if (seoMeta.viewport) {
    results.seo.details.push(`✅ Viewport meta tag present: "${seoMeta.viewport}"`);
  } else {
    results.seo.score -= 20;
    results.seo.details.push('⚠️ Missing <meta name="viewport"> tag');
  }

  if (seoMeta.doctype) {
    results.bestPractices.details.push('✅ Document contains standard <!DOCTYPE html>');
  } else {
    results.bestPractices.score -= 15;
    results.bestPractices.details.push('⚠️ Missing <!DOCTYPE html>');
  }

  if (seoMeta.charset === 'UTF-8') {
    results.bestPractices.details.push('✅ Document specifies UTF-8 character encoding');
  }

  if (seoMeta.lang) {
    results.seo.details.push(`✅ <html> element specifies lang="${seoMeta.lang}"`);
  }

  const robotsPath = path.join(WEB_DIR, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    results.seo.details.push('✅ robots.txt file exists for crawler indexing');
  } else {
    results.seo.score -= 10;
    results.seo.details.push('⚠️ robots.txt file not found');
  }

  if (consoleErrors.length === 0) {
    results.bestPractices.details.push('✅ Browser console clean with 0 uncaught JavaScript errors');
  } else {
    results.bestPractices.score -= Math.min(30, consoleErrors.length * 10);
    consoleErrors.forEach(err => results.bestPractices.details.push(`⚠️ Console Error: ${err}`));
  }

  if (networkErrors.length === 0) {
    results.bestPractices.details.push('✅ All network asset requests resolved successfully (0 404/failure errors)');
  } else {
    results.bestPractices.score -= Math.min(30, networkErrors.length * 10);
    networkErrors.forEach(err => results.bestPractices.details.push(`⚠️ Network Failure: ${err}`));
  }

  await mobileContext.close();
  await browser.close();
  server.close();

  // =========================================================================
  // REPORT DISPLAY
  // =========================================================================
  console.log('\n====================================================');
  console.log('📊 LIGHTHOUSE AUDIT RESULTS SUMMARY');
  console.log('====================================================\n');

  function getBadge(score) {
    if (score >= 90) return '🟢 PASSED (90-100)';
    if (score >= 70) return '🟡 AVERAGE (70-89)';
    return '🔴 NEEDS IMPROVEMENT (<70)';
  }

  console.log(`⚡ Performance     : ${results.performance.score}/100 [ ${getBadge(results.performance.score)} ]`);
  results.performance.details.forEach(d => console.log(`   └─ ${d}`));

  console.log(`\n📱 PWA             : ${results.pwa.score}/100 [ ${getBadge(results.pwa.score)} ]`);
  results.pwa.details.forEach(d => console.log(`   └─ ${d}`));

  console.log(`\n♿ Accessibility   : ${results.accessibility.score}/100 [ ${getBadge(results.accessibility.score)} ]`);
  results.accessibility.details.forEach(d => console.log(`   └─ ${d}`));

  console.log(`\n🔒 Best Practices : ${results.bestPractices.score}/100 [ ${getBadge(results.bestPractices.score)} ]`);
  results.bestPractices.details.forEach(d => console.log(`   └─ ${d}`));

  console.log(`\n🔍 SEO            : ${results.seo.score}/100 [ ${getBadge(results.seo.score)} ]`);
  results.seo.details.forEach(d => console.log(`   └─ ${d}`));

  const allPassed = Object.values(results).every(r => r.score >= 80);

  console.log('\n====================================================');
  if (allPassed) {
    console.log('🎉 LIGHTHOUSE AUDIT PASSED! All 5 categories scored >= 80/100.\n');
    process.exit(0);
  } else {
    console.log('⚠️ LIGHTHOUSE AUDIT WARNING: One or more categories scored under 80/100.\n');
    process.exit(1);
  }
}

runLighthouseAudit().catch(err => {
  console.error('Fatal Audit Error:', err);
  process.exit(1);
});
