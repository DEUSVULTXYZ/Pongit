// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IChaosProof {
    struct Boundary {
        uint256 chainId;
        address game;
        address market;
        uint256 generation;
        uint256 matchId;
        uint8 rally;
        uint64 resumeAt;
    }

    struct Checkpoint {
        uint256 paidA;
        uint256 paidB;
        uint64 sourceBlock;
        bytes32 sourceHash;
        bytes32 commitment;
    }
    /// Must authenticate a Monad root, inclusion, finality, cutoff and this entire boundary.
    /// A server signature or an unanchored eth_getProof response is not sufficient.
    function verify(Boundary calldata boundary, bytes calldata proof) external view returns (Checkpoint memory);
    function supported() external view returns (bool);
}

/// Deliberately closed candidate. No production verifier is fabricated in this delivery.
contract UnsupportedChaosProof is IChaosProof {
    error ProofTransportUnavailable();

    function supported() external pure returns (bool) {
        return false;
    }

    function verify(Boundary calldata, bytes calldata) external pure returns (Checkpoint memory) {
        revert ProofTransportUnavailable();
    }
}

interface IMonadPressure {
    function checkpoint(uint256 matchId, uint8 rally, uint64 resumeAt)
        external
        view
        returns (bool ready, IChaosProof.Checkpoint memory value);
}
