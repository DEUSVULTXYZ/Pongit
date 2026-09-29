# Agent tick cadence — 29 September 2026

## Delivered change

The requested reduction of the approximately 330 ms agent tick spacing is public.
Commits `9be39b5` and `a0ebdaa` change the serial scheduler and maintenance nonce
reads. The configured interval is 100 ms; the actual measured median is **136.93
ms**, not 100 ms. This setting affects the agent engine service, not human game
rules or the human relayer. The public web remains `cafce6a`.

Previously, each loop added a fixed 100 ms sleep after its work. The loop now
waits only the remaining interval, bounded to 20–100 ms. There is no catch-up
burst or second command writer. Player progress still postpones an unnecessary
tick, and publication holds, proof ownership and retry deadlines still apply.

The first hosted test at a 150 ms setting measured 234.83 ms. A separate read-only
probe found that the VPS's paired `pending`/`latest` nonce reads took approximately
121 ms after connection warmup. The final implementation reuses the next nonce
proved by an exact, durably recorded receipt. Its validity expires one second
after the last RPC check; subsequent receipts never extend that deadline.
Errors, forced reads, observed resets, closure and restart discard this proof.
An uncertain command still reconciles its exact journal before any new command.
The existing lock and unique nonce constraint remain in place.

## Hosted evidence

Both tests used the actual public catalogue, APIs, sponsor, contracts and Interlude
engine, with the real Mera SDK and virtual PRF authenticators. They were bounded
friendly Classic challenges against NOVA, with a separate spectator. They are not
physical-passkey tests, full five-minute games or new Chaos/endurance qualification.

| Measurement | 150 ms, scheduler only | 100 ms, receipt-owned nonce proof |
| --- | --- | --- |
| Browser | Chrome | Edge |
| Match | 206 | 207 |
| Human direction changes | 20 | 20 |
| Idle observation after controls | 8 s | 4 s |
| Tick attempts | 38 | 44 |
| Tick spacing median / p95 | 234.83 / 334.07 ms | 136.93 / 315.55 ms |
| Local input p95 | 15.1 ms | 15.1 ms |
| Executed input receipt p95 | 21.1 ms | 34.3 ms |
| Render p95, player / spectator | 17.2 / 17.1 ms | 17.1 / 17.0 ms |
| Longest in-play hold, player / spectator | 150.5 / 16.6 ms | 199.9 / 0 ms |
| Initial spectator buffer | 615.9 ms | 632.9 ms |
| Snapshot-boundary jumps; frame gaps over 500 ms | 0; 0 | 0; 0 |
| Catalogue-to-countdown | 41.594 s, including initial authorization | 29.037 s, reused session |

The earlier approximately 330 ms median was observed in matches 204 and 205; see
`live-sync-header-20260929.md`. These short observations differ in mode, browser
and duration; they are not a controlled long-term latency distribution. The
315.55 ms tail means that 100 ms is not a guaranteed inter-tick interval. Neither
test demonstrates the pending 8-second admission target or prolonged fluidity.

Both fixtures were explicitly conceded through their own UI, then verified as
published in the pool at canonical Monad block **66726582**, hash
`0x12a709d4e9823d758660f24cff943f29ac289a48768e04303d22896652ffe233`:

- `10143 / 0x76CA139497ff3fA6D20b062bd5F54A5917513226 / 5 / 206`, score 0–2,
  result `0x108fd0a599902d48c557327916a97479a50a74e266da7dabbb7638424525b1b1`.
- `10143 / 0xa5f79fC906A238a80604EE5912a4A18998dC7ab4 / 5 / 207`, score 0–1,
  result `0x6d4a0ea2c676bb5cd031d1b6183c95157aac87bf1f53f8c963d533d26dd6605b`.

Both results remain contestable (`finality=false`). Each journal contains one
confirmed reverted terminal tick after concession (nonces 40 and 46 respectively).
These entries are preserved as failed, not deleted or treated as uncertain. There
are no pending fixture commands; results and both challenge slots were recovered.

Evidence is retained under `artifacts/qualification/catalogue-cadence*`,
`cadence-canonical-20260929.json` and `cadence-final-metadata-20260929.json`.
Trials 1–3 at 150 ms failed before admission: the old session expired, the first
driver missed its asynchronous dialog, and its restored virtual credential could
not reproduce PRF during renewal. Trial 4 was stopped before admission after that
cause was identified; its explicit stopped report remains. No gameplay success is
attributed to these attempts. A fresh virtual account passed; its still-valid
session was reused in Edge. Renewal of an imported virtual credential did not pass.

790 TypeScript tests, the final root typecheck and secret scan passed. Coverage
includes lost responses, nonce ownership, competing journal writers, restart,
snapshot failure/reset, epoch closure, gas refusal and publication holds. No
Solidity or physics changes were made, so this does not claim a new physics run.

## Deployment, funds and rollback

The engine image is
`sha256:9e230c480e5515d355f5da075f25d32bd091234c9f8ce78fc333fddd83ee897f`,
started **15:43:51 UTC**, with `PONG_AGENT_TICK_INTERVAL_MS=100`. The existing
Compose, scoped keys and original journals remain authoritative. The human
relayer's image, September 24 start time and zero restart count are unchanged.
At 15:48 UTC, the public API reported five ready arenas and four free friendly
lanes. No test driver remains running.

The shared publisher balance fell from 180.383509657116693993 to
**72.6715096571167 test MON** during these two short trials. This is the shared
account's balance change, not an independently attributed invoice. No transfer
was made. Stop further paid qualification until a sufficient reserve is verified;
the earlier funding/transfer-authorization request remains unanswered. This
reserve cannot support the required long qualification.

Pre-change backup `cadence-20260929T1522Z` and final backup
`cadence-final-20260929T1548Z` exist under `/opt/pongit/backups/` and have SHA-verified
copies under `C:/Users/wwwle/.codex/private-backups/pongit/`. Final hashes:

| File | SHA-256 |
| --- | --- |
| agents.dump | `4c1dc8482e5656bcc91ed643b4501ccbd3ff7d8439243fe6b45a9b167649524d` |
| operator.dump | `318a97e5b2354ad2b223e4b3151dd779180284e6257e89e24f433e484105c481` |
| runtime.tar.gz | `22e8e5d28897e338b97e8ea53874033a5a32c6e0f80dd60092953e729a8dc170` |

Rollback only the `engines` image to
`sha256:4fd0be526c4a8f75bdd3111f6b3326f14c053b91a087582323ed57cf4aba9e6e`
and its interval to 300 in the existing five-runtime Compose. The preserved
`compose.json.before-cadence-9be39b5` records that baseline. Do not overwrite newer
configuration wholesale or restore older databases over new transactions.

The protected unpublished f202/epoch 1/match 190, bot difficulty contracts,
admission delays, full Chaos/financial validation and 24-hour qualification remain
outside this compatible cadence fix. No protected match was closed or cancelled.
