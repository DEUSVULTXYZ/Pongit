// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// Candidate TESTNET transport, not a Monad state proof. Monad must independently
/// verify the exact issued ticket before consuming a result. The bridge cannot
/// authorize a payment, alter a ticket or select participants in that authority.
library ReusableAdmission {
    struct Ticket {
        address authority;
        address arena;
        uint256 epoch;
        uint256 sequence;
        uint256 matchId;
        bytes32 bindingHash;
        uint64 issuedAt;
        uint64 expires;
        uint64 sourceBlock;
        bytes32 sourceHash;
        uint256 rules;
    }
    bytes32 internal constant TYPEHASH = keccak256(
        "ArenaAdmission(address authority,address arena,uint256 epoch,uint256 sequence,uint256 matchId,bytes32 bindingHash,uint64 issuedAt,uint64 expires,uint64 sourceBlock,bytes32 sourceHash,uint256 rules)"
    );
    error InvalidAdmission();
    error InvalidBridgeSignature();

    function digest(Ticket memory t) internal pure returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("PONGIT Testnet Admission"), keccak256("1"), uint256(10143), t.arena
        ));
        return keccak256(abi.encodePacked("\x19\x01", domain, keccak256(abi.encode(TYPEHASH, t))));
    }

    /// Caller supplies its immutable authority/rules and actual current epoch,
    /// sequential admission counter and engine time, never values from an RPC.
    /// issuedAt/expires limit the attestation lifetime to 120 seconds. Commands
    /// still need each participant's scoped authorization and fresh match nonce.
    function verify(Ticket memory t, bytes memory signature, address bridge,
        address authority, address arena, uint256 epoch, uint256 nextSequence,
        uint256 rules, uint256 now_) internal pure returns (bytes32 hash)
    {
        if (bridge == address(0) || authority == address(0) || arena == address(0)
            || t.authority != authority || t.arena != arena || t.epoch != epoch || epoch == 0
            || t.sequence != nextSequence || nextSequence == 0 || t.matchId == 0
            || t.rules != rules || rules == 0 || t.bindingHash == 0
            || t.sourceBlock == 0 || t.sourceHash == 0 || t.issuedAt > now_
            || t.expires <= now_ || t.expires <= t.issuedAt || t.expires - t.issuedAt > 120)
            revert InvalidAdmission();
        hash = digest(t);
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        if (err != ECDSA.RecoverError.NoError || signer != bridge) revert InvalidBridgeSignature();
    }
}
