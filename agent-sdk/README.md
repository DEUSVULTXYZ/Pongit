# PONGIT Agent SDK

## Version-2 pool candidate

The independent-arena generation uses **on-chain strategies only**. The legacy
real-time controller below is retained for historical private deployments and
cannot register in the new catalogue. Public gates remain closed.

The new exports are `preparePoolRegistration`, `preparePoolChallenge`,
`createPoolObserver`, `validateAgentPoolManifest` and `pooledHouseBots`. A signed
intent is not a sent transaction. Preserve it through an uncertain response and
reconcile its contract nonce before signing another. Registration uses the
creator's signature; a human challenge uses the limited arcade key and its
verified family grant. Neither grants spending permission.

```ts
const call = await preparePoolRegistration(monad, manifest, creator, {
  strategy: deployedTracker,
  name: 'My tracker',
  avatar: 7,
  modes: 3, // Classic and Chaos
});
// Pass call.to and call.data to your durable transaction writer.
// Retain call.digest, nonce and deadline for reconciliation.
```

Compile the example with `FOUNDRY_PROFILE=strategies forge build --root contracts`
to disable the metadata trailer. The immutable opcode check rejects storage,
external calls, logs, creation and environment-dependent instructions. The
catalogue verifies the strategy's `creator()` and code hash. Availability is a
separate creator-controlled setting; a newly registered community strategy
starts unavailable. Qualification then needs published friendly play in each
requested mode, with at least three valid decisions and no invalid decision.
The score does not decide technical qualification. Temporary engine failures
schedule another trial instead of failing the strategy.

`createPoolObserver(manifest, matchView, url => new WebSocket(url))` is read-only.
It checks the node's application, epoch, chain and rules and rejects mismatched
participants. A match view with a published result has no live node, so an old
link cannot join an arena's replacement match. It does not create a wallet or
send ticks. Use `watch`, `read` and `close`, and pause observation in hidden tabs.

The pool sponsor adapter, full human authorization flow and real hosted trial
remain integration gates. See [the candidate status](../docs/AGENT_POOL.md).
Do not point `agent-sdk/strategy.ts` or `createAgentClient` at a version-2 manifest:
those entry points implement the historical API described next.

## Historical single-application API

This SDK is being qualified against a **dedicated testnet application**. Do not
point an agent at the human rooms deployment. Public admission stays disabled
until the hosted-capacity checks and the 24-hour run have passed.

There are two ways to build an agent.

**An on-chain strategy** (recommended, and the only kind a public arcade accepts
by default). Deploy a contract implementing
[`IPongStrategy`](../contracts/src/agents/IPongStrategy.sol) on Monad Testnet.
The arcade calls its `decide(view)` on every 100 ms of game time, under
STATICCALL and with 50,000 gas, and moves the paddle by its answer (-1 up, 0
hold, 1 down). Nothing of yours has to keep running. Start from
[`TrackerStrategy`](../contracts/src/agents/examples/TrackerStrategy.sol), which
predicts where the ball crosses its paddle line in 2,700 to 6,300 gas, then
register it with only your creator key. Run both lines from the repository
root:

```sh
forge build --root contracts
CREATOR_KEY=0x... DEPLOY=tracker WAIT=1 npx tsx agent-sdk/strategy.ts
```

`--root contracts` matters: the Foundry configuration lives in
`contracts/foundry.toml`, and a bare `forge build` at the root neither resolves
its imports nor writes `contracts/out`, where the script reads the compiled
tracker. `npm run contracts:build` runs the same command.

The tracker is deployed once. Its address is recorded in
`.agent-state/strategies.json` (private, outside Git; `STRATEGY_STATE` moves
it), and every later run registers that same contract instead of deploying
another. Each epoch runs against Monad as it was when it opened, so a strategy
deployed after that is refused with `AGENT_STRATEGY_NEXT_EPOCH` and nothing is
registered: it does not become playable by itself. The script then exits with
code 2; run the same command once the arcade has renewed, and it registers the
tracker it already deployed. For your own contract, set `STRATEGY=0x...` instead
of `DEPLOY` and send it again the same way.

The service checks the contract on Monad first and says exactly what is wrong:
no contract, a `creator()` that does not name you, or a `decide()` that reverts,
runs out of gas or answers outside -1..1. It then qualifies each mode with one
friendly match in which your paddle must move.

While the arcade renews, rate-limits or restarts, the script waits and tries
again, for up to an hour. With `WAIT=1` it follows qualification for at most six
hours (`WAIT_HOURS`) and stops if the strategy leaves the catalog or the service
moves to a new arcade. Exit codes: 0 registered (with `WAIT=1`, qualified in
every mode), 1 an error it printed, 2 run it again after the next renewal, 3 a
mode failed qualification and the same command queues it again, 4 `WAIT`
stopped following it.

Under Chaos, `PongView.half` is the paddle's base half-height: it does not
follow the paddle-size effects (MEGA PADDLE, POCKET PADDLE, GLASS CANNON, BOSS
ROUND, SIZE SWAP, SPLIT PADDLE), so keep a margin rather than aim with the
paddle's edge. Reporting the effective size waits for the arcade's next
redeployment.

**A hosted real-time agent.** A dedicated playing address, whose creator and
that address both sign registration, driven by a process you keep running. It
sends its own inputs and ticks, which costs the arcade about twenty times the
hub batches of a strategy, so a public arcade closes this kind unless its
configuration says `registration.realtimeAgents: true`. Creators keep their
keys and run their own processes; PONGIT does not accept or execute uploaded
code.

The SDK exports `createAgentClient`, `AgentController`, the three house bot
presets, registration types, match references, the dedicated contract ABI, and
for strategies `pongStrategyAbi`, `STRATEGY_GAS` and `strategySamples`, the
positions a strategy must answer before it is registered.
Transport uses the current Interlude SDK, compact game grants, applied events,
one sequential command lane and a durable command journal. A lost reply must be
reconciled before signing another transaction. Keep the store private and atomic.

Public registration, qualification, availability and challenge API documentation
will be published with the verified deployment. The example is not a promise
that a dedicated node is currently available.
### Independent pool sponsorship (private candidate)

Version-2 helpers now include `preparePoolFamily`, `loadPoolFamily`, `observePoolFamily` and `createPoolSponsor`. Supply a Monad client, the approved pool manifest, the explicitly connected owner and browser `sessionStorage`. A valid two-hour arcade grant is reused across arenas; a failed network read does not discard it or prompt for another signature.

Reconcile `sponsor.resume()` before preparing another signed action. Send the returned family or challenge call with `sponsor.send(call)` and keep polling `resume()` while it is queued or pending. The tab stores exact signed bytes before POST. A timeout leaves the operation pending. Confirmed reverts and explicit non-acceptance are separate from temporary errors. Never replace an uncertain operation with a newly signed nonce.

The transport receives relative `operations/:id` GET and `transactions` POST paths under the configured PONGIT `/agents` service. It must propagate HTTP status and the structured `accepted` / `code` fields on errors. Do not send authorizations to a community agent's URL. This candidate requires the private sponsor adapter; it is not available on the public service yet. The current catalogue's availability setter still requires a creator transaction.
