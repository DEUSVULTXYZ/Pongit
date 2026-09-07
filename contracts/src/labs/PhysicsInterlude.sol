// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// @notice Classic lab rules 3: accelerate each successful return, reset on serve.
/// V1-V4 use PhysicsV2 directly and retain their original speed.
library PhysicsInterlude {
    function initial(bytes32 seed) internal pure returns (PhysicsV2.State memory) {
        return _serveSpeed(PhysicsV2.initial(seed, 0));
    }

    function _serveSpeed(PhysicsV2.State memory s) private pure returns (PhysicsV2.State memory) {
        s.vx = s.vx * 3 / 2;
        s.vy = s.vy * 3 / 2;
        return s;
    }

    function _accelerate(PhysicsV2.State memory s) private pure returns (PhysicsV2.State memory) {
        int256 speed = (s.vx < 0 ? -s.vx : s.vx) * 110 / 100;
        s.vx = s.vx < 0 ? -speed : speed;
        s.vy = s.vy < 0 ? -(speed / 2) : speed / 2;
        return s;
    }

    function advance(PhysicsV2.State memory s, uint64 target, uint256 limit)
        internal pure returns (PhysicsV2.State memory, bool)
    {
        require(s.mode == 0 && target >= s.t, "classic clock");
        for (uint256 i; i < limit; i++) {
            if (s.finished) return (s, true);
            PhysicsV2.Event memory event_ = PhysicsV2.next(s);
            uint64 at = event_.at;
            if (at > target) return PhysicsV2.advance(s, target, 1);
            uint256 points = uint256(s.scoreA) + s.scoreB;
            int256 incomingVX = s.vx;
            (s,) = PhysicsV2.advance(s, at, 1);
            if ((event_.kind == 3 || event_.kind == 4) && s.vx != incomingVX) s = _accelerate(s);
            // The common collision library serves at its original speed.
            // Apply the lab speed at every new rally, even during catch-up.
            if (!s.finished && uint256(s.scoreA) + s.scoreB != points) s = _serveSpeed(s);
        }
        return (s, s.finished || s.t == target && PhysicsV2.next(s).at > target);
    }
}

contract PhysicsInterludeHarness {
    function initial(bytes32 seed) external pure returns (PhysicsV2.State memory) {
        return PhysicsInterlude.initial(seed);
    }
    function advance(PhysicsV2.State memory s, uint64 target, uint256 limit)
        external pure returns (PhysicsV2.State memory, bool)
    {
        return PhysicsInterlude.advance(s, target, limit);
    }
}
