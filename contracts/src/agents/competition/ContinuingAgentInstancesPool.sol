// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {BalancedAgentInstancesPool} from "./BalancedAgentInstancesPool.sol";
import {MigratingAgentCatalog,IRetiredAgentPool} from "./MigratingAgentCatalog.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";

/// Constructor-only continuation: logical match numbering does not restart.
/// Ledger keys still bind the complete reference, including arena and epoch.
/// Runtime remains the reviewed balanced pool; no administrator can
/// change the counter after deployment. The catalogue rechecks it when sealing.
contract ContinuingAgentInstancesPool is BalancedAgentInstancesPool {
    event MatchCounterContinued(address indexed predecessor,uint256 nonce,bytes32 sourceCodeHash);
    constructor(MigratingAgentCatalog c,IInterludeHub h,address admin,address bridge,bytes32 sourceCodeHash)
        BalancedAgentInstancesPool(c,h,admin,bridge)
    {
        address prior=c.predecessor().arenaPool();IRetiredAgentPool source=IRetiredAgentPool(prior);
        require(prior.codehash==sourceCodeHash&&sourceCodeHash!=0,"source pool code");
        require(c.owner()==admin&&c.importStarted()&&!c.setupSealed(),"source pool import binding");
        require(!source.admissions()&&!source.publicAdmissions()&&source.laneMatch(0)==0&&source.laneMatch(1)==0,"source pool still active");
        require(source.nonce()==c.sourceMatchNonce(),"source match counter changed");
        nonce=c.sourceMatchNonce();emit MatchCounterContinued(prior,nonce,sourceCodeHash);
    }
}
