// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Positions and velocities use 1e6 units. Time is integer microseconds.
/// @dev All rounding truncates toward zero except event times, which round up.
library PhysicsV2 {
    int256 internal constant SCALE = 1_000_000;
    int256 internal constant WIDTH = 1024 * SCALE;
    int256 internal constant HEIGHT = 576 * SCALE;
    int256 internal constant RADIUS = 6 * SCALE;
    int256 internal constant HALF_PADDLE = 48 * SCALE;
    int256 internal constant PLANE = 40 * SCALE;
    int256 internal constant PADDLE_SPEED = 180 * SCALE;
    uint8 internal constant WIN_SCORE = 7;

    struct State {
        int256 x;
        int256 y;
        int256 vx;
        int256 vy;
        int256 left;
        int256 right;
        int8 leftDir;
        int8 rightDir;
        uint64 t;
        uint8 scoreA;
        uint8 scoreB;
        bytes32 seed;
        bool finished;
        uint8 mode;
        int256 halfA;
        int256 halfB;
        bool awaitingServe;
        uint64 resumeAt;
    }

    struct Event {
        uint64 at;
        uint8 kind;
    }

    function initial(bytes32 seed, uint8 mode) internal pure returns (State memory s) {
        require(mode <= 1, "mode");
        s.seed = seed;
        s.mode = mode;
        s.halfA = HALF_PADDLE;
        s.halfB = HALF_PADDLE;
        s.left = HEIGHT / 2;
        s.right = HEIGHT / 2;
        return serve(s);
    }

    function serve(State memory s) internal pure returns (State memory) {
        s.x = WIDTH / 2;
        s.y = HEIGHT / 2;
        uint256 point = uint256(s.scoreA) + s.scoreB;
        s.vx = (point % 2 == 0 ? int256(128) : int256(-128)) * SCALE;
        s.vy = ((uint256(s.seed) >> point) & 1 == 0 ? int256(64) : int256(-64)) * SCALE;
        return s;
    }

    function clamp(int256 y, int256 half) internal pure returns (int256) {
        if (y < half) return half;
        if (y > HEIGHT - half) return HEIGHT - half;
        return y;
    }

    function travel(int256 distance, int256 speed) internal pure returns (uint64) {
        uint256 d = uint256(distance < 0 ? -distance : distance);
        uint256 v = uint256(speed < 0 ? -speed : speed);
        return uint64((d * uint256(SCALE) + v - 1) / v);
    }

    function next(State memory s) internal pure returns (Event memory e) {
        if (s.finished) return Event(type(uint64).max, 0);
        if (s.awaitingServe) return Event(s.resumeAt, 7);
        e = Event(s.t + travel(s.vx < 0 ? -RADIUS - s.x : WIDTH + RADIUS - s.x, s.vx), s.vx < 0 ? 5 : 6);
        if (s.vx < 0 && s.x >= PLANE) e = Event(s.t + travel(PLANE - s.x, s.vx), 3);
        if (s.vx > 0 && s.x <= WIDTH - PLANE) e = Event(s.t + travel(WIDTH - PLANE - s.x, s.vx), 4);
        uint64 wall = s.t + travel(s.vy < 0 ? RADIUS - s.y : HEIGHT - RADIUS - s.y, s.vy);
        // A wall wins ties; the paddle event is then resolved at the same instant.
        if (wall <= e.at) e = Event(wall, s.vy < 0 ? 1 : 2);
    }

    function move(State memory s, uint64 to) internal pure returns (State memory) {
        require(to >= s.t, "time reversal");
        if (s.awaitingServe || s.finished) return s;
        int256 dt = int256(uint256(to - s.t));
        s.x += s.vx * dt / SCALE;
        s.y += s.vy * dt / SCALE;
        s.left = clamp(s.left + int256(s.leftDir) * PADDLE_SPEED * dt / SCALE, s.halfA);
        s.right = clamp(s.right + int256(s.rightDir) * PADDLE_SPEED * dt / SCALE, s.halfB);
        s.t = to;
        return s;
    }

    function collide(State memory s, uint8 kind) internal pure returns (State memory) {
        if (kind == 1 || kind == 2) {
            s.y = kind == 1 ? RADIUS : HEIGHT - RADIUS;
            s.vy = -s.vy;
        } else if (kind == 3 || kind == 4) {
            int256 paddle = kind == 3 ? s.left : s.right;
            s.x = kind == 3 ? PLANE : WIDTH - PLANE;
            int256 half = kind == 3 ? s.halfA : s.halfB;
            if (s.y + RADIUS >= paddle - half && s.y - RADIUS <= paddle + half) {
                s.vx = -s.vx;
            } else {
                // Move a single fixed-point unit beyond the plane after a miss.
                // This makes that plane ineligible for another collision, without tunneling.
                s.x += s.vx < 0 ? int256(-1) : int256(1);
            }
        } else {
            if (kind == 5) s.scoreB++;
            else s.scoreA++;
            s.finished = s.scoreA == WIN_SCORE || s.scoreB == WIN_SCORE;
            if (!s.finished) {
                s = serve(s);
                if (s.mode == 1) { s.awaitingServe = true; s.resumeAt = s.t + 3_000_000; s.vx = 0; s.vy = 0; }
            }
        }
        return s;
    }

    function handicap(uint256 paidA, uint256 paidB) internal pure returns (int256 halfA, int256 halfB) {
        halfA = HALF_PADDLE; halfB = HALF_PADDLE;
        uint256 total = paidA + paidB;
        if (total < 2e15) return (halfA, halfB);
        uint256 favorite = paidA > paidB ? paidA : paidB;
        uint256 shareBps = favorite * 10000 / total;
        if (shareBps <= 6000) return (halfA, halfB);
        uint256 reductionBps = (shareBps - 6000) * 2500 / 4000;
        int256 half = HALF_PADDLE * int256(10000 - reductionBps) / 10000;
        if (paidA > paidB) halfA = half; else halfB = half;
    }

    function resume(State memory s, uint64 at, uint256 paidA, uint256 paidB) internal pure returns (State memory) {
        require(s.awaitingServe && at >= s.resumeAt, "serve not ready");
        (s.halfA, s.halfB) = handicap(paidA, paidB);
        s.awaitingServe = false; s.resumeAt = 0; s.t = at;
        s.left = HEIGHT / 2; s.right = HEIGHT / 2;
        return serve(s);
    }

    function advance(State memory s, uint64 target, uint256 limit) internal pure returns (State memory, bool) {
        require(target >= s.t, "time reversal");
        for (uint256 i; i < limit; i++) {
            if (s.finished || s.awaitingServe) return (s, true);
            Event memory e = next(s);
            if (e.at > target) return (move(s, target), true);
            s = collide(move(s, e.at), e.kind);
        }
        return (s, s.finished || s.awaitingServe || next(s).at > target && s.t == target);
    }
}

/// @notice Stateless differential-testing and benchmark surface.
contract PhysicsV2Harness {
    function initial(bytes32 seed, uint8 mode) external pure returns (PhysicsV2.State memory) {
        return PhysicsV2.initial(seed, mode);
    }

    function advance(PhysicsV2.State memory s, uint64 t, uint256 n) external pure returns (PhysicsV2.State memory, bool) {
        return PhysicsV2.advance(s, t, n);
    }

    function next(PhysicsV2.State memory s) external pure returns (PhysicsV2.Event memory) {
        return PhysicsV2.next(s);
    }
    function handicap(uint256 a, uint256 b) external pure returns (int256, int256) { return PhysicsV2.handicap(a, b); }
    function resume(PhysicsV2.State memory s, uint64 at, uint256 a, uint256 b) external pure returns (PhysicsV2.State memory) { return PhysicsV2.resume(s, at, a, b); }

}
