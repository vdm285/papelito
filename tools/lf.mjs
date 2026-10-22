// Normalize text files in the repo to LF line endings (Windows tools sometimes write CRLF).
// Run: node tools/lf.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean);
let fixed = 0;
for (const f of files) {
  if (/\.(png|jpg|jpeg|gif|webp|woff2?|ico|zip)$/i.test(f)) continue;
  if (f.startsWith('docs/history/')) continue; // history stays byte-for-byte as it was found
  let buf;
  try { buf = readFileSync(f); } catch { continue; }
  if (!buf.includes(13)) continue;
  writeFileSync(f, buf.toString('utf8').replace(/\r\n/g, '\n'));
  fixed++;
  console.log(`LF: ${f}`);
}
console.log(`${fixed} file(s) normalized`);
