/**
 * Default relays (docs/research/2026-10-21-transport.md §6): five that took a fresh key, served the
 * newest copy back and kept data for years in the 2026-10-21 probes, from different operators; one
 * (relay.ditto.pub) runs different software, so one strfry policy change cannot take out all of
 * them; plus one fallback. Every phone writes to and reads from all of them.
 * A module of its own so the About card can name them without loading the sync code.
 * Adding or dropping one: AGENTS.md, "Relays".
 */
export const RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.nostr.net',
  'wss://nostr.mom',
  'wss://relay.coinos.io',
  'wss://relay.ditto.pub',
  'wss://nostr.oxtr.dev',
];
