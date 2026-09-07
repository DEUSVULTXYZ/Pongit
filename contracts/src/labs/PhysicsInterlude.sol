// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// @notice Classic lab rules 2: 50% faster ball, unchanged paddle/collision rules.
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

    function advance(PhysicsV2.State memory s, uint64 target, uint256 limit)
        internal pure returns (PhysicsV2.State memory, bool)
    {
        require(s.mode == 0 && target >= s.t, "classic clock");
        for (uint256 i; i < limit; i++) {
            if (s.finished) return (s, true);
            uint64 at = PhysicsV2.next(s).at;
            if (at > target) return PhysicsV2.advance(s, target, 1);
            uint256 points = uint256(s.scoreA) + s.scoreB;
            (s,) = PhysicsV2.advance(s, at, 1);
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
