// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentInstancesPool} from "./ReusableAgentInstancesPool.sol";
import {ReusableAgentArena} from "./ReusableAgentArena.sol";
import {AgentCatalog} from "./AgentCatalog.sol";
import {AgentArenaSelection} from "./AgentArenaSelection.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";

/// A new deployment candidate, never an upgrade of the private/public pools.
/// Spreads sequential matches; it neither promises a quota nor adds capacity.
contract BalancedAgentInstancesPool is ReusableAgentInstancesPool {
    constructor(AgentCatalog c,IInterludeHub h,address admin,address bridge)
        ReusableAgentInstancesPool(c,h,admin,bridge){}
    function arenaAvailable(address arena) external view returns(bool){
        return registered[arena]&&_idle(ReusableAgentArena(arena));
    }
    function _matchArena(ReusableAgentArena,address a,address b) internal view override returns(ReusableAgentArena){
        return AgentArenaSelection.choose(catalog,hub,a,b);
    }
    function _newestIdle() internal view override returns(ReusableAgentArena){
        return AgentArenaSelection.newest(hub);
    }
}
