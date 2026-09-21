// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentInstancesPoolTest} from "./ReusableAgentInstancesPool.t.sol";
import {ReusableAgentPool} from "../src/agents/competition/ReusableAgentPool.sol";
import {BalancedAgentInstancesPool} from "../src/agents/competition/BalancedAgentInstancesPool.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";
import {ReusableAgentGame as Game} from "../src/agents/competition/ReusableAgentGame.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract BalancedAgentInstancesPoolTest is ReusableAgentInstancesPoolTest {
    function makePool() internal override returns(ReusableAgentPool){
        return new BalancedAgentInstancesPool(catalog,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE));
    }
    function testSameSessionNextTournamentFixtureAndHistoricalProofAfterReuse() public override {
        // Same-session reuse remains possible when it is the only idle arena.
        pool.closeReusableArena(address(arenas[1]));pool.closeReusableArena(address(arenas[2]));
        super.testSameSessionNextTournamentFixtureAndHistoricalProofAfterReuse();
    }
    function testSequentialTournamentMatchesUseEachIdleArenaBeforeRepeating() public {
        uint64 id=begin();
        for(uint8 i;i<3;i++){
            sourceBlock();T.Ref memory ref=pool.admitTournament(id);assertEq(ref.arena,address(arenas[i]));admit(ref);
            Game.Result memory result=finish(ref,book.fixture(id,i).a);pool.captureProof(ref,result,firstProof());book.synchronize(id,i);
        }
        sourceBlock();T.Ref memory fourth=pool.admitTournament(id);assertEq(fourth.arena,address(arenas[0]));
        assertEq(fourth.epoch,1);assertEq(fourth.id,4);
    }
    function testRepeatedHumanChallengesSpreadWithoutChangingIdentityOrRatings() public {
        for(uint8 i;i<3;i++){
            sourceBlock();challenge(address(0x1000),0);T.Ref memory ref=pool.admitChallenge();assertEq(ref.arena,address(arenas[i]));
            admit(ref);Game.Result memory result=finish(ref,vm.addr(PLAYER));pool.captureProof(ref,result,firstProof());
            assertEq(pool.houseInstancesOf(T.key(ref)),2);assertEq(queue.pending(vm.addr(PLAYER)),0);
        }
        assertEq(ratings.ratingOf(vm.addr(PLAYER),0).played,0);assertEq(ratings.ratingOf(address(0x1000),0).played,0);
    }
    function testQualificationSpreadsAcrossIdleArenas() public {
        catalog.qualify(address(0x1000),0,false,bytes32(uint256(2)));
        T.Ref memory first=pool.admitQualification();assertEq(first.arena,address(arenas[0]));admit(first);
        Game.Result memory result=finish(first,address(0x1000));pool.captureProof(first,result,firstProof());
        catalog.qualify(address(0x1001),0,false,bytes32(uint256(2)));sourceBlock();
        T.Ref memory second=pool.admitQualification();assertEq(second.arena,address(arenas[1]));
    }
    function testAvailabilityExcludesUnknownStaleAndNearExpirySessions() public {
        BalancedAgentInstancesPool candidate=BalancedAgentInstancesPool(address(pool));
        assertFalse(candidate.arenaAvailable(address(0xdead)));
        Types.Session memory session=hub.sessionOf(address(arenas[0]),Types.GLOBAL);session.epoch++;
        vm.mockCall(address(hub),abi.encodeCall(IInterludeHub.sessionOf,(address(arenas[0]),Types.GLOBAL)),abi.encode(session));
        assertFalse(candidate.arenaAvailable(address(arenas[0])));
        session=hub.sessionOf(address(arenas[1]),Types.GLOBAL);session.expiresAt=uint64(vm.getBlockTimestamp()+7 minutes);
        vm.mockCall(address(hub),abi.encodeCall(IInterludeHub.sessionOf,(address(arenas[1]),Types.GLOBAL)),abi.encode(session));
        assertFalse(candidate.arenaAvailable(address(arenas[1])));
        uint64 id=begin();assertEq(pool.admitTournament(id).arena,address(arenas[2]));
    }
}
