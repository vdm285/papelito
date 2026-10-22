# AGENTS.md — Papelito (repository `listolista`)

Read this before changing anything. `HANDOFF.md` is the state of the code, dated, newest first. `docs/VISION.md` says where the product is going and why; `docs/PIPELINES.md` how data gets in; `docs/EDITORIAL.md` the rules for words and media on screen; `docs/research/` the dated research. The owner's general method lives outside the repo in `D:\_GitHub\revamp-playbook.md`. `CLAUDE.md` imports this file.

Owner: Victor (github.com/vdm285). The app opens in Mexican Spanish; English is a setting. Audience: the owner and the people he shops with first, friends and family next, anyone later.

## What this is

A shared shopping list that behaves like **one piece of paper on two phones**. You write "huevos, leche" at home; it appears, in your ink, on the other phone at the supermarket; a strike there draws itself here. No accounts: the link is the key. No server of our own: the page is static (GitHub Pages) and the list travels end-to-end encrypted through free public relays. Working name **Papelito**; the repository keeps its old name until the owner decides.

## Do not

- Do not add a server, an account, analytics, ads, a paid API or a key the browser can see. Static hosting only; free keyless sources at runtime; build-time keys only as free GitHub Actions secrets (today: none).
- Do not invent anything: no made-up item, aisle, price or fact. Vocabulary comes from sourced data or from the override files, and says which (`docs/PIPELINES.md`).
- Do not use media without its credit and a checked licence (`docs/EDITORIAL.md`, "Credits").
- Do not put list contents anywhere but the phone and the encrypted blob. Never in a URL query, never in logs, never in plain text on a relay.
- Do not trust a decrypted list: anyone with the link can write to it. Everything goes through `sanitize()` (`src/model/doc.js`).
- Do not use `innerHTML` with data. Text goes through lit templates or `textContent`.
- Do not delete or rewrite the old app's localStorage keys (`listolista_*`, `inputs`, `last_local_id`): they are the way back, and the origin `vdm285.github.io` is shared with the owner's other projects.
- Do not write downloads, caches or scratch anywhere but `data/cache/` (on D:). Never on C:. The project `.npmrc` keeps npm's cache there too.
- Do not edit pipeline outputs by hand; curate through `data/overrides/` and rerun.

## Where things live

- `src/model/`: pure logic with tests in `tests/` — `hlc.js` (clock), `doc.js` (the list as a CRDT), `parse.js` (text → items), `aisles.js` (aisle matcher), `legacy.js` (import of the old versions' storage).
- `src/sync/`: `crypto.js` (keys from the link secret, sealing).
- `docs/history/`: versions that never reached git.

## Checks before a commit

```bash
npm test
```

## Conventions

- Commit per feature, message says why. Update `HANDOFF.md` (dated section, newest first) and the relevant doc in the same commit.
- Liberties taken without the owner are listed in `HANDOFF.md` with the one-line reversal.
- Git identity for this clone: the owner's GitHub noreply address (set in `.git/config`).
- Scripts go in files and run by path (heredocs with backticks break in this shell).
