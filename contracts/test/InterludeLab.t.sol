// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PongInterlude} from "../src/labs/PongInterlude.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {Delegatable} from "../vendor/interlude/Delegatable.sol";
import {Session} from "../vendor/interlude/libraries/Session.sol";

contract InterludeLabTest is Test {
    PongInterlude game;
    address a = address(0xA);
    address b = address(0xB);
    address outsider = address(0xC);
    function setUp() public {
        vm.chainId(10143); vm.roll(100); vm.warp(1000);
        game = new PongInterlude(IInterludeHub(address(0x1234)));
        vm.chainId(4242);
    }
    function start() private {
        vm.prank(a); game.createMatch(b, bytes32(uint256(7)));
        vm.prank(b); game.acceptMatch(1);
    }
    function testOnlyEngine() public {
        vm.chainId(10143); vm.expectRevert(PongInterlude.EngineOnly.selector);
        game.createMatch(b, bytes32(0));
    }
    function testTargetedConsentAndDuplicateAccept() public {
        vm.prank(a); game.createMatch(b, bytes32(0));
        vm.prank(outsider); vm.expectRevert(PongInterlude.NotPlayer.selector); game.acceptMatch(1);
        vm.prank(b); game.acceptMatch(1);
        vm.prank(b); vm.expectRevert(PongInterlude.InvalidMatch.selector); game.acceptMatch(1);
    }
    function testInputPermissionsNonceExpiryAndDirection() public {
        start();
        vm.prank(outsider); vm.expectRevert(PongInterlude.NotPlayer.selector); game.input(1,1,1,110);
        vm.prank(a); game.input(1,1,1,110);
        vm.prank(a); vm.expectRevert(PongInterlude.StaleInput.selector); game.input(1,-1,1,110);
        vm.prank(a); vm.expectRevert(PongInterlude.StaleInput.selector); game.input(1,2,2,110);
        vm.roll(111); vm.prank(a); vm.expectRevert(PongInterlude.StaleInput.selector); game.input(1,0,2,110);
    }
    function testReleaseIsAppliedAfterElapsedMovement() public {
        start(); vm.prank(a); game.input(1,1,1,110);
        vm.roll(120); vm.prank(a); game.input(1,0,2,130);
        (,,,,,,,,,,,,PhysicsV2.State memory s)=game.getSnapshot();
        assertEq(s.left,324_000_000); assertEq(s.leftDir,0);
        vm.roll(140); game.tick(1);
        (,,,,,,,,,,,,s)=game.getSnapshot(); assertEq(s.left,324_000_000);
    }
    function testConcedeAndPersistentResult() public {
        start(); vm.prank(a); game.concede(1);
        bytes32 digest=game.resultHashes(1); assertTrue(digest!=0);
        vm.prank(b); game.createMatch(a,bytes32(0));
        assertEq(game.resultHashes(1),digest);
        vm.prank(a); vm.expectRevert(PongInterlude.InvalidMatch.selector); game.acceptMatch(1);
    }
    function testTimeoutAndCancellation() public {
        vm.prank(a); game.createMatch(b,bytes32(0));
        vm.prank(b); vm.expectRevert(PongInterlude.NotPlayer.selector); game.cancelMatch(1);
        vm.warp(1601); vm.prank(b); vm.expectRevert(PongInterlude.InvalidMatch.selector); game.acceptMatch(1);
        game.cancelMatch(1); assertTrue(game.resultHashes(1)!=0);
    }
    function testNaturalMatchAndPaddleBounds() public {
        start();
        vm.prank(a); game.input(1,-1,1,110);
        vm.prank(b); game.input(1,1,1,110);
        vm.roll(60100); game.tick(1);
        (,,uint256 phase,,,,,,,,,,PhysicsV2.State memory s)=game.getSnapshot();
        assertEq(phase,3); assertTrue(s.scoreA==7||s.scoreB==7);
        assertGe(s.left,48_000_000); assertLe(s.right,528_000_000);
        assertTrue(game.resultHashes(1)!=0);
    }
    function testArenaBusyAndOwnOpponent() public {
        vm.prank(a); vm.expectRevert(PongInterlude.NotPlayer.selector); game.createMatch(a,bytes32(0));
        start(); vm.prank(outsider); vm.expectRevert(PongInterlude.ArenaBusy.selector); game.createMatch(address(0),bytes32(0));
    }
    function testClockCannotRunBackwards() public {
        start(); vm.roll(99); vm.expectRevert(PongInterlude.InvalidMatch.selector); game.tick(1);
    }
    function testGrantChecksActorExpiryAndEmptyScope() public {
        uint256 privateKey=0xAA11;
        address owner=vm.addr(privateKey);
        Types.SessionGrant memory grant=Types.SessionGrant(owner,address(this),uint64(block.timestamp+30),0,false,new bytes4[](1));
        grant.selectors[0]=game.createMatch.selector;
        vm.mockCall(address(0x1234),abi.encodeWithSelector(IInterludeHub.sessionEpochOf.selector,owner),abi.encode(uint256(0)));
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(privateKey,game.sessionDigest(grant));
        game.withSession(grant,abi.encodePacked(r,s,v),abi.encodeCall(game.createMatch,(b,bytes32(0))));
        vm.warp(1031); vm.expectRevert(); game.withSession(grant,abi.encodePacked(r,s,v),abi.encodeCall(game.createMatch,(b,bytes32(0))));
        grant.expiry=2000; grant.selectors=new bytes4[](0);
        (v,r,s)=vm.sign(privateKey,game.sessionDigest(grant));
        vm.expectRevert(); game.withSession(grant,abi.encodePacked(r,s,v),abi.encodeCall(game.createMatch,(b,bytes32(0))));
    }

    // Deterministic fixture only, never used as a network account.
    function signedGrant(bytes4 selector) private returns (Types.SessionGrant memory grant, bytes memory signature) {
        address owner=vm.addr(0xAA11);
        grant=Types.SessionGrant(owner,address(this),2000,0,false,new bytes4[](1));
        grant.selectors[0]=selector;
        vm.mockCall(address(0x1234),abi.encodeWithSelector(IInterludeHub.sessionEpochOf.selector,owner),abi.encode(uint256(0)));
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(0xAA11,game.sessionDigest(grant));
        signature=abi.encodePacked(r,s,v);
    }

    function testSessionCannotChangeItsAccountOrKey() public {
        (Types.SessionGrant memory grant,bytes memory sig)=signedGrant(game.createMatch.selector);
        bytes memory callData=abi.encodeCall(game.createMatch,(b,bytes32(0)));
        vm.prank(outsider); vm.expectRevert(Delegatable.WrongSessionKey.selector);
        game.withSession(grant,sig,callData);
        grant.granter=outsider;
        vm.mockCall(address(0x1234),abi.encodeWithSelector(IInterludeHub.sessionEpochOf.selector,outsider),abi.encode(uint256(0)));
        vm.expectRevert(Delegatable.SessionNotSignedByGranter.selector);
        game.withSession(grant,sig,callData);
    }

    function testSessionRejectsUnapprovedSelectorAndObservedRevocation() public {
        (Types.SessionGrant memory grant,bytes memory sig)=signedGrant(game.tick.selector);
        vm.expectRevert(Delegatable.SelectorOutOfSessionScope.selector);
        game.withSession(grant,sig,abi.encodeCall(game.createMatch,(b,bytes32(0))));
        vm.mockCall(address(0x1234),abi.encodeWithSelector(IInterludeHub.sessionEpochOf.selector,grant.granter),abi.encode(uint256(1)));
        vm.expectRevert(Delegatable.SessionEpochStale.selector);
        game.withSession(grant,sig,abi.encodeCall(game.tick,(1)));
    }

    function testSessionCannotReplayOnAnotherAppOrBaseChain() public {
        (Types.SessionGrant memory grant,bytes memory sig)=signedGrant(game.createMatch.selector);
        bytes memory callData=abi.encodeCall(game.createMatch,(b,bytes32(0)));
        vm.chainId(10143);
        PongInterlude other=new PongInterlude(IInterludeHub(address(0x1234)));
        vm.chainId(4242);
        vm.expectRevert(Delegatable.SessionNotSignedByGranter.selector);
        other.withSession(grant,sig,callData);
        // Same app and grant, but the signed base chain differs.
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(0xAA11,this.wrongChainDigest(grant));
        vm.expectRevert(Delegatable.SessionNotSignedByGranter.selector);
        game.withSession(grant,abi.encodePacked(r,s,v),callData);
    }

    function wrongChainDigest(Types.SessionGrant calldata grant) external view returns (bytes32) {
        return Session.digest(grant,address(game),1);
    }

    function testSessionInputReplayIsRejectedAndActorIsTheGranter() public {
        (Types.SessionGrant memory grant,bytes memory sig)=signedGrant(game.createMatch.selector);
        game.withSession(grant,sig,abi.encodeCall(game.createMatch,(b,bytes32(0))));
        (,,,address firstPlayer,,,,,,,,,)=game.getSnapshot();
        assertEq(firstPlayer,grant.granter);
        vm.prank(b); game.acceptMatch(1);
        (grant,sig)=signedGrant(game.input.selector);
        bytes memory callData=abi.encodeCall(game.input,(1,int8(1),1,110));
        game.withSession(grant,sig,callData);
        vm.expectRevert(PongInterlude.StaleInput.selector);
        game.withSession(grant,sig,callData);
    }

    function testSessionCannotReachPrivilegedOrPayableOperations() public {
        (Types.SessionGrant memory grant,bytes memory sig)=signedGrant(game.delegateAll.selector);
        vm.expectRevert(Delegatable.PrivilegedSelector.selector);
        game.withSession(grant,sig,abi.encodeWithSelector(game.delegateAll.selector));
        (grant,sig)=signedGrant(game.createMatch.selector);
        vm.deal(address(this),1 ether);
        (bool ok,)=address(game).call{value:1 wei}(
            abi.encodeCall(game.withSession,(grant,sig,abi.encodeCall(game.createMatch,(b,bytes32(0)))))
        );
        assertFalse(ok); assertEq(address(game).balance,0);
    }
}
