/* =====================================================
   RescueNet Responder — web bundle generator

   www/ is the single source of truth. This script derives
   responder-app/web/ from it; never hand-edit files in web/.
   Re-run after any change to www/responder.html,
   responder-register.html, responder.js, config.js or
   responsive.css, then run `npx cap sync android`.
   ===================================================== */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'www');
const OUT = path.join(__dirname, 'web');

const HTML = [
  { from: 'responder.html',          to: 'index.html' },
  { from: 'responder-register.html', to: 'responder-register.html' }
];
const STATIC = ['responder.js', 'config.js', 'responsive.css'];

function transform(html) {
  let out = html;
  // The resident landing page is not in this bundle — drop its back-link.
  out = out.replace(/[ \t]*<a href="index\.html" class="login-back"[\s\S]*?<\/a>\r?\n/g, '');
  // responder.html ships as index.html, so retarget every link to it.
  out = out.split('responder.html').join('index.html');
  return out;
}

const sources = HTML.map(h => h.from).concat(STATIC);
for (const f of sources) {
  if (!fs.existsSync(path.join(SRC, f))) {
    console.error('ABORT: missing source  www/' + f);
    process.exit(1);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const h of HTML) {
  const src = fs.readFileSync(path.join(SRC, h.from), 'utf8');
  fs.writeFileSync(path.join(OUT, h.to), transform(src));
}
for (const s of STATIC) {
  fs.copyFileSync(path.join(SRC, s), path.join(OUT, s));
}

const shipped = HTML.map(h => h.to).concat(STATIC);
console.log('generated responder-app/web from www/:');
for (const w of shipped) {
  const bytes = fs.statSync(path.join(OUT, w)).size;
  console.log('  web/' + w.padEnd(24) + String(bytes).padStart(9) + ' B');
}

// Guard: every page link inside the shipped HTML must exist in the bundle.
let dangling = 0;
for (const w of shipped.filter(x => x.endsWith('.html'))) {
  const text = fs.readFileSync(path.join(OUT, w), 'utf8');
  for (const link of new Set(text.match(/[A-Za-z0-9_-]+\.html/g) || [])) {
    if (!shipped.includes(link)) {
      console.warn('  DANGLING link in web/' + w + ': ' + link);
      dangling++;
    }
  }
}
console.log(dangling ? '  ' + dangling + ' dangling link(s) — fix before syncing' : '  no dangling page links');
process.exitCode = dangling ? 1 : 0;
