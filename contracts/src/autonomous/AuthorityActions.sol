// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {BaseAuthorization as Auth} from "./BaseAuthorization.sol";
import {PlayerIndex} from "./PlayerIndex.sol";
import {ContractLobby as Lobby} from "./ContractLobby.sol";
import {AuthorityStore as S} from "./AuthorityStore.sol";
import {AuthorityControl as Control} from "./AuthorityControl.sol";
import {IChaosProof, IMonadPressure} from "./ChaosProof.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../vendor/interlude/libraries/DelegatedLayout.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";

interface IAuthorityHost {
    function administrator() external view returns (address);
    function proofs() external view returns (IChaosProof);
    function hub() external view returns (IInterludeHub);
    function activeCount() external view returns (uint256);
    function stateOf(uint256 id) external view returns (PhysicsV2.State memory);
    function cancelRecovered(uint256 id) external;
    function assertExecution() external view;
    function admitProposal(uint256 id, uint256 room, address a, address b, uint8 mode, bool ranked, uint64 expires)
        external;
    function phaseOf(uint256 id) external view returns (uint256);
}

/// Fixed delegatecall module, selected in the constructor; no upgrade or admin setter.
contract AuthorityActions {
    mapping(bytes32 => uint256) private words; // Exact registered arena mapping, slot zero.
    bytes32 constant ACTOR = keccak256("pongit.autonomous.command.actor");

    function baseGrantDigest(Auth.Grant calldata grant) external view returns (bytes32) {
        return Auth.digest(Auth.grantHash(grant));
    }

    function baseCommandDigest(Auth.Grant calldata grant, bytes calldata data, uint256 nonce, uint64 deadline)
        external
        view
        returns (bytes32)
    {
        return Auth.digest(Auth.commandHash(grant, data, nonce, deadline));
    }

    function commandNonce(Auth.Grant calldata grant) external view returns (uint256) {
        return S.get(words, 60, uint256(Auth.grantHash(grant)), 0);
    }

    function participation(address player) external view returns (uint256) {
        return Lobby.occupancy(words, player);
    }

    function queuedPlayer(address player) external view returns (uint8 mode, uint64 since, uint64 expires) {
        return Lobby.queueOf(words, player);
    }

    function getRoom(uint256 id) external view returns (Lobby.Room memory) {
        return Lobby.room(words, id);
    }

    function getProposal(uint256 id) external view returns (Lobby.Proposal memory) {
        return Lobby.proposal(words, id);
    }

    function getInvitation(uint256 id) external view returns (Lobby.Invitation memory) {
        return Lobby.invitation(words, id);
    }

    function rankedPlayers(uint8 mode, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory players, uint256 total)
    {
        return PlayerIndex.page(words, mode, offset, limit);
    }
    modifier engine() {
        IAuthorityHost(address(this)).assertExecution();
        _;
    }

    function _gameActor() private view returns (address) {
        bytes32 slot = ACTOR;
        uint256 x;
        assembly { x := tload(slot) }
        require(msg.sender == address(this) && x != 0 && bytes4(uint32(x >> 160)) == msg.sig, "use scoped command");
        return address(uint160(x));
    }

    function queue(uint8 mode) external engine {
        Lobby.queue(words, _gameActor(), mode);
    }

    function queueHeartbeat() external engine {
        Lobby.queueHeartbeat(words, _gameActor());
    }

    function cancelQueue() external engine {
        Lobby.cancelQueue(words, _gameActor());
    }

    function matchmake(uint8 mode, uint256 budget) external engine returns (uint256) {
        return Lobby.matchmake(words, mode, budget);
    }

    function createRoom(uint8 mode) external engine returns (uint256) {
        return Lobby.createRoom(words, _gameActor(), mode, false);
    }

    function joinRoom(uint256 id) external engine {
        Lobby.join(words, _gameActor(), id);
    }

    function leaveRoom() external engine {
        Lobby.leave(words, _gameActor());
    }

    function rejoinQueue(uint256 id) external engine {
        Lobby.rejoin(words, _gameActor(), id);
    }

    function blockPlayer(address other, bool value) external engine {
        Lobby.blockPlayer(words, _gameActor(), other, value);
    }

    function propose(uint256 roomId) external engine returns (uint256) {
        return Lobby.propose(words, roomId, 20);
    }

    function expireProposal(uint256 id) external engine {
        Lobby.expire(words, id);
    }

    function expireRoom(uint256 id) external engine {
        Lobby.expireRoom(words, id);
    }

    function _accept(address actor, uint256 id) private {
        if (!Lobby.accept(words, actor, id)) return;
        Lobby.Proposal memory p = Lobby.proposal(words, id);
        Lobby.Room memory r = Lobby.room(words, p.room);
        IAuthorityHost(address(this)).admitProposal(id, p.room, p.a, p.b, r.mode, r.ranked, p.expires);
    }

    function acceptProposal(uint256 id) external engine {
        _accept(_gameActor(), id);
    }

    function declineProposal(uint256 id) external engine {
        Lobby.decline(words, _gameActor(), id);
    }

    function inviteToRoom(uint256 id, address recipient) external engine returns (uint256) {
        return Lobby.invite(words, _gameActor(), id, recipient, 600);
    }

    function inviteSomeone(address recipient, uint8 mode) external engine returns (uint256) {
        address actor = _gameActor();
        uint256 id = Lobby.occupancy(words, actor);
        if (id == 0) id = Lobby.createRoom(words, actor, mode, false);
        Lobby.Room memory r = Lobby.room(words, id);
        require(r.mode == mode && !r.ranked, "invitation mode");
        return Lobby.invite(words, actor, id, recipient, 600);
    }

    function answerInvitation(uint256 id, bool yes) external engine {
        address actor = _gameActor();
        uint256 p = Lobby.answerInvite(words, actor, id, yes);
        if (p != 0) {
            Lobby.Proposal memory proposal_ = Lobby.proposal(words, p);
            if (actor == proposal_.a || actor == proposal_.b) _accept(actor, p);
        }
    }

    function rematch(uint256 source) external engine returns (uint256) {
        require(IAuthorityHost(address(this)).phaseOf(source) == 3, "completed source required");
        address actor = _gameActor();
        address a = address(uint160(S.get(words, 0, source, 0)));
        address b = address(uint160(S.get(words, 0, source, 1)));
        require(actor == a || actor == b, "source participant");
        uint256 r = S.get(words, 0, source, 11);
        Lobby.Room memory v = Lobby.room(words, r);
        require(
            v.members.length == 2 && Lobby.occupancy(words, a) == r && Lobby.occupancy(words, b) == r,
            "rival unavailable"
        );
        uint256 id = Lobby.propose(words, r, 60);
        _accept(actor, id);
        return id;
    }
    event ExecutionChanged(
        Control.Execution previous, Control.Execution next, uint256 generation, bytes32 reason, uint64 at
    );

    function _transition(Control.Execution next, bytes32 reason) private {
        Control.Execution old = (Control.state().starting ? Control.Execution.Returning : Control.state().execution);
        Control.state().execution = next;
        Control.state().starting = false;
        Control.state().changedAt = uint64(block.timestamp);
        Control.state().reason = reason;
        emit ExecutionChanged(old, next, S.generation(words), reason, Control.state().changedAt);
    }

    function submitPressureProof(uint256 id, bytes calldata proof) external engine {
        require(
            (block.chainid == 4242) && Control.state().financeSealed && IAuthorityHost(address(this)).phaseOf(id) == 2,
            "proof context"
        );
        (, uint8 rally, uint64 at) = _boundary(id);
        IChaosProof.Checkpoint memory p = IAuthorityHost(address(this)).proofs()
            .verify(
                IChaosProof.Boundary(10143, address(this), Control.state().market, S.generation(words), id, rally, at),
                proof
            );
        require(
            p.commitment != 0 && p.sourceHash != 0 && p.sourceBlock > 0 && p.paidA <= type(uint128).max
                && p.paidB <= type(uint128).max,
            "proof result"
        );
        uint256 marker = uint256(rally) | (uint256(at) << 8);
        uint256 old = S.get(words, 40, id, 0);
        if (old == marker) {
            require(
                S.get(words, 40, id, 1) == p.paidA && S.get(words, 40, id, 2) == p.paidB
                    && bytes32(S.get(words, 40, id, 3)) == p.commitment,
                "checkpoint immutable"
            );
            return;
        }
        S.set(words, 40, id, 0, marker);
        S.set(words, 40, id, 1, p.paidA);
        S.set(words, 40, id, 2, p.paidB);
        S.set(words, 40, id, 3, uint256(p.commitment));
    }

    function _boundary(uint256 id) private view returns (uint8 mode, uint8 rally, uint64 at) {
        mode = uint8(S.get(words, 0, id, 0) >> 168);
        require(mode == 1 && IAuthorityHost(address(this)).stateOf(id).awaitingServe, "Chaos pause required");
        rally = IAuthorityHost(address(this)).stateOf(id).scoreA + IAuthorityHost(address(this)).stateOf(id).scoreB;
        at = IAuthorityHost(address(this)).stateOf(id).resumeAt;
    }

    function beginRecovery() external {
        require(block.chainid == 10143 && Control.state().execution != Control.Execution.Monad, "recovery state");
        Types.Session memory d = IAuthorityHost(address(this)).hub().sessionOf(address(this), Types.GLOBAL);
        require(d.status != Types.Status.Challenged, "contested delegation");
        if (Control.state().execution == Control.Execution.Recovery) return;
        if (d.status == Types.Status.Active) {
            require(
                block.timestamp > d.expiresAt || block.timestamp > uint256(d.lastCommitAt) + d.maxBatchInterval,
                "no protocol outage"
            );
            IAuthorityHost(address(this)).hub().forceClose(address(this), Types.GLOBAL);
        }
        _transition(Control.Execution.Recovery, keccak256("DELEGATION_UNAVAILABLE"));
    }

    function finishRecovery() external {
        require(block.chainid == 10143 && Control.state().execution == Control.Execution.Recovery, "recovery state");
        if (IAuthorityHost(address(this)).hub().statusOf(address(this), Types.GLOBAL) == Types.Status.Exiting) {
            IAuthorityHost(address(this)).hub().releaseStake(address(this), Types.GLOBAL);
        }
        require(
            IAuthorityHost(address(this)).hub().statusOf(address(this), Types.GLOBAL) == Types.Status.None,
            "recovery not final"
        );
        for (uint256 i; i < 2; i++) {
            uint256 id = Lobby.slot(words, i);
            if (id != 0 && IAuthorityHost(address(this)).phaseOf(id) == 2) {
                IAuthorityHost(address(this)).cancelRecovered(id);
            }
        }
        require(IAuthorityHost(address(this)).activeCount() == 0, "unresolved active state");
        S.set(words, 100, 0, 0, S.generation(words) + 1);
        _transition(Control.Execution.Monad, keccak256("RECOVERY_FINALIZED"));
    }

    function returnToInterlude() external payable {
        require(
            block.chainid == 10143 && msg.sender == IAuthorityHost(address(this)).administrator()
                && Control.state().execution == Control.Execution.Monad && !Control.state().starting,
            "administrator return"
        );
        require(
            IAuthorityHost(address(this)).activeCount() == 0 && Lobby.slot(words, 0) == 0 && Lobby.slot(words, 1) == 0,
            "drain matches first"
        );
        require(
            Control.state().financeSealed && IAuthorityHost(address(this)).proofs().supported(),
            "Chaos proof not qualified"
        );
        require(
            IAuthorityHost(address(this)).hub().statusOf(address(this), Types.GLOBAL) == Types.Status.None,
            "delegation active"
        );
        S.set(words, 100, 0, 0, S.generation(words) + 1);
        // The hosted engine pins this value when opening the delegation. On Monad,
        // starting keeps admissions closed until confirmInterlude. Emit only the
        // public Returning state here, never a premature Interlude transition.
        Control.state().execution = Control.Execution.Interlude;
        Control.state().starting = true;
        Control.state().changedAt = uint64(block.timestamp);
        Control.state().reason = keccak256("ADMIN_RETURN_REQUESTED");
        DelegatedLayout.Layout storage l = DelegatedLayout.layout();
        IAuthorityHost(address(this)).hub().openDelegation{value: msg.value}(
            Types.GLOBAL, l.globalSlots, l.globalMappingBases, address(0), l.owner, l.minStake
        );
        emit ExecutionChanged(
            Control.Execution.Monad,
            Control.Execution.Returning,
            S.generation(words),
            Control.state().reason,
            Control.state().changedAt
        );
    }

    function confirmInterlude(uint256 expectedEpoch) external {
        require(
            block.chainid == 10143 && msg.sender == IAuthorityHost(address(this)).administrator()
                && Control.state().starting,
            "startup check"
        );
        Types.Session memory d = IAuthorityHost(address(this)).hub().sessionOf(address(this), Types.GLOBAL);
        require(
            d.status == Types.Status.Active && d.epoch == expectedEpoch && d.expiresAt > block.timestamp + 60,
            "delegation mismatch"
        );
        _transition(Control.Execution.Interlude, keccak256("HOSTED_EPOCH_VERIFIED"));
    }
}
