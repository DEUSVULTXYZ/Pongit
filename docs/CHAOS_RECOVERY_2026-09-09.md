# Chaos recovery and isolated publication failure

Reviewed 9 September 2026. All timestamps below are UTC on 8 September.

**Chaos is not activated in production.** PONGIT recovery fixes pass local and isolated VPS checks, but neither the updated game candidate nor a separate one-slot counter can publish its first batch through the hosted service. Production still points to the existing Classic deployment. No financial bindings or sender journals were replaced.

## PONGIT fixes

- A restarted engine can expose a lower block number while retaining a game's stored state. The previous subtraction could panic, and the write path could reject subsequent movement. The contract now anchors its clock to processed game time on a counter regression, without rewinding scores or adding storage slots. Revision ordering also survives that reset.
- Invalid snapshot responses now identify the actual Solidity revert or malformed payload. A temporary read failure preserves the arcade grant and waits for the accepted command to become observable. It does not blindly resend a write. Ambiguous write failures still require recovery.
- The browser retains its command lane across a temporary connection loss and displays synchronization status. It accepts a higher state revision even when the engine's block counter is lower.
- Vendored contracts and the CLI are updated to 0.1.4. Lifecycle decoding supports both deployed hub tuple layouts. Migration checks read each application's actual hub, rather than querying a legacy application through a newer hub.

The clock change needs a new immutable game deployment. It is not installed in the public Classic contract. The recovery candidate is not linked to the earlier Chaos candidate's financial instances.

## Hosted game check

| Field | Value |
| --- | --- |
| App | `0x526ef5822169ff21da4e5323d36426df0462dfcb` |
| Node | `https://il-526ef5822169ff21-production.up.railway.app` |
| Hub | `0x3Ef8327F69e09cf721772F345e2A887eA22cD595` |
| Validator | `0xB28E684815b095aB5Fb324214cfEa63d76F3d691` |
| Base / engine chain | 10143 / 4242 |
| Epoch / pinned base block | 1 / 60869787 |
| Publication capacity | 64 diffs |

At 21:51:44, four scoped sessions created two independent friendly games, one Classic and one Chaos, through both participants' signed agreements. **47 movement commands were accepted and observed.** The next command failed around 21:51:49.298 with:

```text
this session is over and the node is no longer accepting transactions:
batch 1 could not be settled
(commit relay failed: 502 Bad Gateway: {"error":"execution reverted"});
refusing further transactions so they are not promised a commit this node cannot make
```

No market, bet, pressure attestation or payout was submitted during this test. The node subsequently returned with a lower block counter and 27 pending diffs. At 22:09, it reported healthy with zero pending diffs, while the hub still reported batch zero. At 22:10:56, both test match IDs read as phase zero and revision zero on both the engine and Monad. A healthy endpoint therefore did not mean those accepted games survived recovery or were published. The test did not replay them.

An earlier intermediate candidate also exposed a head regression from 15192 to 15/16 within epoch 1 while retaining 27 pending diffs. Regression tests reproduce the resulting PONGIT clock failure and pass with the recovery fix.

## Minimal reproduction without Pong or betting

`contracts/src/labs/PublicationProbe.sol` contains one delegated mapping counter and one engine-only increment. It uses the current vendored `Delegatable`, with no physics, ELO, pressure bridge, wallet balance or market contract.

| Field | Value |
| --- | --- |
| Probe app | `0x6d5db79aef6f551319a867d881a019e017bd9263` |
| Node | `https://il-6d5db79aef6f5513-production.up.railway.app` |
| Hub | `0x3Ef8327F69e09cf721772F345e2A887eA22cD595` |
| Epoch / base pin | 1 / 60871433 |
| Engine transaction | `0x35ce0648b36aaba4b5ddfb08e20e0c34f3db28004295ba8d32ff2c3be760d5be` |

At 22:09:05 the increment was accepted. Live value became **1**, with **one pending diff**. A read-only Monad `eth_call` to the application's `applyDelegatedDiffs`, with the actual hub as caller and the expected mapping preimage, succeeded. This validates the application's callback for that diff; it does not simulate the hub's complete signed commit.

At 22:09:36, Monad value was still **0** and the node reported:

```text
batch 1 could not be settled (commit relay failed: 502 Bad Gateway:
{"error":"execution reverted"}); refusing further transactions so they
are not promised a commit this node cannot make
```

This reproduces the publication failure without PONGIT gameplay or financial logic. The exact hub revert selector, commit payload and relay transaction hash were not provided. A committee-signature, payload, deployment or relay problem cannot be distinguished from these responses alone. The 64-diff limit is not exhausted by this reproduction.

### Reproduce on a fresh diagnostic app

Deploy `PublicationProbe` through the operator's current hosted tooling and create an untracked manifest containing its `app` and `node`. Then, inside an isolated VPS test environment with the repository dependencies and Forge artifact:

```bash
ROOMS_PUBLICATION_PROBE=isolated-vps \
ROOMS_PROBE_MANIFEST=artifacts/probe-manifest.json \
ROOMS_PROBE_APP=0xYourFreshProbeAddress \
ROOMS_PROBE_REPORT=artifacts/probe-attempt-1.json \
npx tsx scripts/rooms-publication-probe.ts
```

The script creates a scoped in-memory diagnostic session, sends one increment and observes publication. It never retries an uncertain write. Retain the existing report and inspect chain/node state before any further attempt. The probe is not the game and must never be placed in a production manifest.

## Verification and deployment gate

- **164 Solidity tests passed**, including four added clock/recovery cases, scoped authorization, Chaos boundaries, publication budget, ELO and financial invariants.
- **60 TypeScript tests passed on Node 24** in an isolated VPS container, including delayed reads after accepted commands, duplicate terminal actions, error decoding and both hub ABI layouts.
- TypeScript checking and the production Next.js build passed. The build retained the public Classic manifest; it did not activate the candidate.
- The candidate runtime is **23,833 bytes** against the 24,576-byte limit. The two-Chaos publication test still writes **49 of 64 slots**.
- The earlier 10,000 differential cases per mode and real betting/payout/browser evidence remain historical checks, described in `CHAOS_ROOMS.md`. They were not rerun or presented as passing on this recovery candidate.
- The planned 100-command hosted check stopped at 47 accepted inputs. New HTTPS multiplayer, pressure, financial settlement and lifecycle validation remain incomplete for the new candidate.
- Gitleaks 8.30.1 found no secrets in the staged publication tree; npm audit reported zero known vulnerabilities. Diagnostic recovery material was saved privately on the VPS and copied to protected off-VPS storage with checksum verification.

Before public activation, require a surviving two-game run, published results, financial bindings for the new app, a complete Chaos betting/payout cycle, a validated close/renew cycle, and the rating-preservation release gate. Keep legacy bindings and journals for previous obligations. A green health response alone is insufficient.

Public evidence: [recovery summary](validation/chaos-recovery-2026-09-09.json). Earlier incident: [8 September runtime report](INTERLUDE_RUNTIME_INCIDENT_2026-09-08.md).
