// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";

/// Only catalogue-pinned official controllers may reuse their identity. Display
/// metadata, a creator's name, or copied strategy bytecode cannot grant reuse.
library HouseInstances {
    function eligible(AgentCatalog catalog,address agent,uint8 mode,bool qualification) external view returns(bool){
        AgentCatalog.Identity memory p=catalog.identity(agent);
        return mode<2&&p.house>0&&p.house<=8&&catalog.house(p.house-1)==agent&&p.creator==catalog.owner()
            &&p.available&&p.modes&(1<<mode)!=0&&(qualification||p.qualified&(1<<mode)!=0)
            &&p.codeHash==catalog.houseCodeHash()&&catalog.houseController().codehash==p.codeHash;
    }
}
