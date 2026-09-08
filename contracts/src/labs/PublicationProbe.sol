// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Delegatable} from "../../vendor/interlude/Delegatable.sol";
import {Delegated} from "../../vendor/interlude/libraries/Delegated.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// @notice Isolated integration diagnostic. No game, account balance or financial role.
contract PublicationProbe is Delegatable {
    mapping(bytes32 => uint256) private counters;
    constructor(IInterludeHub h) Delegatable(h) {
        _registerGlobalMapping(Delegated.MapUint256Slot.wrap(bytes32(0)));
    }
    function key() public view returns (bytes32) { return keccak256(abi.encode(address(this), "publication probe")); }
    function value() external view returns (uint256) { return counters[key()]; }
    function increment() external whenNotDelegated(Types.GLOBAL) {
        require(isEphemeral(), "engine only");
        counters[key()]++;
    }
}
