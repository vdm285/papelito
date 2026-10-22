# Vision

## The image

**One piece of paper on two phones.** Someone writes "huevos, leche" at home; it appears, in their ink, on the other phone at the supermarket. A strike there draws itself here, with a pen tip travelling along the line. What one person writes while the other is away waits for them under a marcatextos highlight. Nobody signs up for anything: the link is the key.

The owner described it in 2025 as a "quantum-linked piece of paper" with Windows Notepad as the benchmark: it opens instantly, you see what you type, nothing is in the way. Everything here serves that image.

## Why this beats "just use Google Keep" or a WhatsApp message

For two people buying groceries in Mexico (research: `docs/research/2026-10-21-ux.md`):

- **No accounts for anyone, no ads, nothing to install.** Keep needs a Google account and an invitation; Bring! and Listonic need sign-ins and show ads. Here the list is a link.
- **The first frame is the list.** Not a grid of notes, not a spinner: the sheet, drawn from the phone's storage before any network.
- **The quantum moment is visible and dependable.** Each phone writes in its own ink; the other phone's work arrives within about half a second through free public relays, and every change survives offline edits on both phones (a CRDT merge, tested on random histories).
- **It knows Mexican shopping.** *Jitomate*, *garrafón*, *Fabuloso*, *bolillo*: an aisle dictionary built from PROFECO's price survey and INEGI's household-spending catalogue, in your store's walking order, corrected once per list.
- **It remembers "lo de siempre".** The household's own history suggests what is probably running out, written in pencil on the next line.
- **It is private.** The list travels end-to-end encrypted; the relays carry padded blobs they cannot read.

## Principles (in order of precedence)

1. **The paper never leaves the screen.** Menus and cards open beside it (desk) or below it (phone).
2. **The first frame is the list; the network only ever adds to it.**
3. **Nothing is lost.** Undo for everything, including what the other phone did; drafts kept; offline edits merge.
4. **Every colour on the sheet is an ink, and every ink is a phone.** Status is never a coloured dot.
5. **Radical minimalism.** Two controls on the sheet (Compartir, the menu). Everything else lives in the menu.
6. **Genuine content only.** Words in the dictionary trace to a source or to a reviewed override line; credits on every third-party asset.
7. **Zero recurring cost.** Static hosting, no server of our own, no keys in the browser.
8. **Spanish first.** English is a setting.

## Where it is going (checkpoints, not dates)

| # | Checkpoint | Who | Status |
|---|---|---|---|
| 1 | The paper for two (this rebuild) | the owner and the person he shops with | built; awaiting the owner's review |
| 2 | Friends and family | 10–20 people | after the phone test; own address decided |
| 3 | Public, open source | anyone | licence, contribution rules |

## Parked (ideas worth keeping, not built)

- Prices: "tortillas 24" counts toward a total; reference prices from PROFECO via the sibling project A cómo (same origin, so no CORS question). Mexican reviewers ask for this.
- Learning the store's walking order from the order items are struck.
- A view-only link (it would carry the encryption key but not the signing key).
- Home-screen widget and Watch: the web cannot; an installed icon that opens straight to the list is the substitute.
- Push notifications: they need a server; probably never.
