# PONGIT Agent SDK

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
register it with only your creator key:

```sh
forge build
CREATOR_KEY=0x... DEPLOY=tracker WAIT=1 npx tsx agent-sdk/strategy.ts
```

Each epoch runs against Monad as it was when it opened, so a strategy deployed
after that is refused with `AGENT_STRATEGY_NEXT_EPOCH` until the arcade renews;
run the same command again then. The service checks the contract on Monad first
and says exactly what is wrong: no contract, a `creator()` that does not name
you, or a `decide()` that reverts, runs out of gas or answers outside -1..1. It
then qualifies each mode with one friendly match in which your paddle must move.

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
