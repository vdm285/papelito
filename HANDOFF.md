# HANDOFF

The state of the code, newest first. Each section is dated. Read `AGENTS.md` first.

## 2026-10-21 · Round 1 (unguided, toward the first checkpoint)

**Decision: rebuild from scratch, mine the old code for parts.** The live `main` (Gemini, Jan 2026) and the unmerged `design/checkpoint-1` (Sept 2026) were both read in full by a parallel audit (reports summarized in `docs/research/2026-10-21-*.md`). Why not patch:
- the live app syncs in plain text through a public broker, has a cross-site-scripting hole in `sandbox.html` on the same origin, and loses title case;
- checkpoint 1 is well built but depends on a Cloudflare Worker on the owner's account (the hard rules now say static hosting only), and its 1,651-word aisle dictionary was written by a model in January 2026 with no source (the "nothing invented" rule);
- the product idea (one piece of paper on two phones) deserves a stage built for it, not a list with sync bolted on.

**Mined, with credit:** the research (four dated docs from 2026-09-25, kept in `docs/research/`), the 14 aisle ids and the idea of per-list corrections, the HKDF + AES-GCM + padding design, undo instead of "are you sure?", "Tachados (n)", the migration contract for every storage layout the old versions wrote.

**Built so far (all tested with `npm test`, 42 tests):**
- `src/model/hlc.js`: hybrid logical clock (a phone with a wrong clock can no longer lose a tie-break; a flagged limit of checkpoint 1).
- `src/model/doc.js`: the list as a state-based CRDT (registers + tombstones), merge/diff/sanitize/compact. Property test: 150 seeds of three phones with skewed clocks converge, and merge is commutative, associative and idempotent.
- `src/model/parse.js`: typed, pasted and dictated text → items (WhatsApp prefixes and formatting, bullets, headings, decimal commas, quantities). "y" never splits by itself.
- `src/model/aisles.js`: the aisle matcher rewritten against the 16 bugs the audit reproduced (same stem on both sides, longest phrase wins, form words, cautious typo guesses, cached).
- `src/model/legacy.js`: one-time import of every old layout on vdm285.github.io (four sources, old keys never touched).
- `src/sync/crypto.js`: secret in the link's #fragment → HKDF keys; deflate + 512-byte padding + AES-GCM.

**Liberties so far** (each reversible; listed again at the checkpoint):
1. Rebuild instead of patch (above).
2. Working name **Papelito** (repo keeps `listolista` until the naming card). Shortlist in the checkpoint notes.
3. The Cloudflare relay leaves the default path (static hosting rule); its code stays in git history.
4. The model-written dictionary is not shipped; the vocabulary is rebuilt from sourced data plus hand-curated override files.
5. Git identity in this clone set to the owner's GitHub noreply address (his global config holds a personal address; every earlier commit used the noreply one).

**Next:** sync transport (public relays, measured), dictionary pipeline, the paper UI, PWA, deploy.
