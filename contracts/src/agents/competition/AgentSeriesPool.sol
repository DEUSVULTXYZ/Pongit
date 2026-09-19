// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";
import {AgentTournaments} from "./AgentTournaments.sol";
import {AgentPublishedRatings} from "./AgentPublishedRatings.sol";
import {AgentQualifications} from "./AgentQualifications.sol";
import {SeriesAgentArena} from "./SeriesAgentArena.sol";
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {CompetitionTypes as T,ICompetitionAuthority} from "./CompetitionTypes.sol";
import {PoolPublication} from "./PoolPublication.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";

/// Candidate tournament authority for preauthorized series. No score setter,
/// admission signature or future base-chain read is trusted by the engine.
/// Qualifications occupy a separate lane. Human challenges still require an
/// integrated lane before this authority is eligible for public deployment.
contract AgentSeriesPool is ICompetitionAuthority {
    struct Record {T.Ref ref;address a;address b;uint64 tournament;uint8 fixture;bool ranked;bool captured;}
    AgentCatalog public immutable catalog;IInterludeHub public immutable hub;address public immutable owner;
    AgentTournaments public tournaments;AgentPublishedRatings public ratings;AgentQualifications public qualifications;
    SeriesAgentArena[] private arenas;mapping(address=>bool) public registered;
    mapping(address=>uint256) public arenaEpoch;mapping(address=>uint256[]) private assigned;
    mapping(uint256=>Record) private records;mapping(uint256=>T.Result) private results;
    mapping(address=>uint256) public remaining;mapping(address=>bytes32) public playing;
    mapping(uint64=>mapping(address=>uint256)) public learned;
    mapping(uint256=>bool) public qualificationOf;
    uint256 public nonce;address public activeSeries;address public qualificationSeries;bool public setupSealed;bool public admissions;
    bool public publicAdmissions;bytes32 public capacityEvidence;uint256 private guard;
    event SeriesAssigned(address indexed arena,uint256 epoch,uint64 tournament,uint256 first,uint8 count);
    event ResultCaptured(bytes32 indexed ref,bytes32 hash,bool finality);
    event ArenaClosing(address indexed arena,uint256 epoch);
    event ArenaReleased(address indexed arena,uint256 epoch);
    constructor(AgentCatalog c,IInterludeHub h,address admin){
        require(block.chainid==10143&&address(c).code.length>0&&address(h).code.length>0&&admin!=address(0),"Monad series roles");
        catalog=c;hub=h;owner=admin;
    }
    modifier base(){require(block.chainid==10143,"Monad series only");_;}
    modifier locked(){require(guard==0,"reentrant series");guard=1;_;guard=0;}
    function configure(AgentTournaments book,AgentPublishedRatings ledger) external base {
        require(msg.sender==owner&&!setupSealed&&address(tournaments)==address(0),"setup only");
        require(address(book.authority())==address(this)&&address(book.catalog())==address(catalog)&&ledger.lobby()==address(this),"common authority");
        tournaments=book;ratings=ledger;
    }
    function addArena(SeriesAgentArena arena) external base {
        require(msg.sender==owner&&!setupSealed&&arenas.length<16&&!registered[address(arena)],"arena setup");
        require(arena.pool()==address(this)&&address(arena.hub())==address(hub)&&arena.RULES_VERSION()==11&&arena.seriesSize()==0,"fresh series arena");
        require(hub.statusOf(address(arena),0)==Types.Status.None,"arena occupied");registered[address(arena)]=true;arenas.push(arena);
    }
    function bindQualifications(AgentQualifications queue) external base {
        require(msg.sender==owner&&!setupSealed&&address(qualifications)==address(0)&&queue.pool()==address(this)&&address(queue.catalog())==address(catalog),"qualification setup");
        qualifications=queue;catalog.bindQualifications(address(queue));
    }
    function seal() external base {
        require(msg.sender==owner&&!setupSealed&&arenas.length>=2&&address(tournaments)!=address(0)&&address(qualifications)!=address(0)&&ratings.migrationSealed()&&catalog.setupSealed(),"incomplete setup");setupSealed=true;
    }
    function setAdmissions(bool value) external base {require(msg.sender==owner&&(!value||setupSealed),"operator/setup");admissions=value;}
    function qualifyCapacity(bytes32 evidence) external base {require(msg.sender==owner&&setupSealed&&evidence!=0,"operator/evidence");capacityEvidence=evidence;}
    function setPublicAdmissions(bool value) external base {require(msg.sender==owner&&(!value||capacityEvidence!=0),"operator/qualification");publicAdmissions=value;}
    function arenaPage() external view returns(SeriesAgentArena[] memory){return arenas;}
    function assignedIds(address arena) external view returns(uint256[] memory){return assigned[arena];}
    function record(uint256 id) external view returns(Record memory){return records[id];}
    function result(T.Ref calldata ref) external view returns(T.Result memory){
        require(T.same(records[ref.id].ref,ref)&&records[ref.id].captured,"unknown/unpublished series result");return results[ref.id];
    }
    function seedElo(address player,uint8 mode) external view returns(uint32){require(ratings.buildGeneration()==0,"ranking correction");return ratings.ratingOf(player,mode).elo;}
    function available(address arena) public view returns(bool){
        if(!registered[arena]||hub.statusOf(arena,0)!=Types.Status.None)return false;
        uint256[] storage ids=assigned[arena];for(uint256 i;i<ids.length;i++)if(!results[ids[i]].finality)return false;return true;
    }
    function admitTournament(uint64 tournament) external base locked returns(address chosen){
        require((msg.sender==owner||publicAdmissions)&&admissions&&activeSeries==address(0),"series admission waiting");
        for(uint256 i;i<arenas.length;i++)if(available(address(arenas[i]))){chosen=address(arenas[i]);break;}
        if(chosen==address(0))return chosen;
        SeriesAgentArena arena=SeriesAgentArena(chosen);
        uint8 budget=uint8(arena.maximumEngineBlocks()/36_000);if(budget>4)budget=4;
        (uint8 first,uint8 count)=tournaments.seriesRange(tournament,budget);if(count==0)return address(0);
        AgentTournaments.Tournament memory t=tournaments.tournament(tournament);
        A.Binding[] memory bindings=new A.Binding[](count);T.Ref[] memory refs=new T.Ref[](count);
        delete assigned[chosen];uint256 epoch=arenaEpoch[chosen]+1;
        for(uint8 i;i<count;i++){
            uint256 id=++nonce;refs[i]=T.Ref(10143,chosen,epoch,id);
            bindings[i]=_fixture(tournament,first+i,refs[i],t);assigned[chosen].push(id);
        }
        arena.prepareSeries(bindings);tournaments.bindSeries(tournament,refs);remaining[chosen]=count;activeSeries=chosen;
        emit SeriesAssigned(chosen,epoch,tournament,refs[0].id,count);
    }
    function _fixture(uint64 tournament,uint8 index,T.Ref memory ref,AgentTournaments.Tournament memory t) private returns(A.Binding memory binding){
        (address a,address b)=tournaments.plannedPair(tournament,index);bytes32 token=tournaments.token(tournament);
        require(catalog.participation(a)==token&&catalog.participation(b)==token,"tournament participation");
        bytes32 series=keccak256(abi.encode(address(this),ref.arena,ref.epoch));
        require((playing[a]==0||playing[a]==series)&&(playing[b]==0||playing[b]==series),"cross-arena participation");
        playing[a]=series;playing[b]=series;bytes32 hashA;bytes32 hashB;
        for(uint8 j;j<8;j++){if(t.agents[j]==a)hashA=t.controllers[j];if(t.agents[j]==b)hashB=t.controllers[j];}
        binding.id=ref.id;binding.epoch=ref.epoch;binding.preparedBlock=uint64(block.number);binding.tournament=tournament;
        binding.a=a;binding.b=b;binding.mode=t.mode;binding.ranked=catalog.identity(a).creator!=catalog.identity(b).creator;binding.overtime=!t.league;
        binding.controlA=PoolPublication.controller(catalog,a,tournament,hashA,learned[tournament][a]);
        binding.controlB=PoolPublication.controller(catalog,b,tournament,hashB,learned[tournament][b]);
        records[ref.id]=Record(ref,a,b,tournament,index,binding.ranked,false);
    }
    function admitQualifications() external base locked returns(address chosen){
        require((msg.sender==owner||publicAdmissions)&&admissions&&qualificationSeries==address(0),"qualification lane waiting");
        for(uint256 i;i<arenas.length;i++)if(available(address(arenas[i]))){chosen=address(arenas[i]);break;}
        if(chosen==address(0))return chosen;
        uint8 budget=uint8(SeriesAgentArena(chosen).maximumEngineBlocks()/36_000);if(budget>4)budget=4;
        A.Binding[] memory bindings=new A.Binding[](budget);uint8 count;uint256 epoch=arenaEpoch[chosen]+1;delete assigned[chosen];
        for(;count<budget;count++){
            (address a,address b,uint8 mode)=qualifications.takeNext();if(a==address(0))break;
            uint256 id=++nonce;T.Ref memory ref=T.Ref(10143,chosen,epoch,id);bytes32 key=T.key(ref);
            require(playing[a]==0&&playing[b]==0,"qualification participation");
            catalog.reserveQualification(a,mode,key);catalog.reserveQualification(b,mode,key);playing[a]=key;playing[b]=key;
            bindings[count]=A.Binding(id,epoch,uint64(block.number),0,a,b,mode,false,false,
                PoolPublication.controller(catalog,a,0,catalog.identity(a).codeHash,0),PoolPublication.controller(catalog,b,0,catalog.identity(b).codeHash,0));
            records[id]=Record(ref,a,b,0,count,false,false);qualificationOf[id]=true;assigned[chosen].push(id);qualifications.bind(ref,a,b,mode);
        }
        if(count==0)return address(0);
        assembly("memory-safe"){mstore(bindings,count)}
        SeriesAgentArena(chosen).prepareSeries(bindings);remaining[chosen]=count;qualificationSeries=chosen;
        emit SeriesAssigned(chosen,epoch,0,assigned[chosen][0],count);
    }
    function openArena(address app) external payable base locked {
        require(registered[app]&&assigned[app].length>0&&admissions,"prepared arena");
        T.Ref memory ref=records[assigned[app][0]].ref;require(ref.epoch==arenaEpoch[app]+1,"already opened");
        SeriesAgentArena(app).openEngine{value:msg.value}();Types.Session memory s=hub.sessionOf(app,0);
        require(s.status==Types.Status.Active&&s.epoch==ref.epoch,"opened identity");arenaEpoch[app]=s.epoch;
    }
    function capture(uint256 id) external base locked {_capture(id);}
    function _capture(uint256 id) private {
        Record storage entry=records[id];require(entry.ref.id==id&&id!=0,"unknown series game");if(results[id].finality)return;
        T.Ref memory ref=entry.ref;Types.Session memory s=hub.sessionOf(ref.arena,0);
        require(s.status!=Types.Status.Challenged&&arenaEpoch[ref.arena]==ref.epoch,"review/unopened");
        bool finality=s.status==Types.Status.None;
        if(!finality)require(s.epoch==ref.epoch&&s.batchIndex>0,"publication pending");
        SeriesAgentArena arena=SeriesAgentArena(ref.arena);
        if(finality){arena.cancelRecovered();arena.cancelUnstartedRecovered(id);}
        (T.Result memory r,uint256 brainA,uint256 brainB)=arena.resultFor(id);
        require(T.same(r.ref,ref)&&r.a==entry.a&&r.b==entry.b&&r.status>=3&&r.hash!=0,"result identity/pending");r.finality=finality;
        PoolPublication.ledger(ratings,r,entry.ranked,entry.captured);
        if(!entry.captured){
            entry.captured=true;remaining[ref.arena]--;
            if(qualificationOf[id]){bytes32 key=T.key(ref);catalog.release(r.a,key);catalog.release(r.b,key);delete playing[r.a];delete playing[r.b];}
        }
        if(qualificationOf[id])qualifications.complete(r,brainA,brainB);
        learned[entry.tournament][r.a]=brainA;learned[entry.tournament][r.b]=brainB;
        results[id]=r;emit ResultCaptured(T.key(ref),r.hash,r.finality);
        if(remaining[ref.arena]==0){
            if(activeSeries==ref.arena)activeSeries=address(0);
            if(qualificationSeries==ref.arena)qualificationSeries=address(0);
            bytes32 token=keccak256(abi.encode(address(this),ref.arena,ref.epoch));uint256[] storage ids=assigned[ref.arena];
            for(uint256 i;i<ids.length;i++){Record storage old=records[ids[i]];if(playing[old.a]==token)delete playing[old.a];if(playing[old.b]==token)delete playing[old.b];}
        }
    }
    function closeArena(address app) external base locked {
        require(registered[app]&&remaining[app]==0,"capture series results first");
        SeriesAgentArena(app).closeEngine();emit ArenaClosing(app,arenaEpoch[app]);
    }
    function recoverExpired(address app) external base locked {
        require(registered[app],"known arena");Types.Session memory s=hub.sessionOf(app,0);
        require(s.status==Types.Status.Active&&s.epoch==arenaEpoch[app]&&block.timestamp>=s.expiresAt,"expired series only");
        hub.forceClose(app,0);emit ArenaClosing(app,s.epoch);
    }
    function releaseArena(address app) external base locked {
        require(registered[app]&&hub.statusOf(app,0)==Types.Status.Exiting,"closing series only");
        hub.releaseStake(app,0);uint256[] storage ids=assigned[app];for(uint256 i;i<ids.length;i++)_capture(ids[i]);
        emit ArenaReleased(app,arenaEpoch[app]);
    }
}
