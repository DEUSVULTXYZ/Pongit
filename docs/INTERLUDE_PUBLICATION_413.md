# Hosted publication failure, 12 September 2026

PONGIT's independent-arena candidate passes the short hosted isolation rehearsal, but complete Classic and paid Chaos browser games stop when the node cannot publish batch 2. The public site has not been migrated to this candidate.

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
- A new contract may create a fresh session, but this does not fix a repeatable batch-2 body-size rejection. We are retaining the production deployment while this qualification gate fails.

Evidence: [Chaos RPC probe](evidence/independent/chaos-progress-probe.json), [browser counts and scope](evidence/independent/browser-load.json), [successful earlier isolation rehearsal](evidence/independent/v1-hosted-qualification.json).

The hub's own closure and challenge rules remain authoritative. We have not substituted a cosmetic one-second timer for them. See the official [security and liveness reference](https://github.com/Veenoway/interlude-sdk/blob/main/docs/04-security.md).
