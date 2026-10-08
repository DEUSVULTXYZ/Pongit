// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentPoolFixture,ReusableAgentPoolHarness} from "./ReusableAgentPool.t.sol";
import {ReusableAgentPool} from "../src/agents/competition/ReusableAgentPool.sol";
import {PublicationReadyAgentPool} from "../src/agents/competition/PublicationReadyAgentPool.sol";
import {ProvisionedResponsiveAgentArena} from "../src/labs/ProvisionedResponsiveAgentArena.sol";
import {ReusableAgentGame as Game} from "../src/agents/competition/ReusableAgentGame.sol";
import {AgentChallenges} from "../src/agents/competition/AgentChallenges.sol";
import {AgentQualifications} from "../src/agents/competition/AgentQualifications.sol";
import {HouseInstanceChallenges} from "../src/agents/competition/HouseInstanceChallenges.sol";
import {HouseInstanceQualifications} from "../src/agents/competition/HouseInstanceQualifications.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {ChaosModifiers} from "../src/chaos/ChaosModifiers.sol";
import {ResponsiveChaosModifiers} from "../src/chaos/ResponsiveChaosModifiers.sol";
import {PublishedResultVerifier,IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";

/// Actual deployable responsive arenas, pool admission and published capture.
/// Concessions exercise settlement here, not natural-match browser qualification.
contract ResponsivePoolIntegrationTest is ReusableAgentPoolFixture {
    function makePool() internal override returns(ReusableAgentPool){return new PublicationReadyAgentPool(catalog,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE));}
    function arenaCount() internal pure override returns(uint8){return 5;}
    function makeChallenges() internal override returns(AgentChallenges){return new HouseInstanceChallenges(family,catalog,address(pool),address(this));}
    function makeQualifications() internal override returns(AgentQualifications){return new HouseInstanceQualifications(catalog,address(pool));}
    function makeModifiers() internal override returns(ChaosModifiers){return new ResponsiveChaosModifiers();}
    function makeArena() internal override returns(ReusableAgentPoolHarness){
        return ReusableAgentPoolHarness(address(new ProvisionedResponsiveAgentArena(IInterludeHub(address(hub)),address(pool),vm.addr(BRIDGE),policies,kernel,verifier,vm.addr(987))));
    }
    function beforeSeal() internal override {PublicationReadyAgentPool(address(pool)).configureOperators(address(123),address(124));}
    function afterOpen() internal override {
        for(uint8 i;i<5;i++){
            PublicationReadyAgentPool(address(pool)).setArenaAdmission(address(arenas[i]),1,true,keccak256("fixture health"));
            vm.chainId(4242);arenas[i].preparePublication(1);vm.chainId(10143);
        }
    }
    function exercise(uint8 mode) internal {
        challenge(address(0x1000),mode);T.Ref memory ref=pool.admitChallenge();
        assertGt(ref.id,0);assertEq(arenas[0].RULES_VERSION(),17);
        admit(ref);vm.chainId(4242);
        ProvisionedResponsiveAgentArena arena=ProvisionedResponsiveAgentArena(ref.arena);
        assertEq(arena.getSnapshot(ref.id).phase,1);
        vm.prank(vm.addr(KEY));arena.heartbeat(ref.epoch,ref.id);
        assertEq(arena.getSnapshot(ref.id).phase,2);
        vm.prank(vm.addr(KEY));arena.input(ref.epoch,ref.id,1,1,vm.getBlockNumber()+100);
        vm.roll(vm.getBlockNumber()+20);arena.tick(ref.epoch,ref.id);
        assertEq(arena.getSnapshot(ref.id).state.left,348_000_000);
        vm.prank(vm.addr(KEY));arena.concede(ref.epoch,ref.id);
        Game.Result memory result=arena.publishedResult();assertEq(result.rules,17);
        vm.chainId(10143);vm.expectRevert("result not published");pool.captureProof(ref,result,firstProof());
        hub.publish(ref.arena);pool.captureProof(ref,result,firstProof());pool.captureProof(ref,result,firstProof());
        assertEq(ratings.count(),1);assertEq(queue.pending(vm.addr(PLAYER)),0);assertEq(ratings.ratingOf(vm.addr(PLAYER),mode).played,0);
        assertEq(uint8(hub.statusOf(ref.arena,Types.GLOBAL)),uint8(Types.Status.Active));
        // Selection normally spreads work across idle arenas. Leave this one
        // eligible to prove same-epoch reuse without a lifecycle transition.
        for(uint8 i;i<5;i++)if(address(arenas[i])!=ref.arena)
            PublicationReadyAgentPool(address(pool)).setArenaAdmission(address(arenas[i]),1,false,keccak256("fixture exclusion"));
        sourceBlock();challenge(address(0x1000),mode);T.Ref memory next=pool.admitChallenge();
        assertEq(next.arena,ref.arena);assertEq(next.epoch,ref.epoch);assertGt(next.id,ref.id);
    }
    function testActualClassicArenaAdmissionPresenceCaptureAndSameEpochReuse() public {exercise(0);}
    function testActualChaosArenaAdmissionPresenceCaptureAndSameEpochReuse() public {exercise(1);}
    function testForeignAuthorityRemainsExcludedFromRegistration() public {
        ReusableAgentPool candidate=new ReusableAgentPool(catalog,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE));
        // The existing verifier belongs to a different authority, so a fresh
        // pool cannot silently accept its arena even with a supported version.
        vm.expectRevert(ReusableAgentPool.InvalidArenaConfiguration.selector);candidate.addArena(arenas[0]);
        assertFalse(candidate.registeredArena(address(arenas[0])));
    }
    function testUnrecognizedRulesRemainExcludedFromRegistration() public {
        ReusableAgentPool candidate=new ReusableAgentPool(catalog,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE));
        PublishedResultVerifier check=new PublishedResultVerifier(IReusableAdmissionAuthority(address(candidate)),IInterludeHub(address(hub)));
        candidate.bindVerifier(check);
        ProvisionedResponsiveAgentArena arena=new ProvisionedResponsiveAgentArena(IInterludeHub(address(hub)),address(candidate),vm.addr(BRIDGE),policies,kernel,check,vm.addr(987));
        for(uint8 i;i<2;i++){
            vm.mockCall(address(arena),abi.encodeWithSignature("RULES_VERSION()"),abi.encode(i==0?uint256(14):uint256(18)));
            vm.expectRevert(ReusableAgentPool.InvalidArenaConfiguration.selector);candidate.addArena(arena);
            assertFalse(candidate.registeredArena(address(arena)));
        }
        vm.clearMockedCalls();candidate.addArena(arena);assertTrue(candidate.registeredArena(address(arena)));
    }
}
