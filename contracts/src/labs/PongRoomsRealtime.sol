// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PongInterludeRoomsChaos} from "./PongInterludeRoomsChaos.sol";
import {RealtimeChaosRules} from "./PhysicsRealtimeChaos.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../vendor/interlude/libraries/DelegatedLayout.sol";
import {Session} from "../../vendor/interlude/libraries/Session.sol";

/// @notice Testnet bridge queues confirmed gross stakes without pausing either mode.
/// The bridge cannot choose scores, transfer funds or resize during a rally.
contract PongRoomsRealtime is PongInterludeRoomsChaos {
    error BaseOperatorOnly();
    error ActivePublishedMatches();
    error DelegationPending();
    address public immutable pressureSigner;
    address public immutable operator;
    address public immutable previousGame;
    RealtimeChaosRules public immutable realtimeRules;
    bytes32 private immutable pressureDomain;
    struct LivePressure {
        uint256 matchId; uint256 epoch; bytes32 seed; uint8 rally;
        uint128 paidA; uint128 paidB; uint64 sourceBlock; bytes32 checkpoint; uint64 expires;
    }
    bytes32 private constant PRESSURE_TYPEHASH = keccak256("LivePressure(uint256 matchId,uint256 epoch,bytes32 seed,uint8 rally,uint128 paidA,uint128 paidB,uint64 sourceBlock,bytes32 checkpoint,uint64 expires)");
    event PressureQueued(uint256 indexed id, uint64 sourceBlock, bytes32 checkpoint, uint256 paidA, uint256 paidB);

    constructor(IInterludeHub h, address admission, address bridge, address ops, address previous)
        PongInterludeRoomsChaos(h, admission)
    {
        require(block.chainid == 10143 && bridge != address(0) && ops != address(0), "testnet roles");
        pressureSigner = bridge; operator = ops; previousGame = previous;
        realtimeRules = new RealtimeChaosRules();
        pressureDomain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("PONGIT Realtime Pressure"), keccak256("1"), block.chainid, address(this)));
    }
    function RULES_VERSION() public pure override returns (uint256) { return 5; }
    function pressureDigest(LivePressure calldata p) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", pressureDomain, keccak256(abi.encode(PRESSURE_TYPEHASH, p))));
    }
    function submitLivePressure(LivePressure calldata p, bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL) {
        PhysicsV2.State memory s = _state(p.matchId);
        if (_phase(p.matchId) != 2 || s.mode != 1 || p.seed != s.seed || p.epoch != _sessionEpoch()
            || p.rally > s.scoreA + s.scoreB || p.sourceBlock == 0 || p.checkpoint == bytes32(0)
            || p.expires <= block.timestamp || p.expires > block.timestamp + 30) revert InvalidPressure();
        if (Session.recover(pressureDigest(p), signature) != pressureSigner) revert InvalidPressure();
        uint256 old = _get(p.matchId, 17);
        if (p.paidA < uint128(old) || p.paidB < uint128(old >> 128) || p.sourceBlock < _get(p.matchId, 16)) revert InvalidPressure();
        if (p.sourceBlock == _get(p.matchId, 16)) {
            if (old != (uint256(p.paidA) | (uint256(p.paidB) << 128)) || bytes32(_get(p.matchId, 18)) != p.checkpoint) revert InvalidPressure();
            return;
        }
        // Advance with the OLD queued totals first. A late checkpoint cannot
        // retrospectively change a collision or point processed during catch-up.
        if (!_advance(p.matchId, false) || _phase(p.matchId) != 2) { _publish(p.matchId); return; }
        _set(p.matchId, 16, p.sourceBlock);
        _set(p.matchId, 17, uint256(p.paidA) | (uint256(p.paidB) << 128));
        _set(p.matchId, 18, uint256(p.checkpoint));
        emit PressureQueued(p.matchId, p.sourceBlock, p.checkpoint, p.paidA, p.paidB);
        _publish(p.matchId);
    }
    function queuedPressure(uint256 id) external view returns (uint256 a, uint256 b, uint64 sourceBlock, bytes32 checkpoint) {
        uint256 p = _get(id, 17); return (uint128(p), uint128(p >> 128), uint64(_get(id, 16)), bytes32(_get(id, 18)));
    }
    function _advanceState(uint256 id, PhysicsV2.State memory s, uint64 target, bool mayResume)
        internal override returns (bool complete)
    {
        uint256 p = _get(id, 17); uint8 applied;
        if (s.mode == 0) (s, complete) = physicsRules.advance(s, target, 128);
        else (s, complete, applied) = realtimeRules.advance(s, target, 128, uint128(p), uint128(p >> 128));
        _save(id, s);
        if (applied > 0) {
            _set(id, 14, uint128(p)); _set(id, 15, uint128(p >> 128));
            emit RallyResumed(id, applied, uint128(p), uint128(p >> 128), s.halfA, s.halfB, bytes32(_get(id, 18)));
        }
        if (s.finished) _finish(id, 3, s.scoreA == 7 ? address(uint160(_get(id, 0))) : address(uint160(_get(id, 1))));
    }
    function _verifiedPressure(uint256, uint8, uint64) internal pure override returns (Pressure memory p) { return p; }
    function _sessionEpoch() private view returns (uint256) { return hub.sessionOf(address(this), Types.GLOBAL).epoch; }
    function _finish(uint256 id, uint256 phase, address winner) internal override {
        _set(id, 19, block.timestamp); super._finish(id, phase, winner);
    }
    function _resultHash(uint256 id, bytes32 hash) internal view override returns (bytes32) {
        return keccak256(abi.encode(hash, _get(id, 19)));
    }
    function finishedAt(uint256 id) external view returns (uint64) { return uint64(_get(id, 19)); }
    function _startingRating(address player, uint8 mode) internal view override returns (Rating memory r) {
        if (previousGame == address(0)) return super._startingRating(player, mode);
        r = PongInterludeRoomsChaos(previousGame).ratingOf(player, mode); r.season = currentSeason();
    }
    function closeEngine() external {
        if (block.chainid != 10143 || msg.sender != operator) revert BaseOperatorOnly();
        if (activeCount() != 0) revert ActivePublishedMatches(); hub.closeDelegation(Types.GLOBAL);
    }
    function renewEngine() external payable {
        if (block.chainid != 10143 || msg.sender != operator) revert BaseOperatorOnly();
        if (hub.statusOf(address(this), Types.GLOBAL) != Types.Status.None) revert DelegationPending();
        DelegatedLayout.Layout storage l = DelegatedLayout.layout();
        hub.openDelegation{value:msg.value}(Types.GLOBAL,l.globalSlots,l.globalMappingBases,address(0),l.owner,l.minStake);
    }
    function _isSessionBlocked(bytes4 selector) internal view virtual override returns (bool) {
        return selector == this.closeEngine.selector || selector == this.renewEngine.selector || selector == this.submitLivePressure.selector || super._isSessionBlocked(selector);
    }
}

contract PongRoomsRealtimeRelease is PongRoomsRealtime {
    constructor(IInterludeHub h) PongRoomsRealtime(h,
        0x6e0EbC79d80a186A639843C4059f421D634C3d73, 0x15E6B4C9fecAC754cE2D9052b6060DD5920e7659,
        0x369158Ac444278541322643E46e0D5b45ac21C4C, 0xfd1693294fED77304662f08e827b043B0Ba386A3) {}
}
