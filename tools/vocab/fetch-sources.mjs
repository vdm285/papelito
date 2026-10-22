// Refresh the committed, derived vocabulary sources in data/vocab/sources/ (docs/PIPELINES.md, "Vocabulary").
// Run by hand a few times a year; the build (tools/vocab/build.mjs) never touches the network.
//
//   node tools/vocab/fetch-sources.mjs                # full refresh: stream PROFECO QQP (≈ 3-7 min), fetch ENIGH and CLDR
//   node tools/vocab/fetch-sources.mjs --from-cache   # rebuild data/vocab/sources/ from data/cache/vocab only (no network, seconds)
//
// Options:
//   --offline      stream QQP (local files) but reuse the cached ENIGH and CLDR downloads
//   --skip-qqp     reuse the cached QQP stream aggregate but fetch ENIGH and CLDR again
//   --qqp <dir>    the extracted QQP CSVs (default $QQP_EXTRACT or D:/_GitHub/CompaPrecio/data/cache/qqp/extract; read only)
//   --cache <dir>  where downloads and the QQP stream aggregate live (default data/cache/vocab)
//   --out <dir>    where the derived files go (default data/vocab/sources; LICENSES/ is written only for the default)
//
// Inputs and licences (all checked 2026-10-21; see data/cache/understand/vocab.md and docs/PIPELINES.md):
//   PROFECO QQP 2025-2026 archives (CC BY 4.0) — streamed from CompaPrecio's cache, never downloaded here
//     (datos.profeco.gob.mx blocks GitHub's runners, so the derived tables are committed);
//   INEGI ENIGH 2024 catálogo de gastos (Términos de Libre Uso) — one 56 KB member pulled from INEGI's zip with HTTP Range;
//   Unicode CLDR 49 annotations es/es_419/es_MX + emoji-test.txt (Unicode License v3).
// Outputs (each starts with "#" lines: source, url, retrieved, licence, inputs):
//   data/vocab/sources/qqp-productos.tsv, qqp-marcas.tsv, qqp-variedades.tsv, enigh2024-gastos.csv,
//   cldr49-emoji-es-MX.tsv; LICENSES/Unicode-3.0.txt.
// qqp-variedades.tsv carries a human "keep" (0/1) and "term" column; a refresh keeps them for rows that still exist.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { ROOT, SOURCES as DEFAULT_SOURCES, CACHE, fold, bestSpelling, lines, readTsv, mxDate, writeText, rel } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const FROM_CACHE = argv.includes('--from-cache');
const OFFLINE = FROM_CACHE || argv.includes('--offline');
const SKIP_QQP = FROM_CACHE || argv.includes('--skip-qqp');
const SOURCES = path.resolve(opt('--out', DEFAULT_SOURCES));
const CACHE_DIR = path.resolve(opt('--cache', CACHE));
const QQP_DIR = path.resolve(opt('--qqp', process.env.QQP_EXTRACT || 'D:/_GitHub/CompaPrecio/data/cache/qqp/extract'));
const QQP_MANIFEST = path.resolve(QQP_DIR, '..', 'raw', 'manifest.json'); // CompaPrecio's record of the archives (sha256, retrieved)
const STREAM = path.join(CACHE_DIR, 'qqp-stream');
const DL = path.join(CACHE_DIR, 'dl');
const UA = 'Papelito-vocab/1.0 (https://github.com/vdm285/listolista; build-time, a few requests a year)';
const TODAY = mxDate();
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const log = (...a) => console.log('[sources]', ...a);

// ---------------------------------------------------------------- PROFECO QQP

// Categories that are not groceries or household goods: kept in qqp-productos.tsv (so the mapping can say "-"),
// left out of the brand and variety tables.
const NON_GROCERY = new Set(['medicamentos', 'aparatos electricos', 'aparatos electronicos', 'material escolar',
  'arts de esparcimiento juguetes', 'articulos deportivos', 'refrigeradores'].map(fold));
const NO_BRAND = new Set(['s m', 'cualquier marca', 'marca propia', 'sin marca'].map(fold));

function listCsv(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listCsv(p));
    else if (e.name.toLowerCase().endsWith('.csv')) out.push(p);
  }
  return out.sort();
}

// the first n fields of a CSV line (RFC 4180 quotes)
function fields(line, n) {
  const f = [];
  let i = 0;
  while (f.length < n && i <= line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      let s = '';
      for (;;) {
        const q = line.indexOf('"', j);
        if (q < 0) { s += line.slice(j); i = line.length + 1; break; }
        if (line[q + 1] === '"') { s += line.slice(j, q + 1); j = q + 2; continue; }
        s += line.slice(j, q); i = q + 2; break;
      }
      f.push(s);
    } else {
      const c = line.indexOf(',', i);
      if (c < 0) { f.push(line.slice(i)); i = line.length + 1; } else { f.push(line.slice(i, c)); i = c + 1; }
    }
  }
  return f;
}

/** Stream every QQP CSV once and keep (producto, presentación, marca, categoría, catálogo) → rows, first, last date. */
async function streamQqp() {
  const files = listCsv(QQP_DIR);
  if (!files.length) throw new Error(`no QQP CSVs under ${QQP_DIR}`);
  const agg = new Map();
  const manifest = { dir: QQP_DIR, started: new Date().toISOString(), files: [] };
  const t0 = Date.now();
  for (const file of files) {
    const st = fs.statSync(file);
    let rest = '';
    let first = true;
    let rows = 0;
    let cols = null;
    for await (const chunk of fs.createReadStream(file, { highWaterMark: 4 << 20, encoding: 'utf8' })) {
      const parts = (rest + chunk).split('\n');
      rest = parts.pop();
      for (let line of parts) {
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (first) { // header: find the columns by name
          first = false;
          const h = fields(line.replace(/^\uFEFF/, ''), 20).map(fold);
          cols = ['producto', 'presentacion', 'marca', 'categoria', 'catalogo', 'fecha registro'].map((n) => h.indexOf(n));
          if (cols.some((c) => c < 0)) throw new Error(`${file}: unexpected header ${h.join(',')}`);
          continue;
        }
        if (!line) continue;
        const f = fields(line, Math.max(...cols) + 1);
        const key = [f[cols[0]], f[cols[1]], f[cols[2]], f[cols[3]], f[cols[4]]].map((s) => (s || '').trim()).join('\t');
        const date = (f[cols[5]] || '').slice(0, 10);
        const e = agg.get(key);
        if (e) { e[0]++; if (date < e[1]) e[1] = date; if (date > e[2]) e[2] = date; } else agg.set(key, [1, date, date]);
        rows++;
      }
    }
    manifest.files.push({ file: path.relative(QQP_DIR, file).split(path.sep).join('/'), bytes: st.size, rows });
    log(path.basename(file), rows, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  manifest.rows = manifest.files.reduce((a, f) => a + f.rows, 0);
  manifest.tuples = agg.size;
  manifest.seconds = Math.round((Date.now() - t0) / 1000);
  manifest.finished = new Date().toISOString();
  try { manifest.archives = JSON.parse(fs.readFileSync(QQP_MANIFEST, 'utf8')); } catch { manifest.archives = null; }
  const out = ['producto\tpresentacion\tmarca\tcategoria\tcatalogo\trows\tfirst\tlast'];
  for (const [k, [n, a, b]] of [...agg.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) out.push(`${k}\t${n}\t${a}\t${b}`);
  writeText(path.join(STREAM, 'qqp-tuples.tsv'), out.join('\n') + '\n');
  writeText(path.join(STREAM, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  log(`QQP: ${manifest.rows} rows, ${agg.size} distinct tuples, ${manifest.seconds} s`);
}

function readTuples() {
  const file = path.join(STREAM, 'qqp-tuples.tsv');
  if (!fs.existsSync(file)) throw new Error(`${rel(file)} is missing: run once without --from-cache (it streams QQP from CompaPrecio's cache)`);
  const manifest = JSON.parse(fs.readFileSync(path.join(STREAM, 'manifest.json'), 'utf8'));
  const tuples = lines(file).slice(1).filter(Boolean).map((l) => {
    const [producto, presentacion, marca, categoria, catalogo, rows, first, last] = l.split('\t');
    return { producto, presentacion, marca, categoria, catalogo, rows: +rows, first, last };
  });
  return { tuples, manifest };
}

const bump = (m, k, n) => m.set(k, (m.get(k) || 0) + n);
// "Nescafé. Clásico" → "Nescafé" (QQP writes brand ". " sub-line); "Dr. Pepper", "L. a. Cetto", "X-a. Domecq" stay whole
const baseBrand = (marca) => {
  const m = marca.match(/^(.*?)\.\s/);
  return (m && m[1].replace(/[^\p{L}]/gu, '').length >= 3 ? m[1] : marca).trim();
};

function qqpHeader(manifest, what) {
  const a = manifest.archives || {};
  const arch = Object.entries(a).map(([n, x]) => `${n} ${x.bytes} bytes sha256 ${x.sha256} retrieved ${String(x.retrieved).slice(0, 10)}`);
  const dates = manifest.dateRange ? ` covering ${manifest.dateRange}` : '';
  return [
    `# ${what}`,
    '# source: PROFECO (Procuraduría Federal del Consumidor), «Quién es Quién en los Precios» (QQP), open data of the Government of Mexico',
    '# url: https://datos.profeco.gob.mx/datos_abiertos/qqp.php (dataset record: https://www.datos.gob.mx/dataset/programa_quien_es_quien_precios_2026)',
    '# licence: Creative Commons Attribution 4.0 (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/ (datos.gob.mx record, checked 2026-10-21); changes: aggregated and reshaped by Papelito',
    `# retrieved: archives ${arch.length ? 'downloaded by CompaPrecio' : '(manifest not found)'}; ${arch.join('; ') || 'see CompaPrecio/data/cache/qqp/raw/manifest.json'}`,
    `# inputs: ${manifest.files.length} CSV files, ${manifest.rows} rows${dates}; streamed read-only by tools/vocab/fetch-sources.mjs; derived ${TODAY}`,
  ];
}

function deriveQqp() {
  const { tuples, manifest } = readTuples();
  let minD = '9999';
  let maxD = '0000';
  for (const t of tuples) { if (t.first && t.first < minD) minD = t.first; if (t.last > maxD) maxD = t.last; }
  manifest.dateRange = `${minD.replace(/\//g, '-')} to ${maxD.replace(/\//g, '-')}`;

  // products
  const prods = new Map(); // fold(producto) → { spell, cat: Map(foldcat → rows), catSpell: Map, catalog: Map, rows, first, last, brands: Map(foldbase → rows), brandSpell }
  const catSpell = new Map(); // fold(categoria) → Map(spelling → rows)
  const catalogSpell = new Map();
  for (const t of tuples) {
    const k = fold(t.producto);
    if (!k) continue;
    let p = prods.get(k);
    if (!p) prods.set(k, (p = { spell: new Map(), cat: new Map(), catalog: new Map(), rows: 0, first: t.first, last: t.last, brands: new Map(), brandSpell: new Map() }));
    bump(p.spell, t.producto, t.rows);
    const ck = fold(t.categoria);
    bump(p.cat, ck, t.rows);
    if (!catSpell.has(ck)) catSpell.set(ck, new Map());
    bump(catSpell.get(ck), t.categoria, t.rows);
    const lk = fold(t.catalogo);
    bump(p.catalog, lk, t.rows);
    if (!catalogSpell.has(lk)) catalogSpell.set(lk, new Map());
    bump(catalogSpell.get(lk), t.catalogo, t.rows);
    p.rows += t.rows;
    if (t.first < p.first) p.first = t.first;
    if (t.last > p.last) p.last = t.last;
    const b = baseBrand(t.marca);
    const bk = fold(b);
    if (bk && !NO_BRAND.has(bk)) {
      bump(p.brands, bk, t.rows);
      if (!p.brandSpell.has(bk)) p.brandSpell.set(bk, new Map());
      bump(p.brandSpell.get(bk), b, t.rows);
    }
  }
  const catName = (ck) => bestSpelling(catSpell.get(ck));
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const prodRows = [];
  for (const [k, p] of [...prods.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const cats = top(p.cat);
    prodRows.push([bestSpelling(p.spell), catName(cats[0][0]), top(p.catalog).map(([lk]) => bestSpelling(catalogSpell.get(lk))).join('|'), p.rows,
      p.first.replace(/\//g, '-'), p.last.replace(/\//g, '-'), top(p.brands).slice(0, 6).map(([bk]) => bestSpelling(p.brandSpell.get(bk))).join('|'),
      cats.slice(1).map(([ck, n]) => `${catName(ck)}:${n}`).join('|')].join('\t'));
  }
  writeText(path.join(SOURCES, 'qqp-productos.tsv'), [...qqpHeader(manifest, `qqp-productos.tsv: one row per generic product (PRODUCTO, accent variants merged), ${prodRows.length} rows`),
    '# columns: producto (best spelling), categoria (main), catalogo (all, by rows), rows, first, last (dates seen), marcas (top 6 base brands, text before ". "; no "S/M"), otras_categorias (category:rows)',
    'producto\tcategoria\tcatalogo\trows\tfirst\tlast\tmarcas\totras_categorias', ...prodRows].join('\n') + '\n');

  // brands × product (groceries and household goods only)
  const bp = new Map(); // fold(base) + \t + fold(producto) → { b: Map(spelling), rows, cat: Map }
  for (const t of tuples) {
    const ck = fold(t.categoria);
    if (NON_GROCERY.has(ck)) continue;
    const b = baseBrand(t.marca);
    const bk = fold(b);
    if (!bk || NO_BRAND.has(bk)) continue;
    const key = `${bk}\t${fold(t.producto)}`;
    let e = bp.get(key);
    if (!e) bp.set(key, (e = { b: new Map(), rows: 0, cat: new Map() }));
    bump(e.b, b, t.rows);
    bump(e.cat, ck, t.rows);
    e.rows += t.rows;
  }
  const brandSpell = new Map(); // one display spelling per brand across products
  for (const [key, e] of bp) { const bk = key.split('\t')[0]; if (!brandSpell.has(bk)) brandSpell.set(bk, new Map()); for (const [s, n] of e.b) bump(brandSpell.get(bk), s, n); }
  const brandRows = [...bp.entries()].map(([key, e]) => {
    const [bk, pk] = key.split('\t');
    return { bk, line: [bestSpelling(brandSpell.get(bk)), bestSpelling(prods.get(pk).spell), catName(top(e.cat)[0][0]), e.rows].join('\t'), rows: e.rows };
  }).sort((a, b) => (a.bk < b.bk ? -1 : a.bk > b.bk ? 1 : b.rows - a.rows));
  writeText(path.join(SOURCES, 'qqp-marcas.tsv'), [...qqpHeader(manifest, `qqp-marcas.tsv: brand × product × rows, groceries and household goods only (no medicines or durables), ${brandRows.length} rows, ${brandSpell.size} brands`),
    '# columns: marca (base brand: MARCA before the first ". " when that part has 3+ letters, e.g. "Nescafé. Clásico" → Nescafé, "Dr. Pepper" stays; "S/M" and "Cualquier Marca" left out), producto, categoria, rows',
    'marca\tproducto\tcategoria\trows', ...brandRows.map((r) => r.line)].join('\n') + '\n');

  // varieties mined from PRESENTACIÓN
  const pres = new Map(); // fold(producto) → Map(presentacion → rows)
  for (const t of tuples) {
    if (NON_GROCERY.has(fold(t.categoria))) continue;
    const pk = fold(t.producto);
    if (!pres.has(pk)) pres.set(pk, new Map());
    bump(pres.get(pk), t.presentacion, t.rows);
  }
  const vars = new Map(); // pk \t fold(phrase) → { spell: Map, rows }
  for (const [pk, m] of pres) for (const [pr, n] of m) for (const ph of varietyPhrases(pr)) {
    const key = `${pk}\t${fold(ph)}`;
    let e = vars.get(key);
    if (!e) vars.set(key, (e = { spell: new Map(), rows: 0 }));
    bump(e.spell, ph, n);
    e.rows += n;
  }
  // keep the human columns of the previous file
  const prevFile = path.join(SOURCES, 'qqp-variedades.tsv');
  const prev = new Map();
  if (fs.existsSync(prevFile)) for (const r of readTsv(prevFile).rows) prev.set(`${fold(r.producto)}\t${fold(r.variedad)}`, { keep: r.keep || '0', term: r.term || '' });
  const varRows = [...vars.entries()].map(([key, e]) => {
    const pk = key.split('\t')[0];
    const p = prev.get(key) || { keep: '0', term: '' };
    return { pk, rows: e.rows, line: [bestSpelling(prods.get(pk).spell), bestSpelling(e.spell), e.rows, p.keep, p.term].join('\t') };
  }).sort((a, b) => (a.pk < b.pk ? -1 : a.pk > b.pk ? 1 : b.rows - a.rows));
  const kept = varRows.filter((r) => r.line.split('\t')[3] === '1').length;
  const lost = [...prev.entries()].filter(([k, v]) => v.keep === '1' && !vars.has(k)).map(([k]) => k.replace('\t', ' / '));
  if (lost.length) log(`WARNING: ${lost.length} kept varieties no longer in the data: ${lost.join('; ')}`);
  writeText(prevFile, [...qqpHeader(manifest, `qqp-variedades.tsv: variety phrases mined from PRESENTACIÓN, groceries and household goods only, ${varRows.length} rows (${kept} kept)`),
    '# columns: producto, variedad (words of PRESENTACIÓN between sizes, units and packaging words, lowercased, accents as written), rows,',
    '#   keep (HUMAN: 1 = an everyday shopping word that ships, in the product\'s aisle; 0 = not used), term (HUMAN, optional: the phrase to ship when it differs from variedad)',
    '# A refresh keeps keep/term for rows that still exist. Ticked by Claude (AI) on 2026-10-22, awaiting owner review.',
    'producto\tvariedad\trows\tkeep\tterm', ...varRows.map((r) => r.line)].join('\n') + '\n');
  log(`QQP: ${prodRows.length} products, ${brandSpell.size} brands (${brandRows.length} brand × product rows), ${varRows.length} varieties (${kept} kept)`);
}

// Words that describe the package, the size or the unit rather than the thing.
const PACK = new Set(('paquete caja bolsa bolsita botella lata frasco sobre sobres pieza piezas pza pzas kg kgs gr grs g ml lt lts l litro litros ' +
  'granel vaso envase tetrapak tetra pak brik bote cubeta tarro charola rollos rollo hojas hoja mg cm aprox aproximadamente x pack paq ' +
  'unidades unidad tubo barra estuche blister ampolleta tableta tabletas capsulas no oz diametro peso promedio contenido neto ' +
  'presentacion surtido varios variado c u pz exhibidor display canastilla six multipack plastico vidrio carton tapa rosca dosificador ' +
  'atomizador spray aerosol doypack sachet repuesto recarga economico economica familiar mini maxi chico chica mediano mediana grande').split(' '));
const EDGE = new Set('de del la el los las y o en con para por a al un una sin'.split(' '));

/** Variety phrases inside one PRESENTACIÓN text: the runs of words between sizes, units and packaging words. */
function varietyPhrases(pres) {
  const out = new Set();
  for (const seg of String(pres).split(/\.\s+|\.$|[(),;:/]|\s+o\s+/)) {
    let run = [];
    const flush = () => {
      while (run.length && EDGE.has(fold(run[0]))) run.shift();
      while (run.length && EDGE.has(fold(run[run.length - 1]))) run.pop();
      const ph = run.join(' ');
      if (run.length && run.length <= 5 && fold(ph).length >= 3) out.add(ph);
      run = [];
    };
    for (const tok of seg.trim().split(/\s+/)) {
      const w = tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
      const f = fold(w);
      if (!f || /^\d/.test(f) || PACK.has(f) || f.length < 2) { flush(); continue; }
      run.push(w);
    }
    flush();
  }
  return [...out];
}

// ---------------------------------------------------------------- INEGI ENIGH 2024

const ENIGH_ZIP = 'https://www.inegi.org.mx/contenidos/programas/enigh/nc/2024/datosabiertos/conjunto_de_datos_enigh2024_ns_csv.zip';
const ENIGH_DIR = () => path.join(DL, 'inegi', 'enigh2024');

async function range(url, a, b) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Range: `bytes=${a}-${b}` } });
  if (r.status !== 206) throw new Error(`${url}: no range support (HTTP ${r.status})`);
  return { buf: Buffer.from(await r.arrayBuffer()), total: +r.headers.get('content-range').split('/')[1], headers: Object.fromEntries(r.headers) };
}

/** Pull single members out of a remote zip by reading its central directory with HTTP Range. */
async function zipMembers(url, wanted) {
  const probe = await range(url, 0, 0);
  const size = probe.total;
  const tailLen = Math.min(size, 256 * 1024);
  const { buf: tail } = await range(url, size - tailLen, size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('zip: end of central directory not found');
  const n = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOff = tail.readUInt32LE(eocd + 16);
  const { buf: cd } = await range(url, cdOff, cdOff + cdSize - 1);
  const found = {};
  for (let p = 0, i = 0; i < n; i++) {
    const method = cd.readUInt16LE(p + 10);
    const csize = cd.readUInt32LE(p + 20);
    const fl = cd.readUInt16LE(p + 28);
    const xl = cd.readUInt16LE(p + 30);
    const cl = cd.readUInt16LE(p + 32);
    const off = cd.readUInt32LE(p + 42);
    const name = cd.slice(p + 46, p + 46 + fl).toString('latin1');
    p += 46 + fl + xl + cl;
    for (const [k, re] of Object.entries(wanted)) {
      if (found[k] || !re.test(name)) continue;
      const { buf: lh } = await range(url, off, off + 29);
      const start = off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const { buf: data } = await range(url, start, start + csize - 1);
      found[k] = { name, data: method === 8 ? zlib.inflateRawSync(data) : data };
    }
  }
  return { size, headers: probe.headers, found };
}

async function fetchEnigh() {
  const { size, headers, found } = await zipMembers(ENIGH_ZIP, {
    gastos: /gastoshogar_enigh2024_ns\/catalogos\/gastos\.csv$/i,
    meta: /gastoshogar_enigh2024_ns\/.*metadatos_enigh_2024_ns\.txt$/i,
  });
  if (!found.gastos) throw new Error('ENIGH: gastos.csv not found in the zip');
  const dir = ENIGH_DIR();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'gastos.csv'), found.gastos.data);
  if (found.meta) fs.writeFileSync(path.join(dir, 'metadatos_enigh_2024_ns.txt'), found.meta.data);
  fs.writeFileSync(path.join(dir, 'gastos.csv.meta.json'), JSON.stringify({ url: ENIGH_ZIP, member: found.gastos.name, zipBytes: size,
    lastModified: headers['last-modified'] || '', retrieved: new Date().toISOString(), bytes: found.gastos.data.length }, null, 1));
  log(`ENIGH: ${found.gastos.name} ${found.gastos.data.length} bytes`);
}

function deriveEnigh() {
  const dir = ENIGH_DIR();
  const file = path.join(dir, 'gastos.csv');
  if (!fs.existsSync(file)) throw new Error(`${rel(file)} is missing: run without --from-cache`);
  const raw = fs.readFileSync(file);
  let retrieved = '';
  try { retrieved = JSON.parse(fs.readFileSync(file + '.meta.json', 'utf8')).retrieved; } catch { retrieved = fs.statSync(file).mtime.toISOString(); }
  let modified = '';
  try { modified = (fs.readFileSync(path.join(dir, 'metadatos_enigh_2024_ns.txt'), 'utf8').match(/^Modified:\s*(\S+)/m) || [])[1] || ''; } catch { /* none */ }
  const text = raw.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = text.trim().split('\n').length - 1;
  writeText(path.join(SOURCES, 'enigh2024-gastos.csv'), [
    `# enigh2024-gastos.csv: INEGI's catalogue of household spending items (code,description), ${rows} rows; codes follow COICOP 2018 (CCIF 2018)`,
    '# source: Fuente: INEGI, Encuesta Nacional de Ingresos y Gastos de los Hogares (ENIGH) 2024, nueva serie, catálogo de gastos',
    `# url: ${ENIGH_ZIP} (member conjunto_de_datos_gastoshogar_enigh2024_ns/catalogos/gastos.csv, read with HTTP Range)`,
    `# retrieved: ${mxDate(new Date(retrieved))}; INEGI metadata "Modified: ${modified || 'unknown'}"`,
    '# licence: INEGI «Términos de Libre Uso de la Información del INEGI», https://www.inegi.org.mx/inegi/terminos.html: credit «Fuente: INEGI»; the grouping into aisles is Papelito\'s, not INEGI\'s; no endorsement implied',
    `# inputs: as downloaded, sha256 ${sha256(raw)} (${raw.length} bytes, CRLF); this copy only adds these # lines and uses LF line endings`,
    text.trimEnd()].join('\n') + '\n');
  log(`ENIGH: ${rows} rows`);
}

// ---------------------------------------------------------------- Unicode CLDR 49

const CLDR_TAG = 'release-49';
const CLDR_LOCALES = ['es', 'es_419', 'es_MX'];
const EMOJI_TEST = 'https://www.unicode.org/Public/emoji/latest/emoji-test.txt';
const UNICODE_LICENSE = 'https://www.unicode.org/license.txt';
// Subgroups worth a doodle on a shopping list (the build assigns emoji automatically only in food, drink, household,
// medical and light & video; the others are here so a human can choose one in an override line).
const WANT = (group, sub) => group === 'Food & Drink' || /^(household|medical|light & video|animal-mammal|animal-bird|animal-marine|animal-bug|plant-flower|plant-other|personal-care|other-object|computer|clothing)$/.test(sub);

async function get(url, file) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  fs.writeFileSync(file + '.meta.json', JSON.stringify({ url, status: r.status, retrieved: new Date().toISOString(), bytes: buf.length,
    lastModified: r.headers.get('last-modified') || '', etag: r.headers.get('etag') || '' }, null, 1));
  log(`fetched ${url} (${buf.length} bytes)`);
}

async function fetchCldr() {
  for (const loc of CLDR_LOCALES) await get(`https://raw.githubusercontent.com/unicode-org/cldr/${CLDR_TAG}/common/annotations/${loc}.xml`, path.join(DL, 'cldr', `annotations-${loc}.xml`));
  await get(`https://raw.githubusercontent.com/unicode-org/cldr/${CLDR_TAG}/LICENSE`, path.join(DL, 'cldr', 'LICENSE.txt'));
  await get(EMOJI_TEST, path.join(DL, 'unicode', 'emoji-test.txt'));
  await get(UNICODE_LICENSE, path.join(DL, 'unicode', 'license.txt'));
}

function readAnnotations(file) {
  const x = fs.readFileSync(file, 'utf8');
  const m = new Map();
  for (const r of x.matchAll(/<annotation cp="([^"]+)" type="tts">([^<]*)<\/annotation>/g)) m.set(r[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'), r[2]);
  return m;
}

function deriveCldr() {
  const files = CLDR_LOCALES.map((l) => path.join(DL, 'cldr', `annotations-${l}.xml`));
  const testFile = path.join(DL, 'unicode', 'emoji-test.txt');
  for (const f of [...files, testFile]) if (!fs.existsSync(f)) throw new Error(`${rel(f)} is missing: run without --from-cache`);
  const chain = CLDR_LOCALES.map((l, i) => [l, readAnnotations(files[i])]).reverse(); // es_MX → es_419 → es
  const resolve = (cp) => { for (const [loc, m] of chain) { const v = m.get(cp); if (v && v !== '↑↑↑') return [v, loc]; } return [null, null]; };
  const test = lines(testFile);
  const version = (test.find((l) => /^# Version:/.test(l)) || '').replace(/^# Version:\s*/, '');
  const date = (test.find((l) => /^# Date:/.test(l)) || '').replace(/^# Date:\s*/, '');
  let group = '';
  let sub = '';
  const out = [];
  for (const l of test) {
    let m;
    if ((m = l.match(/^# group: (.*)/))) { group = m[1].trim(); continue; }
    if ((m = l.match(/^# subgroup: (.*)/))) { sub = m[1].trim(); continue; }
    if (!l || l.startsWith('#')) continue;
    m = l.match(/^[0-9A-F ]+;\s*fully-qualified\s*#\s*(\S+)\s+E([\d.]+)\s+(.*)$/);
    if (!m || !WANT(group, sub)) continue;
    const [name, loc] = resolve(m[1].replace(/\uFE0F/g, ''));
    if (!name) continue;
    out.push([m[1], m[2], sub, name, loc, m[3]].join('\t'));
  }
  const meta = (f) => { try { return JSON.parse(fs.readFileSync(f + '.meta.json', 'utf8')); } catch { return {}; } };
  const retrieved = meta(files[2]).retrieved || fs.statSync(files[2]).mtime.toISOString();
  writeText(path.join(SOURCES, 'cldr49-emoji-es-MX.tsv'), [
    `# cldr49-emoji-es-MX.tsv: ${out.length} fully-qualified emoji (food & drink, household, medical, light & video, animals, plants, some objects) with their Mexican Spanish names`,
    `# source: Unicode CLDR 49 (${CLDR_TAG}) common/annotations/es.xml, es_419.xml, es_MX.xml (type="tts" names resolved es_MX → es_419 → es); emoji versions from emoji-test.txt Version ${version} (${date})`,
    `# url: https://github.com/unicode-org/cldr/tree/${CLDR_TAG}/common/annotations ; ${EMOJI_TEST}`,
    `# retrieved: ${mxDate(new Date(retrieved))}`,
    '# licence: Unicode License v3 (SPDX Unicode-3.0), © 1991-2026 Unicode, Inc.; full text in LICENSES/Unicode-3.0.txt. Only names (not keywords) are used.',
    `# inputs: ${files.map((f) => `${path.basename(f)} sha256 ${sha256(fs.readFileSync(f))}`).join('; ')}; emoji-test.txt sha256 ${sha256(fs.readFileSync(testFile))}`,
    'emoji\tversion\tsubgroup\tname_es_MX\tname_from\tname_en', ...out].join('\n') + '\n');
  const lic = path.join(DL, 'unicode', 'license.txt');
  if (fs.existsSync(lic) && SOURCES === DEFAULT_SOURCES) writeText(path.join(ROOT, 'LICENSES', 'Unicode-3.0.txt'), fs.readFileSync(lic, 'utf8').replace(/\r\n?/g, '\n'));
  log(`CLDR: ${out.length} emoji, emoji-test ${version}`);
}

// ---------------------------------------------------------------- main

async function main() {
  const t0 = Date.now();
  if (!SKIP_QQP) await streamQqp();
  if (!OFFLINE) {
    await fetchEnigh();
    await fetchCldr();
  }
  fs.mkdirSync(SOURCES, { recursive: true });
  deriveQqp();
  deriveEnigh();
  deriveCldr();
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${rel(SOURCES)}`);
}

main().catch((e) => { console.error('[sources] FAILED:', e.stack || e.message); process.exit(1); });
