// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PublishedRatings} from "./PublishedRatings.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";

interface IHumanRatingSource {
    function ratings() external view returns(address);
    function slot(uint256) external view returns(uint256);
}

/// Preserve the ordered human ledger and its ORIGINAL seeds, not a snapshot of
/// current ELO. The seed digest must come from an independently verified source
/// storage/transaction audit: old deployments have no public seed getters.
/// Source admission services must be drained and retired before import. The
/// immutable old lobby has no gate; any later result blocks ranked use here
/// instead of silently discarding it. Neither import nor correction closes an arena.
contract ContinuingHumanRatings is PublishedRatings {
    PublishedRatings public immutable predecessor;
    bytes32 public immutable predecessorCodeHash;
    bytes32 public immutable predecessorSeal;
    bytes32 public immutable seedAudit;
    bytes32 public immutable expectedSeedDigest;
    bytes32 public seedDigest;
    IHumanRatingSource public immutable sourceLobby;
    uint256 public sourceCount;
    uint256 public sourceRevision;
    uint256 public imported;
    uint256[2] public checkedPlayers;
    bool public importStarted;
    uint256 public synchronizationCursor;
    uint256 public observedRevision;
    event HistoryImported(uint256 count,uint256 revision,bytes32 audit);
    event HistorySynchronized(uint256 revision);

    constructor(PublishedRatings source,bytes32 codeHash,bytes32 seal,bytes32 audit,bytes32 seedsHash,address targetLobby,address admin)
        PublishedRatings(targetLobby,admin,source.genesisTime())
    {
        require(address(source).codehash==codeHash&&codeHash!=0,"source ratings code");
        require(source.migrationOwner()==admin&&source.migrationSealed()&&source.migrationEvidence()==seal
            &&seal!=0&&audit!=0,"audited source required");
        predecessor=source;predecessorCodeHash=codeHash;predecessorSeal=seal;seedAudit=audit;expectedSeedDigest=seedsHash;
        sourceLobby=IHumanRatingSource(source.lobby());require(sourceLobby.ratings()==address(source),"source ratings binding");
    }
    function _idleSource() private view {
        require(address(predecessor).codehash==predecessorCodeHash,"source ratings code");
        require(sourceLobby.slot(0)==0&&sourceLobby.slot(1)==0,"source match pending");
    }
    function _unchanged() private view {
        _idleSource();require(importStarted&&!migrationSealed&&predecessor.count()==sourceCount
            &&predecessor.revision()==sourceRevision&&predecessor.buildGeneration()==0,"source changed during import");
    }
    function seed(address[] calldata accounts,uint8 mode,Rating[] calldata values) public override {
        require(!importStarted,"seed import closed");super.seed(accounts,mode,values);
        seedDigest=keccak256(abi.encode(seedDigest,uint8(0),accounts,mode,values));
    }
    function seedPairCounts(bytes32[] calldata pairs,uint8[] calldata values) public override {
        require(!importStarted,"seed import closed");super.seedPairCounts(pairs,values);
        seedDigest=keccak256(abi.encode(seedDigest,uint8(1),pairs,values));
    }
    function startImport() external {
        require(block.chainid==10143&&msg.sender==migrationOwner&&!importStarted,"import setup only");
        _idleSource();require(predecessor.buildGeneration()==0,"source ranking correction");
        require(seedDigest==expectedSeedDigest,"original seeds differ from audit");
        sourceCount=predecessor.count();sourceRevision=predecessor.revision();importStarted=true;
    }
    function importPage(uint8 budget) external {
        require(block.chainid==10143&&msg.sender==migrationOwner&&budget>0&&budget<=32,"import page bounds");
        _unchanged();uint256 end=imported+budget;if(end>sourceCount)end=sourceCount;
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
        _unchanged();require(imported==sourceCount,"incomplete history import");
        (address[] memory page,uint256 total)=predecessor.playerPage(mode,checkedPlayers[mode],budget);
        (,uint256 ours)=this.playerPage(mode,0,0);require(ours==total,"source players differ");
        for(uint256 i;i<page.length;i++){
            require(keccak256(abi.encode(super.ratingOf(page[i],mode)))==keccak256(abi.encode(predecessor.ratingOf(page[i],mode))),"rating replay differs from source");
            checkedPlayers[mode]++;
        }
    }
    function finishImport() external {
        require(block.chainid==10143&&msg.sender==migrationOwner,"import owner only");_unchanged();
        require(imported==sourceCount,"incomplete history import");
        for(uint8 mode;mode<2;mode++){
            (,uint256 total)=predecessor.playerPage(mode,0,0);(,uint256 ours)=this.playerPage(mode,0,0);
            require(checkedPlayers[mode]==total&&ours==total,"incomplete rating verification");
        }
        migrationEvidence=keccak256(abi.encode(address(predecessor),predecessorCodeHash,predecessorSeal,seedAudit,seedDigest,genesisTime,sourceCount,sourceRevision));
        migrationSealed=true;emit HistoryImported(sourceCount,sourceRevision,seedAudit);
    }
    function _sourceReady() private view {
        require(predecessor.count()==sourceCount,"source history grew after migration");
        require(migrationSealed&&synchronizationCursor==0&&predecessor.revision()==sourceRevision,"historical ranking synchronization required");
    }
    function ratingOf(address p,uint8 mode) public view override returns(Rating memory){_sourceReady();return super.ratingOf(p,mode);}
    function publish(T.Result calldata r,bool finality) public override {_sourceReady();super.publish(r,finality);}
    function reconcile(T.Result calldata r,bool finality) public override {
        require(indexOf[r.id]>sourceCount,"historical result belongs to predecessor");super.reconcile(r,finality);
    }
    function synchronizeHistory(uint8 budget) external {
        require(block.chainid==10143&&migrationSealed&&budget>0&&budget<=32,"history synchronization bounds");
        require(predecessor.count()==sourceCount,"source history grew after migration");
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
    function historyChanged(uint256 offset,uint8 budget) external view returns(bool changed,uint256 next){
        require(migrationSealed&&budget>0&&budget<=32&&offset<=sourceCount,"history observation bounds");
        require(predecessor.count()==sourceCount,"source history grew after migration");
        if(predecessor.revision()!=sourceRevision||synchronizationCursor!=0)return(true,offset);
        uint256 end=offset+budget;if(end>sourceCount)end=sourceCount;
        for(uint256 i=offset;i<end;i++)if(predecessor.entry(entries[i].first.id).finality!=entries[i].finality)return(true,offset);
        return(false,end==sourceCount?0:end);
    }
    function sealMigration(bytes32) public pure override {revert("finish verified import only");}
}
