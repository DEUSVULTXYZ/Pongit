// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Delegatable} from "../../vendor/interlude/Delegatable.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {AuthorityControl as Control} from "./AuthorityControl.sol";
import {AuthorityActions} from "./AuthorityActions.sol";
import {AutonomousGameBase} from "./AutonomousGameBase.sol";
import {ContractLobby as Lobby} from "./ContractLobby.sol";
import {AuthorityStore as S} from "./AuthorityStore.sol";
import {PlayerIndex} from "./PlayerIndex.sol";
import {BaseAuthorization as Auth} from "./BaseAuthorization.sol";
import {IChaosProof, IMonadPressure} from "./ChaosProof.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../vendor/interlude/libraries/DelegatedLayout.sol";

interface IPreviousRating {
    function genesisTime() external view returns (uint256);
    function ratingOf(address player, uint8 mode) external view returns (AutonomousGameBase.Rating memory);
    function hub() external view returns (IInterludeHub);
}

/// Candidate only. Ship is gated on a qualified proof transport and a real full lifecycle rehearsal.
contract AutonomousArena is AutonomousGameBase {
    /// @custom:interlude global
    mapping(bytes32 => uint256) internal words;

    function _words() internal view override returns (mapping(bytes32 => uint256) storage) {
        return words;
    }
    AuthorityActions public immutable actions;
    enum Execution {
        Interlude,
        Recovery,
        Monad,
        Returning
    }
    address public immutable administrator;
    IChaosProof public immutable proofs;
    IPreviousRating public immutable previous;

    function market() public view returns (address) {
        return Control.state().market;
    }

    function pressureSource() public view returns (IMonadPressure) {
        return Control.state().pressureSource;
    }

    function financeSealed() public view returns (bool) {
        return Control.state().financeSealed;
    }

    function changedAt() public view returns (uint64) {
        return Control.state().changedAt;
    }

    function transitionReason() public view returns (bytes32) {
        return Control.state().reason;
    }
    bytes32 private constant ACTOR = keccak256("pongit.autonomous.command.actor");
    event ExecutionChanged(Execution previous, Execution next, uint256 generation, bytes32 reason, uint64 at);

    constructor(IInterludeHub h, address admin, IChaosProof verifier, IPreviousRating oldGame, AuthorityActions module_)
        AutonomousGameBase(h, address(oldGame) == address(0) ? block.timestamp : oldGame.genesisTime())
    {
        require(block.chainid == 10143 && admin != address(0) && address(verifier).code.length > 0, "candidate config");
        require(address(module_).code.length > 0, "actions module");
        actions = module_;
        DelegatedLayout.layout().owner = admin;
        administrator = admin;
        proofs = verifier;
        previous = oldGame;
        Control.state().execution = Control.Execution.Monad;
        Control.state().changedAt = uint64(block.timestamp);
        S.set(words, 100, 0, 0, 1);
    }

    receive() external payable {
        require(block.chainid == 10143, "base treasury");
    }

    function bindFinance(address market_, IMonadPressure source) external {
        require(
            msg.sender == administrator && !Control.state().financeSealed && market_.code.length > 0
                && address(source).code.length > 0,
            "finance binding"
        );
        Control.state().market = market_;
        Control.state().pressureSource = source;
        Control.state().financeSealed = true;
    }

    function generation() public view returns (uint256) {
        return S.generation(words);
    }

    function executionState() public view returns (Execution) {
        return Execution(uint8(Control.state().starting ? Control.Execution.Returning : Control.state().execution));
    }

    function _assertExecution() internal view override {
        if (isEphemeral()) {
            if (block.chainid != 4242 || Control.state().execution != Control.Execution.Interlude) revert EngineOnly();
        } else if (
            Control.state().execution != Control.Execution.Monad || Control.state().starting
                || hub.statusOf(address(this), Types.GLOBAL) != Types.Status.None
        ) {
            revert EngineOnly();
        }
    }

    function _clockLive() internal view override returns (bool) {
        return isEphemeral() || Control.state().execution == Control.Execution.Monad;
    }

    function _tickUs(uint256 id) internal view override returns (uint256) {
        return _get(id, 20) & 1 == 1 ? 300_000 : 10_000;
    }

    function _gameActor() internal view override returns (address actor) {
        bytes32 slot = ACTOR;
        uint256 stored;
        assembly { stored := tload(slot) }
        require(
            msg.sender == address(this) && stored != 0 && bytes4(uint32(stored >> 160)) == msg.sig, "use scoped command"
        );
        return address(uint160(stored));
    }

    function _allowed(bytes4 s) private pure returns (bool) {
        return s == AuthorityActions.queue.selector || s == AuthorityActions.cancelQueue.selector
            || s == AuthorityActions.queueHeartbeat.selector || s == AuthorityActions.createRoom.selector
            || s == AuthorityActions.joinRoom.selector || s == AuthorityActions.leaveRoom.selector
            || s == AuthorityActions.rejoinQueue.selector || s == AuthorityActions.acceptProposal.selector
            || s == AuthorityActions.declineProposal.selector || s == AuthorityActions.inviteSomeone.selector
            || s == AuthorityActions.inviteToRoom.selector || s == AuthorityActions.answerInvitation.selector
            || s == AuthorityActions.rematch.selector || s == AuthorityActions.blockPlayer.selector
            || s == this.input.selector || s == this.concede.selector;
    }

    function _dispatch(address actor, bytes calldata data) private returns (bytes memory) {
        require(data.length >= 4 && data.length <= 2048 && _allowed(bytes4(data[:4])), "game scope");
        bytes32 slot = ACTOR;
        uint256 prior;
        assembly { prior := tload(slot) }
        require(prior == 0, "nested command");
        uint256 stored = uint160(actor) | (uint256(uint32(bytes4(data[:4]))) << 160);
        assembly { tstore(slot, stored) }
        (bool ok, bytes memory result) = address(this).call(data);
        assembly { tstore(slot, 0) }
        if (!ok) assembly { revert(add(result, 32), mload(result)) }
        return result;
    }

    function command(uint256 expectedGeneration, bytes calldata data) external engine returns (bytes memory) {
        require(isEphemeral() && expectedGeneration == generation(), "command generation");
        return _dispatch(_actor(), data);
    }

    function relayCommand(
        Auth.Grant calldata grant,
        bytes calldata ownerSignature,
        bytes calldata data,
        uint256 nonce,
        uint64 deadline,
        bytes calldata signature
    ) external engine returns (bytes memory) {
        require(!isEphemeral(), "base only");
        address actor = Auth.consume(
            words, grant, ownerSignature, data, nonce, deadline, signature, hub.sessionEpochOf(grant.player)
        );
        return _dispatch(actor, data);
    }

    fallback() external payable {
        _forwardActions();
    }

    function assertExecution() external view {
        _assertExecution();
    }

    function stateOf(uint256 id) external view returns (PhysicsV2.State memory) {
        return _state(id);
    }

    function phaseOf(uint256 id) external view returns (uint256) {
        return _phase(id);
    }

    function admitProposal(uint256 id, uint256 room, address a, address b, uint8 mode, bool ranked, uint64 expires)
        external
    {
        require(msg.sender == address(this), "self only");
        _set(id, 20, (generation() << 1) | (isEphemeral() ? 0 : 1));
        _createMatch(Offer(id, bytes32(room), a, b, mode, ranked, expires, 4, bytes32(id)));
    }

    function _forwardActions() private {
        address target = address(actions);
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    function _finish(uint256 id, uint256 phase, address winner) internal override {
        super._finish(id, phase, winner);
        Lobby.finish(words, id, winner);
        if (phase == 3 && (_get(id, 0) & (1 << 160)) != 0) {
            PlayerIndex.add(words, address(uint160(_get(id, 0))), matchMode(id));
            PlayerIndex.add(words, address(uint160(_get(id, 1))), matchMode(id));
        }
    }

    function _startingRating(address player, uint8 mode) internal view override returns (Rating memory) {
        if (address(previous) == address(0)) return super._startingRating(player, mode);
        require(
            previous.hub().statusOf(address(previous), Types.GLOBAL) == Types.Status.None, "legacy rating not final"
        );
        Rating memory r = previous.ratingOf(player, mode);
        r.season = currentSeason();
        return r;
    }

    function importRating(address player, uint8 mode) external engine {
        require(mode < 2 && S.get(words, 2, uint160(player), mode) == 0, "rating exists");
        Rating memory r = _startingRating(player, mode);
        S.set(
            words,
            2,
            uint160(player),
            mode,
            uint256(r.elo) | (uint256(r.played) << 32) | (uint256(r.wins) << 64) | (uint256(r.season) << 96)
        );
        if (r.played > 0) PlayerIndex.add(words, player, mode);
    }

    function submitPressureProof(uint256, bytes calldata) external {
        _forwardActions();
    }

    function _verifiedPressure(uint256 id, uint8 rally, uint64 at) internal view override returns (Pressure memory p) {
        if (!Control.state().financeSealed) return p;
        if (!isEphemeral()) {
            (bool ready, IChaosProof.Checkpoint memory c) = Control.state().pressureSource.checkpoint(id, rally, at);
            return Pressure(ready, c.paidA, c.paidB, c.commitment);
        }
        if (S.get(words, 40, id, 0) != (uint256(rally) | (uint256(at) << 8))) return p;
        return Pressure(true, S.get(words, 40, id, 1), S.get(words, 40, id, 2), bytes32(S.get(words, 40, id, 3)));
    }

    function beginRecovery() external {
        _forwardActions();
    }

    function finishRecovery() external {
        _forwardActions();
    }

    function returnToInterlude() external payable {
        _forwardActions();
    }

    function confirmInterlude(uint256) external {
        _forwardActions();
    }

    function cancelRecovered(uint256 id) external {
        require(
            msg.sender == address(this) && block.chainid == 10143
                && Control.state().execution == Control.Execution.Recovery,
            "recovery only"
        );
        _finish(id, 4, address(0));
        _publish(id);
    }

    function _isSessionBlocked(bytes4 selector) internal view override returns (bool) {
        return selector == this.admitProposal.selector || selector == this.cancelRecovered.selector
            || selector == this.returnToInterlude.selector || selector == this.confirmInterlude.selector
            || selector == this.bindFinance.selector || selector == this.relayCommand.selector
            || super._isSessionBlocked(selector);
    }
}
