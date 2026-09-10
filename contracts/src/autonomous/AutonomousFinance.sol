// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AutonomousArena} from "./AutonomousArena.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {IMatchResultV2} from "../v2/GameV2.sol";
import {IChaosProof, IMonadPressure} from "./ChaosProof.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

interface IPaidMarket {
    function pressure(uint256 id) external view returns (uint256, uint256);
    function results() external view returns (address);
}

/// Monad finance boundary. A direct read is valid on Monad ONLY; this is not an Interlude oracle.
contract AutonomousFinance is IMatchResultV2, IMonadPressure {
    AutonomousArena public immutable game;
    address public immutable administrator;
    IPaidMarket public market;
    uint256 public constant WINDOW_BLOCKS = 40;
    uint256 public constant CONFIRMATIONS = 2;

    struct Round {
        uint64 closeBlock;
        uint64 resumeAt;
        bytes32 boundary;
    }

    struct Final {
        address a;
        address b;
        address winner;
        uint8 status;
        bytes32 resultHash;
    }
    mapping(uint256 => mapping(uint8 => Round)) public rounds;
    mapping(uint256 => mapping(uint8 => IChaosProof.Checkpoint)) private checkpoints;
    mapping(uint256 => Final) public finalResults;
    event RoundOpened(uint256 indexed matchId, uint8 indexed rally, uint64 closeBlock);
    event CheckpointSaved(
        uint256 indexed matchId, uint8 indexed rally, bytes32 commitment, uint256 paidA, uint256 paidB
    );
    event ResultFinalized(uint256 indexed matchId, bytes32 resultHash, uint8 status);

    constructor(AutonomousArena game_, address admin) {
        require(block.chainid == 10143 && address(game_).code.length > 0 && admin != address(0));
        game = game_;
        administrator = admin;
    }
    modifier base() {
        require(block.chainid == 10143, "Monad only");
        _;
    }

    function bindMarket(IPaidMarket m) external base {
        require(
            msg.sender == administrator && address(market) == address(0) && m.results() == address(this),
            "market binding"
        );
        market = m;
    }

    function snapshot(uint256 id)
        private
        view
        returns (uint256 phase, address a, address b, address winner, PhysicsV2.State memory s)
    {
        (,, phase, a, b,, winner,,,,,, s) = game.getSnapshot(id);
    }

    function available() private view returns (bool) {
        AutonomousArena.Execution e = game.executionState();
        Types.Status status = game.hub().statusOf(address(game), Types.GLOBAL);
        return e == AutonomousArena.Execution.Monad && status == Types.Status.None
            || e == AutonomousArena.Execution.Interlude && status == Types.Status.Active;
    }

    function openRound(uint256 id) external base {
        (uint256 phase,,,, PhysicsV2.State memory s) = snapshot(id);
        uint8 rally = s.scoreA + s.scoreB;
        require(
            available() && phase == 2 && s.mode == 1 && s.awaitingServe && address(market) != address(0),
            "Chaos boundary unavailable"
        );
        require(rounds[id][rally].closeBlock == 0, "round exists");
        rounds[id][rally] =
            Round(uint64(block.number + WINDOW_BLOCKS), s.resumeAt, keccak256(abi.encode(s.seed, rally, s.resumeAt)));
        emit RoundOpened(id, rally, uint64(block.number + WINDOW_BLOCKS));
    }

    function bettingWindow(uint256 id, uint64) external view returns (bool allowed, uint256 version) {
        if (block.chainid != 10143) return (false, 0);
        (uint256 phase,,,, PhysicsV2.State memory s) = snapshot(id);
        uint8 rally = s.scoreA + s.scoreB;
        Round memory r = rounds[id][rally];
        version = (uint256(r.closeBlock) << 8) | rally;
        allowed = available() && phase == 2 && s.mode == 1 && s.awaitingServe && r.closeBlock > block.number
            && r.resumeAt == s.resumeAt && r.boundary == keccak256(abi.encode(s.seed, rally, s.resumeAt));
    }

    function freezeCheckpoint(uint256 id, uint8 rally) external base {
        if (checkpoints[id][rally].commitment != 0) return;
        Round memory r = rounds[id][rally];
        require(r.closeBlock != 0 && block.number >= uint256(r.closeBlock) + CONFIRMATIONS, "checkpoint not ready");
        // Capture a recent canonical block after closure. Never pretend a zero/expired blockhash is proof.
        (uint256 phase,,,, PhysicsV2.State memory s) = snapshot(id);
        require(
            available() && phase == 2 && s.awaitingServe && s.scoreA + s.scoreB == rally && s.resumeAt == r.resumeAt,
            "boundary changed"
        );
        (uint256 a, uint256 b) = market.pressure(id);
        uint64 source = uint64(block.number - 1);
        bytes32 hash = blockhash(source);
        require(hash != 0, "source unavailable");
        bytes32 commitment = keccak256(
            abi.encode(
                block.chainid,
                address(game),
                address(market),
                id >> 128,
                id,
                rally,
                r.resumeAt,
                r.closeBlock,
                source,
                hash,
                a,
                b
            )
        );
        checkpoints[id][rally] = IChaosProof.Checkpoint(a, b, source, hash, commitment);
        emit CheckpointSaved(id, rally, commitment, a, b);
    }

    function checkpoint(uint256 id, uint8 rally, uint64 resumeAt)
        external
        view
        returns (bool ready, IChaosProof.Checkpoint memory c)
    {
        c = checkpoints[id][rally];
        ready = block.chainid == 10143 && c.commitment != 0 && rounds[id][rally].resumeAt == resumeAt;
    }

    function result(uint256 id) external view returns (address a, address b, address winner, uint8 status) {
        Final memory f = finalResults[id];
        if (f.status != 0) return (f.a, f.b, f.winner, f.status);
        (uint256 phase, address p, address q,,) = snapshot(id);
        return (p, q, address(0), phase == 0 ? 0 : 2);
    }

    function finalizeResult(uint256 id) external base {
        if (finalResults[id].status != 0) return;
        require(game.hub().statusOf(address(game), Types.GLOBAL) == Types.Status.None, "result contestable");
        (uint256 phase, address a, address b, address winner,) = snapshot(id);
        bytes32 hash = game.resultHashes(id);
        require((phase == 3 || phase == 4) && a != address(0) && b != address(0) && hash != 0, "result pending");
        require(phase == 4 ? winner == address(0) : winner == a || winner == b, "winner");
        finalResults[id] = Final(a, b, winner, uint8(phase), hash);
        emit ResultFinalized(id, hash, uint8(phase));
    }
}
