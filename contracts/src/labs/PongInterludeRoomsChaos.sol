// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {RoomsRules} from "./RoomsRules.sol";
import {EloFormulaV2} from "../v2/EloFormulaV2.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Delegatable} from "../../vendor/interlude/Delegatable.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {PongInterludeRoomsChaosInterludeSurface} from "./PongInterludeRoomsChaosInterludeSurface.sol";

/// @notice Candidate rules for Classic and Chaos rooms. Not a deployable application.
/// A concrete subclass must implement authenticated, fresh market checkpoints.
/// There is intentionally no admin setter for pressure and no monetary oracle here.
abstract contract PongInterludeRoomsChaos is PongInterludeRoomsChaosInterludeSurface {
    uint256 public constant TICK_US = 10_000;
    uint256 public constant RULES_VERSION = 4;
    uint256 public constant CAPACITY = 2;
    address public immutable coordinator;
    uint256 public immutable genesisTime;
    EloFormulaV2 public immutable eloFormula;
    RoomsRules public immutable physicsRules;
    bytes32 private constant OFFER_TYPEHASH = keccak256(
        "MatchOffer(uint256 id,bytes32 room,address a,address b,uint8 mode,bool ranked,uint64 expires,uint256 rules,bytes32 entropy)"
    );
    bytes32 private immutable domain;

    /// @custom:interlude global
    mapping(bytes32 => uint256) internal words;

    struct Offer {
        uint256 id;
        bytes32 room;
        address a;
        address b;
        uint8 mode;
        bool ranked;
        uint64 expires;
        uint256 rules;
        bytes32 entropy;
    }

    struct Rating {
        uint32 elo;
        uint32 played;
        uint32 wins;
        uint32 season;
    }
    error InvalidMatch();
    error NotPlayer();
    error ArenaBusy();
    error StaleInput();
    error InvalidPressure();
    error CatchUpRequired();
    error EngineOnly();
    error InvalidTicket();

    struct Pressure {
        bool ready;
        uint256 paidA;
        uint256 paidB;
        bytes32 checkpoint;
    }
    /// @dev Must bind this deployment, match, rally and exact pause boundary. The source
    /// must exclude late bets and platform liquidity. A stale source returns ready=false.
    /// The provisional testnet subclass uses a scoped VPS attestation, explicitly
    /// authorized by the owner. This is a trust assumption, not a cross-chain proof.
    function _verifiedPressure(uint256 id, uint8 rally, uint64 resumeAt) internal view virtual returns (Pressure memory);
    event PressureRequired(uint256 indexed id, uint8 rally, uint64 resumeAt);
    event RallyResumed(
        uint256 indexed id, uint8 rally, uint256 paidA, uint256 paidB, int256 halfA, int256 halfB, bytes32 checkpoint
    );
    event MatchAccepted(
        uint256 indexed id, bytes32 indexed room, address indexed player, address a, address b, uint8 mode, bool ranked
    );
    event Snapshot(uint256 indexed id, uint256 version, uint256 status, bytes state);
    event Completed(
        uint256 indexed id,
        bytes32 indexed room,
        address a,
        address b,
        address winner,
        uint256 status,
        uint8 mode,
        bool ranked,
        uint8 scoreA,
        uint8 scoreB,
        bytes32 resultHash
    );
    event RatingUpdated(
        uint256 indexed id, address indexed player, uint8 mode, uint32 season, uint32 elo, uint32 played, uint32 wins
    );

    constructor(IInterludeHub hub_, address coordinator_) Delegatable(hub_) {
        require(coordinator_ != address(0));
        coordinator = coordinator_;
        genesisTime = block.timestamp;
        eloFormula = new EloFormulaV2();
        physicsRules = new RoomsRules();
        domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PONGIT Rooms"),
                keccak256("2"),
                block.chainid,
                address(this)
            )
        );
        _registerInterludeSurface();
    }
    modifier engine() {
        if (!isEphemeral()) revert EngineOnly();
        _;
    }

    // The runtime address prevents constant-key folding, including the capacity counter.
    function _key(uint256 ns, uint256 id, uint256 field) private view returns (bytes32) {
        return keccak256(abi.encode(address(this), ns, id, field));
    }

    function _get(uint256 id, uint256 field) internal view returns (uint256) {
        return words[_key(0, id, field)];
    }

    function _set(uint256 id, uint256 field, uint256 value) internal {
        words[_key(0, id, field)] = value;
    }

    function _phase(uint256 id) internal view returns (uint256) {
        return (_get(id, 0) >> 161) & 7;
    }

    function activeMatchOf(address player) public view returns (uint256) {
        return words[_key(1, uint160(player), 0)];
    }

    function activeCount() public view returns (uint256) {
        return words[_key(4, 0, 0)];
    }

    function resultHashes(uint256 id) public view returns (bytes32) {
        return bytes32(_get(id, 9));
    }

    function ticketDigest(Offer calldata o) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domain,
                keccak256(
                    abi.encode(OFFER_TYPEHASH, o.id, o.room, o.a, o.b, o.mode, o.ranked, o.expires, o.rules, o.entropy)
                )
            )
        );
    }

    function acceptMatch(Offer calldata o, bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL) {
        if (
            o.id == 0 || o.a == address(0) || o.b == address(0) || o.a == o.b || o.mode > 1 || o.rules != RULES_VERSION
                || o.expires <= block.timestamp || o.expires > block.timestamp + 30
        ) revert InvalidTicket();
        bytes32 digest = ticketDigest(o);
        if (ECDSA.recover(digest, signature) != coordinator) revert InvalidTicket();
        address actor = _actor();
        if (actor != o.a && actor != o.b) revert NotPlayer();
        uint256 phase = _phase(o.id);
        uint256 meta = _get(o.id, 0);
        if (phase == 0) {
            if (activeCount() >= CAPACITY || activeMatchOf(o.a) != 0 || activeMatchOf(o.b) != 0) revert ArenaBusy();
            meta = uint160(o.a) | (o.ranked ? 1 << 160 : 0) | (1 << 161) | (uint256(o.mode) << 168);
            _set(o.id, 1, uint160(o.b));
            _set(o.id, 2, uint256(o.expires) << 64);
            _set(o.id, 3, uint256(keccak256(abi.encode(o.entropy, o.id, o.a, o.b, address(this)))));
            _set(o.id, 10, uint256(digest));
            _set(o.id, 11, uint256(o.room));
            words[_key(1, uint160(o.a), 0)] = o.id;
            words[_key(1, uint160(o.b), 0)] = o.id;
            words[_key(4, 0, 0)]++;
            _set(o.id, 0, meta);
            _save(o.id, physicsRules.initial(bytes32(_get(o.id, 3)), o.mode));
        } else if (phase != 1 || bytes32(_get(o.id, 10)) != digest) {
            revert InvalidMatch();
        }
        uint256 bit = actor == o.a ? 1 : 2;
        uint256 accepted = (meta >> 164) & 3;
        if ((accepted & bit) != 0) revert InvalidMatch();
        accepted |= bit;
        meta = (meta & ~(uint256(3) << 164)) | (accepted << 164);
        if (accepted == 3) {
            meta = (meta & ~(uint256(7) << 161)) | (2 << 161);
            _set(o.id, 2, _get(o.id, 2) | uint64(block.number));
        }
        _set(o.id, 0, meta);
        emit MatchAccepted(o.id, o.room, actor, o.a, o.b, o.mode, o.ranked);
        _publish(o.id);
    }

    function cancelMatch(uint256 id) external engine whenNotDelegated(Types.GLOBAL) {
        if (_phase(id) != 1) revert InvalidMatch();
        if (block.timestamp <= uint64(_get(id, 2) >> 64)) _side(id);
        _finish(id, 4, address(0));
        _publish(id);
    }

    function input(uint256 id, int8 direction, uint256 sequence, uint256 deadlineBlock)
        external
        engine
        whenNotDelegated(Types.GLOBAL)
    {
        if (_phase(id) != 2) revert InvalidMatch();
        bool left = _side(id);
        uint256 control = _get(id, 8);
        uint256 shift = left ? 16 : 80;
        if (
            direction < -1 || direction > 1 || sequence != uint64(control >> shift) + 1 || sequence > type(uint64).max
                || block.number > deadlineBlock || deadlineBlock > block.number + 200
        ) revert StaleInput();
        if (!_advance(id, false)) revert CatchUpRequired();
        if (_phase(id) == 2) {
            control = _get(id, 8);
            uint256 dirShift = left ? 0 : 2;
            control = (control & ~(uint256(3) << dirShift)) | (uint256(uint8(direction + 1)) << dirShift);
            control = (control & ~(uint256(type(uint64).max) << shift)) | (sequence << shift);
            _set(id, 8, control);
        }
        _publish(id);
    }

    function tick(uint256 id) external engine whenNotDelegated(Types.GLOBAL) {
        if (_phase(id) != 2) revert InvalidMatch();
        _advance(id, true);
        _publish(id);
    }

    function concede(uint256 id) external engine whenNotDelegated(Types.GLOBAL) {
        if (_phase(id) != 2) revert InvalidMatch();
        bool left = _side(id);
        if (!_advance(id, false)) revert CatchUpRequired();
        if (_phase(id) == 2) _finish(id, 3, left ? address(uint160(_get(id, 1))) : address(uint160(_get(id, 0))));
        _publish(id);
    }

    function _side(uint256 id) private view returns (bool) {
        address actor = _actor();
        if (actor == address(uint160(_get(id, 0)))) return true;
        if (actor != address(uint160(_get(id, 1)))) revert NotPlayer();
        return false;
    }

    function _advance(uint256 id, bool mayResume) private returns (bool complete) {
        uint256 start = uint64(_get(id, 2));
        if (block.number < start) revert InvalidMatch();
        uint256 target = (block.number - start) * TICK_US;
        if (target > 30 minutes * 1_000_000) {
            _finish(id, 4, address(0));
            return true;
        }
        PhysicsV2.State memory s = _state(id);
        if (s.mode == 1 && s.awaitingServe) {
            // Only tick consults the transport. Releases and concession must remain
            // available even if a checkpoint implementation rejects its own data.
            if (!mayResume || target < s.resumeAt) return true;
            uint8 rally = s.scoreA + s.scoreB;
            Pressure memory p = _verifiedPressure(id, rally, s.resumeAt);
            if (!p.ready) return true;
            // Cumulative gross paid pressure survives claims and cannot go backwards.
            // The conservative numeric bound keeps handicap arithmetic far from overflow.
            if (
                p.checkpoint == bytes32(0) || p.paidA < _get(id, 14) || p.paidB < _get(id, 15)
                    || p.paidA > type(uint128).max || p.paidB > type(uint128).max
            ) revert InvalidPressure();
            _set(id, 14, p.paidA);
            _set(id, 15, p.paidB);
            // Start now: an unavailable checkpoint must never make us replay a hidden rally.
            s = physicsRules.resume(s, uint64(target), p.paidA, p.paidB);
            _save(id, s);
            emit RallyResumed(id, rally, p.paidA, p.paidB, s.halfA, s.halfB, p.checkpoint);
            return true;
        }
        (s, complete) = physicsRules.advance(s, uint64(target), 128);
        _save(id, s);
        if (s.awaitingServe) emit PressureRequired(id, s.scoreA + s.scoreB, s.resumeAt);
        if (s.finished) _finish(id, 3, s.scoreA == 7 ? address(uint160(_get(id, 0))) : address(uint160(_get(id, 1))));
    }

    function _state(uint256 id) internal view returns (PhysicsV2.State memory s) {
        uint256 xy = _get(id, 4);
        uint256 p = _get(id, 7);
        uint256 c = _get(id, 8);
        uint256 chaos = _get(id, 13);
        s.x = int128(uint128(xy));
        s.y = int128(uint128(xy >> 128));
        s.vx = int256(_get(id, 5));
        s.vy = int256(_get(id, 6));
        s.left = int256(uint256(uint64(p)));
        s.right = int256(uint256(uint64(p >> 64)));
        s.leftDir = int8(uint8(c & 3)) - 1;
        s.rightDir = int8(uint8((c >> 2) & 3)) - 1;
        s.t = uint64(p >> 128);
        s.scoreA = uint8((c >> 4) & 15);
        s.scoreB = uint8((c >> 8) & 15);
        s.seed = bytes32(_get(id, 3));
        s.finished = _phase(id) >= 3;
        s.mode = matchMode(id);
        s.halfA = int256(uint256(uint32(chaos)));
        s.halfB = int256(uint256(uint32(chaos >> 32)));
        s.awaitingServe = ((chaos >> 128) & 1) == 1;
        s.resumeAt = uint64(chaos >> 64);
    }

    function _save(uint256 id, PhysicsV2.State memory s) private {
        _set(
            id,
            13,
            uint32(uint256(s.halfA)) | (uint256(uint32(uint256(s.halfB))) << 32) | (uint256(s.resumeAt) << 64)
                | (s.awaitingServe ? uint256(1) << 128 : 0)
        );
        // Positions stay within the court; velocity retains all 256 bits (no speed cap).
        require(
            s.x >= type(int128).min && s.x <= type(int128).max && s.y >= type(int128).min && s.y <= type(int128).max
        );
        _set(id, 4, uint128(int128(s.x)) | (uint256(uint128(int128(s.y))) << 128));
        _set(id, 5, uint256(s.vx));
        _set(id, 6, uint256(s.vy));
        _set(id, 7, uint64(uint256(s.left)) | (uint256(uint64(uint256(s.right))) << 64) | (uint256(s.t) << 128));
        _set(
            id,
            8,
            (_get(id, 8) & ~uint256(65535)) | uint8(s.leftDir + 1) | (uint256(uint8(s.rightDir + 1)) << 2)
                | (uint256(s.scoreA) << 4) | (uint256(s.scoreB) << 8)
        );
    }

    function currentSeason() public view returns (uint32) {
        return uint32(1 + (block.timestamp - genesisTime) / 30 days);
    }

    function ratingOf(address player, uint8 mode) public view returns (Rating memory r) {
        require(mode <= 1, "mode");
        uint256 packed = words[_key(2, uint160(player), mode)];
        if (packed == 0) return _startingRating(player, mode);
        r = Rating(uint32(packed), uint32(packed >> 32), uint32(packed >> 64), uint32(packed >> 96));
        uint32 season = currentSeason();
        if (r.season == season) return r;
        int256 value = r.elo == 0 ? int256(1000) : int256(uint256(r.elo));
        for (uint256 i; i < 16 && uint256(r.season) + i < season; i++) {
            value = 1000 + (value - 1000) / 2;
        }
        return Rating(uint32(uint256(value)), 0, 0, season);
    }

    function _startingRating(address, uint8) internal view virtual returns (Rating memory) {
        return Rating(1000, 0, 0, currentSeason());
    }

    function _rate(uint256 id, address a, address b, address winner) private {
        uint8 mode = matchMode(id);
        Rating memory ra = ratingOf(a, mode);
        Rating memory rb = ratingOf(b, mode);
        _set(id, 12, uint256(ra.elo) | (uint256(rb.elo) << 32));
        (ra, rb) = _calculate(ra, rb, winner == a, _pairCount(a, b, mode));
        _rating(id, a, ra);
        _rating(id, b, rb);
        _set(id, 12, _get(id, 12) | (uint256(ra.elo) << 64) | (uint256(rb.elo) << 96));
    }

    function _pairCount(address a, address b, uint8 mode) private returns (uint256 count) {
        bytes32 pair = keccak256(abi.encode(a < b ? a : b, a < b ? b : a, block.timestamp / 1 days, mode));
        bytes32 k = _key(3, uint256(pair), 0);
        count = words[k] + 1;
        if (count > 8) count = 8;
        words[k] = count;
    }

    function _calculate(Rating memory ra, Rating memory rb, bool aWon, uint256 count)
        private
        view
        returns (Rating memory, Rating memory)
    {
        int256 difference = (aWon ? int256(1e18) : int256(0)) - eloFormula.expected(ra.elo, rb.elo);
        ra.elo = _positive(
            int256(uint256(ra.elo)) + (ra.played < 10 ? int256(64) : int256(32)) * difference / 1e18 / int256(count)
        );
        rb.elo = _positive(
            int256(uint256(rb.elo)) - (rb.played < 10 ? int256(64) : int256(32)) * difference / 1e18 / int256(count)
        );
        ra.played++;
        rb.played++;
        if (aWon) ra.wins++;
        else rb.wins++;
        return (ra, rb);
    }

    function _positive(int256 n) private pure returns (uint32) {
        return uint32(uint256(n < 100 ? int256(100) : n));
    }

    function _rating(uint256 id, address p, Rating memory r) private {
        words[_key(2, uint160(p), matchMode(id))] =
            uint256(r.elo) | (uint256(r.played) << 32) | (uint256(r.wins) << 64) | (uint256(r.season) << 96);
        emit RatingUpdated(id, p, matchMode(id), r.season, r.elo, r.played, r.wins);
    }

    function _finish(uint256 id, uint256 phase, address winner) private {
        uint256 meta = _get(id, 0);
        if (_phase(id) >= 3) revert InvalidMatch();
        address a = address(uint160(meta));
        address b = address(uint160(_get(id, 1)));
        bool ranked = ((meta >> 160) & 1) == 1;
        _set(
            id,
            0,
            (meta & ~(uint256(7) << 161)) | (phase << 161)
                | ((winner == a ? uint256(1) : winner == b ? uint256(2) : 0) << 166)
        );
        _set(id, 8, (_get(id, 8) & ~uint256(15)) | 5);
        if (phase == 3 && ranked) _rate(id, a, b, winner);
        if (activeMatchOf(a) == id) delete words[_key(1, uint160(a), 0)];
        if (activeMatchOf(b) == id) delete words[_key(1, uint160(b), 0)];
        words[_key(4, 0, 0)]--;
        PhysicsV2.State memory s = _state(id);
        bytes32 hash = keccak256(
            abi.encode(
                address(this),
                RULES_VERSION,
                id,
                a,
                b,
                winner,
                phase,
                matchMode(id),
                ranked,
                s.scoreA,
                s.scoreB,
                s.t,
                _get(id, 12)
            )
        );
        _set(id, 9, uint256(hash));
        emit Completed(id, bytes32(_get(id, 11)), a, b, winner, phase, matchMode(id), ranked, s.scoreA, s.scoreB, hash);
    }

    function _publish(uint256 id) private {
        uint256 times = _get(id, 2) + (uint256(1) << 128);
        _set(id, 2, times);
        emit Snapshot(id, times >> 128, _phase(id), abi.encode(_state(id)));
    }

    function ratingChange(uint256 id)
        external
        view
        returns (uint32 beforeA, uint32 beforeB, uint32 afterA, uint32 afterB)
    {
        uint256 r = _get(id, 12);
        return (uint32(r), uint32(r >> 32), uint32(r >> 64), uint32(r >> 96));
    }

    function matchMode(uint256 id) public view returns (uint8) {
        return uint8((_get(id, 0) >> 168) & 1);
    }

    function paidPressure(uint256 id) external view returns (uint256, uint256) {
        return (_get(id, 14), _get(id, 15));
    }

    function rankedMatch(uint256 id) external view returns (bool) {
        return (_get(id, 0) & (1 << 160)) != 0;
    }

    function getSnapshot(uint256 id)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            address,
            address,
            address,
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            PhysicsV2.State memory
        )
    {
        uint256 m = _get(id, 0);
        uint256 t = _get(id, 2);
        uint256 c = _get(id, 8);
        uint256 phase = _phase(id);
        PhysicsV2.State memory s = _state(id);
        address a = address(uint160(m));
        address b = address(uint160(_get(id, 1)));
        uint256 w = (m >> 166) & 3;
        return (
            id,
            t >> 128,
            phase,
            a,
            b,
            b,
            w == 1 ? a : w == 2 ? b : address(0),
            block.number,
            phase == 2 && isEphemeral() ? (block.number - uint64(t)) * TICK_US : s.t,
            uint64(c >> 16),
            uint64(c >> 80),
            uint64(t >> 64),
            s
        );
    }
}
