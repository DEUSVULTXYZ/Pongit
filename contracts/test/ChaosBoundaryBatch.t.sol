// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {SimultaneousBase} from "./ChaosSimultaneousContacts.t.sol";
import {ChaosState as T} from "../src/chaos/ChaosState.sol";
import {ChaosEffects as E} from "../src/chaos/ChaosEffects.sol";

contract ChaosBoundaryBatchTest is SimultaneousBase {
    function testAllKernelModulesFitEip170() public view {
        assertLe(address(k).code.length,24576);assertLe(address(k.impacts()).code.length,24576);
        assertLe(address(c).code.length,24576);assertLe(address(d).code.length,24576);
        assertLe(address(e).code.length,24576);assertLe(address(r).code.length,24576);assertLe(address(m).code.length,24576);
    }
    function testRetiredMultiballCannotConsumePower() public view {
        T.State memory s=single();
        s.effects[0]=E.Effect(21,2,0,1,0,1200,0);s.effects[1]=E.Effect(4,0,1,2,0,9000,0);
        s.activeMask=uint24(1)<<20|uint24(1)<<3;
        s.balls[1]=abi.decode(abi.encode(s.balls[0]),(T.Ball));
        place(s,0,512*P,288*P,100e6,0);place(s,1,40*P+232e6*200000-1000,288*P,-232e6,0);
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,1200000,128);
        assertFalse(next.balls[1].alive);assertEq(next.effects[1].id,4);
        for(uint256 i;i<log.length;i++)assertTrue(log[i].ball!=2);
    }
    function testHotPotatoSimultaneousHitsKeepPriorHolder() public view {
        for(uint8 holder;holder<2;holder++)for(uint8 overshoot;overshoot<2;overshoot++){
            T.State memory s=multiball();s.effects[1]=E.Effect(10,holder,0,2,0,7000,0);s.activeMask|=uint24(1)<<9;
            place(s,0,40*P+232e6*200000-int256(uint256(overshoot))*1000,288*P,-232e6,0);
            place(s,1,984*P-232e6*200000+int256(uint256(overshoot))*1000,288*P,232e6,0);
            (T.State memory next,,T.Collision[] memory log)=k.advance(s,1250000,128);
            assertEq(next.effects[1].target,holder);assertEq(kinds(log,1200000),bit(1,3)|bit(2,4));
        }
    }
    function testBrickAtForceBoundaryIsNotLost() public view {
        T.State memory s=single();s.effects[0]=E.Effect(17,2,0,1,0,9000,0);s.effects[1]=E.Effect(19,2,7,2,0,12000,0);
        s.activeMask=uint24(1)<<16|uint24(1)<<18;place(s,0,478*P-100e6*200000+1000,200*P,100e6,0);
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,1200000,128);
        assertLt(next.balls[0].vx,0);assertEq(next.effects[1].remaining,6);assertEq(kinds(log,1200000),bit(1,15));
    }
}
