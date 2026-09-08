# Interlude Solidity sources

These MIT-licensed sources are vendored from `@interludelayer-sdk/cli` **0.1.4**, pinned in the root package lock. Preserve the upstream SPDX headers. The compatible SDK used by this repository is `@interludelayer-sdk/sdk` **0.1.1**.

The 0.1.4 refresh adds `syncDelegatedSlot` and the updated hub commit/resolution interfaces. This affects newly compiled contracts only; existing immutable deployments are unchanged.

`shared/abi-rooms-lifecycle.ts` is generated from the pinned CLI artifact. `shared/abi-rooms-lifecycle-legacy.ts` preserves the 0.1.3 hub read ABI: the new `delegationOf` tuple inserts `resolveThreshold`, while `sessionOf` retains its earlier layout. Lifecycle reads select the matching layout and reject unknown responses. Each application's immutable `hub()` determines its hub, including during migration checks.
