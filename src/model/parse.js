// What a person types, pastes or dictates becomes items. Rules (docs/EDITORIAL.md, "Writing"):
// - a new line, a comma or a semicolon ends an item ("huevos, leche" is two);
// - pasted lists lose their decoration: bullets, numbering, checkboxes, WhatsApp's
//   "[18:03, 21/10/2026] Ana:" prefix and *bold* / _italic_ / ~strike~ markers;
// - a line that ends with ":" is a heading ("Trae del súper:") and is not an item;
// - "y" never splits on its own ("pan y mantequilla" may be one thing). When several known
//   products sit in one item, the app offers a one-tap split instead (splitHint).
// A comma between two digits is a decimal comma ("1,5 kg"), not a separator.

const BULLET = /^\s*(?:[-*•·▪◦‣–—>+]|\[[ xX✓✔]?\]|[☐☑✓✔✗]|\(?\d{1,3}[.)\-:](?=\s)|\(?[a-z][.)](?=\s))\s*/u;
const WA_PREFIX = /^\s*\[[^\]]{4,40}\]\s*[^:\n]{1,40}:\s*/u; // [18:03, 21/10/2026] Ana: huevos
const WA_PREFIX_ANDROID = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?\s?m\.?)?\s*-\s*[^:\n]{1,40}:\s*/iu; // 21/10/26, 18:03 - Ana: huevos

// what a chat copy brings along that is not an item
const NOT_AN_ITEM = /^<?\s*(multimedia omitido|media omitted|imagen omitida|image omitted|video omitido|video omitted|audio omitido|audio omitted|sticker omitido|sticker omitted|gif omitido|gif omitted|documento omitido|document omitted|se eliminó este mensaje|this message was deleted|mensaje editado)\s*>?$/iu;
const HAS_CONTENT = /[\p{L}\p{N}]/u; // an item needs a letter or a digit (a lone 👍 is a reaction)
const MAX = 160;

export function splitInput(text) {
  const out = [];
  for (let line of String(text ?? '').replace(/\p{Cf}/gu, '').split(/\r?\n/)) {
    line = line.replace(WA_PREFIX, '').replace(WA_PREFIX_ANDROID, '');
    if (/:\s*$/.test(line) && line.trim().split(/\s+/).length <= 6) continue; // a heading
    // a heading followed by several items on the same line: "Trae: huevos, leche" (but
    // "Leche: 2 litros" is one item and keeps its name)
    line = line.replace(/^\s*[^,;:]{1,30}:\s+(?=[^,;]+[,;])/u, '');
    // commas between digits are decimals; protect them while splitting
    const parts = line.replace(/(\d),(\d)/g, '$1\u0000$2').split(/[,;]/);
    for (let p of parts) {
      p = p.replace(/\u0000/g, ',');
      p = stripDecoration(p).replace(/^(?:y|e)\s+(?=\S)/iu, ''); // "y papel de baño" from a pasted sentence
      if (!p || NOT_AN_ITEM.test(p) || !HAS_CONTENT.test(p)) continue;
      // too long for one line on the paper: split at a word boundary instead of cutting words off
      while (p.length > MAX) {
        const cut = p.lastIndexOf(' ', MAX);
        const at = cut > MAX / 2 ? cut : MAX;
        out.push(p.slice(0, at).trim());
        p = p.slice(at).trim();
      }
      if (p) out.push(p);
    }
  }
  return out;
}

function stripDecoration(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(BULLET, '');
  } while (s !== prev);
  s = s.replace(/(^|\s)[*_~]+(?=\S)|(?<=\S)[*_~]+(?=\s|$)/gu, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[.。]+$/u, '').trim();
  return s;
}

// ---------- quantities ----------

const NUMBER_WORDS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, media: 0.5, medio: 0.5,
};
const UNITS = [
  'kg', 'kgs', 'kilo', 'kilos', 'k', 'g', 'gr', 'grs', 'gramos', 'mg', 'l', 'lt', 'lts', 'litro', 'litros', 'ml', 'cc',
  'pza', 'pzas', 'pieza', 'piezas', 'paq', 'paquete', 'paquetes', 'bolsa', 'bolsas', 'caja', 'cajas', 'lata', 'latas',
  'botella', 'botellas', 'frasco', 'frascos', 'docena', 'docenas', 'rollo', 'rollos', 'sobre', 'sobres', 'manojo', 'manojos',
  'rebanadas', 'cuarto', 'oz', 'lb', 'galon', 'galón', 'six', 'sixpack', 'six-pack', 'charola', 'tira', 'tiras', 'barra', 'barras',
];
const UNIT_RE = UNITS.join('|');
// A leading quantity must end in a space ("7up" and "v8" are names, "2kg tortillas" is not).
const QTY_HEAD = new RegExp(
  `^(?:x\\s*)?(\\d+\\s*/\\s*\\d+|\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER_WORDS).join('|')})(?:\\s*x\\b)?(?:\\s*(${UNIT_RE})\\.?(?=\\s|$))?(?:\\s+(?:de|del)(?=\\s))?\\s+`,
  'iu',
);
const QTY_TAIL = new RegExp(`\\s+(?:x\\s*(\\d+)|\\((\\d+)\\)|(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})\\.?)\\s*$`, 'iu');

/**
 * Separate a leading or trailing quantity from the thing: "2 kg de tortillas" → { qty: '2 kg', what: 'tortillas' }.
 * The text on the page is never changed; this only feeds matching and the margin numeral.
 */
export function splitQuantity(text) {
  let what = String(text).trim();
  let qty = '';
  const head = what.match(QTY_HEAD);
  if (head) {
    const rest = what.slice(head[0].length).trim();
    if (rest) { qty = head[0].trim().replace(/\s+(?:de|del)$/iu, ''); what = rest; }
  }
  const tail = what.match(QTY_TAIL);
  if (tail && !qty) {
    qty = tail[0].trim().replace(/^\(|\)$/g, '');
    what = what.slice(0, tail.index).trim();
  }
  return { qty, what };
}
