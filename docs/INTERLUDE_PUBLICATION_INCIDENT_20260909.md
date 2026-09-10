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

## Recheck after the VPS reboot, September 10

At **2026-09-10 19:12:22.902 UTC**, resubmitting the same persisted transaction returned the same batch 76 publication-authentication error. Fly request id: `01M26BRGAAKA1Q2NP1S7H0Z81T-ams`. The sender nonce remained 276; no receipt was returned. This recheck did not allocate another nonce or discard the pending job.

The VPS had restarted at approximately 19:05 UTC. All eight production containers restarted, with PostgreSQL, Hasura and the relayer healthy. Disk usage was 79% with approximately 9.2 GB free. The hosted control plane reported `live`, but that describes the process, not successful publication.

Monad reported epoch 1, status Active, expiry **2026-09-10 10:10:00 UTC**, and batch 75 as the last committed batch. The engine still reported one active match and 15 unpublished storage differences; the published contract reported zero active matches. Therefore, expiry is a second blocker and does not establish that the unfinished match can be discarded.

PONGIT's renewal guard correctly refuses to close this unfinished state. Its previous generic message hid the reason and repeatedly checked the expired delegation. The recovery patch reports distinct engine expiry/epoch/deployment states, includes the last check and retry time, backs off failed availability checks to 30 seconds, and explains the lifecycle drain blocker. It preserves player authentication and transaction journals. Expiry alone no longer marks historical results unverified; the existing publication/contestation audit remains responsible for those results.

Validation: nine targeted TypeScript tests, TypeScript compilation, and the private PostgreSQL coordinator regression passed. The latter includes 20 duplicate-click queue/cancel cycles, engine expiry without player logout, no repeated checks during cooldown, and recovery when a valid delegation becomes readable again. This simulated renewal does not claim the production node has recovered.

Operator recovery still requires resolving the failed publication and the expired delegation together. Do not blindly restart/reprovision the node, force-close the delegation or erase its journal: first establish whether the accepted unpublished state can be retained. A healthy process response is insufficient to reopen PONGIT admission.
