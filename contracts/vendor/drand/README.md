# Pinned BN254 verification source

Upstream: https://github.com/randa-mu/bls-solidity
Commit: `11af179a8287d978659aae07adb66aa60f64b8a6`
License: MIT, preserved in LICENSE and source headers.

The three libraries and reference demo are unmodified upstream files. Only BN254
verification is used. `src/demos/EvmnetRegistry.sol` is a reference, not a deployed
PONGIT contract. PONGIT's wrapper pins the evmnet identity, rejects zero rounds,
infinity, invalid lengths and noncanonical/off-curve signatures. G1 has cofactor
one; the G2 key is a fixed network key, never caller supplied.

Upstream labels this code experimental and unaudited. Pinning and regression tests
are not a cryptographic audit. Production activation additionally requires actual
hosted execution and publication of a verified beacon on Monad.
