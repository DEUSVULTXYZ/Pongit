// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableArenaStorage as S} from "./ReusableArenaStorage.sol";
import {ReusableAdmission as Admission} from "./ReusableAdmission.sol";
import {ReusableHumanBinding as Binding} from "./ReusableHumanBinding.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";
import {RoomsRules} from "../labs/RoomsRules.sol";
import {RoomsState} from "../labs/RoomsState.sol";
import {ChaosEngine} from "../chaos/ChaosEngine.sol";
import {ChaosGameFlow as Flow} from "../chaos/ChaosGameFlow.sol";
import {PendingControls as Pending} from "../chaos/PendingControls.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../vendor/interlude/interfaces/Types.sol";
import {Session} from "../../vendor/interlude/libraries/Session.sol";

/// Candidate adapter. Logical IDs never become storage keys; all public events,
/// randomness contexts and canonical results retain their logical identity.
/// Lifecycle, admission and scoped caller authorization belong to the root.
library ReusableGame {
    uint256 internal constant RULES=14;
    uint256 private constant SLOT=1;
    uint256 private constant MAX_US=1_800_000_000;
    struct Result {T.Result match_; uint64 elapsedUs; uint64 finishedAt; uint256 rules;}
    error InvalidMatch();
    error InvalidBeaconRequest();
    error InvalidPressure();
    event Snapshot(uint256 indexed id,uint256 version,uint256 status,bytes state);
    event ControlQueued(uint256 indexed id,uint8 indexed side,uint256 sequence,uint8 action,uint64 gameTime);
    event RandomnessVerified(uint256 indexed id,uint32 indexed index,uint64 round,bytes32 randomness,uint256 draw);
    event PressureQueued(uint256 indexed id,uint64 sourceBlock,bytes32 checkpoint,uint256 paidA,uint256 paidB);
    event Completed(uint256 indexed epoch,uint256 indexed id,Result result);

    function phase(mapping(bytes32=>uint256) storage w) internal view returns(uint8){return uint8(S.get(w,0)>>161&7);}
    function admit(mapping(bytes32=>uint256) storage w,Admission.Ticket calldata ticket,T.Binding calldata binding,
        bytes calldata signature,address signer,address authority) external returns(bytes32){
        return Binding.admit(w,ticket,binding,signature,signer,authority);
    }
    function packed(mapping(bytes32=>uint256) storage w) internal view returns(uint256[8] memory p){for(uint256 i;i<8;i++)p[i]=S.get(w,21+i);}
    function state(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) public view returns(PhysicsV2.State memory){
        if(S.get(w,0)>>168&1==0)return RoomsState.state(w,SLOT);
        return kernel.codec().legacy(packed(w),bytes32(S.get(w,3)),S.get(w,8),phase(w)>=3);
    }
    function initialize(mapping(bytes32=>uint256) storage w,RoomsRules classic,ChaosEngine kernel) public {
        require(phase(w)==1,"fresh admission");
        if(S.get(w,0)>>168&1==0)RoomsState.save(w,SLOT,classic.initial(bytes32(S.get(w,3)),0));
        else {uint256[8] memory p=kernel.initial(bytes32(S.get(w,3)));for(uint256 i;i<8;i++)S.set(w,21+i,p[i]);S.set(w,8,5);}
        S.set(w,62,block.timestamp+30);
        publish(w,kernel);
    }
    function cancelAdmission(mapping(bytes32=>uint256) storage w,Admission.Ticket calldata ticket,T.Binding calldata binding,
        bytes calldata signature,address signer,address authority,RoomsRules classic,ChaosEngine kernel) external {
        Binding.cancelExpired(w,ticket,binding,signature,signer,authority);
        initialize(w,classic,kernel);finish(w,kernel,4,address(0));publish(w,kernel);
    }
    function publish(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) public {
        uint256 times=S.get(w,2);require(uint64(times>>128)<type(uint64).max,"revision overflow");
        times+=uint256(1)<<128;S.set(w,2,times);
        bytes memory encoded=S.get(w,0)>>168&1==0?abi.encode(state(w,kernel)):abi.encode(uint8(6),S.get(w,8),packed(w));
        emit Snapshot(S.get(w,37),uint64(times>>128),phase(w),encoded);
    }
    function snapshot(mapping(bytes32=>uint256) storage w,ChaosEngine kernel,bool ephemeral) public view returns(RoomsState.Header memory h){
        h=abi.decode(RoomsState.snapshot(w,SLOT,ephemeral,state(w,kernel)),(RoomsState.Header));h.id=S.get(w,37);
    }
    function result(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) public view returns(Result memory r){
        PhysicsV2.State memory p=state(w,kernel);uint256 m=S.get(w,0);uint256 winner=m>>166&3;
        address a=address(uint160(m));address b=address(uint160(S.get(w,1)));
        r.match_=T.Result(address(this),S.get(w,31),S.get(w,37),a,b,winner==1?a:winner==2?b:address(0),
            uint8(m>>168&1),m>>160&1==1,phase(w),p.scoreA,p.scoreB,bytes32(S.get(w,9)));
        r.elapsedUs=p.t;r.finishedAt=uint64(S.get(w,19));r.rules=RULES;
    }
    function finish(mapping(bytes32=>uint256) storage w,ChaosEngine kernel,uint8 status,address winner) public {
        require(phase(w)>0&&phase(w)<3&&(status==3||status==4),"terminal transition");
        uint256 m=S.get(w,0);address a=address(uint160(m));address b=address(uint160(S.get(w,1)));
        require(status==4?winner==address(0):winner==a||winner==b,"winner");
        Flow.finish(w,SLOT,status,winner);
        S.set(w,0,(m&~(uint256(7)<<161))|(uint256(status)<<161)|((winner==a?uint256(1):winner==b?uint256(2):0)<<166));
        S.set(w,8,(S.get(w,8)&~uint256(15))|5);
        PhysicsV2.State memory p=state(w,kernel);
        S.set(w,9,uint256(keccak256(abi.encode(address(this),RULES,S.get(w,31),S.get(w,37),a,b,winner,
            status,uint8(m>>168&1),m>>160&1==1,p.scoreA,p.scoreB,p.t,S.get(w,19),S.get(w,36)))));
        Result memory r=result(w,kernel);S.complete(w,keccak256(abi.encode(r)));
        emit Completed(S.get(w,31),S.get(w,37),r);
    }
    function ready(mapping(bytes32=>uint256) storage w,ChaosEngine kernel,uint8 side) external {
        require(phase(w)==1&&block.timestamp<=S.get(w,62),"current loading match");
        uint256 before_=S.get(w,61);uint256 next=before_|(uint256(1)<<side);
        if(next!=before_){S.set(w,61,next);publish(w,kernel);}
    }
    function start(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) external {
        require(phase(w)==1,"not loading");
        if(S.get(w,61)!=3){require(block.timestamp<=S.get(w,62),"loading expired");return;}
        uint256 packedLaunch=S.get(w,60);uint256 at=uint64(packedLaunch);
        // The execution timestamp is pinned for a publication batch and may
        // jump several seconds. Use the same 100 Hz clock as gameplay as an
        // additional minimum, while retaining the historical wall deadline.
        if(at==0){
            require(block.number<=type(uint64).max-300,"engine block overflow");
            S.set(w,60,uint64(block.timestamp+3)|((block.number+300)<<64));publish(w,kernel);return;
        }
        require(block.timestamp>=at&&block.number>=uint64(packedLaunch>>64),"countdown pending");
        S.set(w,0,(S.get(w,0)&~(uint256(7)<<161))|(2<<161));
        require(block.number<=type(uint64).max,"engine block overflow");
        S.set(w,2,(S.get(w,2)&(uint256(type(uint64).max)<<128))|uint64(block.number));publish(w,kernel);
    }
    function clockTarget(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) private returns(uint256 target){
        uint256 times=S.get(w,2);uint256 start_=uint64(times);uint64 t=state(w,kernel).t;
        target=uint64(times>>192);if(block.number>=start_)target+=(block.number-start_)*10_000;
        if(block.number<start_||target<t){
            require(block.number<=type(uint64).max,"engine block overflow");
            S.set(w,2,(times&(uint256(type(uint128).max)<<64))|uint64(block.number)|(uint256(t)<<192));target=t;
        }
    }
    function applyPending(mapping(bytes32=>uint256) storage w,ChaosEngine kernel,uint64 t) private {
        uint8 concession=Pending.consume(w,SLOT,t);
        if(concession!=0&&phase(w)==2)finish(w,kernel,3,address(uint160(S.get(w,concession==1?1:0))));
    }
    function advance(mapping(bytes32=>uint256) storage w,RoomsRules classic,ChaosEngine kernel,IInterludeHub hub,uint256 target) private returns(bool){
        if(target>MAX_US){finish(w,kernel,4,address(0));return true;}
        for(uint8 pass;pass<3;pass++){
            if(phase(w)!=2)return true;
            PhysicsV2.State memory p=state(w,kernel);uint64 end=Pending.next(w,SLOT,p.t,uint64(target));bool complete;
            if(p.mode==0){
                (p,complete)=classic.advance(p,end,128);RoomsState.save(w,SLOT,p);
                if(p.finished){finish(w,kernel,3,address(uint160(S.get(w,p.scoreA==7?0:1))));return true;}
            }else{
                uint8 outcome;uint8 winner;(complete,outcome,winner)=Flow.advanceAt(w,kernel,hub,SLOT,S.get(w,37),end);
                if(outcome!=0){finish(w,kernel,outcome,winner==0?address(0):address(uint160(S.get(w,winner==1?0:1))));return true;}
            }
            if(!complete)return false;
            applyPending(w,kernel,state(w,kernel).t);
            if(phase(w)!=2||end>=target)return true;if(gasleft()<7_000_000)return false;
        }
        return false;
    }
    function record(mapping(bytes32=>uint256) storage w,uint8 side,uint8 action,uint256 seq,uint64 at) private {
        uint256 shift=side==0?16:80;
        if(action!=4)S.set(w,8,(S.get(w,8)&~(uint256(type(uint64).max)<<shift))|(seq<<shift));
        if(phase(w)!=2)return;
        if(action==4&&Pending.action(S.get(w,0)>>176,side)==4)return;
        S.set(w,0,(S.get(w,0)&((uint256(1)<<176)-1))|(Pending.queue(S.get(w,0)>>176,side,action,at)<<176));
        emit ControlQueued(S.get(w,37),side,seq,action,at);
    }
    function input(mapping(bytes32=>uint256) storage w,RoomsRules classic,ChaosEngine kernel,IInterludeHub hub,
        uint8 side,int8 direction,uint256 seq,uint256 deadline) external {
        if(phase(w)!=2)revert InvalidMatch();Pending.validate(w,SLOT,side,direction,seq,deadline);
        uint256 target=clockTarget(w,kernel);require(target<=type(uint64).max,"clock range");
        bool complete=advance(w,classic,kernel,hub,target);
        record(w,side,uint8(direction+2),seq,uint64(target));
        if(complete&&phase(w)==2)applyPending(w,kernel,state(w,kernel).t);publish(w,kernel);
    }
    function tick(mapping(bytes32=>uint256) storage w,RoomsRules classic,ChaosEngine kernel,IInterludeHub hub) external {
        if(phase(w)!=2)revert InvalidMatch();advance(w,classic,kernel,hub,clockTarget(w,kernel));publish(w,kernel);
    }
    function concede(mapping(bytes32=>uint256) storage w,RoomsRules classic,ChaosEngine kernel,IInterludeHub hub,uint8 side) external {
        if(phase(w)!=2)revert InvalidMatch();uint256 target=clockTarget(w,kernel);
        record(w,side,4,0,uint64(target>MAX_US?MAX_US:target));advance(w,classic,kernel,hub,target);publish(w,kernel);
    }
    function randomness(mapping(bytes32=>uint256) storage w,RoomsRules classic,ChaosEngine kernel,IInterludeHub hub,uint256 expected,bytes calldata signature) external {
        if(phase(w)!=2||S.get(w,0)>>168&1!=1||expected==0||S.get(w,29)!=expected||S.get(w,30)!=0
            ||uint32(expected>>64)!=S.get(w,31))revert InvalidBeaconRequest();
        (uint256 draw,bytes32 random)=kernel.prove(address(this),S.get(w,37),expected,signature);
        if(advance(w,classic,kernel,hub,clockTarget(w,kernel))&&phase(w)==2){
            S.set(w,30,draw);emit RandomnessVerified(S.get(w,37),uint32(expected>>96),uint64(expected),random,draw);
        }
        publish(w,kernel);
    }
    function pressure(mapping(bytes32=>uint256) storage w,RoomsRules classic,ChaosEngine kernel,IInterludeHub hub,
        bytes32 domain,address signer,Flow.LivePressure calldata p,bytes calldata signature) external {
        S.assertMatch(w,p.epoch,p.matchId);uint256 old=S.get(w,17);
        if(phase(w)!=2||S.get(w,0)>>168&1!=1||p.seed!=bytes32(S.get(w,3))
            ||p.rally==0||p.rally>uint32(S.get(w,28)>>6)||p.sourceBlock==0||p.checkpoint==0
            ||p.expires<=block.timestamp||p.expires>block.timestamp+30||p.paidA<uint128(old)||p.paidB<uint128(old>>128)
            ||p.sourceBlock<S.get(w,16)||Session.recover(Flow.pressureDigest(domain,p),signature)!=signer)revert InvalidPressure();
        uint256 paid=p.paidA|(uint256(p.paidB)<<128);
        if(p.sourceBlock==S.get(w,16)){if(old!=paid||bytes32(S.get(w,18))!=p.checkpoint)revert InvalidPressure();return;}
        if(advance(w,classic,kernel,hub,clockTarget(w,kernel))&&phase(w)==2){
            S.set(w,16,p.sourceBlock);S.set(w,17,paid);S.set(w,18,uint256(p.checkpoint));
            emit PressureQueued(p.matchId,p.sourceBlock,p.checkpoint,p.paidA,p.paidB);
        }
        publish(w,kernel);
    }
}
