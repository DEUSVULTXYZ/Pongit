// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentChallenges} from "./AgentChallenges.sol";
import {AgentCatalog} from "./AgentCatalog.sol";
import {ArcadeFamily} from "../../independent/ArcadeFamily.sol";
import {HouseInstances} from "./HouseInstances.sol";

contract HouseInstanceChallenges is AgentChallenges {
    constructor(ArcadeFamily f,AgentCatalog c,address p,address admin) AgentChallenges(f,c,p,admin){}
    function supportsHouseInstances() external pure returns(bool){return true;}
    function houseInstanceEligible(address agent,uint8 mode) external view returns(bool){
        return HouseInstances.eligible(catalog,agent,mode,false);
    }
    function _eligible(address agent,uint8 mode) internal view override returns(bool){
        return HouseInstances.eligible(catalog,agent,mode,false)||catalog.eligible(agent,mode);
    }
}
