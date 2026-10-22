// Contrast ratios (WCAG 2.x) of the text colours on their backgrounds, for both themes.
// Run: node tools/contrast.mjs   (reads the tokens from src/style.css)
import { readFileSync } from 'node:fs';

const css = readFileSync('src/style.css', 'utf8');
const block = (sel) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
const tokens = (b) => Object.fromEntries([...b.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const light = tokens(block(':root {'));
const dark = { ...light, ...tokens(block(":root[data-theme='pizarron'] {")) };

const rgb = (c) => {
  const m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const r = c.match(/rgba?\(([^)]+)\)/);
  if (r) return r[1].split(',').slice(0, 3).map((x) => parseFloat(x));
  return null;
};
const alpha = (c) => { const r = c.match(/rgba\([^)]*,\s*([\d.]+)\)/); return r ? parseFloat(r[1]) : 1; };
const over = (fg, bg, k = 1) => { const a = alpha(fg) * k; const f = rgb(fg); const b = rgb(bg); return f.map((v, i) => v * a + b[i] * (1 - a)); };
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const ratio = (fg, bg, k) => { const a = lum(over(fg, bg, k)); const b = lum(rgb(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

const pairs = [
  ['ink azul on paper', 'ink-azul', 'paper'], ['ink roja on paper', 'ink-roja', 'paper'], ['ink verde on paper', 'ink-verde', 'paper'],
  ['ink negra on paper', 'ink-negra', 'paper'], ['ink morada on paper', 'ink-morada', 'paper'], ['ink cafe on paper', 'ink-cafe', 'paper'],
  ['pencil on paper (notes, suggestions, aisle heads)', 'pencil', 'paper'], ['pencil-soft on paper (placeholders)', 'pencil-soft', 'paper'],
  ['chrome-soft on paper (fold, status)', 'chrome-soft', 'paper'], ['chrome on card', 'chrome', 'card'], ['chrome-soft on card', 'chrome-soft', 'card'],
  ['toast', 'toast-ink', 'toast'],
  ['desk-ink on desk (labels beside the paper)', 'desk-ink', 'desk'],
  ...['azul', 'roja', 'verde', 'negra', 'morada', 'cafe'].map((i) => [`struck ink ${i} (faded) on paper`, `ink-${i}`, 'paper', 'struck-fade']),
  ...['azul', 'roja', 'verde', 'negra', 'morada', 'cafe'].map((i) => [`struck ink ${i} in print (faded; needs AA) on paper`, `ink-${i}`, 'paper', 'struck-fade-print']),
  // a new item from the other phone sits on the highlighter (needs AA: it may be in print)
  ...['azul', 'roja', 'verde', 'negra', 'morada', 'cafe'].map((i) => [`ink ${i} on the highlighter (needs AA)`, `ink-${i}`, 'marker-on-paper']),
];
for (const [, tk] of [['papel', light], ['pizarron', dark]]) tk['marker-on-paper'] = hex(over(tk.marker, tk.paper));
for (const [theme, tk] of [['papel', light], ['pizarron', dark]]) {
  console.log(`\n${theme}`);
  for (const [name, fg, bg, fade] of pairs) {
    const r = ratio(tk[fg], tk[bg], fade ? parseFloat(tk[fade]) : 1);
    console.log(`${r >= 4.5 ? 'AA ' : r >= 3 ? 'aa*' : 'LOW'}  ${r.toFixed(2).padStart(5)}  ${name}  (${tk[fg]} on ${tk[bg]})`);
  }
}
console.log('\nAA = 4.5:1 normal text; aa* = only 3:1 large text / UI; LOW = fails');
