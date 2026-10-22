# HANDOFF

The state of the code, newest first. Each section is dated. Read `AGENTS.md` first.

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
4. The model-written dictionary is not shipped; the vocabulary is rebuilt from PROFECO + INEGI + CLDR with per-aisle override files drafted by Claude and awaiting the owner's review.
5. 16 aisles instead of 14: Tortillería and Salchichonería are their own counters (as in Mexican stores and both sources); "Despensa" is now "Abarrotes" [`AISLES` in `src/model/aisles.js`].
6. Writing model: the paper (the next empty rule is the writing line, newest item just above it); struck items stay in place 1.4 s, then settle under "Tachados" [a setting could keep them in place].
7. Each phone writes in its own ink of a four-colour ballpoint; the other phone's new writing carries a marcatextos highlight until seen.
8. Dark mode is a chalkboard (pizarrón) [`:root[data-theme='pizarron']` tokens].
9. No custom microphone button: the keyboard's own dictation (es-MX on both platforms) plus a "¿Separar en N?" chip for comma-less dictation (research: the Web Speech API fails in iPhone home-screen apps).
10. Handwriting font Caveat (most pen-like; needs 29–31 px) over Kalam (the media research's pick: lighter, more upright); print is Atkinson Hyperlegible Next [`tools/build-fonts.py`].
11. Code licence: The Unlicense, like the owner's other projects.
12. Git identity in this clone: the owner's GitHub noreply address (his global config holds a personal address; every earlier commit used the noreply one).
13. Desktop is first-class but the phone drives the design (a shopping list is used in the store); on a desk the sheet sits beside a stack of sheets and a sticky note with the QR code to take it to the phone.

### Known limits and risks

- Relays promise no retention; the phones are the store. A list left unopened on every phone for months survives only on the phones (iPhone Safari tabs lose storage after 7 days without use; the installed app does not).
- The link is the key: whoever has it can read and write. "Hacer un enlace nuevo" (Compartir card) cuts off an old link.
- `vdm285.github.io` is shared by all the owner's Pages projects, which share localStorage: an XSS in any of them could read list secrets. A separate origin would fix it (question card).
- iPhone: the installed app is a sealed copy; links never open it (the menu has "Abrir una lista compartida" to paste one). Whether the home-screen icon keeps the `#k=` is unverified on a device (WebKit's code says yes).
- Puppeteer audit findings (`npm audit`) are all in puppeteer-core's browser-download chain, which the app never ships and the tools never use.

### Added later that night (each measured or tested)

- **Link rotation scrubs the old link**: every old slot gets a NIP-09 deletion and a sealed "moved" marker (signed with the old key); a phone still on the old link shows "Esta hoja ahora tiene otro enlace…" and stops publishing there. Best effort per relay (in one of three live runs a relay still served an old copy for a few seconds); the guarantee is tested: nothing written after rotating reaches the old link.
- **Relays**: a relay that refuses one kind (relay.coinos.io refuses the ephemeral presence kind) keeps carrying the others; presence has its own subscription; each list remembers its last sync (`syncedAt`) and asks only for newer records (relay.ditto.pub keeps every version of every slot); a phone coming back gets what changed in ~0.3 s.
- **Inks**: this phone's ink is a preference (blue first, changed in the share card), claimed when sharing; collisions are resolved after every merge (whoever claimed first keeps it); the title is in the ink of whoever wrote it; a phone already on a sheet is told when a new phone joins, in its ink.
- **Fonts**: subset and preloaded (Caveat as a static 520 instance, 49 KB; Atkinson 31 KB); **doodles** in the margin and on aisle headings from monochrome Noto Emoji subset to the dictionary's emoji (~19 KB).
- **Accessibility**: pencil text 4.9:1 (AA), placeholders ≥3.2:1 (AA large); remote changes announced as a sentence; `tools/contrast.mjs` measures both themes.
- **Performance** (`tools/perf.mjs`, 4x CPU, slow 4G, median of three): warm start from the service worker 0.55 s to the sheet with 0 KB over the network; cold start 2.0–2.2 s for 122 KB.
- **Motion**: every block in the sheet glides together when rows settle; switching sheets places the new one on top; the first-visit note writes itself word by word.
- **Keyboard on iPhone**: `--kb` from the visual viewport keeps the sticky writing line above it (unverified on a device).
- **Tests**: 56 (`npm test`), smoke 34 (36 with `--sync`), live relay checks 14 (`tools/sync-live.mjs`).
- **Captures**: `tools/demo-anim.mjs` records two real phones syncing through the real relays (animated WebP); `tools/og.mjs` makes the link preview.

### In flight at the time of writing

- The dictionary pipeline (`tools/vocab/`, `data/vocab/`, `data/overrides/aisles/`) is being built and audited by sub-agents; `public/dict/es-MX.json` is a placeholder until then.
- Three working demos of how the other phone's ink arrives (A Pluma fantasma, B Papel carbón, C Hilo entre hojas) are being built for the owner to choose from.

### Next

Doodles in the margin (Noto Emoji monochrome, subset to the dictionary's emoji), the WhatsApp preview image, the self-audit rounds (visual, flow, honesty, performance, accessibility, robustness, docs), then deploy to Pages and the checkpoint.
