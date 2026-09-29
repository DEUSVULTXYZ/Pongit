// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MigratingAgentCatalogTest} from "./MigratingAgentCatalog.t.sol";
import {AgentCatalog} from "../src/agents/competition/AgentCatalog.sol";
import {RebalancedAgentCatalog} from "../src/agents/competition/MigratingAgentCatalog.sol";
import {ProgressiveHousePolicies} from "../src/agents/competition/ProgressiveHousePolicies.sol";

contract RebalancedAgentCatalogTest is MigratingAgentCatalogTest {
    function candidate() private returns(RebalancedAgentCatalog c){
        c=new RebalancedAgentCatalog(old,address(old).codehash,address(this),address(this),address(new ProgressiveHousePolicies()));
        c.configure(address(book),address(pool));vm.prank(address(pool));c.bindQualifications(address(pool));
    }
    function testNewPolicyPreservesIdentitiesButRequiresFreshHouseQualification() public {
        _finishTournament();RebalancedAgentCatalog c=candidate();c.startImport();c.importPage(16);c.seal();
        for(uint8 i;i<8;i++){
            address a=old.house(i);assertEq(c.house(i),a);
            AgentCatalog.Identity memory before=old.identity(a);AgentCatalog.Identity memory after_=c.identity(a);
            assertEq(after_.creator,before.creator);assertEq(after_.lastTournament,before.lastTournament);
            assertEq(after_.metadata,before.metadata);assertEq(after_.qualified,0);assertEq(after_.codeHash,c.houseCodeHash());
            assertFalse(c.qualificationInherited(a,0));assertFalse(c.qualificationInherited(a,1));
            assertEq(c.qualificationEvidence(a,0),0);assertEq(c.qualificationEvidence(a,1),0);assertFalse(c.eligible(a,0));
        }
        assertEq(keccak256(abi.encode(c.identity(COMMUNITY))),keccak256(abi.encode(old.identity(COMMUNITY))));
        assertEq(c.nonces(vm.addr(CREATOR)),old.nonces(vm.addr(CREATOR)));
        assertTrue(c.qualificationInherited(COMMUNITY,0));
        pool.qualify(c,c.house(0),0);assertTrue(c.eligible(c.house(0),0));assertFalse(c.eligible(c.house(0),1));
    }
    function testEveryFiveLaneChallengeMustDrainBeforeImport() public {
        pool.setLaneCount(5);RebalancedAgentCatalog c=candidate();
        for(uint8 lane=2;lane<5;lane++){
            pool.setLane(lane,bytes32(uint256(1)));vm.expectRevert("source matches still active");c.startImport();pool.setLane(lane,0);
        }
        c.startImport();pool.setLane(4,bytes32(uint256(1)));vm.expectRevert("source matches still active");c.importPage(16);
        pool.setLane(4,0);c.importPage(16);c.seal();assertTrue(c.setupSealed());
    }
    function testOldVerdictCannotRestoreQualificationForChangedCode() public {
        RebalancedAgentCatalog c=candidate();c.startImport();c.importPage(16);c.seal();
        pool.qualify(old,old.house(0),0);assertEq(c.identity(c.house(0)).qualified,0);
        address bot=c.house(0);vm.expectRevert("qualification already superseded");c.synchronizeQualification(bot,0);
    }
}
