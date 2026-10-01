// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArena} from "../agents/competition/ReusableAgentArena.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {HousePolicies} from "../agents/competition/HousePolicies.sol";
import {ChaosEngine} from "../chaos/ChaosEngine.sol";
import {PublishedResultVerifier} from "../independent/PublishedResultVerifier.sol";

/// Isolated compatibility candidate for control's EIP-191 provisioning opt-in.
/// owner() identifies ONLY the account consenting to hosted node creation.
/// DelegatedLayout.owner remains the Monad authority: inherited onlyOwner
/// checks, opening, closure, admissions and results retain their existing gates.
/// This signer cannot submit an arbitrary delegation, close a game or pay funds.
contract ProvisionedReusableAgentArena is ReusableAgentArena {
    address private immutable provisioningOwner;
    constructor(IInterludeHub h,address authority,address admissions,HousePolicies house,
        ChaosEngine physics,PublishedResultVerifier verifier,address provisioner)
        ReusableAgentArena(h,authority,admissions,house,physics,verifier) {
        require(provisioner!=address(0)&&provisioner.code.length==0,"provisioning account");
        provisioningOwner=provisioner;
    }
    function owner() public view override returns(address){return provisioningOwner;}
}
