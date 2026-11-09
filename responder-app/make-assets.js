/* Draws the RescueNet Responder icon + splash as vector, rasterised with sharp.
   Reuses the brand's own shield+cross glyph from responder.html so it stays
   on-brand, but swaps the resident app's location-pin for dispatch signal arcs. */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const NAVY = '#102d5c';
const ORANGE = '#ff6500';
const WHITE = '#ffffff';

const SHIELD = 'M12 2 4 5.5V11c0 5 3.4 8.6 8 11 4.6-2.4 8-6 8-11V5.5z';
const CROSS = 'M12 8v5M9.5 10.5h5';

/* Three dispatch arcs radiating from the shield's top-right shoulder. */
function arcs() {
  const cx = 19.4, cy = 4.6, a0 = -78, a1 = -6;
  return [3.3, 4.7, 6.1].map(r => {
    const p = (deg) => {
      const t = deg * Math.PI / 180;
      return [(cx + r * Math.cos(t)).toFixed(3), (cy + r * Math.sin(t)).toFixed(3)];
    };
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" fill="none" ` +
           `stroke="${ORANGE}" stroke-width="1.15" stroke-linecap="round"/>`;
  }).join('');
}

/* Emblem placed in a square canvas of `size` px, glyph scaled from its 24-unit box. */
function svg(size, glyphFrac, bg = NAVY) {
  const s = (size * glyphFrac) / 24;
  const pad = (size - s * 24) / 2;
  const dx = pad + s * 0.4;          // nudge left so the arcs sit inside the canvas
  const dy = pad + s * 1.1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${s.toFixed(4)})">
    <path d="${SHIELD}" fill="${WHITE}"/>
    <path d="${CROSS}" fill="none" stroke="${ORANGE}" stroke-width="2.5" stroke-linecap="round"/>
    ${arcs()}
  </g>
</svg>`;
}

const OUT = path.join(__dirname, 'assets');
fs.mkdirSync(OUT, { recursive: true });

async function run() {
  const jobs = [
    { file: 'icon-only.png', size: 1024, frac: 0.62 },
    { file: 'icon.png',      size: 1024, frac: 0.62 },
    { file: 'splash.png',    size: 2732, frac: 0.34 }
  ];
  for (const j of jobs) {
    const p = path.join(OUT, j.file);
    await sharp(Buffer.from(svg(j.size, j.frac)), { density: 300 })
      .resize(j.size, j.size).png().toFile(p);
    console.log('  assets/' + j.file.padEnd(16) + j.size + 'x' + j.size +
      '  ' + (fs.statSync(p).size / 1024).toFixed(0) + ' KB');
  }
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
