// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {FiveLaneAgentInstancesPool} from "./FiveLaneAgentInstancesPool.sol";
import {ReusableAgentArena} from "./ReusableAgentArena.sol";
import {AgentCatalog} from "./AgentCatalog.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";

/// New deployments require a real epoch write published to Monad before any
/// admission. Operational flags cannot substitute for this contract evidence.
contract PublicationReadyAgentPool is FiveLaneAgentInstancesPool {
    constructor(AgentCatalog c,IInterludeHub h,address admin,address bridge)
        FiveLaneAgentInstancesPool(c,h,admin,bridge){}
    function _admissionAllowed(address app,uint256 epoch) internal view override returns(bool){
        if(!super._admissionAllowed(app,epoch)||epoch==0)return false;
        try ReusableAgentArena(payable(app)).publicationCheckpoint() returns(uint256 checkpoint){return checkpoint==epoch;}
        catch{return false;}
    }
}
