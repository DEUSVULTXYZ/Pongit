// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PongInterludeRoomsChaos} from "./PongInterludeRoomsChaos.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {IMatchResultV2} from "../v2/GameV2.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// @notice Monad-only windows and final results for the provisional rooms market.
/// No caller, including the pressure signer, may supply a winner or a score.
/// A published engine result is NOT payable while its delegation can be challenged.
contract RoomsMarketAdapter is IMatchResultV2 {
    PongInterludeRoomsChaos public immutable game;
    IInterludeHub public immutable hub;
    uint256 public immutable baseChainId;
    // About twelve seconds on Monad Testnet, allowing a passkey ceremony and
    // sponsored submission. The engine stays paused until the cutoff is frozen.
    uint256 public constant WINDOW_BLOCKS = 40;
    uint256 public constant CONFIRMATION_BLOCKS = 2;
    struct Round { uint64 closeBlock; uint64 resumeAt; uint8 rally; bytes32 stateHash; }
    struct FinalResult { address a; address b; address winner; uint8 status; bytes32 hash; }
    mapping(uint256 => mapping(uint8 => Round)) public rounds;
    mapping(uint256 => FinalResult) public finalResults;
    event RoundOpened(uint256 indexed id, uint8 indexed rally, uint64 closeBlock, uint64 resumeAt);
    event ResultFinalized(uint256 indexed id, bytes32 hash, address winner, uint8 status);
    constructor(PongInterludeRoomsChaos game_) {
        require(block.chainid == 10143 && address(game_).code.length > 0, "testnet game");
        game = game_; hub = game_.hub(); baseChainId = block.chainid;
    }
    modifier onlyBase() { require(block.chainid == baseChainId, "base only"); _; }
    function _snapshot(uint256 id) internal view returns (uint256 phase,address a,address b,address winner,PhysicsV2.State memory state) {
        (,,phase,a,b,,winner,,,,,,state) = game.getSnapshot(id);
    }
    function openRound(uint256 id) public virtual onlyBase {
        (uint256 phase,,,,PhysicsV2.State memory s) = _snapshot(id);
        require(phase == 2 && s.mode == 1 && s.awaitingServe, "not a Chaos pause");
        require(hub.statusOf(address(game), Types.GLOBAL) == Types.Status.Active, "engine unavailable");
        uint8 rally = s.scoreA + s.scoreB;
        require(rounds[id][rally].closeBlock == 0, "round already opened");
        require(block.number + WINDOW_BLOCKS <= type(uint64).max, "block range");
        uint64 closeBlock = uint64(block.number + WINDOW_BLOCKS);
        rounds[id][rally] = Round(closeBlock, s.resumeAt, rally, keccak256(abi.encode(s.seed, rally, s.resumeAt)));
        emit RoundOpened(id, rally, closeBlock, s.resumeAt);
    }
    function bettingWindow(uint256 id, uint64) external view virtual returns (bool allowed, uint256 version) {
        if (block.chainid != baseChainId) return (false, 0);
        (uint256 phase,,,,PhysicsV2.State memory s) = _snapshot(id);
        uint8 rally = s.scoreA + s.scoreB;
        Round memory r = rounds[id][rally];
        version = (uint256(r.closeBlock) << 8) | rally;
        allowed = phase == 2 && s.mode == 1 && s.awaitingServe && r.resumeAt == s.resumeAt
            && r.closeBlock > block.number && hub.statusOf(address(game),Types.GLOBAL) == Types.Status.Active
            && r.stateHash == keccak256(abi.encode(s.seed, rally, s.resumeAt));
    }
    function checkpointReady(uint256 id, uint8 rally, uint64 resumeAt) external view returns (bool ready, uint64 sourceBlock) {
        Round memory r = rounds[id][rally];
        sourceBlock = r.closeBlock;
        ready = block.chainid == baseChainId && r.closeBlock > 0 && r.resumeAt == resumeAt
            && block.number >= uint256(r.closeBlock) + CONFIRMATION_BLOCKS
            && hub.statusOf(address(game),Types.GLOBAL) == Types.Status.Active;
    }
    function result(uint256 id) external view virtual returns (address a,address b,address winner,uint8 status) {
        FinalResult memory f = finalResults[id];
        if (f.status != 0) return (f.a,f.b,f.winner,f.status);
        (uint256 phase,address p,address q,,) = _snapshot(id);
        // A terminal but still contestable result remains pending for financial purposes.
        return (p,q,address(0),phase == 0 ? 0 : phase == 1 ? 1 : 2);
    }
    function finalizeResult(uint256 id) external virtual onlyBase {
        require(finalResults[id].status == 0, "already final");
        // Conservative finality: releaseStake must have ended all challenge rights first.
        // No time-since-commit shortcut, and no server signature can bypass this gate.
        require(hub.statusOf(address(game),Types.GLOBAL) == Types.Status.None, "delegation not final");
        (uint256 phase,address a,address b,address winner,) = _snapshot(id);
        bytes32 hash = game.resultHashes(id);
        require((phase == 3 || phase == 4) && hash != bytes32(0), "result pending");
        require(a != address(0) && b != address(0) && a != b, "participants");
        require(phase == 4 ? winner == address(0) : winner == a || winner == b, "winner");
        finalResults[id] = FinalResult(a,b,winner,uint8(phase),hash);
        emit ResultFinalized(id,hash,winner,uint8(phase));
    }
}
