# AGENTS.md — Papelito (repository `papelito`, called `listolista` until 2026-10-22)

Read this before changing anything. `HANDOFF.md` is the state of the code, dated, newest first. `docs/VISION.md` says where the product is going and why; `docs/EDITORIAL.md` the rules for words, ink and media on screen; `docs/PIPELINES.md` how the aisle dictionary is built; `docs/research/` the dated research behind every decision. The owner's general method lives outside the repo in `D:\_GitHub\revamp-playbook.md`. `CLAUDE.md` imports this file.

Owner: Victor (github.com/vdm285). The app opens in Mexican Spanish; English is a setting (`?lang=en` in a link, or Menú → Ajustes). Audience: the owner and the person the owner shops with first, friends and family next, anyone later.

## What this is

A shared shopping list that behaves like **one piece of paper on two phones**: a ruled sheet where each phone writes in its own ink, strikes are drawn by hand, and what one phone writes appears on the other in about a third of a second (median 0.37 s, measured). No accounts: the link (`#k=<secret>`) is the key. No server of our own: the page is static (GitHub Pages) and each list travels end-to-end encrypted through free public Nostr relays. Its name is **Papelito** (the owner's choice, 2026-10-22). The repository was renamed from `listolista` the same day: the app lives at https://vdm285.github.io/papelito/, and the old address forwards (see "The rename").

## Do not

- Do not add a server, an account, analytics, ads, a paid API or a key the browser can see. Static hosting only; free keyless sources at runtime; build-time keys only as free GitHub Actions secrets (today: none).
- Do not invent anything: no made-up item, aisle, price, name or fact. Vocabulary comes from sourced data or from an override line with a reason (`docs/PIPELINES.md`). The app never names a person; phones are their inks unless they chose a name.
- Do not use media without its credit and a checked licence (`docs/EDITORIAL.md`, "Credits"; `src/ui/credits.js`).
- Do not put list contents or the secret anywhere but the phone, the `#fragment` and the encrypted blob. Never in a query string, never in logs, never in plain text on a relay. Never load a third-party script at runtime (any script can read `location.hash`).
- Do not trust a decrypted list: anyone with the link can write to it. Everything goes through `sanitize()` (`src/model/doc.js`).
- Do not use `innerHTML` with data. Text goes through lit templates or `textContent`. The only `unsafeSVG` is the QR code we generate ourselves.
- Do not use colour for status: every colour on the sheet is a phone's ink (`docs/EDITORIAL.md`).
- Do not delete or rewrite the old app's localStorage keys (`listolista_*`, `inputs`, `last_local_id`): they are the way back, and the origin `vdm285.github.io` is shared with the owner's other projects.
- Do not change the storage keys (`ll.*`) or the document format (`v: 2`) without a migration: people's lists live there.
- Do not write downloads, caches or scratch anywhere but `data/cache/` (on D:). Never on C:. The project `.npmrc` keeps npm's cache there too.
- Do not edit pipeline outputs (`public/dict/es-MX.json`) by hand; curate through `data/overrides/aisles/` and `data/vocab/`, then `npm run dict`.

## Where things live

- `index.html` and `public/pre.js` (manifest choice per platform, paper colour before scripts; a file because production pages forbid inline scripts: the CSP is added by `vite.config.js`), `src/main.js` (boot: storage first, then dictionary and sync), `src/style.css` (tokens for both themes; rule height and baselines).
- `src/model/` — pure logic, tested in `tests/`: `hlc.js` (hybrid logical clock), `doc.js` (the list as a CRDT: registers, tombstones, `seen`, merge, diff, sanitize, compact), `parse.js` (text → items, quantities), `aisles.js` (aisle matcher, 16 aisles in a default walking order), `legacy.js` (import of every storage layout the old versions wrote).
- `src/app/` — `store.js` (local-first state, undo, inks, "lo de siempre", import once), `i18n.js` (every word), `sync-control.js` (the open list's session, the URL, share/rotate/open link, QR), `install.js` (install prompt, iPhone hint, wake lock).
- `src/sync/` — `crypto.js` (HKDF keys from the link secret, deflate + padding + AES-GCM, slot tags), `nostr.js` (minimal relay pool, NIP-01/42/78), `session.js` (one slot per phone, read-back repair, presence and typing as ephemeral events; the relay list and why).
- `src/ui/` — `app.js` (the sheet, gestures, ink and motion after each render), `cards.js` (menu, share, item, sheets, open link, aisle order, settings, about), `ink.js` (hand-drawn strike paths, the travelling pen, handwriting reveal, paper grain), `icons.js`, `theme.js`, `credits.js`.
- `src/data/dict.js` — loads `public/dict/es-MX.json` after the first frame.
- `public/` — `sw.js` (offline; stamped by `vite.config.js`), two manifests, icons (from `tools/build-icons.mjs`), the dictionary.
- `tools/` — checks: `smoke.mjs` (flows in a browser, PASS/FAIL), `keyboard.mjs` (focus after strikes, deletes and cards; click activation; pressed states), `sync-live.mjs` (phones through the real relays, no browser: latency, inks, come-back, link rotation), `perf.mjs` (first load on a throttled phone, medians), `contrast.mjs` (WCAG ratios of every text colour, both themes), `check-text.mjs` (control characters), `lf.mjs` (line endings). Captures: `shots.mjs` (screenshots at exact sizes), `demo-anim.mjs` (animated two-phone capture), `og.mjs` (the link preview `public/og.png`). Assets: `build-icons.mjs` (app icons), `build-fonts.py` (subset fonts), `build-doodles.py` (the aisle doodles font). Data: `vocab/` (the dictionary pipeline, `docs/PIPELINES.md`). `lib/seed.mjs` (demo lists for all of the above).
- `docs/history/` — versions that never reached git.

## Checks before a commit

```bash
npm test
```

With the dev server up (`.claude/launch.json` → `papelito-dev`, port 5177):

```bash
node tools/smoke.mjs
```

```bash
node tools/shots.mjs
```

and look at the captures in `data/cache/shots/` (phone and desk, both themes, cards). After touching focus, cards or rows: `node tools/keyboard.mjs`. After touching colours: `node tools/contrast.mjs` (struck words need 3:1, text 4.5:1). Before a deploy, build and run the smoke test against the production build too (`npx vite build --outDir dist-audit`, `npx vite preview --outDir dist-audit --port 5181`, `node tools/smoke.mjs --base=http://localhost:5181/`): only it has the Content-Security-Policy. Before a commit that touches sync: `node tools/sync-live.mjs` and `node tools/smoke.mjs --sync` (they use the real relays). Before any commit: `node tools/lf.mjs` (Windows tools write CRLF) and `node tools/check-text.mjs` (invisible control characters).

## Gotchas (each one cost time)

- **Python on Windows writes CRLF** in text mode: open files with `newline=''`; run `node tools/lf.mjs` before committing (`.gitattributes` enforces LF).
- **Heredocs in this shell eat backslashes**: a Python patch written in a heredoc turned `\b` into a real backspace inside a regex, which silently broke the relay logic; backticks break heredocs too. Write every patch script to a file under `data/cache/` and run it by path; `node tools/check-text.mjs` finds control characters.
- **lit's `live()` resets a field to the bound value on any re-render**: the writing line binds `this.draft`, so text must arrive through `input` events (as real typing does). Setting `textarea.value` from a script without an input event is undone on the next render.
- **The sheet is rotated −0.35° on a desk**: `getBoundingClientRect` of anything on it is inflated by a few pixels, and a stuck writing line's right corner lifts off the screen edge. Measure with the transform removed (`document.querySelector('.sheet').style.transform = 'none'`, measure, restore); `--hand-shift` and `--print-shift` in `src/style.css` were found that way, by moving the text until its baseline sat 4 px above the rule at 56 px and 50 px rules.
- **Strikes are measured on the text**: they must be redrawn when the handwriting font arrives (`document.fonts.ready`, `loadingdone`), or they are sized for the fallback font.
- **The browser pane freezes animations when hidden or behind**: a strike that "never draws" in a pane screenshot is usually a frozen animation. Use `node tools/shots.mjs` (puppeteer, installed Chrome) for exact captures.
- **An input's intrinsic width can widen a phone page**: grid columns are `minmax(0, 1fr)` and the title is `width: 0; flex: 1`.
- **Relays**: "OK" does not mean stored (read back); relay.ditto.pub keeps every version (the merge takes care of it); damus answers 503 often; wellorder drops idle connections; nostr.wine and nostr.land are paid. Probe data: `docs/research/2026-10-21-transport.md`.
- **A phone that joins by link must not pick its ink before seeing the others'**: inks are resolved after every merge (`store.resolveInk`).
- **The Vite dev server answers a missing JSON with `index.html` and 200**: `src/data/dict.js` checks the content type.
- **Vite's `watch.ignored` must name only the top-level `data/` folder**: a pattern like `**/data/**` also hid `src/data/`, and the dev server kept serving a stale module with no error. If a change does not show up, `curl` the module from the dev server and grep it.
- **Python patch scripts**: write them to `data/cache/patch-*.py` and run `python -I <file>`; open files with `newline=''`; a JS escape like `\uFE0F` must be written `\\uFE0F` inside a Python string.
- **Windows reserved file names**: `con`, `prn`, `aux`, `nul`, `com1`… cannot be file names on Windows (git cannot even index `con.txt`). Aisle `con` is Congelados, so override files are named `<id>-<aisle name>.txt`; `tools/vocab/build.mjs` refuses a bare `<id>.txt`.
- **`python -I` ignores `PYTHONIOENCODING`**: printing non-Latin-1 text to this console fails; call `sys.stdout.reconfigure(encoding='utf-8')` first.
- **Focus and lit**: a row that moves between lists (pending → struck) is a new element, so the focused one is lost. `app.js` records the focused row in `willUpdate` and restores it in `updated` (`keepFocus`); keep that when restructuring rows.
- **Notices must not move rows on a timer**: rows under a finger jump. They go with the first thing done on the sheet (`onStore`), except the ones about something still true (`lasting`).
- **Aisle doodles** come from `public/fonts/doodles.woff2` (monochrome Noto Emoji subset by `tools/build-doodles.py` to the 16 aisles' emoji): rebuild it when an aisle's emoji changes in `data/vocab/aisles.tsv`. Items have no doodle (the owner's choice, 2026-10-22); the dictionary's per-item emoji are kept for a later round and the app does not draw them. Whether iPhone draws them with this font or with Apple's colour emoji is unverified on a device (the text-presentation selector U+FE0E is appended to ask for the font).

## Common changes

- **The default walking order of aisles** lives in two places that must agree: `AISLES` in `src/model/aisles.js` and the `order` column of `data/vocab/aisles.tsv`. Change both, then `npm run dict` and `npm test` (`tools/vocab/check.mjs` names the mismatch). Lists that saved their own order are unaffected.
- **Adding or dropping a relay**: edit `src/sync/relays.js` (the About card builds its credit from it), and the count in README and HANDOFF. Vet a candidate alone with `node tools/sync-live.mjs --relays=wss://candidate`, then a full `node tools/sync-live.mjs` and `node tools/smoke.mjs --sync`. The CSP needs nothing (`connect-src 'self' wss:`). The probe scripts of `docs/research/2026-10-21-transport.md` §8 were not committed; `sync-live.mjs` covers what matters (stores, serves back, latency).
- **Rebuilding assets** (`npm run fonts`, `python -I tools/build-doodles.py`) needs fontTools and brotli kept on D: — `python -m pip install --target data/cache/pylib fonttools brotli` — and the doodles script downloads `NotoEmoji[wght].ttf` into `data/cache/fonts/` on its first run.
- **Deploying**: GitHub Pages must have its source set to "GitHub Actions" (Settings → Pages, or `gh api -X PUT repos/vdm285/papelito/pages -f build_type=workflow`); with the old "deploy from a branch" setting a push publishes the raw `index.html`, which is blank. Every push to `main` runs `.github/workflows/pages.yml` (tests, dictionary check, build, deploy). After a deploy, check the Actions run and the live page's `<title>`. Before deploying, run the smoke test against a production build too (it alone has the CSP).

## The rename (done 2026-10-22)

The repository `vdm285/listolista` became `vdm285/papelito`, and the app moved from vdm285.github.io/listolista/ to vdm285.github.io/papelito/ (GitHub does not forward Pages addresses).

- **The base path is the repository's name**: `.github/workflows/pages.yml` sets `VITE_BASE` from `GITHUB_REPOSITORY` (not `github.event.repository`, which a scheduled run lacks), so another rename needs no edit there.
- **URLs that name the repository**: README, `index.html` (`og:url`, `og:image`), `src/ui/cards.js` (the About card's code link), `tools/vocab/build.mjs` (the overrides' credit URL; then `npm run dict`), `tools/vocab/fetch-sources.mjs` (User-Agent).
- **The old address** is a separate public repository, `vdm285/listolista`, holding only a forward: `index.html` and `404.html` send any old path to the new address with its query and `#k=` link, and a `sw.js` retires the old offline copy (it deletes the old caches' entries, unregisters itself and sends each open tab of the old address to the new one with its query and `#k=`). Do not delete it: links shared and home-screen icons made before the rename go through it. While it exists, github.com/vdm285/listolista no longer redirects to this repository.
- **Lists did not move**: storage belongs to the origin, which is the same, so `ll.*` and the old app's keys are where they were. On iPhone a Home Screen app keeps its own storage, apart from Safari's: an icon installed from the old address keeps its lists and keeps working through the forward, and one installed again from the new address may start empty (not checked on a device).
- **The repository's About box** starts with the live link, in the description and in the website field (the owner's convention for Pages projects).
- **Do not change**: the storage keys (`ll.*`), the document version, the HKDF salt `papelito/v2` in `src/sync/crypto.js` (changing it would orphan every shared list).
- **The local folder** `D:\_GitHub\listolista` keeps its name: nothing in the build depends on it, and Claude sessions and their memory are tied to the path.
- **Caches are shared by the whole origin**: `public/sw.js` names its caches after its scope and deletes only its own older versions. Another project's worker on vdm285.github.io can still delete ours (A cómo's did on every deploy until 2026-10-22); offline then degrades to online until the next install.

## Conventions

- Commit per feature, message says why. Update `HANDOFF.md` (dated section, newest first) and the relevant doc in the same commit.
- Liberties taken without the owner are listed in `HANDOFF.md` with the one-line reversal.
- Git identity for this clone: the owner's GitHub noreply address (set in `.git/config`).
- Sub-agents for independent work get: goal, what is ruled out, files to read, exact output shape, cache location, these rules, and what to report (counts, a curation list). They never commit.
