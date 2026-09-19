// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {RealtimeMarketTest} from "./RealtimeMarket.t.sol";
import {ChaosEventsSettlement} from "../src/chaos/ChaosEventsSettlement.sol";
import {RealtimeMarket} from "../src/labs/RealtimeMarket.sol";
import {RoomsVault} from "../src/labs/RoomsVault.sol";
import {PongInterludeRoomsChaos} from "../src/labs/PongInterludeRoomsChaos.sol";
import {LMSRV2} from "../src/v2/MarketV2.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract ChaosEventsSettlementTest is RealtimeMarketTest {
    function setUp() public override {
        super.setUp();
        vm.mockCall(GAME,abi.encodeWithSignature("RULES_VERSION()"),abi.encode(uint256(9)));
        adapter=new ChaosEventsSettlement(PongInterludeRoomsChaos(GAME));vault=new RoomsVault(address(this));
        market=new RealtimeMarket(address(this),payable(address(this)),adapter,new LMSRV2(),vault);
        vault.registerModule(address(market));vault.seal();vault.depositFor{value:1 ether}(vm.addr(BETTOR));
        market.open{value:.1 ether}(1,.01 ether);adapter.openRound(1);
    }
    function testJackpotDoesNotMultiplyMoneyAndCorrectionCannotPayTwice() public {
        buy(0);s.scoreA=7;end(A,1001);
        market.claim(1,vm.addr(BETTOR));assertEq(vm.addr(BETTOR).balance,.005 ether);
        session(Types.Status.Challenged,1,7);snapshot(3,B);
        vm.expectRevert("already final");adapter.finalizeResult(1);
        vm.expectRevert("claim");market.claim(1,vm.addr(BETTOR));
        assertEq(vm.addr(BETTOR).balance,.005 ether);
    }
    function testRallyCounterIsNotAScoreSumOrBettingVersion() public {
        (,uint256 beforeVersion)=adapter.bettingWindow(1,0);assertEq(beforeVersion,(1<<8)|9);
        s.scoreA=6;s.scoreB=6;snapshot(2,address(0));
        (bool open,uint256 version)=adapter.bettingWindow(1,0);assertTrue(open);assertEq(version,beforeVersion);
    }
    function testCandidateCannotBindHistoricalGame() public {
        // Rules 5 (realtime), 6 (the first Chaos events kernel) and 7 (the Agent Arcade).
        for(uint256 rules=5;rules<=7;rules++){
            vm.mockCall(GAME,abi.encodeWithSignature("RULES_VERSION()"),abi.encode(rules));
            vm.expectRevert("events rules required");new ChaosEventsSettlement(PongInterludeRoomsChaos(GAME));
        }
    }
    function testArchiveReadsResultAndEpochWithoutChangingAnyPayment() public {
        vm.mockCall(GAME,abi.encodeWithSignature("gameEpoch(uint256)",1),abi.encode(uint256(1)));
        vm.mockCall(GAME,abi.encodeWithSignature("rankedMatch(uint256)",1),abi.encode(true));
        snapshot(3,A);ChaosEventsSettlement log=ChaosEventsSettlement(address(adapter));
        uint256 beforeBalance=address(market).balance;vm.prank(address(0xbeef));log.recordMatch(1);
        assertEq(log.recordedHash(1),bytes32(uint256(3)));assertEq(address(market).balance,beforeBalance);
        vm.expectRevert("result already recorded");log.recordMatch(1);
        snapshot(3,B);vm.mockCall(GAME,abi.encodeWithSignature("resultHashes(uint256)",1),abi.encode(bytes32(uint256(4))));log.recordMatch(1);
        assertEq(log.recordedHash(1),bytes32(uint256(4)));assertEq(address(market).balance,beforeBalance);
    }
}
