/**
 * Habitual Asset Minifier & Optimization Builder
 */
const fs = require('fs');
const path = require('path');

const webDir = path.join(__dirname, 'web');

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
    .replace(/\s+/g, ' ')             // collapse whitespace
    .replace(/\s*([{}:;,])\s*/g, '$1') // remove spaces around punctuation
    .replace(/;\}/g, '}')             // remove trailing semicolon
    .trim();
}

function minifyJS(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')  // remove multi-line comments
    .replace(/^\s*\/\/.*/gm, '')       // remove single-line comments
    .replace(/\n\s*\n/g, '\n')         // remove extra blank lines
    .trim();
}

function runBuild() {
  console.log('🚀 Running Habitual Asset Minification Build...\n');

  let totalBefore = 0;
  let totalAfter = 0;

  // Process CSS
  const cssPath = path.join(webDir, 'styles.css');
  if (fs.existsSync(cssPath)) {
    const rawCss = fs.readFileSync(cssPath, 'utf8');
    const minCss = minifyCSS(rawCss);
    const minCssPath = path.join(webDir, 'styles.min.css');
    fs.writeFileSync(minCssPath, minCss, 'utf8');

    const beforeKb = (rawCss.length / 1024).toFixed(1);
    const afterKb = (minCss.length / 1024).toFixed(1);
    const savings = ((1 - minCss.length / rawCss.length) * 100).toFixed(1);

    totalBefore += rawCss.length;
    totalAfter += minCss.length;

    console.log(`📦 styles.css: ${beforeKb} KB -> styles.min.css: ${afterKb} KB (${savings}% saved)`);
  }

  // Process JS files in web/js
  const jsDir = path.join(webDir, 'js');
  if (fs.existsSync(jsDir)) {
    const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !f.endsWith('.min.js'));
    files.forEach(file => {
      const filePath = path.join(jsDir, file);
      const rawJs = fs.readFileSync(filePath, 'utf8');
      const minJs = minifyJS(rawJs);
      const minPath = path.join(jsDir, file.replace('.js', '.min.js'));
      fs.writeFileSync(minPath, minJs, 'utf8');

      const beforeKb = (rawJs.length / 1024).toFixed(1);
      const afterKb = (minJs.length / 1024).toFixed(1);
      const savings = ((1 - minJs.length / rawJs.length) * 100).toFixed(1);

      totalBefore += rawJs.length;
      totalAfter += minJs.length;

      console.log(`📦 js/${file}: ${beforeKb} KB -> js/${file.replace('.js', '.min.js')}: ${afterKb} KB (${savings}% saved)`);
    });
  }

  const totalBeforeKb = (totalBefore / 1024).toFixed(1);
  const totalAfterKb = (totalAfter / 1024).toFixed(1);
  const totalSavings = ((1 - totalAfter / totalBefore) * 100).toFixed(1);

  console.log(`\n🎉 Total Assets Payload: ${totalBeforeKb} KB -> ${totalAfterKb} KB (${totalSavings}% overall reduction)`);
}

if (require.main === module) {
  runBuild();
}

module.exports = { runBuild, minifyCSS, minifyJS };
