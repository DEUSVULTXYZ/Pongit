# Publication incident, 13 September 2026

The rules-5 production engine halted during a player match after 28 successful publications. This is a downstream publication HTTP 413, not evidence of an RPC request-rate limit. The previously successful full-game qualification does not cover this failure under subsequent player traffic.

## Evidence

- App: `0xd2fe1c8df2bdbe2666409fc20f25bcd2f2a40fb5`
- Endpoint: `https://il-d2fe1c8df2bdbe26.fly.dev`
- Monad Testnet hub: `0x3Ef8327F69e09cf721772F345e2A887eA22cD595`
- Epoch 1, rejected batch 29. Last Monad publication: **2026-09-13 10:17:40 UTC**, batch 28.
- Exact pending coordinator tick: `0xdc3c70f8eb20da150b4db2e00ffdf6c72c19da0c571bbad71febdac6bfc68429`, nonce 2. It was journaled at 10:18:07 UTC. Its receipt remained absent; the nonce and signed bytes were preserved.
- Re-sending those exact bytes at **10:23:53.977 UTC** returned outer HTTP 200, JSON-RPC `-32000`, Fly request ID `01M2D4PZGXGSQTNDF1CT5D00C1-ewr`:

```text
this session is over and the node is no longer accepting transactions:
batch 29 could not be settled
(commit relay failed: 413 Payload Too Large: {"error":"body too large"});
refusing further transactions so they are not promised a commit this node cannot make
```

At 10:29:07 UTC the hub remained active, expiring on **14 September at 09:18 UTC**. The live match was 6:1, revision 182; Monad still held 1:0, revision 37. Neither state is a completed match. No winner or replacement result was manufactured. Five storage diffs remained pending. `interlude_session` and the hosted control plane continued to report a readable/live process despite the write halt.

The served batch-28 document contained 37 transactions, 33,003 raw transaction bytes and 71,484 JSON bytes. Batch 29 was unavailable from `interlude_getBatch`. These are public batch-document measurements, **not the size of the failed relay body or its configured limit**. Captured browser/VPS metrics received between 10:15 and 10:20 contained no HTTP 429. Missing browser samples and JSON-RPC errors inside HTTP 200 are not inferred successful.

## PONGIT correction

Background tick failures were swallowed while the next successful status read restored `online=true`. Publication failures now persist separately by application and epoch, stop new admissions and ready/accept actions, and appear in `/interlude/config`, `/health` and structured logs. Reads, history and payments remain independent.

The recovery worker only retries the existing immutable pending transaction, at most once per 30 seconds. It does not allocate a replacement nonce. A successful status read or service restart cannot clear the incident. Recovery requires the failed batch to appear on both the engine and Monad, or a validated, matching newer delegation. Diagnostics retain only allowlisted batch, epoch, HTTP status, category and UTC fields, without RPC payloads or credentials.

## Operator handoff

Please inspect the body limit of the publication relay and each intermediary for **app `0xd2fe1c8df2bdbe2666409fc20f25bcd2f2a40fb5`, epoch 1, batch 29**, around **10:18 UTC on 13 September**.

1. Identify the rejecting component, its body-size limit and the actual serialized/compressed size of batch 29, including its transaction log.
2. Increase compatible limits throughout the path or generate bounded batches before signing them. Splitting an already signed batch into arbitrary HTTP fragments would invalidate its commitments.
3. Restore the halted node from its journal and publish accepted pending state without silently discarding it. Provide the supported recovery procedure if a restart cannot resume this batch.
4. Confirm publication past batch 29 and continued command acceptance. A live control-plane response or a readable RPC alone is insufficient.

PONGIT does not possess the hosted publication relay's administrative token. The current deployed contract uses the SDK grant envelope for player writes; the [smaller direct-command qualification](INTERLUDE_PUBLICATION_413.md#compact-commands-12-september-evening) belongs to the separate independent-arena candidate and must not be described as active here. Reducing future command payloads would not recover this already rejected batch.

The contracts, user sessions, journal, financial rights and current match are retained. No destructive redeployment or invented settlement is part of this incident fix. The full game remains blocked pending successful hosted publication recovery.
