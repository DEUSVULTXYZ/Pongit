// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// One latest intent per side, anchored to observed engine game time. Catch-up
/// never applies a newly received direction retroactively to an older rally.
/// Game time is below 30 minutes (1.8e9 us): two uint32 clocks plus actions fit
/// in the unused high bits of match metadata, without another publication slot.
library PendingControls {
    uint256 private constant MASK=(uint256(1)<<35)-1;
    error StaleInput();
    event ControlQueued(uint256 indexed id,uint8 indexed side,uint256 sequence,uint8 action,uint64 gameTime);
    function _key(uint256 id,uint256 field) private view returns(bytes32){return keccak256(abi.encode(address(this),uint256(0),id,field));}
    function validate(mapping(bytes32=>uint256) storage w,uint256 id,uint8 side,int8 direction,uint256 sequence,uint256 deadline) external view {
        uint256 shift=side==0?16:80;
        if(direction< -1||direction>1||sequence!=uint64(w[_key(id,8)]>>shift)+1||sequence>type(uint64).max
            ||block.number>deadline||deadline>block.number+200)revert StaleInput();
        require(action((w[_key(id,0)]>>176),side)!=4,"pending concession");
    }
    function record(mapping(bytes32=>uint256) storage w,uint256 id,uint8 side,uint8 choice,uint256 sequence,uint64 target) external {
        uint256 shift=side==0?16:80;
        if(choice!=4)w[_key(id,8)]=(w[_key(id,8)]&~(uint256(type(uint64).max)<<shift))|(sequence<<shift);
        if(w[_key(id,0)]>>161&7!=2)return;
        if(choice==4&&action((w[_key(id,0)]>>176),side)==4)return;
        w[_key(id,0)]=(w[_key(id,0)]&((uint256(1)<<176)-1))|(queue(w[_key(id,0)]>>176,side,choice,target)<<176);emit ControlQueued(id,side,sequence,choice,target);
    }
    function next(mapping(bytes32=>uint256) storage w,uint256 id,uint64 nowUs,uint64 target) external view returns(uint64){return boundary((w[_key(id,0)]>>176),nowUs,target);}
    function consume(mapping(bytes32=>uint256) storage w,uint256 id,uint64 at) external returns(uint8 concession){
        uint256 word=(w[_key(id,0)]>>176);if(word==0)return 0;
        (uint256 pending,uint256 control,uint8 loss)=settle(word,w[_key(id,8)],at);
        if(word!=pending)w[_key(id,0)]=(w[_key(id,0)]&((uint256(1)<<176)-1))|(pending<<176);if(control!=w[_key(id,8)])w[_key(id,8)]=control;return loss;
    }
    function action(uint256 word,uint8 side) internal pure returns(uint8){return uint8(word>>(side*35+32)&7);}
    function queue(uint256 word,uint8 side,uint8 choice,uint64 at) internal pure returns(uint256){
        require(at<=type(uint32).max,"pending clock range");
        require(side<2&&choice>0&&choice<=4&&action(word,side)!=4,"pending concession");
        word=(word&~(MASK<<(side*35)))|((uint256(at)|(uint256(choice)<<32))<<(side*35));
        if(choice==4&&(word>>70&3)==0)word|=uint256(side+1)<<70;
        return word;
    }
    function boundary(uint256 word,uint64 nowUs,uint64 target) internal pure returns(uint64 end){
        end=target;
        for(uint8 side;side<2;side++)if(action(word,side)!=0){uint64 at=uint32(word>>(side*35));if(at<nowUs)at=nowUs;if(at<end)end=at;}
    }
    function settle(uint256 word,uint256 control,uint64 nowUs) internal pure returns(uint256,uint256,uint8 concession){
        uint8 first=uint8(word>>70&3);
        for(uint8 side;side<2;side++){
            uint8 choice=action(word,side);if(choice==0||uint32(word>>(side*35))>nowUs)continue;
            word&=~(MASK<<(side*35));
            if(choice==4){if(concession==0||first==side+1)concession=side+1;}
            else control=(control&~(uint256(3)<<(side*2)))|(uint256(choice-1)<<(side*2));
        }
        if(concession!=0)word=0;
        return(word,control,concession);
    }
}
