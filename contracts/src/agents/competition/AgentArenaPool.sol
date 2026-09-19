// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";
import {AgentTournaments} from "./AgentTournaments.sol";
import {AgentPublishedRatings} from "./AgentPublishedRatings.sol";
import {AgentChallenges} from "./AgentChallenges.sol";
import {AgentQualifications} from "./AgentQualifications.sol";
import {PoolPublication} from "./PoolPublication.sol";
import {ArcadeFamily} from "../../independent/ArcadeFamily.sol";
import {AgentArenaTypes as A,IAgentArena} from "./AgentArenaTypes.sol";
import {CompetitionTypes as T,ICompetitionAuthority} from "./CompetitionTypes.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";

/// Shared Monad authority. This contract never executes physics or accepts a
/// caller-provided score. Each arena holds exactly one match per delegation.
contract AgentArenaPool is ICompetitionAuthority {
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
    IAgentArena[] private arenas;
    mapping(address=>bool) public registered;
    mapping(address=>bytes32) public arenaMatch;
    mapping(address=>uint256) public arenaEpoch;
    mapping(address=>bytes32) public playing;
    mapping(bytes32=>Record) private records;
    mapping(bytes32=>T.Result) private captured;
    mapping(bytes32=>uint256) public challengeOf;
    mapping(bytes32=>bool) public qualificationOf;
    mapping(uint64=>mapping(address=>uint256)) public learned;
    bytes32[2] public laneMatch;
    event ArenaRegistered(address indexed arena,bytes32 runtimeHash);
    event Assigned(bytes32 indexed ref,address indexed arena,uint64 indexed tournament,uint8 fixture,uint8 lane);
    event Opened(bytes32 indexed ref,uint256 epoch);
    event Captured(bytes32 indexed ref,bytes32 resultHash,bool finality);
    event Closing(bytes32 indexed ref,uint256 epoch);
    event Released(bytes32 indexed ref,uint256 epoch);
    event AdmissionCancelled(bytes32 indexed ref);
    constructor(AgentCatalog registry,IInterludeHub protocol,address admin){
        require(block.chainid==10143&&address(registry).code.length>0&&address(protocol).code.length>0&&admin!=address(0),"Monad pool roles");
        catalog=registry;hub=protocol;owner=admin;
    }
    modifier base(){require(block.chainid==10143,"Monad pool only");_;}
    modifier locked(){require(guard==0,"reentrant pool");guard=1;_;guard=0;}
    function configure(AgentTournaments book,AgentPublishedRatings ledger) external base {
        require(msg.sender==owner&&!setupSealed&&address(tournaments)==address(0),"setup only");
        if(address(book.authority())!=address(this)||address(book.catalog())!=address(catalog)||ledger.lobby()!=address(this))revert InvalidCommonAuthority();
        tournaments=book;ratings=ledger;
    }
    function addArena(IAgentArena arena) external base {
        require(msg.sender==owner&&!setupSealed&&arenas.length<32&&!registered[address(arena)],"setup only");
        if(arena.pool()!=address(this)||arena.hub()!=address(hub)||arena.RULES_VERSION()!=10)revert InvalidArenaConfiguration();
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
    function seal() external base {
        require(msg.sender==owner&&!setupSealed&&arenas.length>=3&&address(tournaments)!=address(0)&&address(challenges)!=address(0)
            &&ratings.migrationSealed()&&catalog.setupSealed(),"setup incomplete");
        setupSealed=true;
    }
    function setAdmissions(bool value) external base {require(msg.sender==owner&&(!value||setupSealed),"operator/gates");admissions=value;}
    /// Records the reviewed real trial, independently of construction. Before
    /// this gate, only the operator may admit private qualification matches.
    function qualifyCapacity(bytes32 evidence) external base {require(msg.sender==owner&&setupSealed&&evidence!=0&&address(qualifications)!=address(0),"operator/evidence");capacityEvidence=evidence;}
    function setPublicAdmissions(bool value) external base {require(msg.sender==owner&&(!value||capacityEvidence!=0),"qualification required");publicAdmissions=value;}
    function arenaPage() external view returns(IAgentArena[] memory){return arenas;}
    function record(T.Ref calldata ref) external view returns(Record memory){return records[T.key(ref)];}
    function result(T.Ref calldata ref) external view returns(T.Result memory){
        bytes32 key=T.key(ref);require(records[key].captured,"unpublished result");return captured[key];
    }
    function seedElo(address agent,uint8 mode) external view returns(uint32){
        if(ratings.buildGeneration()!=0)revert RankingCorrectionInProgress();return ratings.ratingOf(agent,mode).elo;
    }
    function _idle(IAgentArena arena) private view returns(bool){
        if(hub.statusOf(address(arena),Types.GLOBAL)!=Types.Status.None)return false;
        bytes32 prior=arenaMatch[address(arena)];if(prior==0)return true;
        return records[prior].captured&&captured[prior].finality;
    }
    /// Counts only contracts whose real hub lifecycle has completed. Hosted
    /// availability is an additional service gate; this is not a node quota.
    function releasedArenaCount() external view returns(uint256 count){for(uint256 i;i<arenas.length;i++)if(_idle(arenas[i]))count++;}
    function _controller(address agent,uint64 tournament,bytes32 frozen) private view returns(A.Controller memory c){
        return PoolPublication.controller(catalog,agent,tournament,frozen,learned[tournament][agent]);
    }
    function admitTournament(uint64 id) external base locked returns(T.Ref memory ref){
        require(msg.sender==owner||publicAdmissions,"private qualification");
        require(admissions&&laneMatch[0]==0,"tournament lane waiting");
        (uint8 index,address a,address b,bool ranked)=tournaments.nextFixture(id);require(index!=255,"no tournament fixture");
        require(playing[a]==0&&playing[b]==0,"previous match still playing");
        AgentTournaments.Tournament memory t=tournaments.tournament(id);
        require(catalog.participation(a)==tournaments.token(id)&&catalog.participation(b)==tournaments.token(id),"tournament locks");
        IAgentArena chosen;
        for(uint256 i;i<arenas.length;i++)if(_idle(arenas[i])){chosen=arenas[i];break;}
        // Capacity waiting is explicit and does not burn a match identifier.
        if(address(chosen)==address(0))return ref;
        bytes32 hashA;bytes32 hashB;for(uint8 i;i<8;i++){if(t.agents[i]==a)hashA=t.controllers[i];if(t.agents[i]==b)hashB=t.controllers[i];}
        ref=T.Ref(10143,address(chosen),arenaEpoch[address(chosen)]+1,++nonce);
        A.Binding memory binding;binding.id=ref.id;binding.epoch=ref.epoch;binding.preparedBlock=uint64(block.number);binding.tournament=id;
        binding.a=a;binding.b=b;binding.mode=t.mode;binding.ranked=ranked;binding.overtime=!t.league;
        binding.controlA=_controller(a,id,hashA);binding.controlB=_controller(b,id,hashB);
        chosen.prepare(binding);
        bytes32 key=T.key(ref);records[key]=Record(ref,a,b,id,index,0,ranked,false);arenaMatch[address(chosen)]=key;
        playing[a]=key;playing[b]=key;laneMatch[0]=key;
        tournaments.bind(id,index,ref);emit Assigned(key,address(chosen),id,index,0);
    }
    function admitChallenge() external base locked returns(T.Ref memory ref){
        require(msg.sender==owner||publicAdmissions,"private qualification");
        require(admissions&&laneMatch[1]==0,"challenge lane waiting");IAgentArena chosen;
        for(uint256 i;i<arenas.length;i++)if(_idle(arenas[i])){chosen=arenas[i];break;}
        if(address(chosen)==address(0))return ref;
        (uint256 id,AgentChallenges.Request memory request,ArcadeFamily.Grant memory grant)=challenges.takeNext();
        if(id==0)return ref;
        require(playing[request.player]==0&&playing[request.agent]==0,"previous match still playing");
        ref=T.Ref(10143,address(chosen),arenaEpoch[address(chosen)]+1,++nonce);bytes32 key=T.key(ref);
        catalog.reserve(request.agent,request.mode,key);
        AgentCatalog.Identity memory bot=catalog.identity(request.agent);
        A.Binding memory binding=A.Binding(ref.id,ref.epoch,uint64(block.number),0,request.player,request.agent,request.mode,false,false,
            A.Controller(0,0,0,grant.key,grant.expires),_controller(request.agent,0,bot.codeHash));
        chosen.prepare(binding);records[key]=Record(ref,request.player,request.agent,0,0,1,false,false);arenaMatch[address(chosen)]=key;
        playing[request.player]=key;playing[request.agent]=key;laneMatch[1]=key;challengeOf[key]=id;
        emit Assigned(key,address(chosen),0,0,1);
    }
    function admitQualification() external base locked returns(T.Ref memory ref){
        require(msg.sender==owner||publicAdmissions,"private qualification");
        require(admissions&&laneMatch[1]==0&&address(qualifications)!=address(0)&&challenges.qualificationsMayStart(),"challenge priority/qualification waiting");
        IAgentArena chosen;for(uint256 i;i<arenas.length;i++)if(_idle(arenas[i])){chosen=arenas[i];break;}
        if(address(chosen)==address(0))return ref;
        (address a,address b,uint8 mode)=qualifications.takeNext();if(a==address(0))return ref;
        require(playing[a]==0&&playing[b]==0,"previous match still playing");
        ref=T.Ref(10143,address(chosen),arenaEpoch[address(chosen)]+1,++nonce);bytes32 key=T.key(ref);
        catalog.reserveQualification(a,mode,key);catalog.reserveQualification(b,mode,key);
        A.Binding memory binding=A.Binding(ref.id,ref.epoch,uint64(block.number),0,a,b,mode,false,false,
            _controller(a,0,catalog.identity(a).codeHash),_controller(b,0,catalog.identity(b).codeHash));
        chosen.prepare(binding);records[key]=Record(ref,a,b,0,0,1,false,false);arenaMatch[address(chosen)]=key;
        playing[a]=key;playing[b]=key;laneMatch[1]=key;qualificationOf[key]=true;qualifications.bind(ref,a,b,mode);
        emit Assigned(key,address(chosen),0,0,1);
    }
    function openArena(T.Ref calldata ref) external payable base locked {
        bytes32 key=T.key(ref);Record storage r=records[key];require(r.ref.arena!=address(0)&&!r.captured&&arenaMatch[ref.arena]==key,"match binding");
        require(hub.statusOf(ref.arena,Types.GLOBAL)==Types.Status.None&&ref.epoch==arenaEpoch[ref.arena]+1,"epoch admission");
        require(challengeOf[key]==0||challenges.authorized(challengeOf[key]),"challenge authorization changed");
        IAgentArena(ref.arena).openEngine{value:msg.value}();Types.Session memory s=hub.sessionOf(ref.arena,Types.GLOBAL);
        require(s.status==Types.Status.Active&&s.epoch==ref.epoch,"unexpected delegation");arenaEpoch[ref.arena]=s.epoch;
        emit Opened(key,s.epoch);
    }
    function capture(T.Ref calldata ref) external base locked {_capture(ref);}
    function cancelUnopened(T.Ref calldata ref) external base locked {
        bytes32 key=T.key(ref);Record storage r=records[key];require(r.ref.arena!=address(0)&&!r.captured&&arenaMatch[ref.arena]==key,"match binding");
        require(hub.statusOf(ref.arena,Types.GLOBAL)==Types.Status.None&&arenaEpoch[ref.arena]<ref.epoch,"session already opened");
        IAgentArena arena=IAgentArena(ref.arena);A.Binding memory b=arena.boundMatch();
        // Block production is not a wall-clock expiry. Challenge grants are a
        // verified cancellation reason; otherwise only the operator cancels an
        // admission that never opened, without inventing a scored match.
        require(msg.sender==owner||challengeOf[key]!=0&&!challenges.authorized(challengeOf[key]),"admission still valid");
        require(b.id==ref.id&&b.epoch==ref.epoch,"arena binding");arena.cancelRecovered();
        (T.Result memory value,,)=arena.publishedResult();require(value.status==4&&T.same(value.ref,ref),"unopened cancellation only");
        value.finality=true;PoolPublication.ledger(ratings,value,r.ranked,false);r.captured=true;captured[key]=value;
        if(playing[r.a]==key)delete playing[r.a];if(playing[r.b]==key)delete playing[r.b];if(laneMatch[r.lane]==key)delete laneMatch[r.lane];
        if(challengeOf[key]!=0){catalog.release(r.b,key);challenges.completed(challengeOf[key]);}
        if(qualificationOf[key]){catalog.release(r.a,key);catalog.release(r.b,key);qualifications.complete(value,0,0);}
        emit AdmissionCancelled(key);
    }
    function _capture(T.Ref memory ref) private {
        bytes32 key=T.key(ref);Record storage record_=records[key];require(record_.ref.arena!=address(0),"unknown match");
        // Once reuse is allowed, the immutable final record is the only source.
        if(captured[key].finality)return;
        (T.Result memory r,uint256 brainA,uint256 brainB)=PoolPublication.observe(ref,record_.a,record_.b,hub,arenaEpoch[ref.arena],arenaMatch[ref.arena]);
        if(!record_.captured){
            require(r.status>=3&&r.hash!=0,"result pending");
            PoolPublication.ledger(ratings,r,record_.ranked,false);record_.captured=true;
            if(playing[r.a]==key)delete playing[r.a];if(playing[r.b]==key)delete playing[r.b];
            if(laneMatch[record_.lane]==key)delete laneMatch[record_.lane];
            if(record_.tournament!=0){learned[record_.tournament][r.a]=brainA;learned[record_.tournament][r.b]=brainB;}
            else if(challengeOf[key]!=0){catalog.release(r.b,key);challenges.completed(challengeOf[key]);}
            else if(qualificationOf[key]){catalog.release(r.a,key);catalog.release(r.b,key);}
        }else PoolPublication.ledger(ratings,r,record_.ranked,true);
        if(qualificationOf[key])qualifications.complete(r,brainA,brainB);
        captured[key]=r;emit Captured(key,r.hash,r.finality);
    }
    function closeArena(T.Ref calldata ref) external base locked {
        _capture(ref);require(hub.statusOf(ref.arena,Types.GLOBAL)==Types.Status.Active,"not active");
        IAgentArena(ref.arena).closeEngine();emit Closing(T.key(ref),ref.epoch);
    }
    function recoverExpired(T.Ref calldata ref) external base locked {
        bytes32 key=T.key(ref);require(records[key].ref.arena!=address(0)&&arenaMatch[ref.arena]==key,"match binding");
        Types.Session memory s=hub.sessionOf(ref.arena,Types.GLOBAL);
        require(s.status==Types.Status.Active&&s.epoch==ref.epoch&&block.timestamp>=s.expiresAt,"not expired");
        IAgentArena(ref.arena).closeEngine();emit Closing(key,s.epoch);
    }
    function releaseArena(T.Ref calldata ref) external base locked {
        bytes32 key=T.key(ref);require(records[key].ref.arena!=address(0)&&arenaMatch[ref.arena]==key,"match binding");
        require(hub.statusOf(ref.arena,Types.GLOBAL)==Types.Status.Exiting,"not exiting");
        // The hub enforces its real deadline and performs cleanup. No local timer
        // or elapsed wall-clock assumption can make an arena admissible sooner.
        hub.releaseStake(ref.arena,Types.GLOBAL);_capture(ref);emit Released(key,ref.epoch);
    }
}
