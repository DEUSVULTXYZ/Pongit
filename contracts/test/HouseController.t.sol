// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {HouseController} from "../src/agents/HouseController.sol";

/// @notice Edge cases the differential reaches rarely or never, asserted directly.
/// @dev The differential proves the port agrees with the original on reachable states. These
///      pin the boundaries that a random walk would need a very long time to land on.
contract HouseControllerTest is Test {
    int256 constant P = 1_000_000_000_000;
    int256 constant MID = 288 * P;

    function tuning(uint8 level, int256 error, int256 dead) internal pure returns (HouseController.Tuning memory) {
        return HouseController.Tuning({level: level, reactionUs: 85_000, error: error, deadZone: dead});
    }

    function one(int256 x, int256 y, int256 vx, int256 vy) internal pure returns (HouseController.Ball[] memory b) {
        b = new HouseController.Ball[](1);
        b[0] = HouseController.Ball(x, y, vx, vy);
    }

    function testNoBallAimsAtTheMiddleAndHoldsStill() public pure {
        HouseController.Ball[] memory none = new HouseController.Ball[](0);
        assertEq(HouseController.decide(none, 0, MID, 48 * P, tuning(2, 0, 6 * P), 0), int8(0));
    }

    function testBallTravellingAwayIsIgnored() public pure {
        // Left side defends x = 40. A ball at 500 moving right never arrives, so the policy keeps
        // the default middle target and a paddle already centred does not move.
        HouseController.Ball[] memory away = one(500 * P, 100 * P, 128_000_000, 0);
        assertEq(HouseController.decide(away, 0, MID, 48 * P, tuning(2, 0, 6 * P), 0), int8(0));
    }

    function testZeroHorizontalVelocityNeverDividesByZero() public pure {
        HouseController.Ball[] memory stalled = one(500 * P, 100 * P, 0, 64_000_000);
        assertEq(HouseController.decide(stalled, 0, MID, 48 * P, tuning(2, 0, 6 * P), 0), int8(0));
    }

    function testSoonestBallWins() public pure {
        // Two balls closing on the left plane: the nearer one is the one aimed at, and it sits
        // above the paddle, so the paddle is told to move up.
        HouseController.Ball[] memory two = new HouseController.Ball[](2);
        two[0] = HouseController.Ball(100 * P, 500 * P, -128_000_000, 0);
        two[1] = HouseController.Ball(900 * P, 100 * P, -128_000_000, 0);
        assertEq(HouseController.decide(two, 0, MID, 48 * P, tuning(2, 0, 6 * P), 0), int8(1));
        // Swapping which one is nearer flips the answer, so the selection is doing the work.
        two[0] = HouseController.Ball(900 * P, 500 * P, -128_000_000, 0);
        two[1] = HouseController.Ball(100 * P, 100 * P, -128_000_000, 0);
        assertEq(HouseController.decide(two, 0, MID, 48 * P, tuning(2, 0, 6 * P), 0), int8(-1));
    }

    function testReflectFoldsBothWallsAndIsIdempotentInside() public pure {
        assertEq(HouseController.reflect(100 * P), 100 * P);
        // One radius above the top wall folds back one radius below it.
        assertEq(HouseController.reflect(HEIGHTless() + P), HEIGHTless() - P);
        // Below the bottom wall folds up by the same amount.
        assertEq(HouseController.reflect(5 * P), 7 * P);
        // Every fold lands inside the playable band.
        for (int256 y = -2000 * P; y <= 2600 * P; y += 137 * P) {
            int256 r = HouseController.reflect(y);
            assertGe(r, 6 * P);
            assertLe(r, 570 * P);
        }
    }

    function HEIGHTless() internal pure returns (int256) {
        return 570 * P;
    }

    function testTargetIsClampedInsideThePaddleReach() public pure {
        // A huge aim error cannot push the target past the wall: the paddle is told to move up,
        // not to some impossible height, and the clamp is what keeps it reachable.
        HouseController.Ball[] memory b = one(100 * P, 300 * P, -128_000_000, 0);
        assertEq(HouseController.decide(b, 0, MID, 48 * P, tuning(2, 58 * P, 6 * P), 10_000 * P), int8(1));
        assertEq(HouseController.decide(b, 0, MID, 48 * P, tuning(2, 58 * P, 6 * P), -10_000 * P), int8(-1));
    }

    function testDeadZoneHoldsTheDirectionAtTheBoundary() public pure {
        // The paddle sits exactly one dead zone below the target: the original moves only when the
        // gap is strictly greater, so this must hold still.
        HouseController.Ball[] memory b = one(40 * P, 300 * P, -128_000_000, 0);
        int256 dead = 6 * P;
        assertEq(HouseController.decide(b, 0, 300 * P - dead, 48 * P, tuning(2, 0, dead), 0), int8(0));
        assertEq(HouseController.decide(b, 0, 300 * P - dead - 1, 48 * P, tuning(2, 0, dead), 0), int8(1));
    }

    function testRookieHedgesTowardTheMiddleOnlyOnLongBalls() public pure {
        // A ball far away arrives in well over 0.8 s, so NOVA pulls its aim toward the centre
        // while ONYX commits to the predicted height.
        HouseController.Ball[] memory far = one(900 * P, 60 * P, -1_000_000, 0);
        (int256 rookie,,) = HouseController.aim(far, 0, 0);
        (int256 expert,,) = HouseController.aim(far, 0, 2);
        assertTrue(rookie != expert, "rookie should hedge where expert commits");
        assertTrue(rookie > expert, "hedging moves the aim toward the middle of the court");
    }
}
