// Everything the app uses that someone else made, with its licence as the package itself states it
// (checked in node_modules on 2026-10-21 and 2026-10-22; see docs/EDITORIAL.md, "Credits"). Data
// sources of the aisle dictionary are listed by the dictionary itself (public/dict/es-MX.json →
// sources). Each text is { es, en }: the About card speaks the app's language.
import { RELAYS } from '../sync/relays.js';

const hosts = RELAYS.map((u) => u.replace(/^wss:\/\//, ''));
const list = (xs, and) => `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`;

export const CREDITS = [
  { name: 'Caveat', what: { es: 'la letra a mano, © 2014 The Caveat Project Authors (Pablo Impallari)', en: 'the handwriting typeface, © 2014 The Caveat Project Authors (Pablo Impallari)' }, license: 'SIL Open Font License 1.1', url: 'https://github.com/googlefonts/caveat' },
  { name: 'Atkinson Hyperlegible Next', what: { es: 'la letra de molde, © 2020–2024 The Atkinson Hyperlegible Next Project Authors (Braille Institute)', en: 'the print typeface, © 2020–2024 The Atkinson Hyperlegible Next Project Authors (Braille Institute)' }, license: 'SIL Open Font License 1.1', url: 'https://github.com/googlefonts/atkinson-hyperlegible-next' },
  { name: 'Noto Emoji', what: { es: 'los dibujitos de los pasillos (monocromos, solo esos 16), © 2013 Google LLC', en: 'the aisle doodles (monochrome, only those 16), © 2013 Google LLC' }, license: 'SIL Open Font License 1.1', url: 'https://github.com/googlefonts/noto-emoji' },
  { name: 'Fontsource', what: { es: 'los paquetes de donde salen Caveat y Atkinson', en: 'the packages Caveat and Atkinson come from' }, license: { es: 'Las letras: SIL Open Font License 1.1 (como dicen los paquetes)', en: 'The fonts: SIL Open Font License 1.1 (as the packages state)' }, url: 'https://fontsource.org' },
  { name: 'Lit', what: { es: 'los componentes de la interfaz, © 2017 Google LLC', en: 'the interface components, © 2017 Google LLC' }, license: 'BSD 3-Clause', url: 'https://lit.dev' },
  { name: 'noble-secp256k1', what: { es: 'las firmas Schnorr para los relevos, © 2019 Paul Miller', en: 'Schnorr signatures for the relays, © 2019 Paul Miller' }, license: 'MIT', url: 'https://github.com/paulmillr/noble-secp256k1' },
  { name: 'uqr', what: { es: 'los códigos QR, © Project Nayuki y © 2023 Anthony Fu', en: 'the QR codes, © Project Nayuki and © 2023 Anthony Fu' }, license: 'MIT', url: 'https://github.com/unjs/uqr' },
  { name: 'Vite', what: { es: 'arma la página; dos funciones suyas para cargar módulos van dentro, © VoidZero Inc. y colaboradores', en: 'builds the page; two of its module-loading helpers ship inside, © VoidZero Inc. and contributors' }, license: 'MIT', url: 'https://vite.dev' },
  { name: { es: 'Relevos de Nostr', en: 'Nostr relays' }, what: { es: `${list(hosts, 'y')} llevan las copias cifradas; los mantienen otros, gratis`, en: `${list(hosts, 'and')} carry the encrypted copies; others run them, for free` }, license: { es: 'Un servicio público, sin promesa de conservar nada', en: 'A public service, no promise of keeping anything' }, url: 'https://github.com/nostr-protocol/nips' },
];

/** Full licence texts shipped in /licenses/ (vite.config.js copies LICENSES/ there). */
export const LICENCE_FILES = [
  ['OFL-Caveat.txt', 'Caveat'], ['OFL-AtkinsonHyperlegibleNext.txt', 'Atkinson Hyperlegible Next'], ['OFL-NotoEmoji.txt', 'Noto Emoji'],
  ['BSD-3-Clause-Lit.txt', 'Lit'], ['MIT-noble-secp256k1.txt', 'noble-secp256k1'], ['MIT-uqr.txt', 'uqr'], ['MIT-Vite.txt', 'Vite'],
  ['Unicode-3.0.txt', 'Unicode CLDR'],
];
