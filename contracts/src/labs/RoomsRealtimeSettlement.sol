// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {RoomsEarlySettlement} from "./RoomsEarlySettlement.sol";
import {PongInterludeRoomsChaos} from "./PongInterludeRoomsChaos.sol";
import {PongRoomsRealtime} from "./PongRoomsRealtime.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// @notice Published participation opens continuous betting. The published end
/// timestamp excludes/refunds bets that arrived after the live result was known.
contract RoomsRealtimeSettlement is RoomsEarlySettlement {
    mapping(uint256 => uint64) public bettingCutoff;
    constructor(PongInterludeRoomsChaos g) RoomsEarlySettlement(g) {
        require(g.RULES_VERSION() == 5, "realtime rules required");
    }
    function openRound(uint256 id) public override onlyBase {
        require(finalResults[id].status == 0, "result already accepted");
        (uint256 phase,,,,PhysicsV2.State memory s) = _snapshot(id);
        require(phase == 2 && s.mode == 1, "no live Chaos match");
        Types.Session memory session = hub.sessionOf(address(game), Types.GLOBAL);
        require(session.status == Types.Status.Active && session.epoch > 0, "engine unavailable");
        require(matchEpoch[id] == 0 || matchEpoch[id] == session.epoch, "match epoch changed");
        matchEpoch[id] = session.epoch;
    }
    function bettingWindow(uint256 id, uint64) external view override returns (bool allowed, uint256 version) {
        if (block.chainid != baseChainId || finalResults[id].status != 0) return (false, 0);
        (uint256 phase,,,,PhysicsV2.State memory s) = _snapshot(id);
        Types.Session memory session = hub.sessionOf(address(game), Types.GLOBAL);
        version = (matchEpoch[id] << 8) | 5;
        allowed = phase == 2 && s.mode == 1 && matchEpoch[id] > 0 && session.epoch == matchEpoch[id]
            && session.status == Types.Status.Active && session.expiresAt > block.timestamp;
    }
    function finalizeResult(uint256 id) public override onlyBase {
        uint64 cutoff = PongRoomsRealtime(address(game)).finishedAt(id);
        require(cutoff > 0 && cutoff <= block.timestamp, "result timestamp pending");
        super.finalizeResult(id);
        bettingCutoff[id] = cutoff;
    }
}
