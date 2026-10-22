> Research report written by a sub-agent on 2026-10-21 for the rebuild. Paths under `data/cache/` point to local working files (scripts, raw fetches) that are not committed.

# ListoLista sync transport: empirical probe of free, keyless, public endpoints (2026-10-21)

- **Question.** Which free, keyless, public services can a static GitHub Pages app use to sync one small end-to-end-encrypted shopping list (under 8 KB encrypted) between two phones, with no server we run?
- **When and where.** 2026-10-21, 22:35 to 23:30 Mexico City time (2026-10-22 04:35 to 05:30 UTC), from Victor's Windows 10 PC in Mexico. One machine and one network, so latencies are as seen from central Mexico.
- **How.** Node 24.19.0 scripts. They use the built-in browser-style WebSocket and send `Origin: https://vdm285.github.io`, the header a phone browser on the live site would send. I checked that the header goes out (`scripts/origintest.mjs`). MQTT used mqtt.js 5.16.1 over secure WebSocket. A short cross-check ran from a real Chromium browser on https://vdm285.github.io/listolista/ (section 3.9).
- **Keys.** Every Nostr test used a fresh, throwaway key, the same situation as a brand-new shared list.
- **Raw data.** `D:\_GitHub\listolista\data\cache\probes\results-2026-10-21.json` (about 1 MB). It has a summary plus every raw run. The scripts are in `probes\scripts\`, and copies of the specs and terms pages are in `probes\docs\`.
- **For a later re-check.** Keys, event ids and retained topics are saved in `probes\nostr-persistence-2026-10-21*.json` and `probes\mqtt-persistence-2026-10-21*.json` (section 8).
- **Rules followed.** Nothing was written to the old Cloudflare relay. All downloads and caches stayed under `data\cache\`, including npm's cache and temp folder. No processes I didn't start were touched. Terms pages are paraphrased with links, and short quotes are limited to protocol messages (copies are saved).

---

## Bottom line

1. **Nostr relays are the best free, keyless store for ListoLista.**
   - **Results.** 58 relays tested.
     - **28** did everything ListoLista needs with a fresh key, in every run: accepted a kind 30078 event of 2 KB, 8 KB and 16 KB, served the newest copy back, and replaced older versions. 27 of them also honoured a NIP-09 deletion.
     - 11 more worked with caveats: slow queries, no replacement, web-of-trust throttling, or connection failures.
     - 19 were down, paid, blocked this kind, or silently dropped the data.
   - **Speed.** Live push between two connections took **about 0.2-0.4 s** (median) on the good relays.
   - **Why it beats MQTT: events are signed.** Only someone holding the list's key can replace or delete the list. On every MQTT broker tested, a stranger could wipe it.
2. **Recommended set (5 relays, written and read together):**
   - `wss://relay.primal.net`
   - `wss://relay.nostr.net`
   - `wss://nostr.mom`
   - `wss://relay.coinos.io`
   - `wss://relay.ditto.pub`
   - Keep a fallback pool: `wss://nos.lol`, `wss://nostr.data.haus`, `wss://relay.nostr.wirednet.jp`, `wss://nostr.oxtr.dev`, `wss://nostr-01.yakihonne.com`.
   - The reasons are in section 6.
3. **Popular does not mean usable.**
   - `relay.damus.io` returned HTTP 503 on about two-thirds of connection attempts today, including from a real browser. It also rate-limited after 6 events in about 10 s.
   - `nostr.wine` and `nostr.land` require payment.
   - `relay.nos.social` and `purplepag.es` block kind 30078.
   - `relay.nostr.band`, `relay.nostr.bg` and `relay.0xchat.com` did not answer, or their names did not resolve.
   - `relay.mostr.pub` now redirects to `relay.ditto.pub`.
4. **An "OK" from a relay is not proof that it stored the event.**
   - `relay.fountain.fm` answered OK to every write, then refused every read with "kinds not supported".
   - `relay.nostrcheck.me` answered OK, but the event was not readable for at least 20 minutes, and then all versions appeared.
   - So the app must read back to verify, and must never trust a single relay.
5. **The NIP-78 rule change has not reached relays yet.**
   - Since 2026-09-03, NIP-78 says relays SHOULD require NIP-42 AUTH for kind 30078 and serve it only to its author ([PR #2458, merged 2026-09-03](https://github.com/nostr-protocol/nips/pull/2458)). An objection is still open ([issue #2473](https://github.com/nostr-protocol/nips/issues/2473)).
   - No tested relay enforced it. No relay asked for proof of work, and none published a retention policy.
   - The design below still works if relays start enforcing it: every phone that has the link derives the same key, so it can authenticate as the author.
6. **Public MQTT brokers are fast but are the wrong foundation.**
   - Speed: EMQX connected in 0.5 s and delivered in 75 ms. Retained messages worked on EMQX, HiveMQ, Mosquitto, TBMQ and Coreflux.
   - But all the operators' terms say testing only, not production, or don't rely on it.
   - Any stranger could delete our retained message with a zero-byte publish (confirmed on all 6 working brokers).
   - The live site today publishes **plaintext** JSON to HiveMQ (`old/main/index.html:260`, `:366`, `:637`), whose terms forbid production use.
7. **WebRTC / Trystero is not practical as the store.** Both phones must be online at once, and mobile networks often need a TURN relay. A free TURN service needs an account and keys, so it is not keyless. Not needed: the Nostr live path is already about 0.3 s.
8. **The old Cloudflare relay is still alive.**
   - `https://listolista-relay.vdm285.workers.dev` answers exactly as its code says.
   - `/health` returns 200 "ok". A WebSocket from the github.io origin gets `{"t":"snap","v":0,"blob":null}` in 94 ms.
   - It runs on Victor's Cloudflare account, which the "nothing the owner must run" rule excludes. Decide whether to retire it (section 5).

---

## 1. What was tested

| Script (in `probes\scripts\`) | What it does | Output |
|---|---|---|
| `nostr-probe.mjs` | Per relay, with a fresh key and random `d` tags:<br>• fetch the NIP-11 info document<br>• connection A publishes, connection B holds a live subscription<br>• 3 versions of a 2 KB event on the same `d` tag, then one 8 KB and one 16 KB event<br>• read back on a fresh connection C<br>• run 2 adds a NIP-09 deletion test<br>• answers AUTH challenges and mines proof of work up to difficulty 22 if asked (never needed) | `results-2026-10-21-nostr.json` (run 1, 30 relays), `-nostr-run2.json` (run 2, same 30), `-nostr-trystero.json` (28 relays from Trystero's default list) |
| `nostr-single.mjs` | One phone's pattern: one connection; publish, see own echo, read; reconnect after 60 s | `results-2026-10-21-nostr-single-relay_damus_io.json` |
| `idle-test.mjs` | Live subscription left idle 300 s, then a publish from another connection | `results-2026-10-21-idle.json` |
| `retention-sample.mjs` | Asks for anyone's kind 30078 events older than 1, 2 and 3 years. Records only the dates | `results-2026-10-21-retention-sample.json` |
| `concurrency.mjs`, `damus-origin.mjs`, `upgradediag.mjs` | Connections per IP; HTTP status of failed upgrades, with and without an Origin header | `results-2026-10-21-concurrency.json`, `-origin-*.json` |
| `mqtt-probe.mjs`, `mqtt-retained.mjs` | Per broker:<br>• 5 connects (MQTT 5)<br>• retained 2 KB and 8 KB, read back by a brand-new client<br>• replacement<br>• stranger wipe<br>• 10+10 latency samples<br>• payload sizes 16 KB to 1 MB | `results-2026-10-21-mqtt.json`, `-mqtt-extra.json`, `-mqtt-retained-*.json` |
| `nostr-recheck.mjs`, `mqtt-recheck.mjs` | Persistence re-checks (read-only; `--wipe` for MQTT clean-up) | `recheck-*.json` |
| `old-relay-check.mjs` | Old Cloudflare relay: GETs, a WebSocket open on a random unused room, and a ping. Never sends a write | `results-2026-10-21-oldrelay.json` |
| `aggregate.py` | Merges everything into `results-2026-10-21.json` | |

Sizes are characters of random base64, standing in for the AES-GCM ciphertext: 2,048, 8,192 and 16,384. An 8 KB binary state is about 10,900 base64 characters, so the 16 KB test covers it.

---

## 2. Ranked table: Nostr relays

### 2.1 The relays worth using

How to read the columns:

- **Connects** counts every connection attempt across all tests: probe runs, rechecks, idle, retention and concurrency.
- **Live** is the time from publishing on connection A to arrival on connection B.
- **Oldest 30078 served** is indirect retention evidence: the oldest date of anyone's kind 30078 event the relay still serves.
- **Idle 5 min**: did a silent subscription survive 300 s and still deliver?

| Rank | Relay | Software | Connects | Connect median / max (ms) | OK median (ms) | Live median / max (ms) | 2k / 8k / 16k accepted and read | Replaces old version | Deletion (NIP-09) | Oldest 30078 served | Idle 5 min | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | relay.primal.net | strfry 1.1.3 | 18/18 | 578 / 638 | 194 | 247 / 314 | yes / yes / yes (2 runs) | yes | yes | 2024-10 (>2 y) | kept, 248 ms | Run by Primal (a company). max_message_length 1,000,000 |
| 2 | relay.nostr.net | strfry | 13/13 | 726 / 1,020 | 206 | 299 / 538 | yes / yes / yes | yes | yes | 2024-08 (>2 y) | kept, 266 ms | |
| 3 | nostr.mom | strfry 1.1.3 | 13/13 | 688 / 1,769 | 208 | 302 / 314 | yes / yes / yes | yes | yes | 2023-10 (>3 y) | kept, 300 ms | Some multi-value queries timed out (no EOSE in 10-15 s). Use one `d` per filter |
| 4 | relay.coinos.io | strfry | 13/13 | 338 / 388 | 134 | 274 / 335 | yes / yes / yes | yes | yes | 2023-11 (>2 y) | kept, 229 ms | max_message_length 2,097,152 |
| 5 | relay.ditto.pub | Ditto relay 2.5.0 | 13/13 | 218 / 349 | 76 | 77 / 1,554 | yes / yes / yes | **no**: returns every version | yes | 2023-10 (>3 y) | kept, 147 ms | Fastest. Different software from the strfry-based picks. Client must pick the newest by `created_at` |
| 6 | nos.lol | strfry 1.1.3 | 12/17 | 662 / 7,797 | 204 | 378 / 962 (2 of 6 live misses in run 1) | yes / yes / yes | yes | yes | 2024-08 (>2 y) | S connect failed | Most popular, but connections were slow or failed when opened back to back from one IP. NIP-11 says it accepts notes "except spammy ones" |
| 7 | nostr.data.haus | strfry 1.1.3 | 13/13 | 996 / 2,259 | 247 | 300 / 382 | yes / yes / yes | yes | yes | 2023-08 (>3 y) | kept, 335 ms | |
| 8 | relay.nostr.wirednet.jp | strfry 1.0.4 | 13/13 | 696 / 977 | 244 | 348 / 382 | yes / yes / yes | yes | yes | 2023-09 (>3 y) | closed at about 300 s | Japan |
| 9 | nostr.oxtr.dev | strfry 1.0.4 | 12/13 | 587 / 909 | 208 | 303 / 311 | yes / yes / yes | yes | yes | (connect failed) | kept, 287 ms | One recheck query had no EOSE in 15 s |
| 10 | nostr-01.yakihonne.com | strfry 0.9.6 | 13/13 | 775 / 860 | 261 | 360 / 406 | yes / yes / 16k read 1/2 | yes | yes | (query timed out) | kept, 375 ms | |
| 11 | relay.snort.social | memlay 0.2.0 | 17/18 | 547 / 613 | 186 | 190 / 478 | yes / yes / yes | yes | yes | **nothing older than 1 y** | kept, 179 ms | NIP-11 description: "High-performance in-memory Nostr relay". Fine for live push, risky as a store |
| 12 | nostr-pub.wellorder.net | nostr-rs-relay 0.9.0 | 13/13 | 356 / 1,034 | 428 | 430 / 1,533 | yes / yes / yes | yes | yes | nothing older than 1 y | **dropped idle connection at 30 s** | Slow OKs (up to 4.2 s) in run 2 |
| 13 | offchain.pub | strfry 1.1.0 | 13/13 | 249 / 8,513 | 98 | 196 / 208 | 8k rejected once (run 1) | yes | yes | 2023-11 | kept, 194 ms | Web-of-trust filter: `"Policy violated and pubkey is not in our web of trust."` |
| 14 | nostr.bitcoiner.social | strfry 1.1.0 | 10/10 | 369 / 390 | 138 | 242 / 247 | 2k rejected once, 8k rejected both runs | yes | yes | - | - | Same web-of-trust message as offchain.pub. Throttles new keys unpredictably |

**Smaller relays that also passed everything (one run each, from Trystero's default list).**

They are in the raw data:

- relay.agentry.com
- nostr.red5d.dev
- testr.nymble.world
- relay.hackshed.dev
- relay.nostr.blockhenge.com
- relay.flashapp.me
- relay.bullishbounty.com
- relay.nostrmap.net
- relay.novospes.com
- relay.aarpia.com
- nostr.stakey.net
- relay.grigic.org
- nostr.chaima.info
- relay-dev.gulugulu.moe
- nostr.rblb.it
- nostr.christiansass.de

Their live medians were 180-640 ms. They are hobby or company-side relays with no track record measured here, so they suit only a long fallback list. Exceptions:

- relay.nostr.dev.br took 9 s to answer OK and missed 2 of 3 live deliveries.
- cdn.satellite.earth accepted the deletion but kept the event.
- relay.kaleidoswap.com and relay.degmods.com timed out on the 8k/16k reads.
- relay.piazza.today, like ditto, keeps every version.

### 2.2 Relays to exclude, with the exact relay answers

| Relay | What happened | Exact message(s) |
|---|---|---|
| relay.damus.io | HTTP 503 from Cloudflare on most WebSocket upgrades:<br>• 8 of 24 attempts succeeded, with or without an Origin header (`results-2026-10-21-origin-relay_damus_io.json`)<br>• 0 of 4 from a real browser<br>When connected, it accepted all writes, then rate-limited | `["OK", <id>, false, "rate-limited: you are noting too much"]` (6th event within about 10 s, run 2). Unverified whether the 503s are an outage or a per-IP limit triggered by this probe |
| nostr.wine | Paid | `restricted: sign up at https://nostr.wine to write events to this relay` |
| nostr.land | Paid | `restricted: Pay on https://nostr.land for access.` |
| relay.nos.social | Kind blocked | `blocked: kind not allowed` |
| purplepag.es | Kind blocked | `blocked: kind 30078 is not allowed` |
| nostr.einundzwanzig.space | Needs NIP-05 | `blocked: NIP-05 verification needed to publish events` |
| nostr21.com | NIP-11 says payment_required. Silent rejection | `["OK", <id>, false, ""]` |
| relay.fountain.fm | Black hole: OK for writes, nothing served | write: `["OK", <id>, true, "OK"]`; read: `["CLOSED", <sub>, "kinds not supported"]` |
| relay.nostrcheck.me | max_content_length 8,196. Accepted events were invisible to reads for at least 20 min: run-2 events were still missing at 0.5 h; run-1 events appeared by 0.5 h, all 3 versions, so no replacement | `["NOTICE", "blocked: event content too large"]` for 16 KB |
| 0x-nostr-relay.fly.dev | Server error | `error: relay experienced an error trying to publish the latest event` |
| relay.nostr.band, nostr.fmt.wiz.biz, relay.verified-nostr.com, relay.bitmacro.cloud | Connection timed out (10 s); NIP-11 timed out too | - |
| relay.nostr.bg, relay.0xchat.com | DNS name does not exist (ENOTFOUND) | - |
| relay.lumina.rocks, nostr.robosats.org | HTTP 502 Bad Gateway | - |
| relay.mostr.pub | HTTP 301 to `https://relay.ditto.pub/`. Browsers' WebSocket does not follow redirects | - |
| bendernostur.duckdns.org:8443 | Connect failed | - |
| relay.routstr.com, relay.layer.systems, nostrcity-club.fly.dev | Partial: no OK within 10 s for some events, or the read connection failed | `no OK within 10s` (probe timeout) |

---

## 3. Nostr findings in detail

### 3.1 Acceptance and the exact OK / NOTICE / CLOSED messages

- **Good relays answered with an empty message.** Each write got `["OK", <id>, true, ""]`. relay.fountain.fm said `"OK"`, and relay.nostrcheck.me answered the deletion with `"deleted: events successfully deleted (kind 5)"`.
- **Every relay message ever seen is stored.** It is in `messagesA/B/C` per relay in the raw files.
- **No relay sent an AUTH challenge that blocked anything.**
  - cdn.satellite.earth and relay.kaleidoswap.com sent `["AUTH", <challenge>]` on connect, but served reads and accepted writes without it.
  - No write or read was refused with `auth-required:`.
- **No relay asked for proof of work.**
  - NIP-11 `min_pow_difficulty` was 0 or absent everywhere.
  - No `pow:` rejection was seen, so the miner in the probe never ran.
- **Strangers can read the list.** Strangers can read a list's ciphertext if they know its `d` tag, even without the author's key. A query `{kinds:[30078], '#d':[d]}` without `authors` returned the event on every relay that stored it (`readD1NoAuthor`). The content must therefore stay encrypted; ListoSync's AES-GCM does that (`old/checkpoint1/src/sync.js:57-62`).

### 3.2 Read-back and replacement

- **Read-back.** On the 28 full-pass relays, a fresh connection got the newest version immediately.
- **Replacement.** NIP-01 says relays MUST keep only the latest event per kind + pubkey + `d` tag ([NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), section on addressable events).
  - All strfry, nostr-rs-relay, memlay and nostream relays did this.
  - **relay.ditto.pub and relay.piazza.today (both Ditto) returned all 3 versions.** relay.nostrcheck.me also showed all 3 once they appeared.
  - So the client must always pick the event with the highest `created_at`, never "the first one received".

### 3.3 Live latency (publish on connection 1, arrive on connection 2)

- **Median live latency per relay:**
  - relay.ditto.pub: 77 ms
  - relay.snort.social: 190 ms
  - offchain.pub: 196 ms
  - relay.primal.net: 247 ms
  - relay.coinos.io: 274 ms
  - relay.nostr.net, nostr.mom, nostr.data.haus, nostr.oxtr.dev: about 300 ms
  - relay.nostr.wirednet.jp: 348 ms
  - nos.lol: 378 ms
- **Writing to 5 relays in parallel, the other phone sees the change after the fastest one.** That is about 0.1-0.3 s from here.
- **Misses.** nos.lol missed 2 of 6 live deliveries within 10 s in run 1. relay.nostr.dev.br took about 9.5 s.

### 3.4 NIP-11 limits (`limitation` fields)

- **No relay published a `retention` field.** Checked on every relay whose NIP-11 document loaded.
- **Message size is no problem.** `max_message_length` among good relays:
  - 65,536 (blockhenge)
  - 131,072 (most strfry, including nos.lol, nostr.mom, oxtr, wirednet, data.haus)
  - 262,144 (relay.nostr.net)
  - 524,288 (snort)
  - 1,000,000 (primal, damus)
  - 2,097,152 (coinos)
  - 4,000,000 (ditto)
  - A list event of about 11 KB fits everywhere except relay.nostrcheck.me (`max_content_length` 8,196).
- **`created_at` limits exist.**
  - `created_at_upper_limit` (seconds into the future): 30 at nostrcheck, 300 at nostr.wine, 900 at ditto and nostr21.
  - So a phone whose clock runs ahead can be rejected.
- **Paid relays say so.** `payment_required: true` on nostr.wine (admission fee 18,888,000 msats), nostr21.com and nostr.land.
- **relay.snort.social reports `idle_timeout: 10`.** Its idle subscription still survived 300 s; Node answers server pings automatically, as browsers do.

### 3.5 Deletion (NIP-09)

- **Test.** A kind 5 event with tags `["a", "30078:<pk>:<d>"]`, `["e", <id>]` and `["k","30078"]`.
  - It was accepted on every full-pass relay, and the event disappeared from reads.
  - Exception: cdn.satellite.earth accepted it but kept serving the event.
- **Revival risk.** NIP-09 says relays delete all versions "up to the `created_at`" of the deletion request ([NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md)). So a phone that later publishes a newer version brings the list back.
- **Rate limit.** damus rejected the deletion with its rate-limit message.

### 3.6 Spam filters and rate limits seen with fresh keys

- **Web of trust.**
  - offchain.pub and nostr.bitcoiner.social sometimes refuse events from keys nobody follows: `Policy violated and pubkey is not in our web of trust.`
  - The pattern was not deterministic. Some 2 KB and 16 KB events got through and some 2 KB and 8 KB events did not, within the same minute.
- **Rate limit.** relay.damus.io sent `rate-limited: you are noting too much` after about 6 events in 10 s.
- **Connections per IP.**
  - nos.lol: 5 simultaneous connections opened, but they took 0.6-7.8 s. Back-to-back reconnects 1.5 s apart failed twice in rechecks.
  - damus: 3 of 5.
  - primal: 5 of 5. snort: 5 of 5.
  - Two phones on the same home Wi-Fi share one IP, so this matters.

### 3.7 Idle connections

A live subscription left silent for 300 s still delivered a new event on 10 of 14 relays (`results-2026-10-21-idle.json`):

- nostr-pub.wellorder.net dropped it at 30 s (close code 1006).
- relay.nostr.wirednet.jp dropped it at about 300 s.
- nos.lol's subscriber could not connect.
- relay.damus.io's publisher could not connect.

The app needs a reconnect-on-close plus a light keepalive (for example re-sending the REQ every 25-60 s), and a reconnect whenever the page becomes visible again.

### 3.8 Retention: indirect evidence and first persistence re-checks

- **Old app data is still served.** Kind 30078 events are replaced, never appended, so an old date means that key's data has sat untouched that long. Only dates were recorded.
  - Older than 3 years: nostr.mom, nostr.data.haus, relay.nostr.wirednet.jp, relay.ditto.pub.
  - Older than 2 years, but nothing older than 3 years (data starting around Aug-Oct 2024, which suggests a database start or a prune then): relay.primal.net, nos.lol, relay.nostr.net, relay.coinos.io, offchain.pub.
  - Nothing older than 1 year: relay.snort.social (in-memory) and nostr-pub.wellorder.net.
- **Persistence of our own events.**
  - Three re-checks at 0.1-0.9 h (`recheck-nostr-2026-10-22T05-09.json`, `...T05-24.json` and the 05:30 UTC run) found every full-pass relay still serving the probe's newest events.
  - The only misses were connection errors (nos.lol, damus) or slow queries (nostr.mom, oxtr, degmods), and each of those relays served the data on a later re-check. damus did too, once it accepted a connection (0.5 h).
  - fountain.fm never served anything. nostrcheck.me showed run-1 events at 0.5 h but run-2 events were still missing at 0.5 h.
  - The "after hours" check is still to run (section 8).
- **No relay promises retention.** None publishes a retention policy, and none was found on the web (searched; no result). Treat every relay as best effort and keep the phone's own copy as the real master.

### 3.9 Real-browser cross-check

- **Setup.** From the Claude desktop app's built-in Chromium browser (Chrome/152) on https://vdm285.github.io/listolista/, 4 rounds of WebSocket connects (`results-2026-10-21-browser-connect.json`).
- **Connect times (ms):**
  - relay.primal.net: 567-861
  - relay.nostr.net: 729-805
  - relay.coinos.io: 397-1,380
  - relay.ditto.pub: 207-794
  - nos.lol: 646-2,153
  - nostr.mom: 592-1,705, plus 1 timeout
  - relay.damus.io: **4 of 4 errors**
- So damus's failures are not caused by Node.

### 3.10 Library weight for the browser

- WebCrypto cannot sign Nostr events (secp256k1 Schnorr), so a small library is needed. Sizes measured with esbuild 0.25.10, minified:
  - `nostr-tools/pure` (finalizeEvent, getPublicKey, verifyEvent): 26,670 bytes, **11,136 gzip**.
  - `@noble/curves` schnorr + `@noble/hashes` sha256 alone: 32,656 bytes, 13,011 gzip.
  - For comparison, mqtt.js 5.16.1 `mqtt.min.js`: 340,797 bytes, **105,050 gzip**.
- **Licenses:** nostr-tools 2.25.2 Unlicense; @noble/curves and @noble/hashes 2.4.0 MIT (package.json of the installed copies).
- The WebSocket protocol itself needs no library.

---

## 4. Public MQTT brokers over secure WebSocket

### 4.1 Measurements

| Broker (URL) | Connects (MQTT 5) | Connect median / max (ms) | Retained 2 KB and 8 KB, new client | Replaced by newer retained | Wiped by a stranger's empty retained publish | Latency QoS0 / QoS1 median (ms), max | Largest payload delivered | Limits announced in CONNACK |
|---|---|---|---|---|---|---|---|---|
| EMQX `wss://broker.emqx.io:8084/mqtt` | 5/5 | 517 / 669 | yes, 81-130 ms after subscribe | yes | **yes** | 75 / 75, max 120 | 256 KB (1 MiB: no PUBACK, publisher disconnected) | maximumPacketSize 1,048,576; receiveMaximum 32; retainAvailable true |
| HiveMQ `wss://broker.hivemq.com:8884/mqtt` | 5/5 | 1,171 / 1,212 (4.9-5.6 s in rechecks) | yes, 166-169 ms | yes | **yes** | 176 / 173, max 316 | 1 MiB | receiveMaximum 10; no packet size given |
| Mosquitto `wss://test.mosquitto.org:8081/mqtt` | 5/5 | 965 / 1,097 | yes, 169-187 ms | yes | **yes** | 172 / 170, max 203 | 256 KB (1 MiB: connection closed) | maximumPacketSize 2,000,000; receiveMaximum 10 |
| EMQX China `wss://broker-cn.emqx.io:8084/mqtt` | 5/5 | 515 / 1,343 | yes | yes | **yes** | 74 / 76 | 256 KB | identical to broker.emqx.io; whether it is the same cluster is unverified |
| TBMQ demo `wss://demo.tbmq.io:443/mqtt` (username `demo`, no password, as published) | 5/5 | 853 / 1,107 (one 5.2 s) | yes (focused test: read after 3 s and 30 s) | - | **yes** | 254 / 232, **max 3,298** | 16 KB (64 KB: no PUBACK) | maximumPacketSize 65,536; serverKeepAlive 30 |
| Coreflux `wss://iot.coreflux.cloud:443/mqtt` | 4/5 | 4,136 / 11,935 | yes after 3 s; reader connect timed out at 30 s | - | **yes** | 178 / 180, max 804 | 1 MiB | - |
| Eclipse `wss://mqtt.eclipseprojects.io:443/mqtt` | 0/4 | CONNACK timeout (12 s) | - | - | - | - | - | WebFetch to the site got ECONNREFUSED on 443 |
| `wss://broker.mqttgo.io:8084/mqtt`, `wss://public.mqtthq.com:8084/mqtt` | 0/2 each | DNS name does not exist | - | - | - | - | - | - |
| shiftr.io `wss://public.cloud.shiftr.io` (no credentials) | 0/2 | `Connection refused: Not authorized` | - | - | - | - | - | needs the shared public/public login. Not tested: entering passwords is outside this probe |

- **Persistence.** All retained messages were still there at 0.5 h and 0.8 h (`recheck-mqtt-*.json`).
- **Cleanup.** They are left in place for the long re-check. `node scripts/mqtt-recheck.mjs mqtt-persistence-2026-10-21.json mqtt-persistence-2026-10-21-retained.json --wipe` deletes them afterwards.

### 4.2 Terms of use (paraphrased; full pages saved in `probes\docs\`)

- **HiveMQ** ([mqtt-dashboard.com](https://www.mqtt-dashboard.com/), fetched 2026-10-21; saved as `docs/hivemq-public.html`).
  - The broker is for learning and testing the protocol. It "must not be used in Production", nor in dev, staging or UAT environments.
  - HiveMQ promises no uptime, and updates may lose messages.
  - It may disconnect or ban users at any time.
  - It disclaims performance and warranties.
  - Anyone can use it, so no sensitive or personal data.
  - Illegal use and sanctioned users are forbidden.
  - The page also showed a monitoring-outage banner during this session.
- **test.mosquitto.org** ([test.mosquitto.org](https://test.mosquitto.org/), saved as `docs/mosquitto-test.html`).
  - Free for any application, but don't abuse it or rely on it for anything important.
  - It often runs unreleased or experimental code and may be slow (valgrind/perf).
  - WebSockets and TLS are the features most likely to be unavailable.
  - Clients should cope with broker restarts.
  - Don't publish anything sensitive.
  - Unauthenticated clients may publish to all topics and subscribe to everything except the literal `#`. The username `wildcard` allows `#` for 20 seconds, for topic discovery.
- **EMQX** ([emqx.com public broker page](https://www.emqx.com/en/mqtt/public-mqtt5-broker), saved as `docs/emqx-public.html`).
  - Presented as a place to prototype, learn and test.
  - It warns that all messages are visible to other users.
  - No retention, rate-limit or uptime statement was found on the page.
  - The site's general Terms of Use were not read (unverified whether they say more).
- **Eclipse** ([iot.eclipse.org sandboxes](https://iot.eclipse.org/projects/sandboxes/), via WebFetch).
  - The community runs it, and it must not be used for any commercial purpose.
  - Everything stored is public and unencrypted.
  - Operators may ban inappropriate use.
  - The broker did not answer today.
- **TBMQ demo** ([terms](https://tbmq.io/product/terms-of-use/), via WebFetch).
  - All data counts as public.
  - Storage of retained messages and sessions is not guaranteed, and data may be wiped periodically.
  - The service can be rebooted or taken offline without notice.
  - Stress or load testing and excessive client counts are forbidden.
  - IPs or client IDs may be blocked.
- **Coreflux** ([coreflux.org](https://www.coreflux.org/free-public-mqtt-broker), via WebFetch).
  - No signup.
  - All messages are visible to all clients.
  - Not for production.
  - No retention or limits statement.

### 4.3 What this means for ListoLista

- **Speed is not the problem.** EMQX is the fastest endpoint measured.
- **Retained messages are not a safe store.**
  - Anyone who knows or guesses the topic can delete the list. Encryption stops forgery and reading, not deletion.
  - On Mosquitto, topics can be listed with the `wildcard` username.
- **Every operator says not to build on it.**
- **Weight.** mqtt.js is about 105 KB gzip. A hand-written MQTT 3.1.1 client over WebSocket would be small (proposal, not built).
- **Verdict.** At most an emergency fallback, not part of the core set.
- **The current app.** The live app's use of HiveMQ (`old/main/index.html:260`) conflicts with HiveMQ's terms. It is also plaintext: no `crypto.subtle` or AES anywhere in `old/main/index.html`; the topic is `listolista/v2/${room}/data` at line 366, and the retained publish is at line 637.

---

## 5. Old Cloudflare relay (read-only check)

Routes in `old/checkpoint1/relay/src/index.js`:

- `/health` (line 31)
- `/r/<22-character room id>` (lines 17, 32-33), which needs a WebSocket upgrade (line 34) and an allowed Origin (line 35; the allowed list is `wrangler.jsonc:8`)
- everything else returns 404 (line 33)

| Request (2026-10-22 04:58 UTC) | Expected from code | Got |
|---|---|---|
| GET `/health` | 200 `ok` | 200 `ok`, 789 ms (cold), Cloudflare colo DFW |
| GET `/` | 404 | 404 `not found` |
| GET `/r/<random id>` without upgrade | 426 | 426 `expected websocket`, 87 ms |
| GET `/r/short` | 404 | 404 |
| Upgrade with `Origin: https://example.org` | 403 | 403 `forbidden` |
| Upgrade with `Origin: https://vdm285.github.io` | 101 | 101 |
| WebSocket session, then `ping` | `{"t":"snap","v":0,"blob":null}`, then `pong` | open 89 ms; snap at 94 ms; pong at 154 ms |

- **Nothing was written.** No `put` was sent. Opening an unused room only reads storage (index.js:56-63) and sets no alarm.
- **It is the fastest endpoint measured, and it has compare-and-set.** But it is something Victor runs on his own account, so it falls outside the "nothing the owner must run" rule.
- **Options:**
  - Retire it (it holds at most the checkpoint-1 test data; that was not checked, since reading a room needs its secret).
  - Or keep it strictly as an optional extra mirror that the app does not depend on.
- **Decision for Victor.**

---

## 6. Recommendation

### 6.1 Endpoints: write to and read from all five in parallel

| Role | Relay | Why |
|---|---|---|
| Core 1 | `wss://relay.primal.net` | 18/18 connects, 247 ms live, 1 MB message limit, data older than 2 years still served, run by a company |
| Core 2 | `wss://relay.nostr.net` | 13/13, 299 ms, data older than 2 years, 256 KB limit |
| Core 3 | `wss://nostr.mom` | 13/13, 302 ms, **data older than 3 years**. Use one `d` per filter (it was slow on multi-value filters) |
| Core 4 | `wss://relay.coinos.io` | 13/13, fast connect (338 ms median, 388 ms max), 274 ms live, data older than 2 years, 2 MB message limit |
| Core 5 | `wss://relay.ditto.pub` | **Different software** (Ditto, not strfry), so one strfry bug or policy change can't take out all five. Fastest (77 ms), data older than 3 years. It keeps every version, so take the newest |
| Fallbacks, in order | `wss://nos.lol`, `wss://nostr.data.haus`, `wss://relay.nostr.wirednet.jp`, `wss://nostr.oxtr.dev`, `wss://nostr-01.yakihonne.com` | All passed everything. nos.lol was flaky on rapid reconnects from one IP |
| Avoid as a store | relay.snort.social (in-memory), nostr-pub.wellorder.net (drops idle connections at 30 s, no data older than 1 year), offchain.pub and nostr.bitcoiner.social (web-of-trust throttling), relay.damus.io (503s, rate limit) | see section 2 |

Four of the five core relays run strfry. They are different operators, but one strfry policy change, such as enforcing the NIP-78 AUTH rule, would affect all four at once. Ditto is in the set for that reason.

### 6.2 Protocol rules (proposal; each rule is backed by a finding above)

1. **One addressable event per list.**
   - kind 30078.
   - Tag `["d", <opaque id derived from the link secret>]`. Not an app name, so ListoLista lists can't be enumerated.
   - Content = the existing AES-GCM blob, padded (`old/checkpoint1/src/sync.js:45-62`).
   - Keep it under about 12,000 characters (section 3.4).
2. **Signing key derived from the link secret** (HKDF, as `sync.js:32-43` already derives the room id and keys). Every phone with the link signs as the same author:
   - only link holders can replace or delete the list (3.2, 3.5);
   - phones can answer NIP-42 AUTH if relays start enforcing the new NIP-78 rule (bottom line 5).
3. **`created_at = max(now, newest created_at seen + 1)`.** Replacement goes by `created_at` (NIP-01), so a phone with a slow clock would otherwise never win. Never more than a few seconds in the future, because relays reject far-future events (3.4).
4. **Never trust one relay's answer.**
   - Publish to all five. Count a write as safe after 2 or more OKs and one successful read-back.
   - Drop a relay that answers OK but never serves (3.1, fountain.fm and nostrcheck).
   - On read, merge all copies; the per-item merge in the app decides, not relay order (ditto keeps every version, 3.2).
5. **Be gentle.**
   - Combine keystrokes into at most one publish per list every 2-3 s.
   - Don't re-publish an unchanged state.
   - Back off on `rate-limited:` and `restricted:` answers.
   - Keep one connection per relay per phone (3.6).
6. **Keep connections alive.** Reconnect on close and when the page becomes visible, and keep alive lightly (3.7).
7. **The phone's local copy is the master.** No relay promises retention (3.8). Any phone that opens the list re-publishes the merged state if a relay is missing it, which also refreshes lists that have sat unused for a long time.

---

## 7. Risks

| Risk | Evidence | Mitigation |
|---|---|---|
| **The rules may tighten**: NIP-78 now says relays SHOULD require AUTH for kind 30078 and serve it only to its author | [NIP-78 text](https://github.com/nostr-protocol/nips/blob/master/78.md), commit 6aeea609 of 2026-09-03; objection [#2473](https://github.com/nostr-protocol/nips/issues/2473) open since 2026-09-20 | Derived shared key, so phones can authenticate as the author. Watch strfry releases |
| **Spam filters on new keys** | web-of-trust rejections (offchain.pub, nostr.bitcoiner.social); damus rate limit; nos.lol says it refuses "spammy" notes | Five relays plus a fallback list; throttle writes; one event per list |
| **Relays disappear or change** | 10 of 58 relays were down, gone from DNS, or redirecting today, among them the formerly major relay.nostr.band | App-side relay list with health tracking; re-publish to replacements |
| **Retention is unpromised** | no NIP-11 `retention` anywhere; snort in-memory; wellorder nothing older than 1 year; others data older than 2-3 years | Local master copy; re-publish on open; long-term re-checks (section 8) |
| **Metadata** | relays see IP, per-list key, timing and size; anyone with the `d` tag can fetch the ciphertext (3.1) | Opaque `d`; padding; the link is the key. Stored ciphertext would become readable if a link leaked |
| **Per-IP connection limits** | damus 503s; nos.lol slow or failed back-to-back connects (3.6) | One connection per relay per phone; prefer relays that showed no limit |
| **Clock skew** | `created_at_upper_limit` 30-900 s; replacement is ordered by `created_at` | Rule 3 in 6.2 |
| **MQTT (if used at all)** | terms say not for production, or don't rely on it; a stranger wiped retained data on all 6 brokers; Mosquitto lists topics | Do not use as the store |
| **Measurements come from one place** | one PC in Mexico, one evening, two probe runs per major relay | Re-run from a phone on 4G; repeat the persistence checks (section 8) |

---

## 8. How to re-check persistence later

Run from `D:\_GitHub\listolista\data\cache\probes`. Each run writes a time-stamped `recheck-*.json`.

```
node scripts/nostr-recheck.mjs nostr-persistence-2026-10-21.json nostr-persistence-2026-10-21-run2.json nostr-persistence-2026-10-21-trystero.json
node scripts/mqtt-recheck.mjs mqtt-persistence-2026-10-21.json mqtt-persistence-2026-10-21-retained.json
# last time only, to delete the probe's retained MQTT messages:
node scripts/mqtt-recheck.mjs mqtt-persistence-2026-10-21.json mqtt-persistence-2026-10-21-retained.json --wipe
python -I scripts/aggregate.py   # refresh results-2026-10-21.json with the new recheck files
```

- **What was published.** Run 1 at about 04:36 UTC, run 2 at about 04:58 UTC, the Trystero set at about 05:02 UTC, MQTT at about 04:37 and 04:55 UTC (2026-10-22).
- **Useful re-check ages:** 6 h, 24 h, 7 days, 30 days.
- **Clean-up on Nostr.** Two kinds of probe events are left there:
  - The 16 KB events from run 1 carry a 3-day NIP-40 expiration tag.
  - The others have none, on purpose: they test what the app would really send.
  - They can be deleted later with a NIP-09 request signed by the saved throwaway keys.

---

## 9. WebRTC via public signalling (Trystero), from the docs only

- **Version.** Trystero 0.26.0 (npm, published 2026-10-04, MIT).
- **How it connects.** It finds peers through Nostr, MQTT, BitTorrent, IPFS, Supabase, Firebase or a self-hosted relay. After that, data goes directly peer to peer and end-to-end encrypted ([README](https://github.com/dmotz/trystero), saved as `docs/trystero-README.md`).
- **Defaults** (`docs/trystero/*.mjs`):
  - Nostr: 29 small relays with redundancy 5. Signalling uses ephemeral kinds: kind = 20000 + a hash of the topic.
  - MQTT: EMQX, HiveMQ and Mosquitto with redundancy 4.
- **No persistence of its own.** The README suggests a server-side always-on peer for remembering the last state. A list written at home while the other phone is off would not arrive.
- **Mobile networks need TURN.** The README says some networks block direct connections and recommends a TURN server. It names Cloudflare (free tier, 1,000 GB a month) and Open Relay. Both need an account and credentials, and Cloudflare's credentials have to be minted by a server, so neither is keyless and both are something to run.
- **Verdict.** Not practical as ListoLista's transport. An optional "both phones online" boost would save at most about 0.2 s over the Nostr live path, so it is not worth the code. Nothing in this section was tested.

---

## 10. Unverified or limited

- Whether relay.damus.io's 503s are a general outage or a limit on this IP triggered by the probe. A real browser also failed 4 of 4.
- Whether EMQX China is the same cluster as broker.emqx.io. The CONNACK properties are identical.
- EMQX's general Terms of Use (not read). shiftr.io with its shared login (not tested).
- Retention beyond 0.9 h for our own events. The scripts and keys for later checks are saved.
- Behaviour from a phone on a mobile network, behind carrier-grade NAT. Only Wi-Fi and a desktop were tested.
- The cause of the web-of-trust throttling pattern on offchain.pub and nostr.bitcoiner.social. It looks like a rate quota, but that is not confirmed.

## Files

Scripts:

- `D:\_GitHub\listolista\data\cache\probes\scripts\nostr-probe.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\mqtt-probe.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\mqtt-retained.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\nostr-recheck.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\mqtt-recheck.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\old-relay-check.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\idle-test.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\retention-sample.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\nostr-single.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\concurrency.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\damus-origin.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\upgradediag.mjs`
- `D:\_GitHub\listolista\data\cache\probes\scripts\aggregate.py`

Results:

- `D:\_GitHub\listolista\data\cache\probes\results-2026-10-21.json` (merged, raw included)
- `D:\_GitHub\listolista\data\cache\probes\results-2026-10-21-*.json` (individual runs)
- `D:\_GitHub\listolista\data\cache\probes\recheck-*.json`
- `D:\_GitHub\listolista\data\cache\probes\nostr-persistence-2026-10-21.json`, `-run2.json`, `-trystero.json` (throwaway keys, `d` tags, event ids)
- `D:\_GitHub\listolista\data\cache\probes\mqtt-persistence-2026-10-21.json`, `-retained.json`, `-extra.json`

Saved specs and terms:

- `D:\_GitHub\listolista\data\cache\probes\docs\` (NIP-01/09/11/13/40/42/44/78, Trystero README and sources, HiveMQ, Mosquitto and EMQX pages)
