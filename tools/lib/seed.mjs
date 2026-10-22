// Demo lists for screenshots and smoke tests, built with the app's own model so they are valid
// documents. The items are an everyday Mexican shopping list written for the demo; nothing here is
// presented as data.
import { createClock } from '../../src/model/hlc.js';
import { emptyDoc, addItem, setDone, setTitle, setDevice, canonical } from '../../src/model/doc.js';

export const ME = 'demome00';
export const OTHER = 'demotro0';

/** localStorage entries for one list, as the app writes them. */
export function seedList({ title = 'Súper del sábado', aisles = false, hand = 'mano', theme = 'auto', now = Date.now(), fresh = true, short = false } = {}) {
  let t = now - 3 * 3600e3;
  const me = createClock(ME, () => t);
  const other = createClock(OTHER, () => t);
  const doc = emptyDoc();
  setTitle(doc, me, title);
  setDevice(doc, me, 'ink', 'azul');
  setDevice(doc, other, 'ink', 'verde');
  const mine = short
    ? ['1 kg de tortillas', 'jitomate', 'cebolla', '2 aguacates', 'leche Lala', 'pan Bimbo', 'frijoles']
    : ['1 kg de tortillas', 'jitomate', 'cebolla', '2 aguacates', 'cilantro', 'leche Lala', 'huevos', 'papel de baño', 'Fabuloso', 'pan Bimbo', 'frijoles'];
  const ids = {};
  mine.forEach((text, i) => { t += 40_000; ids[text] = `m${String(i).padStart(7, '0')}`; addItem(doc, me, ids[text], text); });
  t += 3600e3;
  other.observe(me.tick());
  ids['croquetas'] = 'o0000001';
  addItem(doc, other, ids['croquetas'], 'croquetas para el perro');
  setDone(doc, other, ids['pan Bimbo'], true);
  setDone(doc, me, ids['frijoles'], true);
  const seenBefore = me.tick();
  if (fresh) { t += 60_000; other.observe(me.tick()); ids['chiles'] = 'o0000002'; addItem(doc, other, ids['chiles'], 'chiles serranos'); }
  const id = 'demo000001';
  const rec = { id, doc: JSON.parse(canonical(doc)), aisles, seen: seenBefore };
  return {
    'll.device': ME,
    'll.lists': JSON.stringify([{ id, title, updated: now, shared: false }, { id: 'demo000002', title: 'Fiesta de cumpleaños', updated: now - 5 * 864e5, shared: false }, { id: 'demo000003', title: 'Farmacia', updated: now - 12 * 864e5, shared: false }]),
    [`ll.list.${id}`]: JSON.stringify(rec),
    'll.last': id,
    'll.imported': '1',
    'll.prefs': JSON.stringify({ hand, theme, doodles: true, motion: true }),
    'll.history': JSON.stringify(history(now)),
  };
}

/** A few weeks of this household's purchases, so "lo de siempre" has something to say. */
function history(now) {
  const d = 864e5;
  const h = (text, n, lastDaysAgo, gapDays) => ({ text, n, last: now - lastDaysAgo * d, gaps: Array(Math.min(5, n - 1)).fill(gapDays * d) });
  return {
    tortilla: h('tortillas', 9, 1, 3),
    'leche lala': h('leche Lala', 6, 4, 5),
    huevo: h('huevos', 5, 6, 7),
    'papel bano': h('papel de baño', 3, 16, 14),
    'cafe molido': h('café molido', 3, 20, 15),
    'jabon zote': h('jabón Zote', 2, 25, 20),
    platano: h('plátanos', 4, 5, 6),
  };
}
