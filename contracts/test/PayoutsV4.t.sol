// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {MarketV4 as Market} from "../src/v4/MarketV4.sol";
import {LMSRV2} from "../src/v2/MarketV2.sol";
import {IMatchResultV2} from "../src/v2/GameV2.sol";
import {NativePayouts} from "../src/v4/NativePayouts.sol";
import {TournamentsV4} from "../src/v4/TournamentsV4.sol";
import {GameV3} from "../src/v3/GameV3.sol";
import {ArcadeSessions} from "../src/v3/ArcadeSessions.sol";
import {Vault} from "../src/Vault.sol";

contract PayoutResults is IMatchResultV2 {
    uint8 public status = 2;
    address public winner = address(1);
    function finish(uint8 s) external { status = s; }
    function result(uint256) external view returns (address,address,address,uint8) { return(address(1),address(2),winner,status); }
    function bettingWindow(uint256,uint64) external view returns(bool,uint256) { return(status==2,1); }
}
contract RejectMON { receive() external payable { revert("receiver refused"); } }
contract ReenterMON {
    Market immutable market;
    constructor(Market m) { market=m; }
    receive() external payable { (bool ok,) = address(market).call(abi.encodeCall(market.claim,(1,address(this)))); require(!ok,"reentered"); }
}
contract NativeHarness is NativePayouts {
    function pay(address who,uint256 source) external payable nonReentrant { _schedulePayout(0,source,who,msg.value); }
}
contract PayoutsV4Test is Test {
    Market market; Vault vault; PayoutResults results; TournamentsV4 tour; GameV3 game;
    address alice; address bob;
    uint256 constant AK=44; uint256 constant BK=55;
    receive() external payable {}
    function setUp() public {
        alice=vm.addr(AK);bob=vm.addr(BK);vm.deal(address(this),100 ether);
        vault=new Vault(address(this));results=new PayoutResults();
        market=new Market(address(this),payable(address(this)),results,new LMSRV2(),vault);
        ArcadeSessions registry=new ArcadeSessions();game=new GameV3(address(this),address(0),registry);registry.bind(address(game));
        tour=new TournamentsV4(address(this),payable(address(this)),game,vault);
        vault.registerModule(address(market));vault.registerModule(address(tour));vault.seal();
        vault.depositFor{value:5 ether}(alice);vault.depositFor{value:5 ether}(bob);market.open{value:1 ether}(1,1 ether);
    }
    function sign(uint256 key,string memory name,address target,bytes32 value) internal returns(bytes memory) {
        bytes32 d=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256(bytes(name)),keccak256("1"),block.chainid,target));
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,keccak256(abi.encodePacked("\x19\x01",d,value)));return abi.encodePacked(r,s,v);
    }
    function buy(uint256 key,uint8 side,uint256 shares) internal returns(uint256 cost) {
        address player=vm.addr(key);cost=market.quote(1,side,shares);
        Market.Bet memory b=Market.Bet(player,1,side,shares,1 ether,1,market.nonces(player),uint64(block.timestamp+60));
        market.buy(b,sign(key,"PONG Market",address(market),keccak256(abi.encode(market.BET_TYPEHASH(),b))));
    }
    function testWinningPayoutGoesToWalletWithoutSpendingSignature() public {
        buy(AK,0,.1 ether);uint256 oldVault=vault.balances(alice);results.finish(3);vm.prank(bob);market.claim(1,alice);
        assertEq(alice.balance,.1 ether);assertEq(vault.balances(alice),oldVault);assertEq(market.totalPendingPayouts(),0);
        (address to,uint256 amount,uint8 status,uint32 attempts)=market.payouts(market.payoutId(0,1,alice));assertEq(to,alice);assertEq(amount,.1 ether);assertEq(status,2);assertEq(attempts,1);
    }
    function testLosingPositionClosesWithZeroPayment() public {
        buy(AK,1,.1 ether);results.finish(3);market.claim(1,alice);assertEq(alice.balance,0);(,,,bool claimed)=market.positions(1,alice);assertTrue(claimed);
        vm.expectRevert("claim");market.claim(1,alice);
    }
    function testCancellationRefundsExactPaidMONToWallet() public {
        uint256 paid=buy(AK,0,.1 ether)+buy(AK,1,.2 ether);results.finish(4);market.claim(1,alice);assertEq(alice.balance,paid);
    }
    function testDuplicateSettlementAndRetryCannotPayTwice() public {
        buy(AK,0,.1 ether);results.finish(3);market.claim(1,alice);vm.expectRevert("claim");market.claim(1,alice);
        bytes32 id=market.payoutId(0,1,alice);vm.expectRevert("not pending");market.retryPayout(id);assertEq(alice.balance,.1 ether);
    }
    function testRejectedRecipientDoesNotBlockOtherBettorOrLoseDebt() public {
        buy(AK,0,.1 ether);buy(BK,0,.2 ether);vm.etch(alice,address(new RejectMON()).code);results.finish(3);
        market.claim(1,alice);market.claim(1,bob);assertEq(alice.balance,0);assertEq(bob.balance,.2 ether);assertEq(market.totalPendingPayouts(),.1 ether);
        market.reclaim(1);assertEq(address(market).balance,.1 ether);
        vm.etch(alice,hex"");vm.prank(bob);market.retryPayout(market.payoutId(0,1,alice));assertEq(alice.balance,.1 ether);assertEq(address(market).balance,0);
    }
    function testRecipientCannotReenterSettlement() public {
        buy(AK,0,.1 ether);vm.etch(alice,address(new ReenterMON(market)).code);results.finish(3);market.claim(1,alice);assertEq(alice.balance,.1 ether);assertEq(market.totalPendingPayouts(),0);
    }
    function testLowGasCannotTurnAValidPaymentIntoADeferredDebt() public {
        NativeHarness h=new NativeHarness();(bool ok,)=address(h).call{value:.1 ether,gas:100000}(abi.encodeCall(h.pay,(alice,1)));assertFalse(ok);assertEq(h.totalPendingPayouts(),0);assertEq(address(h).balance,0);
    }
    function testUnknownPositionAndUnfinishedResultCannotSettle() public {
        buy(AK,0,.1 ether);vm.expectRevert("claim");market.claim(1,alice);results.finish(3);vm.expectRevert("claim");market.claim(1,bob);
    }
    function testFuzzSettlementConservesReservedAndPendingFunds(uint64 left,uint64 right,bool cancel,bool reject) public {
        uint256 a=bound(uint256(left),1e12,.4 ether);uint256 b=bound(uint256(right),1e12,.4 ether);
        uint256 paidA=buy(AK,0,a);uint256 paidB=buy(BK,1,b);results.finish(cancel?4:3);
        if(reject)vm.etch(alice,address(new RejectMON()).code);
        market.claim(1,alice);market.claim(1,bob);
        (,,,uint256 reserve,,,)=market.books(1);assertEq(address(market).balance,reserve+market.totalPendingPayouts());
        assertEq(bob.balance,cancel?paidB:0);market.reclaim(1);assertEq(address(market).balance,market.totalPendingPayouts());
        if(reject){vm.etch(alice,hex"");market.retryPayout(market.payoutId(0,1,alice));}
        assertEq(alice.balance,cancel?paidA:a);assertEq(address(market).balance,0);
    }
    function testWrongSpendingSignatureRejected() public {
        Market.Bet memory b=Market.Bet(alice,1,0,.1 ether,1 ether,1,0,uint64(block.timestamp+60));
        bytes memory sig=sign(BK,"PONG Market",address(market),keccak256(abi.encode(market.BET_TYPEHASH(),b)));vm.expectRevert("signature");market.buy(b,sig);
    }
    function enter(uint256 id,uint256 key) internal {
        address who=vm.addr(key);uint64 deadline=uint64(block.timestamp+60);uint256 nonce=tour.nonces(who);
        bytes memory sig=sign(key,"PONG Tournaments",address(tour),keccak256(abi.encode(tour.ENTER_TYPEHASH(),who,id,nonce,deadline)));tour.enter(id,who,nonce,deadline,sig);
    }
    function testTournamentFinalPaysWinnerWallet() public {
        uint256 id=tour.create{value:.2 ether}(uint64(block.timestamp+60),2,.01 ether);enter(id,AK);enter(id,BK);tour.start(id);
        GameV3.Match memory m;m.playerA=alice;m.playerB=bob;m.tournamentId=id;m.createdBlock=uint64(block.number);m.status=3;
        vm.mockCall(address(game),abi.encodeCall(game.getMatch,(7)),abi.encode(m));vm.mockCall(address(game),abi.encodeCall(game.result,(7)),abi.encode(alice,bob,alice,uint8(3)));
        tour.attach(id,0,7);tour.advance(id);assertEq(alice.balance,.22 ether);assertEq(tour.getTournament(id).status,3);
        vm.expectRevert("not active");tour.advance(id);
    }
    function testCancelledTournamentRefundsEntrantEvenIfTreasuryRejects() public {
        uint256 id=tour.create{value:.2 ether}(uint64(block.timestamp+60),2,.01 ether);enter(id,AK);vm.warp(block.timestamp+61);
        // Treasury is this test contract; swap its runtime only for the external cancel call.
        vm.mockCallRevert(address(this),bytes(""),bytes("reject"));tour.cancel(id);assertEq(tour.totalPendingPayouts(),.2 ether);tour.refund(id,alice);assertEq(alice.balance,.01 ether);
        vm.expectRevert("refund");tour.refund(id,alice);
    }
}
