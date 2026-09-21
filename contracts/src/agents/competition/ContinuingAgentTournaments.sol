// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentTournaments} from "./AgentTournaments.sol";
import {MigratingAgentCatalog,IRetiredAgentPool} from "./MigratingAgentCatalog.sol";
import {CompetitionTypes as T,ICompetitionAuthority} from "./CompetitionTypes.sol";

/// Continues numbering and the four-format cycle without rewriting old results.
/// Historical reads retain the old authority. Its correction jobs must continue
/// there; rating migration remains a separate release gate.
contract ContinuingAgentTournaments is AgentTournaments {
    MigratingAgentCatalog public immutable importedCatalog;
    AgentTournaments public immutable predecessor;
    uint64 public inheritedCount;
    bool public continuationSealed;
    event ContinuationSealed(address indexed predecessor,uint64 count,uint64 nextAt,bytes32 catalogDigest);
    constructor(MigratingAgentCatalog c,ICompetitionAuthority pool,address admin)
        AgentTournaments(c,pool,admin)
    {
        require(c.owner()==admin,"import owner");importedCatalog=c;
        predecessor=AgentTournaments(c.predecessor().competition());
        require(predecessor.owner()==admin,"source tournament owner");
    }
    function sealContinuation() external base {
        require(msg.sender==owner&&!continuationSealed&&!admissions&&count==0,"continuation setup only");
        require(importedCatalog.setupSealed()&&catalog.competition()==address(this)
            &&catalog.arenaPool()==address(authority),"import and authority binding");
        require(!predecessor.admissions(),"source tournament admission open");
        IRetiredAgentPool oldPool=IRetiredAgentPool(address(predecessor.authority()));
        require(!oldPool.admissions()&&!oldPool.publicAdmissions(),"source pool admission open");
        uint64 n=predecessor.count();
        require(n==importedCatalog.sourceTournamentCount()&&predecessor.nextAt()==importedCatalog.sourceNextTournamentAt()
            &&importedCatalog.predecessor().revision()==importedCatalog.sourceRevision(),"source changed after import");
        require(n==0||predecessor.tournament(n).status==Status.Complete,"source tournament unfinished");
        inheritedCount=n;count=n;nextAt=predecessor.nextAt();continuationSealed=true;
        // Only a local admission sentinel. Historical reads always use source;
        // no legacy fixture can be synchronized or rebound through this book.
        if(n!=0)tournaments[n].status=Status.Complete;
        emit ContinuationSealed(address(predecessor),n,nextAt,importedCatalog.importDigest());
    }
    function setAdmissions(bool value) public override {
        require(!value||continuationSealed,"continuation not sealed");super.setAdmissions(value);
    }
    function _historical(uint64 id) private view returns(bool){return id!=0&&id<=inheritedCount;}
    function tournament(uint64 id) public view override returns(Tournament memory){
        return _historical(id)?predecessor.tournament(id):super.tournament(id);
    }
    function fixture(uint64 id,uint8 index) public view override returns(Fixture memory){
        return _historical(id)?predecessor.fixture(id,index):super.fixture(id,index);
    }
    function attemptCount(uint64 id,uint8 index) public view override returns(uint256){
        return _historical(id)?predecessor.attemptCount(id,index):super.attemptCount(id,index);
    }
    function attemptRef(uint64 id,uint8 index,uint256 n) public view override returns(T.Ref memory){
        return _historical(id)?predecessor.attemptRef(id,index,n):super.attemptRef(id,index,n);
    }
    function standings(uint64 id) public view override returns(T.Standing[8] memory){
        return _historical(id)?predecessor.standings(id):super.standings(id);
    }
}
