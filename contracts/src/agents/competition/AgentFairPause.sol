// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableArenaStorage as S} from "../../independent/ReusableArenaStorage.sol";

/// Rules 16 only, friendly human/official-house matches only. Engine blocks are
/// the existing 10 ms game clock. No caller may advance beyond paid-for input
/// liveness. This is independent of who drives tick/randomness/catch-up.
library AgentFairPause {
    uint256 internal constant RULES_SLOT=73;
    uint256 private constant DEADLINE=67;
    uint256 private constant LIMIT=68;
    uint256 private constant CANCEL_AT=69;
    uint256 private constant RESUME_AT=70;
    uint256 private constant FRESH_UNTIL=71;
    uint256 private constant HUMAN=72;
    struct View {uint8 status;uint8 human;uint64 limitUs;uint64 deadlineBlock;uint64 cancelBlock;uint64 resumeBlock;}

    function initialize(mapping(bytes32=>uint256) storage w,uint256 version) public {
        if(version<16)return; // Immutable historical arenas never owned these fields.
        for(uint256 i=DEADLINE;i<=RULES_SLOT;i++)if(S.get(w,i)!=0)S.set(w,i,0);
        S.set(w,RULES_SLOT,version);
        if(version<16||S.get(w,0)>>160&1!=0||S.get(w,63)!=0)return;
        uint256 houses=S.get(w,66);
        if(S.get(w,64)==0&&uint8(houses>>8)!=0)S.set(w,HUMAN,1);
        else if(S.get(w,65)==0&&uint8(houses)!=0)S.set(w,HUMAN,2);
    }
    function rules(mapping(bytes32=>uint256) storage w) public view returns(uint256){
        uint256 r=S.get(w,RULES_SLOT);return r==0?15:r;
    }
    function enabled(mapping(bytes32=>uint256) storage w) public view returns(bool){return S.get(w,HUMAN)!=0;}
    function start(mapping(bytes32=>uint256) storage w,uint256 time) public {
        if(!enabled(w))return;
        require(block.number<=type(uint64).max-3050&&time<=type(uint64).max-500_000,"pause clock range");
        S.set(w,DEADLINE,block.number+50);S.set(w,LIMIT,time+500_000);
    }
    function lost(mapping(bytes32=>uint256) storage w) public view returns(bool){
        return enabled(w)&&S.get(w,DEADLINE)!=0&&(S.get(w,CANCEL_AT)!=0||block.number>S.get(w,DEADLINE));
    }
    function observe(mapping(bytes32=>uint256) storage w) public {
        if(lost(w)&&S.get(w,CANCEL_AT)==0)S.set(w,CANCEL_AT,S.get(w,DEADLINE)+3000);
    }
    function limit(mapping(bytes32=>uint256) storage w,uint256 target) public returns(uint256){
        if(!enabled(w))return target;
        observe(w);uint256 cap=S.get(w,LIMIT);return target<cap?target:cap;
    }
    function expired(mapping(bytes32=>uint256) storage w) public view returns(bool){
        uint256 at=S.get(w,CANCEL_AT);return at!=0&&block.number>=at;
    }
    function pulse(mapping(bytes32=>uint256) storage w,uint8 side,uint256 time) public {
        if(!enabled(w))return;
        require(S.get(w,HUMAN)==side+1,"protected human only");observe(w);
        if(S.get(w,CANCEL_AT)!=0){
            // A late heartbeat proves current reachability. It never grants
            // retrospective time, restarts a countdown or extends cancellation.
            if(!expired(w)){
                if(S.get(w,RESUME_AT)!=0&&block.number>S.get(w,FRESH_UNTIL))S.set(w,RESUME_AT,0);
                S.set(w,FRESH_UNTIL,block.number+50);
            }
        }else start(w,time);
    }
    function requestResume(mapping(bytes32=>uint256) storage w,uint8 side,uint256 processed) public {
        require(enabled(w)&&S.get(w,HUMAN)==side+1,"protected human only");observe(w);
        require(S.get(w,CANCEL_AT)!=0&&!expired(w),"no resumable pause");
        require(processed==S.get(w,LIMIT),"pause catch-up pending");
        S.set(w,FRESH_UNTIL,block.number+50);
        if(S.get(w,RESUME_AT)==0)S.set(w,RESUME_AT,block.number+300);
    }
    function resume(mapping(bytes32=>uint256) storage w) public returns(bool){
        uint256 at=S.get(w,RESUME_AT);
        if(at==0||block.number<at||expired(w)||block.number>S.get(w,FRESH_UNTIL))return false;
        uint256 time=S.get(w,LIMIT);
        S.set(w,CANCEL_AT,0);S.set(w,RESUME_AT,0);S.set(w,FRESH_UNTIL,0);start(w,time);return true;
    }
    function inspect(mapping(bytes32=>uint256) storage w) public view returns(View memory v){
        v.human=uint8(S.get(w,HUMAN));if(v.human==0)return v;
        v.limitUs=uint64(S.get(w,LIMIT));v.deadlineBlock=uint64(S.get(w,DEADLINE));
        v.cancelBlock=uint64(S.get(w,CANCEL_AT));v.resumeBlock=uint64(S.get(w,RESUME_AT));
        v.status=lost(w)?v.resumeBlock!=0?3:2:1;
        if(v.status>=2&&v.cancelBlock==0)v.cancelBlock=v.deadlineBlock+3000;
    }
}
