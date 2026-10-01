// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PublicationReadyAgentPool} from "./PublicationReadyAgentPool.sol";
import {MigratingAgentCatalogBase,IRetiredAgentPool,RetiredAgentLanes} from "./MigratingAgentCatalog.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";

/// One-time migration from the existing two-lane pool. The source code hash and
/// frozen match counter bind this import; historical references remain intact.
contract ContinuingFiveLaneAgentPool is PublicationReadyAgentPool {
    event MatchCounterContinued(address indexed predecessor,uint256 nonce,bytes32 sourceCodeHash);
    constructor(MigratingAgentCatalogBase c,IInterludeHub h,address admin,address bridge,bytes32 sourceCodeHash)
        PublicationReadyAgentPool(c,h,admin,bridge)
    {
        address prior=c.predecessor().arenaPool();IRetiredAgentPool source=IRetiredAgentPool(prior);
        require(prior.codehash==sourceCodeHash&&sourceCodeHash!=0,"source pool code");
        require(c.owner()==admin&&c.importStarted()&&!c.setupSealed(),"source pool import binding");
        require(!source.admissions()&&!source.publicAdmissions(),"source pool still active");
        RetiredAgentLanes.requireIdle(prior);
        require(source.nonce()==c.sourceMatchNonce(),"source match counter changed");
        nonce=c.sourceMatchNonce();emit MatchCounterContinued(prior,nonce,sourceCodeHash);
    }
}
