// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {RoomsMarketAdapter} from "../src/labs/RoomsMarketAdapter.sol";
import {RoomsVault} from "../src/labs/RoomsVault.sol";
import {PongInterludeRoomsChaos} from "../src/labs/PongInterludeRoomsChaos.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {MarketV4 as Market} from "../src/v4/MarketV4.sol";
import {LMSRV2} from "../src/v2/MarketV2.sol";

contract RoomsMarketAdapterTest is Test {
    address constant GAME = address(0x999);
    address constant HUB = address(0x888);
    address constant A = address(0xa);
    address constant B = address(0xb);
    uint256 constant BETTOR = 777;
    RoomsMarketAdapter adapter;
    RoomsVault vault;
    Market market;
    PhysicsV2.State s;
    receive() external payable {}
    function setUp() public {
        vm.chainId(10143); vm.roll(100); vm.warp(1000); vm.deal(address(this),10 ether);
        vm.etch(GAME,hex"00");
        vm.mockCall(GAME,abi.encodeWithSignature("hub()"),abi.encode(HUB));
        adapter = new RoomsMarketAdapter(PongInterludeRoomsChaos(GAME));
        vault = new RoomsVault(address(this));
        market = new Market(address(this),payable(address(this)),adapter,new LMSRV2(),vault);
        vault.registerModule(address(market)); vault.seal();
        vault.depositFor{value:1 ether}(vm.addr(BETTOR));
        s.mode=1;s.awaitingServe=true;s.scoreA=1;s.resumeAt=4_000_000;s.seed=bytes32(uint256(123));
        snapshot(2,address(0)); hubStatus(Types.Status.Active);
        market.open{value:.1 ether}(1,.01 ether);
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
    function testWindowsCloseBeforeCheckpointAndCannotReopen() public {
        adapter.openRound(1);(bool open,uint256 version)=adapter.bettingWindow(1,0);assertTrue(open);assertGt(version,0);
        (bool ready,)=adapter.checkpointReady(1,1,s.resumeAt);assertFalse(ready);
        buy(0);vm.roll(100+adapter.WINDOW_BLOCKS());(open,)=adapter.bettingWindow(1,0);assertFalse(open);
        vm.expectRevert("window or version");this.externalBuy(1);
        (ready,)=adapter.checkpointReady(1,1,s.resumeAt);assertFalse(ready);
        vm.roll(100+adapter.WINDOW_BLOCKS()+adapter.CONFIRMATION_BLOCKS());(ready,)=adapter.checkpointReady(1,1,s.resumeAt);assertTrue(ready);
        vm.expectRevert("round already opened");adapter.openRound(1);
        (ready,)=adapter.checkpointReady(1,1,s.resumeAt+1);assertFalse(ready);
    }
    function externalBuy(uint8 side) external { buy(side); }
    function testPressureUsesPaidMONAndExcludesLiquidity() public {
        adapter.openRound(1);uint256 paid=buy(0);
        (uint256 a,uint256 b)=market.pressure(1);assertEq(a,paid);assertEq(b,0);assertLt(a,.005 ether);
        snapshot(3,A);hubStatus(Types.Status.None);adapter.finalizeResult(1);market.claim(1,vm.addr(BETTOR));
        (a,b)=market.pressure(1);assertEq(a,paid);assertEq(b,0);
    }
    function testPublishedResultIsNotPayableBeforeChallengeRightsEnd() public {
        adapter.openRound(1);buy(0);snapshot(3,A);
        for(uint256 status=1;status<=3;status++){
            hubStatus(Types.Status(status));
            vm.expectRevert("delegation not final");adapter.finalizeResult(1);
            (,,address winner,uint8 phase)=adapter.result(1);assertEq(winner,address(0));assertEq(phase,2);
            vm.expectRevert("claim");market.claim(1,vm.addr(BETTOR));
        }
        hubStatus(Types.Status.None);adapter.finalizeResult(1);
        vm.prank(address(0xdead));market.claim(1,vm.addr(BETTOR));assertEq(vm.addr(BETTOR).balance,.005 ether);
        vm.expectRevert("already final");adapter.finalizeResult(1);
        vm.expectRevert("claim");market.claim(1,vm.addr(BETTOR));
    }
    function testUnwindUsesCorrectedWinnerAndLosingPositionPaysNothing() public {
        adapter.openRound(1);buy(0);snapshot(3,A);hubStatus(Types.Status.Challenged);
        vm.expectRevert("delegation not final");adapter.finalizeResult(1);
        snapshot(3,B);hubStatus(Types.Status.None);adapter.finalizeResult(1);
        market.claim(1,vm.addr(BETTOR));assertEq(vm.addr(BETTOR).balance,0);
    }
    function testCancelledMatchRefundsActualCost() public {
        adapter.openRound(1);uint256 paid=buy(0);snapshot(4,address(0));hubStatus(Types.Status.None);adapter.finalizeResult(1);
        market.claim(1,vm.addr(BETTOR));assertEq(vm.addr(BETTOR).balance,paid);
    }
    function testPauseAndModeAndEngineAvailabilityRequired() public {
        s.mode=0;snapshot(2,address(0));vm.expectRevert("not a Chaos pause");adapter.openRound(1);
        s.mode=1;s.awaitingServe=false;snapshot(2,address(0));vm.expectRevert("not a Chaos pause");adapter.openRound(1);
        s.awaitingServe=true;snapshot(2,address(0));hubStatus(Types.Status.Challenged);
        vm.expectRevert("engine unavailable");adapter.openRound(1);
        hubStatus(Types.Status.Active);adapter.openRound(1);hubStatus(Types.Status.Challenged);
        (bool allowed,)=adapter.bettingWindow(1,0);assertFalse(allowed);
        vm.roll(111);(bool ready,)=adapter.checkpointReady(1,1,s.resumeAt);assertFalse(ready);
    }
    function testNoSecondSpendingModuleOrEngineFinancialCalls() public {
        vm.expectRevert("registration");vault.registerModule(address(adapter));
        vm.prank(address(adapter));vm.expectRevert("balance or module");vault.debit(vm.addr(BETTOR),1);
        vm.chainId(4242);vm.expectRevert("base only");adapter.openRound(1);
        (bool allowed,)=adapter.bettingWindow(1,0);assertFalse(allowed);
        vm.expectRevert("base only");adapter.finalizeResult(1);
    }
}
