// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentPoolFixture} from "./ReusableAgentPool.t.sol";
import {ReusableAgentPool} from "../src/agents/competition/ReusableAgentPool.sol";
import {PublicationReadyAgentPool} from "../src/agents/competition/PublicationReadyAgentPool.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";
import {AgentChallenges} from "../src/agents/competition/AgentChallenges.sol";
import {AgentQualifications} from "../src/agents/competition/AgentQualifications.sol";
import {HouseInstanceChallenges} from "../src/agents/competition/HouseInstanceChallenges.sol";
import {HouseInstanceQualifications} from "../src/agents/competition/HouseInstanceQualifications.sol";

contract PublicationReadyAgentPoolTest is ReusableAgentPoolFixture {
    function makePool() internal override returns(ReusableAgentPool){return new PublicationReadyAgentPool(catalog,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE));}
    function arenaCount() internal pure override returns(uint8){return 5;}
    function makeChallenges() internal override returns(AgentChallenges){return new HouseInstanceChallenges(family,catalog,address(pool),address(this));}
    function makeQualifications() internal override returns(AgentQualifications){return new HouseInstanceQualifications(catalog,address(pool));}
    function beforeSeal() internal override {PublicationReadyAgentPool(address(pool)).configureOperators(address(123),address(124));}
    function enable(uint8 index,uint256 epoch) internal {
        PublicationReadyAgentPool(address(pool)).setArenaAdmission(address(arenas[index]),epoch,true,keccak256("healthy"));
    }
    function testHealthFlagAndGetterCannotAdmitBeforeActualPublishedMarker() public {
        enable(0,1);assertFalse(PublicationReadyAgentPool(address(pool)).arenaAvailable(address(arenas[0])));
        arenas[0].RULES_VERSION();assertFalse(PublicationReadyAgentPool(address(pool)).arenaAvailable(address(arenas[0])));
        // This unit fixture shares EVM storage between both chains. Hosted
        // tests must prove the actual publication before claiming readiness.
        vm.chainId(4242);arenas[0].preparePublication(1);vm.chainId(10143);
        assertTrue(PublicationReadyAgentPool(address(pool)).arenaAvailable(address(arenas[0])));
        uint64 tournament=begin();T.Ref memory ref=pool.admitTournament(tournament);
        assertEq(ref.arena,address(arenas[0]));assertGt(ref.id,0);
    }
    function testOldMarkerCannotAuthorizeANewEpochAndOtherArenaRemainsAvailable() public {
        enable(0,1);enable(1,1);
        vm.chainId(4242);arenas[0].preparePublication(1);arenas[1].preparePublication(1);vm.chainId(10143);
        address app=address(arenas[0]);pool.closeReusableArena(app);vm.warp(vm.getBlockTimestamp()+3600);
        pool.releaseArena(app);pool.openReusableArena(app);enable(0,2);
        assertFalse(PublicationReadyAgentPool(address(pool)).arenaAvailable(app));assertTrue(PublicationReadyAgentPool(address(pool)).arenaAvailable(address(arenas[1])));
        vm.chainId(4242);arenas[0].preparePublication(2);vm.chainId(10143);assertTrue(PublicationReadyAgentPool(address(pool)).arenaAvailable(app));
        assertLe(address(pool).code.length,32768);
    }
}
