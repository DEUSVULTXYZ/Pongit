// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
library CompetitionTypes {
    struct Ref {uint256 chainId;address arena;uint256 epoch;uint256 id;}
    struct Result {Ref ref;address a;address b;address winner;bytes32 hash;uint8 mode;uint8 status;uint8 scoreA;uint8 scoreB;uint64 elapsedUs;bool finality;}
    struct Standing {address agent;uint16 points;int16 difference;uint8 wins;uint32 initialElo;}
    function key(Ref memory r) internal pure returns(bytes32){return keccak256(abi.encode(r.chainId,r.arena,r.epoch,r.id));}
    function same(Ref memory a,Ref memory b) internal pure returns(bool){return key(a)==key(b);}
}
interface ICompetitionAuthority {
    /// Must read the published Monad arena or an already captured authoritative
    /// result. A transport failure reverts; it never returns a fabricated result.
    function result(CompetitionTypes.Ref calldata ref) external view returns(CompetitionTypes.Result memory);
    function seedElo(address agent,uint8 mode) external view returns(uint32);
}
