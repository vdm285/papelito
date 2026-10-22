// Find (and with --fix, repair) invisible control characters in sources: a heredoc in this shell
// once turned "\\b" in a regex into a real backspace (U+0008), which silently broke a check.
// Run: node tools/check-text.mjs [--fix]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const fix = process.argv.includes('--fix');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter((f) => /\.(m?js|css|html|json|md|ya?ml|py|tsv|txt)$/.test(f) && !f.startsWith('docs/history/'));
let bad = 0;
for (const f of files) {
  let s;
  try { s = readFileSync(f, 'utf8'); } catch { continue; }
  // control characters other than tab, newline and carriage return
  const hits = [...s.matchAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g)];
  if (!hits.length) continue;
  bad += hits.length;
  for (const h of hits.slice(0, 5)) {
    const line = s.slice(0, h.index).split('\n').length;
    console.log(`${f}:${line}  U+${h[0].charCodeAt(0).toString(16).padStart(4, '0')}`);
  }
  if (fix) {
    // a backspace inside source almost always was "\b" (a regex word boundary)
    writeFileSync(f, s.replace(/\u0008/g, '\\b'));
    console.log(`  fixed backspaces in ${f}`);
  }
}
console.log(bad ? `${bad} control character(s)` : 'clean');
process.exit(bad && !fix ? 1 : 0);
