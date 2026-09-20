// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IndependentLobby} from "./IndependentLobby.sol";
import {IndependentArena} from "./IndependentArena.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {ArcadeFamily} from "./ArcadeFamily.sol";
import {ContractLobby as L} from "../autonomous/ContractLobby.sol";
import {AuthorityStore as Store} from "../autonomous/AuthorityStore.sol";
import {ReusableEventsArena} from "./ReusableEventsArena.sol";
import {ReusableAdmission as Admission} from "./ReusableAdmission.sol";
import {ReusableGame as Game} from "./ReusableGame.sol";
import {PublishedResultVerifier,IReusableAdmissionAuthority} from "./PublishedResultVerifier.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";

/// Candidate human authority. Reuses the unchanged deterministic lobby, family
/// consent, rooms and participation rules. The bridge cannot call an assignment
/// setter or choose players: it may only transport an already issued ticket.
contract ReusableEventsLobby is IndependentLobby {
    PublishedResultVerifier public verifier;
    address public immutable admissionSigner;
    mapping(address=>mapping(uint256=>mapping(uint256=>bytes32))) public issuedTicket;
    mapping(uint256=>Admission.Ticket) private tickets;
    mapping(uint256=>T.Binding) private bindings;
    mapping(address=>uint256) public reservedMatch;
    mapping(uint256=>uint64) public bettingCutoff;
    event AdmissionIssued(uint256 indexed id,address indexed arena,uint256 indexed epoch,Admission.Ticket ticket,T.Binding binding);
    event PaymentResultCaptured(uint256 indexed id,address indexed arena,uint256 indexed epoch,bytes32 hash,uint64 cutoff);

    constructor(ArcadeFamily family_,IInterludeHub protocol,address admin,address admissionBridge,address pressureBridge)
        IndependentLobby(family_,protocol,admin,pressureBridge){
        require(admissionBridge!=address(0),"admission bridge");admissionSigner=admissionBridge;
    }
    function bindVerifier(PublishedResultVerifier candidate) external {
        require(msg.sender==setupOwner&&!setupSealed&&address(verifier)==address(0)
            &&address(candidate.authority())==address(this)&&address(candidate.hub())==address(hub),"setup verifier");verifier=candidate;
    }
    function arenaRulesVersion() external pure returns(uint256){return 14;}
    function ticketOf(uint256 id) external view returns(Admission.Ticket memory,T.Binding memory){return(tickets[id],bindings[id]);}
    function addArena(IndependentArena candidate) external override {
        ReusableEventsArena a=ReusableEventsArena(address(candidate));
        require(msg.sender==setupOwner&&!setupSealed&&arenas.length<16&&!registeredArena[address(a)],"setup only");
        require(a.lobby()==address(this)&&a.owner()==address(this)&&address(a.hub())==address(hub)
            &&a.pressureSigner()==pressureSigner&&a.admissionSigner()==admissionSigner
            &&address(a.resultVerifier())==address(verifier)&&a.RULES_VERSION()==14&&!a.isEphemeral(),"arena configuration");
        require(hub.statusOf(address(a),Types.GLOBAL)==Types.Status.None,"arena already delegated");
        registeredArena[address(a)]=true;arenas.push(candidate);emit ArenaRegistered(address(a),arenas.length-1);
    }
    /// Permissionless lifecycle trigger; the hub and arena enforce release/root
    /// sealing. It opens an empty reusable session, not a particular match.
    function openReusableArena(address at) external payable {
        require(setupSealed&&registeredArena[at]&&reservedMatch[at]==0,"registered unreserved arena");
        ReusableEventsArena(at).openEngine{value:msg.value}();
    }
    function assignNext() external override returns(address chosen){
        require(setupSealed,"setup");uint256 id;
        for(uint256 i;i<2;i++){
            uint256 next=L.slot(words,i);
            if(next!=0&&L.proposal(words,next).status==2&&arenaOf[next]==address(0)&&(id==0||next<id))id=next;
        }
        if(id==0)return address(0);
        L.Proposal memory p=L.proposal(words,id);L.Room memory room_=L.room(words,p.room);
        ArcadeFamily.Grant memory a=family.grantOf(p.a);ArcadeFamily.Grant memory b=family.grantOf(p.b);
        require(a.key!=address(0)&&b.key!=address(0),"renew arcade authorization");
        require(Store.get(words,74,id,0)==uint256(family.grantDigest(a))&&Store.get(words,74,id,1)==uint256(family.grantDigest(b)),"acceptance authorization changed");
        Types.Session memory session;uint32 count;
        for(uint256 i;i<arenas.length;i++){
            address at=address(arenas[i]);if(reservedMatch[at]!=0)continue;
            Types.Session memory s=hub.sessionOf(at,Types.GLOBAL);
            if(s.status!=Types.Status.Active||s.expiresAt<=block.timestamp+31 minutes)continue;
            (uint256 epoch,uint32 n,)=ReusableEventsArena(at).resultCommitment();
            if(epoch!=s.epoch||n>=65_536)continue;
            (uint256 currentEpoch,uint256 currentId)=ReusableEventsArena(at).currentMatch();
            // A bridge-only, unissued or unpublished game can never silently
            // make an arena free. A result must have passed this authority.
            if(currentId!=0&&(currentEpoch!=epoch||ratings.indexOf(currentId)==0))continue;
            chosen=at;session=s;count=n;break;
        }
        if(chosen==address(0))return chosen;
        require(block.number>1&&block.number-1<=type(uint64).max,"source block");
        T.Binding memory binding=T.Binding(id,p.room,p.a,p.b,a.key,b.key,a.expires,b.expires,room_.mode,room_.ranked,uint64(block.number-1),session.epoch);
        Admission.Ticket memory t=Admission.Ticket(address(this),chosen,session.epoch,uint256(count)+1,id,
            keccak256(abi.encode(binding)),uint64(block.timestamp),uint64(block.timestamp+120),uint64(block.number-1),blockhash(block.number-1),14);
        require(t.sourceHash!=0&&issuedTicket[chosen][session.epoch][t.sequence]==0,"fresh source/ticket");
        tickets[id]=t;bindings[id]=binding;issuedTicket[chosen][t.epoch][t.sequence]=Admission.digest(t);
        arenaOf[id]=chosen;reservedMatch[chosen]=id;emit ArenaAssigned(id,chosen,p.room);emit AdmissionIssued(id,chosen,t.epoch,t,binding);
    }
    function captureProof(uint256 id,Game.Result calldata complete,bytes32[16] calldata proof) external {
        require(setupSealed&&arenaOf[id]!=address(0),"assigned match");Admission.Ticket memory t=tickets[id];T.Binding memory b=bindings[id];T.Result memory r=complete.match_;
        require(r.id==id&&r.arena==t.arena&&r.epoch==t.epoch&&r.a==b.a&&r.b==b.b&&r.mode==b.mode&&r.ranked==b.ranked
            &&complete.rules==14&&complete.elapsedUs<=1_800_000_000&&complete.finishedAt>0&&complete.finishedAt<=block.timestamp,"canonical result binding");
        bool finality=verifier.verify(t,keccak256(abi.encode(complete)),uint32(t.sequence-1),proof);
        if(ratings.indexOf(id)==0){
            ratings.publish(r,finality);bettingCutoff[id]=complete.finishedAt;_releaseParticipation(id,r.winner);
            if(reservedMatch[t.arena]==id)delete reservedMatch[t.arena];
            emit MatchReleased(id,t.arena,r.hash);emit PaymentResultCaptured(id,t.arena,t.epoch,r.hash,complete.finishedAt);
        }else ratings.reconcile(r,finality);
    }
    /// No newest-slot shortcut: an older match always requires its own proof.
    function capture(uint256) public pure override {revert("published result proof required");}
    function openArena(uint256) external payable override {revert("use reusable lifecycle and issued ticket");}
    function closeArena(uint256) external pure override {revert("close reusable arena by address");}
    function closeReusableArena(address at) external {
        require(setupSealed&&registeredArena[at],"registered arena");Types.Session memory s=hub.sessionOf(at,Types.GLOBAL);
        // No arbitrary visitor can shut down a healthy empty long-lived session.
        require(s.status==Types.Status.Active&&(block.timestamp+31 minutes>=s.expiresAt||msg.sender==setupOwner),"session still admitting");
        ReusableEventsArena(at).closeEngine();
    }
    function recoverExpired(uint256 id) external override {
        address at=arenaOf[id];require(at!=address(0),"assigned match");Types.Session memory s=hub.sessionOf(at,Types.GLOBAL);
        require(s.status==Types.Status.Active&&block.timestamp>=s.expiresAt,"not expired");ReusableEventsArena(at).closeEngine();
    }
    /// A ticket can have executed with its reply/publication lost. Its expiry
    /// alone never releases participation or frees its sequence for replacement.
    function _cancelUnopened(uint256 id) internal override {
        require(arenaOf[id]==address(0),"issued ticket requires published result or epoch recovery");_releaseParticipation(id,address(0));
    }
    function recoverReleased(address at) external {
        require(registeredArena[at]&&hub.statusOf(at,Types.GLOBAL)==Types.Status.None,"released arena");ReusableEventsArena(at).cancelRecovered();
        uint256 id=reservedMatch[at];if(id==0)return;
        Admission.Ticket memory t=tickets[id];(uint256 epoch,uint32 count,)=ReusableEventsArena(at).resultCommitment();
        // Only a definitively released root with no leaf at this sequence proves
        // that this ticket never completed. An existing leaf needs its proof.
        require(epoch==t.epoch,"recovery epoch");
        if(count<t.sequence)_captureMissing(id);
    }
    /// A correction may remove a formerly provisional leaf. Only the final
    /// released prefix proves its absence; a temporary missing RPC never does.
    function captureMissing(uint256 id) external { _captureMissing(id); }
    function _captureMissing(uint256 id) private {
        Admission.Ticket memory t=tickets[id];T.Binding memory b=bindings[id];require(t.matchId==id&&id!=0,"issued match");
        (PublishedResultVerifier.Root memory root,bool finality)=verifier.currentRoot(t.arena,t.epoch);
        require(finality&&root.count<t.sequence,"no final proof of absence");
        T.Result memory r=T.Result(t.arena,t.epoch,id,b.a,b.b,address(0),b.mode,b.ranked,4,0,0,
            keccak256(abi.encode("PONGIT_UNPUBLISHED_CANCELLATION_V1",Admission.digest(t))));
        if(ratings.indexOf(id)==0){
            ratings.publish(r,true);_releaseParticipation(id,address(0));
            if(reservedMatch[t.arena]==id)delete reservedMatch[t.arena];
            emit MatchReleased(id,t.arena,r.hash);emit PaymentResultCaptured(id,t.arena,t.epoch,r.hash,0);
        }else ratings.reconcile(r,true);
    }
}
