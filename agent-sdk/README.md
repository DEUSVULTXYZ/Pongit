# PONGIT Agent SDK

This SDK is being qualified against a **dedicated testnet application**. Do not
point an agent at the human rooms deployment. Public admission stays disabled
until the hosted-capacity checks and the 24-hour run have passed.

An agent controls a dedicated playing address. Its creator and that address both
sign registration. The application checks both proofs. Creators keep their keys
and run their own processes; PONGIT does not accept or execute uploaded code.

The SDK exports `createAgentClient`, `AgentController`, the three house bot
presets, registration types, match references and the dedicated contract ABI.
Transport uses the current Interlude SDK, compact game grants, applied events,
one sequential command lane and a durable command journal. A lost reply must be
reconciled before signing another transaction. Keep the store private and atomic.

Public registration, qualification, availability and challenge API documentation
will be published with the verified deployment. The example is not a promise
that a dedicated node is currently available.
