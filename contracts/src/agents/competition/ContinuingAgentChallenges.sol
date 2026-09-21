// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentChallenges} from "./AgentChallenges.sol";
import {HouseInstanceChallenges} from "./HouseInstanceChallenges.sol";
import {MigratingAgentCatalog,IRetiredAgentPool} from "./MigratingAgentCatalog.sol";

/// Carries queued requests across a pool replacement without a new root grant.
/// Historical in-flight duels must finish on their original pool first. The old
/// queue remains readable; cancelling there still cancels a waiting imported
/// request, but cannot concede a duel already admitted by the new authority.
contract ContinuingAgentChallenges is HouseInstanceChallenges {
    AgentChallenges public immutable predecessor;
    bytes32 public immutable predecessorCodeHash;
    MigratingAgentCatalog public immutable importedCatalog;
    uint256 public inheritedCount;
    uint256 public imported;
    bool public importStarted;
    bool public continuationSealed;
    bytes32 public importDigest;
    event RequestImported(uint256 indexed id,address indexed player,uint8 status);
    event ContinuationSealed(address indexed source,uint256 count,bytes32 digest);

    constructor(AgentChallenges source,bytes32 expectedCodeHash,MigratingAgentCatalog c,address p,address admin)
        HouseInstanceChallenges(source.family(),c,p,admin)
    {
        require(address(source).codehash==expectedCodeHash&&expectedCodeHash!=0,"source queue code");
        require(source.owner()==admin&&address(source.catalog())==address(c.predecessor())
            &&source.pool()==c.predecessor().arenaPool()
            &&IRetiredAgentPool(source.pool()).challenges()==address(source),"source queue binding");
        predecessor=source;predecessorCodeHash=expectedCodeHash;importedCatalog=c;
    }
    function _closedSource() private view {
        require(address(predecessor).codehash==predecessorCodeHash,"source queue code");
        IRetiredAgentPool oldPool=IRetiredAgentPool(predecessor.pool());
        require(!predecessor.admissions()&&!oldPool.admissions()&&!oldPool.publicAdmissions(),"source queue open");
    }
    function startImport() external {
        require(block.chainid==10143&&msg.sender==owner&&!importStarted&&!admissions,"import setup only");
        _closedSource();require(importedCatalog.setupSealed(),"catalog import incomplete");
        require(importedCatalog.predecessor().revision()==importedCatalog.sourceRevision(),"source catalogue changed");
        inheritedCount=predecessor.count();count=inheritedCount;
        cursor=predecessor.cursor();require(cursor>0&&(count==0?cursor==1:cursor<=count),"source cursor");
        importStarted=true;importDigest=keccak256(abi.encode(block.chainid,address(predecessor),predecessorCodeHash,count,cursor));
    }
    function importPage(uint8 budget) external {
        require(block.chainid==10143&&msg.sender==owner&&importStarted&&!continuationSealed&&budget>0&&budget<=32,"import page bounds");
        _closedSource();require(predecessor.count()==inheritedCount,"source queue changed");
        uint256 end=imported+budget;if(end>inheritedCount)end=inheritedCount;
        while(imported<end){
            uint256 id=imported+1;
            (address player,address agent,uint8 mode,uint8 status,uint64 at,bytes32 grant)=predecessor.requests(id);
            require(player!=address(0)&&agent!=address(0)&&mode<2&&grant!=0&&status>=1&&status<=4,"source request");
            require(status!=2,"source duel still active");
            Request memory r=Request(player,agent,mode,status,at,grant);requests[id]=r;
            if(status==1){
                require(predecessor.pending(player)==id&&pending[player]==0,"source waiting request");
                require(catalog.identity(agent).creator!=address(0),"source agent missing");pending[player]=id;
            }
            // This is a different EIP-712 domain. Preserve the observed counter
            // for each encountered grant, never its signatures or private key.
            uint256 nonce=predecessor.nonces(grant);if(nonce>nonces[grant])nonces[grant]=nonce;
            importDigest=keccak256(abi.encode(importDigest,id,r,nonce));imported=id;
            emit RequestImported(id,player,status);
        }
    }
    function sealContinuation() external {
        require(block.chainid==10143&&msg.sender==owner&&importStarted&&!continuationSealed&&imported==inheritedCount,"incomplete queue import");
        _closedSource();require(predecessor.count()==inheritedCount,"source queue changed");
        continuationSealed=true;emit ContinuationSealed(address(predecessor),inheritedCount,importDigest);
    }
    function setAdmissions(bool value) public override {
        require(!value||continuationSealed,"queue continuation not sealed");
        if(value)_closedSource();super.setAdmissions(value);
    }
    function _refreshRequest(uint256 id) internal override {
        require(continuationSealed,"queue continuation not sealed");
        if(id==0||id>inheritedCount||requests[id].status!=1)return;
        _closedSource();
        (,,,uint8 sourceStatus,,)=predecessor.requests(id);
        if(sourceStatus==1)return;
        require(sourceStatus==3,"source request changed unexpectedly");
        Request storage r=requests[id];r.status=3;
        if(pending[r.player]==id)delete pending[r.player];
        emit ChallengeChanged(id,r.player,r.agent,3);
    }
    function synchronizeWaiting(uint256 id) external {
        require(block.chainid==10143,"Monad challenges only");_refreshRequest(id);
    }
    function command(address player,uint8 action,address agent,uint8 mode,uint256 id,uint256 nonce,uint64 deadline,bytes calldata signature)
        public override returns(uint256)
    {
        _refreshRequest(pending[player]);
        return super.command(player,action,agent,mode,id,nonce,deadline,signature);
    }
}
