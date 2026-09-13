// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosEngine} from "./ChaosEngine.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {Session} from "../../vendor/interlude/libraries/Session.sol";
import {RoomsControlVerifier} from "../labs/RoomsControlVerifier.sol";
import {EloFormulaV2} from "../v2/EloFormulaV2.sol";
import {ChaosCodec} from "./ChaosCodec.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// Linked Solidity library: its address is fixed in the root bytecode. It owns
/// no state and has no upgrade/admin entry point. Storage remains in the app's
/// registered mapping, including while executing through Solidity's delegatecall.
library ChaosGameFlow {
    struct Rating {uint32 elo;uint32 played;uint32 wins;uint32 season;}
    struct Header {uint256 id;uint256 revision;uint256 phase;address a;address b;address target;address winner;uint256 head;uint256 clock;uint256 nonceA;uint256 nonceB;uint256 deadline;PhysicsV2.State state;}
    error InvalidControls();error InvalidBeaconRequest();error InvalidPressure();
    struct LivePressure {uint256 matchId;uint256 epoch;bytes32 seed;uint32 rally;uint128 paidA;uint128 paidB;uint64 sourceBlock;bytes32 checkpoint;uint64 expires;}
    bytes32 private constant PRESSURE_TYPEHASH=keccak256("LivePressure(uint256 matchId,uint256 epoch,bytes32 seed,uint32 rally,uint128 paidA,uint128 paidB,uint64 sourceBlock,bytes32 checkpoint,uint64 expires)");
    event ControlsBound(address indexed key,uint256 binding);
    event RatingUpdated(uint256 indexed id,address indexed player,uint8 mode,uint32 season,uint32 elo,uint32 played,uint32 wins);
    event EventRequested(uint256 indexed id,uint256 request);
    event ChaosAnnounced(uint256 indexed id,uint32 indexed index,uint256 draw,uint64 gameTime);
    event ChaosCollision(uint256 indexed id,uint256 collision);
    event ChaosPressureApplied(uint256 indexed id,uint32 rally,uint128 paidA,uint128 paidB,bytes32 checkpoint);
    event Snapshot(uint256 indexed id,uint256 version,uint256 status,bytes state);
    function key(uint256 id,uint256 field) private view returns(bytes32){return keccak256(abi.encode(address(this),uint256(0),id,field));}
    function get(mapping(bytes32=>uint256) storage w,uint256 id,uint256 field) private view returns(uint256){return w[key(id,field)];}
    function set(mapping(bytes32=>uint256) storage w,uint256 id,uint256 field,uint256 value) private {w[key(id,field)]=value;}
    function packed(mapping(bytes32=>uint256) storage w,uint256 id) private view returns(uint256[8] memory p){for(uint256 i;i<8;i++)p[i]=get(w,id,21+i);}
    function store(mapping(bytes32=>uint256) storage w,uint256 id,uint256[8] memory p) private {for(uint256 i;i<8;i++)if(get(w,id,21+i)!=p[i])set(w,id,21+i,p[i]);}
    function publish(mapping(bytes32=>uint256) storage w,uint256 id) external {
        uint256 times=get(w,id,2);require(uint64(times>>128)<type(uint64).max,"revision overflow");times+=uint256(1)<<128;set(w,id,2,times);
        emit Snapshot(id,uint64(times>>128),get(w,id,0)>>161&7,abi.encode(uint8(6),get(w,id,8),packed(w,id)));
    }
    function snapshot(mapping(bytes32=>uint256) storage w,uint256 id) external view returns(bytes memory){
        // One EVM read includes the complete header, nonce and packed state. A
        // second RPC read could otherwise pair different revisions together.
        Header memory h=IChaosSnapshot(address(this)).getSnapshot(id);
        return abi.encode(h,packed(w,id),get(w,id,29),get(w,id,30));
    }
    function finish(mapping(bytes32=>uint256) storage w,uint256 id,uint256 phase,address winner) external {
        set(w,id,19,block.timestamp);
        uint256 meta=get(w,id,0);if((meta>>168&1)==0)return;
        set(w,id,25,0);set(w,id,26,0);
        set(w,id,21,get(w,id,21)&~(uint256(1)<<195));set(w,id,23,get(w,id,23)&~(uint256(1)<<195));
        uint256 score=get(w,id,28)&~((uint256(7)<<38)|(uint256(type(uint24).max)<<45));
        uint256 side=winner==address(uint160(meta))?1:winner==address(uint160(get(w,id,1)))?2:0;
        if(phase==3)score|=(uint256(1)<<38)|(side<<39);else score|=uint256(1)<<165;
        set(w,id,28,score);
    }
    function rate(mapping(bytes32=>uint256) storage w,EloFormulaV2 formula,uint256 id,address a,address b,address winner) external {
        uint8 mode=uint8(get(w,id,0)>>168&1);
        Rating memory ra=IChaosRatings(address(this)).ratingOf(a,mode);Rating memory rb=IChaosRatings(address(this)).ratingOf(b,mode);
        uint256 change=ra.elo|(uint256(rb.elo)<<32);
        bytes32 pair=keccak256(abi.encode(a<b?a:b,a<b?b:a,block.timestamp/1 days,mode));
        bytes32 pairKey=keccak256(abi.encode(address(this),uint256(3),uint256(pair),uint256(0)));
        uint256 count=w[pairKey]+1;if(count>8)count=8;w[pairKey]=count;
        int256 difference=(winner==a?int256(1e18):int256(0))-formula.expected(ra.elo,rb.elo);
        ra.elo=positive(int256(uint256(ra.elo))+(ra.played<10?int256(64):int256(32))*difference/1e18/int256(count));
        rb.elo=positive(int256(uint256(rb.elo))-(rb.played<10?int256(64):int256(32))*difference/1e18/int256(count));
        ra.played++;rb.played++;if(winner==a)ra.wins++;else rb.wins++;
        rating(w,id,a,mode,ra);rating(w,id,b,mode,rb);
        set(w,id,12,change|(uint256(ra.elo)<<64)|(uint256(rb.elo)<<96));
    }
    function positive(int256 n) private pure returns(uint32){return uint32(uint256(n<100?int256(100):n));}
    function rating(mapping(bytes32=>uint256) storage w,uint256 id,address player,uint8 mode,Rating memory r) private {
        w[keccak256(abi.encode(address(this),uint256(2),uint256(uint160(player)),uint256(mode)))]=r.elo|(uint256(r.played)<<32)|(uint256(r.wins)<<64)|(uint256(r.season)<<96);
        emit RatingUpdated(id,player,mode,r.season,r.elo,r.played,r.wins);
    }
    function registerControls(mapping(bytes32=>uint256) storage w,RoomsControlVerifier verifier,bytes calldata proof) external {
        (bool ok,bytes memory result)=address(verifier).staticcall(abi.encodePacked(RoomsControlVerifier.verify.selector,proof));
        if(!ok){assembly("memory-safe"){revert(add(result,32),mload(result))}}
        (uint256 binding,address control)=abi.decode(result,(uint256,address));uint256 old=get(w,uint160(control),20);
        if(control!=msg.sender||old!=0&&(uint160(old)!=uint160(binding)||old>>160==0))revert InvalidControls();
        set(w,uint160(control),20,binding);emit ControlsBound(control,binding);
    }
    function verifyRandomness(mapping(bytes32=>uint256) storage w,ChaosEngine engine,IInterludeHub hub,uint256 id,uint256 expected,bytes calldata signature)
        external view returns(uint256 draw,bytes32 randomness)
    {
        uint256 meta=get(w,id,0);
        if((meta>>161&7)!=2||(meta>>168&1)!=1||expected==0||get(w,id,29)!=expected||get(w,id,30)!=0
            ||uint32(expected>>64)!=hub.sessionOf(address(this),Types.GLOBAL).epoch)revert InvalidBeaconRequest();
        return engine.prove(address(this),id,expected,signature);
    }
    function pressureDigest(bytes32 domain,LivePressure calldata p) external pure returns(bytes32){return digest(domain,p);}
    function digest(bytes32 domain,LivePressure calldata p) private pure returns(bytes32){return keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(PRESSURE_TYPEHASH,p))));}
    function checkPressure(mapping(bytes32=>uint256) storage w,IInterludeHub hub,bytes32 domain,address signer,LivePressure calldata p,bytes calldata signature)
        external view returns(bool duplicate)
    {
        uint256 old=get(w,p.matchId,17);uint256 meta=get(w,p.matchId,0);
        if((meta>>161&7)!=2||(meta>>168&1)!=1||p.seed!=bytes32(get(w,p.matchId,3))||p.epoch!=hub.sessionOf(address(this),Types.GLOBAL).epoch
            ||p.rally==0||p.rally>uint32(get(w,p.matchId,28)>>6)||p.sourceBlock==0||p.checkpoint==0||p.expires<=block.timestamp||p.expires>block.timestamp+30
            ||p.paidA<uint128(old)||p.paidB<uint128(old>>128)||p.sourceBlock<get(w,p.matchId,16)
            ||Session.recover(digest(domain,p),signature)!=signer)revert InvalidPressure();
        if(p.sourceBlock==get(w,p.matchId,16)){
            if(old!=(uint256(p.paidA)|(uint256(p.paidB)<<128))||bytes32(get(w,p.matchId,18))!=p.checkpoint)revert InvalidPressure();return true;
        }
    }
    function request(mapping(bytes32=>uint256) storage w,ChaosEngine engine,IInterludeHub hub,uint256 id,uint32 index,uint32 delayMs,uint64 t) private {
        uint256 q=engine.request(uint64(hub.sessionOf(address(this),Types.GLOBAL).epoch),index,uint32(t/1000)+delayMs,
            engine.excluded(packed(w,id),bytes32(get(w,id,3)),get(w,id,8)),delayMs);
        set(w,id,29,q);set(w,id,30,0);emit EventRequested(id,q);
    }
    function announce(mapping(bytes32=>uint256) storage w,ChaosEngine engine,IInterludeHub hub,uint256 id,uint64 t) private returns(bool){
        uint256 q=get(w,id,29);uint256 draw=get(w,id,30);
        if(draw==0||t<uint64(uint32(q>>128))*1000)return false;
        (uint256[8] memory state,bool applied)=engine.announce(packed(w,id),bytes32(get(w,id,3)),get(w,id,8),draw,uint32(q>>96));
        if(!applied)return false;store(w,id,state);emit ChaosAnnounced(id,uint32(q>>96),draw,t);
        request(w,engine,hub,id,uint32(q>>96)+1,uint16(draw>>48),t);return true;
    }
    function advance(mapping(bytes32=>uint256) storage w,ChaosEngine engine,IInterludeHub hub,uint256 id,uint64 target)
        external returns(bool complete,uint8 outcome,uint8 winner)
    {
        if(get(w,id,29)==0)request(w,engine,hub,id,1,10000,uint64(get(w,id,27)>>112));
        for(uint8 attempt;attempt<3;attempt++){
            uint64 t=uint64(get(w,id,27)>>112);announce(w,engine,hub,id,t);
            uint64 stop=target;uint256 q=get(w,id,29);
            if(get(w,id,30)!=0){uint64 due=uint64(uint32(q>>128))*1000;
                if(due>t&&due<stop)stop=due;else if(due<=t)stop=engine.wakeAt(packed(w,id),stop);}
            uint256 paid=get(w,id,17);
            ChaosEngine.Progress memory p=engine.advance(packed(w,id),bytes32(get(w,id,3)),get(w,id,8),stop,uint128(paid),uint128(paid>>128));
            store(w,id,p.words);for(uint256 i;i<p.collisions.length;i++)emit ChaosCollision(id,p.collisions[i]);
            if(p.appliedRally!=0){set(w,id,14,uint128(paid));set(w,id,15,uint128(paid>>128));
                emit ChaosPressureApplied(id,p.appliedRally,uint128(paid),uint128(paid>>128),bytes32(get(w,id,18)));}
            if(p.outcome!=0)return(true,p.outcome,uint8(p.words[7]>>39&3));
            uint64 next=uint64(p.words[6]>>112);announce(w,engine,hub,id,next);
            if(p.complete&&next==target)return(true,0,0);if(next==t)return(false,0,0);
        }
    }
}
interface IChaosRatings {function ratingOf(address player,uint8 mode) external view returns(ChaosGameFlow.Rating memory);}
interface IChaosSnapshot {function getSnapshot(uint256 id) external view returns(ChaosGameFlow.Header memory);}
