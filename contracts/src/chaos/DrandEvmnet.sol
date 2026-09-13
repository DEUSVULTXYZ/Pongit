// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BLS} from "../../vendor/drand/src/libraries/BLS.sol";

/// @notice Immutable evmnet identity. This verifies a beacon, not its eligibility
/// for a game: the caller must commit its future round and draw domain beforehand.
contract DrandEvmnet {
    bytes32 public constant CHAIN_HASH = 0x04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3;
    uint64 public constant GENESIS = 1727521075;
    uint64 public constant PERIOD = 3;
    string public constant SCHEME = "bls-bn254-unchained-on-g1";
    string public constant DST = "BLS_SIG_BN254G1_XMD:KECCAK-256_SVDW_RO_NUL_";
    error InvalidBeacon();
    error PrecompileUnavailable();

    function publicKey() public pure returns (BLS.PointG2 memory) {
        return BLS.PointG2([
            uint256(0x557ec32c2ad488e4d4f6008f89a346f18492092ccc0d594610de2732c8b808f),
            uint256(0x7e1d1d335df83fa98462005690372c643340060d205306a9aa8106b6bd0b382)
        ], [
            uint256(0x297d3a4f9749b33eb2d904c9d9ebf17224150ddd7abd7567a9bec6c74480ee0b),
            uint256(0x95685ae3a85ba243747b1b2f426049010f6b73a0cf1d389351d5aaaa1047f6)
        ]);
    }

    /// First round strictly AFTER the supplied Unix second. Round one is genesis.
    function roundAfter(uint64 timestamp) public pure returns (uint64) {
        if (timestamp < GENESIS) return 1;
        return (timestamp - GENESIS) / PERIOD + 2;
    }

    function verify(uint64 round, bytes calldata signature) external view returns (bytes32) {
        if (round == 0 || signature.length != 64) revert InvalidBeacon();
        BLS.PointG1 memory sig = BLS.g1Unmarshal(signature);
        // BN254 G1 has cofactor one. Reject infinity, non-canonical coordinates
        // and off-curve encodings before invoking the pairing precompile.
        if ((sig.x == 0 && sig.y == 0) || !BLS.isValidPointG1(sig)) revert InvalidBeacon();
        BLS.PointG1 memory message = BLS.hashToPoint(bytes(DST), abi.encodePacked(keccak256(abi.encodePacked(round))));
        (bool pairingSuccess, bool callSuccess) = BLS.verifySingle(sig, publicKey(), message);
        if (!callSuccess) revert PrecompileUnavailable();
        if (!pairingSuccess) revert InvalidBeacon();
        return sha256(signature);
    }
}
