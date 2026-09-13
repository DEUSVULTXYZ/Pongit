// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PongRoomsRealtime} from "./PongRoomsRealtime.sol";
import {RoomsControlVerifier} from "./RoomsControlVerifier.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// Rules 5 physics and finance, with a one-time verified grant per arcade key.
contract PongRoomsCompact is PongRoomsRealtime {
    RoomsControlVerifier private immutable controlVerifier;
    error InvalidControls();
    event ControlsBound(address indexed key, uint256 binding);
    constructor(IInterludeHub h, address admission, address bridge, address ops, address previous)
        PongRoomsRealtime(h, admission, bridge, ops, previous) { controlVerifier = new RoomsControlVerifier(); }
    function controlBinding(address key) public view returns (uint256) { return _get(uint160(key), 20); }
    function registerControls(bytes calldata proof) external engine whenNotDelegated(Types.GLOBAL) {
        // Direct key presentation only: withSession must not hide the signer here.
        (bool ok, bytes memory result) = address(controlVerifier).staticcall(abi.encodePacked(RoomsControlVerifier.verify.selector, proof));
        if (!ok) { assembly ("memory-safe") { revert(add(result,32),mload(result)) } }
        (uint256 binding, address key) = abi.decode(result,(uint256,address));
        if (key != msg.sender) revert InvalidControls();
        uint256 old = controlBinding(msg.sender);
        if (old != 0 && (uint160(old) != uint160(binding) || old >> 160 == 0)) revert InvalidControls();
        _set(uint160(msg.sender), 20, binding);
        emit ControlsBound(msg.sender, binding);
    }
    function revokeControls(address key) external engine whenNotDelegated(Types.GLOBAL) {
        uint256 binding = controlBinding(key);
        if (binding == 0 || (msg.sender != key && _actor() != address(uint160(binding)))) revert InvalidControls();
        // Keep the owner as a tombstone; the same signed grant cannot resurrect it.
        _set(uint160(key), 20, uint160(binding));
        emit ControlsBound(key, uint160(binding));
    }
    function _playerActor() internal view override returns (address) {
        if (msg.sender == address(this)) return super._playerActor();
        uint256 binding = controlBinding(msg.sender);
        if (binding == 0) return super._playerActor();
        return controlVerifier.actor(binding);
    }
    function _isSessionBlocked(bytes4 selector) internal view override returns (bool) {
        return selector == this.registerControls.selector || super._isSessionBlocked(selector);
    }
}

contract PongRoomsCompactRelease is PongRoomsCompact {
    constructor(IInterludeHub h) PongRoomsCompact(h,
        0x6e0EbC79d80a186A639843C4059f421D634C3d73, 0x15E6B4C9fecAC754cE2D9052b6060DD5920e7659,
        0x369158Ac444278541322643E46e0D5b45ac21C4C, 0xd2Fe1c8Df2bDbe2666409fc20f25BCd2F2A40fb5) {}
}
