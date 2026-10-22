// Every word the app shows. Mexican Spanish first; English is a setting (and ?lang=en in a link).
// Rules for these words: docs/EDITORIAL.md ("Words"). Short, plain, no exclamation marks, no
// "¡Ups!", and never a promise the app cannot keep.

const es = {
  appName: 'Papelito',
  tagline: 'La lista del súper en una hoja que dos teléfonos comparten.',
  emptyNote: 'Compártela, y lo que escriba cualquiera de los dos aparece en los dos teléfonos.',
  untitled: 'Lista del súper',
  write: 'Escribe lo que falta…',
  writeMore: 'Algo más…',
  writeAria: 'Agregar a la lista',
  titleAria: 'Nombre de la lista',
  struck: (n) => `Tachados (${n})`,
  clearStruck: 'Limpiar',
  share: 'Compartir',
  shared: 'Compartida',
  menu: 'Menú',
  undo: 'Deshacer',
  close: 'Cerrar',
  done: 'Listo',
  cancel: 'Cancelar',
  save: 'Guardar',
  delete: 'Borrar',
  edit: 'Editar',
  aisle: 'Pasillo',
  aisleGuess: 'Pasillo (adivinado)',
  // toasts
  added: (t) => `Anotado: ${t}`,
  removed: (t) => `Se borró «${t}»`,
  removedBy: (who, t) => `${who} borró «${t}»`,
  remoteSummary: (who, added, struck, unstruck) => `${who} ${[added && `agregó ${added === 1 ? '1 cosa' : `${added} cosas`}`, struck && `tachó ${struck}`, unstruck && `destachó ${unstruck}`].filter(Boolean).join(' y ')}.`,
  cleared: (n) => (n === 1 ? 'Se limpió 1 tachado' : `Se limpiaron ${n} tachados`),
  edited: (t) => `Corregido: ${t}`,
  splitAsk: (n) => `¿Separar en ${n}?`,
  splitDone: (n) => `Separado en ${n}`,
  movedTo: (a) => `Ahora en ${a}. Recordado para esta lista.`,
  // menu
  byAisle: 'Ordenar por pasillo',
  aisleOrder: 'Orden de los pasillos',
  aisleOrderHint: 'Arrastra o usa las flechas para ponerlos en el orden en que recorres tu súper.',
  lists: 'Mis hojas',
  newList: 'Hoja nueva',
  openLink: 'Abrir una lista compartida',
  openLinkHint: 'Pega aquí el enlace que te mandaron.',
  openLinkBad: 'Ese enlace no es de una lista compartida.',
  settings: 'Ajustes',
  about: 'Acerca de',
  credits: 'Créditos',
  emptyList: 'Vaciar la hoja',
  emptied: 'Hoja vaciada',
  keepAwake: 'Pantalla encendida mientras compras',
  install: 'Instalar como app',
  installIos: 'En el iPhone: toca Compartir y luego «Agregar a inicio». Hazlo con esta lista abierta para que el ícono la abra.',
  // share
  shareTitle: 'Compartir esta hoja',
  shareText: (title) => `${title}: lo que escribas aquí aparece en mi teléfono y al revés.`,
  shareHow: 'Quien tenga el enlace puede ver y escribir en esta hoja. Viaja cifrada: nadie en medio puede leerla.',
  shareSend: 'Enviar enlace',
  shareCopy: 'Copiar enlace',
  shareCopied: 'Enlace copiado',
  shareQr: 'O escanéalo con el otro teléfono',
  noteTitle: 'Llévatela',
  noteShared: 'Escanéala con tu teléfono y escribe en cualquiera de los dos.',
  noteLocal: 'Compártela y escanéala con tu teléfono: lo que escribas aquí aparece allá.',
  shareRotate: 'Hacer un enlace nuevo',
  shareRotateHint: 'El enlace viejo deja de recibir cambios. Manda el nuevo a quien deba tenerlo.',
  shareRotated: 'Enlace nuevo listo. Mándalo otra vez.',
  firstShared: 'Esta hoja es compartida. Lo que escribas aparece en el otro teléfono.',
  joined: (ink) => `Otro teléfono se unió a la hoja. Escribe en tinta ${ink}.`,
  // sync status
  syncing: 'Conectando…',
  synced: 'Al día',
  offline: 'Sin conexión. Se guarda aquí y se envía al volver.',
  syncTrouble: 'No se pudo enviar todavía. Se reintenta solo.',
  othersHere: (n) => (n === 1 ? 'Otro teléfono tiene la hoja abierta' : `${n} teléfonos más tienen la hoja abierta`),
  // ink
  inkLabel: 'Tu tinta',
  inks: { azul: 'Azul', roja: 'Roja', verde: 'Verde', negra: 'Negra', morada: 'Morada', cafe: 'Café' },
  nameLabel: 'Tu nombre en esta hoja (opcional)',
  someone: 'Alguien',
  you: 'Tú',
  // legacy
  legacyImported: (n) => (n === 1 ? 'Recuperamos 1 lista de la versión anterior.' : `Recuperamos ${n} listas de la versión anterior.`),
  legacyShared: 'Esta lista se compartía en la versión anterior. Para seguir compartiéndola, toca Compartir y manda el enlace nuevo.',
  legacyLinkMissing: 'Ese enlace es de la versión anterior y la lista no está en este teléfono. Pide que te la compartan otra vez.',
  // suggestions
  usual: 'Lo de siempre',
  again: '¿Otra vez?',
  // settings
  lang: 'Idioma',
  theme: 'Hoja',
  themes: { auto: 'Según el teléfono', papel: 'Papel', pizarron: 'Pizarrón' },
  hand: 'Letra',
  hands: { mano: 'A mano', molde: 'De molde' },
  motion: 'Animaciones',
  doodles: 'Dibujitos en el margen',
  // aisles (ids from src/model/aisles.js; walking order is the list's own)
  aisles: {
    fru: 'Frutas y verduras', pan: 'Panadería', tor: 'Tortillería', car: 'Carnes, pollo y pescado', sal: 'Salchichonería',
    lac: 'Lácteos y huevo', aba: 'Abarrotes', bot: 'Botanas y dulces', beb: 'Bebidas', lim: 'Limpieza y hogar',
    hig: 'Higiene personal', bbe: 'Bebés', mas: 'Mascotas', far: 'Farmacia', con: 'Congelados', otr: 'Otros',
  },
  ago: (ms) => agoEs(ms),
};

const en = {
  ...es,
  tagline: 'A shopping list on one sheet of paper that two phones share.',
  emptyNote: 'Share it, and what either of you writes shows up on both phones.',
  untitled: 'Shopping list',
  write: 'Write what you need…',
  writeMore: 'Anything else…',
  writeAria: 'Add to the list',
  titleAria: 'List name',
  struck: (n) => `Crossed off (${n})`,
  clearStruck: 'Clear',
  share: 'Share',
  shared: 'Shared',
  menu: 'Menu',
  undo: 'Undo',
  close: 'Close',
  done: 'Done',
  cancel: 'Cancel',
  save: 'Save',
  delete: 'Delete',
  edit: 'Edit',
  aisle: 'Aisle',
  aisleGuess: 'Aisle (a guess)',
  added: (t) => `Added: ${t}`,
  removed: (t) => `Deleted “${t}”`,
  removedBy: (who, t) => `${who} deleted “${t}”`,
  remoteSummary: (who, added, struck, unstruck) => `${who} ${[added && `added ${added === 1 ? '1 item' : `${added} items`}`, struck && `crossed off ${struck}`, unstruck && `restored ${unstruck}`].filter(Boolean).join(' and ')}.`,
  cleared: (n) => (n === 1 ? 'Cleared 1 item' : `Cleared ${n} items`),
  edited: (t) => `Changed: ${t}`,
  splitAsk: (n) => `Split into ${n}?`,
  splitDone: (n) => `Split into ${n}`,
  movedTo: (a) => `Now in ${a}. Remembered for this list.`,
  byAisle: 'Sort by aisle',
  aisleOrder: 'Aisle order',
  aisleOrderHint: 'Drag or use the arrows to match the way you walk through your store.',
  lists: 'My sheets',
  newList: 'New sheet',
  openLink: 'Open a shared list',
  openLinkHint: 'Paste the link you were sent.',
  openLinkBad: 'That link is not a shared list.',
  settings: 'Settings',
  about: 'About',
  credits: 'Credits',
  emptyList: 'Empty the sheet',
  emptied: 'Sheet emptied',
  keepAwake: 'Keep the screen on while shopping',
  install: 'Install as an app',
  installIos: 'On iPhone: tap Share, then “Add to Home Screen”. Do it with this list open so the icon opens it.',
  shareTitle: 'Share this sheet',
  shareText: (title) => `${title}: what you write here shows up on my phone, and the other way round.`,
  shareHow: 'Anyone with the link can see and write on this sheet. It travels encrypted: nobody in between can read it.',
  shareSend: 'Send link',
  shareCopy: 'Copy link',
  shareCopied: 'Link copied',
  shareQr: 'Or scan it with the other phone',
  noteTitle: 'Take it with you',
  noteShared: 'Scan it with your phone and write on either.',
  noteLocal: 'Share it and scan it with your phone: what you write here shows up there.',
  shareRotate: 'Make a new link',
  shareRotateHint: 'The old link stops receiving changes. Send the new one to whoever should have it.',
  shareRotated: 'New link ready. Send it again.',
  firstShared: 'This sheet is shared. What you write shows up on the other phone.',
  joined: (ink) => `Another phone joined the sheet. It writes in ${ink} ink.`,
  syncing: 'Connecting…',
  synced: 'Up to date',
  offline: 'Offline. Saved here; it will be sent when you are back.',
  syncTrouble: 'Not sent yet. It will retry by itself.',
  othersHere: (n) => (n === 1 ? 'Another phone has the sheet open' : `${n} more phones have the sheet open`),
  inkLabel: 'Your ink',
  inks: { azul: 'Blue', roja: 'Red', verde: 'Green', negra: 'Black', morada: 'Purple', cafe: 'Brown' },
  nameLabel: 'Your name on this sheet (optional)',
  someone: 'Someone',
  you: 'You',
  legacyImported: (n) => (n === 1 ? 'We recovered 1 list from the previous version.' : `We recovered ${n} lists from the previous version.`),
  legacyShared: 'This list was shared in the previous version. To keep sharing it, tap Share and send the new link.',
  legacyLinkMissing: 'That link is from the previous version and the list is not on this phone. Ask for it to be shared again.',
  usual: 'The usual',
  again: 'Again?',
  lang: 'Language',
  theme: 'Sheet',
  themes: { auto: 'Like the phone', papel: 'Paper', pizarron: 'Chalkboard' },
  hand: 'Lettering',
  hands: { mano: 'Handwritten', molde: 'Print' },
  motion: 'Animations',
  doodles: 'Doodles in the margin',
  aisles: {
    fru: 'Fruit and vegetables', pan: 'Bakery', tor: 'Tortillas', car: 'Meat, poultry and fish', sal: 'Deli',
    lac: 'Dairy and eggs', aba: 'Pantry', bot: 'Snacks and sweets', beb: 'Drinks', lim: 'Cleaning and home',
    hig: 'Personal care', bbe: 'Baby', mas: 'Pets', far: 'Pharmacy', con: 'Frozen', otr: 'Other',
  },
  ago: (ms) => agoEn(ms),
};

function agoEs(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
function agoEn(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

const DICTS = { es, en };
let current = es;
export let lang = 'es';

export function setLang(l) {
  lang = DICTS[l] ? l : 'es';
  current = DICTS[lang];
  document.documentElement.lang = lang === 'es' ? 'es-MX' : 'en';
}

/** t.key or t.key(args) */
export const t = new Proxy({}, { get: (_, k) => current[k] });
