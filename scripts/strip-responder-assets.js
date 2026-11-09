/*
 * Removes the responder-only screens from the Resident app's copied web assets.
 *
 * Capacitor copies the whole www/ folder into android/app/src/main/assets/public,
 * so deleting from www/ is not possible (the Responder app builds from it).
 * Run this after every `npx cap sync android` — the next sync re-copies the files.
 *
 *   node scripts/strip-responder-assets.js
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public');

// Responder sign-in, responder sign-up and the script they both load.
const REMOVE = ['responder.html', 'responder-register.html', 'responder.js'];

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error('Assets folder not found: ' + PUBLIC_DIR);
  console.error('Run "npx cap sync android" first.');
  process.exit(1);
}

let removed = 0;
for (const file of REMOVE) {
  const target = path.join(PUBLIC_DIR, file);
  if (fs.existsSync(target)) {
    fs.rmSync(target);
    removed++;
    console.log('removed   ' + file);
  } else {
    console.log('absent    ' + file);
  }
}

// A surviving href would mean someone re-linked these pages from a Resident screen.
const HREF = /href\s*=\s*["'](?:\.\/)?responder(?:-register)?\.html["']/i;
const scanned = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.html'));
const offenders = scanned.filter(f => HREF.test(fs.readFileSync(path.join(PUBLIC_DIR, f), 'utf8')));

if (offenders.length) {
  console.error('FAIL: Resident page still links to a removed responder page: ' + offenders.join(', '));
  process.exit(1);
}

console.log('OK: ' + removed + ' file(s) removed, no Resident page links to them. Scanned ' + scanned.length + ' pages.');
