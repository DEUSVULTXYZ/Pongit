// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice The house-bot steering policy, in the contract instead of a hosted process.
/// @dev Ported from shared/agent-controller.ts. Positions, velocities and the aim error all use
///      PhysicsV2's 1e6 units; time is integer microseconds. The TypeScript original divides
///      everything by 1e6 and works in floats, so the only intended difference is truncation:
///      integer division here truncates toward zero where the original kept a fraction. That
///      divergence is measured by scripts/differential-house.ts rather than assumed away.
///
///      Every function is pure and reads nothing from storage. The caller loops it against
///      PhysicsV2.advance in memory, so a whole tick still costs one storage write.
library HouseController {
    int256 internal constant SCALE = 1_000_000;
    int256 internal constant WIDTH = 1024 * SCALE;
    int256 internal constant HEIGHT = 576 * SCALE;
    int256 internal constant RADIUS = 6 * SCALE;
    int256 internal constant PLANE = 40 * SCALE;

    /// @notice One ball the policy may aim at. Chaos supplies several; legacy supplies one.
    struct Ball {
        int256 x;
        int256 y;
        int256 vx;
        int256 vy;
    }

    /// @notice A difficulty, as houseBots declares it in shared/agents.ts, scaled to 1e6.
    /// @dev level 0 NOVA, 1 PULSE, 2 ONYX. reactionUs is the original reactionMs in game time.
    struct Tuning {
        uint8 level;
        uint32 reactionUs;
        int256 error;
        int256 deadZone;
    }

    /// @notice Fold a predicted y back inside the court, the way a ball bounces off both walls.
    /// @dev The original works on a band of 564 display units starting at 6: that is
    ///      HEIGHT - 2 * RADIUS, offset by RADIUS. Same arithmetic, scaled.
    function reflect(int256 y) internal pure returns (int256) {
        int256 span = HEIGHT - 2 * RADIUS;
        int256 period = span * 2;
        int256 offset = ((y - RADIUS) % period + period) % period;
        return RADIUS + (offset > span ? period - offset : offset);
    }

    /// @notice Where this side should aim, before the aim error and the clamp.
    /// @dev Picks the ball arriving soonest at this side's plane. A ball travelling away from the
    ///      plane is ignored, which is what `arrival >= 0` means in the original.
    function aim(Ball[] memory balls, uint8 side, uint8 level)
        internal
        pure
        returns (int256 target, bool found, uint256 soonest)
    {
        int256 plane = side == 0 ? PLANE : WIDTH - PLANE;
        target = HEIGHT / 2;
        for (uint256 i; i < balls.length; i++) {
            Ball memory b = balls[i];
            if (b.vx == 0) continue;
            int256 distance = plane - b.x;
            // Same sign means the ball is closing on this plane; zero distance arrives now.
            if (distance != 0 && (distance < 0) != (b.vx < 0)) continue;
            uint256 arrival = uint256(distance < 0 ? -distance : distance) * uint256(SCALE)
                / uint256(b.vx < 0 ? -b.vx : b.vx);
            if (found && arrival >= soonest) continue;
            soonest = arrival;
            found = true;
            target = reflect(b.y + b.vy * int256(arrival) / SCALE);
        }
        // NOVA hedges toward the middle when it has time to be wrong about a long ball.
        if (level == 0 && found && soonest > 800_000) target = (target * 65 + (HEIGHT / 2) * 35) / 100;
    }

    /// @notice The direction this side should hold until its next decision.
    /// @param position this side's paddle centre, in 1e6 units
    /// @param half this side's half-paddle height, in 1e6 units
    /// @param aimError the per-rally aiming error, already signed and scaled
    function decide(
        Ball[] memory balls,
        uint8 side,
        int256 position,
        int256 half,
        Tuning memory tuning,
        int256 aimError
    ) internal pure returns (int8) {
        (int256 target,,) = aim(balls, side, tuning.level);
        target += aimError;
        if (target < half) target = half;
        if (target > HEIGHT - half) target = HEIGHT - half;
        int256 gap = target - position;
        if (gap > tuning.deadZone) return 1;
        if (gap < -tuning.deadZone) return -1;
        return 0;
    }
}

/// @notice Differential-test surface. Never deployed to production.
contract HouseControllerHarness {
    function reflect(int256 y) external pure returns (int256) {
        return HouseController.reflect(y);
    }

    function decide(
        HouseController.Ball[] calldata balls,
        uint8 side,
        int256 position,
        int256 half,
        HouseController.Tuning calldata tuning,
        int256 aimError
    ) external pure returns (int8) {
        HouseController.Ball[] memory copy = new HouseController.Ball[](balls.length);
        for (uint256 i; i < balls.length; i++) copy[i] = balls[i];
        return HouseController.decide(copy, side, position, half, tuning, aimError);
    }
}
