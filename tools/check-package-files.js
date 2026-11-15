// Safety net for packaging: every local file that the main process (or the self-test) requires must be
// listed in package.json -> build.files, otherwise the built .exe dies at startup with a JavaScript error
// that never shows up when running from source. Runs automatically before `npm run dist`.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const listed = new Set(pkg.build.files.filter((f) => !f.includes('*') && !f.startsWith('!')));

// development-only helpers that are deliberately not shipped (they are only required behind a command-line flag)
const NOT_SHIPPED = new Set(['smoke.js']);

const missing = [];
const queue = ['main.js', 'selftest.js'];
const seen = new Set();
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of source.matchAll(/require\('\.\/([A-Za-z0-9_-]+)(\.js)?'\)/g)) {
    const dep = m[1] + '.js';
    if (NOT_SHIPPED.has(dep)) continue;
    if (!listed.has(dep)) missing.push(`${dep} (required by ${file})`);
    else queue.push(dep);
  }
}

if (missing.length) {
  console.error('\n[package check] These files are required at startup but are NOT in package.json "build.files":\n  - ' + missing.join('\n  - '));
  console.error('Add them, or the built .exe will not start.\n');
  process.exit(1);
}
console.log(`[package check] all ${seen.size} main-process files are listed in build.files`);
