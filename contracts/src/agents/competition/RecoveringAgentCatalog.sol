// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";
import {AgentTournaments} from "./AgentTournaments.sol";
import {MigratingAgentCatalogBase,IRetiredAgentPool,RetiredAgentLanes} from "./MigratingAgentCatalog.sol";

/// Explicit disaster migration. It retires only a stopped tournament's locks;
/// it never edits the predecessor, fabricates results or releases a live match.
contract RecoveringAgentCatalog is MigratingAgentCatalogBase {
    uint64 private retiredId;
    bytes32 private retiredDigest;
    bytes32 private reason;
    event TournamentRetirementAuthorized(address indexed book,uint64 indexed id,bytes32 evidence,bytes32 reason);
    constructor(AgentCatalog source,bytes32 hash,address admin,address qualification,address builtin)
        MigratingAgentCatalogBase(source,hash,admin,qualification,builtin) {}
    function retiredTournament() public view override returns(uint64){return retiredId;}
    function retirementEvidence() public view override returns(bytes32){return retiredDigest;}
    function retirementReason() public view override returns(bytes32){return reason;}
    function _snapshot(AgentTournaments book,uint64 id) private view returns(bytes32 digest){
        AgentTournaments.Tournament memory t=book.tournament(id);
        require(id!=0&&id==book.count()&&t.status==AgentTournaments.Status.Playing,"only latest stopped playing tournament");
        require(t.champion==address(0)&&t.completedAt==0,"cannot retire a completed result");
        digest=keccak256(abi.encode(address(book),id,t));
        for(uint8 i;i<(t.league?28:7);i++){
            AgentTournaments.Fixture memory f=book.fixture(id,i);
            // Every admitted result must be final before its identity lock can
            // be retired. Unbound future fixtures retain no invented score.
            if(f.bound)require(f.published.finality&&((f.resolved&&f.published.status==3)
                ||(!f.resolved&&f.published.status==4)),"unfinalized source fixture");
            digest=keccak256(abi.encode(digest,i,f,book.attemptCount(id,i)));
        }
    }
    function authorizeRetirement(uint64 id,bytes32 why) external base {
        require(msg.sender==owner&&!importStarted&&!setupSealed&&retiredId==0&&why!=0,"retirement setup only");
        AgentTournaments book=AgentTournaments(predecessor.competition());
        IRetiredAgentPool pool=IRetiredAgentPool(predecessor.arenaPool());
        require(!pool.admissions()&&!pool.publicAdmissions()&&!book.admissions(),"source admissions open");
        RetiredAgentLanes.requireIdle(address(pool));
        retiredDigest=_snapshot(book,id);retiredId=id;reason=why;
        emit TournamentRetirementAuthorized(address(book),id,retiredDigest,why);
    }
    function _requireSourceTournament(AgentTournaments book,uint64 n) internal view override {
        require(retiredId!=0&&n==retiredId&&_snapshot(book,n)==retiredDigest,"retired source changed");
    }
    function _requireSourceParticipation(address agent) internal view override {
        bytes32 lock=predecessor.participation(agent);if(lock==0)return;
        AgentTournaments book=AgentTournaments(predecessor.competition());
        require(retiredId!=0&&lock==book.token(retiredId),"unrelated source participation");
        AgentTournaments.Tournament memory t=book.tournament(retiredId);
        for(uint8 i;i<8;i++)if(t.agents[i]==agent)return;
        revert("not a retired entrant");
    }
}
