// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../../../vendor/interlude/interfaces/Types.sol";

/// Series are authorized on Monad before the engine's base-block pin. No
/// signature supplied by an operator may append a participant after opening.
library SeriesAdmission {
    function key(uint256 ns,uint256 id,uint256 field) private view returns(bytes32){return keccak256(abi.encode(address(this),ns,id,field));}
    function activate(mapping(bytes32=>uint256) storage w,A.Binding storage b,bytes32 seed) external {
        require(w[key(4,0,0)]==0&&(w[key(0,b.id,0)]>>161&7)==0,"fresh idle series game");
        w[key(0,b.id,0)]=uint160(b.a)|(b.ranked?1<<160:0)|(1<<161)|(3<<164)|(uint256(b.mode)<<168);
        w[key(0,b.id,1)]=uint160(b.b);w[key(0,b.id,3)]=uint256(keccak256(abi.encode(seed,b.id,b.epoch)));
        w[key(0,b.id,31)]=b.epoch;w[key(0,b.id,51)]=b.controlA.memoryWord;w[key(0,b.id,52)]=b.controlB.memoryWord;
        w[key(1,uint160(b.a),0)]=b.id;w[key(1,uint160(b.b),0)]=b.id;w[key(4,0,0)]=1;
    }
    function continueMemory(mapping(bytes32=>uint256) storage w,A.Binding storage b,
        mapping(uint256=>A.Binding) storage bindings,uint256[] storage ids,uint256 position) external {
        if(b.tournament==0)return;
        bool a;bool c;
        for(uint256 i=position;i>0&&(!a||!c);){
            A.Binding storage previous=bindings[ids[--i]];
            if(previous.tournament!=b.tournament||(w[key(0,previous.id,0)]>>161&7)!=3)continue;
            if(!a&&(previous.a==b.a||previous.b==b.a)){
                w[key(0,b.id,51)]=w[key(0,previous.id,previous.a==b.a?51:52)];a=true;
            }
            if(!c&&(previous.a==b.b||previous.b==b.b)){
                w[key(0,b.id,52)]=w[key(0,previous.id,previous.a==b.b?51:52)];c=true;
            }
        }
    }
    function prepare(mapping(uint256=>A.Binding) storage bindings,uint256[] storage ids,mapping(bytes32=>uint256) storage w,
        A.Binding[] calldata input,IInterludeHub hub,address pool) external returns(bytes32 digest){
        require(block.chainid==10143&&msg.sender==pool&&hub.statusOf(address(this),Types.GLOBAL)==Types.Status.None,"released series/pool only");
        require(input.length>0&&input.length<=32&&w[key(4,0,0)]==0,"series size/active game");
        if(ids.length!=0)require(w[key(0,0,61)]==1,"prior series not drained");
        // Historical bindings and per-match result words are never overwritten.
        while(ids.length!=0)ids.pop();
        uint256 epoch=input[0].epoch;require(epoch!=0,"series epoch");
        for(uint256 i;i<input.length;i++){
            A.Binding calldata b=input[i];require(b.id!=0&&bindings[b.id].id==0&&b.epoch==epoch&&b.preparedBlock==block.number,"fresh series binding");
            require(b.a!=address(0)&&b.b!=address(0)&&b.a!=b.b&&b.mode<2,"series participants/mode");
            require(b.controlA.codeHash!=0||b.controlA.key!=address(0),"first controller");
            require(b.controlB.codeHash!=0||b.controlB.key!=address(0),"second controller");
            require(b.controlA.key==address(0)||b.controlA.key!=b.controlB.key,"distinct controllers");
            bindings[b.id]=b;ids.push(b.id);
        }
        w[key(0,0,60)]=0;w[key(0,0,61)]=0;w[key(0,0,62)]=0;
        digest=keccak256(abi.encode(address(this),epoch,input));
    }
}
