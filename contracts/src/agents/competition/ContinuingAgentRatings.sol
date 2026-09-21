// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentPublishedRatings} from "./AgentPublishedRatings.sol";
import {IndependentTypes as T} from "../../independent/IndependentTypes.sol";

interface IRatingSourcePool {
    function admissions() external view returns(bool);
    function publicAdmissions() external view returns(bool);
    function laneMatch(uint256) external view returns(bytes32);
    function ratings() external view returns(address);
}

/// Replays the complete ordered ledger, including original timestamps, instead
/// of seeding a new season from today's displayed ELO. Requires a separately
/// published audit proving that the source started WITHOUT rating/pair seeds.
/// The owner pins that audit; this is not an on-chain proof of private mappings.
contract ContinuingAgentRatings is AgentPublishedRatings {
    AgentPublishedRatings public immutable predecessor;
    bytes32 public immutable predecessorCodeHash;
    bytes32 public immutable emptySeedAudit;
    bytes32 public immutable predecessorSeal;
    IRatingSourcePool public immutable sourcePool;
    uint256 public sourceCount;
    uint256 public sourceRevision;
    uint256 public imported;
    uint256[2] public checkedPlayers;
    bool public importStarted;
    uint256 public synchronizationCursor;
    uint256 public observedRevision;
    event HistoryImported(uint256 count,uint256 revision,bytes32 audit);
    event HistorySynchronized(uint256 revision);

    constructor(AgentPublishedRatings source,bytes32 expectedCodeHash,bytes32 expectedSeal,bytes32 audit,address pool,address admin)
        AgentPublishedRatings(pool,admin,source.genesisTime())
    {
        require(address(source).codehash==expectedCodeHash&&expectedCodeHash!=0,"source ratings code");
        require(source.migrationOwner()==admin&&source.migrationSealed()&&source.migrationEvidence()==expectedSeal
            &&expectedSeal!=0&&audit!=0,"audited empty source required");
        predecessor=source;predecessorCodeHash=expectedCodeHash;predecessorSeal=expectedSeal;emptySeedAudit=audit;
        sourcePool=IRatingSourcePool(source.lobby());require(sourcePool.ratings()==address(source),"source ratings binding");
    }
    function _closedSource() private view {
        require(address(predecessor).codehash==predecessorCodeHash,"source ratings code");
        require(!sourcePool.admissions()&&!sourcePool.publicAdmissions()&&sourcePool.laneMatch(0)==0&&sourcePool.laneMatch(1)==0,"source ratings still active");
    }
    function _unchangedImport() private view {
        _closedSource();require(importStarted&&!migrationSealed&&predecessor.count()==sourceCount
            &&predecessor.revision()==sourceRevision&&predecessor.buildGeneration()==0,"source ratings changed during import");
    }
    function startImport() external {
        require(block.chainid==10143&&msg.sender==migrationOwner&&!importStarted,"import setup only");
        _closedSource();require(predecessor.buildGeneration()==0,"source ranking correction");
        sourceCount=predecessor.count();sourceRevision=predecessor.revision();importStarted=true;
    }
    function importPage(uint8 budget) external {
        require(block.chainid==10143&&msg.sender==migrationOwner&&budget>0&&budget<=32,"import page bounds");
        _unchangedImport();uint256 end=imported+budget;if(end>sourceCount)end=sourceCount;
        while(imported<end){
            (Entry[] memory page,uint256 total)=predecessor.resultPage(sourceCount-1-imported,1);
            require(total==sourceCount&&page.length==1,"source ledger page");Entry memory e=page[0];
            require(e.first.id!=0&&e.first.id==e.latest.id&&indexOf[e.first.id]==0&&e.at>=genesisTime,"source ledger identity");
            _terminal(e.first);if(e.finality)_terminal(e.latest);
            indexOf[e.first.id]=entries.length+1;entries.push(e);
            if(e.first.ranked){_add(e.first.a,e.first.mode);_add(e.first.b,e.first.mode);}
            _apply(generation,imported);imported++;
        }
    }
    function verifyPlayers(uint8 mode,uint8 budget) external {
        require(block.chainid==10143&&msg.sender==migrationOwner&&mode<2&&budget>0&&budget<=32,"verification bounds");
        _unchangedImport();require(imported==sourceCount,"incomplete history import");
        (address[] memory page,uint256 total)=predecessor.playerPage(mode,checkedPlayers[mode],budget);
        (,uint256 ours)=this.playerPage(mode,0,0);require(ours==total,"source contains unreplayed rating seeds");
        for(uint256 i;i<page.length;i++){
            require(keccak256(abi.encode(super.ratingOf(page[i],mode)))==keccak256(abi.encode(predecessor.ratingOf(page[i],mode))),"rating replay differs from source");
            checkedPlayers[mode]++;
        }
    }
    function finishImport() external {
        require(block.chainid==10143&&msg.sender==migrationOwner,"import owner only");_unchangedImport();
        require(imported==sourceCount,"incomplete history import");
        for(uint8 mode;mode<2;mode++){
            (,uint256 total)=predecessor.playerPage(mode,0,0);(,uint256 ours)=this.playerPage(mode,0,0);
            require(checkedPlayers[mode]==total&&ours==total,"incomplete rating verification");
        }
        migrationEvidence=keccak256(abi.encode(address(predecessor),predecessorCodeHash,predecessorSeal,emptySeedAudit,genesisTime,sourceCount,sourceRevision));
        migrationSealed=true;emit HistoryImported(sourceCount,sourceRevision,emptySeedAudit);
    }
    function _sourceReady() private view {
        _closedSource();require(predecessor.count()==sourceCount,"source history grew after migration");
        require(migrationSealed&&synchronizationCursor==0&&predecessor.revision()==sourceRevision,"historical ranking synchronization required");
    }
    function ratingOf(address p,uint8 mode) public view override returns(Rating memory){_sourceReady();return super.ratingOf(p,mode);}
    function publish(T.Result calldata r,bool finality) public override {_sourceReady();super.publish(r,finality);}
    function reconcile(T.Result calldata r,bool finality) public override {
        require(indexOf[r.id]>sourceCount,"historical result belongs to predecessor");super.reconcile(r,finality);
    }
    /// A source correction blocks new ranked use until a complete, consistent
    /// scan has installed it. Rebuild retains the base ledger's atomic swap.
    function synchronizeHistory(uint8 budget) external {
        require(block.chainid==10143&&migrationSealed&&budget>0&&budget<=32,"history synchronization bounds");
        _closedSource();require(predecessor.count()==sourceCount,"source history grew after migration");
        uint256 current=predecessor.revision();
        if(synchronizationCursor==0||observedRevision!=current){synchronizationCursor=0;observedRevision=current;}
        uint256 end=synchronizationCursor+budget;if(end>sourceCount)end=sourceCount;
        while(synchronizationCursor<end){
            Entry memory source=predecessor.entry(entries[synchronizationCursor].first.id);
            _reconcile(source.latest,source.finality);synchronizationCursor++;
        }
        require(predecessor.revision()==observedRevision,"source changed during synchronization");
        if(synchronizationCursor==sourceCount){sourceRevision=observedRevision;synchronizationCursor=0;emit HistorySynchronized(sourceRevision);}
    }
    function seed(address[] calldata,uint8,Rating[] calldata) public pure override {revert("replay source ledger only");}
    function seedPairCounts(bytes32[] calldata,uint8[] calldata) public pure override {revert("replay source ledger only");}
    function sealMigration(bytes32) public pure override {revert("finish verified import only");}
}
