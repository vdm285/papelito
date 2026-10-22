// Small helpers shared by the vocabulary tools (fetch-sources, build, check). Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VOCAB = path.join(ROOT, 'data', 'vocab');
export const SOURCES = path.join(VOCAB, 'sources');
export const OVERRIDES = path.join(ROOT, 'data', 'overrides', 'aisles');
export const BUILD = path.join(VOCAB, 'build');
export const DICT = path.join(ROOT, 'public', 'dict', 'es-MX.json');
export const CACHE = path.join(ROOT, 'data', 'cache', 'vocab');

/** Lowercase, no accents, ñ → n, only [a-z0-9] and single spaces (the same fold as src/model/aisles.js). */
export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Number of accented letters (used to prefer "Café" over "Cafe" when a source spells a name both ways). */
export const accents = (s) => (String(s).normalize('NFD').match(/[̀-ͯ]/g) || []).length;

/** The best spelling among variants { spelling: rows }: most accents, then most rows, then alphabetical. */
export function bestSpelling(m) {
  return [...m.entries()].sort((a, b) => accents(b[0]) - accents(a[0]) || b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}

/** Read a UTF-8 text file as LF lines (strips a BOM and CR). */
export function lines(file) {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
}

/** Read a TSV with "#" comment lines and a header row: [{ col: value }], plus the header comment lines. */
export function readTsv(file) {
  const all = lines(file);
  const comments = [];
  const rows = [];
  let head = null;
  all.forEach((l, i) => {
    if (l.startsWith('#')) { if (!head) comments.push(l); return; }
    if (!l.trim()) return;
    const f = l.split('\t');
    if (!head) { head = f; return; }
    const r = { _line: i + 1 };
    head.forEach((h, j) => { r[h] = (f[j] ?? '').trim(); });
    rows.push(r);
  });
  return { head, rows, comments };
}

/** A line-oriented human file: "text  # why" lines; returns [{ text, why, line }] (comments and blanks skipped). */
export function readList(file) {
  return lines(file).map((raw, i) => ({ raw, line: i + 1 })).filter((x) => x.raw.trim() && !x.raw.trim().startsWith('#')).map((x) => {
    const k = x.raw.indexOf('#');
    return { text: (k < 0 ? x.raw : x.raw.slice(0, k)).trim(), why: k < 0 ? '' : x.raw.slice(k + 1).trim(), line: x.line };
  });
}

/** Today's date in Mexico City, YYYY-MM-DD. */
export function mxDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Write a text file with LF endings, creating the folder. */
export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n'));
}

export const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
