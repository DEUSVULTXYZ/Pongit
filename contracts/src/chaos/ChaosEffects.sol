// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Candidate stateless effect lifecycle. The caller is the immutable
/// game kernel, which alone accepts verified draws and identified collisions.
contract ChaosEffects {
    // A slot packs into one word. `variant` is committed randomness, never
    // selected at collision time. `remaining` is a shield/charge or brick mask.
    struct Effect {
        uint8 id; uint8 target; uint8 remaining; uint32 serial;
        uint32 startsAt; uint32 expiresAt; uint32 variant;
    }
    struct Shot { uint32 numerator; uint32 denominator; int8 curveSign; uint8 consumedMask; }
    error InvalidEffect();
    error NoEffectSlot();
    error DuplicateEffect();

    function duration(uint8 id) public pure returns(uint32) {
        if(id==0||id>24)revert InvalidEffect();
        uint16[24] memory ms=[uint16(6000),5000,12000,8000,8000,8000,6000,5000,8000,7000,6000,6000,10000,10000,8000,8000,8000,10000,12000,8000,12000,12000,8000,12000];
        return ms[id-1];
    }
    function active(Effect memory e,uint32 nowMs) public pure returns(bool) {
        return e.id!=0&&nowMs>=e.startsAt&&nowMs<e.expiresAt;
    }
    function expire(Effect[2] memory effects,uint32 nowMs) public pure returns(Effect[2] memory,uint8 expiredMask) {
        for(uint8 i;i<2;i++)if(effects[i].id!=0&&nowMs>=effects[i].expiresAt){delete effects[i];expiredMask|=uint8(1)<<i;}
        return(effects,expiredMask);
    }
    function excluded(Effect[2] calldata effects,uint32 nowMs) external pure returns(uint24 mask) {
        for(uint8 i;i<2;i++)if(effects[i].id!=0&&nowMs<effects[i].expiresAt)mask|=uint24(1)<<(effects[i].id-1);
    }
    function announce(Effect[2] memory effects,uint8 id,uint8 target,uint32 variant,uint32 serial,uint32 nowMs)
        external pure returns(Effect[2] memory,uint8 slot)
    {
        if(target>1)revert InvalidEffect();
        uint32 length=duration(id);(effects,)=expire(effects,nowMs);
        for(uint8 i;i<2;i++)if(effects[i].id==id)revert DuplicateEffect();
        slot=effects[0].id==0?0:effects[1].id==0?1:2;if(slot==2)revert NoEffectSlot();
        uint32 start=nowMs+1000;
        effects[slot]=Effect(id,id>=12?2:target,_charges(id),serial,start,start+length,variant);
        return(effects,slot);
    }
    function paddleHit(Effect[2] memory effects,uint8 side,int8 lastDirection,int256 outgoingVy,bool central,uint32 nowMs)
        external pure returns(Effect[2] memory,Shot memory shot)
    {
        if(side>1||lastDirection< -1||lastDirection>1)revert InvalidEffect();
        shot.numerator=1;shot.denominator=1;
        for(uint8 i;i<2;i++){
            Effect memory e=effects[i];if(!active(e,nowMs))continue;
            if(e.id==10&&nowMs<e.startsAt+4000){effects[i].target=side;continue;}
            if(e.target!=side)continue;
            if(e.id==4||e.id==9){shot.numerator*=6;shot.denominator*=5;}
            if(e.id==6&&central){shot.numerator*=13;shot.denominator*=10;}
            if(e.id==5)shot.curveSign=lastDirection!=0?lastDirection:outgoingVy<0?int8(-1):int8(1);
            if(e.id==4||e.id==5){delete effects[i];shot.consumedMask|=uint8(1)<<i;}
        }
        return(effects,shot);
    }
    function shield(Effect[2] memory effects,uint8 side,uint32 nowMs) external pure returns(Effect[2] memory,bool saved,uint8 slot) {
        if(side>1)revert InvalidEffect();
        for(uint8 i;i<2;i++)if(active(effects[i],nowMs)&&effects[i].id==3&&effects[i].target==side){
            delete effects[i];return(effects,true,i);
        }
        return(effects,false,0);
    }
    function breakBrick(Effect[2] memory effects,uint8 slot,uint8 brick,uint32 nowMs) external pure returns(Effect[2] memory) {
        if(slot>1||brick>2||!active(effects[slot],nowMs)||effects[slot].id!=19)revert InvalidEffect();
        uint8 bit=uint8(1)<<brick;if(effects[slot].remaining&bit==0)revert InvalidEffect();
        effects[slot].remaining&=~bit;if(effects[slot].remaining==0)delete effects[slot];return effects;
    }
    function collect(Effect[2] memory effects,uint8 slot,uint8 lastHitter,uint32 nowMs) external pure returns(Effect[2] memory,uint8 reward) {
        if(slot>1||lastHitter>1||!active(effects[slot],nowMs)||effects[slot].id!=24)revert InvalidEffect();
        Effect memory e=effects[slot];reward=uint8(e.variant&3)+1;
        // A duplicate refreshes the existing slot without stacking. The pickup
        // still belongs to the last hitter, even if the prior owner was the rival.
        uint8 other=1-slot;
        if(effects[other].id==reward&&nowMs<effects[other].expiresAt){
            effects[other]=Effect(reward,lastHitter,_charges(reward),e.serial,nowMs,nowMs+duration(reward),e.variant);
            delete effects[slot];return(effects,reward);
        }
        effects[slot]=Effect(reward,lastHitter,_charges(reward),e.serial,nowMs,nowMs+duration(reward),e.variant);
        return(effects,reward);
    }
    function pointValue(Effect[2] calldata effects,uint32 nowMs) external pure returns(uint8) {
        for(uint8 i;i<2;i++)if(active(effects[i],nowMs)&&effects[i].id==22)return 2;return 1;
    }
    function _charges(uint8 id) private pure returns(uint8){return id==19?7:id==3||id==4||id==5?1:0;}
}
