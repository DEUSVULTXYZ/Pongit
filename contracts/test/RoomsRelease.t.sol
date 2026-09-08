// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PongRoomsTestnetRelease} from "../src/labs/PongRoomsTestnet.sol";
import {PongInterludeRoomsChaos} from "../src/labs/PongInterludeRoomsChaos.sol";
import {Delegatable} from "../vendor/interlude/Delegatable.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
contract RoomsReleaseTest is Test {
 PongRoomsTestnetRelease g;
 address constant HUB=address(0x888);
 function setUp() public {
  vm.chainId(10143);vm.warp(1000);
  g=new PongRoomsTestnetRelease(IInterludeHub(HUB));
  vm.mockCall(g.previousClassic(),abi.encodeWithSignature("ratingOf(address)",address(0xaaa)),abi.encode(uint32(1120),uint32(8),uint32(6),uint32(1)));
 }
 function testClassicIsCarriedAndChaosStartsIndependently() public view {
  PongInterludeRoomsChaos.Rating memory classic=g.ratingOf(address(0xaaa),0);
  PongInterludeRoomsChaos.Rating memory chaos=g.ratingOf(address(0xaaa),1);
  assertEq(classic.elo,1120);assertEq(classic.played,8);assertEq(classic.wins,6);
  assertEq(chaos.elo,1000);assertEq(chaos.played,0);
 }
 function testOnlyBaseOperatorCanCloseOrRenew() public {
  vm.expectRevert("base operator only");g.closeEngine();
  vm.expectRevert("base operator only");g.renewEngine();
  vm.chainId(4242);vm.prank(g.operator());vm.expectRevert("base operator only");g.closeEngine();
  vm.prank(g.operator());vm.expectRevert("base operator only");g.renewEngine();
 }
 function testRenewNeedsReleaseAndCannotSkipChallengeWindow() public {
  for(uint256 i=1;i<=3;i++){
   vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.statusOf.selector,address(g),Types.GLOBAL),abi.encode(Types.Status(i)));
   vm.prank(g.operator());vm.expectRevert("delegation pending");g.renewEngine();
  }
  vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.statusOf.selector,address(g),Types.GLOBAL),abi.encode(Types.Status.None));
  vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.openDelegation.selector),bytes(""));
  vm.prank(g.operator());g.renewEngine();
 }
 function testNoArcadeGrantCanReachLifecycleActions() public {
  Types.SessionGrant memory grant;grant.anyFunction=true;
  vm.expectRevert(Delegatable.PrivilegedSelector.selector);g.withSession(grant,bytes(""),abi.encodeCall(g.closeEngine,()));
  vm.expectRevert(Delegatable.PrivilegedSelector.selector);g.withSession(grant,bytes(""),abi.encodeCall(g.renewEngine,()));
  vm.expectRevert(Delegatable.PrivilegedSelector.selector);g.withSession(grant,bytes(""),abi.encodeCall(g.syncDelegatedSlot,(bytes32(0),bytes32(uint256(1)))));
  vm.expectRevert(Delegatable.OnlyHub.selector);g.syncDelegatedSlot(bytes32(0),bytes32(uint256(1)));
 }
}
