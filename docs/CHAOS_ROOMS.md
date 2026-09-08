# Chaos rooms migration status

The owner requested Chaos in the new rooms, not a shortcut to the original arena. The live rooms deployment currently remains Classic-only. No Chaos selector or betting market is presented as operational there.

## Completed preparation

`contracts/src/labs/PhysicsRoomsChaos.sol` and `shared/physics-rooms-chaos.ts` implement matching candidate physics: first to seven, a 50% faster initial serve, 10% acceleration on each successful paddle return without a gameplay cap, and a reset on every serve. After a nonterminal point, advancement stops at the three-second pause. Resuming requires paid-pressure totals and freezes the resulting individual paddle sizes for the next rally.

The existing monetary thresholds are preserved: 0.002 test MON before any handicap, normal size up to 60% concentration, and a linear reduction capped at 25%. Five Solidity tests and 10,000 differential cases passed. These are physics tests, not a completed rooms or financial integration. Neither library is connected to the currently deployed contract.

## External and implementation requirements

The 8 September 2026 read of the public hub `0xDf840A85DB56430970b32f0e3210cabB5CD1F270` reported a maximum of eight delegations for validator `0xb28e684815b095ab5fb324214cfea63d76f3d691`, a stake reservation of 0.1 MON per delegation and 0.8 MON already reserved. A new deployment needs operator capacity. The active rooms application is `0xb3f9c323ffb8ec6a8cd7d06ae239bc3d7bebd59a`; its immutable Classic-only rules cannot be changed in place.

Chaos also needs a verified route from MON paid into the market on Monad to the pressure snapshot consumed by the live game, plus a settlement path respecting the challenge window. The current engine pins a base block; a browser read of current pressure is not automatically an authenticated engine input. The [provider's limits](https://interludelayer.xyz/docs/limits) warn against using stale delegated values as an oracle. Its [read model](https://interludelayer.xyz/docs/read) distinguishes engine state from the published, still-challengeable copy.

No coordinator-signed monetary oracle, synthetic bets or unbacked player balance has been introduced as a substitute. A pressure source, complete market/escrow integration, challenged-result handling and payout tests remain to be implemented after the transport and trust boundaries are established. Publication capacity must reserve room for bets as well as two simultaneous game results. New match consent must bind the mode, and both ELO ladders must stay separate.

## Questions for the operator

1. Can you provision a deployment slot for the next multi-room application without stopping the current arena, and support same-application delegation renewal?
2. What supported, verifiable mechanism can bring accepted Monad bet totals into the live app during a delegated session? Does it support a fresh base-state proof or an authenticated checkpoint without a discretionary PONGIT-server oracle?
3. How should a base-chain market verify a terminal game result after its challenge window, including a subsequent challenge or delegation renewal?
4. Can the publication budget exceed 64 storage diffs for the combined game and market workload, or must those domains use separate partitions?

All values and addresses above are public testnet observations. Existing V4 markets, Chaos games, ELO and financial rights are unchanged.
