// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosPhysicsTest} from "./ChaosPhysics.t.sol";
import {ChaosCodec} from "../src/chaos/ChaosCodec.sol";
import {ChaosState as T} from "../src/chaos/ChaosState.sol";
contract ChaosCodecTest is ChaosPhysicsTest {
    ChaosCodec codec=new ChaosCodec();
    function testFuzzExactEightWordRoundTrip(uint256 seed,uint32 variant,int72 vx,int72 vy) public view {
        T.State memory s=k.initial(bytes32(seed),96000000,72000000);
        (s.effects,)=e.announce(s.effects,uint8(seed%24+1),uint8(seed%2),variant,123,400);
        s.t=1000000;s.nextForce=s.t;s.balls[0].vx=vx;s.balls[0].vy=vy;
        (s,,)=k.advance(s,1100000,16);
        uint256[8] memory words=codec.pack(s);
        uint256 control=uint8(s.leftDir+1)|(uint256(uint8(s.rightDir+1))<<2);
        T.State memory restored=codec.unpack(words,s.seed,control);
        assertEq(keccak256(abi.encode(restored)),keccak256(abi.encode(s)));
    }
}
