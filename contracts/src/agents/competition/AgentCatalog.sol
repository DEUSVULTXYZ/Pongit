// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {StrategyCode} from "./StrategyCode.sol";

/// Shared Monad registry. Names and avatars never confer an official identity.
/// It contains no token, withdrawal or financial permission.
contract AgentCatalog is EIP712 {
    struct Identity {
        address creator;
        bytes32 codeHash;
        bytes32 metadata;
        uint64 lastTournament;
        uint8 modes;
        uint8 qualified;
        uint8 house; // 0 community, 1..8 fixed official controller identities
        bool available;
    }
    struct Registration {address strategy;address creator;bytes32 metadata;uint8 modes;uint64 deadline;uint256 nonce;}
    bytes32 private constant REGISTER=keccak256("StrategyRegistration(address strategy,address creator,bytes32 metadata,uint8 modes,uint64 deadline,uint256 nonce)");
    address public immutable owner;
    address public immutable qualifier;
    address public immutable houseController;
    bytes32 public immutable houseCodeHash;
    address public competition;
    address public arenaPool;
    address public qualificationQueue;
    bool public setupSealed;
    uint256 public revision;
    mapping(address=>uint256) public nonces;
    mapping(address=>Identity) private identities;
    mapping(address=>uint256) public registeredBlock;
    mapping(address=>bytes32) public participation;
    mapping(address=>mapping(uint8=>bytes32)) public qualificationEvidence;
    mapping(address=>address) private reservingController;
    address[8] public house;
    address[] private strategies;
    event Registered(address indexed strategy,address indexed creator,bytes32 codeHash,bytes32 metadata,uint8 modes,uint8 official);
    event Qualified(address indexed strategy,uint8 mode,bool passed,bytes32 evidence);
    event Availability(address indexed strategy,bool available,uint256 revision);
    event Reserved(address indexed strategy,bytes32 indexed participation);
    event Released(address indexed strategy,bytes32 indexed participation);
    constructor(address admin,address qualification,address builtin) EIP712("PONGIT Agent Catalog","1") {
        require(block.chainid==10143&&admin!=address(0)&&qualification!=address(0)&&builtin.code.length>0,"testnet roles");
        owner=admin;qualifier=qualification;houseController=builtin;houseCodeHash=builtin.codehash;
    }
    modifier base(){require(block.chainid==10143,"Monad registry only");_;}
    modifier controller(){require(msg.sender==competition||msg.sender==arenaPool,"competition controller");_;}
    function configure(address tournaments,address pool) external base {
        require(msg.sender==owner&&!setupSealed&&competition==address(0)&&tournaments.code.length>0&&pool.code.length>0,"setup only");
        competition=tournaments;arenaPool=pool;
    }
    function addHouse(address strategy,bytes32 metadata,uint8 style) external base {
        require(msg.sender==owner&&!setupSealed&&style<8&&house[style]==address(0),"house setup only");
        require(strategy!=address(0)&&strategy.code.length==0&&metadata!=0&&identities[strategy].creator==address(0),"house identity");
        identities[strategy]=Identity(owner,houseCodeHash,metadata,0,3,0,style+1,true);
        registeredBlock[strategy]=block.number;
        house[style]=strategy;strategies.push(strategy);revision++;
        emit Registered(strategy,owner,houseCodeHash,metadata,3,style+1);
    }
    function seal() external base {
        require(msg.sender==owner&&!setupSealed&&competition!=address(0),"setup only");
        for(uint8 i;i<8;i++)require(house[i]!=address(0),"eight house identities required");
        setupSealed=true;
    }
    function bindQualifications(address queue) external base {
        require(msg.sender==arenaPool&&qualificationQueue==address(0)&&queue.code.length>0,"pool qualification binding");qualificationQueue=queue;
    }
    function digest(Registration calldata r) public view returns(bytes32){
        return _hashTypedDataV4(keccak256(abi.encode(REGISTER,r.strategy,r.creator,r.metadata,r.modes,r.deadline,r.nonce)));
    }
    function register(Registration calldata r,bytes calldata signature) external base {
        require(r.deadline>=block.timestamp&&r.deadline<=block.timestamp+10 minutes&&r.nonce==nonces[r.creator],"registration lifetime/nonce");
        require(ECDSA.recover(digest(r),signature)==r.creator,"creator signature");
        nonces[r.creator]++;_register(r.strategy,r.creator,r.metadata,r.modes,0);
    }
    function _register(address strategy,address creator,bytes32 metadata,uint8 modes,uint8 official) private {
        require(creator!=address(0)&&metadata!=0&&modes>0&&modes<=3&&identities[strategy].creator==address(0),"identity");
        bytes32 codeHash=StrategyCode.verify(strategy);
        bytes4 selector=bytes4(keccak256("creator()"));bool ok;uint256 size;uint256 result;
        assembly("memory-safe"){let p:=mload(0x40) mstore(p,selector) ok:=staticcall(30000,strategy,p,4,p,32) size:=returndatasize() result:=mload(p)}
        require(ok&&size==32&&result==uint160(creator),"strategy creator");
        identities[strategy]=Identity(creator,codeHash,metadata,0,modes,0,official,official!=0);
        registeredBlock[strategy]=block.number;
        strategies.push(strategy);revision++;emit Registered(strategy,creator,codeHash,metadata,modes,official);
    }
    function qualify(address strategy,uint8 mode,bool passed,bytes32 evidence) external base {
        Identity storage p=identities[strategy];
        require((msg.sender==qualifier||msg.sender==qualificationQueue)&&mode<2&&p.creator!=address(0)&&p.modes&(1<<mode)!=0&&evidence!=0,"qualification");
        require(!passed||!setupSealed||msg.sender==qualificationQueue,"published qualification required");
        require((p.house==0?strategy:houseController).codehash==p.codeHash,"controller changed");
        p.qualified=passed?p.qualified|uint8(1<<mode):p.qualified&~uint8(1<<mode);qualificationEvidence[strategy][mode]=evidence;revision++;
        emit Qualified(strategy,mode,passed,evidence);
    }
    function setAvailable(address strategy,bool value) external base {
        Identity storage p=identities[strategy];require(msg.sender==p.creator&&p.house==0,"community creator");
        if(p.available!=value){p.available=value;revision++;emit Availability(strategy,value,revision);}
    }
    function identity(address strategy) external view returns(Identity memory){return identities[strategy];}
    function count() external view returns(uint256){return strategies.length;}
    function at(uint256 index) external view returns(address){return strategies[index];}
    function eligible(address strategy,uint8 mode) public view returns(bool){
        Identity storage p=identities[strategy];
        return mode<2&&p.available&&p.qualified&(1<<mode)!=0&&participation[strategy]==0&&(p.house==0?strategy:houseController).codehash==p.codeHash;
    }
    function reserve(address strategy,uint8 mode,bytes32 token) external base controller {
        require(setupSealed&&token!=0&&eligible(strategy,mode),"agent unavailable");
        participation[strategy]=token;reservingController[strategy]=msg.sender;revision++;emit Reserved(strategy,token);
    }
    function qualificationEligible(address strategy,uint8 mode) public view returns(bool){
        Identity storage p=identities[strategy];
        return mode<2&&p.creator!=address(0)&&p.available&&p.modes&(1<<mode)!=0&&participation[strategy]==0
            &&(p.house==0?strategy:houseController).codehash==p.codeHash;
    }
    function reserveQualification(address strategy,uint8 mode,bytes32 token) external base {
        require(msg.sender==arenaPool&&setupSealed&&token!=0&&qualificationEligible(strategy,mode),"qualification participation");
        participation[strategy]=token;reservingController[strategy]=msg.sender;revision++;emit Reserved(strategy,token);
    }
    function release(address strategy,bytes32 token) external base controller {
        require(token!=0&&participation[strategy]==token&&reservingController[strategy]==msg.sender,"participation reference");
        participation[strategy]=0;delete reservingController[strategy];revision++;emit Released(strategy,token);
    }
    function participated(address strategy,uint64 tournament,bytes32 token) external base {
        require(msg.sender==competition&&participation[strategy]==token&&token!=0&&tournament>identities[strategy].lastTournament,"tournament reference");
        identities[strategy].lastTournament=tournament;revision++;
    }
}
