// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";
import {CompetitionTypes as T,ICompetitionAuthority} from "./CompetitionTypes.sol";
import {TournamentRules as R} from "./TournamentRules.sol";

/// Persistent automatic tournaments on Monad, outside physics delegations.
/// Keepers choose when to trigger work, never the entrants, score or tie-break.
contract AgentTournaments {
    enum Status {None,Selecting,Playing,Complete,RepairWaiting}
    struct Tournament {
        Status status;uint8 mode;bool league;uint64 startedAt;uint64 completedAt;
        uint256 catalogRevision;uint256 scanCount;uint256 cursor;uint8 selected;
        address[8] agents;bytes32[8] controllers;uint32[8] seeds;address champion;uint32 revision;
    }
    struct Fixture {
        T.Ref ref;address a;address b;address advanced;bytes32 resultDigest;
        T.Result published;bool bound;bool resolved;bool administrative;uint32 attempt;
    }
    AgentCatalog public immutable catalog;
    ICompetitionAuthority public immutable authority;
    address public immutable owner;
    bool public admissions;
    uint64 public count;
    uint64 public nextAt;
    uint256 private guard;
    mapping(uint64=>Tournament) private tournaments;
    mapping(uint64=>mapping(uint8=>Fixture)) private fixtures;
    mapping(uint64=>mapping(uint8=>T.Ref[])) private attempts;
    mapping(bytes32=>bool) public usedMatch;
    event SelectionStarted(uint64 indexed id,uint8 mode,bool league,uint256 candidates);
    event TournamentStarted(uint64 indexed id,address[8] agents,bytes32[8] controllers,uint32[8] seeds);
    event FixtureBound(uint64 indexed id,uint8 indexed fixture,bytes32 indexed matchRef,uint32 attempt,address a,address b);
    event ResultApplied(uint64 indexed id,uint8 indexed fixture,bytes32 hash,address advanced,bool administrative,bool finality);
    event BranchInvalidated(uint64 indexed id,uint8 indexed fixture,bytes32 oldMatch,uint32 revision);
    event TournamentCompleted(uint64 indexed id,address champion,uint64 nextAt);
    event TournamentCorrection(uint64 indexed id,uint32 revision);
    constructor(AgentCatalog c,ICompetitionAuthority source,address admin){
        require(block.chainid==10143&&address(c).code.length>0&&address(source).code.length>0&&admin!=address(0),"Monad competition roles");
        catalog=c;authority=source;owner=admin;
    }
    modifier base(){require(block.chainid==10143,"Monad tournaments only");_;}
    modifier locked(){require(guard==0,"reentrant tournament");guard=1;_;guard=0;}
    function setAdmissions(bool value) external base {require(msg.sender==owner,"operator only");admissions=value;}
    function token(uint64 id) public view returns(bytes32){return keccak256(abi.encode(address(this),id));}
    function tournament(uint64 id) external view returns(Tournament memory){return tournaments[id];}
    function fixture(uint64 id,uint8 index) external view returns(Fixture memory){return fixtures[id][index];}
    function attemptCount(uint64 id,uint8 index) external view returns(uint256){return attempts[id][index].length;}
    function attemptRef(uint64 id,uint8 index,uint256 n) external view returns(T.Ref memory){return attempts[id][index][n];}
    function begin() external base locked returns(uint64 id){
        require(admissions&&catalog.setupSealed()&&block.timestamp>=nextAt,"tournament admission waiting");
        require(count==0||tournaments[count].status==Status.Complete||tournaments[count].status==Status.RepairWaiting,"tournament running");
        id=++count;Tournament storage t=tournaments[id];t.status=Status.Selecting;
        t.mode=uint8((id-1)%2);t.league=(id-1)%4>=2;t.catalogRevision=catalog.revision();t.scanCount=catalog.count();
        emit SelectionStarted(id,t.mode,t.league,t.scanCount);
    }
    function _older(address a,address b) private view returns(bool){
        uint64 aa=catalog.identity(a).lastTournament;uint64 bb=catalog.identity(b).lastTournament;
        return aa<bb||aa==bb&&a<b;
    }
    /// Bounded, restartable enumeration. Concurrent catalogue changes invalidate
    /// a partial selection instead of letting callers omit older available agents.
    function select(uint64 id,uint8 budget) external base locked {
        Tournament storage t=tournaments[id];require(t.status==Status.Selecting&&budget>0&&budget<=32,"selection budget");
        if(t.catalogRevision!=catalog.revision()){
            t.catalogRevision=catalog.revision();t.scanCount=catalog.count();t.cursor=0;t.selected=0;delete t.agents;
        }
        uint256 end=t.cursor+budget;if(end>t.scanCount)end=t.scanCount;
        while(t.cursor<end){
            address candidate=catalog.at(t.cursor++);if(!catalog.eligible(candidate,t.mode))continue;
            uint8 at=t.selected;
            if(at==8){if(!_older(candidate,t.agents[7]))continue;at=7;}else t.selected++;
            while(at>0&&_older(candidate,t.agents[at-1])){t.agents[at]=t.agents[at-1];at--;}
            t.agents[at]=candidate;
        }
        if(t.cursor!=t.scanCount||t.selected<8)return;
        for(uint8 i;i<8;i++){
            address agent=t.agents[i];t.controllers[i]=catalog.identity(agent).codeHash;t.seeds[i]=authority.seedElo(agent,t.mode);
            require(t.seeds[i]>=100,"unavailable ranking");catalog.reserve(agent,t.mode,token(id));catalog.participated(agent,id,token(id));
        }
        t.status=Status.Playing;t.startedAt=uint64(block.timestamp);
        emit TournamentStarted(id,t.agents,t.controllers,t.seeds);
    }
    function _pair(uint64 id,uint8 index) private view returns(address a,address b){
        Tournament storage t=tournaments[id];
        require(index<(t.league?28:7),"fixture range");
        if(t.league){(uint8 x,uint8 y)=R.leaguePair(index);return(t.agents[x],t.agents[y]);}
        if(index<4)return(t.agents[index*2],t.agents[index*2+1]);
        uint8 first=index==6?4:(index-4)*2;
        if(!fixtures[id][first].resolved||!fixtures[id][first+1].resolved)return(address(0),address(0));
        return(fixtures[id][first].advanced,fixtures[id][first+1].advanced);
    }
    function nextFixture(uint64 id) public view returns(uint8 index,address a,address b,bool ranked){
        Tournament storage t=tournaments[id];if(t.status!=Status.Playing)return(255,address(0),address(0),false);
        for(uint8 i;i<(t.league?28:7);i++){
            Fixture storage f=fixtures[id][i];if(f.bound&&!f.resolved)return(255,address(0),address(0),false);
            if(f.resolved)continue;(a,b)=_pair(id,i);if(a==address(0)||b==address(0))continue;
            return(i,a,b,catalog.identity(a).creator!=catalog.identity(b).creator);
        }return(255,address(0),address(0),false);
    }
    /// Only the immutable pool binds a genuinely admitted arena. It must snapshot
    /// these controller hashes and the knockout overtime flag before delegation.
    function bind(uint64 id,uint8 index,T.Ref calldata ref) external base locked {
        require(msg.sender==address(authority)&&ref.chainId==10143&&ref.arena!=address(0)&&ref.epoch>0&&ref.id>0,"arena authority");
        (uint8 next,address a,address b,)=nextFixture(id);require(next==index,"fixture order");
        bytes32 key=T.key(ref);require(!usedMatch[key],"match reused");usedMatch[key]=true;
        Fixture storage f=fixtures[id][index];f.ref=ref;f.a=a;f.b=b;f.bound=true;f.attempt++;
        attempts[id][index].push(ref);emit FixtureBound(id,index,key,f.attempt,a,b);
    }
    function _seed(Tournament storage t,address agent) private view returns(uint32){
        for(uint8 i;i<8;i++)if(t.agents[i]==agent)return t.seeds[i];revert("not an entrant");
    }
    function synchronize(uint64 id,uint8 index) external base locked {
        Tournament storage t=tournaments[id];Fixture storage f=fixtures[id][index];require(f.bound,"unbound match");
        T.Result memory r=authority.result(f.ref);
        require(T.same(r.ref,f.ref)&&r.a==f.a&&r.b==f.b&&r.mode==t.mode,"published binding");
        require(!f.published.finality||r.finality,"finality cannot decrease");
        // Finality changes alone do not invalidate a bracket.
        bytes32 value=keccak256(abi.encode(r.hash,r.status,r.winner,r.scoreA,r.scoreB,r.elapsedUs));
        if(value==f.resultDigest){f.published.finality=r.finality;return;}
        require(!f.published.finality,"final result immutable");
        if(f.resolved){
            t.revision++;emit TournamentCorrection(id,t.revision);
            if(!t.league)_invalidateChildren(id,index);
        }
        f.published=r;f.resultDigest=value;f.resolved=false;f.advanced=address(0);f.administrative=false;
        if(r.status==3&&r.hash!=0){
            require(r.scoreA<=7&&r.scoreB<=7&&(r.winner==f.a||r.winner==f.b||r.winner==address(0)&&r.scoreA==r.scoreB),"terminal result");
            if(!t.league&&r.winner==address(0)){
                require(r.elapsedUs>=360_000_000,"knockout overtime incomplete");
                f.advanced=R.betterSeed(f.a,f.b,_seed(t,f.a),_seed(t,f.b));f.administrative=true;
            }else{require(r.winner!=address(0)||r.elapsedUs>=300_000_000,"regulation incomplete");f.advanced=r.winner;}
            f.resolved=true;
        }
        if(t.status==Status.Complete&&!_allResolved(id)){
            t.status=Status.RepairWaiting;t.champion=address(0);
        }
        emit ResultApplied(id,index,r.hash,f.advanced,f.administrative,r.finality);
        if(t.status==Status.Playing)_complete(id);
        else if(t.status==Status.Complete)t.champion=t.league?standings(id)[0].agent:fixtures[id][6].advanced;
    }
    function _invalidateChildren(uint64 id,uint8 index) private {
        for(uint8 p=R.parent(index);p<7;p=R.parent(p)){
            Fixture storage f=fixtures[id][p];if(!f.bound&&!f.resolved)continue;
            emit BranchInvalidated(id,p,T.key(f.ref),tournaments[id].revision);
            // The old match remains in attempts and in the pool's result ledger.
            // It must finish independently; it can no longer advance this bracket.
            f.bound=false;f.resolved=false;f.advanced=address(0);f.resultDigest=0;delete f.published;
        }
    }
    function retryCancelled(uint64 id,uint8 index) external base locked {
        Fixture storage f=fixtures[id][index];require(f.bound&&!f.resolved&&f.published.status==4&&f.published.finality,"unfinalized cancellation");
        f.bound=false;f.resultDigest=0;delete f.published;
    }
    function resumeRepair(uint64 id) external base locked {
        Tournament storage t=tournaments[id];require(t.status==Status.RepairWaiting,"no repair waiting");
        // Existing challenges or newer tournaments keep their locks. Nothing is
        // interrupted to replay a corrected historical bracket.
        for(uint8 i;i<8;i++)catalog.reserve(t.agents[i],t.mode,token(id));
        t.status=Status.Playing;
    }
    function _allResolved(uint64 id) private view returns(bool){
        for(uint8 i;i<(tournaments[id].league?28:7);i++)if(!fixtures[id][i].resolved)return false;return true;
    }
    function _complete(uint64 id) private {
        if(!_allResolved(id))return;Tournament storage t=tournaments[id];t.status=Status.Complete;t.completedAt=uint64(block.timestamp);
        t.champion=t.league?standings(id)[0].agent:fixtures[id][6].advanced;
        for(uint8 i;i<8;i++)catalog.release(t.agents[i],token(id));
        if(id==count)nextAt=uint64(block.timestamp+1 minutes);
        emit TournamentCompleted(id,t.champion,nextAt);
    }
    function standings(uint64 id) public view returns(T.Standing[8] memory rows){
        Tournament storage t=tournaments[id];for(uint8 i;i<8;i++)rows[i]=T.Standing(t.agents[i],0,0,0,t.seeds[i]);
        if(!t.league)return rows;
        for(uint8 i;i<28;i++){
            Fixture storage f=fixtures[id][i];if(!f.resolved)continue;(uint8 a,uint8 b)=R.leaguePair(i);
            int16 delta=int16(uint16(f.published.scoreA))-int16(uint16(f.published.scoreB));rows[a].difference+=delta;rows[b].difference-=delta;
            if(f.published.winner==address(0)){rows[a].points++;rows[b].points++;}
            else{uint8 winner=f.published.winner==f.a?a:b;rows[winner].points+=3;rows[winner].wins++;}
        }return R.sort(rows);
    }
}
