# V1 input latency and rendering corrections — September 6, 2026

This historical diagnosis covers V1. The fixes improved visual response and removed browser waits while keeping input application at Monad inclusion. Contract addresses did not change for this patch. Current V3 measurements are in the [Arcade delivery report](ARCADE.md#production-validation).

## Observed causes

- The browser polled receipts every 400 ms, then reread the match before sending the next direction. The last twelve examined inputs in user match #9 showed neither a growing queue nor failures; the VPS was not saturated.
- Prediction applied the current direction starting from an old confirmed snapshot. Reversing a key could recompute several seconds of paddle movement in the opposite direction.
- Match state, clock and displayed block could come from different blocks. A delayed HTTP response could replace a newer WebSocket snapshot.
- Rendering predicted paddle impacts and points before onchain resolution. An in-flight input could invalidate that bounce, visibly moving the ball back.

## Changes

The local paddle integrates each frame from its current visual position, then corrects gradually toward confirmed state. An outline shows the confirmed-direction position when it differs. Wall bounces remain predicted; uncertain paddle impacts and points display **Awaiting impact confirmation**. This avoids false bounces at the cost of a visible hold if confirmation is late.

The client rejects older snapshots. Relayer state, clock and block are coherent, and finished matches remain frozen. Receipts arrive over WebSocket with HTTP polling as fallback. A confirmed input can be followed immediately by the next direction without another match read; nonces remain sequential with at most one outstanding input per player.

The relayer checks signed receipts concurrently, prioritizes snapshots ahead of secondary tasks and caches HTTP match reads. The follow loop changed from 500 to 150 ms. Signing, submission and confirmation timestamps support the latency breakdown; these include service scheduling and receipt observation, not just consensus.

The account button opens the full address, copy, explorer and disconnect controls. Disconnect closes local sessions without deleting the passkey or funds. Submitted transactions can still complete; cancel matchmaking before disconnecting.

A later test separately hit the former daily ceiling: 5.998 MON of accumulated reservations versus 3.177 MON actually spent. Completed jobs now count receipt fees and actual transferred value; pending jobs retain maximum reservations, including across midnight. **The owner subsequently disabled the daily ceiling for V2.** Balance reservations remain enforced.

## Measurements and scope

These small samples come from different matches. They are neither a capacity benchmark nor evidence of reduced network consensus latency.

| Measurement | Result |
|---|---|
| Before: final 12 inputs in #9, journal creation to observed receipt | p50 968 ms, p95 1,455 ms; excludes browser time. |
| After: 9 inputs in #10, browser request to receipt notification | p50 1,105 ms, p95 2,077 ms, p99 2,144 ms; range 714–2,161 ms. |
| Same #10 inputs, journal to receipt | p50 1,088 ms, p95 2,064 ms; does not demonstrate a relayer latency reduction. |
| Final V1 patch: 11 inputs in #12, browser request to receipt | p50 1,067 ms, p95 1,494 ms, p99 1,566 ms; journal-to-receipt p50 1,054 ms. |
| #10 stage medians | Preparation/wait 513 ms; submission 175 ms; inclusion/receipt observation 530 ms. Medians do not add. |
| Finished-match HTTP reads, 20 before and 20 after | Average approximately 300 ms to 47 ms through caching; not input latency. |
| Direct VPS RPC, 12 block-height reads/provider | Median approximately 50 ms Ankr and 43 ms Monad Foundation; excludes simulation/submission. |

Quantiles use linear interpolation between sorted observations. A key change held while the previous input is pending can take longer than the measured request: the client sends the latest desired direction once the previous nonce confirms. Visual response is independent of this wait.

Evidence: [journal before](evidence/latency-before-jobs.json), [HTTP before](evidence/latency-before-http.json), [HTTP after](evidence/latency-after-http.json), [match #10 inputs](evidence/input-latency-match10.json), [match #12 inputs](evidence/input-latency-match12.json), [VPS RPC](evidence/rpc-latency-vps.json).

## Validation

- Type checking and seven TypeScript tests passed, including four rendering/receipt regressions.
- The unchanged V1 contracts passed 21 Foundry tests, including 16,384 solvency-invariant calls.
- Isolated Anvil crash/recovery preserved raw bytes, nonce, hash and a single credit; [evidence](evidence/latency-recovery.json).
- PostgreSQL budget integration covered successful/reverted jobs, pending reservations across midnight, cached balance and incomplete historical receipts. Run only against a local test database: `node --import tsx --test tests/budget.integration.ts` with `DATABASE_URL` configured.
- Two real Mera SDK accounts and a spectator completed the HTTPS flow, touch input, bets, withdrawal, Envio replay, reload/recovery and account controls; [initial run](evidence/latency-mera-match10.json), [final run](evidence/latency-mera-match12.json), [390 px account layout](evidence/account-mobile.png). The authenticator was virtual Chromium CTAP2/PRF.
- The intermediate #11 run stopped at the former sponsor ceiling; the match completed after recovery. Production Docker builds and VPS services were checked.

## Historical rollout and future work

The pre-patch backup was `20260906T105436Z`. Previous V1 release `4fa9e4662fc48ddf05add98639ec5f8e288032d7` and its before-latency images were retained. **That original V1 release is not a valid rollback target after V2 migration.** Use the current [V2 rollback procedure](DEPLOYMENT.md#application-rollback).

A dedicated RPC can be compared using the same timing stages before selecting a service. Merely switching public RPC does not guarantee improvement. Local practice or a game with only final settlement onchain would need a separate product/trust decision; neither is represented as part of this V1 patch.
