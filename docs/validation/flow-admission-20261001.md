# Admission and funded result recovery, 1 October 2026

## Authorization and result recovery

The user now authorizes necessary test MON transfers from the supplied PONGIT
reserve without another per-transfer approval. This supersedes the previous
automation instruction prohibiting automatic transfers. Each transfer remains
bounded and idempotent in the original operator journal; unrelated assets,
permissions and signing keys are unchanged.

Operation `flow-funding-20261001:archive-100` transferred 100 test MON from
`0x369158Ac444278541322643E46e0D5b45ac21C4C` to the existing archive signer
`0x38078433f7a63b3e6abdef49a726599d655f42c5`. The canonical transaction is
`0x398226700c80b13c1a532b7c776cc1dce4630559413325160e02a4688a9c9b26`,
block 67128294. Gas cost was 0.002590596 MON; the reserve retained
524.974272676 MON at that block. The one-off funding process exited normally.
See `archive-refill-20261001.json`.

The existing archive service then captured both published results, without
another capture writer or a replayed match. At block 67130314, match 254 on
9b8e/12 is captured at 2-4 and match 255 on 7a45/12 at 0-7. Their result hashes
match the earlier archived proofs. Both remain contestable. The original
browser fixture still FAILS its original deadline; this later recovery does
not change that verdict. See `capture-after-funding-20261001.json`.

Before the transfer, backup `flow-funding-20261001T0138Z` was copied off VPS and
SHA-verified:

- agents.dump: `73410d73aa27ee625f449fd03ba45933bfe2da73ee66880ecf61956c91a1ac6a`
- operator.dump: `10d0206ca9303e73c077a07b20f86f3ffb303935b9027017689557ec5997ba7b`
- runtime.tar.gz: `b0b56b9e18a8ec6060c9ae5c0c83757a4064ec534d505c90b72fabedeefaf706`

## Admission measurements and candidate

The previous real Chaos trial spent about 2.5 seconds in sponsored intake.
Independent measurements reproduce slow configuration reads at 1.4-2.8 seconds.
Increasing the isolated test's CPU quota from 0.5 to 1 core did not improve its
samples consistently; production quotas were not changed.

The automatic multicall timer split the ten authority/admission reads into two
or three RPC calls. The candidate submits one explicit bounded multicall at
the observed block. It preserves every authority, lane count, arena identity,
release-evidence and admission check, plus the final canonical block-hash
verification. Nothing is accepted on a failed member or a cached gate.

Six alternating observations at block 67129864 return identical views. Before:
1,362 / 2,217 / 2,187 ms with two `eth_call` requests each. Candidate:
1,287 / 969 / 1,127 ms with one `eth_call` request each. These small samples
prove request reduction and equal observations, not the end-to-end 8-second
target. See `admission-config-batch-20261001.json`.

The browser candidate checks a saved sponsor operation every 250 ms for its
first five seconds, then every second as before, with one request at a time
and the same 45-second bound. These checks read the operation journal, not
Interlude. Errors and timeouts retain the exact saved intent.

At 01:47 UTC the shared Monad gateway had queued live and historical work;
the primary had recently throttled an `eth_call`. This is a separate RPC
observation, not an Interlude publication or 600-request/second diagnosis.
No provider configuration or human backend was changed.

## Remaining gates

Tournament 12 is still active. Progressive policies and catalogue migration
remain undeployed. The admission candidate needs built-image import checks
and actual browser qualification before its public capability is enabled.
Preserve all previous failed reports and pending operations. Hosted eight-bot
difficulty, finances, full concurrency, publication reserve and the unchanged
24-hour qualification remain required. No full-delivery claim is supported.
