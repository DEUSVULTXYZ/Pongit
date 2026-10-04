# PvP hosting outage — 4 October 2026, 07:30 UTC

PvP remains unavailable. This investigation did not restore gameplay, deploy a
replacement, send a transaction, or restart a service. Agent fixes remain deployed.
The scheduled qualification stays paused.

## Current evidence

- Public API at 07:28 UTC: human admission is enabled, sponsoring available,
  but all three human engines are offline. The API process being healthy does
  not establish gameplay availability.
- Canonical Monad block 68055478: both lobby slots and all three reservations
  are empty; the public ledger has 25 results. Arenas are in epochs 63, 64 and 62,
  each Active with zero published batches. This is not occupied PvP capacity.
- The human relayer has remained running since 02:20 UTC with no restarts. Its
  matching-hub routing fix is mounted. The original lifecycle journal contains
  no pending operation; a stuck operator nonce does not explain the outage.
- The legacy control and three exact human node URLs repeatedly time out from
  the VPS. Control and the first node also time out from Windows over IPv4.
  VPS IPv6 has no route, and IPv4 still times out: changing address family does
  not recover the service.
- The new control answers with `machines near capacity: 50/50`. Its validator
  delegation allowance is separate from hosted-machine capacity. The nine
  earlier private releases are already complete with exact sealed roots; do
  not repeat them or claim their release freed a hosted machine.

Machine-readable evidence is in `pvp-hosting-20261004/`. The first hosting
summary looked for machine counters at the wrong JSON depth; its warning and
HTTP results remain valid. `control.json` retains the complete public health
response without that extraction error. These are read-only diagnostics, not
passing admission or gameplay tests.

## Recovery boundary

The current public lobby and its sealed arena list bind the legacy hub
`0x3Ef8327F69e09cf721772F345e2A887eA22cD595`. The public v3 control binds
`0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e`. Replacing a hostname, changing an
admission flag, or redirecting the public manifest to a private qualification
season cannot perform a compatible migration.

Recovery needs either functioning legacy hosting for those exact arenas or
actual v3 hosting for new public-human contracts, together with preservation
of the public source's ratings, history, identities, sessions and financial
rights. No fresh public-human provisioning or migration was claimed here.
The private human contracts were not substituted for public history.

The current official SDK exposes session create/get/opt-in, not an owner
stop/delete operation for hosted machines. No undocumented admin endpoint,
provider credential, provider configuration change, additional deployment,
duplicate lifecycle writer or Monad gameplay fallback was attempted. Additional
test MON cannot revive the unreachable legacy service or change the reported
hosted-machine ceiling.

Latest source references checked during this investigation:
[deployment map](https://github.com/Veenoway/interlude-sdk/blob/main/docs/DEPLOYMENTS.md),
[session CLI](https://github.com/Veenoway/interlude-sdk/blob/main/cli/src/sessions.ts).

Existing public databases, contracts, balances, results and off-VPS backup
`play-recovery-20261004T0615Z` remain intact. No runtime mutation means no new
database backup or restore was needed for this diagnostic.
