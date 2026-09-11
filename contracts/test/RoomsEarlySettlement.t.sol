// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {RoomsEarlySettlement} from "../src/labs/RoomsEarlySettlement.sol";
import {RoomsVault} from "../src/labs/RoomsVault.sol";
import {PongInterludeRoomsChaos} from "../src/labs/PongInterludeRoomsChaos.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {MarketV4 as Market} from "../src/v4/MarketV4.sol";
import {LMSRV2} from "../src/v2/MarketV2.sol";

contract RoomsEarlySettlementTest is Test {
    address constant GAME = address(0x999);
    address constant HUB = address(0x888);
    address constant A = address(0xa);
    address constant B = address(0xb);
    uint256 constant BETTOR = 777;
    RoomsEarlySettlement adapter;
    RoomsVault vault;
    Market market;
    PhysicsV2.State s;
    receive() external payable {}
    function setUp() public {
        vm.chainId(10143); vm.roll(100); vm.warp(1000); vm.deal(address(this),10 ether);
        vm.etch(GAME,hex"00");
        vm.mockCall(GAME,abi.encodeWithSignature("hub()"),abi.encode(HUB));
        adapter = new RoomsEarlySettlement(PongInterludeRoomsChaos(GAME));
        vault = new RoomsVault(address(this));
        market = new Market(address(this),payable(address(this)),adapter,new LMSRV2(),vault);
        vault.registerModule(address(market)); vault.seal();
        vault.depositFor{value:1 ether}(vm.addr(BETTOR));
        s.mode=1;s.awaitingServe=true;s.scoreA=1;s.resumeAt=4_000_000;s.seed=bytes32(uint256(123));
        snapshot(2,address(0)); hubStatus(Types.Status.Active);
        market.open{value:.1 ether}(1,.01 ether); session(Types.Status.Active,1,7);
    }
    function hubStatus(Types.Status status) internal {
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.statusOf.selector,GAME,Types.GLOBAL),abi.encode(status));
    }
    function snapshot(uint256 phase,address winner) internal {
        vm.mockCall(GAME,abi.encodeWithSelector(PongInterludeRoomsChaos.getSnapshot.selector,1),
            abi.encode(uint256(1),uint256(1),phase,A,B,B,winner,uint256(100),uint256(100),uint256(0),uint256(0),uint256(0),s));
        vm.mockCall(GAME,abi.encodeWithSelector(PongInterludeRoomsChaos.resultHashes.selector,1),abi.encode(bytes32(uint256(phase))));
    }
    function buy(uint8 side) internal returns(uint256 cost) {
        (,uint256 version)=adapter.bettingWindow(1,0);
        Market.Bet memory bet=Market.Bet(vm.addr(BETTOR),1,side,.005 ether,1 ether,version,market.nonces(vm.addr(BETTOR)),1060);
        bytes32 domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("PONG Market"),keccak256("1"),block.chainid,address(market)));
        (uint8 v,bytes32 r,bytes32 ss)=vm.sign(BETTOR,keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(market.BET_TYPEHASH(),bet)))));
        cost=market.quote(1,side,bet.shares);
        market.buy(bet,abi.encodePacked(r,ss,v));
    }
    function session(Types.Status status,uint256 epoch,uint256 batch) internal {
        Types.Session memory x; x.status=status;x.epoch=epoch;x.batchIndex=batch;
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionOf.selector,GAME,Types.GLOBAL),abi.encode(x));hubStatus(status);
    }
    function testPaysDuringActiveSessionWithoutWaitingForClosure() public {
        adapter.openRound(1);buy(0);snapshot(3,A);
        vm.prank(address(0xdead));adapter.finalizeResult(1);
        (uint256 epoch,uint256 batch,uint64 blockNumber,uint64 at)=adapter.observations(1);
        assertEq(epoch,1);assertEq(batch,7);assertEq(blockNumber,100);assertEq(at,1000);
        vm.prank(address(0xdead));market.claim(1,vm.addr(BETTOR));assertEq(vm.addr(BETTOR).balance,.005 ether);
        vm.expectRevert("already final");adapter.finalizeResult(1);
        vm.expectRevert("claim");market.claim(1,vm.addr(BETTOR));
    }
    function testKnownChallengeBlocksFirstAcceptance() public {
        adapter.openRound(1);buy(0);snapshot(3,A);session(Types.Status.Challenged,1,7);
        vm.expectRevert("settlement under review");adapter.finalizeResult(1);
        vm.expectRevert("claim");market.claim(1,vm.addr(BETTOR));
        session(Types.Status.Exiting,1,7);adapter.finalizeResult(1);market.claim(1,vm.addr(BETTOR));
        assertEq(vm.addr(BETTOR).balance,.005 ether);
    }
    function testCorrectionCannotPayAgainOrReopenBetting() public {
        adapter.openRound(1);buy(0);snapshot(3,A);adapter.finalizeResult(1);market.claim(1,vm.addr(BETTOR));
        session(Types.Status.Challenged,1,7);snapshot(3,B);
        (,,address winner,uint8 phase)=adapter.result(1);assertEq(winner,A);assertEq(phase,3);
        vm.expectRevert("claim");market.claim(1,vm.addr(BETTOR));
        snapshot(2,address(0));session(Types.Status.Active,1,8);
        (bool allowed,)=adapter.bettingWindow(1,0);assertFalse(allowed);
        vm.expectRevert("result already accepted");adapter.openRound(1);
        assertEq(vm.addr(BETTOR).balance,.005 ether);
    }
    function testRejectsMissingPublicationAndChangedEpoch() public {
        adapter.openRound(1);snapshot(3,A);session(Types.Status.Active,1,0);
        vm.expectRevert("no published session");adapter.finalizeResult(1);
        session(Types.Status.Active,2,1);vm.expectRevert("match epoch changed");adapter.finalizeResult(1);
        session(Types.Status.Active,1,7);snapshot(2,address(0));vm.expectRevert("result pending");adapter.finalizeResult(1);
        snapshot(3,A);vm.mockCall(GAME,abi.encodeWithSelector(PongInterludeRoomsChaos.resultHashes.selector,1),abi.encode(bytes32(0)));
        vm.expectRevert("result pending");adapter.finalizeResult(1);
    }
    function testReleasedSessionCanRecoverAnUnpaidPublishedResult() public {
        adapter.openRound(1);buy(0);snapshot(3,A);session(Types.Status.None,0,0);
        adapter.finalizeResult(1);market.claim(1,vm.addr(BETTOR));assertEq(vm.addr(BETTOR).balance,.005 ether);
        (uint256 epoch,uint256 batch,,)=adapter.observations(1);assertEq(epoch,1);assertEq(batch,0);
    }
    function testCancelledRefundAndDeferredTransferReserve() public {
        adapter.openRound(1);uint256 cost=buy(0);snapshot(4,address(0));adapter.finalizeResult(1);
        address recipient=vm.addr(BETTOR);vm.etch(recipient,hex"60006000fd");
        market.claim(1,recipient);bytes32 payoutId=market.payoutId(0,1,recipient);
        (,uint256 amount,uint8 status,)=market.payouts(payoutId);
        assertEq(amount,cost);assertEq(status,1);assertEq(market.totalPendingPayouts(),cost);
        vm.etch(recipient,hex"");market.retryPayout(payoutId);assertEq(recipient.balance,cost);
        assertEq(market.totalPendingPayouts(),0);
        vm.expectRevert();market.retryPayout(payoutId);
    }
    function testLosingPositionPaysZeroAndNoFinancialPowersForEngine() public {
        adapter.openRound(1);buy(0);snapshot(3,B);adapter.finalizeResult(1);market.claim(1,vm.addr(BETTOR));
        assertEq(vm.addr(BETTOR).balance,0);
        vm.prank(address(adapter));vm.expectRevert("balance or module");vault.debit(vm.addr(BETTOR),1);
        vm.chainId(4242);vm.expectRevert("base only");adapter.finalizeResult(1);
        (bool allowed,)=adapter.bettingWindow(1,0);assertFalse(allowed);
    }
}
