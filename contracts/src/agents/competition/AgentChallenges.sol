// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ArcadeFamily} from "../../independent/ArcadeFamily.sol";
import {AgentCatalog} from "./AgentCatalog.sol";

/// Signed human challenges, independent of tournaments and of delegated storage.
/// No bot is interrupted and no direct wallet or external bot controller is used.
contract AgentChallenges is EIP712 {
    struct Request {address player;address agent;uint8 mode;uint8 status;uint64 at;bytes32 grant;}
    ArcadeFamily public immutable family;
    AgentCatalog public immutable catalog;
    address public immutable pool;
    address public immutable owner;
    bool public admissions;
    uint256 public count;
    uint256 public cursor=1;
    mapping(uint256=>Request) public requests;
    mapping(address=>uint256) public pending;
    mapping(bytes32=>uint256) public nonces;
    uint256 private scanRevision;
    uint256 private scannedCount;
    uint256 private scanCount;
    bytes32 private constant COMMAND=keccak256("AgentChallenge(bytes32 grant,uint8 action,address agent,uint8 mode,uint256 id,uint256 nonce,uint64 deadline)");
    event ChallengeChanged(uint256 indexed id,address indexed player,address indexed agent,uint8 status);
    constructor(ArcadeFamily f,AgentCatalog c,address p,address admin) EIP712("PONGIT Agent Challenges","1"){
        require(block.chainid==10143&&address(f).code.length>0&&address(c).code.length>0&&p!=address(0)&&admin!=address(0),"challenge roles");
        family=f;catalog=c;pool=p;owner=admin;
    }
    function setAdmissions(bool value) public virtual {require(block.chainid==10143&&msg.sender==owner,"operator only");admissions=value;}
    function digest(bytes32 grant,uint8 action,address agent,uint8 mode,uint256 id,uint256 nonce,uint64 deadline) public view returns(bytes32){
        return _hashTypedDataV4(keccak256(abi.encode(COMMAND,grant,action,agent,mode,id,nonce,deadline)));
    }
    function command(address player,uint8 action,address agent,uint8 mode,uint256 id,uint256 nonce,uint64 deadline,bytes calldata signature) public virtual returns(uint256){
        require(block.chainid==10143,"Monad challenges only");ArcadeFamily.Grant memory g=family.grantOf(player);bytes32 h=family.grantDigest(g);
        require(g.key!=address(0)&&deadline>=block.timestamp&&deadline<=g.expires&&nonce==nonces[h],"arcade authorization/nonce");
        require(ECDSA.recover(digest(h,action,agent,mode,id,nonce,deadline),signature)==g.key,"arcade signature");nonces[h]++;
        if(action==1){
            require(admissions&&pending[player]==0&&mode<2&&id==0&&player!=agent,"challenge unavailable");
            AgentCatalog.Identity memory identity=catalog.identity(agent);
            require(identity.creator!=address(0)&&identity.qualified&(1<<mode)!=0&&identity.available,"agent unavailable");
            id=++count;requests[id]=Request(player,agent,mode,1,uint64(block.timestamp),h);pending[player]=id;
        }else{
            require(action==2&&id!=0&&pending[player]==id&&requests[id].status==1,"challenge already playing");
            requests[id].status=3;delete pending[player];
        }
        emit ChallengeChanged(id,player,requests[id].agent,requests[id].status);return id;
    }
    function _valid(Request memory r) private view returns(bool){
        ArcadeFamily.Grant memory g=family.grantOf(r.player);return g.key!=address(0)&&family.grantDigest(g)==r.grant;
    }
    function authorized(uint256 id) external view returns(bool){return requests[id].status==2&&_valid(requests[id]);}
    /// Expired/revoked waiting authorizations release only a queue place. An
    /// active match is unaffected and remains governed by its arena permission.
    function expire(uint256 id) external {
        Request storage r=requests[id];require(r.status==1&&!_valid(r),"challenge still authorized");
        r.status=3;delete pending[r.player];emit ChallengeChanged(id,r.player,r.agent,3);
    }
    function takeNext() external returns(uint256 id,Request memory request,ArcadeFamily.Grant memory grant){
        return _takeNext(type(uint256).max);
    }
    /// Reusable engines can only execute community code present at baseBlock.
    /// A newer strategy remains queued; scanning continues for playable users.
    function takeNextKnown(uint256 baseBlock) external returns(uint256 id,Request memory request,ArcadeFamily.Grant memory grant){
        return _takeNext(baseBlock);
    }
    function _eligible(address agent,uint8 mode) internal view virtual returns(bool){return catalog.eligible(agent,mode);}
    function _refreshRequest(uint256) internal virtual {}
    function _takeNext(uint256 baseBlock) private returns(uint256 id,Request memory request,ArcadeFamily.Grant memory grant){
        require(block.chainid==10143&&msg.sender==pool,"pool only");
        if(scanRevision!=catalog.revision()||scanCount!=count){scanRevision=catalog.revision();scanCount=count;scannedCount=0;}
        if(count==0)return(0,request,grant);
        // Cursor is resumable: a long list of busy tournament participants must
        // not permanently hide a playable challenge further down the queue.
        for(uint256 scanned;scanned<32&&scanned<count;scanned++){
            id=cursor;cursor=cursor==count?1:cursor+1;_refreshRequest(id);Request storage r=requests[id];
            if(scannedCount<count)scannedCount++;
            if(r.status!=1||!_valid(r)||!_eligible(r.agent,r.mode))continue;
            if(catalog.identity(r.agent).house==0&&catalog.registeredBlock(r.agent)>baseBlock)continue;
            scannedCount=0;
            r.status=2;emit ChallengeChanged(id,r.player,r.agent,2);return(id,r,family.grantOf(r.player));
        }
        return(0,request,grant);
    }
    function qualificationsMayStart() external view returns(bool){
        return count==0||scanRevision==catalog.revision()&&scanCount==count&&scannedCount>=count;
    }
    function completed(uint256 id) external {
        require(block.chainid==10143&&msg.sender==pool&&requests[id].status==2,"active challenge/pool only");
        Request storage r=requests[id];r.status=4;delete pending[r.player];emit ChallengeChanged(id,r.player,r.agent,4);
    }
}
