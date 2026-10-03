# Synchronization candidate acceptance, 3 October 2026

This is a release gate register, not a production success report. Production
remains unchanged. The latest private pool continues private history only.

| Gate | Evidence | Verdict and limit |
|---|---|---|
| Four copies of the same house archetype alongside its tournament | `five-concurrent-4.json`, ended 09:24:17 UTC; 400 controls, 17.807 seconds of common play, all five results published and captured | Pass for this bounded synthetic scenario; zero protective pauses. Not a 24-hour or browser result. Earlier three failures remain failures. |
| Confirmed commands, p95 at most 300 ms | Four trial4 clients: 212.36, 214.15, 212.22 and 206.53 ms | Pass for synthetic clients. Physical input and browser rendering remain unverified on these final changes. |
| Pause when the human stops sending presence | Rules16 Solidity tests and earlier hosted disconnection/resume evidence | Contract protection is implemented; do not extrapolate its coverage to public rules15. Browser/F5 and final concurrent soak remain required. |
| Launch hydration | Reproduced baseline failure, bounded authoritative-header refresh in d1008a3, trial4 zero pauses | Pass for the measured clients. Events never manufacture a playable header. |
| Current physics equals TypeScript | VPS isolated Anvil run completed 09:57:05 UTC: 10,000 current Chaos plus 10,000 adversarial simultaneous cases, zero mismatches | Pass for 4da2534 kernel artifacts. Not hosted performance proof. |
| Historical physics compatibility | Same run: 10,000 Classic, 10,000 realtime Chaos and 4,000 historical-mode cases, zero mismatches | Pass. Historical decoders and addresses remain preserved. |
| 24 Chaos effects and 276 pairs | 156 Chaos Solidity regressions pass with the contact-search extraction | Pass for regression scope. Hosted draw coverage still belongs to its recorded earlier trials. |
| Contract work reduction | Identical 20-tick digests; compared with 579cbb9, Chaos 25,037,861 to 23,954,900 gas and Solar Wind 104,466,538 to 98,168,525 | Local execution reduction only. No faster wall-clock claim. |
| Game clock at 98–102% of real time | Earlier tick300 Chaos 97.58565%; tick500 97.240506%; physics followed engine block time | **Fail.** New kernel needs a real hosted comparison. No clock multiplier or altered time accounting is permitted merely to pass. |
| Four tournament formats | T8 Chaos championship 28/28, T9 Classic elimination 7/7, T10 retry Chaos elimination7/7 and T11 Classic championship28/28 at11:57:37 all passed | Pass for the recorded queue candidate. Preserve T10 attempt1 failure from the missing intermission wait. The lower-gas successor has not played these formats yet. |
| Real catalogue to countdown, p95 at most 8 seconds | Previous six actual catalogue games took 9.9–11.1 seconds. Browser harness now accepts only a verified imported velocity continuation when explicitly selected;11 focused tests/typecheck pass | **Fail.** Target guard preparation is not a new browser measurement. Startup approval remains blocked and the current target remains unimported. |
| Local input at most 50 ms; no unexplained spectator freeze over 500 ms; desktop/mobile render bounds | Previous Classic32 holds reached 800/616 ms. Later read-only projection checks are not browser/GPU proof | **Not passed.** Candidate browser server startup on 127.0.0.1:4197 remains blocked by automatic approval review. Do not launch an alternative to bypass it. |
| Five agents plus two human games | Earlier synthetic seven-way advancing overlap of 5.620 seconds and separate natural human results/payouts | Bounded overlap only. Repeat on the frozen candidate for the complete service trial. |
| Publication and worst-case release reserve | Real prior private releases; exact-v3-bytecode fork preserves state after 16,000 dense batches. Canonical five-arena cost window: 146 commits, 14.828953086 MON, 664 seconds, maximum 30,916 calldata bytes | Partial. The window contains only 17.807 seconds of five-way play. No daily budget follows from this short workload. Final reserve and staggered rotation remain required. |
| Compatible public migration | Private continuations verify their own data; no public mutation in this operation | Not performed. Private history must never substitute for public identities, ratings, pending requests or historical routes. |
| Historical index and stored replays | Duplicate archive aliases fixed in5027cd9;33 tests/typecheck/offline Envio pass. Separate four-season index matches254 canonical results at67823666; all75 retained replays from66 players decode and match canonical terminal results at67824066 | Pass for index, retention and stored frames. All temporary services stopped12:04. Not browser playback/rendering or a public index migration. |
| Restorable off-VPS backup | Expanded1204 has24 SHA-verified off-VPS files. At12:28:05, all12 dumps uploaded back from that copy restored successfully into network-isolated scratch DBs;254 index rows and75 replay byte hashes/frame counts match their canonical proofs;12 preparation transactions preserved | Pass for1204. Scratch DBs dropped after verification, container stopped exit0/no OOM. Refresh after actual release and repeat the final restore gate before cutover. Recovery still mounts1157. |
| Unchanged 24 hours, all-role costs/traffic/storage/render and no renewal outage | No final trial started | **Not passed.** Material changes restart that trial. |

The runnable record, original worker deadlines and exact container/source hashes
are in `sync-release-20261002.md`. No table row authorizes a new lifecycle writer,
an early closure, a public migration or a deadline extension.
