// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {RoomsMarketAdapter} from "./RoomsMarketAdapter.sol";
import {PongInterludeRoomsChaos} from "./PongInterludeRoomsChaos.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// @notice Opt-in Monad TESTNET settlement from the first published terminal result.
/// The result remains contestable. A later correction is audited, not paid twice.
/// No caller supplies a score, winner or beneficiary, and no engine key can spend funds.
contract RoomsEarlySettlement is RoomsMarketAdapter {
    struct Observation { uint256 epoch; uint256 batch; uint64 blockNumber; uint64 observedAt; }
    mapping(uint256 => Observation) public observations;
    mapping(uint256 => uint256) public matchEpoch;
    event EarlyResultAccepted(uint256 indexed id, uint256 indexed epoch, uint256 batch, bytes32 resultHash, address winner, uint8 status);

    constructor(PongInterludeRoomsChaos game_) RoomsMarketAdapter(game_) {}

    function openRound(uint256 id) public override onlyBase {
        require(finalResults[id].status == 0, "result already accepted");
        uint256 epoch = hub.sessionOf(address(game),Types.GLOBAL).epoch;
        require(epoch > 0 && (matchEpoch[id] == 0 || matchEpoch[id] == epoch), "match epoch changed");
        super.openRound(id);
        matchEpoch[id] = epoch;
    }

    function finalizeResult(uint256 id) external override onlyBase {
        require(finalResults[id].status == 0, "already final");
        Types.Session memory session = hub.sessionOf(address(game), Types.GLOBAL);
        require(session.status != Types.Status.Challenged, "settlement under review");
        require(matchEpoch[id] > 0, "unknown match epoch");
        if (session.status != Types.Status.None) {
            require(session.epoch > 0 && session.batchIndex > 0, "no published session");
            require(matchEpoch[id] == session.epoch, "match epoch changed");
        }
        (uint256 phase,address a,address b,address winner,) = _snapshot(id);
        bytes32 hash = game.resultHashes(id);
        require((phase == 3 || phase == 4) && hash != bytes32(0), "result pending");
        require(a != address(0) && b != address(0) && a != b, "participants");
        require(phase == 4 ? winner == address(0) : winner == a || winner == b, "winner");
        finalResults[id] = FinalResult(a,b,winner,uint8(phase),hash);
        // A released hub may clear its Session struct. The published terminal
        // state remains payable; batch zero identifies this finalized recovery.
        uint256 epoch = matchEpoch[id];
        observations[id] = Observation(epoch,session.batchIndex,uint64(block.number),uint64(block.timestamp));
        emit EarlyResultAccepted(id,epoch,session.batchIndex,hash,winner,uint8(phase));
    }

    function bettingWindow(uint256 id, uint64) external view override returns (bool allowed, uint256 version) {
        if (block.chainid != baseChainId || finalResults[id].status != 0) return (false,0);
        (uint256 phase,,,,PhysicsV2.State memory s) = _snapshot(id);
        uint8 rally = s.scoreA + s.scoreB;
        Round memory r = rounds[id][rally];
        version = (uint256(r.closeBlock) << 8) | rally;
        allowed = phase == 2 && s.mode == 1 && s.awaitingServe && r.resumeAt == s.resumeAt
            && r.closeBlock > block.number && hub.statusOf(address(game),Types.GLOBAL) == Types.Status.Active
            && r.stateHash == keccak256(abi.encode(s.seed,rally,s.resumeAt));
    }
}
