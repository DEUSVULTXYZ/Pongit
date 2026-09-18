// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPongStrategy} from "../IPongStrategy.sol";

/// @notice A complete, small PONGIT strategy to start from. It predicts where the nearest ball
///         heading its way will cross its paddle line, folding the path off the top and bottom
///         walls, and moves there. With nothing incoming it drifts back to the middle.
/// @dev Everything is integer arithmetic in the arcade's units: pico-pixels for positions,
///      micro-pixels per second for velocities, microseconds for time. It uses a few thousand
///      gas per call, far inside the budget the arcade gives each decision. It steers by the
///      paddle centre alone and never reads `half`, which under Chaos is the base size rather
///      than the effective one (see IPongStrategy.PongView).
///
///      Build it from the repository root with `forge build --root contracts`, which writes
///      contracts/out; a bare `forge build` there does not. `DEPLOY=tracker npx tsx
///      agent-sdk/strategy.ts` then deploys it once for your creator key, records its address,
///      and registers that same contract on every later run.
contract TrackerStrategy is IPongStrategy {
    int256 private constant PICO = 1e12;
    int256 private constant HEIGHT = 576 * PICO;
    int256 private constant RADIUS = 6 * PICO;
    int256 private constant LEFT_PLANE = 40 * PICO;
    int256 private constant RIGHT_PLANE = 984 * PICO;

    address public immutable override creator;
    /// @dev How close is close enough, in pixels. A small dead zone stops the paddle dithering.
    int256 public immutable deadZone;

    constructor(address creator_, int256 deadZonePixels) {
        creator = creator_;
        deadZone = deadZonePixels * PICO;
    }

    function decide(PongView calldata v) external view override returns (int8) {
        int256 target = HEIGHT / 2;
        uint256 soonest = type(uint256).max;
        int256 plane = v.side == 0 ? LEFT_PLANE : RIGHT_PLANE;
        for (uint256 i; i < v.balls.length; i++) {
            PongBall calldata b = v.balls[i];
            // Only a ball coming towards this side matters.
            if (v.side == 0 ? b.vx >= 0 : b.vx <= 0) continue;
            // Time to the paddle line, in microseconds: pico-pixels over micro-pixels per second.
            uint256 arrival = uint256((plane - b.x) / b.vx);
            if (arrival >= soonest) continue;
            soonest = arrival;
            target = _fold(b.y + b.vy * int256(arrival));
        }
        int256 gap = target - v.paddle;
        if (gap > deadZone) return 1;
        if (gap < -deadZone) return -1;
        return 0;
    }

    /// @dev Where a point travelling freely in y ends up once it bounces between the walls.
    function _fold(int256 y) private pure returns (int256) {
        int256 span = HEIGHT - 2 * RADIUS;
        int256 period = span * 2;
        int256 offset = ((y - RADIUS) % period + period) % period;
        return RADIUS + (offset > span ? period - offset : offset);
    }
}
