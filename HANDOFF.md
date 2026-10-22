# HANDOFF

The state of the code, newest first. Each section is dated. Read `AGENTS.md` first.

## 2026-10-22 · Round 1 self-audit, before the checkpoint

Seven critics ran as sub-agents, each from the reader's seat with a real browser on a production build: design, interaction, accessibility and robustness first (54 findings), then honesty, docs and performance. Every finding was reproduced before fixing, and each fix group is one commit that says why. Raw findings: `data/cache/audit/round1-findings.json` and `round1b-*.json` (local, not committed).

**Fixed** (commit subjects, oldest first):
- *Closing a card never reopens an old link; deleting a sheet can be undone* — Back after rotating a link reopened the old one; sheet deletion used the wrong undo stack; blank untitled sheets piled up.
- *Model resists hostile and broken copies* — a crafted `seen` claim could delete a young item (now only items older than the purge window); stamps more than a day ahead are refused and never drag the clock; live items and tombstones have separate caps; WhatsApp media placeholders, reactions and invisible characters are not items; long lines split at a word.
- *Aisle dictionary from public sources* — the pipeline and its audit (1,717 terms, every one traced to a source row or an override line; `docs/PIPELINES.md`).
- *Sync trusts only what decrypts…* — a junk event with a far-future date could have made every later record unpublishable; a phone with a fast clock is corrected from our own server's `Date` header; a date refusal shows "La hora de este teléfono no coincide…" and never bans a relay; "Enlace cambiado" when the link moved; a seventh phone borrows the quietest phone's ink instead of looping.
- *Two tabs never clobber the list of sheets…* — merged index with `ll.gone`; a browser that cannot save says so; a link with a trailing period opens; an unknown aisle files under Otros.
- *Typing a title is never overwritten…* — title draft while focused; strikes in a row settle together; notices go with the first action instead of a timer; the writing line, hint and suggestions are one sticky block; one toast and one Deshacer for several remote deletions; aisle order by tapping in walking order.
- *Keyboard and screen-reader paths…* — focus survives strikes, deletes and cards; a bare click (screen reader) strikes; ink said in words; struck words ≥3:1 in every ink; 44 px targets; forced colours.
- *The paper moves aside for a card…* — cards beside the paper on desks (the paper glides left when there is no room), a drawn marker stroke instead of a rectangle, doodles on the rule, a doodle borrowed from a word inside a phrase, no green, handwritten card titles.
- *Production pages carry a Content-Security-Policy…* — no inline script (`public/pre.js`), connections only to this site and WebSocket relays; the doodle font is in the offline shell.
- *Tab from a half-written word reaches the suggestions…*, *On a phone, a toast… goes to the top*, *A desk's first frame shows the top of the sheet…*, *The highlighter lands after the ink…*, *A writing line stuck to the bottom never glides…* — found while verifying the above and regenerating the captures; the capture tools had silently stopped striking (they sent pointer events without the click a real tap ends with).

Round 1b (honesty and docs critics):
- *Make the promises true…* — item stamps follow the server-corrected clock and a copy refused for its date says so (a phone a day fast lost its edits silently); the other phone's edits and renames get a Deshacer like its deletions; the MIT/BSD texts of the libraries in the page ship in `/licenses/`; the 209 dictionary words with no source row are credited as AI-drafted override lines awaiting review; the About card speaks one language and says what relays do see.
- *Docs say what was measured…* — latency (median 0.8 s over 12 edits, 0.2–1.4 s; about 3 s when both write at once), the clock and undo claims, VISION's "reviewed", the quote's date, `npm run smoke -- --sync`; AGENTS "Common changes" (aisle order in two places, relays, asset prerequisites, deploying).
- *Checkpoint material lives in the repo* — `docs/CHECKPOINT.md` (names, ten questions, phone test) and `docs/portfolio/` (the three demos).

**Numbers now** (each from the tool's own output, 2026-10-22): `npm test` 76; `node tools/smoke.mjs` 44 (46 with `--sync`); `node tools/keyboard.mjs` 9; `node tools/sync-live.mjs` 14; `node tools/contrast.mjs`: text ≥4.5:1, struck words and placeholders ≥3:1, both themes; dictionary 1,717 terms, 11,989 B gzip; doodle font 74 emoji, 27,060 B.

**Decisions taken without the owner in this round** (the way back in brackets):
1. The writing line has no length limit, because whole lists are pasted into it; a single line longer than the paper's 160 characters splits at a word [`MAX` in `src/model/parse.js`; a `maxlength` on the composer would cut pastes].
2. Notices go with your first action on the sheet, not after 14/40 s (a timer moved rows under a finger) [`onStore` and `lasting` in `src/ui/app.js`].
3. Cards are modal everywhere (the paper is inert while one is open); on a desk the paper is not dimmed, and a click on it closes the card [`?inert` on `.desk` in `app.js`, `.scrim` in `style.css`].
4. Aisle order: tap the aisles in walking order; arrows only fine-tune [`order` card in `src/ui/cards.js`].
5. The keyboard shortcut "e" on a row is gone (screen-reader users type letters to move around); F2 and the context-menu key remain [`onRowKey` in `app.js`].
6. One same-origin `HEAD` request per shared-sheet session reads the server's clock; an offset over 90 s corrects relay dates and item stamps [`serverOffset` in `src/sync/session.js`, `setSkew` in `store.js`].
7. Override files are named `<id>-<aisle name>.txt` (`con.txt` cannot exist on Windows) [the regexes in `tools/vocab/build.mjs` and `check.mjs`].
8. The other phone's edits and renames get a Deshacer toast [`onRemote` in `app.js`].
9. Atkinson's slashed zero stays: the font has no plain zero, and the slash is its legibility feature; a critic found it reads like a terminal (question 10 in `docs/CHECKPOINT.md`).
10. Two commit messages had wrong numbers before pushing ("16 checks" for 14; "0.2–0.9 s" for 0.2–1.4 s); both were corrected in local history before any push.

**Not fixed, flagged**: sizes are in px, so a phone's larger-text setting does not enlarge the sheet (question 9); Noto Emoji mixes solid and outline drawings in the margin (a design limit of the font); `npm audit` lists sharp (libvips CVEs) beside puppeteer-core's download chain: both are build-time tools run on our own files, never shipped.

**Checkpoint material**: `docs/CHECKPOINT.md`; the three demos in `docs/portfolio/` and as private artifacts (links there); the checkpoint page is a private artifact in the owner's gallery ("Papelito Checkpoint One").

**Deploy**: GitHub Pages was on "deploy from a branch" (serving the January app from the root of `main`). It is switched to "GitHub Actions" in the same step as the first push of the rebuild (AGENTS.md, "Common changes"); see the next dated section for the result.

### In flight

- A verification round: fresh critics re-measure every round-1 finding against the fixed build (default "not fixed") and hunt regressions (`data/cache/audit/verify1.js`).

### Next

1. The owner's answers to the checkpoint questions, then the 20-minute test on the two real phones.
2. The fixes the verification round confirms; px → rem if the owner agrees.
3. Then: prices and a total, or learning each store's aisle order (VISION, "Parked").

## 2026-10-22 · Round 1 (unguided, toward the first checkpoint) — state at night

**Decision: rebuild from scratch, mine the old code for parts.** The live `main` (Gemini, Jan 2026) and the unmerged `design/checkpoint-1` (Sept 2026) were read in full by a parallel audit (`docs/research/2026-10-21-*.md`). Why not patch:
- the live app syncs in plain text through a public broker, has a cross-site-scripting hole in `sandbox.html` on the same origin, and loses title case;
- checkpoint 1 is well built but depends on a Cloudflare Worker on the owner's account (the rules now say static hosting only), and its 1,651-word aisle dictionary was written by a model in January 2026 with no source (the "nothing invented" rule);
- the product idea (one piece of paper on two phones) deserves a stage built for it.

**Mined, with credit:** the four research docs of 2026-09-25 (in `docs/research/`), the 14 aisle ids (now 16), per-list corrections, HKDF + AES-GCM + padding, undo instead of "are you sure?", "Tachados (n)", the migration contract for every storage layout the old versions wrote.

### What works (measured)

- **Engine** (`npm test`: 43 tests): hybrid logical clock; the list as a state-based CRDT with a per-device `seen` map (an item purged after 30 days can never be resurrected by a stale phone; property test over 150 random three-phone histories with skewed clocks and purges, plus a control that resurrects without `seen`); parser (WhatsApp pastes, bullets, headings, decimal commas, quantities; "y" never splits on its own); aisle matcher rewritten against the 16 bugs the audit reproduced; import of every old storage layout; crypto.
- **Sync through public Nostr relays** (`tools/sync-live.mjs`, real relays, no browser): list received by a new phone in ~0.3 s, an add or a strike seen by the other phone in ~0.4–0.9 s, simultaneous adds converge, the two phones end in different inks, a phone opening after both left gets everything from the relays alone. In two real browser phones, an add reached the other phone 0.51 s after Enter (WebSocket trace).
- **The paper UI** (`tools/smoke.mjs`: 34 checks, 36 with `--sync`): writing, pasting, the Notepad rule, strikes, settling, reload, undo/edit, no sideways scroll at 375–1600 px, old lists imported and opened from old links (old keys untouched), sharing (secret only in the `#fragment`, QR), settings (English, chalkboard). Screenshots: `node tools/shots.mjs` → `data/cache/shots/`.

### Liberties taken (each reversible; the reversal in brackets)

1. Rebuild instead of patch [restore `design/checkpoint-1`'s tree from history].
2. Working name **Papelito**; the repository keeps `listolista` until the naming card [one string in `src/app/i18n.js` + the files listed in AGENTS.md "Renaming"].
3. The Cloudflare relay leaves the default path; sync goes through six public Nostr relays [the relay still runs on the owner's account; its code is in history].
4. The model-written dictionary is not shipped; the vocabulary is rebuilt from PROFECO + INEGI + CLDR with per-aisle override files drafted by Claude and awaiting the owner's review [checkpoint 1's dictionary is in history at `design/checkpoint-1`; the app reads any JSON of the same shape from `public/dict/es-MX.json`].
5. 16 aisles instead of 14: Tortillería and Salchichonería are their own counters (as in Mexican stores and both sources); "Despensa" is now "Abarrotes" [`AISLES` in `src/model/aisles.js`, the `aisles` names in `src/app/i18n.js` (both languages), `data/vocab/aisles.tsv`, the `tor`/`sal` rows of `map-qqp.tsv`, `map-enigh.tsv` and `forms.tsv`, the two override files, the "16" in `tools/vocab/check.mjs` and the tests; then `npm run dict`. Corrections a list saved to `tor` or `sal` would fall to Otros].
6. Writing model: the paper (the next empty rule is the writing line, newest item just above it); struck items stay in place 1.4 s, then settle under "Tachados" [`LINGER_MS` in `src/ui/app.js`; `Infinity` keeps them in place until the sheet is reopened].
7. Each phone writes in its own ink (six to choose from, like a box of ballpoints); the other phone's new writing carries a marcatextos highlight until seen [`INKS` in `src/app/store.js`; the highlighter is `.row.new .marker` in `style.css`].
7b. How the other phone's ink arrives: option A (the travelling pen, the handwriting reveal) is built ahead of the owner's pick among the three demos [`ghostNib`, `revealWriting`, `swipeMarker` in `src/ui/ink.js`].
7c. Every relay record asks to be dropped after 180 days without a new version (NIP-40); the phones keep the list regardless [`EXPIRE_DAYS` in `src/sync/session.js`].
8. Dark mode is a chalkboard (pizarrón) [`:root[data-theme='pizarron']` tokens].
9. No custom microphone button: the keyboard's own dictation (es-MX on both platforms) plus a "¿Separar en N?" chip for comma-less dictation (research: the Web Speech API fails in iPhone home-screen apps) [checkpoint 1's microphone code is in history at `design/checkpoint-1`].
10. Handwriting font Caveat (most pen-like; needs 29–31 px) over Kalam (the media research's pick: lighter, more upright); print is Atkinson Hyperlegible Next [`tools/build-fonts.py`].
11. Code licence: The Unlicense, as in the owner's CompaPrecio (his giramundo and interactive-science use MIT; question 5) [`LICENSE`, README "License", `package.json`].
12. Git identity in this clone: the owner's GitHub noreply address (his global config holds a personal address; every earlier commit used the noreply one) [`git config user.email` in this clone].
13. Desktop is first-class but the phone drives the design (a shopping list is used in the store); on a desk the sheet sits beside a stack of sheets and a sticky note with the QR code to take it to the phone [`renderStack` and `renderNote` in `app.js`, the `min-width: 760px` rules in `style.css`].

### Known limits and risks

- Relays promise no retention; the phones are the store. A list left unopened on every phone for months survives only on the phones (iPhone Safari tabs lose storage after 7 days without use; the installed app does not).
- The link is the key: whoever has it can read and write. "Hacer un enlace nuevo" (Compartir card) cuts off an old link.
- `vdm285.github.io` is shared by all the owner's Pages projects, which share localStorage: an XSS in any of them could read list secrets. A separate origin would fix it (question card).
- iPhone: the installed app is a sealed copy; links never open it (the menu has "Abrir una lista compartida" to paste one). Whether the home-screen icon keeps the `#k=` is unverified on a device (WebKit's code says yes).
- `npm audit` findings are in puppeteer-core's browser-download chain (never used: the tools drive the installed Chrome) and in sharp (libvips CVEs; a build-time tool run only on our own SVGs and screenshots). Neither ships in the page. (This line first named only puppeteer-core.)

### Added later that night (each measured or tested)

- **Link rotation scrubs the old link**: every old slot gets a NIP-09 deletion and a sealed "moved" marker (signed with the old key); a phone still on the old link shows "Esta hoja ahora tiene otro enlace…" and stops publishing there. Best effort per relay (in one of three live runs a relay still served an old copy for a few seconds); the guarantee is tested: nothing written after rotating reaches the old link.
- **Relays**: a relay that refuses one kind (relay.coinos.io refuses the ephemeral presence kind) keeps carrying the others; presence has its own subscription; each list remembers its last sync (`syncedAt`) and asks only for newer records (relay.ditto.pub keeps every version of every slot); a phone coming back gets what changed in ~0.3 s.
- **Inks**: this phone's ink is a preference (blue first, changed in the share card), claimed when sharing; collisions are resolved after every merge (whoever claimed first keeps it); the title is in the ink of whoever wrote it; a phone already on a sheet is told when a new phone joins, in its ink.
- **Fonts**: subset and preloaded (Caveat as a static 520 instance, 49 KB; Atkinson 31 KB); **doodles** in the margin and on aisle headings from monochrome Noto Emoji subset to the dictionary's emoji (~19 KB).
- **Accessibility**: pencil text 4.9:1 (AA), placeholders ≥3.2:1 (AA large); remote changes announced as a sentence; `tools/contrast.mjs` measures both themes.
- **Performance** (`tools/perf.mjs`, 4x CPU, slow 4G, median of three): warm start from the service worker 0.55 s to the sheet with 0 KB over the network; cold start 2.0–2.2 s for 122 KB.
- **Motion**: every block in the sheet glides together when rows settle; switching sheets places the new one on top; the first-visit note writes itself word by word.
- **Keyboard on iPhone**: `--kb` from the visual viewport keeps the sticky writing line above it (unverified on a device).
- **Tests**: 52 (`npm test`; this line said 56, but the suite at that commit has 52), smoke 34 (36 with `--sync`), live relay checks 14 (`tools/sync-live.mjs`).
- **Captures**: `tools/demo-anim.mjs` records two real phones syncing through the real relays (animated WebP); `tools/og.mjs` makes the link preview.

### In flight at the time of writing (superseded: see the newest section)

- The dictionary pipeline (`tools/vocab/`, `data/vocab/`, `data/overrides/aisles/`) is being built and audited by sub-agents; `public/dict/es-MX.json` is a placeholder until then.
- Three working demos of how the other phone's ink arrives (A Pluma fantasma, B Papel carbón, C Hilo entre hojas) are being built for the owner to choose from.

### Next (superseded: see the newest section)

Doodles in the margin (Noto Emoji monochrome, subset to the dictionary's emoji), the WhatsApp preview image, the self-audit rounds (visual, flow, honesty, performance, accessibility, robustness, docs), then deploy to Pages and the checkpoint.
