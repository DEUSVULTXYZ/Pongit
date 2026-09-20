// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableArenaStorage as S} from "./ReusableArenaStorage.sol";
import {ReusableAdmission as Admission} from "./ReusableAdmission.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";

/// Linked immutable admission module. It adds no storage or authority; keeping
/// signature/binding validation out of the physics adapter bounds both runtimes.
library ReusableHumanBinding {
    function admit(mapping(bytes32=>uint256) storage w,Admission.Ticket calldata ticket,T.Binding calldata binding,
        bytes calldata signature,address signer,address authority) external returns(bytes32){
        return S.admit(w,ticket,binding,signature,signer,authority,14);
    }
    function cancelExpired(mapping(bytes32=>uint256) storage w,Admission.Ticket calldata ticket,T.Binding calldata binding,
        bytes calldata signature,address signer,address authority) external {
        S.cancelExpired(w,ticket,binding,signature,signer,authority,14);
    }
}
