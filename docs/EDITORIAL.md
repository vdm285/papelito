# Editorial rules: words, ink and media on screen

## Words

- Mexican Spanish first (*jitomate*, *súper*, *pasillo*, *Compartir*, *Deshacer*); English is a setting that sticks. Every string lives in `src/app/i18n.js`, credits in `src/ui/credits.js` (each in both languages); nothing visible is hard-coded elsewhere.
- Short and plain. No exclamation marks, no "¡Ups!", no marketing. Say what happened and what can be done: "Se borró «leche» · Deshacer".
- Never promise what the app cannot keep. Not "instantly", not "always": "lo que escribas aparece en el otro teléfono". Sync status says "Al día", "Conectando…" or "Sin conexión. Se guarda aquí y se envía al volver."
- Name the other phone by its ink ("Alguien (verde)") unless that phone chose a name; never invent a name.
- The list's own text is the person's: shown exactly as written (no auto-capitalisation, no autocorrect of item text), always as text, never as HTML.

## Ink and pencil

- **Ink** (the phone's colour, handwriting or print) is for what people wrote: items, titles, strikes.
- **Pencil** (grey) is for what the app suggests or explains: the placeholder, "lo de siempre", notes on an empty sheet, aisle headings.
- **Every colour on the sheet is an ink, and every ink belongs to one phone.** Status uses icons (the link, dashed when offline), never a coloured dot. The yellow marcatextos marks what the other phone wrote since you last looked, and nothing else.
- Everything written sits on a rule: rows, the writing line, suggestions and notes all use the rule height (`--line`), and baselines are measured (`--hand-shift`, `--print-shift`).

## Numbers and data

- Nothing invented. The aisle of an item comes from the dictionary (sourced, `docs/PIPELINES.md`) or from a correction made on this list; a guess is marked as a guess ("?" tag, "Pasillo (adivinado)").
- Times are relative and rounded ("hace 3 h"), from the item's own stamp.
- The default walking order of aisles is a starting point, not a fact about any store; each list keeps its own.

## Credits

- Every piece of someone else's work that ships (fonts, libraries, data, relays) is listed in `src/ui/credits.js` with its licence as the package or source itself states it, and shown in Menu → Acerca de. The dictionary's sources and their attribution texts travel inside `public/dict/es-MX.json` and are shown there too.
- Licences are checked at the source before use (the package's LICENSE file, the dataset's own record), and the check is dated.
- No images of products, brands or people. The icons are drawn in code (`src/ui/icons.js`, `tools/build-icons.mjs`); the paper grain is an SVG filter; strikes are generated paths. Each aisle has a pencil doodle: its emoji, drawn with a subset of Google's monochrome Noto Emoji (`public/fonts/doodles.woff2`, SIL OFL, built by `tools/build-doodles.py`), on the aisle's heading and its chips in the cards. Items have none (the owner's choice, 2026-10-22): only some words had one, and a sheet where some rows are drawn and others not looks unfinished. An icon for every item needs a way to choose one for any word, which is a later round; the dictionary still records an emoji per word where an exact Unicode CLDR name or an override line chose one.
- PROFECO and INEGI are credited as sources and never presented as endorsing the app; the grouping into aisles is ours and says so.
