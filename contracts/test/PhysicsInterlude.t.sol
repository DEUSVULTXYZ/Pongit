// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {PhysicsInterlude} from "../src/labs/PhysicsInterlude.sol";

contract PhysicsInterludeTest is Test {
    function testFasterServeAndEverySubsequentPoint() public pure {
        PhysicsV2.State memory s = PhysicsInterlude.initial(bytes32(0));
        assertEq(s.vx,192_000_000); assertEq(s.vy,96_000_000);
        s.leftDir = -1; s.rightDir = 1;
        uint256 points;
        for (uint256 i; i < 256 && !s.finished; i++) {
            (s,) = PhysicsInterlude.advance(s, PhysicsV2.next(s).at, 1);
            if (!s.finished) { assertEq(s.vx < 0 ? -s.vx : s.vx,192_000_000); assertEq(s.vy < 0 ? -s.vy : s.vy,96_000_000); }
            if (s.scoreA + s.scoreB > points) points = s.scoreA + s.scoreB;
        }
        assertTrue(s.finished); assertGe(points,7);
    }
    function testFuzzBoundedCatchUpMatchesOneShot(bytes32 seed, uint32 time, int8 direction) public pure {
        uint64 target = uint64(uint256(time) % 600_000_000);
        PhysicsV2.State memory s = PhysicsInterlude.initial(seed);
        s.leftDir = int8(int256(direction) % 2); s.rightDir = -s.leftDir;
        (PhysicsV2.State memory expected, bool all) = PhysicsInterlude.advance(s,target,128);
        assertTrue(all);
        bool done;
        for (uint256 i; i < 128 && !done; i++) (s,done) = PhysicsInterlude.advance(s,target,1);
        assertTrue(done); assertEq(abi.encode(s),abi.encode(expected));
        assertGe(s.left,48_000_000); assertLe(s.left,528_000_000);
    }
    function testLegacySpeedRemainsUnchanged() public pure {
        PhysicsV2.State memory legacy = PhysicsV2.initial(bytes32(0),0);
        assertEq(legacy.vx,128_000_000); assertEq(legacy.vy,64_000_000);
    }
}
