// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentCatalog} from "./AgentCatalog.sol";
import {AgentTournaments} from "./AgentTournaments.sol";

interface IRetiredAgentPool {
    function admissions() external view returns(bool);
    function publicAdmissions() external view returns(bool);
    function nonce() external view returns(uint256);
    function laneMatch(uint256 lane) external view returns(bytes32);
    function challenges() external view returns(address);
    function qualifications() external view returns(address);
}

/// Imports the actual Monad registry, never an operator-supplied identity list.
/// All pages belong to one source revision. A concurrent source edit invalidates
/// this candidate; it cannot quietly mix identities from different snapshots.
/// This does not migrate results, queues or grants and is not an opening switch.
contract MigratingAgentCatalog is AgentCatalog {
    AgentCatalog public immutable predecessor;
    bytes32 public immutable predecessorCodeHash;
    uint256 public sourceRevision;
    uint256 public sourceCount;
    uint64 public sourceTournamentCount;
    uint64 public sourceNextTournamentAt;
    uint256 public sourceMatchNonce;
    uint256 public imported;
    bool public importStarted;
    bytes32 public importDigest;
    mapping(address=>bool) public inheritedIdentity;
    mapping(address=>mapping(uint8=>bool)) private independentVerdict;
    event ImportStarted(address indexed source,uint256 revision,uint256 count,uint64 tournaments);
    event IdentityImported(address indexed strategy,uint256 index,bytes32 digest);
    event ImportSealed(address indexed source,uint256 revision,uint256 count,bytes32 digest);

    constructor(AgentCatalog source,bytes32 expectedCodeHash,address admin,address qualification)
        AgentCatalog(admin,qualification,source.houseController())
    {
        require(address(source).codehash==expectedCodeHash&&expectedCodeHash!=0,"source code hash");
        require(source.setupSealed()&&source.owner()==admin,"sealed source owner");
        require(source.houseCodeHash()==houseCodeHash,"official controller changed");
        predecessor=source;predecessorCodeHash=expectedCodeHash;
    }

    function _closedSource() private view {
        require(address(predecessor).codehash==predecessorCodeHash,"source code changed");
        IRetiredAgentPool pool=IRetiredAgentPool(predecessor.arenaPool());
        AgentTournaments book=AgentTournaments(predecessor.competition());
        require(!pool.admissions()&&!pool.publicAdmissions()&&!book.admissions(),"source admissions open");
        require(pool.laneMatch(0)==0&&pool.laneMatch(1)==0,"source matches still active");
        uint64 n=book.count();
        require(n==0||book.tournament(n).status==AgentTournaments.Status.Complete,"source tournament unfinished");
        require(houseController.codehash==houseCodeHash,"official controller changed");
    }
    function startImport() external base {
        require(msg.sender==owner&&!importStarted&&!setupSealed,"import setup only");
        _closedSource();
        sourceRevision=predecessor.revision();sourceCount=predecessor.count();
        sourceMatchNonce=IRetiredAgentPool(predecessor.arenaPool()).nonce();
        AgentTournaments book=AgentTournaments(predecessor.competition());
        sourceTournamentCount=book.count();sourceNextTournamentAt=book.nextAt();
        require(sourceCount>=8,"source identities");importStarted=true;
        importDigest=keccak256(abi.encode(block.chainid,address(predecessor),predecessorCodeHash,
            sourceRevision,sourceCount,sourceTournamentCount,sourceNextTournamentAt,sourceMatchNonce));
        emit ImportStarted(address(predecessor),sourceRevision,sourceCount,sourceTournamentCount);
    }
    function _unchangedSource() private view {
        require(importStarted,"import not started");_closedSource();
        AgentTournaments book=AgentTournaments(predecessor.competition());
        require(predecessor.revision()==sourceRevision&&predecessor.count()==sourceCount
            &&book.count()==sourceTournamentCount&&book.nextAt()==sourceNextTournamentAt
            &&IRetiredAgentPool(predecessor.arenaPool()).nonce()==sourceMatchNonce,"source changed during import");
    }
    function importPage(uint8 budget) external base {
        require(msg.sender==owner&&!setupSealed&&budget>0&&budget<=32,"import page bounds");
        _unchangedSource();uint256 end=imported+budget;if(end>sourceCount)end=sourceCount;
        while(imported<end){
            address agent=predecessor.at(imported);Identity memory p=predecessor.identity(agent);
            require(agent!=address(0)&&p.creator!=address(0)&&identities[agent].creator==address(0),"source identity");
            require(predecessor.participation(agent)==0,"source agent still participating");
            require(p.modes>0&&p.modes<=3&&p.qualified&~p.modes==0&&p.metadata!=0,"source capabilities");
            require(p.lastTournament<=sourceTournamentCount,"source tournament order");
            if(p.house!=0){
                require(p.house<=8&&predecessor.house(p.house-1)==agent&&house[p.house-1]==address(0)
                    &&p.creator==owner&&p.codeHash==houseCodeHash&&agent.code.length==0,"official source identity");
                house[p.house-1]=agent;
            }
            // Preserve a changed community controller's original hash. It stays
            // ineligible, instead of granting its replacement the old verdict.
            uint256 registered=predecessor.registeredBlock(agent);require(registered>0&&registered<=block.number,"source registration block");
            bytes32 e0=predecessor.qualificationEvidence(agent,0);bytes32 e1=predecessor.qualificationEvidence(agent,1);
            require((p.qualified&1==0||e0!=0)&&(p.qualified&2==0||e1!=0),"source qualification evidence");
            uint256 nonce=predecessor.nonces(p.creator);
            identities[agent]=p;inheritedIdentity[agent]=true;registeredBlock[agent]=registered;nonces[p.creator]=nonce;
            qualificationEvidence[agent][0]=e0;qualificationEvidence[agent][1]=e1;
            strategies.push(agent);revision++;
            importDigest=keccak256(abi.encode(importDigest,agent,p,registered,nonce,e0,e1));
            emit Registered(agent,p.creator,p.codeHash,p.metadata,p.modes,p.house);
            emit IdentityImported(agent,imported,importDigest);imported++;
        }
    }
    function seal() public override {
        _unchangedSource();require(imported==sourceCount,"incomplete import");
        super.seal();emit ImportSealed(address(predecessor),sourceRevision,sourceCount,importDigest);
    }
    function addHouse(address,bytes32,uint8) public pure override {revert("import source identities only");}
    function register(Registration calldata r,bytes calldata signature) public override {
        require(setupSealed,"import not sealed");super.register(r,signature);
    }
    function qualify(address agent,uint8 mode,bool passed,bytes32 evidence) public override {
        require(setupSealed,"import not sealed");super.qualify(agent,mode,passed,evidence);independentVerdict[agent][mode]=true;
    }
    function qualificationInherited(address agent,uint8 mode) public view returns(bool){
        return inheritedIdentity[agent]&&mode<2&&!independentVerdict[agent][mode];
    }
    /// A correction of the old published trial takes effect on eligibility even
    /// before a keeper mirrors its evidence. A newer local verdict supersedes
    /// that dependency separately for each mode.
    function identity(address agent) public view override returns(Identity memory p){
        p=super.identity(agent);
        if(!inheritedIdentity[agent])return p;
        if(qualificationInherited(agent,0)||qualificationInherited(agent,1)){
            require(address(predecessor).codehash==predecessorCodeHash,"source code changed");
            Identity memory prior=predecessor.identity(agent);
            for(uint8 mode;mode<2;mode++)if(qualificationInherited(agent,mode)){
                uint8 bit=uint8(1<<mode);p.qualified=(p.qualified&~bit)|(prior.qualified&bit);
            }
        }
    }
    function eligible(address agent,uint8 mode) public view override returns(bool){
        Identity memory p=identity(agent);
        return mode<2&&p.available&&p.qualified&(1<<mode)!=0&&participation[agent]==0
            &&(p.house==0?agent:houseController).codehash==p.codeHash;
    }
    function synchronizeQualification(address agent,uint8 mode) external base {
        require(setupSealed&&qualificationInherited(agent,mode),"qualification already superseded");
        Identity memory p=identity(agent);bytes32 proof=predecessor.qualificationEvidence(agent,mode);
        require(proof!=0,"source qualification evidence");
        uint8 bit=uint8(1<<mode);
        if(qualificationEvidence[agent][mode]==proof&&(identities[agent].qualified&bit)==(p.qualified&bit))return;
        identities[agent].qualified=(identities[agent].qualified&~bit)|(p.qualified&bit);
        qualificationEvidence[agent][mode]=proof;revision++;
        emit Qualified(agent,mode,p.qualified&bit!=0,proof);
    }
    function setAvailable(address agent,bool value) public override {
        require(setupSealed,"import not sealed");super.setAvailable(agent,value);
    }
}
