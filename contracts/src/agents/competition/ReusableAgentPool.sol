// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";
import {AgentTournaments} from "./AgentTournaments.sol";
import {AgentPublishedRatings} from "./AgentPublishedRatings.sol";
import {AgentChallenges} from "./AgentChallenges.sol";
import {AgentQualifications} from "./AgentQualifications.sol";
import {PoolPublication} from "./PoolPublication.sol";
import {ReusableAgentLearning} from "./ReusableAgentLearning.sol";
import {ArcadeFamily} from "../../independent/ArcadeFamily.sol";
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {CompetitionTypes as T,ICompetitionAuthority} from "./CompetitionTypes.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";
import {ReusableAgentArena} from "./ReusableAgentArena.sol";
import {ReusableAgentGame as Game} from "./ReusableAgentGame.sol";
import {ReusableAdmission as Admission} from "../../independent/ReusableAdmission.sol";
import {PublishedResultVerifier} from "../../independent/PublishedResultVerifier.sol";

/// Shared Monad authority. This contract never executes physics or accepts a
/// unverified score. One fixed physics slot admits successive Monad tickets.
contract ReusableAgentPool is ICompetitionAuthority {
    error InvalidArenaConfiguration();
    error ArenaNotFresh();
    error InvalidCommonAuthority();
    error InvalidChallengeQueue();
    error InvalidQualificationQueue();
    error RankingCorrectionInProgress();
    struct Record {T.Ref ref;address a;address b;uint64 tournament;uint8 fixture;uint8 lane;bool ranked;bool captured;}
    AgentCatalog public immutable catalog;
    IInterludeHub public immutable hub;
    address public immutable owner;
    address public immutable admissionSigner;
    PublishedResultVerifier public verifier;
    mapping(address=>mapping(uint256=>mapping(uint256=>bytes32))) public issuedTicket;
    mapping(bytes32=>Admission.Ticket) private tickets;
    mapping(bytes32=>A.Binding) private bindings;
    AgentTournaments public tournaments;
    AgentPublishedRatings public ratings;
    AgentChallenges public challenges;
    AgentQualifications public qualifications;
    bool public setupSealed;
    bool public admissions;
    bool public publicAdmissions;
    bytes32 public capacityEvidence;
    uint256 public nonce;
    uint256 private guard;
    ReusableAgentArena[] private arenas;
    mapping(address=>bool) public registered;
    mapping(address=>bytes32) public arenaMatch;
    mapping(address=>uint256) public arenaEpoch;
    mapping(address=>bytes32) public playing;
    mapping(bytes32=>Record) private records;
    mapping(bytes32=>T.Result) private captured;
    mapping(bytes32=>uint256) public challengeOf;
    mapping(bytes32=>bool) public qualificationOf;
    // Friendly/qualification instances never own their archetype's competitive
    // lock. Persist the decision for capture, even if qualification later changes.
    mapping(bytes32=>uint8) public houseInstancesOf;
    mapping(bytes32=>uint256[2]) private resultBrains;
    bytes32[2] public laneMatch;
    event ArenaRegistered(address indexed arena,bytes32 runtimeHash);
    event Assigned(bytes32 indexed ref,address indexed arena,uint64 indexed tournament,uint8 fixture,uint8 lane);
    event Opened(bytes32 indexed ref,uint256 epoch);
    event Captured(bytes32 indexed ref,bytes32 resultHash,bool finality);
    event Closing(bytes32 indexed ref,uint256 epoch);
    event Released(bytes32 indexed ref,uint256 epoch);
    event AdmissionCancelled(bytes32 indexed ref);
    event AdmissionIssued(bytes32 indexed ref,address indexed arena,uint256 indexed epoch,Admission.Ticket ticket,A.Binding binding);
    constructor(AgentCatalog registry,IInterludeHub protocol,address admin,address bridge){
        require(block.chainid==10143&&address(registry).code.length>0&&address(protocol).code.length>0&&admin!=address(0)&&bridge!=address(0),"Monad pool roles");
        catalog=registry;hub=protocol;owner=admin;admissionSigner=bridge;
    }
    modifier base(){require(block.chainid==10143,"Monad pool only");_;}
    modifier locked(){require(guard==0,"reentrant pool");guard=1;_;guard=0;}
    function configure(AgentTournaments book,AgentPublishedRatings ledger) external base {
        require(msg.sender==owner&&!setupSealed&&address(tournaments)==address(0),"setup only");
        if(address(book.authority())!=address(this)||address(book.catalog())!=address(catalog)||ledger.lobby()!=address(this))revert InvalidCommonAuthority();
        tournaments=book;ratings=ledger;
    }
    function bindVerifier(PublishedResultVerifier candidate) external base {
        require(msg.sender==owner&&!setupSealed&&address(verifier)==address(0)&&address(candidate.authority())==address(this)
            &&address(candidate.hub())==address(hub),"result verifier setup");verifier=candidate;
    }
    function registeredArena(address arena) external view returns(bool){return registered[arena];}
    function ticketOf(T.Ref calldata ref) external view returns(Admission.Ticket memory,A.Binding memory){return(tickets[T.key(ref)],bindings[T.key(ref)]);}
    function addArena(ReusableAgentArena arena) external base {
        require(msg.sender==owner&&!setupSealed&&arenas.length<32&&!registered[address(arena)],"setup only");
        if(arena.pool()!=address(this)||address(arena.hub())!=address(hub)||arena.RULES_VERSION()!=15
            ||arena.admissionSigner()!=admissionSigner||address(arena.resultVerifier())!=address(verifier))revert InvalidArenaConfiguration();
        if(hub.statusOf(address(arena),Types.GLOBAL)!=Types.Status.None||arena.boundMatch().id!=0)revert ArenaNotFresh();
        registered[address(arena)]=true;arenas.push(arena);emit ArenaRegistered(address(arena),address(arena).codehash);
    }
    function bindChallenges(AgentChallenges queue) external base {
        if(msg.sender!=owner||setupSealed||address(challenges)!=address(0)||queue.pool()!=address(this)
            ||address(queue.catalog())!=address(catalog))revert InvalidChallengeQueue();challenges=queue;
    }
    function bindQualifications(AgentQualifications queue) external base {
        if(msg.sender!=owner||setupSealed||address(qualifications)!=address(0)||queue.pool()!=address(this)
            ||address(queue.catalog())!=address(catalog))revert InvalidQualificationQueue();
        qualifications=queue;catalog.bindQualifications(address(queue));
    }
    function seal() public virtual base {
        require(msg.sender==owner&&!setupSealed&&arenas.length>=3&&address(verifier)!=address(0)&&address(tournaments)!=address(0)&&address(challenges)!=address(0)
            &&ratings.migrationSealed()&&catalog.setupSealed(),"setup incomplete");
        setupSealed=true;
    }
    function setAdmissions(bool value) external base {require(msg.sender==owner&&(!value||setupSealed),"operator/gates");admissions=value;}
    /// Records the reviewed real trial, independently of construction. Before
    /// this gate, only the operator may admit private qualification matches.
    function qualifyCapacity(bytes32 evidence) external base {require(msg.sender==owner&&setupSealed&&evidence!=0&&address(qualifications)!=address(0),"operator/evidence");capacityEvidence=evidence;}
    function setPublicAdmissions(bool value) external base {require(msg.sender==owner&&(!value||capacityEvidence!=0),"qualification required");publicAdmissions=value;}
    function arenaPage() external view returns(ReusableAgentArena[] memory){return arenas;}
    function record(T.Ref calldata ref) external view returns(Record memory){return records[T.key(ref)];}
    /// Discovery comes from the Monad assignment, even before its admission is
    /// published back from the engine. No indexer or stale physical slot needed.
    function laneRecord(uint8 lane) external view returns(Record memory){require(lane<2,"lane bounds");return records[laneMatch[lane]];}
    function result(T.Ref calldata ref) external view returns(T.Result memory){
        bytes32 key=T.key(ref);require(records[key].captured,"unpublished result");return captured[key];
    }
    function seedElo(address agent,uint8 mode) external view returns(uint32){
        if(ratings.buildGeneration()!=0)revert RankingCorrectionInProgress();return ratings.ratingOf(agent,mode).elo;
    }
    function _idle(ReusableAgentArena arena) private view returns(bool){
        Types.Session memory session=hub.sessionOf(address(arena),Types.GLOBAL);
        if(session.status!=Types.Status.Active||session.expiresAt<=block.timestamp+7 minutes)return false;
        (uint256 epoch,uint32 count,)=arena.resultCommitment();if(epoch!=session.epoch||count>=65_536)return false;
        bytes32 prior=arenaMatch[address(arena)];if(prior!=0&&!records[prior].captured)return false;
        (uint256 currentEpoch,uint256 id)=arena.currentMatch();
        return id==0||currentEpoch==epoch&&prior!=0&&records[prior].ref.id==id&&captured[prior].status>=3;
    }
    /// Actual published capacity inside open sessions, not a provider quota.
    function releasedArenaCount() external view returns(uint256 count){for(uint256 i;i<arenas.length;i++)if(_idle(arenas[i]))count++;}
    function _newestIdle() private view returns(ReusableAgentArena chosen){
        uint256 newest;
        for(uint256 i;i<arenas.length;i++)if(_idle(arenas[i])){
            uint256 baseBlock=hub.sessionOf(address(arenas[i]),Types.GLOBAL).baseBlock;
            if(address(chosen)==address(0)||baseBlock>newest){chosen=arenas[i];newest=baseBlock;}
        }
    }
    function _known(address agent,uint256 baseBlock) private view returns(bool){
        return catalog.identity(agent).house!=0||catalog.registeredBlock(agent)<=baseBlock;
    }
    /// Legacy deployments retain exclusive identities. Only the versioned
    /// replacement opts official house controllers into independent instances.
    function _independentHouse(address,uint8,bool) internal view virtual returns(bool){return false;}
    function _controller(address agent,uint64 tournament,bytes32 frozen) private view returns(A.Controller memory c){
        return PoolPublication.controller(catalog,agent,tournament,frozen,learned(tournament,agent));
    }
    function learned(uint64 tournament,address agent) public view returns(uint256){
        return ReusableAgentLearning.latest(tournaments,captured,resultBrains,tournament,agent);
    }
    function _prepare(ReusableAgentArena arena,A.Binding memory binding) private {
        Types.Session memory session=hub.sessionOf(address(arena),Types.GLOBAL);
        require(binding.epoch==session.epoch&&session.status==Types.Status.Active,"active admission epoch");
        if(binding.controlA.codeHash!=0)require(_known(binding.a,session.baseBlock),"first strategy awaits a newer arena");
        if(binding.controlB.codeHash!=0)require(_known(binding.b,session.baseBlock),"second strategy awaits a newer arena");
        require(block.number>1&&block.number-1<=type(uint64).max,"source block");binding.preparedBlock=uint64(block.number-1);
        (,uint32 count,)=arena.resultCommitment();
        Admission.Ticket memory ticket=Admission.Ticket(address(this),address(arena),binding.epoch,uint256(count)+1,binding.id,
            keccak256(abi.encode(binding)),uint64(block.timestamp),uint64(block.timestamp+120),binding.preparedBlock,blockhash(binding.preparedBlock),15);
        require(ticket.sourceHash!=0&&issuedTicket[address(arena)][ticket.epoch][ticket.sequence]==0,"fresh ticket source");
        bytes32 key=T.key(T.Ref(10143,address(arena),binding.epoch,binding.id));
        tickets[key]=ticket;bindings[key]=binding;issuedTicket[address(arena)][ticket.epoch][ticket.sequence]=Admission.digest(ticket);
        emit AdmissionIssued(key,address(arena),ticket.epoch,ticket,binding);
    }
    function admitTournament(uint64 id) external base locked returns(T.Ref memory ref){
        require(msg.sender==owner||publicAdmissions,"private qualification");
        require(admissions&&laneMatch[0]==0,"tournament lane waiting");
        (uint8 index,address a,address b,bool ranked)=tournaments.nextFixture(id);require(index!=255,"no tournament fixture");
        require(playing[a]==0&&playing[b]==0,"previous match still playing");
        AgentTournaments.Tournament memory t=tournaments.tournament(id);
        require(catalog.participation(a)==tournaments.token(id)&&catalog.participation(b)==tournaments.token(id),"tournament locks");
        ReusableAgentArena chosen=_newestIdle();
        // Capacity waiting is explicit and does not burn a match identifier.
        if(address(chosen)==address(0))return ref;
        uint256 baseBlock=hub.sessionOf(address(chosen),Types.GLOBAL).baseBlock;
        if(!_known(a,baseBlock)||!_known(b,baseBlock))return ref;
        bytes32 hashA;bytes32 hashB;for(uint8 i;i<8;i++){if(t.agents[i]==a)hashA=t.controllers[i];if(t.agents[i]==b)hashB=t.controllers[i];}
        ref=T.Ref(10143,address(chosen),arenaEpoch[address(chosen)],++nonce);
        A.Binding memory binding;binding.id=ref.id;binding.epoch=ref.epoch;binding.preparedBlock=uint64(block.number);binding.tournament=id;
        binding.a=a;binding.b=b;binding.mode=t.mode;binding.ranked=ranked;binding.overtime=!t.league;
        binding.controlA=_controller(a,id,hashA);binding.controlB=_controller(b,id,hashB);
        _prepare(chosen,binding);
        bytes32 key=T.key(ref);records[key]=Record(ref,a,b,id,index,0,ranked,false);arenaMatch[address(chosen)]=key;
        playing[a]=key;playing[b]=key;laneMatch[0]=key;
        tournaments.bind(id,index,ref);emit Assigned(key,address(chosen),id,index,0);
    }
    function admitChallenge() external base locked returns(T.Ref memory ref){
        require(msg.sender==owner||publicAdmissions,"private qualification");
        require(admissions&&laneMatch[1]==0,"challenge lane waiting");ReusableAgentArena chosen=_newestIdle();
        if(address(chosen)==address(0))return ref;
        (uint256 id,AgentChallenges.Request memory request,ArcadeFamily.Grant memory grant)=challenges.takeNextKnown(hub.sessionOf(address(chosen),Types.GLOBAL).baseBlock);
        if(id==0)return ref;
        bool independent=_independentHouse(request.agent,request.mode,false);
        require(playing[request.player]==0&&(independent||playing[request.agent]==0),"previous match still playing");
        ref=T.Ref(10143,address(chosen),arenaEpoch[address(chosen)],++nonce);bytes32 key=T.key(ref);
        if(!independent)catalog.reserve(request.agent,request.mode,key);
        AgentCatalog.Identity memory bot=catalog.identity(request.agent);
        A.Binding memory binding=A.Binding(ref.id,ref.epoch,uint64(block.number),0,request.player,request.agent,request.mode,false,false,
            A.Controller(0,0,0,grant.key,grant.expires),_controller(request.agent,0,bot.codeHash));
        _prepare(chosen,binding);records[key]=Record(ref,request.player,request.agent,0,0,1,false,false);arenaMatch[address(chosen)]=key;
        playing[request.player]=key;if(independent)houseInstancesOf[key]=2;else playing[request.agent]=key;
        laneMatch[1]=key;challengeOf[key]=id;
        emit Assigned(key,address(chosen),0,0,1);
    }
    function admitQualification() external base locked returns(T.Ref memory ref){
        require(msg.sender==owner||publicAdmissions,"private qualification");
        require(admissions&&laneMatch[1]==0&&address(qualifications)!=address(0)&&challenges.qualificationsMayStart(),"challenge priority/qualification waiting");
        ReusableAgentArena chosen=_newestIdle();
        if(address(chosen)==address(0))return ref;
        (address a,address b,uint8 mode)=qualifications.takeNextKnown(hub.sessionOf(address(chosen),Types.GLOBAL).baseBlock);if(a==address(0))return ref;
        bool independentA=_independentHouse(a,mode,true);bool independentB=_independentHouse(b,mode,true);
        require((independentA||playing[a]==0)&&(independentB||playing[b]==0),"previous match still playing");
        ref=T.Ref(10143,address(chosen),arenaEpoch[address(chosen)],++nonce);bytes32 key=T.key(ref);
        if(!independentA)catalog.reserveQualification(a,mode,key);if(!independentB)catalog.reserveQualification(b,mode,key);
        A.Binding memory binding=A.Binding(ref.id,ref.epoch,uint64(block.number),0,a,b,mode,false,false,
            _controller(a,0,catalog.identity(a).codeHash),_controller(b,0,catalog.identity(b).codeHash));
        _prepare(chosen,binding);records[key]=Record(ref,a,b,0,0,1,false,false);arenaMatch[address(chosen)]=key;
        if(independentA)houseInstancesOf[key]|=1;else playing[a]=key;
        if(independentB)houseInstancesOf[key]|=2;else playing[b]=key;
        laneMatch[1]=key;qualificationOf[key]=true;qualifications.bind(ref,a,b,mode);
        emit Assigned(key,address(chosen),0,0,1);
    }
    function openReusableArena(address app) external payable base locked {
        require(setupSealed&&registered[app],"registered arena");bytes32 prior=arenaMatch[app];
        require(prior==0||records[prior].captured,"recover pending match first");
        require(hub.statusOf(app,Types.GLOBAL)==Types.Status.None,"release required");
        ReusableAgentArena(app).openEngine{value:msg.value}();Types.Session memory session=hub.sessionOf(app,Types.GLOBAL);
        require(session.status==Types.Status.Active&&session.epoch==arenaEpoch[app]+1,"new delegation epoch");arenaEpoch[app]=session.epoch;
        emit Opened(bytes32(0),session.epoch);
    }
    function captureProof(T.Ref calldata ref,Game.Result calldata complete,bytes32[16] calldata proof) external base locked {
        bytes32 key=T.key(ref);Record memory record_=records[key];A.Binding memory binding=bindings[key];T.Result memory r=complete.match_;
        require(record_.ref.arena!=address(0)&&T.same(record_.ref,ref)&&T.same(r.ref,ref)&&r.a==record_.a&&r.b==record_.b
            &&r.mode==binding.mode&&r.hash!=0&&r.status>=3&&r.status<=4&&!r.finality&&complete.rules==15
            &&r.elapsedUs<=(binding.overtime?360_000_000:300_000_000)&&complete.finishedAt>0&&complete.finishedAt<=block.timestamp,"canonical agent result");
        r.finality=verifier.verify(tickets[key],keccak256(abi.encode(complete)),uint32(tickets[key].sequence-1),proof);
        _capture(key,r,complete.brainA,complete.brainB);
    }
    function _capture(bytes32 key,T.Result memory r,uint256 brainA,uint256 brainB) private {
        Record storage record_=records[key];
        if(!record_.captured){
            PoolPublication.ledger(ratings,r,record_.ranked,false);record_.captured=true;
            if(playing[r.a]==key)delete playing[r.a];if(playing[r.b]==key)delete playing[r.b];
            if(laneMatch[record_.lane]==key)delete laneMatch[record_.lane];
            if(challengeOf[key]!=0){if(houseInstancesOf[key]&2==0)catalog.release(r.b,key);challenges.completed(challengeOf[key]);}
            else if(qualificationOf[key]){
                if(houseInstancesOf[key]&1==0)catalog.release(r.a,key);if(houseInstancesOf[key]&2==0)catalog.release(r.b,key);
            }
        }else PoolPublication.ledger(ratings,r,record_.ranked,true);
        if(qualificationOf[key])qualifications.complete(r,brainA,brainB);
        captured[key]=r;resultBrains[key]=[brainA,brainB];
        PoolPublication.archive(r,record_.ranked,record_.tournament);emit Captured(key,r.hash,r.finality);
    }
    function captureMissing(T.Ref calldata ref) external base locked {_missing(T.key(ref));}
    function _missing(bytes32 key) private {
        Admission.Ticket memory ticket=tickets[key];A.Binding memory b=bindings[key];require(ticket.matchId!=0,"issued match");
        (PublishedResultVerifier.Root memory root,bool finality)=verifier.currentRoot(ticket.arena,ticket.epoch);
        require(finality&&root.count<ticket.sequence,"final proof of absence required");
        T.Result memory r=T.Result(records[key].ref,b.a,b.b,address(0),keccak256(abi.encode("PONGIT_AGENT_UNPUBLISHED_CANCELLATION_V1",Admission.digest(ticket))),b.mode,4,0,0,0,true);
        _capture(key,r,0,0);emit AdmissionCancelled(key);
    }
    function closeReusableArena(address app) external base locked {
        require(setupSealed&&registered[app],"registered arena");Types.Session memory session=hub.sessionOf(app,Types.GLOBAL);
        require(session.status==Types.Status.Active&&(msg.sender==owner||block.timestamp+7 minutes>=session.expiresAt),"arena still admitting");
        ReusableAgentArena(app).closeEngine();emit Closing(arenaMatch[app],session.epoch);
    }
    function recoverExpired(address app) external base locked {
        require(registered[app],"registered arena");Types.Session memory session=hub.sessionOf(app,Types.GLOBAL);
        require(session.status==Types.Status.Active&&block.timestamp>=session.expiresAt,"not expired");
        ReusableAgentArena(app).closeEngine();emit Closing(arenaMatch[app],session.epoch);
    }
    function releaseArena(address app) external base locked {
        require(registered[app]&&hub.statusOf(app,Types.GLOBAL)==Types.Status.Exiting,"exiting registered arena");
        hub.releaseStake(app,Types.GLOBAL);verifier.sealReleased(app);_recover(app);emit Released(arenaMatch[app],arenaEpoch[app]);
    }
    function recoverReleased(address app) external base locked {
        require(registered[app]&&hub.statusOf(app,Types.GLOBAL)==Types.Status.None,"released registered arena");
        verifier.sealReleased(app);_recover(app);
    }
    function _recover(address app) private {
        ReusableAgentArena(app).cancelRecovered();bytes32 key=arenaMatch[app];if(key==0)return;
        Admission.Ticket memory ticket=tickets[key];(uint256 epoch,uint32 count,)=ReusableAgentArena(app).resultCommitment();
        if(epoch==ticket.epoch&&count<ticket.sequence)_missing(key);
        // Existing leaves require their canonical historical proof. Recovery
        // never silently substitutes the newest slot for another match.
    }
}
