// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentPoolFixture} from "./ReusableAgentPool.t.sol";
import {ReusableAgentPool} from "../src/agents/competition/ReusableAgentPool.sol";
import {FiveLaneAgentInstancesPool} from "../src/agents/competition/FiveLaneAgentInstancesPool.sol";
import {AgentChallenges} from "../src/agents/competition/AgentChallenges.sol";
import {AgentQualifications} from "../src/agents/competition/AgentQualifications.sol";
import {HouseInstanceChallenges} from "../src/agents/competition/HouseInstanceChallenges.sol";
import {HouseInstanceQualifications} from "../src/agents/competition/HouseInstanceQualifications.sol";
import {ArcadeFamily} from "../src/independent/ArcadeFamily.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";
import {AgentArenaTypes as A} from "../src/agents/competition/AgentArenaTypes.sol";
import {ReusableAgentGame as Game} from "../src/agents/competition/ReusableAgentGame.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";

contract FiveLaneAgentInstancesPoolTest is ReusableAgentPoolFixture {
    address constant ADMISSION=address(0xad01);
    address constant MAINTENANCE=address(0xad02);
    bytes32 constant HEALTHY=keccak256("verified node and publication");
    function candidate() internal view returns(FiveLaneAgentInstancesPool){return FiveLaneAgentInstancesPool(address(pool));}
    function makePool() internal virtual override returns(ReusableAgentPool){return new FiveLaneAgentInstancesPool(catalog,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE));}
    function makeChallenges() internal override returns(AgentChallenges){return new HouseInstanceChallenges(family,catalog,address(pool),address(this));}
    function makeQualifications() internal override returns(AgentQualifications){return new HouseInstanceQualifications(catalog,address(pool));}
    function arenaCount() internal pure override returns(uint8){return 7;}
    function beforeSeal() internal override {candidate().configureOperators(ADMISSION,MAINTENANCE);}
    function afterOpen() internal override {for(uint8 i;i<7;i++)candidate().setArenaAdmission(address(arenas[i]),1,true,HEALTHY);}
    function requestFor(uint256 playerKey,address bot,uint8 mode) internal returns(address player){
        player=vm.addr(playerKey);uint256 sessionKey=playerKey+10_000;
        ArcadeFamily.Grant memory g=ArcadeFamily.Grant(player,vm.addr(sessionKey),uint64(vm.getBlockTimestamp()),uint64(vm.getBlockTimestamp()+7200),0);
        family.register(g,sig(playerKey,family.grantDigest(g)));bytes32 hash=family.grantDigest(g);uint64 until=uint64(vm.getBlockTimestamp()+120);
        queue.command(player,1,bot,mode,0,0,until,sig(sessionKey,queue.digest(hash,1,bot,mode,0,0,until)));
    }
    function five() internal returns(T.Ref[5] memory refs,address bot,uint64 tournament){
        tournament=begin();refs[0]=pool.admitTournament(tournament);bot=book.fixture(tournament,0).a;admit(refs[0]);
        for(uint8 i=1;i<5;i++){
            sourceBlock();address player=requestFor(100+i,bot,i%2);refs[i]=pool.admitChallenge();admit(refs[i]);
            assertEq(pool.laneRecord(i).ref.id,refs[i].id);assertEq(pool.playing(player),T.key(refs[i]));
            (,A.Binding memory binding)=pool.ticketOf(refs[i]);assertEq(binding.controlB.memoryWord,0);assertFalse(binding.ranked);
            assertEq(pool.houseInstancesOf(T.key(refs[i])),2);
            for(uint8 j=0;j<i;j++)assertTrue(refs[j].arena!=refs[i].arena);
        }
        assertEq(pool.playing(bot),T.key(refs[0]));assertEq(catalog.participation(bot),book.token(tournament));
    }
    function testFourCopiesAndTournamentHaveIndependentAssignmentsAndNoSixthLane() public {
        (T.Ref[5] memory refs,address bot,uint64 tournament)=five();
        sourceBlock();requestFor(999,bot,0);vm.expectRevert("challenge lane waiting");pool.admitChallenge();
        vm.expectRevert("lane bounds");pool.laneRecord(5);
        vm.expectRevert("lane bounds");pool.laneMatch(5);
        vm.expectRevert("tournament lane waiting");pool.admitTournament(tournament);
        for(uint8 i;i<5;i++)assertEq(pool.laneMatch(i),T.key(refs[i]));
    }
    function testCapturesInEveryOrderPreserveOtherCopiesAndCompetitiveLock() public {
        // All 5! permutations, including competitive capture before/after copies.
        (T.Ref[5] memory refs,address bot,uint64 tournament)=five();Game.Result[5] memory results;
        for(uint8 i;i<5;i++)results[i]=finish(refs[i],bot);
        uint256 snapshot=vm.snapshotState();
        for(uint8 a;a<5;a++)for(uint8 b;b<5;b++)if(b!=a)for(uint8 c;c<5;c++)if(c!=a&&c!=b)
        for(uint8 d;d<5;d++)if(d!=a&&d!=b&&d!=c){
            uint8[5] memory order=[a,b,c,d,uint8(10-a-b-c-d)];bool[5] memory done;
            for(uint8 k;k<5;k++){
                uint8 i=order[k];pool.captureProof(refs[i],results[i],firstProof());done[i]=true;
                pool.captureProof(refs[i],results[i],firstProof());
                for(uint8 j;j<5;j++)assertEq(pool.laneMatch(j),done[j]?bytes32(0):T.key(refs[j]));
                assertEq(pool.playing(bot),done[0]?bytes32(0):T.key(refs[0]));
                assertEq(catalog.participation(bot),book.token(tournament));
            }
            assertEq(ratings.ratingOf(bot,0).played,1);assertEq(ratings.ratingOf(bot,1).played,0);
            for(uint8 i=1;i<5;i++){assertEq(queue.pending(vm.addr(100+i)),0);assertEq(ratings.ratingOf(vm.addr(100+i),i%2).played,0);}
            assertTrue(vm.revertToState(snapshot));
        }
    }
    function testExcludingOneEpochLeavesOtherArenasAdmissibleAndCannotAlterActiveMatch() public {
        vm.prank(ADMISSION);candidate().setArenaAdmission(address(arenas[0]),1,false,keccak256("node unavailable"));
        uint64 tournament=begin();T.Ref memory ref=pool.admitTournament(tournament);assertEq(ref.arena,address(arenas[1]));admit(ref);
        vm.prank(ADMISSION);candidate().setArenaAdmission(ref.arena,ref.epoch,false,keccak256("publication paused"));
        assertEq(pool.laneRecord(0).ref.id,ref.id);assertEq(pool.playing(book.fixture(tournament,0).a),T.key(ref));
        Game.Result memory result=finish(ref,book.fixture(tournament,0).a);pool.captureProof(ref,result,firstProof());
        assertEq(pool.result(ref).hash,result.match_.hash);assertFalse(candidate().arenaAvailable(ref.arena));
    }
    function testAdmissionPermissionExpiresWithEpochAndStaleWritesCannotDisableRenewedArena() public {
        address app=address(arenas[0]);pool.closeReusableArena(app);vm.warp(vm.getBlockTimestamp()+3600);pool.releaseArena(app);pool.openReusableArena(app);
        assertFalse(candidate().arenaAvailable(app));assertFalse(candidate().arenaAdmissionEnabled(app,2));
        candidate().setArenaAdmission(app,2,true,HEALTHY);assertTrue(candidate().arenaAvailable(app));
        vm.expectRevert(FiveLaneAgentInstancesPool.AdmissionEpoch.selector);candidate().setArenaAdmission(app,1,false,HEALTHY);
        assertTrue(candidate().arenaAvailable(app));
    }
    function testMaintenanceCanRotateIdleArenasButCannotCloseAnActiveMatchOrEnableAdmissions() public {
        uint64 t=begin();T.Ref memory ref=pool.admitTournament(t);admit(ref);
        vm.prank(MAINTENANCE);vm.expectRevert("arena still admitting");pool.closeReusableArena(ref.arena);
        vm.prank(MAINTENANCE);vm.expectRevert("operator/gates");pool.setAdmissions(false);
        address idle=address(arenas[6]);vm.prank(MAINTENANCE);pool.closeReusableArena(idle);
        vm.warp(vm.getBlockTimestamp()+3600);vm.prank(MAINTENANCE);pool.releaseArena(idle);
        vm.prank(MAINTENANCE);pool.openReusableArena(idle);assertFalse(candidate().arenaAvailable(idle));
    }
    function testAdmissionOperatorCannotGrantItselfLifecycleOrScorePermissions() public {
        address app=address(arenas[0]);
        vm.prank(address(0xbeef));vm.expectRevert(FiveLaneAgentInstancesPool.AdmissionUnauthorized.selector);candidate().setArenaAdmission(app,1,true,HEALTHY);
        vm.prank(ADMISSION);vm.expectRevert("arena still admitting");pool.closeReusableArena(app);
        vm.prank(ADMISSION);vm.expectRevert("operator/gates");pool.setAdmissions(false);
        vm.prank(ADMISSION);vm.expectRevert(FiveLaneAgentInstancesPool.AdmissionSetup.selector);candidate().configureOperators(ADMISSION,MAINTENANCE);
        assertLe(address(pool).code.length,32768);
    }
}
