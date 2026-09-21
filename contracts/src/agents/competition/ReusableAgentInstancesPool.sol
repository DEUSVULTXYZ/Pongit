// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentPool} from "./ReusableAgentPool.sol";
import {AgentCatalog} from "./AgentCatalog.sol";
import {HouseInstances} from "./HouseInstances.sol";
import {HouseInstanceChallenges} from "./HouseInstanceChallenges.sol";
import {HouseInstanceQualifications} from "./HouseInstanceQualifications.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";

/// Versioned replacement, never an upgrade of an existing deployed authority.
/// Same two lanes; reuse supplies independent controllers, not extra capacity.
contract ReusableAgentInstancesPool is ReusableAgentPool {
    uint256 public constant AUTHORITY_VERSION=2;
    constructor(AgentCatalog c,IInterludeHub h,address admin,address bridge) ReusableAgentPool(c,h,admin,bridge){}
    function supportsHouseInstances() external pure returns(bool){return true;}
    function _independentHouse(address agent,uint8 mode,bool qualification) internal view override returns(bool){
        return HouseInstances.eligible(catalog,agent,mode,qualification);
    }
    function seal() public override {
        require(HouseInstanceChallenges(address(challenges)).supportsHouseInstances()
            &&HouseInstanceQualifications(address(qualifications)).supportsHouseInstances(),"instance queues required");
        super.seal();
    }
}
