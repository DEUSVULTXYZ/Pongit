// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {CompetitionTypes as T} from "./CompetitionTypes.sol";
import {PhysicsV2} from "../../v2/PhysicsV2.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";
import {DelegatedLayout} from "../../../vendor/interlude/libraries/DelegatedLayout.sol";

/// Linked storage helpers keep the immutable application within EIP-170. The
/// root checks the actual hub lifecycle and caller before reaching this module.
library PoolAdmission {
    function key(uint256 ns,uint256 id,uint256 field) private view returns(bytes32){return keccak256(abi.encode(address(this),ns,id,field));}
    function prepare(mapping(bytes32=>uint256) storage words,A.Binding storage binding,A.Binding calldata b,IInterludeHub hub,address pool) external {
        require(block.chainid==10143&&msg.sender==pool&&hub.statusOf(address(this),Types.GLOBAL)==Types.Status.None,"released arena/pool only");
        require(b.id!=0&&b.epoch!=0&&b.a!=address(0)&&b.b!=address(0)&&b.a!=b.b&&b.mode<2&&words[key(4,0,0)]==0,"match binding");
        require(binding.id==0||(words[key(0,binding.id,0)]>>161&7)>=3,"prior match unfinished");
        require((words[key(0,b.id,0)]>>161&7)==0&&b.preparedBlock==block.number,"fresh match");
        binding.id=b.id;binding.epoch=b.epoch;binding.preparedBlock=b.preparedBlock;binding.tournament=b.tournament;
        binding.a=b.a;binding.b=b.b;binding.mode=b.mode;binding.ranked=b.ranked;binding.overtime=b.overtime;
        binding.controlA=b.controlA;binding.controlB=b.controlB;
        words[key(0,b.id,0)]=uint160(b.a)|(b.ranked?1<<160:0)|(1<<161)|(3<<164)|(uint256(b.mode)<<168);
        words[key(0,b.id,1)]=uint160(b.b);words[key(0,b.id,3)]=uint256(keccak256(abi.encode(address(this),b.id,b.epoch,b.a,b.b,block.prevrandao)));
        words[key(0,b.id,31)]=b.epoch;words[key(0,b.id,51)]=b.controlA.memoryWord;words[key(0,b.id,52)]=b.controlB.memoryWord;
        words[key(1,uint160(b.a),0)]=b.id;words[key(1,uint160(b.b),0)]=b.id;words[key(4,0,0)]=1;
    }
    function start(mapping(bytes32=>uint256) storage w,A.Binding storage b) external returns(uint256 id){
        id=b.id;uint256 meta=w[key(0,id,0)];require(id!=0&&(meta>>161&7)==1,"already started");
        w[key(0,id,0)]=(meta&~(uint256(7)<<161))|(2<<161);w[key(0,id,2)]=uint64(block.number);
    }
    function close(mapping(bytes32=>uint256) storage w,A.Binding storage b,IInterludeHub hub,address pool) external {
        require(block.chainid==10143&&msg.sender==pool,"pool only");
        require((w[key(0,b.id,0)]>>161&7)>=3||block.timestamp>=hub.sessionOf(address(this),Types.GLOBAL).expiresAt,"match running");
        hub.closeDelegation(Types.GLOBAL);
    }
    function open(mapping(bytes32=>uint256) storage w,A.Binding storage binding,IInterludeHub hub,address pool) external {
        require(block.chainid==10143&&msg.sender==pool&&binding.id!=0&&binding.preparedBlock<block.number,"prepared arena/pool only");
        require(hub.statusOf(address(this),Types.GLOBAL)==Types.Status.None&&(w[key(0,binding.id,0)]>>161&7)==1,"not released/prepared");
        DelegatedLayout.Layout storage l=DelegatedLayout.layout();
        hub.openDelegation{value:msg.value}(Types.GLOBAL,l.globalSlots,l.globalMappingBases,address(0),pool,l.minStake);
        require(hub.sessionOf(address(this),Types.GLOBAL).epoch==binding.epoch,"unexpected epoch");
    }
    function result(mapping(bytes32=>uint256) storage w,A.Binding storage b,PhysicsV2.State memory state) external view returns(T.Result memory r,uint256,uint256){
        uint256 m=w[key(0,b.id,0)];uint8 winner=uint8(m>>166&3);
        r=T.Result(T.Ref(10143,address(this),b.epoch,b.id),b.a,b.b,winner==1?b.a:winner==2?b.b:address(0),
            bytes32(w[key(0,b.id,9)]),b.mode,uint8(m>>161&7),state.scoreA,state.scoreB,state.t,false);
        return(r,w[key(0,b.id,51)],w[key(0,b.id,52)]);
    }
}
