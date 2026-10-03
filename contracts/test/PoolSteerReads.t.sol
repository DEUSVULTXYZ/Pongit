// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArenaTest} from "./ReusableAgentArena.t.sol";
import {PoolSteer} from "../src/agents/competition/PoolSteer.sol";
import {AgentSteer as S} from "../src/agents/AgentSteer.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {ChaosModifiers as M} from "../src/chaos/ChaosModifiers.sol";

contract PoolSteerReadHarness {
    mapping(bytes32=>uint256) words;
    function compare(ChaosEngine kernel,uint256[8] memory packed,uint256 control,uint256 classicPaddles)
        external returns(bytes32 full,bytes32 compact,int256[4] memory expected,int256[4] memory actual)
    {
        for(uint256 i;i<8;i++)words[S._key(1,21+i)]=packed[i];
        words[S._key(1,7)]=classicPaddles;words[S._key(1,8)]=control;
        full=keccak256(abi.encode(kernel.physics().dynamics().paddles(kernel.codec().unpack(packed,bytes32(0),control))));
        compact=keccak256(abi.encode(PoolSteer.paddles(words,1,kernel,uint64(packed[6]>>112))));
        for(uint8 mode;mode<2;mode++)for(uint8 side;side<2;side++){
            expected[mode*2+side]=S._view(words,1,mode,side).opponent;
            actual[mode*2+side]=PoolSteer.opponent(words,1,mode,side);
        }
    }
}

contract PoolSteerReadsTest is ReusableAgentArenaTest {
    PoolSteerReadHarness reader;
    function setUp() public override {super.setUp();reader=new PoolSteerReadHarness();}
    function compare(uint256[8] memory packed,uint256 control,uint256 classic) internal {
        (bytes32 full,bytes32 compact,int256[4] memory a,int256[4] memory b)=reader.compare(kernel,packed,control,classic);
        assertEq(full,compact,"steering modifier authority changed");
        assertEq(keccak256(abi.encode(a)),keccak256(abi.encode(b)),"opponent observation changed");
    }
    function testAllEffectPairsAtActivationPotatoTransitionAndExpiry() public {
        uint256[8] memory packed;
        // Unequal neutral/betting sizes expose swapped-side and bit-offset errors.
        packed[7]=(uint256(72e6)<<101)|(uint256(96e6)<<133);
        uint64[7] memory times=[uint64(999999),1000000,4999999,5000000,8999999,9000000,9000001];
        for(uint8 a=1;a<=24;a++)for(uint8 b=a;b<=24;b++)for(uint8 side;side<3;side++){
            // Remaining/variant bits do not decide geometry, including consumed
            // charges. The reference pipeline deliberately ignores these too.
            packed[4]=uint256(a)|(uint256(side)<<8)|(uint256(1)<<16)|(uint256(1000)<<56)|(uint256(9000)<<88);
            packed[5]=uint256(b)|(uint256(2-side)<<8)|(uint256(15)<<120)|(uint256(1000)<<56)|(uint256(9000)<<88);
            for(uint8 t;t<times.length;t++){
                packed[6]=uint256(180e12)|(uint256(420e12)<<56)|(uint256(times[t])<<112);
                compare(packed,5,uint256(120e6)|(uint256(460e6)<<64));
            }
        }
    }
    function testFuzzPackedReadMatchesFullCodec(uint256[8] memory packed,uint256 control,uint256 classic) public {
        // Preserve arbitrary unrelated bits, both live balls and packed clocks.
        // Bound only the fields validated by the existing modifier contract.
        for(uint8 i;i<2;i++){
            uint256 e=packed[4+i];uint8 id=uint8(e)%25;uint8 target=uint8(e>>8)%3;
            uint32 start=uint32(e>>56)%1_000_000;uint32 end=start+1+uint32(e>>88)%1_000_000;
            packed[4+i]=(e&~(uint256(0xffff)|(uint256(type(uint64).max)<<56)))|id|(uint256(target)<<8)|(uint256(start)<<56)|(uint256(end)<<88);
        }
        uint32 a=uint32(72e6+uint32(packed[7]>>101)%24_000_001);
        uint32 b=uint32(72e6+uint32(packed[7]>>133)%24_000_001);
        packed[7]=(packed[7]&~(uint256(type(uint64).max)<<101))|(uint256(a)<<101)|(uint256(b)<<133);
        compare(packed,control,classic);
    }
}
