// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice The house-bot steering policy, in the contract instead of a hosted process.
/// @dev Ported from shared/agent-controller.ts.
///
///      Units. The original divides everything into display units and works in floats, which hides
///      that the two modes are scaled differently: legacy positions are PhysicsV2's 1e6 units,
///      while Chaos packs positions in 1e12 and keeps velocities in 1e6. Converting Chaos down to
///      1e6 would throw away precision the original keeps, so this library works in 1e12
///      throughout and the caller scales legacy positions up, which is lossless.
///
///      That choice also makes the arithmetic exact for both modes with one formula. With a
///      distance in 1e12 and a velocity in 1e6, the arrival time in microseconds is simply
///      distance / velocity, and the predicted height is y + velocity * arrival, both in 1e12.
///
///      Every function is pure and reads no storage, so the caller can loop it against
///      PhysicsV2.advance in memory and still pay a single storage write per tick.
library HouseController {
    int256 internal constant PICO = 1_000_000_000_000;
    int256 internal constant WIDTH = 1024 * PICO;
    int256 internal constant HEIGHT = 576 * PICO;
    int256 internal constant RADIUS = 6 * PICO;
    int256 internal constant PLANE = 40 * PICO;
    /// @dev The original hedges toward the middle when the soonest arrival is over 0.8 seconds.
    uint256 internal constant HEDGE_US = 800_000;

    /// @notice One ball the policy may aim at: position in 1e12, velocity in 1e6.
    /// @dev Chaos supplies up to two and the caller passes only the live ones; legacy supplies one.
    struct Ball {
        int256 x;
        int256 y;
        int256 vx;
        int256 vy;
    }

    /// @notice A difficulty as houseBots declares it in shared/agents.ts, scaled to 1e12.
    /// @dev level 0 NOVA, 1 PULSE, 2 ONYX. reactionUs is the original reactionMs in game time.
    struct Tuning {
        uint8 level;
        uint32 reactionUs;
        int256 error;
        int256 deadZone;
    }

    /// @notice Fold a predicted height back inside the court, the way a ball bounces off both walls.
    /// @dev The original folds a band of 564 display units starting at 6: HEIGHT less two radii,
    ///      offset by one radius.
    function reflect(int256 y) internal pure returns (int256) {
        int256 span = HEIGHT - 2 * RADIUS;
        int256 period = span * 2;
        int256 offset = ((y - RADIUS) % period + period) % period;
        return RADIUS + (offset > span ? period - offset : offset);
    }

    /// @notice Where this side should aim, before the aim error and the clamp.
    /// @dev Picks the ball arriving soonest at this side's plane. A ball travelling away from the
    ///      plane never arrives, which is what the original's `arrival >= 0` excludes.
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
            if (distance != 0 && (distance < 0) != (b.vx < 0)) continue;
            uint256 arrival = uint256(distance < 0 ? -distance : distance)
                / uint256(b.vx < 0 ? -b.vx : b.vx);
            if (found && arrival >= soonest) continue;
            soonest = arrival;
            found = true;
            target = reflect(b.y + b.vy * int256(arrival));
        }
        // NOVA hedges toward the middle when it has time to be wrong about a long ball.
        if (level == 0 && found && soonest > HEDGE_US) target = (target * 65 + (HEIGHT / 2) * 35) / 100;
    }

    /// @notice The direction this side holds until its next decision.
    /// @param position this side's paddle centre, in 1e12
    /// @param half this side's half-paddle height, in 1e12
    /// @param aimError this rally's signed aiming error, in 1e12
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
