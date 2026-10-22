// The aisle dictionary, loaded after the first frame (pay for what you use). Built by
// tools/vocab/build.mjs into public/dict/es-MX.json; see docs/PIPELINES.md.
import { buildIndex } from '../model/aisles.js';

let index = null;
let meta = null;
let loading = null;

export function dictIndex() { return index; }
export function dictMeta() { return meta; }

export function loadDict() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}dict/es-MX.json`);
      // the dev server answers a missing file with index.html and 200: check what came back
      if (!res.ok || !/json/.test(res.headers.get('content-type') || '')) throw new Error(`dictionary: ${res.status}`);
      const dict = await res.json();
      meta = { built: dict.built, sources: dict.sources || [], terms: Object.keys(dict.terms || {}).length };
      index = buildIndex(dict);
      index.terms = dict.terms;
      index.aisleEmoji = Object.fromEntries((dict.aisles || []).map((a) => [a.id, a.emoji || '']));
    } catch (e) {
      console.warn(String(e));
      index = buildIndex({ terms: {} });
      index.terms = {};
    }
    return index;
  })();
  return loading;
}

/** Up to n dictionary phrases that start like what is being typed (for suggestions). */
export function completions(prefix, n = 3) {
  if (!index || !index.terms) return [];
  const f = fold(prefix);
  if (f.length < 2) return [];
  const out = [];
  if (!index.folded) index.folded = Object.keys(index.terms).map((term) => [fold(term), term]);
  for (const [k, term] of index.folded) {
    if (k.startsWith(f)) { out.push(term); if (out.length >= n * 4) break; }
  }
  return out.sort((a, b) => a.length - b.length).slice(0, n);
}

const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
