// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ContractLobby as L, ILobbyRatings} from "../autonomous/ContractLobby.sol";
import {AuthorityStore as S} from "../autonomous/AuthorityStore.sol";
import {ArcadeFamily} from "./ArcadeFamily.sol";
import {IndependentArena} from "./IndependentArena.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {PublishedRatings} from "./PublishedRatings.sol";
import {IndependentSocial} from "./IndependentSocial.sol";
import {InvitationIndex} from "./InvitationIndex.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// Monad owns admission, participation and arena allocation. Keepers only trigger rules.
contract IndependentLobby is EIP712, ILobbyRatings {
    mapping(bytes32 => uint256) private words;
    ArcadeFamily public immutable family;
    IInterludeHub public immutable hub;
    address public immutable setupOwner;
    address public immutable pressureSigner;
    PublishedRatings public ratings;
    bool public setupSealed;
    IndependentArena[] private arenas;
    mapping(address => bool) public registeredArena;
    mapping(uint256 => address) public arenaOf;
    mapping(bytes32 => uint256) public commandNonces;
    bytes32 private constant COMMAND = keccak256("LobbyCommand(bytes32 grantHash,bytes32 dataHash,uint256 nonce,uint64 deadline)");
    bytes32 private constant ACTOR = keccak256("pongit.independent.lobby.actor");
    event ArenaRegistered(address indexed arena, uint256 index);
    event ArenaAssigned(uint256 indexed id, address indexed arena, uint256 room);
    event ArenaOpened(uint256 indexed id, address indexed arena, uint256 epoch);
    event ArenaClosing(uint256 indexed id, address indexed arena, uint256 epoch);
    event MatchReleased(uint256 indexed id, address indexed arena, bytes32 resultHash);

    constructor(ArcadeFamily f, IInterludeHub h, address admin, address bridge) EIP712("PONGIT Independent Lobby","1") {
        require(block.chainid == 10143 && address(f).code.length > 0 && address(h).code.length > 0
            && admin != address(0) && bridge != address(0), "identities");
        family = f; hub = h; setupOwner = admin; pressureSigner = bridge;
        S.set(words,100,0,0,1);
    }
    function bindRatings(PublishedRatings r) external {
        require(msg.sender == setupOwner && !setupSealed && address(ratings) == address(0) && r.lobby() == address(this), "setup only");
        ratings = r;
    }
    /// Registration is setupSealed before public admission. The deployment audit pins bytecode.
    function addArena(IndependentArena a) external {
        require(msg.sender == setupOwner && !setupSealed && arenas.length < 16 && !registeredArena[address(a)], "setup only");
        require(a.lobby() == address(this) && a.owner() == address(this) && address(a.hub()) == address(hub)
            && a.pressureSigner() == pressureSigner && !a.isEphemeral(), "arena configuration");
        require(hub.statusOf(address(a),Types.GLOBAL) == Types.Status.None, "arena already delegated");
        registeredArena[address(a)] = true; arenas.push(a); emit ArenaRegistered(address(a),arenas.length-1);
    }
    function seal() external {
        require(msg.sender == setupOwner && !setupSealed && arenas.length >= 3 && ratings.migrationSealed(), "setup incomplete");
        setupSealed = true;
    }
    function arenaPage() external view returns (IndependentArena[] memory) { return arenas; }
    function ratingOf(address p, uint8 mode) external view returns (Rating memory) { return ratings.ratingOf(p,mode); }
    function occupancy(address p) external view returns (uint256) { return L.occupancy(words,p); }
    function queueOf(address p) external view returns (uint8,uint64,uint64) { return L.queueOf(words,p); }
    function queueProgress(uint8 mode) external view returns(uint256,uint256,uint256,uint256) { return L.queueProgress(words,mode); }
    function room(uint256 id) external view returns (L.Room memory) { return L.room(words,id); }
    function proposal(uint256 id) external view returns (L.Proposal memory) { return L.proposal(words,id); }
    function invitation(uint256 id) external view returns (L.Invitation memory) { return L.invitation(words,id); }
    function invitationPage(address player,bool sent,uint256 offset,uint256 limit) external view returns(uint256[] memory,uint256) {
        return InvitationIndex.page(words,player,sent,offset,limit);
    }
    function slot(uint256 i) external view returns (uint256) { return L.slot(words,i); }
    function activeMatchOf(address p) external view returns (uint256) { return S.get(words,1,uint160(p),0); }
    function commandDigest(bytes32 grantHash, bytes memory data, uint256 nonce, uint64 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(COMMAND,grantHash,keccak256(data),nonce,deadline)));
    }
    function relay(address player, bytes calldata data, uint256 nonce, uint64 deadline, bytes calldata signature) external returns (bytes memory) {
        require(block.chainid == 10143 && setupSealed && data.length >= 4 && _storedActor() == address(0), "lobby unavailable");
        require(_allowed(bytes4(data[:4])), "arcade scope");
        ArcadeFamily.Grant memory g = family.grantOf(player);
        require(g.key != address(0) && deadline >= block.timestamp && deadline <= g.expires, "arcade session expired or revoked");
        bytes32 hash = family.grantDigest(g);
        require(nonce == commandNonces[hash], "command nonce");
        require(ECDSA.recover(commandDigest(hash,data,nonce,deadline),signature) == g.key, "arcade signature");
        commandNonces[hash]++;
        bytes32 at = ACTOR; assembly { tstore(at, player) }
        (bool ok,bytes memory out) = address(this).call(data);
        assembly { tstore(at, 0) }
        if (!ok) assembly { revert(add(out,32),mload(out)) }
        return out;
    }
    function _storedActor() private view returns (address actor) { bytes32 at = ACTOR; assembly { actor := tload(at) } }
    function _actor() private view returns (address actor) {
        require(msg.sender == address(this), "signed arcade command required"); actor = _storedActor(); require(actor != address(0), "actor");
    }
    function _allowed(bytes4 s) private pure returns (bool) {
        return s == this.queue.selector || s == this.queueHeartbeat.selector || s == this.cancelQueue.selector
            || s == this.createRoom.selector || s == this.joinRoom.selector || s == this.leaveRoom.selector
            || s == this.rejoinQueue.selector || s == this.blockPlayer.selector || s == this.acceptProposal.selector
            || s == this.declineProposal.selector || s == this.inviteToRoom.selector || s == this.inviteSomeone.selector
            || s == this.answerInvitation.selector || s == this.rematch.selector || s == this.cancelAdmission.selector;
    }
    function queue(uint8 mode) external { require(ratings.buildGeneration() == 0, "ranking correction in progress"); L.queue(words,_actor(),mode); }
    function queueHeartbeat() external { L.queueHeartbeat(words,_actor()); }
    function cancelQueue() external { L.cancelQueue(words,_actor()); }
    function createRoom(uint8 mode) external returns (uint256) { return L.createRoom(words,_actor(),mode,false); }
    function joinRoom(uint256 id) external { L.join(words,_actor(),id); }
    function leaveRoom() external { L.leave(words,_actor()); }
    function rejoinQueue(uint256 id) external { L.rejoin(words,_actor(),id); }
    function blockPlayer(address other, bool value) external { L.blockPlayer(words,_actor(),other,value); }
    function matchmake(uint8 mode, uint256 budget) external returns (uint256) {
        require(setupSealed && ratings.buildGeneration() == 0, "ranking unavailable"); return L.matchmake(words,mode,budget);
    }
    function propose(uint256 id) external returns (uint256) { require(setupSealed, "setup"); return L.propose(words,id,20); }
    function expireProposal(uint256 id) external { L.expire(words,id); }
    function expireRoom(uint256 id) external { L.expireRoom(words,id); }
    function acceptProposal(uint256 id) external { IndependentSocial.accept(words,family,_actor(),id); }
    function declineProposal(uint256 id) external { L.decline(words,_actor(),id); }
    function inviteToRoom(uint256 id,address recipient) external returns(uint256) {
        return IndependentSocial.inviteToRoom(words,family,_actor(),id,recipient);
    }
    function inviteSomeone(address recipient,uint8 mode) external returns(uint256) {
        return IndependentSocial.inviteSomeone(words,family,_actor(),recipient,mode);
    }
    function answerInvitation(uint256 id,bool yes) external { IndependentSocial.answer(words,family,_actor(),id,yes); }
    function rematch(uint256 source) external returns(uint256) {
        return IndependentSocial.rematch(words,family,ratings,_actor(),source);
    }
    function _idle(IndependentArena a) private view returns (bool) {
        if (hub.statusOf(address(a),Types.GLOBAL) != Types.Status.None) return false;
        T.Binding memory b = a.boundMatch();
        if (b.id == 0) return true;
        if (b.epoch == 0) return L.proposal(words,b.id).status == 3;
        return ratings.indexOf(b.id) != 0 && ratings.entry(b.id).finality;
    }
    /// Deterministic oldest accepted proposal and first genuinely released arena.
    function assignNext() external returns (address chosen) {
        require(setupSealed, "setup"); uint256 id;
        for (uint256 i; i < 2; i++) {
            uint256 candidate = L.slot(words,i);
            if (candidate != 0 && L.proposal(words,candidate).status == 2 && arenaOf[candidate] == address(0)
                && (id == 0 || candidate < id)) id = candidate;
        }
        if (id == 0) return address(0);
        L.Proposal memory p = L.proposal(words,id); L.Room memory r = L.room(words,p.room);
        ArcadeFamily.Grant memory a = family.grantOf(p.a); ArcadeFamily.Grant memory b = family.grantOf(p.b);
        require(a.key != address(0) && b.key != address(0), "renew arcade authorization");
        require(S.get(words,74,id,0)==uint256(family.grantDigest(a)) && S.get(words,74,id,1)==uint256(family.grantDigest(b)),
            "acceptance authorization changed");
        for (uint256 i; i < arenas.length; i++) {
            if (_idle(arenas[i])) { chosen = address(arenas[i]); break; }
        }
        if (chosen == address(0)) return chosen;
        IndependentArena(chosen).prepare(T.Binding(id,p.room,p.a,p.b,a.key,b.key,a.expires,b.expires,r.mode,r.ranked,0,0));
        arenaOf[id] = chosen; emit ArenaAssigned(id,chosen,p.room);
    }
    function openArena(uint256 id) external payable {
        IndependentArena a = IndependentArena(arenaOf[id]); require(address(a) != address(0), "unassigned");
        T.Binding memory b = a.boundMatch(); require(b.id == id && b.epoch == 0 && L.proposal(words,id).status == 2, "stale assignment");
        ArcadeFamily.Grant memory ga = family.grantOf(b.a); ArcadeFamily.Grant memory gb = family.grantOf(b.b);
        require(ga.key == b.keyA && gb.key == b.keyB && ga.expires == b.expiresA && gb.expires == b.expiresB,
            "admission authorization changed");
        a.openEngine{value:msg.value}(); emit ArenaOpened(id,address(a),a.boundMatch().epoch);
    }
    function capture(uint256 id) public {
        IndependentArena a = IndependentArena(arenaOf[id]); require(address(a) != address(0) && a.boundMatch().id == id, "match reference");
        Types.Session memory session = hub.sessionOf(address(a),Types.GLOBAL);
        require(session.status != Types.Status.Challenged, "result under review");
        T.Result memory r = a.publishedResult(); require(r.epoch > 0, "session never opened");
        bool finality = session.status == Types.Status.None;
        if (!finality) require(session.epoch == r.epoch && session.batchIndex > 0, "result not published");
        if (finality && r.status < 3) { a.cancelRecovered(); r = a.publishedResult(); }
        if (ratings.indexOf(id) == 0) {
            require(r.status >= 3 && r.hash != 0, "result pending"); ratings.publish(r,finality);
            _releaseParticipation(id,r.winner); emit MatchReleased(id,address(a),r.hash);
        } else ratings.reconcile(r,finality);
    }
    function _releaseParticipation(uint256 id, address winner) private {
        L.Proposal memory p = L.proposal(words,id);
        if (S.get(words,1,uint160(p.a),0) == id) S.set(words,1,uint160(p.a),0,0);
        if (S.get(words,1,uint160(p.b),0) == id) S.set(words,1,uint160(p.b),0,0);
        L.finish(words,id,winner);
    }
    function closeArena(uint256 id) external {
        capture(id); IndependentArena a = IndependentArena(arenaOf[id]);
        require(hub.statusOf(address(a),Types.GLOBAL) == Types.Status.Active, "not active");
        a.closeEngine(); emit ArenaClosing(id,address(a),a.boundMatch().epoch);
    }
    /// Expiration stops commands, not recovery. Only this arena enters closure.
    function recoverExpired(uint256 id) external {
        IndependentArena a=IndependentArena(arenaOf[id]);
        require(address(a)!=address(0) && a.boundMatch().id==id,"match reference");
        Types.Session memory s=hub.sessionOf(address(a),Types.GLOBAL);
        require(s.status==Types.Status.Active && block.timestamp>=s.expiresAt,"not expired");
        a.closeEngine(); emit ArenaClosing(id,address(a),s.epoch);
    }
    /// A participant may leave capacity waiting, but never cancel a delegated game.
    function cancelAdmission(uint256 id) external {
        address actor=_actor(); L.Proposal memory p=L.proposal(words,id);
        require(p.status==2 && (actor==p.a || actor==p.b),"admission participant");
        _cancelUnopened(id);
        L.leave(words,actor);
    }
    /// A grant expiring before hosting starts must not trap a room forever.
    function cancelUnopened(uint256 id) external {
        L.Proposal memory p = L.proposal(words,id);
        bool invalid=IndependentSocial.grantHash(family,p.a)!=bytes32(S.get(words,74,id,0))
            || IndependentSocial.grantHash(family,p.b)!=bytes32(S.get(words,74,id,1));
        require(p.status == 2 && (invalid || block.timestamp > uint256(p.expires)+180), "admission still pending");
        _cancelUnopened(id);
    }
    function _cancelUnopened(uint256 id) private {
        address at = arenaOf[id];
        if (at != address(0)) {
            IndependentArena a = IndependentArena(at); T.Binding memory b = a.boundMatch();
            require(b.id == id && b.epoch == 0 && hub.statusOf(at,Types.GLOBAL) == Types.Status.None, "session opened");
            a.cancelRecovered();
        }
        _releaseParticipation(id,address(0));
    }
}
