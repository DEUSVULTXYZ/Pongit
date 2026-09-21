// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MigratingAgentCatalogTest} from "./MigratingAgentCatalog.t.sol";
import {ContinuingAgentInstancesPool} from "../src/agents/competition/ContinuingAgentInstancesPool.sol";
import {BalancedAgentInstancesPool} from "../src/agents/competition/BalancedAgentInstancesPool.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";

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
}
