// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// @notice Rules 5: Classic cadence, queued paid pressure applied at point boundaries.
library PhysicsRealtimeChaos {
    function advance(PhysicsV2.State memory s, uint64 target, uint256 limit, uint256 paidA, uint256 paidB)
        internal pure returns (PhysicsV2.State memory, bool, uint8 applied)
    {
        require(s.mode == 1 && !s.awaitingServe && target >= s.t, "realtime clock");
        for (uint256 i; i < limit; i++) {
            if (s.finished) return (s, true, applied);
            PhysicsV2.Event memory e = PhysicsV2.next(s);
            if (e.at > target) return (PhysicsV2.move(s, target), true, applied);
            int256 previous = s.vx;
            s = PhysicsV2.collide(PhysicsV2.move(s, e.at), e.kind);
            if ((e.kind == 3 || e.kind == 4) && s.vx != previous) {
                int256 speed = (s.vx < 0 ? -s.vx : s.vx) * 110 / 100;
                s.vx = s.vx < 0 ? -speed : speed;
                s.vy = s.vy < 0 ? -(speed / 2) : speed / 2;
            }
            if (s.awaitingServe) {
                // Serve at the actual point time. No financial round-trip, no
                // hidden elapsed rally and no reset of either paddle's position.
                s.awaitingServe = false; s.resumeAt = 0;
                (s.halfA, s.halfB) = PhysicsV2.handicap(paidA, paidB);
                s.left = PhysicsV2.clamp(s.left, s.halfA); s.right = PhysicsV2.clamp(s.right, s.halfB);
                s = PhysicsV2.serve(s); s.vx = s.vx * 3 / 2; s.vy = s.vy * 3 / 2;
                applied = s.scoreA + s.scoreB;
            }
        }
        return (s, s.finished || s.t == target && PhysicsV2.next(s).at > target, applied);
    }
}
contract RealtimeChaosRules {
    function advance(PhysicsV2.State memory s, uint64 target, uint256 limit, uint256 a, uint256 b)
        external pure returns (PhysicsV2.State memory, bool, uint8)
    { return PhysicsRealtimeChaos.advance(s, target, limit, a, b); }
}
