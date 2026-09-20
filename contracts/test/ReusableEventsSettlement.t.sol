// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableEventsLobbyTest} from "./ReusableEventsLobby.t.sol";
import {ReusableEventsSettlement} from "../src/independent/ReusableEventsSettlement.sol";
import {ReusableAdmission as Admission} from "../src/independent/ReusableAdmission.sol";
import {ReusableGame as Game} from "../src/independent/ReusableGame.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
import {PublishedResultTree as Tree} from "../src/agents/competition/PublishedResultTree.sol";
import {RealtimeMarket} from "../src/labs/RealtimeMarket.sol";
import {MarketV4} from "../src/v4/MarketV4.sol";
import {RoomsVault} from "../src/labs/RoomsVault.sol";
import {LMSRV2} from "../src/v2/MarketV2.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract ReusableEventsSettlementTest is ReusableEventsLobbyTest {
    ReusableEventsSettlement settlement;RealtimeMarket market;RoomsVault vault;
    receive() external payable {}
    function setUp() public override {
        super.setUp();settlement=new ReusableEventsSettlement(lobby);vault=new RoomsVault(address(this));
        market=new RealtimeMarket(address(this),payable(address(this)),settlement,new LMSRV2(),vault);
        vault.registerModule(address(market));vault.seal();vm.deal(address(this),10 ether);vault.depositFor{value:1 ether}(vm.addr(777));
    }
    function live(uint8 mode) private returns(uint256 room_,uint256 id){
        (room_,id)=roomAndProposal(mode);lobby.assignNext();(Admission.Ticket memory t,T.Binding memory b)=lobby.ticketOf(id);
        vm.chainId(4242);arena.admit(t,b,sig(BRIDGE,Admission.digest(t)));vm.prank(b.keyA);arena.confirmReady(1,id);vm.prank(b.keyB);arena.confirmReady(1,id);
        arena.start(1,id);vm.warp(vm.getBlockTimestamp()+3);arena.start(1,id);vm.chainId(10143);hub.publish(address(arena));
    }
    function buy(uint256 id,uint8 side) private returns(uint256 cost){
        (,uint256 version)=settlement.bettingWindow(id,0);
        MarketV4.Bet memory bet=MarketV4.Bet(vm.addr(777),id,side,.005 ether,1 ether,version,market.nonces(vm.addr(777)),uint64(vm.getBlockTimestamp()+60));
        bytes32 domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("PONG Market"),keccak256("1"),uint256(10143),address(market)));
        bytes memory signature=sig(777,keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(market.BET_TYPEHASH(),bet)))));
        cost=market.quote(id,side,bet.shares);market.buy(bet,signature);
    }
    function finish(uint256 id) private returns(Game.Result memory r){
        vm.warp(vm.getBlockTimestamp()+2);vm.chainId(4242);vm.prank(vm.addr(1102));arena.concede(1,id);r=arena.publishedResult();
        vm.chainId(10143);hub.publish(address(arena));lobby.captureProof(id,r,firstProof());
    }
    function testPaymentSurvivesSameEpochSlotReuseAndCannotPayTwice() public {
        (uint256 room_,uint256 id)=live(1);settlement.openRound(id);market.open{value:.1 ether}(id,.01 ether);buy(id,0);
        Game.Result memory r=finish(id);uint256 next=propose(room_);assertEq(lobby.assignNext(),address(arena));
        (Admission.Ticket memory ticket,T.Binding memory binding)=lobby.ticketOf(next);vm.chainId(4242);arena.admit(ticket,binding,sig(BRIDGE,Admission.digest(ticket)));vm.chainId(10143);
        // All settlement state for the old match is off the physical slot.
        settlement.finalizeResult(id);assertEq(settlement.bettingCutoff(id),r.finishedAt);
        (,,address winner,uint8 status)=settlement.result(id);assertEq(winner,vm.addr(101));assertEq(status,3);
        (bool allowed,)=settlement.bettingWindow(id,0);assertFalse(allowed);
        market.claim(id,vm.addr(777));assertEq(vm.addr(777).balance,.005 ether);
        vm.expectRevert("claim");market.claim(id,vm.addr(777));
    }
    function testReleasedAbsentResultRefundsAndSealedRootRemainsUnchanged() public {
        (,uint256 id)=live(1);settlement.openRound(id);market.open{value:.1 ether}(id,.01 ether);uint256 paid=buy(id,0);
        vm.warp(vm.getBlockTimestamp()+1 days);lobby.recoverExpired(id);vm.warp(vm.getBlockTimestamp()+3600);hub.releaseStake(address(arena),0);
        verifier.sealReleased(address(arena));(,,bytes32 before_)=arena.resultCommitment();lobby.recoverReleased(address(arena));
        (,,bytes32 after_)=arena.resultCommitment();assertEq(before_,after_);settlement.finalizeResult(id);
        (,,address winner,uint8 status)=settlement.result(id);assertEq(winner,address(0));assertEq(status,4);
        market.claim(id,vm.addr(777));assertEq(vm.addr(777).balance,paid);vm.expectRevert("claim");market.claim(id,vm.addr(777));
    }
    function testCorrectionLogsAndRatingsChangeButFrozenPaymentDoesNot() public {
        (,uint256 id)=live(1);settlement.openRound(id);market.open{value:.1 ether}(id,.01 ether);buy(id,0);Game.Result memory original=finish(id);
        market.claim(id,vm.addr(777));uint64 cutoff=settlement.bettingCutoff(id);
        // Simulate a corrected published commitment, never a bridge report.
        Game.Result memory corrected=original;corrected.match_.winner=vm.addr(102);corrected.match_.hash=keccak256("corrected canonical result");
        (Admission.Ticket memory ticket,)=lobby.ticketOf(id);bytes32 leaf=Tree.resultLeaf(10143,address(arena),1,id,
            keccak256(abi.encode(Admission.digest(ticket),keccak256(abi.encode(corrected)))));
        bytes32[16] memory frontier;(bytes32 root,,)=Tree.append(frontier,0,leaf);
        vm.mockCall(address(arena),abi.encodeWithSelector(arena.resultCommitment.selector),abi.encode(uint256(1),uint32(1),root));
        lobby.captureProof(id,corrected,firstProof());assertEq(ratings.revision(),1);assertEq(ratings.entry(id).latest.winner,vm.addr(102));
        (,,address paidWinner,)=settlement.result(id);assertEq(paidWinner,vm.addr(101));assertEq(settlement.bettingCutoff(id),cutoff);
        vm.expectRevert("claim");market.claim(id,vm.addr(777));assertEq(vm.addr(777).balance,.005 ether);
    }
    function testClassicAndBridgeOnlyAdmissionsCannotOpenAMarket() public {
        (,uint256 id)=live(0);vm.expectRevert("no published authorized Chaos match");settlement.openRound(id);
    }
}
