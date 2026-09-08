// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {PhysicsInterlude} from "./PhysicsInterlude.sol";
import {PhysicsRoomsChaos} from "./PhysicsRoomsChaos.sol";

/// @notice Immutable stateless rules keep the rooms runtime below EIP-170.
contract RoomsRules {
    function initial(bytes32 seed, uint8 mode) external pure returns (PhysicsV2.State memory) {
        require(mode <= 1, "mode");
        return mode == 0 ? PhysicsInterlude.initial(seed) : PhysicsRoomsChaos.initial(seed);
    }

    function advance(PhysicsV2.State memory s, uint64 target, uint256 limit)
        external
        pure
        returns (PhysicsV2.State memory, bool)
    {
        return s.mode == 0 ? PhysicsInterlude.advance(s, target, limit) : PhysicsRoomsChaos.advance(s, target, limit);
    }

    function resume(PhysicsV2.State memory s, uint64 at, uint256 a, uint256 b)
        external
        pure
        returns (PhysicsV2.State memory)
    {
        return PhysicsRoomsChaos.resume(s, at, a, b);
    }
}
