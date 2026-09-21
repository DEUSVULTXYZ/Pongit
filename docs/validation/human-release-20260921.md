# Human release review, 21 September 2026

This review concerns human Classic and Chaos, rules 14. Agent Arcade and its
tournaments remain private. Their unfinished 24-hour trial is not a human test
result and is not represented as passing.

## Deployment and migration

The public web uses `0c44f08`; the service uses `7952580`. Both use the new sealed
lobby `0x5dbea9692d443e04e1bd0b74fb307b079a5cb212`. The three human arenas are:

| Index | Arena |
| --- | --- |
| 0 | `0x596562d63e678a2b391ff01f63cf7ded99fc2c25` |
| 1 | `0xa429e8e01c4b57dddfc6e8c75094cb68333f7f2f` |
| 2 | `0x9bc7eac922640b0a2c7544a900f50de549790de1` |

All three were admitted and observed on their actual hosted nodes. Registered
addresses alone were never counted as capacity. The source application was
released before the migration snapshot at block 64392960. Ten reserved profiles
and six rating entries were checked against their new registries at block
64394468. Migration evidence is
`0xd2d9453c9950af90d528ec7c9d5df5908a522a1fa5899c3e0429f7087bd66345`.

The production business database was restored from the stopped qualified
service. Counts and ordered row digests match for all 21 tables. Operator nonce
ownership remains in the original database and advisory lock 701340. Legacy
contacts and results still read the original database. Historical deployments,
balances and withdrawal interfaces remain intact.

## Storage and release envelope

This is a source census combined with real-runtime fork measurements, not an
inference from a short game's batch count:

- Physics and controls always address physical slot 1. Logical match IDs only
  occur in values, signed references and events.
- Conservatively reserve all 63 namespace-0 fields, including currently unused
  fields. Admission clears and reuses them; forces, multiple balls, pending
  inputs, randomness indices and owner key renewals do not allocate new keys.
- The result accumulator uses 19 namespace-6 keys: epoch, count, root and a
  sixteen-level frontier. These keys are reused in every epoch.
- The reachable human paths do not call the historical per-player rating or
  per-key control-registration functions. Ratings are outside delegation.
- The inherited session wrapper uses transient actor storage. Lifecycle writes
  remain restricted to the Monad authority. It cannot authorize a control call
  as an arbitrary participant.

Therefore the conservative delegated overlay envelope is **82 distinct mapping
keys**, independent of a rally's duration, command count or earlier match IDs.
For publication within an epoch, fields 39–53 cannot become nonzero through
these entry points. At most 48 other physical fields and three result-append
fields can change between result publications. The next ticket requires the
previous published commitment. This leaves a conservative 51-word envelope
below the provider's 64-word publication limit. The epoch reset itself happens
on Monad before opening, not as an Interlude command.

The exact sampled hub runtime hash is
`0x9380248d1c5debacf028290ca54271acd79f68eedfd91dbc9e605ec19937d8da`.
An isolated read-only fork at block 64253748 released **16,000 batches over 86
reused keys**, with a dense 1,024-byte transaction in each batch, in **1,451,957
gas before refunds**. A separate 300-batch trial used four 2,048-byte transactions
per batch and produced the same release measurement. These tests use the actual
hub runtime with local synthetic state. They are not hosted gameplay or proof
of an arbitrary provider HTTP payload limit. Failed and incomplete earlier
trials are retained.

The proposed operating budget is 16,000 batches, with 8,000 reserved before
admitting another match, a 1,860-second time reserve and an age-rotation target
of 3,600 seconds. These are PONGIT safeguards, **not provider quotas**. The
8,000-batch reserve is not claimed as a mathematical bound on adversarial RPC
traffic. Release safety comes from the fixed key envelope, not that traffic
assumption. A running match is never discarded just for crossing a monitoring
threshold. Missing publication prevents reuse and remains an incident.

Age rotation requires three actually healthy hosted epochs, so opening a hub
session does not immediately retire another ready engine. Two other arenas
remain available while the retired one observes its actual one-hour delay.
An exhausted provider or simultaneous faults can still require waiting; this
review does not promise a service-level availability percentage.

## Actual hosted checks

- Four Chrome/Edge runs cover Classic and Chaos with real Mera, the actual new
  contracts, a spectator, 3–2–1 countdown, F5, and more than 100 accepted controls
  per player. They use virtual PRF authenticators, not physical devices.
- Four simultaneous Classic/Chaos runs exercise real randomness, betting,
  handicaps, publication, capture and automatic payment to a disconnected
  beneficiary. The latest run after the availability fix ended 7–6 and 5–7.
- A real 30-minute service interruption ended in the contract's technical
  cancellation, followed by published capture and participation recovery. This
  is explicitly **not** a continuous 30-minute rally benchmark.
- Arena 0 closed while a Chaos match on arena 1 continued to advance. Another
  complete concurrent pair then started on arenas 1 and 2 during that closure.
- A bounded canonical publication sample contains 276 commits: at most 10,564
  calldata bytes, 27 changed words and 20 commands in one sampled commit; the
  largest sampled raw command is 1,007 bytes. The sample cost 225.216 test MON.
  It is not the maximum possible HTTP response or total shared-validator cost.
- Public HTTPS notebook tests pass on Chrome and Edge: owner-authorized
  encrypted backup on Monad, lock, F5, recovery with the same passkey, and
  disconnect. The private nickname is absent from local and session storage.

## Opening gate and rollback

At this checkpoint the web/API are deployed but **human admissions remain
closed**. The production observer must release and seal arena 0 epoch 1 after
09:55:26 UTC. The sole bounded renewal helper then opens epoch 2 through the
original nonce journal and verifies the hosted epoch and base block. A new
published game after renewal, canonical release evidence, the final reviewed
budget and public smoke checks remain required before opening.

Verified off-VPS backups include the full production snapshot, the new stopped
business database, exact restore proof, secrets/configuration and the final
service replacement. The previous service and web images remain available.
Rollback disables new admissions, drains or observes existing matches, stops
the new writer before restoring an older service, and preserves both databases
and all operator journals. It never renews a retired historical application or
reassigns an old match URL to a new contract.
