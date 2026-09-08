// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PongInterludeRooms} from "./PongInterludeRooms.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
/// @notice Hosted bootstrap: only the public admission signer is embedded.
contract PongInterludeRoomsHosted is PongInterludeRooms {
    constructor(IInterludeHub hub_) PongInterludeRooms(hub_,0x6e0EbC79d80a186A639843C4059f421D634C3d73) {}
}
