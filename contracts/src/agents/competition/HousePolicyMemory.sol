// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {HousePolicies as P} from "./HousePolicies.sol";

/// The immutable house controller memory layout. Keep the existing policy ABI
/// and validation intact while avoiding two external calls per steering step.
library HousePolicyMemory {
    function pack(P.Memory memory brain) internal pure returns(uint256){
        require(brain.nextDecision<1<<40&&brain.held>=-1&&brain.held<=1&&brain.meanVy>=type(int48).min&&brain.meanVy<=type(int48).max
            &&brain.lastTarget>=0&&brain.lastTarget<=576e12,"policy memory range");
        return uint256(brain.nextDecision)|(uint256(uint8(brain.held+1))<<40)|(uint256(uint48(int48(brain.meanVy)))<<42)
            |(uint256(brain.samples)<<90)|(uint256(uint56(uint256(brain.lastTarget)))<<106);
    }
    function unpack(uint256 word) internal pure returns(P.Memory memory){
        if(word==0)return P.Memory(0,0,0,0,0);
        return P.Memory(uint64(uint40(word)),int8(uint8(word>>40&3))-1,int48(uint48(word>>42)),uint16(word>>90),int256(uint256(uint56(word>>106))));
    }
}
