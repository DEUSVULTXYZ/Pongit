// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AutonomousGameBase} from "../autonomous/AutonomousGameBase.sol";
import {IndependentArenaInterludeSurface} from "./IndependentArenaInterludeSurface.sol";
import {ArenaPressure} from "./ArenaPressure.sol";
import {ArenaAuthorizations} from "./ArenaAuthorizations.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../vendor/interlude/libraries/DelegatedLayout.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// One match per delegation. Shared participation and ratings are never delegated here.
/// All mutable game fields occupy the single registered mapping at slot zero.
contract IndependentArena is AutonomousGameBase, IndependentArenaInterludeSurface {
    error InvalidLifecycle();
    /// @custom:interlude global
    mapping(bytes32 => uint256) public words;
    T.Binding private binding;
    address public immutable lobby;
    address public immutable pressureSigner;
    bytes32 private immutable pressureDomain;
    bytes32 private immutable revokeDomain;
    event PressureAttested(uint256 indexed matchId, uint8 rally, uint64 sourceBlock, bytes32 checkpoint, uint256 paidA, uint256 paidB);
    event ArenaPermissionRevoked(address indexed player, uint256 indexed epoch, uint256 indexed matchId);

    constructor(IInterludeHub h, address lobby_, address bridge) AutonomousGameBase(h, block.timestamp) {
        _registerInterludeSurface();
        require(block.chainid == 10143 && lobby_ != address(0) && bridge != address(0), "testnet identities");
        lobby = lobby_; pressureSigner = bridge;
        DelegatedLayout.layout().owner = lobby_;
        pressureDomain = _domain("PONGIT Arena Pressure");
        revokeDomain = _domain("PONGIT Arena Revocation");
    }
    function _domain(string memory name) private view returns (bytes32) {
        return keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)), keccak256("1"), uint256(10143), address(this)));
    }
    function _words() internal view override returns (mapping(bytes32 => uint256) storage) { return words; }
    function _assertExecution() internal view override { require(isEphemeral() && binding.epoch != 0, "engine only"); }
    function _clockLive() internal view override returns (bool) { return isEphemeral(); }
    function _tickUs(uint256) internal pure override returns (uint256) { return TICK_US; }
    function _rateResult(uint256, address, address, address) internal pure override {}
    function ratingOf(address, uint8) public pure override returns (Rating memory) {
        revert("read the shared leaderboard");
    }
    function boundMatch() external view returns (T.Binding memory) { return binding; }

    function prepare(T.Binding calldata next) external {
        require(block.chainid == 10143 && msg.sender == lobby, "lobby only");
        require(hub.statusOf(address(this), Types.GLOBAL) == Types.Status.None, InvalidLifecycle());
        require(next.keyA != address(0) && next.keyB != address(0) && next.keyA != next.keyB, InvalidLifecycle());
        require(next.expiresA > block.timestamp && next.expiresB > block.timestamp, InvalidLifecycle());
        require(binding.id == 0 || activeCount() == 0, InvalidLifecycle());
        binding = next; binding.epoch = 0; binding.preparedBlock = uint64(block.number);
        _createMatch(Offer(next.id, bytes32(next.room), next.a, next.b, next.mode, next.ranked,
            uint64(block.timestamp + 30 minutes), RULES_VERSION, bytes32(0)));
    }
    function openEngine() external payable {
        require(block.chainid == 10143 && msg.sender == lobby && binding.id != 0, "lobby only");
        require(binding.epoch == 0 && binding.preparedBlock < block.number, InvalidLifecycle());
        require(binding.expiresA > block.timestamp && binding.expiresB > block.timestamp, InvalidLifecycle());
        DelegatedLayout.Layout storage l = DelegatedLayout.layout();
        hub.openDelegation{value:msg.value}(Types.GLOBAL, l.globalSlots, l.globalMappingBases, address(0), lobby, l.minStake);
        binding.epoch = hub.sessionOf(address(this), Types.GLOBAL).epoch;
        require(binding.epoch != 0, InvalidLifecycle());
    }
    function closeEngine() external {
        require(block.chainid == 10143 && msg.sender == lobby, InvalidLifecycle());
        require(_phase(binding.id) >= 3 || block.timestamp >= hub.sessionOf(address(this),Types.GLOBAL).expiresAt, InvalidLifecycle());
        hub.closeDelegation(Types.GLOBAL);
    }
    /// Called only after the hub released all challenge rights. No partial live result is invented.
    function cancelRecovered() external {
        require(block.chainid == 10143 && msg.sender == lobby, "lobby only");
        require(hub.statusOf(address(this), Types.GLOBAL) == Types.Status.None, InvalidLifecycle());
        if (_phase(binding.id) == 2) { _finish(binding.id, 4, address(0)); _publish(binding.id); }
    }
    function _gameActor() internal view override returns (address) {
        return ArenaAuthorizations.actor(words,binding,_actor());
    }
    function revocationDigest(address player, uint64 deadline) public view returns (bytes32) {
        return ArenaAuthorizations.revokeDigest(revokeDomain,binding,player,ArenaAuthorizations.revision(words,binding,player),deadline);
    }
    function revokeActive(address player, uint64 deadline, bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL) {
        ArenaAuthorizations.revoke(words,revokeDomain,binding,player,deadline,signature);
    }
    function authorizationRevision(address player) external view returns(uint256) {
        return ArenaAuthorizations.revision(words,binding,player);
    }
    function renewalDigest(ArenaAuthorizations.Renewal calldata r) external view returns(bytes32) {
        return ArenaAuthorizations.renewalDigest(revokeDomain,r);
    }
    function renewActive(ArenaAuthorizations.Renewal calldata r,bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL) {
        require(_phase(binding.id)==2,"match ended");
        ArenaAuthorizations.renew(words,revokeDomain,binding,r,signature);
    }
    function pressureDigest(ArenaPressure.Attestation calldata p) public view returns (bytes32) {
        return ArenaPressure.digest(pressureDomain,p);
    }
    function submitPressure(ArenaPressure.Attestation calldata p, bytes calldata signature) external engine whenNotDelegated(Types.GLOBAL) {
        require(p.epoch == binding.epoch && p.matchId == binding.id, "pressure epoch");
        ArenaPressure.submit(words,pressureDomain,pressureSigner,p,signature);
    }
    function _verifiedPressure(uint256 id, uint8 rally, uint64 at) internal view override returns (Pressure memory p) {
        uint256 m = _get(id,16);
        if (uint8(m) != rally || uint64(m >> 8) != at || uint64(m >> 72) <= block.timestamp) return p;
        uint256 total = _get(id,17);
        return Pressure(true,uint128(total),uint128(total>>128),bytes32(_get(id,18)));
    }
    function publishedResult() external view returns (T.Result memory r) {
        PhysicsV2.State memory s = _state(binding.id);
        uint256 m = _get(binding.id,0); uint256 w = (m >> 166) & 3;
        return T.Result(address(this), binding.epoch, binding.id, binding.a, binding.b,
            w == 1 ? binding.a : w == 2 ? binding.b : address(0), binding.mode, binding.ranked,
            uint8(_phase(binding.id)),s.scoreA,s.scoreB,bytes32(_get(binding.id,9)));
    }
    function _isSessionBlocked(bytes4 s) internal view override returns (bool) {
        return s == this.prepare.selector || s == this.openEngine.selector || s == this.closeEngine.selector
            || s == this.cancelRecovered.selector || super._isSessionBlocked(s);
    }
}
