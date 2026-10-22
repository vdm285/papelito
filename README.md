# Papelito

**La lista del súper en una hoja que dos teléfonos comparten.**
A shopping list that behaves like one piece of paper on two phones.

Write "huevos, leche" at home; it appears, in your ink, on the other phone at the supermarket. A strike there draws itself here. No accounts, nothing to install, no server of its own: the link is the key, and the list travels end-to-end encrypted.

**Use it:** https://vdm285.github.io/listolista/

![Two phones, one sheet: a strike made on the right phone drawn in red on the left one, and an item written on the left appearing on the right](docs/img/two-phones.jpg)

*Working name: Papelito. The repository keeps its old name, ListoLista, until the owner picks one.*

## What it does

- **The first frame is the list.** It opens straight to the sheet, drawn from your phone's storage; the network only ever adds to it. Works offline; installs as an app.
- **One sheet, two phones.** Tap *Compartir*, send the link (WhatsApp, or the QR code on a computer). Each phone writes in its own ink of a four-colour pen; the other phone's writing and strikes arrive in about half a second, through free public Nostr relays that only ever see encrypted, padded blobs.
- **Paper manners.** Commas, new lines and pasted WhatsApp lists become items. Tap to strike, or swipe and draw the line yourself. What you leave on the writing line stays on the paper. Everything can be undone, including what the other phone did.
- **Mexican aisles.** *Ordenar por pasillo* groups the list in your store's walking order, from a dictionary built from PROFECO's price survey and INEGI's household-spending catalogue. Correct an aisle once; the list remembers it, on both phones.
- **Lo de siempre.** Your household's own history suggests, in pencil, what is probably running out.
- **Paper by day, chalkboard by night.** Handwriting or print, Spanish or English.

## How it works

- A static site on GitHub Pages (Vite + Lit). No backend, no analytics, no accounts, no keys.
- Each list is a state-based CRDT (`src/model/doc.js`): every field is a register stamped by a hybrid logical clock, deletions are tombstones plus a per-phone "seen" map, so any two copies merge to the same result in any order, and a phone with a wrong clock cannot lose an edit.
- Sharing makes a 256-bit secret that lives only in the link's `#fragment` (never sent to any server). From it the phone derives an AES-GCM key, a Nostr signing key and an opaque name for the list. Every phone publishes its whole merged copy to its own slot on six relays; every phone listens to all slots and merges what arrives. Relays can drop data, never read or forge it.
- Research and decisions: `docs/research/`. Design rules: `docs/VISION.md`, `docs/EDITORIAL.md`. Data: `docs/PIPELINES.md`. State of the code: `HANDOFF.md`. For AI agents: `AGENTS.md`.

## Develop

```bash
npm install
npm run dev            # http://localhost:5177
npm test               # model, parser, matcher, crypto, import, dictionary
npm run smoke          # flows in a real browser (dev server up); --sync adds two phones on the real relays
npm run live           # two phones through the real relays, timed, no browser
npm run shots          # screenshots at exact phone and desktop sizes → data/cache/shots/
npm run dict           # rebuild and check the aisle dictionary
```

## Credits

Typefaces Caveat and Atkinson Hyperlegible Next (SIL Open Font License), Lit (BSD-3-Clause), noble-secp256k1 and uqr (MIT). Product vocabulary from «Quién es Quién en los Precios», PROFECO (CC BY 4.0), and the ENIGH 2024 spending catalogue (Fuente: INEGI); emoji names from Unicode CLDR (Unicode License v3). The grouping into aisles is ours; neither agency endorses this app. Full list in the app (Menú → Acerca de) and in `src/ui/credits.js`.

Built by Victor Mikhailov with AI (Gemini for the 2025 versions; Claude for the September 2026 checkpoint and this rebuild).

## License

The code is released into the public domain (The Unlicense, `LICENSE`), like the owner's other projects. Third-party fonts, libraries and data keep their own licences (above; `LICENSES/`).
