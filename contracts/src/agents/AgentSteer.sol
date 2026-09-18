// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {HouseController} from "./HouseController.sol";

/// @notice Linked entry point. Everything the arcade would otherwise pay root bytes for lives here.
/// @dev `external` on purpose: an `internal` library is inlined into its caller, and the arcade has
///      only tens of bytes to spare. Reached by DELEGATECALL, so `address(this)` is the arcade and
///      the key derivation is byte-identical to the app's own `_key(0, id, field)`.
library AgentSteer {
    /// @dev One decision boundary. Finer than any tier's reaction, so every tier lands on it.
    ///      A catch-up of any length is sliced too: advancing it whole left the paddles unsteered
    ///      through it and let one Chaos call cost more than a command may spend. The arcade stops
    ///      slicing on its gas reserve instead, and the next tick resumes where this one stopped.
    uint64 internal constant SLICE_US = 100_000;

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

    /// @dev Everything the decision needs, in the units HouseController works in: positions and
    ///      paddles in 1e12, velocities in 1e6. Chaos already stores both that way; legacy stores
    ///      1e6 positions and scales up, which is lossless.
    struct Seat {
        HouseController.Ball[] balls;
        int256 position;
        int256 half;
        uint64 nowUs;
        uint256 rally;
    }

    function _legacy(mapping(bytes32 => uint256) storage w, uint256 id, uint8 side)
        private
        view
        returns (Seat memory s)
    {
        uint256 paddles = w[_key(id, 7)];
        uint256 xy = w[_key(id, 4)];
        uint256 control = w[_key(id, 8)];
        s.balls = new HouseController.Ball[](1);
        s.balls[0] = HouseController.Ball(
            int256(int128(uint128(xy))) * 1_000_000,
            int256(int128(uint128(xy >> 128))) * 1_000_000,
            int256(w[_key(id, 5)]),
            int256(w[_key(id, 6)])
        );
        s.position = int256(uint256(uint64(paddles >> (side == 0 ? 0 : 64)))) * 1_000_000;
        s.half = int256(uint256(uint32(w[_key(id, 13)] >> (side == 0 ? 0 : 32)))) * 1_000_000;
        s.nowUs = uint64(paddles >> 128);
        s.rally = ((control >> 4) & 15) + ((control >> 8) & 15);
    }

    /// @dev Chaos runs up to two balls and keeps its own packing. Reading the four scalars this
    ///      policy needs is cheaper and safer than projecting through codec.legacy, which collapses
    ///      to a single ball and would make the bot blind to MULTIBALL.
    function _chaos(mapping(bytes32 => uint256) storage w, uint256 id, uint8 side)
        private
        view
        returns (Seat memory s)
    {
        uint256 paddles = w[_key(id, 27)];
        uint256 meta = w[_key(id, 28)];
        uint256 live;
        HouseController.Ball[] memory all = new HouseController.Ball[](2);
        for (uint256 i; i < 2; i++) {
            uint256 a = w[_key(id, 21 + i * 2)];
            if (a & (uint256(1) << 195) == 0) continue;
            uint256 b = w[_key(id, 22 + i * 2)];
            all[live++] = HouseController.Ball(
                int256(int56(uint56(a))),
                int256(int56(uint56(a >> 56))),
                int256(int80(uint80(b))),
                int256(int80(uint80(b >> 80)))
            );
        }
        s.balls = new HouseController.Ball[](live);
        for (uint256 i; i < live; i++) s.balls[i] = all[i];
        s.position = int256(uint256(uint56(paddles >> (side == 0 ? 0 : 56))));
        // The half-paddle is not stored: it is half the side's betting weight, in 1e6, so 1e12
        // is that weight times five hundred thousand.
        s.half = int256(uint256(uint32(meta >> (side == 0 ? 101 : 133)))) * 500_000;
        s.nowUs = uint64(paddles >> 112);
        s.rally = uint32(meta >> 6);
    }

    // --- in-tournament learning ------------------------------------------------------------
    //
    // A tournament is one Interlude delegation epoch, stamped once per match at acceptance in
    // field 31 and already exposed as gameEpoch(id). The epoch sits inside the key preimage, so a
    // new tournament yields a key that has never been written, reads zero, and decodes as "play
    // the published label". Forgetting costs nothing and cannot be half-done.
    //
    // The difficulty label is a CEILING. The two strength trims only ever move to the soft side of
    // it: conceding recovers a bot toward its label and stops there, scoring on it eases it off.
    // So scoring on a bot is the only thing that makes it harder, and it can never become harder
    // than advertised. The aim error, the clearest signature of a tier, is not learnable at all.
    // Only `lead` is two-sided, because a systematic aim bias is a model error the label never
    // intended to include rather than a difficulty.

    uint256 internal constant TRIM_MAX = 6;
    int256 internal constant LEAD_MAX = 32;
    int256 internal constant LATE_AT = 8;
    int256 internal constant SIDE_AT = 6;

    struct Record {
        uint256 dReact;
        uint256 dDead;
        int256 lead;
        int256 eLate;
        int256 eBlind;
        int256 eSide;
    }

    function _learnKey(mapping(bytes32 => uint256) storage w, uint256 id, uint8 mode)
        private
        view
        returns (bytes32)
    {
        uint256 epoch = w[_key(id, 31)];
        if (epoch == 0) return bytes32(0);
        uint256 a = uint160(w[_key(id, 0)]);
        uint256 b = uint160(w[_key(id, 1)]);
        uint256 inner = uint256(keccak256(abi.encode(a < b ? a : b, a < b ? b : a, mode, epoch)));
        return keccak256(abi.encode(address(this), uint256(5), inner, uint256(0)));
    }

    function _read(uint256 word, uint8 side) private pure returns (Record memory r) {
        uint256 v = word >> (side == 0 ? 0 : 96);
        r.dReact = v & 31;
        r.dDead = (v >> 5) & 31;
        r.lead = int256(int8(uint8(v >> 16)));
        r.eLate = int256(int8(uint8(v >> 24)));
        r.eBlind = int256(int8(uint8(v >> 32)));
        r.eSide = int256(int8(uint8(v >> 40)));
    }

    function _write(uint256 word, uint8 side, Record memory r) private pure returns (uint256) {
        uint256 v = (r.dReact & 31) | ((r.dDead & 31) << 5) | (uint256(uint8(int8(r.lead))) << 16)
            | (uint256(uint8(int8(r.eLate))) << 24) | (uint256(uint8(int8(r.eBlind))) << 32)
            | (uint256(uint8(int8(r.eSide))) << 40);
        uint256 shift = side == 0 ? 0 : 96;
        return (word & ~(uint256(type(uint96).max) << shift)) | (v << shift);
    }

    /// @dev Six to eight consistent samples are needed before a trim moves, so noise cancels and
    ///      only systematic error survives.
    function _settle(Record memory r) private pure {
        if (r.eLate >= LATE_AT) {
            if (r.dReact < TRIM_MAX) r.dReact++;
            r.eLate = 0;
        } else if (r.eLate <= -LATE_AT) {
            if (r.dReact > 0) r.dReact--;
            r.eLate = 0;
        }
        if (r.eBlind >= LATE_AT) {
            if (r.dDead < TRIM_MAX) r.dDead++;
            r.eBlind = 0;
        } else if (r.eBlind <= -LATE_AT) {
            if (r.dDead > 0) r.dDead--;
            r.eBlind = 0;
        }
        if (r.eSide >= SIDE_AT) {
            if (r.lead < LEAD_MAX) r.lead += 2;
            r.eSide = 0;
        } else if (r.eSide <= -SIDE_AT) {
            if (r.lead > -LEAD_MAX) r.lead -= 2;
            r.eSide = 0;
        }
    }

    /// @notice Account for every point resolved since this word was last touched.
    /// @dev One storage write, in the transaction where the point lands. Both seats live in the
    ///      same word, so a point costs one write even though both learn from it.
    function _learn(
        mapping(bytes32 => uint256) storage w,
        bytes32 brainKey,
        uint256 id,
        uint256 control,
        uint8 scoreA,
        uint8 scoreB
    ) private {
        uint256 word = w[brainKey];
        uint32 tag = uint32(id);
        // A match always begins nil-nil, so a different tag means the counters belong to another
        // match and start again from zero. No resynchronisation write is needed.
        uint8 seenA = uint32(word >> 192) == tag ? uint8((word >> 224) & 15) : 0;
        uint8 seenB = uint32(word >> 192) == tag ? uint8((word >> 228) & 15) : 0;
        if (scoreA <= seenA && scoreB <= seenB) return;

        for (uint8 side; side < 2; side++) {
            uint8 conceded = side == 0 ? scoreB - seenB : scoreA - seenA;
            uint8 scored = side == 0 ? scoreA - seenA : scoreB - seenB;
            if (conceded == 0 && scored == 0) continue;
            Record memory r = _read(word, side);
            if (conceded > 0) {
                // The one question the bot can answer from its own last decision: was it beaten
                // while chasing, or while it believed itself already in position?
                bool moving = ((control >> (144 + side * 2)) & 3) != 1;
                int256 n = int256(uint256(conceded));
                if (moving) r.eLate += 2 * n;
                else r.eBlind += 2 * n;
                r.eSide += ((control >> (148 + side)) & 1) == 1 ? n : -n;
            }
            if (scored > 0) {
                int256 n = int256(uint256(scored));
                r.eLate -= n;
                r.eBlind -= n;
                if (r.eSide > 0) r.eSide -= n;
                else if (r.eSide < 0) r.eSide += n;
            }
            _settle(r);
            word = _write(word, side, r);
        }

        word = (word & ~(uint256(type(uint32).max) << 192)) | (uint256(tag) << 192);
        word = (word & ~(uint256(255) << 224)) | (uint256(scoreA & 15) << 224) | (uint256(scoreB & 15) << 228);
        w[brainKey] = word;
    }

    /// @notice The learned word for this pair, this mode and this tournament. Zero means the
    ///         published label exactly, which is also what an unwritten key reads.
    function brainOf(mapping(bytes32 => uint256) storage w, uint256 id, uint8 mode)
        external
        view
        returns (uint256)
    {
        bytes32 k = _learnKey(w, id, mode);
        return k == bytes32(0) ? 0 : w[k];
    }

    /// @notice Decide for each house seat, write the control word once, and return the game time
    ///         the caller should advance to next.
    /// @return next the sub-target; equal to `target` when no further slicing is wanted
    function steer(mapping(bytes32 => uint256) storage w, uint256 id, uint8 mode, uint64 target)
        external
        returns (uint64 next)
    {
        uint64 nowUs = uint64(w[_key(id, mode == 0 ? 7 : 27)] >> 112);
        if (mode == 0) nowUs = uint64(w[_key(id, 7)] >> 128);
        if (nowUs >= target) return target;

        (bool houseA, uint8 levelA) = _tier(w, uint256(uint160(w[_key(id, 0)])));
        (bool houseB, uint8 levelB) = _tier(w, uint256(uint160(w[_key(id, 1)])));
        if (!houseA && !houseB) return target;

        uint256 control = w[_key(id, 8)];
        bytes32 seed = bytes32(w[_key(id, 3)]);

        // A ranked match plays the published label exactly, forever. ELO assumes stationary
        // strength on both sides, and an adapting opponent is not: a learner's rating would be
        // anchored to a version of itself that no longer exists, and its opponent's to it.
        bytes32 brain = (w[_key(id, 0)] >> 160) & 1 == 1 ? bytes32(0) : _learnKey(w, id, mode);
        if (brain != bytes32(0)) {
            uint256 meta = mode == 0 ? control : w[_key(id, 28)];
            _learn(
                w,
                brain,
                id,
                control,
                mode == 0 ? uint8((meta >> 4) & 15) : uint8(meta & 7),
                mode == 0 ? uint8((meta >> 8) & 15) : uint8((meta >> 3) & 7)
            );
        }
        uint256 brainWord = brain == bytes32(0) ? 0 : w[brain];

        for (uint8 side; side < 2; side++) {
            if (side == 0 ? !houseA : !houseB) continue;
            Record memory r = _read(brainWord, side);
            HouseController.Tuning memory t = _tuning(side == 0 ? levelA : levelB);
            // The trims only ever soften: a longer interval and a wider dead zone than the label,
            // never shorter or narrower. The label is a ceiling.
            t.reactionUs += uint32(r.dReact * 10_000);
            t.deadZone += int256(r.dDead) * HouseController.PICO;
            // A tier re-decides only on its own reaction boundary; between boundaries it holds the
            // direction already in the control word, which is what a reaction delay means.
            if (nowUs % t.reactionUs >= SLICE_US) continue;
            Seat memory seat = mode == 0 ? _legacy(w, id, side) : _chaos(w, id, side);
            (int8 dir, int256 gap) = HouseController.decideAndGap(
                seat.balls,
                side,
                seat.position,
                seat.half,
                t,
                _aimError(seed, seat.rally, side, t.error) + r.lead * HouseController.PICO
            );
            uint256 shift = side == 0 ? 0 : 2;
            control = (control & ~(uint256(3) << shift)) | (uint256(uint8(dir + 1)) << shift);
            // The attribution rides in the control word's free high bits. That word is written
            // every slice anyway, and repeated writes to one slot commit as a single diff, so
            // remembering the last decision costs nothing.
            control = (control & ~(uint256(3) << (144 + side * 2))) | (uint256(uint8(dir + 1)) << (144 + side * 2));
            control = (control & ~(uint256(1) << (148 + side))) | ((gap > 0 ? uint256(1) : 0) << (148 + side));
        }

        w[_key(id, 8)] = control;
        next = nowUs + SLICE_US;
        if (next > target) next = target;
    }
}
