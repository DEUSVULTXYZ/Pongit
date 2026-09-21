// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentQualifications} from "./AgentQualifications.sol";
import {HouseInstanceQualifications} from "./HouseInstanceQualifications.sol";
import {MigratingAgentCatalog,IRetiredAgentPool} from "./MigratingAgentCatalog.sol";

/// Preserves qualification order and per-mode retry deadlines. Historical
/// trials retain their original authority; a source correction's later retry
/// remains effective until a new independent verdict supersedes its evidence.
contract ContinuingAgentQualifications is HouseInstanceQualifications {
    AgentQualifications public immutable predecessor;
    bytes32 public immutable predecessorCodeHash;
    MigratingAgentCatalog public immutable importedCatalog;
    uint256 public imported;
    uint256 public sourceCursor;
    bool public importStarted;
    bool public continuationSealed;
    mapping(address=>mapping(uint8=>bytes32)) public inheritedEvidence;
    bytes32 public importDigest;
    event RetryImported(address indexed agent,uint8 indexed mode,uint64 retryAt,bytes32 evidence);
    event ContinuationSealed(address indexed source,uint256 cursor,bytes32 digest);
    constructor(AgentQualifications source,bytes32 expectedCodeHash,MigratingAgentCatalog c,address p)
        HouseInstanceQualifications(c,p)
    {
        require(address(source).codehash==expectedCodeHash&&expectedCodeHash!=0,"source qualification code");
        require(address(source.catalog())==address(c.predecessor())&&source.pool()==c.predecessor().arenaPool()
            &&IRetiredAgentPool(source.pool()).qualifications()==address(source),"source qualification binding");
        predecessor=source;predecessorCodeHash=expectedCodeHash;importedCatalog=c;
    }
    function _closedSource() private view {
        require(address(predecessor).codehash==predecessorCodeHash,"source qualification code");
        IRetiredAgentPool oldPool=IRetiredAgentPool(predecessor.pool());
        require(!oldPool.admissions()&&!oldPool.publicAdmissions(),"source qualifications open");
        require(importedCatalog.predecessor().revision()==importedCatalog.sourceRevision(),"source catalogue changed");
    }
    function startImport() external {
        require(block.chainid==10143&&msg.sender==catalog.owner()&&!importStarted,"import setup only");
        require(importedCatalog.setupSealed(),"catalog import incomplete");_closedSource();
        sourceCursor=predecessor.cursor();cursor=sourceCursor;importStarted=true;
        require(sourceCursor<importedCatalog.sourceCount()*2,"source qualification cursor");
        importDigest=keccak256(abi.encode(block.chainid,address(predecessor),predecessorCodeHash,sourceCursor,importedCatalog.importDigest()));
    }
    function importPage(uint8 budget) external {
        require(block.chainid==10143&&msg.sender==catalog.owner()&&importStarted&&!continuationSealed&&budget>0&&budget<=32,"import page bounds");
        _closedSource();require(predecessor.cursor()==sourceCursor,"source qualification changed");
        uint256 end=imported+budget;if(end>importedCatalog.sourceCount())end=importedCatalog.sourceCount();
        while(imported<end){
            address agent=catalog.at(imported);
            for(uint8 mode;mode<2;mode++){
                uint64 retry=predecessor.retryAt(agent,mode);bytes32 evidence=catalog.qualificationEvidence(agent,mode);
                retries[agent][mode]=retry;inheritedEvidence[agent][mode]=evidence;
                importDigest=keccak256(abi.encode(importDigest,agent,mode,retry,evidence));
                emit RetryImported(agent,mode,retry,evidence);
            }
            imported++;
        }
    }
    function sealContinuation() external {
        require(block.chainid==10143&&msg.sender==catalog.owner()&&importStarted&&!continuationSealed&&imported==importedCatalog.sourceCount(),"incomplete qualification import");
        _closedSource();require(predecessor.cursor()==sourceCursor,"source qualification changed");
        continuationSealed=true;emit ContinuationSealed(address(predecessor),sourceCursor,importDigest);
    }
    function retryAt(address agent,uint8 mode) public view override returns(uint64 retry){
        retry=super.retryAt(agent,mode);
        if(importStarted&&importedCatalog.qualificationInherited(agent,mode)){
            require(address(predecessor).codehash==predecessorCodeHash,"source qualification code");
            uint64 old=predecessor.retryAt(agent,mode);if(old>retry)retry=old;
        }
    }
    function _takeNext(uint256 baseBlock) internal override returns(address a,address b,uint8 mode){
        require(continuationSealed,"qualification continuation not sealed");return super._takeNext(baseBlock);
    }
}
