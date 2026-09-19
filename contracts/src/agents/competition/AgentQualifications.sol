// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";
import {CompetitionTypes as T} from "./CompetitionTypes.sol";

/// Automatic selection and proof of technical compatibility. The pool alone
/// supplies contract-published results and controller counters. Winning is not
/// required; a canceled/expired engine never becomes a failed strategy verdict.
contract AgentQualifications {
    struct Trial {T.Ref ref;address a;address b;uint8 mode;uint8 prior;bytes32 hash;bytes32 evidenceA;bytes32 evidenceB;bool recorded;}
    AgentCatalog public immutable catalog;
    address public immutable pool;
    uint256 public cursor;
    mapping(bytes32=>Trial) public trials;
    mapping(address=>mapping(uint8=>uint64)) public retryAt;
    event TrialBound(bytes32 indexed ref,address indexed a,address indexed b,uint8 mode);
    event TrialObserved(bytes32 indexed ref,bool completed,bool passedA,bool passedB,bytes32 resultHash);
    constructor(AgentCatalog c,address p){require(address(c).code.length>0&&p!=address(0),"qualification roles");catalog=c;pool=p;}
    modifier onlyPool(){require(block.chainid==10143&&msg.sender==pool,"Monad pool only");_;}
    function takeNext() external onlyPool returns(address a,address b,uint8 mode){
        uint256 n=catalog.count()*2;if(n==0)return(a,b,mode);
        for(uint256 i;i<32&&i<n;i++){
            uint256 position=cursor%n;cursor=(position+1)%n;a=catalog.at(position/2);mode=uint8(position%2);
            if(catalog.identity(a).qualified&(1<<mode)!=0||retryAt[a][mode]>block.timestamp||!catalog.qualificationEligible(a,mode))continue;
            for(uint8 j;j<8;j++){
                b=catalog.house((j+2)%8);
                if(b!=a&&catalog.qualificationEligible(b,mode))return(a,b,mode);
            }
        }
        return(address(0),address(0),0);
    }
    function bind(T.Ref calldata ref,address a,address b,uint8 mode) external onlyPool {
        bytes32 key=T.key(ref);require(trials[key].ref.id==0&&ref.id!=0&&a!=b&&a!=address(0)&&b!=address(0)&&mode<2,"qualification reference");
        uint8 prior=(catalog.identity(a).qualified&(1<<mode)!=0?1:0)|(catalog.identity(b).qualified&(1<<mode)!=0?2:0);
        trials[key]=Trial(ref,a,b,mode,prior,0,catalog.qualificationEvidence(a,mode),catalog.qualificationEvidence(b,mode),false);emit TrialBound(key,a,b,mode);
    }
    function complete(T.Result calldata r,uint256 brainA,uint256 brainB) external onlyPool {
        bytes32 key=T.key(r.ref);Trial storage t=trials[key];require(t.ref.id!=0&&t.a==r.a&&t.b==r.b&&t.mode==r.mode,"qualification binding");
        bytes32 evidence=keccak256(abi.encode(key,r.hash,brainA,brainB,r.status));if(t.recorded&&t.hash==evidence)return;
        bool completed=r.status==3;bool passedA=completed&&uint32(brainA>>192)>=3&&uint32(brainA>>224)==0;
        bool passedB=completed&&uint32(brainB>>192)>=3&&uint32(brainB>>224)==0;
        // An engine cancellation is a retry. A later correction removes a prior
        // qualification; it does not label a technical interruption dishonest.
        if(completed||t.recorded){
            // Do not let a correction of an old trial erase a newer independent
            // qualification. A technical cancellation restores prior standing.
            if(catalog.qualificationEvidence(t.a,t.mode)==t.evidenceA){
                catalog.qualify(t.a,t.mode,completed?passedA:t.prior&1!=0,evidence);t.evidenceA=evidence;
                retryAt[t.a][t.mode]=uint64(block.timestamp+(completed&&!passedA?15 minutes:1 minutes));
            }
            if(catalog.qualificationEvidence(t.b,t.mode)==t.evidenceB){
                catalog.qualify(t.b,t.mode,completed?passedB:t.prior&2!=0,evidence);t.evidenceB=evidence;
                retryAt[t.b][t.mode]=uint64(block.timestamp+(completed&&!passedB?15 minutes:1 minutes));
            }
        }else{
            retryAt[t.a][t.mode]=uint64(block.timestamp+1 minutes);
            retryAt[t.b][t.mode]=uint64(block.timestamp+1 minutes);
        }
        t.hash=evidence;t.recorded=true;emit TrialObserved(key,completed,passedA,passedB,r.hash);
    }
}
