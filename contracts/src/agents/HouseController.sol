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
            // Classic velocities are an unbounded int256 with no speed cap, so a crafted or
            // degenerate state could make this product overflow. A revert here would happen
            // inside the advance and brick the match, which is far worse than declining to aim
            // at a ball the policy cannot describe. The bound is orders of magnitude above any
            // arrival the physics produces, so no reachable state is affected.
            uint256 rise = uint256(b.vy < 0 ? -b.vy : b.vy);
            if (rise != 0 && arrival > type(uint128).max / rise) continue;
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

/// @notice Linked entry point. Everything the arcade would otherwise pay root bytes for lives here.
/// @dev `external` on purpose: an `internal` library is inlined into its caller, and the arcade has
///      only tens of bytes to spare. Reached by DELEGATECALL, so `address(this)` is the arcade and
///      the key derivation is byte-identical to the app's own `_key(0, id, field)`.
library AgentSteer {
    /// @dev One decision boundary. Finer than any tier's reaction, so every tier lands on it.
    uint64 internal constant SLICE_US = 100_000;
    /// @dev A long catch-up is replayed missed time, not live play. Steering it a slice at a time
    ///      would cost thousands of external calls for no visible difference, so it advances whole.
    uint64 internal constant MAX_CATCHUP_US = SLICE_US * 16;

    // Registration metadata of the three house bots, from agentMetadata(name, avatar).
    bytes32 internal constant NOVA = 0x6617df9037f631e02f64cd64398d7d83f4b85341a624f0b884f04c8129823770;
    bytes32 internal constant PULSE = 0xe2fe7a5c52d5a1364cd893cde1191c36cd3e34c41ce55e0316950b9ba9be49df;
    bytes32 internal constant ONYX = 0xab988c929327e00ef2ffef823a9578430c6237e0f21da503f90f62fd0b7d3a8f;

    function _key(uint256 id, uint256 field) private view returns (bytes32) {
        return keccak256(abi.encode(address(this), uint256(0), id, field));
    }

    /// @notice A seat is steered only when its registration metadata is one of the three house
    ///         bots. A community agent is never touched, whatever else it looks like.
    function _tier(mapping(bytes32 => uint256) storage w, uint256 seat)
        private
        view
        returns (bool house, uint8 level)
    {
        bytes32 m = bytes32(w[_key(seat, 41)]);
        if (m == NOVA) return (true, 0);
        if (m == PULSE) return (true, 1);
        if (m == ONYX) return (true, 2);
        return (false, 0);
    }

    function _tuning(uint8 level) private pure returns (HouseController.Tuning memory) {
        if (level == 0) {
            return HouseController.Tuning(0, 280_000, 58 * HouseController.PICO, 17 * HouseController.PICO);
        }
        if (level == 1) {
            return HouseController.Tuning(1, 160_000, 25 * HouseController.PICO, 10 * HouseController.PICO);
        }
        return HouseController.Tuning(2, 85_000, 8 * HouseController.PICO, 6 * HouseController.PICO);
    }

    /// @dev The original re-rolls its aim error once per rally from a private Math.random(). On
    ///      chain that has to be derived, so it comes from the match seed, the rally and the side.
    function _aimError(bytes32 seed, uint256 rally, uint8 side, int256 error) private pure returns (int256) {
        uint256 span = uint256(error) * 2 + 1;
        return int256(uint256(keccak256(abi.encode(seed, rally, side))) % span) - error;
    }

    /// @notice Decide for each house seat, write the control word once, and return the game time
    ///         the caller should advance to next.
    /// @return next the sub-target; equal to `target` when no further slicing is wanted
    function steer(mapping(bytes32 => uint256) storage w, uint256 id, uint8 mode, uint64 target)
        external
        returns (uint64 next)
    {
        // Chaos packs its state through ChaosCodec rather than the legacy fields; decoding it here
        // is the remaining piece. Until then Chaos advances exactly as it does today.
        if (mode != 0) return target;

        uint256 paddles = w[_key(id, 7)];
        uint64 nowUs = uint64(paddles >> 128);
        if (nowUs >= target || target - nowUs > MAX_CATCHUP_US) return target;

        (bool houseA, uint8 levelA) = _tier(w, uint256(uint160(address(uint160(w[_key(id, 0)])))));
        (bool houseB, uint8 levelB) = _tier(w, uint256(uint160(address(uint160(w[_key(id, 1)])))));
        if (!houseA && !houseB) return target;

        uint256 control = w[_key(id, 8)];
        uint256 xy = w[_key(id, 4)];
        uint256 half = w[_key(id, 13)];
        bytes32 seed = bytes32(w[_key(id, 3)]);
        uint256 rally = ((control >> 4) & 15) + ((control >> 8) & 15);

        HouseController.Ball[] memory balls = new HouseController.Ball[](1);
        balls[0] = HouseController.Ball(
            int256(int128(uint128(xy))) * 1_000_000,
            int256(int128(uint128(xy >> 128))) * 1_000_000,
            int256(w[_key(id, 5)]),
            int256(w[_key(id, 6)])
        );

        for (uint8 side; side < 2; side++) {
            if (side == 0 ? !houseA : !houseB) continue;
            HouseController.Tuning memory t = _tuning(side == 0 ? levelA : levelB);
            // A tier only re-decides on its own reaction boundary; between boundaries it holds the
            // direction already in the control word, which is what a reaction delay means.
            if (nowUs % t.reactionUs >= SLICE_US) continue;
            int8 dir = HouseController.decide(
                balls,
                side,
                int256(uint256(uint64(paddles >> (side == 0 ? 0 : 64)))) * 1_000_000,
                int256(uint256(uint32(half >> (side == 0 ? 0 : 32)))) * 1_000_000,
                t,
                _aimError(seed, rally, side, t.error)
            );
            uint256 shift = side == 0 ? 0 : 2;
            control = (control & ~(uint256(3) << shift)) | (uint256(uint8(dir + 1)) << shift);
        }

        w[_key(id, 8)] = control;
        next = nowUs + SLICE_US;
        if (next > target) next = target;
    }
}
