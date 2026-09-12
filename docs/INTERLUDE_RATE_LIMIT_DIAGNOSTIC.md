# Interlude hosted RPC diagnostic

Recorded on 11 September 2026, UTC. No credentials or signed transaction bytes are included.

Application: `0xfd1693294fed77304662f08e827b043b0ba386a3`

Endpoint: `https://il-fd1693294fed7730.fly.dev`

Epoch 2 renewal and result publication work. Independent sessions also worked on three fresh hosted applications. The remaining failure on the current application is a direct RPC HTTP 429, including on `interlude_sendTransaction` for `tick`:

| UTC | Fly request ID | Response |
|---|---|---|
| 2026-09-11 23:37:22.417 | `01M29DAE349ZZKW67AG7PCQ3NP-yyz` | 429, `Retry-After: 10` |
| 2026-09-11 23:37:39.211 | `01M29DAYFX9RMEYHJ0VM9JSRAD-yyz` | 429, `Retry-After: 10` |
| 2026-09-11 23:55:22.784 | `01M29EBD2N4S958DES5VXX3791-yyz` | 429 on `interlude_session` |

Body: `Too many requests from this caller. Try again later.`

The test used two consensual friendly games, Classic and Chaos, with two spectators. Requests went directly to the Interlude endpoint, not through PONGIT's reverse proxy. The final browser run recorded 107 page RPC requests and twelve 429s, including failures before its input-load loop. It was stopped rather than continuously retrying. The frontend honors the ten-second cooldown and preserves uncertain transaction bytes.

With backend events subsequently enabled and pages opened concurrently, another run at 23:55 UTC recorded 47 browser RPC requests and five 429s. This includes rejection of `eth_call`, `eth_chainId` and `interlude_session`. Its shorter setup is not comparable to the previous run. [Post-deployment evidence](evidence/reliable-recovery/events-published.json).

An earlier fourteen-second trace recorded 78 browser calls and 21 instrumented VPS calls, with a combined one-second peak of 17. These counts exclude test-setup SDK calls and uninstrumented callers; they do not establish the endpoint's actual rate limit. The announced 600 requests/second cannot be verified from these observations.

Please identify the limiter responsible for the request IDs above, its key (IP, application, account, method or shared caller), burst size, refill interval and any separate limits on writes or WebSockets. Please also confirm whether the announced 600 requests/second applies to this specific endpoint and to traffic from multiple browsers sharing one public IP.

Evidence: [scoped baseline](evidence/reliable-recovery/traffic-baseline.json), [latest live run](evidence/reliable-recovery/events-live.json), [independent hosted sessions](evidence/reliable-recovery/independent-arenas.json).
