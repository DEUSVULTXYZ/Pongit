// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentQualifications} from "./AgentQualifications.sol";
import {AgentCatalog} from "./AgentCatalog.sol";
import {HouseInstances} from "./HouseInstances.sol";

contract HouseInstanceQualifications is AgentQualifications {
    constructor(AgentCatalog c,address p) AgentQualifications(c,p){}
    function supportsHouseInstances() external pure returns(bool){return true;}
    function opponentEligible(address agent,uint8 mode) external view returns(bool){return _opponentEligible(agent,mode);}
    function _opponentEligible(address agent,uint8 mode) internal view override returns(bool){
        return HouseInstances.eligible(catalog,agent,mode,true)||catalog.qualificationEligible(agent,mode);
    }
}
