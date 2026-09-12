# Hosted publication failure, 12 September 2026

The original independent-arena candidate stopped at batch 2 in complete Classic and paid Chaos browser games. A subsequent compact-command qualification on the same contracts completed both games and published multiple batches. The public site has not been migrated to this candidate.

## Compact commands, 12 September evening

An already signed commit cannot be divided into arbitrary HTTP fragments: its transaction log, raw signed transactions, roots and validator signature must agree. The public hosted API does not expose a batch byte limit or unauthenticated manual commit. We therefore reduced the transactions entering the node, before it forms a batch.

`IndependentArena` already binds each participant's limited family key before delegation. The browser now signs `input`, `tick` and `concede` directly with that key. The previous SDK path included a second signed child grant in every call to `withSession`. Removing that redundant envelope preserves the contract's actor, key expiry, active revocation, match identity and sequential input checks. It does not authorize funds, administration or arbitrary applications. Legacy arenas retain their SDK path.

The journal checks the current hub epoch, match, chain, target, signer and zero value before network submission. A lost response retains the exact signed bytes and blocks replacement until reconciliation. An unknown receipt is not a confirmed failure.

| Qualification | Observed result |
|---|---|
| Identical signed input fixture | 847 bytes with the repeated grant; 237 bytes direct, a 72% reduction. These are raw signed transaction sizes, not the full private relay HTTP request. |
| Real Classic, epoch 2 | Natural 0:7, six batches published on Monad, delegation closed. |
| Real paid Chaos, epoch 2 | Natural 3:7, eighteen batches published on Monad, delegation closed. |
| Real Chaos pressure | 0.003443407699269404 MON paid; next-rally paddle heights 96 and 72. |
| Real winning payment | 0.006 MON delivered once to the disconnected beneficiary, with no receipt signature or beneficiary transaction. |
| Real scripted inputs | 120 inputs; response p50 104 ms, p95 113 ms, p99 266 ms, measured from the VPS. This is not browser rendering latency or final settlement time. |

No 413 was observed during these compact games. Their recorded served batch documents peaked at 13,860 bytes for Classic and 8,998 bytes for Chaos. Those documents exclude the private relay envelope; they do not establish the provider's body-size limit. The terminal batch counts above are independently read from the Monad hub, including terminal batches that were published after the sampling loop ended.

Qualification also exposed a PONGIT Chaos bug: the ABI returns the phase as `uint256`/`bigint`, while financial observation compared it to a JavaScript number. Converting the phase before comparison allows a matching published pause to open its betting window, while still rejecting an earlier rally. A regression test uses real ABI encoding/decoding.

The stopped fixture's financial index was hours behind. It was caught up through every 100-block page, without resetting its cursor or skipping historical payments. The resulting test payout happened at 18:44:03 UTC, after the terminal publication at 18:37:40 UTC. This run proves an exact independent payout, not a normal hot-index payout latency.

Evidence: [game measurements](evidence/independent/compact-payload.json), [Monad verification and payment transaction](evidence/independent/compact-verification.json), [paid checkpoint](evidence/independent/compact-finance.json), [contract tests](evidence/independent/compact-contracts.txt). The test-only probes preserve authorization bytes in private VPS files, outside Git.

The subsequent HTTPS-origin Chromium run completed a third game, 7:6, with four published batches while the other two arenas were closing. It sent 342 compact transactions, observed 355 successful engine HTTP responses and no engine RPC errors. The 100 direction-key cycles per player and F5 did not request an additional root passkey. Gameplay HTTP request bodies ranged from 357 to 555 bytes. The retained journals contain sequential resolved nonces and no uncertain command: [browser record](evidence/independent/compact-browser.json), [onchain and journal verification](evidence/independent/compact-browser-verification.json).

That browser record includes one uncaught Monad profile-read error during the post-result lobby refresh. Its score/publication checks passed, but it was not an error-free run. The terminal refresh now catches that failure and leaves the saved session/result intact for the normal retry loop. After rebuilding, Chrome and Edge restored the closed 7:6 result at five viewport sizes, reopened its result actions, restored focus, survived F5 and opened the documentation, with no page errors and no requests to the stopped engine: [Chrome](evidence/independent/compact-recovery-chrome.json), [Edge](evidence/independent/compact-recovery-edge.json). This recovery check did not start a fourth full match.

Validation totals for this patch: 152 TypeScript tests passing, TypeScript compilation and production build passing, and 229 Solidity tests passing. The two gated real-hub fork tests were skipped in the local suite; the hosted executions above are separate real-network evidence. No Solidity game logic or physics constants changed.

This is an application-side payload reduction, not a change to the hosted commit interval or a general proof that its body limit cannot be exceeded. Keep the operator checklist below for any future recurrence under higher load.

The qualification services were stopped after all three arenas reached `closing`. Their epoch-2 release deadlines remain 19:27:13, 19:37:42 and 19:48:12 UTC on 12 September; closure is not being reported as completed stake release. The private journals and credentials were retained in the 19:06:50 UTC backup, with an off-VPS copy and matching SHA-256 checksums. Only the named temporary qualification containers were removed. Production containers, deployment references, databases and rollback images were retained.

## Message to the operator

We reproduced a commit-relay failure on two fresh hosted applications on Monad Testnet, epoch 1:

| Mode | App and hosted endpoint | Observation UTC |
|---|---|---|
| Classic | `0x39259f34e209Cf00D12E1576f9F9eD9CA75ca69A`, `https://il-39259f34e209cf00.fly.dev` | 2026-09-12 12:50:18, following a stopped 5:5 game |
| Chaos | `0xf44c1Eb74247547214c1901d981dd5E59601994A`, `https://il-f44c1eb742475472.fly.dev` | 2026-09-12 13:42:59, reproduced at 14:13:16 |

The outer gameplay RPC responds with HTTP 200 and a JSON-RPC error (`-32000`). The error reports the downstream publication failure:

```text
this session is over and the node is no longer accepting transactions:
batch 2 could not be settled
(commit relay failed: 413 Payload Too Large: {"error":"body too large"});
refusing further transactions so they are not promised a commit this node cannot make
```

Both nodes reported one committed batch. Classic reported five pending storage changes; Chaos reported eight. Chaos remained at 1:1 in the engine, while its Monad snapshot remained at 1:0. A root-signed test MON bet and its 72-unit paddle handicap had already executed before this second publication failed.

Please inspect the commit relay and every proxy in its path. We need:

1. The actual serialized and compressed request sizes of batch 2, including logs and proofs, and the body-size limit applied by the rejecting component.
2. A supported remedy: compatible limits throughout the path, or bounded publication chunks that preserve protocol verification. The number of storage changes alone is not the complete payload size.
3. The supported recovery procedure for a node that has already marked its session over. Accepted, unpublished commands must not be silently discarded or presented as published.
4. Confirmation that the next session can publish multiple batches during a full game, not just its first batch.

PONGIT does not hold the hosted node's `INTERLUDE_COMMIT_TOKEN`. We did not bypass its protected manual-commit route. The full rejected relay payload and its request ID are not exposed in the gameplay response we captured; we cannot determine your configured body limit from that response.

## What this does and does not show

- These two browser traces contain no HTTP 429 response. Their combined browser peak was 17 HTTP requests in a rolling second, with 665 requests in the Classic trace and 1,898 in the longer Chaos trace. Setup and recovery traffic are included. VPS traffic, other users and WebSocket frames are excluded. This is not a measurement of the endpoint's quota.
- `413` in this error concerns the commit relay's request body. It is not evidence that gameplay exceeded 600 requests per second.
- A small pending storage diff does not establish the full publication payload size. For Classic, the diagnostic JSON representation of five diffs was about 2.2 KB; logs, witnesses, serialization and relay envelopes were not included.
- PONGIT fixes now preserve the publication failure across successful reads and service restart, stop repeatedly opening an older Chaos pause, and recover only the affected arena after the hub's actual silence deadline.
- A new contract may create a fresh session, but this alone does not fix a repeatable batch-2 body-size rejection. At the time of this original incident the production deployment was retained. The compact-command qualification above subsequently passed this publication gate; the complete production migration remains separate.

Evidence: [Chaos RPC probe](evidence/independent/chaos-progress-probe.json), [browser counts and scope](evidence/independent/browser-load.json), [successful earlier isolation rehearsal](evidence/independent/v1-hosted-qualification.json).

The hub's own closure and challenge rules remain authoritative. We have not substituted a cosmetic one-second timer for them. See the official [security and liveness reference](https://github.com/Veenoway/interlude-sdk/blob/main/docs/04-security.md).

At 15:37 UTC both failed fixtures had been recovered through those real hub rules. All candidate epochs are released; incomplete games were cancelled without ELO, and the Chaos bettor was refunded exactly once. [Closure evidence](evidence/independent/v2-release.json) and [refund proof](evidence/independent/refund-proof.json). The old test nodes may consequently no longer be reachable: use the recorded UTC/application/epoch identifiers to retrieve the failed batch, rather than treating a now-closed endpoint as a fresh reproduction. The production application was not closed by this cleanup.
