> Research report written by a sub-agent on 2026-10-21 for the rebuild. Paths under `data/cache/` point to local working files (scripts, raw fetches) that are not committed.

# Aisles: what the old ListoLista builds did, and how well it works

Reviewed 2026-10-21. Read-only review of the old code in `D:\_GitHub\listolista\data\cache\old\`. Every number below comes from running the code in Node 24 on this machine, unless it is marked "research doc says" or "unverified". The scripts, probe sets and raw outputs are in `D:\_GitHub\listolista\data\cache\understand\aisles-work\` (see "How to reproduce" at the end).

Short names used below:
- **CP1** is the checkpoint1 matcher `src/aisles.js` with the dictionary `data/aisles-es-MX.txt`, as that branch would have shipped it.
- **CP1+P** is CP1 with the 3-line fix from `ROADMAP.md` lines 64-69 applied to a copy.
- **MAIN** is the live site, `main/index.html`: its `SUPERMARKET_DICT` plus `categorize()`, re-run line for line.

---

## Bottom line

- **The dictionary was written by an AI model, not taken from a real source.**
  - On 2026-01-12 at 20:03, commit `f23ecac` ("SUPERMARKET AISLE SORTING v0.1") added a 150-entry seed.
  - 17 minutes later, commit `d158e43` ("Better Supermarket List") grew it to 1,720 entries, under the header comment `EXHAUSTIVE 1000+ Items`.
  - `main/README.txt` says all the code was generated in Gemini Canvas.
  - The entries carry machine fingerprints: long templated lists (18 "shampoo para …", 17 "crema para …", 11 "ambientador de …"), Spanish from Spain and South America (mamadera, chupete, trapero, colutorio), Portuguese ("cajeta de leite"), and nonsense entries ("antecesor", "glucosimetro para bebe", "mouse" filed under Higiene).
  - Checkpoint1 never replaced it. It converted the same words into 14 aisle IDs (`tools/convert-dict.py`, header of `data/aisles-es-MX.txt` lines 5-6).
  - The planned real source (PROFECO, CC BY 4.0) and the planned labelling by a local model were never used.
- **The 14-aisle scheme is good. One aisle is empty: Congelados (`CON`) has zero words** (`data/aisles-es-MX.txt` line 11). So *helado* goes to Botanas, and *hielo*, *bolsa de hielo* and *verduras congeladas* go to Otros.
- **The checkpoint1 matcher is a real improvement over the live site on traps. On everyday staples the two score about the same.** On my 40 realistic items:
  - CP1: **36/40 (90%)**, one confidently wrong answer.
  - MAIN: 35/40 (88%), two confidently wrong answers.
  - The four CP1 misses are *Zote* (word missing), *crema* (goes to **Higiene personal**), *garrafón* (missing) and *hielo* (empty Congelados).
  - With only 40 items the 95% interval is wide, roughly 77-96%.
  - I picked the items after reading the dictionary, so this is likely optimistic.
  - Brand-only lines do worse: 38/57 (67%); *Ariel*, *Roma*, *Axion*, *Escudo*, *Valentina*, *La Costeña*, *Herdez*, *Nutrioli* and *Sedal* are all missing.
- **The 3 bugs in ROADMAP are real, and the proposed 3-line fix works.**
  - "2 detergentes" goes to Otros.
  - "2 detergente en polvo" goes to Carnes, as a guess via *pollo*.
  - A term "constructor" crashes `buildIndex`.
  - The fix keeps all 68 unit tests passing.
- **Bugs still open after that fix:**
  - When two aisles tie, the aisle listed first in the file wins. Because of that, 8 words typed exactly as written in the dictionary still land in another aisle.
  - "X de Y" goes to whatever X is: *lata de chiles* goes to Frutas, *frasco de mermelada* to Bebés, *hueso de res* to Mascotas, *puré de papa* to Bebés.
  - 93 words exist only in the plural, so *dona*, *vela*, *foco* and *gasa* go to Otros.
  - The typo guesser makes false guesses: *pilas* becomes *piñas*, and *polvo* becomes *pollo*.
  - It is slow for a "Notepad" app: 90 ms on a desktop to sort a 40-item list, and the app repeats it on every change.
- **For the rebuild:** keep the aisle IDs and order, the folding, the whole-word phrase matching, the quantity stripping (with the fix) and the synced per-list corrections. Rebuild the word list from a sourced, reviewed base instead of carrying the Gemini list forward as-is.

---

## 1. Where the aisle code lives

| Piece | File:line | What it does |
|---|---|---|
| Matcher spec (comment) | `checkpoint1/src/aisles.js:5-51` | The contract: `fold`, `stripQuantity`, `buildIndex`, `aisleOf`, `AISLES` |
| Matcher code | `checkpoint1/src/aisles.js:53-276` | Plain script that defines the global `ListoAisles`; no libraries |
| Dictionary (data) | `checkpoint1/data/aisles-es-MX.txt` (20 lines, 23,367 bytes with CRLF) | `ID: term\|term\|…` |
| Conflicts to review | `checkpoint1/data/aisles-review.md` | 51 words that the old dictionary put in two aisles, with the "last one wins" result |
| One-off converter | `checkpoint1/tools/convert-dict.py` | Old `SUPERMARKET_DICT` → aisle IDs; last duplicate wins (line 30) |
| Checker | `checkpoint1/tools/check-dict.py` | Known IDs, folded terms, the same string in two aisles |
| Build | `checkpoint1/tools/build.py:27-28` | Puts the dictionary text into `index.html` as a JSON string (`/*@dict*/`) |
| Use in the app | `checkpoint1/src/app.js:270-315, 330-340, 358-367, 433-436, 482-519` | Parses the dictionary on first use of the aisle view, works out each item's aisle at display time, shows a tag ("?" for a guess), has the aisle picker, and the ↑/↓ order sheet |
| Unit tests | `checkpoint1/tests/matcher.test.js` | 68 checks on a 62-term toy dictionary (lines 12-28) |
| Real-dictionary test | `checkpoint1/tests/dictionary.test.js` + `tests/aisles-es-MX.tsv` | 40 tricky items; pass floor 24 (line 5) |
| Research | `checkpoint1/docs/research/2026-09-25-aisle-sorting.md` | Audit of the old matcher, the plan, data sources, competitors |
| Bug list | `checkpoint1/ROADMAP.md:58-74` | 3 matcher bugs + 2 spec gaps (found 2026-09-26) |
| Old attempt | `main/index.html:242-256` (dictionary), `491-509` (`normalize`/`categorize`), `512-521` (aisle frozen at add), `696-713` (aisle view, alphabetical) | Live site today |
| Oldest version | `local-2024/index.html`, `index2.html` | No aisle code at all (grep for aisle/pasillo/categor: 0 hits) |

---

## 2. The 14 aisles (IDs, names, walking order)

Defined at `checkpoint1/src/aisles.js:257-272`. The test pins this order (`matcher.test.js:117-118`). Users can reorder the aisles per list with ↑/↓ buttons (`app.js:307-313`, `503-519`). The order syncs as `state.order = {ids, ts}`, and the newest timestamp wins.

| # | ID | Name (checkpoint1) | Emoji in the research plan | Old main category (`convert-dict.py:8-11`) | Terms |
|---|---|---|---|---|---|
| 1 | FRU | Frutas y verduras | 🥦 | Frutas y Verduras 🥦 | 142 |
| 2 | PAN | Panadería y tortillería | 🍞 | Panadería y Tortillas 🍞 | 54 |
| 3 | CAR | Carnes y salchichonería | 🥩 | Carnes y Pescados 🥩 | 124 |
| 4 | LAC | Lácteos y huevo | 🧀 | Lácteos y Huevos 🧀 | 90 |
| 5 | CON | Congelados | 🧊 (new) | none | **0** |
| 6 | DES | Despensa | 🥫 | Despensa y Abarrotes 🥫 | 244 |
| 7 | BOT | Botanas y dulces | 🍫 | Botanas y Dulces 🍫 | 93 |
| 8 | BEB | Bebidas y licores | 🥤 | Bebidas 🥤 | 99 |
| 9 | LIM | Limpieza y hogar | 🧹 | Limpieza y Hogar 🧹 | 151 |
| 10 | HIG | Higiene personal | 🧴 | Higiene Personal 🛁 | 226 |
| 11 | FAR | Farmacia | 💊 | Farmacia 💊 | 157 |
| 12 | BBE | Bebés | 🍼 | Bebés 🍼 | 155 |
| 13 | MAS | Mascotas | 🐶 | Mascotas 🐶 | 116 |
| 14 | OTR | Otros | 🛒 | (null → "Otros 🛒", `main/index.html:702`) | (fallback) |

Notes:
- The emoji are only in the research plan (research doc line 193). `AISLES` in `aisles.js` has names only.
- Fish stayed in CAR even though the name changed from "Carnes y Pescados" to "Carnes y salchichonería".
- The walking order (produce first) rests on a US source. The research doc says "No Mexican evidence was found, so confirm the order against the store you actually use" (line 194, citing Chowhound 2024-02-04). ROADMAP decision #3 (the store's real order) was still waiting on Victor. **The order is unverified for Mexican stores.**
- Where MAIN shows its aisles in alphabetical order (`main/index.html:707`, `Object.keys(grouped).sort()`), CP1 uses this walking order.

---

## 3. Dictionary format and size

**Format** (`data/aisles-es-MX.txt`):
- Lines starting with `#` are comments (lines 1-6).
- Each line after that is `ID: term|term|…`.
- Terms are already folded: lowercase, accents removed, ñ written as n, punctuation turned into spaces. Phrases of several words are allowed.
- Terms are sorted alphabetically within each line (`convert-dict.py:41`).
- Both `app.js:274-279` and `dictionary.test.js:7-16` parse it the same way: split on `:` and `|`, then trim.

**Size (measured):**

| Measure | Value |
|---|---|
| Terms | 1,651, with no identical string in two aisles (`check-dict.py`: "1651 terms, 0 problem(s)") |
| Bytes | 23,347 with LF (23,367 on disk with CRLF); 7,824 bytes after gzip -9 (Node zlib). The commit message says 7.9 KB |
| Words per term | 1 word: 707 · 2 words: 355 · 3 words: 510 · 4 words: 63 · 5 words: 13 · 6 words: 3. So 57% are phrases |
| Old MAIN dictionary | 1,720 key:value pairs, 1,659 unique keys, 57 keys listed twice, 50 of them with conflicting aisles, 75 keys with accents or ñ that can never match, 16 keys of 3 letters or fewer (ajo, col, uva, res, pez, pan, sal, te, ate, aji, ron, sol, sq, m&m, gel, nan). That is 69,166 bytes of the 103,579-byte `index.html`. These match the research doc's figures (its lines 30-36) |
| Old → new | 1,659 old keys → 1,651 folded terms. 8 accented keys merged with plain twins (*pañales/panales* etc.) |

**How much of it adds anything:**
- I removed each term in turn, rebuilt the index, and checked where the term itself landed.
- 601 of the 944 phrases (64%) and 85 of the 707 single words still landed in their own aisle without themselves.
- So about 686 of 1,651 terms (42%) are redundant: mostly the templated "X para Y" variants of a word that already matches by itself (`aisles-work/redundancy.js`).
- The dictionary therefore carries about 965 terms that do real work.

---

## 4. Where the words came from (provenance)

**Conclusion:**
- The words were produced by an AI model (almost certainly Gemini) in January 2026, with no source cited.
- They were not hand-written and not taken from a real catalogue.
- No later step changed the vocabulary. Checkpoint1 only re-keyed it.

Evidence:
1. **Git history of `main`** (`git log origin/main`, in `D:\_GitHub\listolista`):
   - `f23ecac` 2026-01-12 20:03 "SUPERMARKET AISLE SORTING v0.1": 150 pairs in 12 categories, the obvious staples (manzana, pera, platano… carne, res, pollo… leche, huevo…).
   - `fdce2fd` 20:10: still 150.
   - `d158e43` 20:20 "Better Supermarket List": **1,720 pairs**, and the header changed to `// --- BRAIN: SUPERMARKET DICTIONARY (EXHAUSTIVE 1000+ Items) ---` (`main/index.html:240`). About 1,570 entries in 10-17 minutes, added at the end of each category's line, is not hand-typing.
2. **`main/README.txt`**: "All code was generated via the Gemini Canvas interface". The dictionary is part of that code. I could not confirm that Gemini generated these exact words (there is no chat log), but the README, the timing and the content all point that way.
3. **Content fingerprints** (`aisles-work/dict-stats.js`):
   - Templated lists: "shampoo para …" ×18 (such as "shampoo para cabello con resequedad"), "crema para …" ×17, "ambientador de …" ×11 (manzana, pino, vainilla, closet…), "panales para …" ×11 (such as "panales para bebe de nina"), "carne de …" ×9 (such as "carne de bovino", "carne de ovino"), plus "protector solar …", "toallitas para …", "papilla de …".
   - Not Mexican usage: *ambientador* (14 terms), *champú*, *colutorio*, *bastoncillos*, *dentífrico*, *trapero*, *chupete/chupeta*, *mamadera* (5), *guisantes*, *remolacha*, *banana*, *film transparente*, *papel de cocina*, *crema de maní*, *gel de baño*, *nata*, *altramuz*. Most have a Mexican twin in the list too (*aromatizante*, *chícharo*, *betabel*, *plátano*), so they are mostly harmless noise.
   - Errors and nonsense: "cajeta de leite" (Portuguese), "mouse" and "mouse para cabello" in HIG (meant *mousse*), "antecesor" (BBE), "glucosimetro para bebe", "leche materizada", "diesmillo" (for *diezmillo*), "rufles", "fregadero" (a sink), "silla de ruedas" and "clenbuterol" in FAR, "mexicano" and "tlaxcala" in PAN.
4. **Checkpoint1 changed only the keys.**
   - `data/aisles-es-MX.txt` lines 5-6 say: "Converted 2026-09-25 from the dictionary inside index.html (last duplicate wins, as before)".
   - Commit `5f50159` "Aisle dictionary as data (1,651 terms, 14 aisle IDs…)".
   - The planned growth (PROFECO names plus labelling by Qwen3.6-35B, research doc §F lines 216-220) stayed in the backlog (`ROADMAP.md:127` "💤 Grow the aisle dictionary with the local model").
5. **The real source that was considered:** PROFECO "Quién es Quién en los Precios" 2026.
   - **Verified today** through the CKAN API (https://www.datos.gob.mx/api/3/action/package_show?id=programa_quien_es_quien_precios_2026): licence `CC-BY-4.0`, `metadata_modified` 2026-09-22T18:23:58, organisation PROFECO, 9 CSV resources (Jan q1/q2, Feb q2, May q1/q2, Jun q1/q2, Jul q1/q2) on `repodatos.atdt.gob.mx`.
   - A HEAD request to each of the 9 CSVs returns `200 text/csv` with `Content-Length: 20`. Either the server reports HEAD wrongly, or the files are stubs.
   - **The contents are unverified.** I did not download them; a GET is a file download, which needs the owner's OK. WebFetch of the same CKAN URL returned 403, while Node's `fetch` worked.

**What this means for the "genuine content only" rule:**
- The aisle assignments are a model's guesses, presented as the app's answers, with no source cited. They work as hints the user can correct, which is how checkpoint1 used them.
- A rebuild should either state their origin, or rebuild the list from a sourced base (such as PROFECO product names, CC BY 4.0 with attribution) plus the owner's own review.

---

## 5. The checkpoint1 matcher, step by step

`aisleOf(text, index, overrides)` at `aisles.js:160-254` returns `{id, term, guess}`.

1. **Fold** (`aisles.js:71-83`):
   - Lowercase, then NFD, then remove `\u0300-\u036f`. This also turns ñ into n, and there is a belt-and-braces `.replace(/ñ/g,'n')`.
   - A `.` or `,` between two digits becomes `.`. Anything else that is not `a-z0-9/` becomes a space.
   - Collapse spaces and trim.
   - Example: "Coca-Cola, 3 litros!" becomes "coca cola 3 litros" (test at `matcher.test.js:37`).
   - The Python fold in `convert-dict.py:20-24` and `check-dict.py:6-9` uses the same rules.
2. **Strip a quantity** at the start, or else at the end (`aisles.js:86-104`):
   - A number is digits, a fraction "1/2" or a decimal "1.5". It may be followed by a unit (kg, kilo(s), g, gr, gramos, l, lt, litro(s), ml, pieza(s), pz, paquete(s), docena(s), lata(s), bolsa(s), caja(s); lines 60-64) and then "de".
   - A number word (un, una, uno, medio, media, dos … diez; lines 66-68) counts only when a unit follows it. So "tres leches" stays, while "3 leches" becomes "leches".
   - Only one end is stripped: the start is tried first, and the end only if the start found nothing.
3. **Corrections** (`aisles.js:165-167`):
   - If `overrides[key]` exists, it wins. The key is the folded, quantity-stripped text, matched exactly.
   - Corrections are stored per list as `state.ovr[key] = {aisle, ts}` (`app.js:301-305`), the newest timestamp wins per key, and keys are checked against `/^[a-z0-9 .\/]{1,120}$/` (`app.js:12, 37`).
4. **Whole-word phrase scan** (`aisles.js:169-209`):
   - Every term of every aisle is tried at every word position.
   - An item word matches a term word if the term word equals the item word or one of its singular candidates (`singulars()`, lines 107-119): *w*, *w*−s, *w*−es, and -ces→z (so *nueces* becomes *nuez*).
   - Only the item side is singularised. The dictionary's terms are not.
   - The most words wins. On a tie, the leftmost position wins. On a full tie, **the first aisle in file order wins**, because the comparison at line 201 is strict (`>`/`<`).
   - Terms made only of filler words are skipped (lines 183-185). No dictionary term is filler-only, so this never triggers.
5. **Typo guess** (`aisles.js:211-250`), only when step 4 found nothing:
   - For each item word of 5+ letters, it checks the Damerau-Levenshtein distance (lines 122-139) to every single-word term.
   - It allows distance 1, or 2 for words of 8+ letters.
   - It keeps the smallest distance and accepts only if all terms at that distance are in one aisle. The result has `guess: true` and is shown with a "?" and a lighter tag (`app.js:365`).
6. Otherwise the answer is `OTR`.

**When the aisle is decided:** at display time, on every render (`app.js:331-334`). Dictionary fixes therefore reach old items, which fixes MAIN's "frozen at add time" flaw (`main/index.html:516-521`).

### The old MAIN matcher, for comparison

`main/index.html:491-509`:
- `normalize` does NFD, removes marks, lowercases and trims. It does not touch punctuation and does not strip quantities.
- `categorize` tries an exact key first. Then it tries **every key, longest first, as a substring of the whole text** (`norm.includes(key)`), and returns `null` if nothing matches.
- Dictionary keys that keep their ñ or accents can never match.
- The resulting emoji label is stored in `item.category` when the item is added and is never recomputed. Groups are sorted alphabetically.

---

## 6. Known bugs

Status: **CONFIRMED** means I reproduced it today. Fixed by "P" means the ROADMAP 3-line patch fixes it.

| # | Bug | Where | Evidence (today) | Fixed by P? |
|---|---|---|---|---|
| 1 | After a number, the optional "de" eats the start of the next word | `aisles.js:90-91` `(?:\\s+de)?` has no `\b` | "2 detergentes" → OTR (key `tergentes`). "2 detergente en polvo" → CAR? via *pollo*. "3 desinfectante de cocina" → CAR? via *cecina*. "2 desodorantes" → OTR. **CONFIRMED** | Yes, all four go right |
| 2 | A trailing number of 2+ digits is only partly removed | `aisles.js:93` greedy `^(.*)\\s*` | "coca cola 600 ml" → key `coca cola 60`. The aisle stays right, but a saved correction for "coca cola" is missed. **CONFIRMED** | Yes (key `coca cola`) |
| 3 | A term "constructor" crashes `buildIndex` | `aisles.js:143` `singles: {}` | `index.singles[ft].push is not a function`. Only "constructor" can collide, because fold lowercases and turns `_` into a space. **CONFIRMED** | Yes |
| 4 | Ties go to whichever aisle comes first in the file (ROADMAP spec gap a) | `aisles.js:201` | 8 dictionary terms land elsewhere when typed exactly: *chiles secos* DES→FRU, *galletas marias* BOT→DES, *papas* BOT→FRU, *servilletas* LIM→DES, *condones* FAR→HIG, *preservativos* FAR→HIG, *crema para bebes* BBE→LAC, *talco para bebes* BBE→HIG. ROADMAP says "8 of 10 tied words". **CONFIRMED** | No. ROADMAP's proposed rule ("an exact term beats a singular-form match") is not implemented |
| 5 | Quantity at both ends (spec gap b) | `aisles.js:95-101` | Only one end is stripped. Victor never made a decision. **CONFIRMED** by reading the code | No |
| 6 | Congelados has no words | `aisles-es-MX.txt:11` `CON: ` | *helado*, *nieve* → BOT. *hielo*, *bolsa de hielo*, *verduras congeladas*, *pizza congelada* → OTR. **CONFIRMED** | No (missing data) |
| 7 | "Last duplicate wins" gave bad answers on staples | `convert-dict.py:30`, `aisles-review.md` | **crema → HIG** (LAC → HIG). *café* → BEB. *chicharrón* → BOT. *papel de baño/higiénico* → HIG. *galletas* → BOT. 51 rows were waiting on Victor (`ROADMAP.md:86`). **CONFIRMED** | No |
| 8 | Leftmost word wins in "X de Y" | Spec `aisles.js:38-39`; code line 201 | *lata de chiles* → FRU. *frasco de mermelada* → BBE (MAIN gets this one right). *hueso de res* → MAS. *puré de papa* → BBE. *ajo en polvo*, *cebolla en polvo* → FRU. *sal de uvas* → DES (research doc §2 too). **CONFIRMED** | No |
| 9 | False typo guesses | `aisles.js:219-250` | *pilas* → FRU? (*piñas*). *cacao en polvo* → CAR? (*polvo*→*pollo*). Shown as a guess. **CONFIRMED** | No |
| 10 | 93 words exist only in the plural | Dictionary data + item-side-only singulars | Short singulars miss: *dona*, *seta*, *pasa*, *vela*, *foco*, *gasa* → OTR. Longer ones work only as a guess: *tortilla* → "Panadería y tortillería?", likewise *galleta*, *palomita*, *guante*. **CONFIRMED** | No |
| 11 | Correction keys keep leftover words | `aisles.js:161-166` exact key | "Coca de 2 litros" → key `coca de`. "medio de jamón" → key `medio de jamon` ("medio" with no unit stays). A correction on "crema" does not cover "crema Lala". **CONFIRMED** | No |
| 12 | A brand that only appears inside a phrase is never found alone | Phrase scan needs every word | The dictionary has "salsa valentina", but "Valentina" alone → OTR. **CONFIRMED** | No |
| 13 | Generic single words placed in surprising aisles | Data | *crema* HIG, *hueso*/*collar*/*juguete* MAS, *frasco*/*pure*/*formula* BBE, *kleenex*/*servilleta*/*aluminio* DES, *compotas* HIG, *mouse* HIG. **CONFIRMED** | No |
| 14 | Slow | `aisles.js:87-93` (regexes rebuilt on every call), 178 (`split` on every term on every call), 173-206 (full scan of 1,651 terms), 222-245 (full distance matrix against 707 singles) | Node desktop: `buildIndex` 10.7 ms. `aisleOf` 0.9-2.4 ms on a hit, 8-11 ms when it falls through to typo guessing. **90 ms per render of the 40-item list.** `render()` recomputes every item on each change (`app.js:331-334`). Phone speed is **unverified**; phones are usually several times slower | No |
| 15 | `check-dict.py` misses cross-aisle conflicts | `check-dict.py:25` only checks identical strings | It reports "0 problem(s)" while 5 singular/plural pairs are split across aisles (*almendra* BOT/*almendras* DES, *papa*/*papas*, *servilleta*/*servilletas*, *condón*/*condones*, *preservativo*/*preservativos*) and bug 4 exists. **CONFIRMED** | No |
| 16 | Tests are tied to macOS and to line endings | `tests/run.sh:6` (jsc path), `dictionary.test.js:19-22` | It only runs with macOS `jsc`. Under Node with CRLF files (this Windows checkout), the "store-dependent" flag `'1\r'` never equals `'1'`, so the result reads 26/40 instead of the intended 24/35. **CONFIRMED** with a shim (`aisles-work/run-old-tests.js`) | n/a |

MAIN's own flaws (research doc §1, re-counted today):
- Substring matches fire inside other words. Confirmed today: *pantuflas* → PAN, *champiñones* → LIM via "pino", *Zote/La Costeña/Clemente Jacques* → BEB via "te", *aguacte* → BEB via "agua", *pizza congelada* → HIG via "gel".
- 75 accented keys can never match: *papel de baño* → none.
- 50 conflicts.
- The aisle is frozen at add time, and aisles are listed alphabetically.

---

## 7. Quality test: 40 realistic Mexican shopping items

I chose these to cover how people actually write lists: the staples the task suggested, plus quantities, brands alone, singular and plural, and accents. File: `aisles-work/realistic-40.tsv`; full output in `realistic-40.out.txt`.

**Selection bias:** I wrote the list after reading the dictionary. It leans toward staples, so treat the hit rate as optimistic for everyday items. "v" marks a store-dependent item; a "|" means either aisle counts as right.

| # | Item as typed | Expected | CP1 (term matched) | MAIN |
|---|---|---|---|---|
| 1 | tortillas | PAN | ✓ PAN "tortillas" | ✓ |
| 2 | 1 kilo de jitomate | FRU | ✓ "jitomate" | ✓ |
| 3 | 3 aguacates | FRU | ✓ "aguacate" | ✓ |
| 4 | papel de baño (v) | LIM\|HIG | ✓ HIG "papel de bano" | ✗ OTR (ñ key) |
| 5 | Maseca | DES | ✓ | ✓ |
| 6 | Fabuloso | LIM | ✓ | ✓ |
| 7 | Zote | LIM | **✗ OTR** (missing) | ✗ BEB via "te" |
| 8 | chiles en lata | DES | ✓ phrase | ✓ |
| 9 | frijol | DES | ✓ | ✓ |
| 10 | crema | LAC | **✗ HIG** "crema" | ✗ HIG |
| 11 | 6 bolillos | PAN | ✓ "bolillo" | ✓ |
| 12 | consomé Knorr | DES | ✓ "consome" | ✓ |
| 13 | pañales | BBE | ✓ "panal" | ✓ |
| 14 | croquetas | MAS | ✓ | ✓ |
| 15 | cerveza | BEB | ✓ | ✓ |
| 16 | garrafón (v) | BEB | **✗ OTR** (missing) | ✗ OTR |
| 17 | huevo | LAC | ✓ | ✓ |
| 18 | leche Lala | LAC | ✓ "leche" | ✓ |
| 19 | queso Oaxaca | LAC | ✓ phrase | ✓ |
| 20 | medio de jamón | CAR | ✓ "jamon" | ✓ |
| 21 | pechuga de pollo | CAR | ✓ phrase | ✓ |
| 22 | carne molida | CAR | ✓ phrase | ✓ |
| 23 | cebolla | FRU | ✓ | ✓ |
| 24 | limones | FRU | ✓ "limon" | ✓ |
| 25 | chiles serranos | FRU | ✓ "chile serrano" | ✓ |
| 26 | plátanos | FRU | ✓ "platano" | ✓ |
| 27 | arroz | DES | ✓ | ✓ |
| 28 | aceite | DES | ✓ | ✓ |
| 29 | azúcar | DES | ✓ | ✓ |
| 30 | sopa de fideo | DES | ✓ "sopa" | ✓ "fideo" |
| 31 | 2 latas de atún | DES | ✓ "atun" | ✓ |
| 32 | Sabritas | BOT | ✓ | ✓ |
| 33 | Coca de 2 litros | BEB | ✓ "coca" (key `coca de`) | ✓ |
| 34 | cloro | LIM | ✓ | ✓ |
| 35 | Suavitel | LIM | ✓ | ✓ |
| 36 | pasta de dientes | HIG | ✓ phrase | ✓ |
| 37 | desodorante | HIG | ✓ | ✓ |
| 38 | toallas femeninas | HIG | ✓ "toalla femenina" | ✓ |
| 39 | paracetamol | FAR | ✓ | ✓ |
| 40 | hielo (v) | CON | **✗ OTR** (CON empty) | ✗ OTR |

| Matcher | Correct | Wrong aisle | Otros | Without the 3 store-dependent items |
|---|---|---|---|---|
| CP1 | **36/40 (90%)**; 95% interval about 77-96% | 1 (crema) | 3 | 35/37 (95%) |
| CP1+P | 36/40 (the fix does not touch these) | 1 | 3 | 35/37 |
| MAIN | 35/40 (88%) | 2 (Zote, crema) | 3 | 34/37 |

**The CP1 misses:**
- *crema* → Higiene: the worst one, a top staple sent confidently to the wrong aisle by a last-wins conflict.
- *Zote*: brand missing.
- *garrafón*: missing.
- *hielo*: Congelados is empty.

Two to four new words, plus one conflict fixed, would make this set 40/40. That says more about the set than about real lists.

### Other probe sets (same three matchers)

| Set (file) | What it checks | CP1 | CP1+P | MAIN |
|---|---|---|---|---|
| `brands-probe.tsv` (57) | A brand written alone | 38/57 (67%), 1 wrong, 18 Otros | 38/57 | 37/57, 4 wrong (substring "te") |
| `bug-probes.tsv` (43) | ROADMAP bugs, ties, plural-only words, "X de Y", typos, ñ, number words | 22/43 | **26/43** | 23/43 |
| `extra-probes.tsv` (25) | Singulars, false typo guesses, non-food items | 12/25 | 12/25 | 10/25 |
| `generic-probes.tsv` (7) | Generic words in surprising aisles | 3/7 | 3/7 | 4/7 |
| checkpoint1's own 40 tricky items (`tests/aisles-es-MX.tsv`) | Traps chosen by the researcher | 24/35 counted (5 store-dependent set aside), matching commit `5f50159` | 24/35 | research doc: 19/40 |

Brands missing from the dictionary (all go to Otros):
- **Cleaning:** Ariel, Roma, Vel Rosita, Axion, Zote.
- **Personal care:** Escudo, Always, Head & Shoulders, Sedal.
- **Pantry:** Valentina, La Costeña, Herdez, Nutrioli, Capullo, La Moderna, Clemente Jacques, McCormick.
- **Snacks:** Chokis.

*Kleenex* goes to Despensa.

Found and right: Maseca, Fabuloso, Knorr, Suavitel, Pinol, Cloralex, Foca, Downy, Salvo, Colgate, Huggies, Tajín, Zucaritas, Gansito, Bimbo, Takis, Sabritas, Lala, Alpura, Yakult, Jumex, Boing, Peñafiel, Bonafont, Tecate, Modelo, Corona, Maruchan, Coca-Cola, Pedigree, Whiskas, Dog Chow, Kotex, Saba, Rexona, Gillette.

Expected brand aisles are my own knowledge of what each brand sells in Mexico. I did not check them against a store.

---

## 8. What to keep and what to drop for the rebuild

**Keep (ideas and code worth carrying forward):**
- **Stable 3-letter aisle IDs** (14 including OTR) with **Congelados** as its own aisle. Users reorder them per list with ↑/↓ buttons, and the order syncs (newest wins). The research doc found that HTML5 drag-and-drop is missing on Samsung Internet and Firefox for Android (caniuse, 2026-09-24; research doc line 18, not re-checked).
- **Work out the aisle at display time.** Never store it on the item.
- **Per-list corrections** synced as `ovr[key] = {aisle, ts}`, the AnyList pattern (research doc §6). Show "Recordado para esta lista." (`app.js:495`).
- **Folding:** NFD, remove marks, keep only `[a-z0-9/]`. Fold the dictionary with the same function when it is built.
- **Matching:** whole words, longest phrase first, plural candidates (s / es / ces→z). No substring matching.
- **Quantity stripping, with the ROADMAP fix:** digits mean a quantity, while number words count only before a unit (*3 leches* vs *tres leches*).
- **Typo guess** only for words of 5+ letters, only when all the closest matches agree, and always shown as a guess with "?".
- **A human-editable source format** `ID: term|term`, plus a checker. Make the checker also run every term through the matcher (catches bug 4) and flag singular/plural pairs split across aisles (catches bug 15).
- **The test sets:** checkpoint1's 40 tricky items, my realistic 40, and the brand, bug and extra probes. Run them with Node, which is installed, not macOS `jsc`.
- **Research facts worth keeping:** no on-device ML (a model is a 108-197 MB download versus about 8 KB of dictionary; research doc §5); *Sal de Uvas* is an antacid sold under Farmacia (research doc line 150, citing Chedraui; not re-checked).

**Drop:**
- **The current word list as-is.** It is model-generated with no source; 42% of it is redundant; it mixes in Spanish from other countries and nonsense entries; Congelados is empty; and its last-wins conflicts put *crema* in Higiene. At most, keep it as a list of candidates for a person to review.
- **The tie rule** "first aisle in file order wins". Replace it with: an exact term beats a singular match, then the most words, then a rule for "X de Y" (containers and forms such as lata, frasco, bolsa, en polvo should not decide the aisle).
- **Singularising only the item.** Also normalise the dictionary's terms to singular when the dictionary is built, which fixes *dona*, *vela*, *foco* and *gasa*.
- **Rebuilding regexes and splitting terms on every call.** Precompute in `buildIndex` and index terms by their first word, so each item checks a few dozen candidates instead of 1,651.
- **MAIN's matcher:** substring matching, labels frozen in `item.category`, alphabetical aisles, emoji in stored data.

---

## 9. Risks and open questions

- **No genuine source for aisle assignments.** Aisle layout differs by chain (Walmart, Soriana, Chedraui, Bodega Aurrerá…). The produce-first order rests on a US source. Some items depend on the store: *papel de baño* (LIM/HIG), *café* (BEB/DES), *pan molido*, *leche de almendra*, *garrafón*, *hielo*, *chicharrón*. Per-list corrections are the only real answer.
- **PROFECO contents are unverified.** The metadata and licence check out today, but HEAD reports 20-byte CSVs. Using it would mean downloading one file (needs the owner's OK) and checking the columns. Its categories are price-survey categories, not aisles (research doc line 144).
- **Words from a model versus the "genuine content only" rule.** The rebuild should state where the words came from, or replace them with a sourced, reviewed list.
- **Speed on low-end phones.** 90 ms per render on a desktop is already noticeable for an app meant to feel like Notepad, and the phone figure is unverified. The precomputed index above, or caching each item's result by its folded text, would fix it.
- **The test suite gave false confidence.** 68/68 unit tests pass on a 62-term toy dictionary (where crema is LAC) while the real dictionary misroutes *crema*. The rebuild should test the matcher on the shipped dictionary.
- **A note on this run:** a `package.json` with `"type": "module"` appeared at `D:\_GitHub\listolista\package.json` (22:38) while I was working. I did not create it. My folder pins CommonJS with its own `aisles-work/package.json`.

---

## How to reproduce

All files are under `D:\_GitHub\listolista\data\cache\understand\aisles-work\`. Run them with Node from that folder.

| Script | What it does |
|---|---|
| `run-old-tests.js <checkpoint1 dir> [aisles.js]` | Runs `matcher.test.js` and `dictionary.test.js` under Node, using stand-ins for jsc's `load`, `print` and `readFile`. Set `CRLF=1` to see the line-ending effect |
| `patch.js` | Writes `aisles-patched.js`: a copy of `aisles.js` with the ROADMAP 3-line fix |
| `eval.js <set.tsv> [--detail]` | Runs CP1, CP1+P and MAIN on a probe set. Outputs are saved as `*.out.txt` |
| `dict-stats.js` | Size, words per term, self-consistency, split plurals, plural-only words, non-Mexican vocabulary, templated lists, MAIN dictionary counts |
| `redundancy.js` | Leave-one-out redundancy of each term |
| `perf.js`, `perf2.js` | Timing |
| `ctor.js` | Bug 3 |
| `ckan.js`, `head.js`, `head-all.js` | PROFECO metadata and HEAD checks (no file bodies downloaded) |

Probe sets: `realistic-40.tsv`, `brands-probe.tsv`, `bug-probes.tsv`, `extra-probes.tsv`, `generic-probes.tsv`.

## Unverified

- That Gemini specifically produced these words. This is inferred from the README, the commit timing and the content; there is no chat log.
- The walking order for Mexican stores.
- Speed on a real phone.
- What the PROFECO CSVs contain.
- The research doc's web claims (Chedraui *Sal de Uvas*, caniuse, competitor behaviour, model sizes), which I did not re-open.
- The expected aisles in my probe sets, which are my own judgement.
