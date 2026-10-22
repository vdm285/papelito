# Checkpoint 1: what is waiting for the owner

The first checkpoint of the rebuild, made unguided on 21–22 October 2026. The presentation page and the three demos are
private Claude artifacts in the owner's account; the demos are also here, in `docs/portfolio/` (each is a single HTML
page meant for the artifact host: no `<html>`/`<body>`, fonts from Google Fonts; open one in a browser to try it).

| What | Where |
|---|---|
| The checkpoint page (what was found, chosen, measured, the liberties, the questions) | artifact https://claude.ai/artifact/DmJMnuLxN3vYqd2Xxvsh7y ("Papelito Checkpoint One") |
| Option A · Pluma fantasma: the other phone writes with an invisible pen; strikes draw themselves | `docs/portfolio/a-pluma-fantasma.html` · artifact https://claude.ai/artifact/6LvjjhQmT1mdPvmaVQt1uX |
| Option B · Papel carbón: the two phones are a sheet and its carbon copy | `docs/portfolio/b-papel-carbon.html` · artifact https://claude.ai/artifact/GwJpPjRiutKoBheVnHVnfo |
| Option C · Hilo entre hojas: an ink thread from the other phone's dot does the writing | `docs/portfolio/c-hilo-entre-hojas.html` · artifact https://claude.ai/artifact/TvkBuXsfjkpXxZDrrwvZjS |

The app already does A (the travelling pen and the handwriting reveal in `src/ui/ink.js`), built ahead of the choice
because something had to arrive somehow; B or C would replace those two functions.

## Names (working name: Papelito)

- **Papelito**: the little paper a household writes the shopping on. Warm, Mexican, the metaphor itself; fits under an icon.
- **ListoLista**: continuity with the old app and its address. Playful (listo = ready), but says "list app" rather than "paper".
- **Mandado**: what Mexicans call the grocery run ("la lista del mandado"). The most local; less clear outside Mexico.
- **Encargo**: "te encargo unas tortillas", how you ask someone to buy something. Personal; fits the two-person idea.
- **Hoja gemela**: the twin sheet. Explains the sync directly, but is longer.

Renaming touches the files listed in AGENTS.md, "Renaming"; never the storage keys or the HKDF salt.

## Open questions (a recommended answer first)

1. **Name**: Papelito (recommended), ListoLista, Mandado, Encargo, or another.
2. **How the other phone's ink arrives**: A Pluma fantasma (recommended: quiet, already built, reads as writing), B Papel carbón, C Hilo entre hojas.
3. **Address**: stay at vdm285.github.io/listolista (recommended for now: free, the old lists import there) or a separate origin (a subdomain or another Pages account), which would stop the owner's other Pages projects from sharing this site's storage (a cross-site script there could read list links).
4. **Next round**: a 20-minute test on the two real phones and polish from it (recommended), prices and a total (PROFECO reference prices), or learning each store's aisle order from the order things get struck.
5. **Licence of the code**: The Unlicense (as in CompaPrecio) or MIT (as in giramundo and interactive-science).
6. **Handwriting**: Caveat (pen-like, needs 29–31 px; current) or Kalam (lighter, more upright).
7. **Aisles**: 16, with Tortillería and Salchichonería as their own counters (current), or the old 14.
8. **The 227 override lines** (`data/overrides/aisles/`, one file per aisle, each line with its why): drafted by an AI; 209 shipped words rest only on them. Review them, or let a phone test decide which matter.
9. **Text size**: the app sizes text in pixels, so a phone's own larger-text setting does not enlarge it (Android Chrome). Moving to `rem` is a contained change with layout risk; worth doing before friends and family.
10. **The slashed zero** of Atkinson Hyperlegible Next ("1Ø") reads like a terminal to one critic; the font has no plain zero. Keep it (a legibility feature) or set counts in another face.

## What needs the real phones (about 20 minutes)

- iPhone: does the home-screen icon keep the list's link (`#k=`)? Is the sticky writing line above the keyboard? Do the doodles draw in pencil (the shipped Noto Emoji subset) or in Apple's colour emoji?
- Android: does a link tapped in WhatsApp open in the installed app? Does Gboard's Spanish dictation split well with the "¿Separar en N?" chip? Does the system's larger text setting enlarge the sheet?
- Both: airplane mode on one phone, edits on both, back online: the lists must match. Then "Hacer un enlace nuevo" on one: the other must say "Enlace cambiado".
