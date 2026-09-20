// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableArenaStorage as S} from "../../independent/ReusableArenaStorage.sol";
import {ReusableAdmission as Admission} from "../../independent/ReusableAdmission.sol";
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {HousePolicies} from "./HousePolicies.sol";

/// Fixed controller fields, never keyed by a newly admitted agent or match.
/// 63: tournament/overtime; 64..65: code hashes; 66: official controller IDs.
library ReusableAgentBinding {
    uint256 internal constant RULES=15;
    function binding(mapping(bytes32=>uint256) storage w) public view returns(A.Binding memory b){
        uint256 meta=S.get(w,0);uint256 controllers=S.get(w,66);uint256 permission=S.get(w,34);uint256 competition=S.get(w,63);
        b=A.Binding(S.get(w,37),S.get(w,31),uint64(S.get(w,35)),uint64(competition),address(uint160(meta)),address(uint160(S.get(w,1))),
            uint8(meta>>168&1),meta>>160&1!=0,competition>>64&1!=0,
            A.Controller(bytes32(S.get(w,64)),S.get(w,51),uint8(controllers),address(uint160(S.get(w,32))),uint64(permission)),
            A.Controller(bytes32(S.get(w,65)),S.get(w,52),uint8(controllers>>8),address(uint160(S.get(w,33))),uint64(permission>>64)));
    }
    function human(mapping(bytes32=>uint256) storage w,address player) internal view returns(bool){
        if(player==address(uint160(S.get(w,0))))return S.get(w,64)==0;
        return player==address(uint160(S.get(w,1)))&&S.get(w,65)==0;
    }
    function controller(A.Controller memory c,address player,HousePolicies policies,uint64 issuedAt,uint256 at,bool cancelling) private view {
        require(c.house<=8,"controller identity");
        if(c.codeHash==0){
            require(c.house==0&&c.memoryWord==0&&c.key!=address(0)&&c.expires>at&&c.expires<=issuedAt+2 hours,"human permission");
        }else{
            require(c.key==address(0)&&c.expires==0&&c.memoryWord>>192==0,"strategy has no external controls");
            // The immutable strategy must already exist in the engine's pinned
            // base state. New code waits for an arena opened after deployment.
            // An expired ticket can be cancelled even if its strategy was not
            // present at the pinned block. Cancellation never calls that code.
            if(!cancelling)require((c.house==0?player:address(policies)).codehash==c.codeHash,"strategy not in engine base state");
        }
    }
    function admit(mapping(bytes32=>uint256) storage w,Admission.Ticket calldata ticket,A.Binding calldata b,bytes calldata signature,
        address signer,address authority,HousePolicies policies) external returns(bytes32 hash){
        return bind(w,ticket,b,signature,signer,authority,policies,false);
    }
    function cancelExpired(mapping(bytes32=>uint256) storage w,Admission.Ticket calldata ticket,A.Binding calldata b,bytes calldata signature,
        address signer,address authority,HousePolicies policies) external returns(bytes32 hash){
        require(block.timestamp>=ticket.expires,"admission still valid");
        return bind(w,ticket,b,signature,signer,authority,policies,true);
    }
    function bind(mapping(bytes32=>uint256) storage w,Admission.Ticket calldata ticket,A.Binding calldata b,bytes calldata signature,
        address signer,address authority,HousePolicies policies,bool cancelling) private returns(bytes32 hash){
        (uint256 epoch,uint32 count,)=S.commitment(w);uint256 phase=S.get(w,0)>>161&7;
        require(count<65_536&&(phase==0||phase>=3)&&S.get(w,38)==count,"slot busy/full");
        uint256 at=cancelling?ticket.issuedAt:block.timestamp;
        hash=Admission.verify(ticket,signature,signer,authority,address(this),epoch,uint256(count)+1,RULES,at);
        require(keccak256(abi.encode(b))==ticket.bindingHash&&b.id==ticket.matchId&&b.epoch==epoch&&b.preparedBlock==ticket.sourceBlock
            &&b.a!=address(0)&&b.b!=address(0)&&b.a!=b.b&&b.mode<2,"agent admission binding");
        require(b.controlA.codeHash!=0||b.controlB.codeHash!=0,"agent required");
        require(b.controlA.key==address(0)||b.controlA.key!=b.controlB.key,"distinct keys");
        controller(b.controlA,b.a,policies,ticket.issuedAt,at,cancelling);controller(b.controlB,b.b,policies,ticket.issuedAt,at,cancelling);
        S.clear(w);
        S.set(w,0,uint160(b.a)|(b.ranked?1<<160:0)|(1<<161)|(uint256(b.mode)<<168));S.set(w,1,uint160(b.b));
        S.set(w,3,uint256(keccak256(abi.encode(hash,b.id,epoch))));S.set(w,31,epoch);
        S.set(w,32,uint160(b.controlA.key));S.set(w,33,uint160(b.controlB.key));S.set(w,34,uint256(b.controlA.expires)|(uint256(b.controlB.expires)<<64));
        S.set(w,35,b.preparedBlock);S.set(w,36,uint256(hash));S.set(w,37,b.id);S.set(w,38,ticket.sequence);
        S.set(w,51,b.controlA.memoryWord);S.set(w,52,b.controlB.memoryWord);
        S.set(w,63,uint256(b.tournament)|(b.overtime?uint256(1)<<64:0));S.set(w,64,uint256(b.controlA.codeHash));S.set(w,65,uint256(b.controlB.codeHash));
        S.set(w,66,uint256(b.controlA.house)|(uint256(b.controlB.house)<<8));
        // Only contract-controlled seats are automatically ready. The human
        // seat still acknowledges the rendered court before the countdown.
        S.set(w,61,(b.controlA.codeHash!=0?1:0)|(b.controlB.codeHash!=0?2:0));
    }
}
