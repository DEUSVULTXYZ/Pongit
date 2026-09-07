# Interlude Classic lab

Last checked: 7 September 2026, UTC.

## Status

The hosted deployment gate is resolved. Interlude provisioned the PONGIT app on
7 September at 19:51 UTC; its node became reachable at 19:55 UTC. The deployed
runtime matches the compiled prototype. The dedicated engine passed the clock,
CORS, scoped-session and 200-input gameplay probe, including a matching terminal
result hash on Monad. The web lab at `/labs/interlude` passed the HTTPS-origin
browser checks below. The V4 contracts and relayer remain unchanged.

| Deployment | Value |
| --- | --- |
| Game | `0xbd9bc9fb0daaf25eb2b22761d06c8ecf823a1877` |
| Node | `https://il-bd9bc9fb0daaf25e-production.up.railway.app` |
| Hub | `0xDf840A85DB56430970b32f0e3210cabB5CD1F270` |
| Base / engine chain | 10143 / 4242 |
| Delegation block | 60560971 |
| Delegation transaction | `0x3c274b1bceb8d893adf552011b19997412a5ec76b12f608c4a5140050eaf0632` |
| Runtime hash | `0x0fa71f95f6e8421538bf61dca702330be781b72a18f26dcf5aa4a24501d679f4` |

The immutable app is owned by Interlude, as specified by its hosted `ship`
workflow. Its first delegation has a 24-hour lifetime. Do not re-run `ship`
to restart a node; use the operator's lifecycle controls for this same app.

The approved first experiment is a single Classic friendly arena, with two
players and a spectator. It has no ELO, markets, tournament fees, vaults or
payout authority. This experiment does not route V4 transactions through
Interlude.

## Verified upstream changes

- The public [SDK repository](https://github.com/Veenoway/interlude-sdk) is now
  accessible.
- SDK `@interludelayer-sdk/sdk` is pinned to `0.1.1` and CLI
  `@interludelayer-sdk/cli` to `0.1.3`.
- The [hosted deployment flow](https://interludelayer.xyz/docs/first-hour) uses
  `interlude ship`: the operator deploys the app on Monad Testnet and provisions
  an app-specific node. No Interlude node is installed on the PONGIT VPS.
- The shared `rpc.interludelayer.xyz` endpoint serves the Room demonstration,
  not arbitrary applications.
- CLI 0.1.3 explains that a new **node URL** can temporarily return 502 during
  its image build. This is different from the **control API** returning 502
  before it returns an app address or node URL.

The bundled Solidity files under `contracts/vendor/interlude` are unmodified
copies from CLI 0.1.3, with the upstream MIT license. The lockfile records package
integrity. Do not apply an upstream contract update without regenerating and
checking the storage surface.

## Resolved deployment failure

The official CLI failed with `request failed`. After checking recent Monad
delegations and candidate creation addresses, one diagnostic retry used exactly
the CLI payload: compiled bytecode plus constructor and `delegateAll` ABI.

| Field | Observed value |
| --- | --- |
| Endpoint | `POST https://control.interludelayer.xyz/apps` |
| Diagnostic attempt | `2026-09-07T18:31:43.585Z` |
| Response | HTTP `502`, `{"error":"request failed"}` |
| Response received | `2026-09-07T18:31:43.730Z` |
| App / node returned | Neither |
| Control health | HTTP `200`, `{"ok":true}` |
| Monad deployment simulation | Success, estimated 4,265,991 gas |
| Creation bytecode hash | `0x0cf77064257bc731b7b0c1c9fcff07afaafa90f1af872d333c451026be7780b8` |

The known Room operator's pending transaction count remained 1534 before and
after the diagnostic retry. No new delegation was found in the inspected block
window. This does not establish that every possible operator account or
background job is empty. Resolve the failed request with the operator before
submitting more deployment requests; `ship` does not provide an idempotency key.

On the user's next explicit retry, the package versions and repository HEAD had
not changed, but the control service had recovered. After recovery checks and a
fresh successful Monad deployment simulation, one request at
`2026-09-07T19:51:20.078Z` returned HTTP 200 at `19:51:26.171Z`, with the app and
node recorded above. No other deployment request was sent. The new node returned
Railway's `Application not found` during provisioning, then answered
`interlude_session` at `19:55:26.985Z`. This was a hosted service recovery, not a
new SDK version or a change to the PONGIT contract.

## Contract and permissions

`contracts/src/labs/PongInterlude.sol` reuses `PhysicsV2` in Classic mode:
1024 by 576, first to seven, constant paddle speed and fixed paddle heights.
Its generated surface registers 23 full storage slots and one dynamic mapping
in a single global partition. This avoids the CLI's unsupported struct layout.

The virtual clock is 10,000 microseconds per engine block. A new hosted instance
must pass the cadence probe before play is enabled. A measurement of the Room
demo is not evidence for the PONGIT instance.

| Operation | Permission / behavior |
| --- | --- |
| `createMatch` | Creator chooses a target address or an open invitation; refuses an occupied arena |
| `acceptMatch` | The target, or the first other player for an open invitation, consents within ten minutes |
| `cancelMatch` | Creator, or anyone after the invitation expires |
| `input` | Participant, direction -1/0/1, sequential participant nonce, short block deadline |
| `tick` | Public bounded physics catch-up |
| `concede` | Participant only; resolves elapsed collisions first |
| `expire` | Public after the wall-clock timeout |
| `getSnapshot` | Public state for players and spectators |
| `resultHashes` | Retains a versioned match's terminal digest after the next match starts |

All game writes are engine-only. Inputs resolve elapsed physics before changing
direction. An input arriving after the decisive point cannot change the result.
The inherited SDK grant binds a signer, a session key, selectors, expiry, epoch,
base chain and application. The grant wrapper is not payable and blocks
privileged delegation selectors. No financial method is added to the game.

Revocation tests verify rejection when the engine observes an updated epoch.
They do not prove immediate propagation of a Monad epoch change into an already
running node with pinned base state. Session expiry and operator redelegation
behavior require hosted validation.

## Checks completed

| Check | Result |
| --- | --- |
| Generated surface check | 24 annotated variables, layout unchanged |
| Prototype Solidity tests | 15 passed |
| All Solidity suites | 92 passed, none failed or skipped |
| Solidity / TypeScript physics | 10,000 Classic and 10,000 Chaos cases, zero differences |
| TypeScript | `tsc --noEmit` passed |
| Existing web production build | `next build web` passed |
| Probe syntax | `node --check scripts/interlude-probe.mjs` passed |
| Hosted bytecode, hub and CORS | Passed on the dedicated PONGIT node |
| Hosted block cadence | 99.47 blocks/second in the 10-second sample |
| Scoped SDK game | Two fundless players, 200 direction changes |
| SDK call latency | p50 29.18 ms, p95 35.15 ms, p99 43.74 ms |
| Monad observation | Terminal result hash matched about 2.1 seconds after live observation |
| Input lane unit checks | Four passed: coalescing, nonce order, uncertainty, duplicate action and spectator isolation |
| Browser integration | Two Mera virtual-PRF players and one spectator, two successive games, keyboard and touch |
| Recovery | F5 without another ceremony, second-tab lock, engine disconnection, explicit recovery, expiry renewal and key deletion |
| Responsive views | 360, 390, 768, 844 landscape and 1440 pixels; no horizontal overflow or page errors |
| Dependency audit | Zero known vulnerabilities reported by `npm audit` |

Physics comparisons ran in a temporary container on the VPS, with no external
network, a one-CPU limit and 512 MB memory limit. It did not attach to production
services. The container was automatically removed. The Classic/Chaos comparison
does not validate a hosted Interlude clock or execution engine.

Browser QA uses Chromium with a virtual PRF authenticator and the actual Mera
and Interlude SDKs. It routes the candidate web image through the real HTTPS
origin inside Playwright, on a private VPS test network. This is not a physical
passkey synchronization test, a Safari/Firefox check or a promise of mobile FPS.
The runner is resource-limited. The lab session checks the Hub's active status,
delegation epoch and expiry periodically; a failed verification stops controls.
Hub epoch revocation propagation into an already pinned engine remains an
operator/protocol concern, rather than an immediate revocation guarantee.

Evidence files are kept under the ignored `artifacts/interlude` directory. These
include the HTTP diagnostic, preflight, contract results, dependency audit and
physics comparison report. Test keys are synthetic fixtures or generated only
in memory; no operator credentials are needed for these checks.

## Reproduce and operate this deployment

1. Use the existing `deployments/interlude-lab.json`. The previous `/apps`
   failure is resolved. Do not submit another `ship` for this instance.
2. Rebuild, regenerate only if the source layout changed, and check the surface:

   ```sh
   forge build --root contracts
   npm run test:interlude
   cd contracts
   export INTERLUDE_CONTRACTS="$PWD/vendor/interlude"
   ../node_modules/.bin/interlude check --contract PongInterlude
   # A new ship creates another app; it is not a restart command.
   ```

   In PowerShell, set `$env:INTERLUDE_CONTRACTS` to the resolved
   `contracts/vendor/interlude` directory instead of using `export`.

3. A future, deliberately separate deployment must record its real response in
   a separate manifest, with these fields:

   ```json
   {
     "app": "<address returned by ship>",
     "node": "<HTTPS node returned by ship>",
     "hub": "<operator's verified Monad Testnet hub address>",
     "baseChainId": 10143,
     "tickUs": 10000,
     "rulesVersion": 1
   }
   ```

4. Wait for the returned node to become healthy. A 502 from this node is a reason
   to wait and inspect provisioning, not to submit another `ship`.
5. Run `npm run interlude:probe -- inspect`. The read-only gate compares the full
   deployed runtime with the local artifact, checks the hub and active
   delegation, verifies browser CORS, and measures the hosted block cadence.
6. On a dedicated, empty lab arena run `npm run interlude:probe -- play`. This
   creates two fundless test identities, opens scoped SDK sessions, submits 200
   direction changes across as many completed matches as needed and checks
   terminal hashes against Monad. It writes separate execution latency and
   commit-observation evidence. It never requests a V4 key or transfers funds.
7. `/labs/interlude` uses Mera, keyboard/touch input, invitation links, a public
   spectator view, reconnect recovery and separate live/committed indicators.
   Its 30-minute SDK grant and key are separate from the V4 arcade session. One
   Web Lock owns the SDK nonce lane per app/account. Unsent input coalesces;
   uncertain writes freeze the lane until explicit recovery reads fresh state.
8. Validate two browsers and a spectator on HTTPS, session restoration, expiry,
   engine interruptions and subsequent matches. Only then publish the lab link
   and deploy the web image after a production backup.

The browser QA command is `node scripts/interlude-browser.mjs`. It creates
fundless virtual-PRF Mera identities and must only run when this dedicated lab
is empty. `PONG_LAB_STAGE_URL` can route the candidate web image behind the real
HTTPS origin in Playwright; `LAB_ABI_FILE` selects its matching Foundry artifact.
Run services and the browser in the isolated VPS test network, not on the
production Docker network. Browser output belongs in ignored
`artifacts/interlude/browser`; never export session storage or private keys.

Rollback only the web image and release symlink to the saved previous release.
Do not change V4 addresses, relayer queues, indexer state or any user's balances.
The Interlude deployment remains onchain even if its web entry is removed.

`readSettled` in the SDK reads the last value committed on Monad. A matching
result hash is not proof that the challenge window has closed. Do not label it
financial finality, and do not connect this experiment to existing markets or
payouts. See [live and committed state](https://interludelayer.xyz/docs/read)
and [Interlude limits](https://interludelayer.xyz/docs/limits).
