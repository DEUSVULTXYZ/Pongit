// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PhysicsInterlude} from "../src/labs/PhysicsInterlude.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
contract ResponsivePhysicsHarness {
    function initial(bytes32 seed) external pure returns(PhysicsV2.State memory){return PhysicsInterlude.initial(seed);}
    function advance(PhysicsV2.State memory s,uint64 target,uint256 limit) external pure returns(PhysicsV2.State memory,bool){
        return PhysicsInterlude.advance(s,target,limit,300_000_000);
    }
}
