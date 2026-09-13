// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Pure paddle geometry/speed rules shared by all candidate Chaos effects.
/// Heights mean total solid paddle height; split paddles add a 16-unit empty gap.
contract ChaosModifiers {
    uint256 private constant SCALE=1_000_000;
    struct Effect { uint8 id; uint8 target; uint64 startsAt; uint64 expiresAt; bool consumed; }
    struct Paddles { uint256 heightA; uint256 heightB; uint256 speedA; uint256 speedB; bool splitA; bool splitB; }
    error InvalidEffectState();
    function active(Effect memory e,uint64 nowMs) public pure returns(bool){
        return e.id!=0&&!e.consumed&&nowMs>=e.startsAt&&nowMs<e.expiresAt;
    }
    function calculate(uint256 bettingA,uint256 bettingB,Effect[2] calldata effects,uint64 nowMs)
        external pure returns(Paddles memory p)
    {
        if(bettingA<72*SCALE||bettingA>96*SCALE||bettingB<72*SCALE||bettingB>96*SCALE)revert InvalidEffectState();
        uint256[2] memory sizes=[bettingA,bettingB];
        uint256[2] memory hn=[uint256(1),1];uint256[2] memory hd=[uint256(1),1];
        uint256[2] memory vn=[uint256(1),1];uint256[2] memory vd=[uint256(1),1];
        bool[2] memory split;
        for(uint256 i;i<2;i++){
            Effect memory e=effects[i];
            if(e.id>24||e.target>2||(e.id!=0&&e.expiresAt<=e.startsAt))revert InvalidEffectState();
            if(active(e,nowMs)&&e.id==12)(sizes[0],sizes[1])=(sizes[1],sizes[0]);
        }
        for(uint256 i;i<2;i++){
            Effect memory e=effects[i];if(!active(e,nowMs))continue;
            for(uint8 side;side<2;side++){
                if(e.target!=side&&e.id!=23)continue;
                if(e.id==1||e.id==23){hn[side]*=5;hd[side]*=4;}
                if(e.id==7||e.id==9){hn[side]*=4;hd[side]*=5;}
                if(e.id==2){vn[side]*=13;vd[side]*=10;}
                if(e.id==8||(e.id==10&&nowMs>=e.startsAt+4000)){vn[side]*=4;vd[side]*=5;}
                if(e.id==11)split[side]=true;
            }
        }
        p=Paddles(_bound(sizes[0]*hn[0]/hd[0]),_bound(sizes[1]*hn[1]/hd[1]),
            180*SCALE*vn[0]/vd[0],180*SCALE*vn[1]/vd[1],split[0],split[1]);
    }
    function _bound(uint256 height) private pure returns(uint256){return height<64*SCALE?64*SCALE:height>120*SCALE?120*SCALE:height;}
    /// Outer half-height, used for top/bottom movement bounds and exact drawing.
    function outerHalf(uint256 solidHeight,bool split) external pure returns(uint256){return (solidHeight+(split?16*SCALE:0))/2;}
}
