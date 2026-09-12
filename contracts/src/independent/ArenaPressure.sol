// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AuthorityStore as S} from "../autonomous/AuthorityStore.sol";

/// Immutable linked testnet bridge logic; no payment or result permissions.
library ArenaPressure {
    bytes32 constant PRESSURE = keccak256("ArenaPressure(uint256 epoch,uint256 matchId,uint8 rally,uint64 resumeAt,uint128 paidA,uint128 paidB,uint64 sourceBlock,bytes32 checkpoint,uint64 expires)");
    struct Attestation {
        uint256 epoch; uint256 matchId; uint8 rally; uint64 resumeAt;
        uint128 paidA; uint128 paidB; uint64 sourceBlock; bytes32 checkpoint; uint64 expires;
    }
    event PressureAttested(uint256 indexed matchId, uint8 rally, uint64 sourceBlock, bytes32 checkpoint, uint256 paidA, uint256 paidB);
    function digest(bytes32 domain, Attestation calldata p) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domain, keccak256(abi.encode(PRESSURE,p))));
    }
    function submit(mapping(bytes32=>uint256) storage w, bytes32 domain, address signer, Attestation calldata p, bytes calldata signature) public {
        uint256 id = p.matchId; uint256 meta = S.get(w,0,id,0);
        uint256 control = S.get(w,0,id,8); uint256 chaos = S.get(w,0,id,13);
        require(((meta >> 161)&7) == 2 && ((meta >>168)&1) == 1 && ((chaos >>128)&1) == 1, "pressure match");
        require(p.rally == ((control>>4)&15)+((control>>8)&15) && p.resumeAt == uint64(chaos>>64)
            && p.checkpoint != 0 && p.sourceBlock > 0, "pressure boundary");
        require(p.expires > block.timestamp && p.expires <= block.timestamp+30
            && p.paidA >= S.get(w,0,id,14) && p.paidB >= S.get(w,0,id,15), "pressure stale");
        require(ECDSA.recover(digest(domain,p),signature) == signer, "bridge signature");
        uint256 packed = S.get(w,0,id,16); uint256 totals = uint256(p.paidA)|(uint256(p.paidB)<<128);
        if (uint8(packed) == p.rally && uint64(packed>>8) == p.resumeAt) {
            require(S.get(w,0,id,17) == totals && bytes32(S.get(w,0,id,18)) == p.checkpoint
                && uint64(packed>>136) == p.sourceBlock, "checkpoint immutable");
            if (p.expires <= uint64(packed>>72)) return;
        }
        S.set(w,0,id,16,uint256(p.rally)|(uint256(p.resumeAt)<<8)|(uint256(p.expires)<<72)|(uint256(p.sourceBlock)<<136));
        S.set(w,0,id,17,totals); S.set(w,0,id,18,uint256(p.checkpoint));
        emit PressureAttested(id,p.rally,p.sourceBlock,p.checkpoint,p.paidA,p.paidB);
    }
}
