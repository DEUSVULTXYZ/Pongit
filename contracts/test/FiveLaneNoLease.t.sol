// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {FiveLaneAgentInstancesPoolTest} from "./FiveLaneAgentInstancesPool.t.sol";
import {ReusableAgentPoolFixture} from "./ReusableAgentPool.t.sol";
import {ReusableAgentPool} from "../src/agents/competition/ReusableAgentPool.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";
import {ReusableAgentGame as Game} from "../src/agents/competition/ReusableAgentGame.sol";

contract FiveLaneNoLeaseTest is FiveLaneAgentInstancesPoolTest {
    address constant V3=0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e;
    function makePool() internal override returns(ReusableAgentPool){
        vm.etch(V3,address(hub).code);hub=IndependentHubFixture(V3);return super.makePool();
    }
    function noLease() internal {
        for(uint8 i;i<7;i++){
            Types.Session memory s=hub.sessionOf(address(arenas[i]),Types.GLOBAL);s.expiresAt=0;
            vm.mockCall(address(hub),abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(arenas[i]),Types.GLOBAL),abi.encode(s));
        }
    }
    function testNoLeaseFiveConcurrentCopiesAndReverseCapture() public {
        noLease();assertEq(pool.releasedArenaCount(),7);
        (T.Ref[5] memory refs,address bot,uint64 tournament)=five();
        for(uint8 remaining=5;remaining>0;remaining--){
            // Refresh the no-lease view after the fixture's canonical publish;
            // do not freeze its batch index at the pre-game value.
            vm.clearMockedCalls();
            uint8 i=remaining-1;Game.Result memory result_=finish(refs[i],pool.record(refs[i]).a);
            noLease();
            pool.captureProof(refs[i],result_,firstProof());
            for(uint8 j=0;j<i;j++)assertEq(pool.laneRecord(j).ref.id,refs[j].id);
            assertEq(catalog.participation(bot),book.token(tournament));
        }
        assertEq(pool.releasedArenaCount(),7);
    }
    function testZeroLeaseCannotAuthorizePublicExpiryRecoveryOrClosure() public {
        noLease();address app=address(arenas[0]);
        vm.expectRevert("not expired");pool.recoverExpired(app);
        vm.prank(address(0xcafe));vm.expectRevert("arena still admitting");pool.closeReusableArena(app);
        vm.prank(MAINTENANCE);pool.closeReusableArena(app);
        assertEq(uint256(hub.statusOf(app,Types.GLOBAL)),uint256(Types.Status.Exiting));
    }
    function testNoLeaseDoesNotAuthorizeClosingAnActiveGame() public {
        noLease();T.Ref memory ref=pool.admitTournament(begin());admit(ref);
        vm.expectRevert("published match running");pool.closeReusableArena(ref.arena);
        vm.prank(MAINTENANCE);vm.expectRevert("arena still admitting");pool.closeReusableArena(ref.arena);
    }
}

contract ForeignZeroLeasePoolTest is ReusableAgentPoolFixture {
    function testUnknownZeroExpiryIsNotAdmissionCapacityOrExpiryProof() public {
        for(uint8 i;i<3;i++){
            Types.Session memory s=hub.sessionOf(address(arenas[i]),Types.GLOBAL);s.expiresAt=0;
            vm.mockCall(address(hub),abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(arenas[i]),Types.GLOBAL),abi.encode(s));
        }
        assertEq(pool.releasedArenaCount(),0);
        assertEq(pool.admitTournament(begin()).id,0);
        vm.expectRevert("not expired");pool.recoverExpired(address(arenas[0]));
    }
}
