// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {FiveLaneAgentInstancesPool} from "./FiveLaneAgentInstancesPool.sol";
import {MigratingAgentCatalog,IRetiredAgentPool} from "./MigratingAgentCatalog.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";

/// One-time migration from the existing two-lane pool. The source code hash and
/// frozen match counter bind this import; historical references remain intact.
contract ContinuingFiveLaneAgentPool is FiveLaneAgentInstancesPool {
    event MatchCounterContinued(address indexed predecessor,uint256 nonce,bytes32 sourceCodeHash);
    constructor(MigratingAgentCatalog c,IInterludeHub h,address admin,address bridge,bytes32 sourceCodeHash)
        FiveLaneAgentInstancesPool(c,h,admin,bridge)
    {
        address prior=c.predecessor().arenaPool();IRetiredAgentPool source=IRetiredAgentPool(prior);
        require(prior.codehash==sourceCodeHash&&sourceCodeHash!=0,"source pool code");
        require(c.owner()==admin&&c.importStarted()&&!c.setupSealed(),"source pool import binding");
        require(!source.admissions()&&!source.publicAdmissions()&&source.laneMatch(0)==0&&source.laneMatch(1)==0,"source pool still active");
        require(source.nonce()==c.sourceMatchNonce(),"source match counter changed");
        nonce=c.sourceMatchNonce();emit MatchCounterContinued(prior,nonce,sourceCodeHash);
    }
}
