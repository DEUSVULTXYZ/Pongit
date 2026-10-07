// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ResponsiveAgentArena} from "../agents/competition/ResponsiveAgentArena.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {HousePolicies} from "../agents/competition/HousePolicies.sol";
import {ChaosEngine} from "../chaos/ChaosEngine.sol";
import {PublishedResultVerifier} from "../independent/PublishedResultVerifier.sol";

/// Provisioning consent is separate from delegated game/lifecycle authority.
/// The immutable EOA consents to hosting; only the pool owns contract operations.
contract ProvisionedResponsiveAgentArena is ResponsiveAgentArena {
    address private immutable provisioningOwner;
    constructor(IInterludeHub h,address authority,address admissions,HousePolicies house,
        ChaosEngine physics,PublishedResultVerifier verifier,address provisioner)
        ResponsiveAgentArena(h,authority,admissions,house,physics,verifier) {
        require(provisioner!=address(0)&&provisioner.code.length==0,"provisioning account");
        provisioningOwner=provisioner;
    }
    function owner() public view override returns(address){return provisioningOwner;}
}
