# Hosted recovery followed by failure during the first duel

All times are UTC on 8 September 2026. This supersedes the earlier report that both endpoints were continuously unreachable.

## Observations

| Time | Observation |
| --- | --- |
| 21:06:58 | Both hosted nodes return HTTP 200 for `/health` and `interlude_session`, in about 140 ms from the VPS. Chaos reports epoch 3, no pending diffs, no commit errors and a healthy base RPC. |
| 21:07:06 | The read-only release gate passes: correct app and epoch, no active matches, no pending publication, and inherited Classic ELO values 986 and 1014 matching Monad. |
| 21:08:52 | Start an isolated browser check with two players and one spectator. Three fresh Mera accounts authenticate successfully. |
| 21:09:31.961 | Create one **friendly Classic** duel on the new rules-4 engine. Both participants accept; both briefly display an arena. No bet or market-opening transaction is made in this check. |
| During that duel | Players and spectator show `Position 63 is out of bounds (0 < position < 36)` while reading state. Subsequent browser requests fail and surface CORS errors. Spectator entry times out. |
| 21:11:33 | Direct VPS probes of the Chaos node return Railway HTTP 502 for both `/health` and `interlude_session`, after approximately 15.14 seconds. |
| 21:12:18 | Classic still responds HTTP 200, on epoch 1 with no pending diffs. Its public admissions are restored. |
| 21:13:11 | Monad still reports Chaos delegation Active, epoch 3, batch 0, expiry 9 September at 15:39:02. No epoch-3 batch was published. |
| 21:17:19 | Chaos still returns HTTP 502 after the isolated browser and coordinator have stopped. |

The healthy response was therefore real, but did not survive the first multiplayer check. The test did not exercise betting, pressure attestations or financial payouts, so those operations are not required to reproduce this incident.

## Identifiers for the operator

- Chaos app: `0xbb6ba9901acde11da748a6abd1cef2188eef32eb`
- Chaos node: <https://il-bb6ba9901acde11d-production.up.railway.app>
- Classic app: `0xb3f9c323ffb8ec6a8cd7d06ae239bc3d7bebd59a`
- Classic node: <https://il-b3f9c323ffb8ec6a-production.up.railway.app>
- Monad Testnet chain: 10143; engine chain: 4242
- Hub: `0xDf840A85DB56430970b32f0e3210cabB5CD1F270`
- Chaos epoch: 3; pinned base block: 60796444
- Match ID: `67321422880844307555796005074453358195302609607921649515001282279798502252190`
- Room: `0x72f5d675d62817bf81c895888c62a97de30ee41d554068f62f6be87b45be7758`
- Coordinator engine transaction: `0xda82fc612d3f5aa29e4eb8f060eebe31ae10e2ee3ad187212245709bd6694cf1`, nonce 0, epoch 3. The local journal records an observed successful engine receipt. This is not a Monad transaction or proof of publication.

Railway request IDs:

| Time | `/health` | `interlude_session` |
| --- | --- | --- |
| 21:11:33 | `m78ljhSqSDmvpINJjUJq2g` | `hSlTEBSxS5qXJ3qB21mRUA` |
| 21:17:19 | `75CNyqXwRve6hBA3nTga3g` | `itOgixENTl-7npD0YqdHTg` |

## Investigation requested

Please inspect execution, publication and process-exit logs around 21:09:32 through 21:11:33, including the transaction and match above. Check for a runtime panic, resource exhaustion, failed base-state access, or publication failure. The available responses do not establish which one occurred.

The decode error suggests that a state call returned less data than the snapshot ABI expects. Raw revert bytes were not captured, so it is not proof of a specific Solidity panic. One useful check is consistency of `block.number` between executed transactions and `eth_call`: `getSnapshot` computes the active clock as `(block.number - matchStartBlock) * TICK_US`. A read block preceding the stored start block would revert. Please verify the actual context in the logs rather than assuming this hypothesis is the cause.

The CORS messages appeared alongside failed endpoint responses. They may be a consequence of Railway error responses and are not, by themselves, evidence that successful engine responses have an incorrect CORS configuration.

Please preserve engine state and journals before another reset. The match may have unpublished state even though the published active-match count is zero. Recovery needs a successful match, subsequent state reads and a publication cycle, beyond HTTP health alone.

## PONGIT state

Chaos remains a private candidate. Its active public manifest was not changed, no journals were handed over and no production Chaos activation was attempted after the failed browser check. Classic public admission is restored and its config reports online/admission true.

Private test services are paused and a new protected backup preserves the failed run. The local ranking recovery patch is separate from this incident and has passed TypeScript, four existing room tests and a transactionally rolled-back PostgreSQL check. It remains unpublished to production.
