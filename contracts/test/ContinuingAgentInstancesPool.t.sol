// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MigratingAgentCatalogTest} from "./MigratingAgentCatalog.t.sol";
import {ContinuingAgentInstancesPool} from "../src/agents/competition/ContinuingAgentInstancesPool.sol";
import {BalancedAgentInstancesPool} from "../src/agents/competition/BalancedAgentInstancesPool.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {ContinuingFiveLaneAgentPool} from "../src/agents/competition/ContinuingFiveLaneAgentPool.sol";
import {IndependentHubFixture} from "./Independent.t.sol";

contract ContinuingAgentInstancesPoolTest is MigratingAgentCatalogTest {
    function _pool(bytes32 hash,address admin) private returns(ContinuingAgentInstancesPool){
        return new ContinuingAgentInstancesPool(next,IInterludeHub(address(pool)),admin,address(0xbeef),hash);
    }
    function testLogicalMatchIdsContinueAndRuntimeBudgetIsUnchanged() public {
        pool.setNonce(900);next.startImport();ContinuingAgentInstancesPool continued=_pool(address(pool).codehash,address(this));
        assertEq(continued.nonce(),900);assertFalse(continued.admissions());assertFalse(continued.publicAdmissions());
        assertEq(address(continued.catalog()),address(next));assertEq(continued.owner(),address(this));
        assertLe(address(continued).code.length,32768);
        BalancedAgentInstancesPool fresh=new BalancedAgentInstancesPool(next,IInterludeHub(address(pool)),address(this),address(0xbeef));
        assertEq(address(continued).code.length,address(fresh).code.length,"constructor only continuation");
    }
    function testActiveOrChangedPredecessorCannotSetContinuationCounter() public {
        next.startImport();pool.setLane(1,bytes32(uint256(1)));
        vm.expectRevert("source pool still active");new ContinuingAgentInstancesPool(next,IInterludeHub(address(pool)),address(this),address(0xbeef),address(pool).codehash);
        pool.setLane(1,0);pool.setNonce(1);
        vm.expectRevert("source match counter changed");new ContinuingAgentInstancesPool(next,IInterludeHub(address(pool)),address(this),address(0xbeef),address(pool).codehash);
    }
    function testWrongPredecessorCodeAndUnstartedImportRejected() public {
        bytes32 code=address(pool).codehash;
        vm.expectRevert("source pool code");new ContinuingAgentInstancesPool(next,IInterludeHub(address(pool)),address(this),address(0xbeef),bytes32(uint256(1)));
        vm.expectRevert("source pool import binding");new ContinuingAgentInstancesPool(next,IInterludeHub(address(pool)),address(this),address(0xbeef),code);
        next.startImport();vm.expectRevert("source pool import binding");new ContinuingAgentInstancesPool(next,IInterludeHub(address(pool)),address(123),address(0xbeef),code);
    }
    function testFiveLaneContinuationCanChangeHubWithoutChangingIdentitiesOrCounter() public {
        pool.setLaneCount(5);pool.setNonce(900);next.startImport();
        IInterludeHub target=IInterludeHub(0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e);
        vm.etch(address(target),address(new IndependentHubFixture()).code);
        ContinuingFiveLaneAgentPool continued=new ContinuingFiveLaneAgentPool(next,target,address(this),address(0xbeef),address(pool).codehash);
        assertEq(address(continued.hub()),address(target));assertEq(continued.nonce(),900);
        assertFalse(continued.admissions());assertFalse(continued.publicAdmissions());assertLe(address(continued).code.length,32768);
        next.importPage(32);next.seal();
        for(uint256 i;i<old.count();i++)assertEq(abi.encode(next.identity(old.at(i))),abi.encode(old.identity(old.at(i))));
        assertEq(pool.nonce(),900,"No write to predecessor counter");
    }
}
