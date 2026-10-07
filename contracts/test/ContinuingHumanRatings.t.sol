// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ContinuingHumanRatings} from "../src/independent/ContinuingHumanRatings.sol";
import {PublishedRatings} from "../src/independent/PublishedRatings.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
import {ILobbyRatings as L} from "../src/autonomous/ContractLobby.sol";

contract HumanRatingSourceFixture {
    PublishedRatings public ratings;
    mapping(uint256=>uint256) public slot;
    function bind(PublishedRatings r) external {ratings=r;}
    function busy(uint256 id) external {slot[0]=id;}
    function publish(T.Result calldata r,bool f) external {ratings.publish(r,f);}
    function correct(T.Result calldata r,bool f) external {ratings.reconcile(r,f);}
}

contract ContinuingHumanRatingsTest is Test {
    HumanRatingSourceFixture oldLobby;PublishedRatings source;PublishedRatings control;ContinuingHumanRatings next;
    address a=address(10);address b=address(11);address seedOnly=address(12);
    bytes32 constant SEAL=keccak256("original human seed audit");
    bytes32 constant AUDIT=keccak256("verified source storage and original seed calls");
    uint256 genesis;bytes32 seedHash;
    function initial() private view returns(address[] memory accounts,L.Rating[] memory values){
        accounts=new address[](3);accounts[0]=a;accounts[1]=b;accounts[2]=seedOnly;
        values=new L.Rating[](3);values[0]=L.Rating(1250,13,9,1);values[1]=L.Rating(950,20,4,1);values[2]=L.Rating(1200,10,5,1);
    }
    function pairs() private view returns(bytes32[] memory keys,uint8[] memory values){
        keys=new bytes32[](1);keys[0]=keccak256(abi.encode(a,b,block.timestamp/1 days,uint8(0)));
        values=new uint8[](1);values[0]=3;
    }
    function setUp() public {
        vm.chainId(10143);vm.warp(1_800_000_000);genesis=block.timestamp;
        oldLobby=new HumanRatingSourceFixture();source=new PublishedRatings(address(oldLobby),address(this),genesis);oldLobby.bind(source);
        control=new PublishedRatings(address(this),address(this),genesis);
        (address[] memory accounts,L.Rating[] memory values)=initial();(bytes32[] memory keys,uint8[] memory counts)=pairs();
        source.seed(accounts,0,values);control.seed(accounts,0,values);source.seedPairCounts(keys,counts);control.seedPairCounts(keys,counts);
        source.sealMigration(SEAL);control.sealMigration(SEAL);
        seedHash=keccak256(abi.encode(bytes32(0),uint8(0),accounts,uint8(0),values));seedHash=keccak256(abi.encode(seedHash,uint8(1),keys,counts));
        next=new ContinuingHumanRatings(source,address(source).codehash,SEAL,AUDIT,seedHash,address(this),address(this));
        next.seed(accounts,0,values);next.seedPairCounts(keys,counts);
    }
    function result(uint256 id,address winner,uint8 mode) private view returns(T.Result memory){
        return T.Result(address(0x10),1,id,a,b,winner,mode,true,3,winner==a?7:2,winner==b?7:2,bytes32(id));
    }
    function publish(uint256 id,address winner,uint8 mode) private {T.Result memory r=result(id,winner,mode);oldLobby.publish(r,false);control.publish(r,false);}
    function migrate() private {next.startImport();next.importPage(32);next.verifyPlayers(0,32);next.verifyPlayers(1,32);next.finishImport();}
    function equalRatings() private view {
        for(uint8 mode;mode<2;mode++)for(uint256 i;i<3;i++){
            address p=i==0?a:i==1?b:seedOnly;
            assertEq(abi.encode(next.ratingOf(p,mode)),abi.encode(control.ratingOf(p,mode)));
        }
    }
    function testOriginalSeedsOrderedHistoryAndNextRepeatPenaltyArePreserved() public {
        publish(1,a,0);vm.warp(block.timestamp+10);publish(2,b,0);publish(3,a,1);migrate();equalRatings();
        assertEq(abi.encode(next.entry(1)),abi.encode(source.entry(1)));assertFalse(next.entry(1).finality);
        T.Result memory r=result(4,a,0);next.publish(r,false);control.publish(r,false);equalRatings();
        assertEq(next.count(),4);assertEq(next.ratingOf(seedOnly,0).elo,1200);
    }
    function testLateCorrectionRebuildsSeededAndNewGamesWithoutClosingDelegation() public {
        publish(1,a,0);publish(2,b,0);migrate();T.Result memory r=result(3,a,0);next.publish(r,false);control.publish(r,false);
        r=result(1,b,0);r.hash=keccak256("corrected");oldLobby.correct(r,false);control.reconcile(r,false);
        vm.expectRevert("historical ranking synchronization required");next.ratingOf(a,0);
        next.synchronizeHistory(1);vm.expectRevert("historical ranking synchronization required");next.publish(result(4,a,0),false);
        next.synchronizeHistory(1);next.rebuild(32);control.rebuild(32);equalRatings();
        next.synchronizeHistory(32);assertEq(next.buildGeneration(),0);assertEq(next.count(),3);
    }
    function testFinalityOnlyPropagatesWithoutChangingElo() public {
        publish(1,a,0);migrate();(bool changed,)=next.historyChanged(0,32);assertFalse(changed);
        oldLobby.correct(result(1,a,0),true);(changed,)=next.historyChanged(0,32);assertTrue(changed);next.synchronizeHistory(32);
        assertTrue(next.entry(1).finality);assertEq(next.buildGeneration(),0);equalRatings();
        (changed,)=next.historyChanged(0,32);assertFalse(changed);
    }
    function testSeasonBoundaryDoesNotResetMigrationOrChangeHistoricalTimestamps() public {
        publish(1,a,0);vm.warp(genesis+30 days+100);migrate();equalRatings();
        T.Result memory r=result(2,b,0);next.publish(r,false);control.publish(r,false);equalRatings();
        assertEq(next.entry(1).at,genesis);
    }
    function testMissingOriginalSeedsCannotStartEvenWhenNoMatchesExist() public {
        ContinuingHumanRatings empty=new ContinuingHumanRatings(source,address(source).codehash,SEAL,AUDIT,seedHash,address(this),address(this));
        vm.expectRevert("original seeds differ from audit");empty.startImport();
    }
    function testSourceMatchAndMixedRevisionPreventImport() public {
        publish(1,a,0);oldLobby.busy(5);vm.expectRevert("source match pending");next.startImport();oldLobby.busy(0);
        next.startImport();T.Result memory r=result(1,b,0);r.hash=keccak256("late change");oldLobby.correct(r,false);
        vm.expectRevert("source changed during import");next.importPage(32);
    }
    function testNewSourceResultBlocksNewRankedUseInsteadOfLosingIt() public {
        publish(1,a,0);migrate();publish(2,b,0);
        vm.expectRevert("source history grew after migration");next.ratingOf(a,0);
        vm.expectRevert("source history grew after migration");next.publish(result(3,a,0),false);
    }
    function testCannotSkipVerificationChangeSeedsOrRewriteInheritedResults() public {
        publish(1,a,0);next.startImport();next.importPage(32);
        vm.expectRevert("incomplete rating verification");next.finishImport();next.verifyPlayers(0,32);next.verifyPlayers(1,32);next.finishImport();
        (address[] memory accounts,L.Rating[] memory values)=initial();vm.expectRevert("seed import closed");next.seed(accounts,0,values);
        vm.expectRevert("historical result belongs to predecessor");next.reconcile(result(1,b,0),false);
        vm.expectRevert("result identity");next.publish(result(1,a,0),false);
        vm.expectRevert("finish verified import only");next.sealMigration(SEAL);
    }
}
