// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PongRoomsCompact} from "../src/labs/PongRoomsCompact.sol";
import {PongInterludeRoomsChaos} from "../src/labs/PongInterludeRoomsChaos.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract CompactRoomsTest is Test {
    uint256 constant C=0xc0; uint256 constant A=0xa0; uint256 constant B=0xb0;
    address constant H=address(0x1234); address constant K=address(0xabc); address constant L=address(0xdef);
    PongRoomsCompact g;
    function setUp() public {
        vm.chainId(10143);vm.warp(1000);vm.roll(100);
        g=new PongRoomsCompact(IInterludeHub(H),vm.addr(C),address(0x100),address(this),address(0));
        epoch(1);vm.mockCall(H,abi.encodeWithSelector(IInterludeHub.sessionEpochOf.selector),abi.encode(uint64(0)));vm.chainId(4242);
    }
    function epoch(uint256 n) internal {Types.Session memory s;s.epoch=n;s.status=Types.Status.Active;
        vm.mockCall(H,abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(g),Types.GLOBAL),abi.encode(s));}
    function signature(bytes32 digest,uint256 key) internal pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,digest);return abi.encodePacked(r,s,v);}
    function grant(uint256 key,address control) internal view returns(Types.SessionGrant memory s){
        s=Types.SessionGrant(vm.addr(key),control,2000,0,false,new bytes4[](5));
        s.selectors[0]=g.acceptMatch.selector;s.selectors[1]=g.input.selector;s.selectors[2]=g.tick.selector;s.selectors[3]=g.cancelMatch.selector;s.selectors[4]=g.concede.selector;
    }
    function register(uint256 key,address control) internal {Types.SessionGrant memory s=grant(key,control);bytes memory sig=signature(g.sessionDigest(s),key);vm.prank(control);g.registerControls(abi.encode(s,sig));}
    function start(uint256 id,uint8 mode,address a,address b,address ka,address kb) internal {
        PongInterludeRoomsChaos.Offer memory o=PongInterludeRoomsChaos.Offer(id,bytes32(id),a,b,mode,true,uint64(block.timestamp+20),5,bytes32(id));
        bytes memory sig=signature(g.ticketDigest(o),C);vm.prank(ka);g.acceptMatch(o,sig);vm.prank(kb);g.acceptMatch(o,sig);
    }
    function testCompactKeyCanAcceptMoveAndConcedeForOwnerInBothModes() public {
        register(A,K);register(B,L);
        for(uint8 mode;mode<2;mode++){
            uint256 id=mode+1;start(id,mode,vm.addr(A),vm.addr(B),K,L);
            vm.roll(block.number+1);vm.prank(K);g.input(id,1,1,block.number+10);
            (,,,address a,address b,,,,,uint256 nonce,,,)=g.getSnapshot(id);assertEq(a,vm.addr(A));assertEq(b,vm.addr(B));assertEq(nonce,1);
            vm.prank(L);g.concede(id);assertEq(g.activeCount(),0);
        }
    }
    function testScopeKeySignatureExpiryAndEpochAreVerifiedOnce() public {
        Types.SessionGrant memory s=grant(A,K);bytes memory sig=signature(g.sessionDigest(s),A);
        vm.prank(L);vm.expectRevert();g.registerControls(abi.encode(s,sig));
        s.anyFunction=true;sig=signature(g.sessionDigest(s),A);vm.prank(K);vm.expectRevert();g.registerControls(abi.encode(s,sig));
        s=grant(A,K);s.selectors[0]=g.closeEngine.selector;sig=signature(g.sessionDigest(s),A);vm.prank(K);vm.expectRevert();g.registerControls(abi.encode(s,sig));
        s=grant(A,K);s.selectors[0]=s.selectors[1];sig=signature(g.sessionDigest(s),A);vm.prank(K);vm.expectRevert();g.registerControls(abi.encode(s,sig));
        s=grant(A,K);s.expiry=10000;sig=signature(g.sessionDigest(s),A);vm.prank(K);vm.expectRevert();g.registerControls(abi.encode(s,sig));
        s=grant(A,K);s.epoch=1;sig=signature(g.sessionDigest(s),A);vm.prank(K);vm.expectRevert();g.registerControls(abi.encode(s,sig));
        s=grant(A,K);sig=signature(g.sessionDigest(s),B);vm.prank(K);vm.expectRevert();g.registerControls(abi.encode(s,sig));
    }
    function testCachedKeyCannotSpendOrChangeOthersAndCannotEscapeEpochExpiryOrRevocation() public {
        register(A,K);register(B,L);start(1,0,vm.addr(A),vm.addr(B),K,L);
        vm.prank(K);vm.expectRevert();g.closeEngine();vm.prank(K);vm.expectRevert();g.renewEngine();
        vm.prank(K);vm.expectRevert();g.revokeControls(L);
        epoch(2);vm.prank(K);vm.expectRevert();g.input(1,1,1,110);epoch(1);
        vm.warp(2000);vm.prank(K);vm.expectRevert();g.concede(1);vm.warp(1000);
        vm.prank(K);g.revokeControls(K);vm.prank(K);vm.expectRevert();g.concede(1);
        Types.SessionGrant memory s=grant(A,K);bytes memory sig=signature(g.sessionDigest(s),A);vm.prank(K);vm.expectRevert();g.registerControls(abi.encode(s,sig));
        vm.prank(vm.addr(B));g.revokeControls(L);assertEq(uint64(g.controlBinding(L)>>160),0);
    }
    function testNewEngineRequiresRebindingButDoesNotExpandGrant() public {
        register(A,K);uint256 original=g.controlBinding(K);register(A,K);assertEq(g.controlBinding(K),original);
        epoch(2);register(A,K);assertEq(g.controlBinding(K)>>224,2);
        vm.chainId(10143);Types.SessionGrant memory s=grant(B,L);bytes memory sig=signature(g.sessionDigest(s),B);vm.prank(L);vm.expectRevert();g.registerControls(abi.encode(s,sig));
    }
    function testGrantFromAnotherAppAndMalformedProofAreRejected() public {
        assertLe(address(g).code.length,24576,"Hosted runtime size limit");
        Types.SessionGrant memory s=grant(A,K);PongRoomsCompact other;
        vm.chainId(10143);other=new PongRoomsCompact(IInterludeHub(H),vm.addr(C),address(0x100),address(this),address(0));vm.chainId(4242);
        bytes memory sig=signature(other.sessionDigest(s),A);vm.prank(K);vm.expectRevert();g.registerControls(abi.encode(s,sig));
        vm.prank(K);vm.expectRevert();g.registerControls(hex"0000");
    }
    function testBindingAndTwoActiveModesFitPublicationBudget() public {
        vm.record();register(A,K);register(B,L);register(0xe0,address(0xeee));register(0xf0,address(0xfff));
        start(1,0,vm.addr(A),vm.addr(B),K,L);start(2,1,vm.addr(0xe0),vm.addr(0xf0),address(0xeee),address(0xfff));
        vm.roll(120);vm.prank(K);g.input(1,1,1,130);vm.prank(address(0xeee));g.input(2,-1,1,130);
        vm.prank(L);g.concede(1);vm.prank(address(0xfff));g.concede(2);
        (,bytes32[] memory writes)=vm.accesses(address(g));uint256 unique;
        for(uint256 i;i<writes.length;i++){bool seen;for(uint256 j;j<i;j++)if(writes[i]==writes[j])seen=true;if(!seen)unique++;}
        emit log_named_uint("Two games, four bindings and results: unique slots",unique);assertLe(unique,64);
    }
}
