// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ResponsiveEventsArena} from "../independent/ResponsiveEventsArena.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {ChaosEngine} from "../chaos/ChaosEngine.sol";
import {PublishedResultVerifier} from "../independent/PublishedResultVerifier.sol";

/// An immutable EOA consents to hosting. It receives no delegation, gameplay,
/// admission or financial authority; only the lobby owns those operations.
contract ProvisionedResponsiveEventsArena is ResponsiveEventsArena {
    address private immutable provisioner;
    constructor(IInterludeHub h,address authority,address admissions,address pressure,
        ChaosEngine physics,PublishedResultVerifier verifier,address hostingOwner)
        ResponsiveEventsArena(h,authority,admissions,pressure,physics,verifier) {
        require(hostingOwner!=address(0)&&hostingOwner.code.length==0,"provisioning account");
        provisioner=hostingOwner;
    }
    function owner() public view override returns(address){return provisioner;}
}
