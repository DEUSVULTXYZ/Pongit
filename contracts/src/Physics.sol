// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Positions and velocities use 1e6 units. Time is integer microseconds.
/// @dev All rounding truncates toward zero except event times, which round up.
library Physics {
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
    }

    struct Event {
        uint64 at;
        uint8 kind;
    }

    function initial(bytes32 seed) internal pure returns (State memory s) {
        s.seed = seed;
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

    function clamp(int256 y) internal pure returns (int256) {
        if (y < HALF_PADDLE) return HALF_PADDLE;
        if (y > HEIGHT - HALF_PADDLE) return HEIGHT - HALF_PADDLE;
        return y;
    }

    function travel(int256 distance, int256 speed) internal pure returns (uint64) {
        uint256 d = uint256(distance < 0 ? -distance : distance);
        uint256 v = uint256(speed < 0 ? -speed : speed);
        return uint64((d * uint256(SCALE) + v - 1) / v);
    }

    function next(State memory s) internal pure returns (Event memory e) {
        if (s.finished) return Event(type(uint64).max, 0);
        e = Event(s.t + travel(s.vx < 0 ? -RADIUS - s.x : WIDTH + RADIUS - s.x, s.vx), s.vx < 0 ? 5 : 6);
        if (s.vx < 0 && s.x >= PLANE) e = Event(s.t + travel(PLANE - s.x, s.vx), 3);
        if (s.vx > 0 && s.x <= WIDTH - PLANE) e = Event(s.t + travel(WIDTH - PLANE - s.x, s.vx), 4);
        uint64 wall = s.t + travel(s.vy < 0 ? RADIUS - s.y : HEIGHT - RADIUS - s.y, s.vy);
        // A wall wins ties; the paddle event is then resolved at the same instant.
        if (wall <= e.at) e = Event(wall, s.vy < 0 ? 1 : 2);
    }

    function move(State memory s, uint64 to) internal pure returns (State memory) {
        require(to >= s.t, "time reversal");
        int256 dt = int256(uint256(to - s.t));
        s.x += s.vx * dt / SCALE;
        s.y += s.vy * dt / SCALE;
        s.left = clamp(s.left + int256(s.leftDir) * PADDLE_SPEED * dt / SCALE);
        s.right = clamp(s.right + int256(s.rightDir) * PADDLE_SPEED * dt / SCALE);
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
            if (s.y + RADIUS >= paddle - HALF_PADDLE && s.y - RADIUS <= paddle + HALF_PADDLE) {
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
            if (!s.finished) s = serve(s);
        }
        return s;
    }

    function advance(State memory s, uint64 target, uint256 limit) internal pure returns (State memory, bool) {
        require(target >= s.t, "time reversal");
        for (uint256 i; i < limit; i++) {
            if (s.finished) return (s, true);
            Event memory e = next(s);
            if (e.at > target) return (move(s, target), true);
            s = collide(move(s, e.at), e.kind);
        }
        return (s, s.finished || next(s).at > target && s.t == target);
    }
}

/// @notice Stateless differential-testing and benchmark surface.
contract PhysicsHarness {
    function initial(bytes32 seed) external pure returns (Physics.State memory) {
        return Physics.initial(seed);
    }

    function advance(Physics.State memory s, uint64 t, uint256 n) external pure returns (Physics.State memory, bool) {
        return Physics.advance(s, t, n);
    }

    function next(Physics.State memory s) external pure returns (Physics.Event memory) {
        return Physics.next(s);
    }
}
