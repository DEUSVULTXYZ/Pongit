// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {DrandEvmnet} from "../src/chaos/DrandEvmnet.sol";
import {DrandHostedProbe} from "../src/labs/DrandHostedProbe.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract DrandEvmnetTest is Test {
    DrandEvmnet v;
    uint64 constant ROUND = 20594892;
    bytes32 constant RANDOM = 0xc1f2d208f143ffd619d40fde95838c4f49b3d44cb37d6daf68d45b124ba00c7e;
    bytes constant SIGNATURE = hex"1a8eb35e5dbdfe0e1aa1bda789444774adde84b2d5402468b29bb945ea190c6d105b63491744552e8fe5710764baaed371784f1593ce279c56c60b9268f50f90";
    function setUp() public { v = new DrandEvmnet(); }
    function testOfficialEvmnetVector() public view { assertEq(v.verify(ROUND, SIGNATURE), RANDOM); }
    function testWrongRound() public { vm.expectRevert(DrandEvmnet.InvalidBeacon.selector); v.verify(ROUND+1, SIGNATURE); }
    function testZeroRound() public { vm.expectRevert(DrandEvmnet.InvalidBeacon.selector); v.verify(0, SIGNATURE); }
    function testInfinity() public { vm.expectRevert(DrandEvmnet.InvalidBeacon.selector); v.verify(ROUND, new bytes(64)); }
    function testNonCanonicalCoordinates() public { vm.expectRevert(DrandEvmnet.InvalidBeacon.selector); v.verify(ROUND, abi.encode(type(uint256).max, uint256(1))); }
    function testRejectGeneratorAsSignature() public { vm.expectRevert(DrandEvmnet.InvalidBeacon.selector); v.verify(ROUND, abi.encode(uint256(1), uint256(2))); }
    function testTruncated() public { vm.expectRevert(DrandEvmnet.InvalidBeacon.selector); v.verify(ROUND, hex"12"); }
    function testExtraBytes() public { vm.expectRevert(DrandEvmnet.InvalidBeacon.selector); v.verify(ROUND, bytes.concat(SIGNATURE, hex"00")); }
    function testFuzzSingleBitCorruption(uint16 bit) public {
        bit = uint16(bound(bit,0,511)); bytes memory sig = SIGNATURE;
        sig[bit / 8] ^= bytes1(uint8(1 << (bit % 8)));
        vm.expectRevert(DrandEvmnet.InvalidBeacon.selector); v.verify(ROUND, sig);
    }
    function testFutureRoundBoundaries() public view {
        assertEq(v.roundAfter(1727521074),1); assertEq(v.roundAfter(1727521075),2);
        assertEq(v.roundAfter(1727521077),2); assertEq(v.roundAfter(1727521078),3);
    }
    function testProbeFutureCommitReplayAndDomain() public {
        vm.chainId(10143);
        // The chosen round is 181 seconds after constructor commitment.
        vm.warp(1727521075 + uint256(ROUND-1)*3 - 181);
        address h=address(0x1234);
        DrandHostedProbe p=new DrandHostedProbe(IInterludeHub(h));
        assertEq(p.expectedRound(),ROUND);
        Types.Session memory s; s.epoch=8; s.status=Types.Status.Active;
        vm.mockCall(h,abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(p),Types.GLOBAL),abi.encode(s));
        vm.expectRevert(DrandHostedProbe.EngineOnly.selector);p.prove(ROUND,SIGNATURE);
        vm.chainId(4242);
        vm.expectRevert(DrandHostedProbe.WrongRound.selector);p.prove(ROUND+1,SIGNATURE);
        (bytes32[] memory slots,bytes32[] memory maps,bytes32[] memory keys)=p.delegatedSurface();
        assertEq(slots.length,3);assertEq(maps.length,0);assertEq(keys.length,0);
        for(uint256 i;i<3;i++)assertEq(slots[i],bytes32(i));
        vm.record();
        p.prove(ROUND,SIGNATURE);
        (,bytes32[] memory writes)=vm.accesses(address(p));
        assertEq(writes.length,3);
        // Constant-key mapping writes can evade the hosted slot tracer. These
        // explicit scalar slots must be both advertised and the entire write set.
        for(uint256 i;i<writes.length;i++)assertLt(uint256(writes[i]),3);
        (bytes32 random,bytes32 draw,uint64 epoch)=p.result();
        assertEq(random,RANDOM);assertEq(epoch,8);
        assertEq(draw,keccak256(abi.encode("PONGIT_DRAND_QUALIFICATION_V1",uint256(10143),address(p),uint64(8),ROUND,RANDOM)));
        vm.expectRevert(DrandHostedProbe.AlreadyVerified.selector);p.prove(ROUND,SIGNATURE);
        vm.expectRevert();p.closeProbe();
    }
}
