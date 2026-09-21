// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {AgentCatalog} from "../src/agents/competition/AgentCatalog.sol";
import {AgentTournaments} from "../src/agents/competition/AgentTournaments.sol";
import {CompetitionTypes as T,ICompetitionAuthority} from "../src/agents/competition/CompetitionTypes.sol";
import {TournamentRules as R} from "../src/agents/competition/TournamentRules.sol";
import {StrategyCode} from "../src/agents/competition/StrategyCode.sol";
import {HousePolicies} from "../src/agents/competition/HousePolicies.sol";

contract CompetitionAuthorityMock is ICompetitionAuthority {
    mapping(bytes32=>T.Result) private results;
    mapping(address=>uint32) public rating;
    bool public offline;
    function setRating(address agent,uint32 value) external {rating[agent]=value;}
    function setOffline(bool value) external {offline=value;}
    function seedElo(address agent,uint8) external view returns(uint32){require(!offline,"ranking offline");return rating[agent]==0?1000:rating[agent];}
    function result(T.Ref calldata ref) external view returns(T.Result memory){require(!offline,"RPC state unavailable");return results[T.key(ref)];}
    function put(T.Result calldata value) external {results[T.key(value.ref)]=value;}
    function bind(AgentTournaments book,uint64 id,uint8 index,T.Ref calldata ref) external {book.bind(id,index,ref);}
    function unlock(AgentCatalog registry,address agent,bytes32 token) external {registry.release(agent,token);}
    function qualify(AgentCatalog registry,address agent,uint8 mode) external {registry.qualify(agent,mode,true,bytes32(uint256(9)));}
}
contract StrategyCodeHarness {function verify(address strategy) external view returns(bytes32){return StrategyCode.verify(strategy);}}

contract AgentTournamentsTest is Test {
    AgentCatalog catalog;AgentTournaments book;CompetitionAuthorityMock source;
    uint256 serial;uint256 clock=1_800_000_000;
    function setUp() public {
        vm.chainId(10143);vm.warp(clock);catalog=new AgentCatalog(address(this),address(this),address(new HousePolicies()));source=new CompetitionAuthorityMock();
        book=new AgentTournaments(catalog,source,address(this));catalog.configure(address(book),address(source));
        vm.prank(address(source));catalog.bindQualifications(address(source));
        for(uint8 i;i<8;i++){
            address bot=address(uint160(0x1000+i));catalog.addHouse(bot,bytes32(uint256(i+1)),i);
            catalog.qualify(bot,0,true,bytes32(uint256(1)));catalog.qualify(bot,1,true,bytes32(uint256(1)));
        }
        catalog.seal();book.setAdmissions(true);
    }
    // Identity-only fixture, not a qualification of an actual playing strategy.
    function code(address strategy,address creator) private {vm.etch(strategy,abi.encodePacked(hex"73",creator,hex"60005260206000f3"));}
    function begin() private returns(uint64 id){id=book.begin();for(uint8 i;i<4&&book.tournament(id).status==AgentTournaments.Status.Selecting;i++)book.select(id,32);}
    function finish(uint64 id,bool draw) private returns(T.Result memory r){
        (uint8 index,address a,address b,bool ranked)=book.nextFixture(id);require(index!=255,"next fixture expected");assertTrue(ranked,"official house duels are ranked");
        T.Ref memory ref=T.Ref(10143,address(0xaa),1,++serial);source.bind(book,id,index,ref);
        r=T.Result(ref,a,b,draw?address(0):a,keccak256(abi.encode(serial)),book.tournament(id).mode,3,draw?6:7,draw?6:0,draw?360_000_000:20_000_000,false);
        source.put(r);book.synchronize(id,index);
    }
    function finishAll(uint64 id,bool draw) private {uint8 n=book.tournament(id).league?28:7;for(uint8 i;i<n;i++)finish(id,draw);}
    function waitMinute() private {clock+=60;vm.warp(clock);}
    function community(uint256 key,address agent) private {communityAs(key,agent,0);}
    function communityAs(uint256 key,address agent,uint256 nonce) private {
        address creator=vm.addr(key);code(agent,creator);
        AgentCatalog.Registration memory r=AgentCatalog.Registration(agent,creator,bytes32(uint256(uint160(agent))),3,uint64(clock+300),nonce);
        (uint8 v,bytes32 rr,bytes32 s)=vm.sign(key,catalog.digest(r));catalog.register(r,abi.encodePacked(rr,s,v));
        source.qualify(catalog,agent,0);source.qualify(catalog,agent,1);
        vm.prank(creator);catalog.setAvailable(agent,true);
    }
    function testFourFormatsCompleteWithContractScheduleAndOneMinuteGap() public {
        for(uint64 id=1;id<=4;id++){
            assertEq(begin(),id);AgentTournaments.Tournament memory t=book.tournament(id);
            assertEq(t.mode,(id-1)%2);assertEq(t.league,(id-1)%4>=2);finishAll(id,false);
            t=book.tournament(id);assertEq(uint8(t.status),uint8(AgentTournaments.Status.Complete));assertEq(t.champion,address(0x1000));
            for(uint8 i;i<8;i++)assertEq(catalog.participation(t.agents[i]),0);
            vm.expectRevert("tournament admission waiting");book.begin();waitMinute();
        }
        assertEq(serial,70);
    }
    function testKnockoutDrawHasAdministrativeAdvanceWithoutChangingPublishedWinner() public {
        source.setRating(address(0x1001),1300);uint64 id=begin();finish(id,true);
        AgentTournaments.Fixture memory f=book.fixture(id,0);assertTrue(f.administrative);assertEq(f.advanced,address(0x1001));assertEq(f.published.winner,address(0));
        (uint8 index,address a,address b,)=book.nextFixture(id);T.Ref memory ref=T.Ref(10143,address(0xaa),1,++serial);source.bind(book,id,index,ref);
        T.Result memory r=T.Result(ref,a,b,address(0),bytes32(serial),0,3,6,6,300_000_000,false);source.put(r);
        vm.expectRevert("knockout overtime incomplete");book.synchronize(id,index);
        r.elapsedUs=360_000_000;source.put(r);book.synchronize(id,index);assertEq(book.fixture(id,index).advanced,a);
    }
    function testLeagueStandingsRecalculateAfterPublishedCorrection() public {
        uint64 id=begin();finishAll(id,false);waitMinute();id=begin();finishAll(id,false);waitMinute();id=begin();finishAll(id,true);
        T.Standing[8] memory rows=book.standings(id);for(uint8 i;i<8;i++){assertEq(rows[i].points,7);assertEq(rows[i].wins,0);assertEq(rows[i].difference,0);}
        T.Result memory r=book.fixture(id,0).published;r.winner=r.b;r.scoreA=2;r.scoreB=7;r.hash=bytes32(uint256(0xbeef));source.put(r);book.synchronize(id,0);
        rows=book.standings(id);assertEq(rows[0].agent,r.b);assertEq(rows[0].points,9);assertEq(rows[0].wins,1);assertEq(rows[0].difference,5);
        assertEq(book.tournament(id).champion,r.b);book.synchronize(id,0);assertEq(book.tournament(id).revision,1,"not counted twice");
    }
    function testCorrectionInvalidatesOnlyDescendantsAndWaitsForExistingParticipation() public {
        uint64 id=begin();finishAll(id,false);T.Result memory r=book.fixture(id,0).published;
        waitMinute();uint64 next=begin();r.winner=r.b;r.scoreA=0;r.scoreB=7;r.hash=bytes32(uint256(0xbeef));source.put(r);book.synchronize(id,0);
        assertEq(uint8(book.tournament(id).status),uint8(AgentTournaments.Status.RepairWaiting));
        assertTrue(book.fixture(id,1).resolved);assertFalse(book.fixture(id,4).resolved);assertFalse(book.fixture(id,6).resolved);assertTrue(book.fixture(id,5).resolved);
        assertEq(book.attemptCount(id,4),1);vm.expectRevert("agent unavailable");book.resumeRepair(id);
        finishAll(next,false);book.resumeRepair(id);finish(id,false);finish(id,false);
        assertEq(book.attemptCount(id,4),2);assertEq(book.tournament(id).champion,r.b);
    }
    function testTransportErrorPreservesResultAndFinalityCannotBeReversed() public {
        uint64 id=begin();T.Result memory r=finish(id,false);source.setOffline(true);
        vm.expectRevert("RPC state unavailable");book.synchronize(id,0);assertTrue(book.fixture(id,0).resolved);
        source.setOffline(false);r.finality=true;source.put(r);book.synchronize(id,0);
        r.finality=false;source.put(r);vm.expectRevert("finality cannot decrease");book.synchronize(id,0);
        r.finality=true;r.hash=bytes32(uint256(99));source.put(r);vm.expectRevert("final result immutable");book.synchronize(id,0);
    }
    function testNoDoubleBindingWrongReferenceOrCrossControllerUnlock() public {
        uint64 id=begin();T.Result memory r=finish(id,false);
        vm.expectRevert("fixture order");source.bind(book,id,0,r.ref);
        vm.expectRevert("match reused");source.bind(book,id,1,r.ref);
        bytes32 reserved=book.token(id);vm.expectRevert("participation reference");source.unlock(catalog,r.a,reserved);
        r.ref.epoch=2;source.put(r);r=book.fixture(id,0).published;r.b=address(0x9999);source.put(r);
        vm.expectRevert("published binding");book.synchronize(id,0);
    }
    function testSelectionUsesLongestWaitAndRestartsOnConcurrentCatalogueChange() public {
        uint64 id=begin();finishAll(id,false);waitMinute();
        for(uint256 i;i<34;i++)community(100+i,address(uint160(0x2000+i)));
        id=book.begin();book.select(id,16);assertEq(book.tournament(id).cursor,16);
        vm.prank(vm.addr(100));catalog.setAvailable(address(0x2000),false);book.select(id,16);assertEq(book.tournament(id).cursor,16);
        book.select(id,32);AgentTournaments.Tournament memory t=book.tournament(id);
        assertEq(uint8(t.status),uint8(AgentTournaments.Status.Playing));for(uint8 i;i<8;i++)assertEq(t.agents[i],address(uint160(0x2001+i)));
    }
    function testNamesCannotImpersonateOfficialBotsAndCodeMustRemainImmutable() public {
        community(123,address(0x3000));assertEq(catalog.identity(address(0x3000)).house,0);
        vm.expectRevert("house setup only");catalog.addHouse(address(0x3000),bytes32(uint256(1)),0);
        assertTrue(catalog.eligible(address(0x3000),0));vm.etch(address(0x3000),hex"00");assertFalse(catalog.eligible(address(0x3000),0));
        StrategyCodeHarness check=new StrategyCodeHarness();vm.etch(address(0x4000),hex"60005400");vm.expectRevert();check.verify(address(0x4000));
        vm.etch(address(0x4000),hex"60545000");check.verify(address(0x4000)); // forbidden value inside PUSH is data
        vm.etch(address(0x4000),hex"6000fa00");vm.expectRevert();check.verify(address(0x4000));
    }
    function testOfficialHouseDuelsRankWhileOneCreatorCannotFarmItsOwnAgents() public {
        uint64 id=begin();(,address a,address b,bool official)=book.nextFixture(id);
        assertTrue(catalog.identity(a).house!=0&&catalog.identity(b).house!=0,"official bracket expected");
        assertEq(catalog.identity(a).creator,catalog.identity(b).creator,"official bots share one creator");
        assertTrue(official,"official house duels are ranked");
        finishAll(id,false);waitMinute();
        // Eight agents behind a single creator wait longer than the official bots,
        // so the next bracket is entirely theirs. None of those duels may rank.
        for(uint256 i;i<8;i++)communityAs(321,address(uint160(0x5000+i)),i);
        id=begin();(,address c,address d,bool farmed)=book.nextFixture(id);
        assertEq(catalog.identity(c).house,0);assertEq(catalog.identity(d).house,0);
        assertEq(catalog.identity(c).creator,catalog.identity(d).creator,"one creator fielded both");
        assertFalse(farmed,"a creator cannot farm rating against its own agents");
    }
    function testRoundRobinVisitsEachPairOnceAndDeployedContractsFit() public view {
        uint256 seen;for(uint8 i;i<28;i++){(uint8 a,uint8 b)=R.leaguePair(i);assertLt(a,b);uint256 bit=uint256(1)<<(a*8+b);assertEq(seen&bit,0);seen|=bit;}
        assertLe(address(book).code.length,24576);assertLe(address(catalog).code.length,24576);
    }
}
