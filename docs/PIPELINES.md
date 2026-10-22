# Pipelines

How outside data gets into Papelito, for people and for the next AI session. Today there is one pipeline: the
**aisle vocabulary**, which turns two Mexican government datasets and the Unicode emoji names into the dictionary the app
uses to sort a list by aisle. Nothing is fetched at run time or at deploy time: the phone downloads one static file.

Written 2026-10-22. The research behind it is `data/cache/understand/vocab.md` (not committed; its §1, §2, §4, §9-§11
are summarised here).

---

## Vocabulary: the aisle dictionary

### What it makes

`public/dict/es-MX.json`, one JSON document, loaded after the first frame by `src/data/dict.js` and read by the matcher in
`src/model/aisles.js` (section "Aisles" below):

```json
{ "v": 1, "built": "2026-10-22",
  "sources": [{ "name", "url", "license", "retrieved", "credit" }],
  "aisles":  [{ "id": "fru", "es": "Frutas y verduras", "en": "Fruit and vegetables", "emoji": "🥦" }, ...16],
  "terms":   { "jitomate": ["fru", "🍅"], "papel de baño": ["hig", "🧻"], "maseca": "aba", ... },
  "forms":   { "lata": { "fru": "aba", "car": "aba", "sal": "aba" }, "congelado": { "*": "con" }, ... } }
```

- A **term** is a phrase as people write it: lowercase, with accents and ñ. Its value is the aisle id, or `[aisle, emoji]`
  when it has a doodle for the paper's margin. The app also offers terms as completions while typing.
- A **form** word moves an item from one aisle to another whatever the head word is ("chiles en lata" → abarrotes,
  "verduras congeladas" → congelados).
- The file is written one term per line so that a diff shows what changed.

### The rule

Nothing is invented. **Every shipped term traces to a source row or to a human override line that says why.** The
evidence ships beside the build, not to the phone: `data/vocab/build/sources.tsv` lists every term with every reference
that proposed it. `tools/vocab/check.mjs` fails the build when a term has none.

### Flow

```
CompaPrecio's QQP cache (read only) ─┐
INEGI's ENIGH zip (HTTP Range) ──────┼─ tools/vocab/fetch-sources.mjs ─→ data/vocab/sources/   (committed; by hand,
Unicode CLDR 49 + emoji-test.txt ────┘    (a few times a year)                                   a few times a year)

data/vocab/sources/ + data/vocab/*.tsv|txt + data/overrides/aisles/*.txt
        └─ tools/vocab/build.mjs (offline, deterministic, 1-2 s) ─→ public/dict/es-MX.json
                                                                   data/vocab/build/{sources,conflicts,review,dropped}.tsv, report.json
        └─ tools/vocab/check.mjs ─→ exit 1 on a broken rule; prints the test scores with the app's matcher
```

Commands: `npm run dict` (build + check), `npm run dict:sources` (rebuild `data/vocab/sources/` from the local cache),
`npm test` (includes `tests/dict.test.mjs`).

### Inputs and licences

| Source | What is used | Licence (checked 2026-10-21) | What it asks of us | Committed as |
|---|---|---|---|---|
| PROFECO, «Quién es Quién en los Precios» (QQP), 2025-01-02 to 2026-08-31, 22,658,981 price rows | 815 generic product names with their category and catalogue, brand × product counts, variety words from the package text | CC BY 4.0 (datos.gob.mx record) | credit, the licence with its link, say what we changed, no endorsement | `qqp-productos.tsv`, `qqp-marcas.tsv`, `qqp-variedades.tsv` |
| INEGI, ENIGH 2024 (nueva serie), catálogo de gastos | 1,055 spending items in COICOP 2018 codes (343 groceries, cleaning, health, pets, personal care, plus 38 food items of its "18" block and light bulbs and batteries, mapped code by code) | INEGI «Términos de Libre Uso» | «Fuente: INEGI», say the transformation is ours, no endorsement | `enigh2024-gastos.csv` |
| Unicode CLDR 49 (es, es_419, es_MX annotations) + emoji-test.txt 18.0 | Mexican Spanish emoji **names** (never keywords) and emoji versions | Unicode License v3 | the copyright and permission notice travels with the data | `cldr49-emoji-es-MX.tsv`, `LICENSES/Unicode-3.0.txt` |

Not used, on purpose: Open Food Facts (Spain's Spanish, and share-alike either way), retailer websites (proprietary,
blocked), Wikidata (useful only as a synonym lookup during review), the old checkpoint-1 dictionary (written by a model
with no source; it was used only to spot gaps worth checking against the sources, never copied).

**The transformation is ours, and no agency endorses the app.** Choosing these names, splitting the survey labels,
spelling them as people write them and grouping them into aisles is Papelito's work, not PROFECO's, INEGI's or Unicode's;
neither PROFECO, nor INEGI, nor Unicode endorses, sponsors or reviewed Papelito. The credit lines below say so to the
person using the app, as CC BY 4.0 (indicate changes) and INEGI's terms («notificar al usuario final de cualquier análisis
o transformación», «no debe aparentar que ... está avalado») require. No agency logos, anywhere.

The attribution texts travel in `dict.sources[].credit` (Spanish), adapted from the research's §10 with the app's name and
the CC BY licence link (CC BY 4.0 §3(a)(1)(C) asks for "the URI or hyperlink to" the licence):

> Vocabulario de productos: «Quién es Quién en los Precios», PROFECO (Procuraduría Federal del Consumidor), datos abiertos
> del Gobierno de México, https://datos.profeco.gob.mx/datos_abiertos/qqp.php, consultado el 2026-10-21, licencia Creative
> Commons Atribución 4.0 (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). Papelito adaptó estos nombres y los
> agrupó por pasillo; esa agrupación es nuestra, no de PROFECO, y PROFECO no avala esta aplicación.
>
> Fuente: INEGI, Encuesta Nacional de Ingresos y Gastos de los Hogares (ENIGH) 2024, catálogo de gastos (actualizado el
> 2025-07-30). Papelito adaptó estos nombres y los agrupó por pasillo; esa agrupación es nuestra, no del INEGI, y el INEGI
> no avala esta aplicación.
>
> Nombres de emoji: Unicode CLDR 49, © 1991-2026 Unicode, Inc., licencia Unicode v3, https://www.unicode.org/license.txt
> (copia en LICENSES/Unicode-3.0.txt).

The About screen (`src/ui/cards.js`, card "Acerca de") shows each credit text in full, not only the source names, and
links the licence texts the site ships under `licenses/` (the build copies `LICENSES/` there). `tools/vocab/check.mjs`
fails when a credit line loses one of the phrases the licences ask for.

### Files

**`data/vocab/sources/`: derived, committed, refreshed by hand.** Each file starts with `#` lines: what it is, source,
url, retrieved date, licence, and the inputs (sha256 of the downloads, or row counts and the archives' sha256 for QQP).
- `qqp-productos.tsv`: one row per generic product (accent variants merged, best spelling kept): category, catalogues,
  rows, first and last date, top six base brands, other categories.
- `qqp-marcas.tsv`: base brand (MARCA before the first ". ", so "Nescafé. Clásico" is Nescafé) × product × category ×
  rows, groceries and household goods only (no medicines or appliances, no "S/M").
- `qqp-variedades.tsv`: variety phrases mined from PRESENTACIÓN ("Concha. Pieza de 68 a 90 Gr." → concha), with two
  **human columns**: `keep` (1 = an everyday shopping word that ships in the product's aisle) and `term` (the phrase to
  ship when it differs, `|` for several). A refresh keeps both for rows that still exist and warns about kept rows that
  disappeared.
- `enigh2024-gastos.csv`: INEGI's file as downloaded, with `#` lines added and LF line endings.
- `cldr49-emoji-es-MX.tsv`: emoji, Unicode emoji version, subgroup, es-MX name (resolved es_MX → es_419 → es), where the
  name came from, English name. Food & drink, household, medical, light, animals, plants and a few objects.

**`data/vocab/`: human files.** Each line or row says why.

| File | What it decides |
|---|---|
| `aisles.tsv` | the 16 aisles: id, Spanish and English name, default emoji (version ≤ 13.0), default walking order |
| `map-qqp.tsv` | QQP's 46 categories → aisle (`-` = not groceries) |
| `map-qqp-products.tsv` | product exceptions that win over the category (Helado → con, Harina de Maíz → aba, Pañales → bbe, seasonal goods one by one...) |
| `map-enigh.tsv` | ENIGH code prefix → aisle; the longest prefix wins; codes that match nothing are skipped. ENIGH's "18" block (extra food items such as arrachera, mezcal, camote, pápalo, hot cakes) has no COICOP tree, so its useful codes are mapped one by one |
| `synonyms.tsv` | spelling variants and exact short forms (yogur, ketchup, espagueti, pilas, pañales); a variant follows its source term's aisle |
| `forms.tsv` | the form words (congelado, lata, vinagre, almíbar, polvo, seco...) with from → to |
| `drop.txt` | phrases never shipped from any source: junk from splitting labels ("refrigerado", "tuba"), head nouns that read wrong alone ("hojas", "barras"), survey labels nobody writes ("pan dulce a granel", "medicamentos neurológicos"; each still reaches the same aisle through a shorter term), pieces that are not list items (vacuum filters, scales) |
| `brands-block.txt` | store and house brands (Great Value, Aurrera, Chedraui, Precíssimo...), personal and place names and ordinary words that QQP uses as brands, and names that collide on a list (Barajas: playing cards; Legal: "tamaño legal"; Soberano: the brandy; Noche Buena: the poinsettia and the beer; Fresca) |
| `brands-allow.txt` | single-word brands kept although the word also occurs elsewhere (Foca, Nido, Búfalo, Flash) |
| `test/test-60.tsv`, `test/tricky-40.tsv`, `test/audit-160.tsv` | the test lists (see "Checks") |

**`data/overrides/aisles/<id>-<name>.txt`: the curation mechanism, one file per aisle** (`fru-frutas-y-verduras.txt`
... `con-congelados.txt`; Otros has none; the name after the id is for people, and must be there because `con.txt` is a
reserved device name on Windows). This is where the colloquial layer lives that no source has: papel de baño, cloro, garrafón, croquetas, bolillo,
pasta de dientes, consomé, pet words. Three kinds of line, each with a `# why`:

```
+ papel de baño = 🧻  # the everyday name for toilet paper; QQP "Papel Higiénico", ENIGH 13120L "Papel higiénico"
- bandera  # QQP fish "Bandera": alone the word means a flag
margarina > lac  # margarine is refrigerated next to the butter; ENIGH 011530 groups it with butter
```

- `+ término [= emoji]` adds the term to this file's aisle. `= 🍅` is a human emoji choice (it must be in the CLDR table and
  version ≤ 13.0); `= -` removes an automatic emoji that would be wrong (🍅 for QQP's green "tomate").
- `- término` drops the term from this aisle (the other sources' aisles, if any, still apply).
- `término > aba` moves a source term from this file's aisle to another one.
- A "+" line's why says what the thing is and, where one exists, the source term it is the everyday name for.
- The files are headed "Drafted by Claude (AI) on 2026-10-22 from the sources' gaps; awaiting owner review." Keep that
  honest: change it when a person has reviewed a file.

**`data/vocab/build/`: evidence, regenerated by every build, committed so a diff shows what moved.**
`sources.tsv` (term → aisle → emoji and where it came from → what decided it → every reference with the aisle it
proposed), `conflicts.tsv` (terms whose sources disagree, and how it was settled), `review.tsv` (the human queue: brands
held back, head nouns derived and held back, automatic emoji, unused or redundant human lines), `dropped.tsv` (everything
left out and why), `report.json` (counts, sizes, test scores).

### How a term is made (`tools/vocab/build.mjs`)

1. **QQP products.** Each label gives phrases: "P/" becomes "para" ("Detergente P/ropa" → detergente para ropa); a ". "
   sub-line is dropped ("Picot. Sal de Uvas" → picot); lists split at commas, " o ", " y " and "/" ("Shampoo para
   Bebés/niños" → shampoo para bebés, shampoo para niños); a trailing size or dose goes ("Eutirox 100" → eutirox);
   "Carne Pollo" becomes carne de pollo and pollo; "y Similares" goes. The aisle is the product exception if there is one,
   else the category's.
2. **QQP varieties** with `keep = 1` ship in their product's aisle at the product's priority (bistec, carne molida,
   concha, galletas marías, garrafón, chile guajillo...).
3. **ENIGH rows.** The prefix map gives the aisle. Labels split at commas and, inside pieces of up to 9 words, at " y " and
   " o "; the examples after a colon count ("Otros artículos desechables: bolsas para basura, guantes de hule"); text in
   parentheses counts unless it starts with a preposition ("Jitomate (tomate rojo)"). Pieces that start with "otros",
   "productos", "artículos", "servicios" or "alimentos", or with a preposition, and pieces over 4 words are skipped.
4. **`drop.txt`** removes junk from every source.
5. **Head nouns.** A first word (leche, queso, carne, harina, galletas, agua...) is added on its own when at least 2
   distinct source phrases start with it and at least 75 % of them agree on one aisle. Held-back ones go to `review.tsv`.
6. **Brands** (QQP base brands): the aisle follows the brand's products after the product exceptions (so Maseca goes
   with Harina de Maíz to abarrotes, not to the tortillería). A brand ships only if it was seen in at least 300 rows, at
   least 90 % of its rows fall in one aisle, it is not in `brands-block.txt` (matched against both QQP's brand string and
   the name that would ship, so "Torres 10" is caught by "Torres"), and, when it is a single word, the word is not also a
   source term or a CLDR name (unless `brands-allow.txt` says so). Dropping a source phrase can free a held-back brand
   (dropping "leche entera fresca" freed "Fresca"): read the `git diff` of the dictionary after every drop.
7. **Overrides** are applied (`+`, `-`, `>`).
8. **One aisle per term.** Phrases are grouped by what the matcher sees (folded, stemmed, filler dropped: "tortilla" and
   "tortillas" are one term). Priority: **override > QQP product exception > QQP category > ENIGH > derived head noun >
   brand**. A tie at the top priority goes to the aisle with more candidates, then to the walking order; every
   disagreement is in `conflicts.tsv`. The shipped spelling is the override's, else the most accented, shortest one.
9. **Synonyms** take their source term's aisle.
10. **Emoji**: the override's choice; else an **exact** CLDR es-MX name match (same words, ignoring accents and
    singular/plural) within food & drink, household, medical and light, at emoji version ≤ 13.0 (older phones show boxes
    for newer ones; 🫘 frijoles is 14.0 and is left out); else none, and the app draws nothing. Never from CLDR keywords
    (🫚 lists "cerveza", 🧷 lists "pañal"). A wrong doodle is worse than none.

### How to add or fix a word

Edit, then `npm run dict`, then read `data/vocab/build/review.tsv` and the `git diff` of `public/dict/es-MX.json`.
When the set of emoji changes (a new automatic CLDR match counts: "sartén" brought 🍳), rebuild the margin font with
`python -I tools/build-doodles.py`, or the font has no drawing for the new emoji.

- **An everyday word no source has** (a colloquial name, a pan dulce, a pet word): add `+ word  # what it is; the source
  term it names` to the aisle's file in `data/overrides/aisles/`.
- **A word in the wrong aisle**: `word > lim  # why` in the file of the aisle where it is now (`sources.tsv` says which).
- **A source term that should not ship**: `- word  # why` in that aisle's file; for junk produced by label splitting that
  should never ship from any source, a line in `data/vocab/drop.txt`.
- **A whole QQP product in the wrong aisle**: a row in `map-qqp-products.tsv` (its brands and varieties follow).
- **A spelling variant**: a row in `synonyms.tsv`.
- **A variety word** from the package texts: set `keep` to 1 in `data/vocab/sources/qqp-variedades.tsv` (and `term` if the
  phrase to ship differs).
- **A brand**: it ships by itself when it passes the rules in step 6; otherwise `brands-allow.txt`, `brands-block.txt`, or
  an override line.
- **An emoji**: `+ term = 🧀  # why` (must be in `cldr49-emoji-es-MX.tsv`, version ≤ 13.0); `= -` to remove one.
- **A form word**: a row in `forms.tsv` (remember both genders if they stem differently).

### Refreshing the sources

The vocabulary changes slowly; twice a year is plenty. PROFECO blocks GitHub's runners, which is why the derived tables
are committed and the build never fetches.

```bash
node tools/vocab/fetch-sources.mjs            # stream QQP from CompaPrecio's cache (≈ 80 s for 7 GB here), fetch ENIGH and CLDR
npm run dict:sources                          # same derivation from data/cache/vocab only (no network, seconds)
npm run dict && npm test
```

- QQP is read (never written) from `D:/_GitHub/CompaPrecio/data/cache/qqp/extract` (or `--qqp <dir>`, or `$QQP_EXTRACT`);
  refresh CompaPrecio's archives first if new months are out. The stream aggregate goes to
  `data/cache/vocab/qqp-stream/` and is what `--from-cache` reuses.
- ENIGH is one 56 KB member read out of INEGI's 103 MB zip with HTTP Range. CLDR comes from the `release-49` tag; for a
  new CLDR release change `CLDR_TAG` and the file names (and the credit text in `build.mjs`).
- Other options: `--offline` (stream QQP but reuse the cached downloads), `--skip-qqp` (reuse the stream, fetch the rest),
  `--cache <dir>`, `--out <dir>`. Downloads only ever go under `data/cache/`.
- After a refresh, read the diff of `data/vocab/sources/` and `data/vocab/build/`, and look at the warnings about kept
  varieties that vanished.

### The checks

`tools/vocab/check.mjs` (run by `npm run dict`) exits 1 when:
- the dictionary is not the shape above (16 aisle ids in the app's order, sources with credit lines...);
- a term is not lowercase with single spaces, or points at an unknown aisle or at Otros;
- two terms are the same words to the matcher (one phrase in two aisles);
- a shipped term has no source reference, or none that resolves to a QQP product, a kept variety, a QQP brand, an ENIGH
  code or an override line with a why;
- an override line cannot be read or has no `# why`, or a human mapping row has no why;
- an override reference does not point at a line about that very term (same words to the matcher);
- an automatic emoji is not an exact CLDR name match of its term, or an emoji is not in the CLDR table or is above version
  13.0;
- a term that ships as a brand is in `brands-block.txt`;
- a credit line has lost what its licence asks (the CC BY link, «Fuente: INEGI», "esa agrupación es nuestra", "no avala",
  the Unicode notice), or `LICENSES/Unicode-3.0.txt` is missing;
- the gzipped dictionary is over 15,000 bytes.

It also prints the scores on `data/vocab/test/test-60.tsv`, `tricky-40.tsv` and `audit-160.tsv` using the app's own
`buildIndex` and `aisleOf`. `tests/dict.test.mjs` (part of `npm test`) asserts the floors: at least 54/60 on test-60
(store-dependent rows out of the denominator, and 54 of all 60 rows), at least 85 % on tricky-40, at least 95 % on
audit-160, 15 must-pass items (tortillas, jitomate, papel de baño, crema, Zote, Fabuloso, garrafón, croquetas, hielo,
"2 detergentes", chiles en lata, helado, pañales, paracetamol, Maseca), the collisions and gaps the audit fixed (blocked
brands absent, margarine brands in lácteos, "crema para peinar", "caldo de res", "lima de uñas"...), and the credit lines.

**Read the scores with care.** The expected aisles were chosen by an AI (test-60 by the research agent before it opened
any source; tricky-40 by the checkpoint-1 agent; audit-160 by the auditor before running it, when it scored 79/80 on its
everyday half and 66/79 on its harder half), and the override files were written after seeing the misses. The scores
guard against regressions; they are not evidence of coverage. A list from real use by the two testers should replace them.

### Current numbers (measured 2026-10-22 after the audit, `data/vocab/build/report.json`)

| Aisle | Terms | Aisle | Terms |
|---|---:|---|---:|
| fru Frutas y verduras | 108 | bot Botanas y dulces | 56 |
| pan Panadería | 35 | beb Bebidas | 136 |
| tor Tortillería | 16 | lim Limpieza y hogar | 138 |
| car Carnes, pollo y pescado | 133 | hig Higiene personal | 152 |
| sal Salchichonería | 35 | bbe Bebés | 34 |
| lac Lácteos y huevo | 76 | mas Mascotas | 16 |
| aba Abarrotes | 308 | far Farmacia | 450 |
| | | con Congelados | 24 |

- **1,717 terms**, 71 with an emoji (54 exact CLDR names, 17 human choices in override lines); 16 form words.
- **Size**: 38,843 bytes raw, **11,782 bytes gzip** (limit 15,000), 10,210 bytes brotli.
- **What decided each term**: QQP category 702, QQP product exception 74, ENIGH 271, head noun 23, brand 416,
  override 225, synonym 6. Terms with a reference from each source (a term can have several): QQP products 701, QQP
  varieties 85, QQP brands 416, ENIGH 401, head nouns 27, overrides 225, synonyms 6.
- **Human lines**: 227 override lines in 15 files (225 `+`, 2 `-`, 0 `>`), 81 varieties ticked, 73 product exceptions,
  109 drop lines, 65 blocked and 4 allowed brands, 46 category rows, 120 ENIGH prefixes and codes, 21 form rows, 5 synonyms.
- **Tests**: test-60 55/55 (58/60 counting the 5 store-dependent rows), tricky-40 35/35 (39/40), audit-160 145/145
  (159/160).
- 10 conflicts, 426 dropped entries, 137 review rows. Farmacia is large (QQP surveys 374 medicines); it costs little.

---|---:|---|---:|
| fru Frutas y verduras | 102 | bot Botanas y dulces | 56 |
| pan Panadería | 39 | beb Bebidas | 133 |
| tor Tortillería | 15 | lim Limpieza y hogar | 133 |
| car Carnes, pollo y pescado | 122 | hig Higiene personal | 147 |
| sal Salchichonería | 35 | bbe Bebés | 33 |
| lac Lácteos y huevo | 77 | mas Mascotas | 16 |
| aba Abarrotes | 320 | far Farmacia | 458 |
| | | con Congelados | 24 |

- **1,710 terms**, 69 with an emoji (52 exact CLDR names, 17 human choices in override lines); 16 form words.
- **Size**: 39,102 bytes raw, **11,846 bytes gzip** (limit 15,000), 10,276 bytes brotli.
- **What decided each term**: QQP category 709, QQP product exception 75, ENIGH 263, head noun 22, brand 431,
  override 204, synonym 6. Terms with a reference from each source (a term can have several): QQP products 710, QQP
  varieties 85, QQP brands 431, ENIGH 375, head nouns 26, overrides 204, synonyms 6.
- **Human lines**: 206 override lines in 15 files (203 `+`, 2 `-`, 1 `>`), 81 varieties ticked, 71 product exceptions,
  66 drop lines, 47 blocked and 4 allowed brands, 46 category rows, 80 ENIGH prefixes, 21 form rows.
- **Tests**: test-60 55/55 (58/60 counting the 5 store-dependent rows), tricky-40 32/35 (36/40).
- 11 conflicts, 362 dropped entries, 137 review rows. Farmacia is large (QQP surveys 374 medicines); it costs little.

---

## Aisles: how the app matches an item (`src/model/aisles.js`)

1. Fold: lowercase, no accents, ñ → n, only letters, digits and spaces.
2. Drop filler words (de, la, para, un, unas...) and the quantity ("2 kg de").
3. Stem every word the same way on both sides, so singular and plural meet (tortilla/tortillas, limón/limones,
   nuez/nueces).
4. The longest dictionary phrase found anywhere in the item wins; on a tie the earliest, then the exact spelling.
5. Form words adjust the result ("chiles en lata" → abarrotes).
6. Otherwise one cautious typo guess (one edit, words of 6+ letters, same first two letters, one aisle), marked as a guess.
7. Otherwise Otros. A correction made by hand on a list always wins for that list.

Fixed since: ñ folds to n, so "uñas" became "unas", then a filler word, and "lima de uñas" read as "lima" (the fruit);
"unas"/"unos" are no longer filler (commit 778720e), and ENIGH's "lima de uñas" now ships in Higiene personal.

Limits of the matcher the audit found (2026-10-22; not changed, the dictionary works around them where it can):
- **A tie goes to the earliest word.** "crema Nivea" is two one-word terms, "crema" (lácteos) first, so the brand loses;
  "chocolate Abuelita" stays in Botanas. The dictionary adds the compounds people write ("crema nivea", "crema para
  peinar", "leche de magnesia", "chicharrones de harina", "jabón líquido para ropa"), but any other "head noun + brand from
  another aisle" still goes with the head noun.
- **Form words only adjust an item that matched something.** "tamales congelados" stays in Otros instead of Congelados,
  because no term matches "tamales"; "hamburguesas congeladas" went to Otros until "hamburguesas" was added.
- **Marker words take every compound.** "perro" and "gato" send "perro caliente" (a hot dog) and "gato hidráulico" (a car
  jack) to Mascotas; "papel" sends "papel de regalo" to Higiene personal.
- **Masculine and feminine stem differently**, so a form word or a term needs both ("seco"/"seca", "molido"/"molida").

## Open questions for the owner

Choices made by the audit of 2026-10-22 (each is one line to revert):
- "papel" alone → Higiene personal (toilet paper; `hig-higiene-personal.txt`), like "papel de baño"; "papel para hornear" and "papel
  encerado" → Limpieza.
- Margarine and its brands (Primavera, Iberia) → Lácteos through a product exception (`map-qqp-products.tsv`), instead of
  moving only the word; QQP's "Elote" (86 % canned kernels) → Abarrotes for its brands (Herdez, Del Monte now ship),
  while "elote" itself stays in produce.
- "corona", "coronita", "dos equis" → Bebidas; "hamburguesas" → Carnes (frozen ones follow "congeladas"); "carbón",
  "encendedor", "sartén", "tapete" → Limpieza y hogar; "caldo" → Abarrotes.
- 18 brands blocked for colliding on a list (`brands-block.txt`, the last block): Barajas, Legal, Soberano, Noche Buena,
  Gloria, Norteño, Azucaradas, Eficaz, Deliciosa, Esmeralda, Carlota, Andre, Molina, San Antonio, San José, San Blas,
  Santa María, Fresca. Victoria, Indio, Pacífico, Roma, Viva, Salvo and Pronto were kept: each is the everyday name of the
  product on a list.

Still open:

- Store-dependent aisles the sources cannot settle: papel de baño (both sources say personal care; some stores shelve it
  with cleaning), tostadas (the sources put them with tortillas), café, galletas, cajeta and miel, chicharrón (meat
  counter or bagged snack), margarina (moved to lácteos). Per-list corrections are the real answer.
- 16 aisles or 14 (Tortillería and Salchichonería separate, as the sources and stores have them).
- The emoji version cap of 13.0 should be checked on the two test phones.
- The override files and the ticked varieties were drafted by an AI and need a person's review.
