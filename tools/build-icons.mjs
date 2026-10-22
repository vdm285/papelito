// The app icon: a small ruled sheet with a red margin and three lines of ballpoint "writing",
// the middle one struck through. Drawn here as SVG; rasterized with sharp.
// Run: node tools/build-icons.mjs   → public/favicon.svg, icon-192/512, icon-maskable-512, apple-touch-icon
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const ink = '#1f3c96';
const rule = '#9fb8dd';
const margin = '#e0778a';
const paper = '#fdfbf5';

// squiggles that read as handwriting at icon size (no letters, so no language)
const scribble = (x, y, w, seed) => {
  let d = `M${x} ${y}`;
  let cx = x;
  let s = seed;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  // cursive arches ("m", "n") with an occasional tall letter ("l", "d"), and a gap between words
  let n = 0;
  while (cx < x + w) {
    const tall = r() < 0.22;
    const step = 18 + r() * 10;
    const h = tall ? 46 + r() * 10 : 20 + r() * 8;
    d += ` c${(step * 0.05).toFixed(1)} ${(-h).toFixed(1)} ${(step * 0.75).toFixed(1)} ${(-h).toFixed(1)} ${step.toFixed(1)} 0`;
    cx += step;
    if (++n % 5 === 0 && cx < x + w - 40) { cx += 18; d += ` m18 0`; }
  }
  return d;
};

function iconSvg({ size = 512, pad = 0, round = 112 }) {
  const s = 512;
  const inner = s - pad * 2;
  const k = inner / s;
  const g = (v) => (pad + v * k).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${pad ? 0 : round}" fill="${pad ? '#efe8da' : paper}"/>
  ${pad ? `<rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${round * k}" fill="${paper}"/>` : ''}
  <g stroke-linecap="round" fill="none">
    ${[176, 272, 368].map((y) => `<line x1="${g(40)}" x2="${g(472)}" y1="${g(y)}" y2="${g(y)}" stroke="${rule}" stroke-width="${(6 * k).toFixed(1)}"/>`).join('')}
    <line x1="${g(128)}" x2="${g(128)}" y1="${g(36)}" y2="${g(476)}" stroke="${margin}" stroke-width="${(7 * k).toFixed(1)}"/>
    <g transform="translate(${g(0)} ${g(0)}) scale(${k.toFixed(4)})" stroke="${ink}" stroke-width="9.5" stroke-linejoin="round">
      <path d="${scribble(160, 168, 250, 7)}"/>
      <path d="${scribble(160, 264, 210, 3)}"/>
      <path d="${scribble(160, 360, 170, 11)}"/>
      <path d="M146 254 C 230 242, 320 248, 404 232" stroke-width="12"/>
    </g>
  </g>
</svg>`;
}

writeFileSync('public/favicon.svg', iconSvg({ size: 64 }));
const out = [
  ['public/icon-192.png', 192, {}],
  ['public/icon-512.png', 512, {}],
  ['public/apple-touch-icon.png', 180, { round: 0 }],
  ['public/icon-maskable-512.png', 512, { pad: 64, round: 60 }],
];
for (const [file, size, opts] of out) {
  await sharp(Buffer.from(iconSvg({ size: 512, ...opts }))).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log(file);
}
