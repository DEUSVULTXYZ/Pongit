// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {PhysicsInterlude} from "./PhysicsInterlude.sol";
import {Delegatable} from "../../vendor/interlude/Delegatable.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {PongInterludeInterludeSurface} from "./PongInterludeInterludeSurface.sol";

/// @notice One experimental Classic arena. No ELO, tokens or financial authority.
contract PongInterlude is PongInterludeInterludeSurface {
    uint256 public constant TICK_US = 10_000;
    uint256 public constant RULES_VERSION = 3;
    /// @custom:interlude global
    uint256 internal matchId;
    /// @custom:interlude global
    uint256 internal version;
    /// @custom:interlude global
    uint256 internal status;
    /// @custom:interlude global
    uint256 internal playerA;
    /// @custom:interlude global
    uint256 internal playerB;
    /// @custom:interlude global
    uint256 internal targetPlayer;
    /// @custom:interlude global
    uint256 internal winner;
    /// @custom:interlude global
    uint256 internal openedAt;
    /// @custom:interlude global
    uint256 internal startBlock;
    /// @custom:interlude global
    bytes32 internal seed;
    /// @custom:interlude global
    int256 internal ballX;
    /// @custom:interlude global
    int256 internal ballY;
    /// @custom:interlude global
    int256 internal ballVX;
    /// @custom:interlude global
    int256 internal ballVY;
    /// @custom:interlude global
    int256 internal paddleA;
    /// @custom:interlude global
    int256 internal paddleB;
    /// @custom:interlude global
    int256 internal directionA;
    /// @custom:interlude global
    int256 internal directionB;
    /// @custom:interlude global
    uint256 internal gameTime;
    /// @custom:interlude global
    uint256 internal scoreA;
    /// @custom:interlude global
    uint256 internal scoreB;
    /// @custom:interlude global
    uint256 internal nonceA;
    /// @custom:interlude global
    uint256 internal nonceB;
    /// @custom:interlude global
    mapping(uint256 => bytes32) public resultHashes;

    error InvalidMatch();
    error NotPlayer();
    error ArenaBusy();
    error StaleInput();
    error CatchUpRequired();
    error EngineOnly();

    event Snapshot(uint256 indexed id, uint256 version, uint256 status, bytes state);
    event Completed(uint256 indexed id, address winner, uint256 status, bytes32 resultHash);

    constructor(IInterludeHub hub_) Delegatable(hub_) { _registerInterludeSurface(); }

    modifier engine() {
        if (!isEphemeral()) revert EngineOnly();
        _;
    }

    function createMatch(address opponent, bytes32 entropy)
        external engine whenNotDelegated(Types.GLOBAL)
    {
        if (status == 2 || (status == 1 && block.timestamp <= openedAt + 10 minutes)) revert ArenaBusy();
        address actor = _actor();
        if (opponent == actor) revert NotPlayer();
        matchId++;
        playerA = uint256(uint160(actor)); playerB = 0;
        targetPlayer = uint256(uint160(opponent)); winner = 0;
        openedAt = block.timestamp; startBlock = 0; nonceA = 0; nonceB = 0;
        seed = keccak256(abi.encode(entropy, matchId, actor, address(this)));
        status = 1;
        _save(PhysicsInterlude.initial(seed));
        _publish();
    }

    function acceptMatch(uint256 id) external engine whenNotDelegated(Types.GLOBAL) {
        _id(id);
        if (status != 1 || block.timestamp > openedAt + 10 minutes) revert InvalidMatch();
        address actor = _actor();
        if (uint256(uint160(actor)) == playerA || (targetPlayer != 0 && uint256(uint160(actor)) != targetPlayer))
            revert NotPlayer();
        playerB = uint256(uint160(actor)); startBlock = block.number; status = 2;
        _publish();
    }

    function cancelMatch(uint256 id) external engine whenNotDelegated(Types.GLOBAL) {
        _id(id);
        if (status != 1) revert InvalidMatch();
        if (uint256(uint160(_actor())) != playerA && block.timestamp <= openedAt + 10 minutes) revert NotPlayer();
        status = 4; _publish();
    }

    function input(uint256 id, int8 direction, uint256 sequence, uint256 deadlineBlock)
        external engine whenNotDelegated(Types.GLOBAL)
    {
        _id(id);
        if (status != 2) revert InvalidMatch();
        bool left = _left();
        if (direction < -1 || direction > 1 || sequence != (left ? nonceA : nonceB) + 1
            || block.number > deadlineBlock || deadlineBlock > block.number + 200) revert StaleInput();
        if (!_advance()) revert CatchUpRequired();
        // An input arriving after a decisive point cannot change the result.
        if (status == 2) {
            if (left) { directionA = direction; nonceA = sequence; }
            else { directionB = direction; nonceB = sequence; }
        }
        _publish();
    }

    function tick(uint256 id) external engine whenNotDelegated(Types.GLOBAL) {
        _id(id);
        if (status != 2) revert InvalidMatch();
        _advance(); _publish();
    }

    function concede(uint256 id) external engine whenNotDelegated(Types.GLOBAL) {
        _id(id);
        if (status != 2) revert InvalidMatch();
        bool left = _left();
        if (!_advance()) revert CatchUpRequired();
        if (status == 2) { winner = left ? playerB : playerA; status = 3; }
        _publish();
    }

    function expire(uint256 id) external engine whenNotDelegated(Types.GLOBAL) {
        _id(id);
        if (status != 2 || block.timestamp <= openedAt + 40 minutes) revert InvalidMatch();
        status = 4; _publish();
    }

    function getSnapshot() external view returns (
        uint256 id, uint256 revision, uint256 phase, address a, address b, address target,
        address won, uint256 head, uint256 clockUs, uint256 aNonce, uint256 bNonce,
        uint256 invitationDeadline, PhysicsV2.State memory state
    ) {
        return (matchId, version, status, address(uint160(playerA)), address(uint160(playerB)),
            address(uint160(targetPlayer)), address(uint160(winner)), block.number,
            status == 2 && isEphemeral() && block.number >= startBlock ? (block.number - startBlock) * TICK_US : gameTime,
            nonceA, nonceB, openedAt + 10 minutes, _state());
    }

    function _id(uint256 id) private view { if (id != matchId || id == 0) revert InvalidMatch(); }
    function _left() private view returns (bool) {
        uint256 actor = uint256(uint160(_actor()));
        if (actor != playerA && actor != playerB) revert NotPlayer();
        return actor == playerA;
    }
    function _advance() private returns (bool complete) {
        if (block.number < startBlock) revert InvalidMatch();
        uint256 target = (block.number - startBlock) * TICK_US;
        if (target > 30 minutes * 1_000_000) { status = 4; return true; }
        PhysicsV2.State memory s;
        (s, complete) = PhysicsInterlude.advance(_state(), uint64(target), 128);
        _save(s);
        if (s.finished) { status = 3; winner = s.scoreA == 7 ? playerA : playerB; }
    }
    function _publish() private {
        version++;
        if (status >= 3) {
            directionA = 0; directionB = 0;
            bytes32 digest = keccak256(abi.encode(matchId, playerA, playerB, winner, status, scoreA, scoreB, gameTime));
            resultHashes[matchId] = digest;
            emit Completed(matchId, address(uint160(winner)), status, digest);
        }
        emit Snapshot(matchId, version, status, abi.encode(_state()));
    }
    function _state() private view returns (PhysicsV2.State memory s) {
        s = PhysicsV2.State(ballX, ballY, ballVX, ballVY, paddleA, paddleB,
            int8(directionA), int8(directionB), uint64(gameTime), uint8(scoreA), uint8(scoreB),
            seed, status >= 3, 0, 48_000_000, 48_000_000, false, 0);
    }
    function _save(PhysicsV2.State memory s) private {
        ballX=s.x; ballY=s.y; ballVX=s.vx; ballVY=s.vy;
        paddleA=s.left; paddleB=s.right; directionA=s.leftDir; directionB=s.rightDir;
        gameTime=s.t; scoreA=s.scoreA; scoreB=s.scoreB;
    }
}
