# InterludeLayer publication failure: PONGIT

Observed at **2026-09-09 21:28:23.648 UTC**.

| Field | Value |
| --- | --- |
| Application | `0xfd1693294fed77304662f08e827b043b0ba386a3` |
| Direct endpoint | `https://il-fd1693294fed7730.fly.dev` |
| RPC method | `interlude_sendTransaction` |
| HTTP response | `200` with a JSON-RPC error |
| JSON-RPC code | `-32000` |
| Fly request id | `01M2414TSRVZHSR6DJK4KPXZTG-ams` |
| Reported failed batch | `76` |
| Existing journal nonce | `276` |
| Existing signed transaction hash | `0xa351abb2ef05c40751fce7d992ac8c0cba916b2504b83ecf250dff9e07b0f522` |

The node returned this diagnostic:

```text
this session is over and the node is no longer accepting transactions:
batch 76 could not be settled
(commit relay failed: 401 Unauthorized:
{"error":"missing or wrong bearer token"});
refusing further transactions so they are not promised a commit this node cannot make
```

The 401 is reported for the node's commit relay. It is not the HTTP status returned to PONGIT, a player-authentication error, or the previously observed 429. The request was sent directly to the Fly endpoint, bypassing PONGIT's Caddy/API rate limit. It resubmitted the already-persisted identical tick transaction solely for diagnosis, not a new transaction or nonce.

Immediately beforehand, the engine reported sender nonce `0x114` (276), and the pending hash had no receipt. The active match snapshot was phase 2, revision 34, score 1:3, processed time 17,990,000 microseconds, while its readable clock had advanced to 1,165,140,000 microseconds. This is consistent with stopped execution while reads remain accessible.

This sample does not establish the node's requests-per-second limit. It establishes a separate publication-authentication failure. PONGIT must not erase its journal, award a result or recreate players' passkeys to work around it.

Please check the commit relay bearer-token configuration for this app and whether batch 76 can be safely published. After repair, confirm the engine's epoch, accepted sender nonce, pending batch status and treatment of previously accepted state/receipts. PONGIT will reconcile those values before resuming commands and re-run the real traffic comparison at low load, respecting `Retry-After` if another 429 occurs.

No operator key, bearer token, signed transaction bytes or player-session grant is included in this report.
