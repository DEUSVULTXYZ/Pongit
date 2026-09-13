// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {RoomsSettlementFixture} from "./RoomsEarlySettlement.t.sol";
import {RoomsRealtimeSettlement} from "../src/labs/RoomsRealtimeSettlement.sol";
import {RealtimeMarket} from "../src/labs/RealtimeMarket.sol";
import {RoomsVault} from "../src/labs/RoomsVault.sol";
import {PongInterludeRoomsChaos} from "../src/labs/PongInterludeRoomsChaos.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {LMSRV2} from "../src/v2/MarketV2.sol";

// Standalone fixture shares helpers, not the legacy pause assertions.
contract RealtimeMarketTest is RoomsSettlementFixture {
    function setUp() public virtual override {
        super.setUp();
        vm.mockCall(GAME,abi.encodeWithSignature("RULES_VERSION()"),abi.encode(uint256(5)));
        adapter=new RoomsRealtimeSettlement(PongInterludeRoomsChaos(GAME));vault=new RoomsVault(address(this));
        market=new RealtimeMarket(address(this),payable(address(this)),adapter,new LMSRV2(),vault);
        vault.registerModule(address(market));vault.seal();vault.depositFor{value:1 ether}(vm.addr(BETTOR));
        s.awaitingServe=false;s.resumeAt=0;s.scoreA=0;snapshot(2,address(0));market.open{value:.1 ether}(1,.01 ether);
        session(Types.Status.Active,1,7);adapter.openRound(1);
        vm.mockCall(GAME,abi.encodeWithSignature("finishedAt(uint256)",1),abi.encode(uint64(1001)));
    }
    function session(Types.Status status,uint256 epoch,uint256 batch) internal override {
        Types.Session memory x;x.status=status;x.epoch=epoch;x.batchIndex=batch;x.expiresAt=2000;
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionOf.selector,GAME,Types.GLOBAL),abi.encode(x));hubStatus(status);
    }
    function end(address winner,uint64 cutoff) internal {
        vm.warp(1050);vm.mockCall(GAME,abi.encodeWithSignature("finishedAt(uint256)",1),abi.encode(cutoff));snapshot(3,winner);adapter.finalizeResult(1);
    }
    function testContinuousWindowAcrossPointsAndFortyBlocks() public {
        (bool open,uint256 version)=adapter.bettingWindow(1,0);assertTrue(open);buy(0);
        vm.roll(1000);s.scoreA=3;snapshot(2,address(0));(bool afterOpen,uint256 afterVersion)=adapter.bettingWindow(1,0);
        assertTrue(afterOpen);assertEq(version,afterVersion);buy(1);
    }
    function testLateKnownWinnerRefundedEvenBeforePublicationArrives() public {
        vm.warp(1002);uint256 cost=buy(0);end(A,1001);
        (uint256 amount,uint256 refund,bool ready)=RealtimeMarket(payable(address(market))).claimPreview(1,vm.addr(BETTOR));
        assertTrue(ready);assertEq(amount,cost);assertEq(refund,cost);
        market.reclaim(1);market.claim(1,vm.addr(BETTOR));assertEq(vm.addr(BETTOR).balance,cost);
        vm.expectRevert("claim");market.claim(1,vm.addr(BETTOR));
    }
    function testSameFinalSecondRefundAndMixedWinningPosition() public {
        buy(0);vm.warp(1001);uint256 late=buy(1);end(A,1001);
        market.claim(1,vm.addr(BETTOR));assertEq(vm.addr(BETTOR).balance,.005 ether+late);
        market.reclaim(1);assertEq(address(market).balance,0);
    }
    function testLosingEarlyPositionStillGetsLateRefund() public {
        buy(0);vm.warp(1002);uint256 late=buy(0);end(B,1001);
        market.claim(1,vm.addr(BETTOR));assertEq(vm.addr(BETTOR).balance,late);
    }
    function testRefusingRecipientRemainsReservedAfterReclaim() public {
        vm.warp(1002);uint256 cost=buy(0);end(A,1001);address recipient=vm.addr(BETTOR);vm.etch(recipient,hex"60006000fd");
        market.claim(1,recipient);market.reclaim(1);assertEq(address(market).balance,cost);assertEq(market.totalPendingPayouts(),cost);
        vm.etch(recipient,hex"");market.retryPayout(market.payoutId(0,1,recipient));assertEq(recipient.balance,cost);
    }
}
