// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PublishedResultTree as Tree} from "../agents/competition/PublishedResultTree.sol";
import {ReusableAdmission as Admission} from "./ReusableAdmission.sol";
import {IndependentTypes as T} from "./IndependentTypes.sol";

/// Storage primitive for the candidate arena. One physical slot is reused while
/// every public command/result retains its logical match ID and actual epoch.
/// No key derived from a participant or logical ID is ever written here.
/// Not a playable/deployable arena; callers still enforce engine/hub lifecycle,
/// participant readiness, controls, physics and published-result settlement.
library ReusableArenaStorage {
    uint256 internal constant PHYSICS_SLOT = 1;
    uint256 internal constant FIELD_COUNT = 63;
    event ResultCommitted(uint256 indexed epoch,uint256 indexed matchId,uint32 index,
        bytes32 ticketHash,bytes32 resultHash,bytes32 leaf,bytes32 root);

    function key(uint256 namespace,uint256 id,uint256 field) internal view returns(bytes32) {
        return keccak256(abi.encode(address(this),namespace,id,field));
    }
    function get(mapping(bytes32=>uint256) storage w,uint256 field) internal view returns(uint256) {
        return w[key(0,PHYSICS_SLOT,field)];
    }
    function set(mapping(bytes32=>uint256) storage w,uint256 field,uint256 value) internal {
        w[key(0,PHYSICS_SLOT,field)] = value;
    }
    function commitment(mapping(bytes32=>uint256) storage w) internal view returns(uint256 epoch,uint32 count,bytes32 root) {
        return(w[key(6,0,0)],uint32(w[key(6,0,1)]),bytes32(w[key(6,0,2)]));
    }
    /// Only the released, root-archived lifecycle may call this for a new epoch.
    /// This helper cannot infer release from a missing receipt or a local flag.
    function initialize(mapping(bytes32=>uint256) storage w,uint256 epoch) internal {
        require(epoch>w[key(6,0,0)],"fresh epoch required");
        w[key(6,0,0)]=epoch;w[key(6,0,1)]=0;w[key(6,0,2)]=uint256(Tree.emptyRoot());
        for(uint256 i;i<16;i++)if(w[key(6,0,3+i)]!=0)delete w[key(6,0,3+i)];
        clear(w);
    }
    function clear(mapping(bytes32=>uint256) storage w) internal {
        for(uint256 i;i<FIELD_COUNT;i++)if(get(w,i)!=0)set(w,i,0);
    }
    function admit(mapping(bytes32=>uint256) storage w,Admission.Ticket memory t,T.Binding memory b,
        bytes memory signature,address bridge,address authority,uint256 rules) internal returns(bytes32 ticketHash)
    { return bind(w,t,b,signature,bridge,authority,rules,false); }
    /// Cancellation verifies the original issued ticket at its issuance time,
    /// but is only callable after its real expiry. No play is authorized by it.
    function cancelExpired(mapping(bytes32=>uint256) storage w,Admission.Ticket memory t,T.Binding memory b,
        bytes memory signature,address bridge,address authority,uint256 rules) internal returns(bytes32 ticketHash)
    { require(block.timestamp>=t.expires,"admission still valid");return bind(w,t,b,signature,bridge,authority,rules,true); }
    function bind(mapping(bytes32=>uint256) storage w,Admission.Ticket memory t,T.Binding memory b,
        bytes memory signature,address bridge,address authority,uint256 rules,bool cancelling) private returns(bytes32 ticketHash)
    {
        (uint256 epoch,uint32 count,)=commitment(w);
        uint256 phase=get(w,0)>>161&7;
        require(count<65_536 && (phase==0 || phase==3 || phase==4),"slot busy/full");
        require(get(w,38)==count,"previous result not committed");
        uint256 at=cancelling?t.issuedAt:block.timestamp;
        ticketHash=Admission.verify(t,signature,bridge,authority,address(this),epoch,uint256(count)+1,rules,at);
        require(keccak256(abi.encode(b))==t.bindingHash && b.id==t.matchId && b.epoch==epoch
            && b.preparedBlock==t.sourceBlock && b.a!=address(0) && b.b!=address(0) && b.a!=b.b
            && b.keyA!=address(0) && b.keyB!=address(0) && b.keyA!=b.keyB && b.mode<2
            && b.expiresA>at && b.expiresB>at
            && b.expiresA<=t.issuedAt+2 hours && b.expiresB<=t.issuedAt+2 hours,"participant binding");
        clear(w);
        set(w,0,uint160(b.a)|(b.ranked?1<<160:0)|(1<<161)|(uint256(b.mode)<<168));
        set(w,1,uint160(b.b));set(w,3,uint256(keccak256(abi.encode(ticketHash,b.id,epoch))));
        set(w,11,b.room);set(w,31,epoch);set(w,32,uint160(b.keyA));set(w,33,uint160(b.keyB));
        set(w,34,uint256(b.expiresA)|(uint256(b.expiresB)<<64));set(w,35,b.preparedBlock);
        set(w,36,uint256(ticketHash));set(w,37,b.id);set(w,38,t.sequence);
    }
    function assertMatch(mapping(bytes32=>uint256) storage w,uint256 epoch,uint256 id) internal view {
        require(id!=0 && get(w,37)==id && epoch==get(w,31) && epoch==w[key(6,0,0)],"stale match reference");
    }
    /// Called exactly once by the physical engine's terminal transition. The
    /// hash must commit to the full canonical result, never a bridge report.
    function complete(mapping(bytes32=>uint256) storage w,bytes32 resultHash) internal returns(bytes32 root) {
        (uint256 epoch,uint32 count,)=commitment(w);
        uint256 phase=get(w,0)>>161&7;
        require((phase==3 || phase==4) && get(w,37)!=0 && get(w,38)==uint256(count)+1
            && resultHash!=0,"uncommitted terminal result required");
        bytes32 ticketHash=bytes32(get(w,36));
        bytes32 leaf=Tree.resultLeaf(10143,address(this),epoch,get(w,37),keccak256(abi.encode(ticketHash,resultHash)));
        bytes32[16] memory frontier;
        for(uint256 i;i<16;i++)frontier[i]=bytes32(w[key(6,0,3+i)]);
        uint8 changed;bytes32 branch;(root,changed,branch)=Tree.append(frontier,count,leaf);
        if(changed<16)w[key(6,0,3+changed)]=uint256(branch);
        w[key(6,0,1)]=uint256(count)+1;w[key(6,0,2)]=uint256(root);
        emit ResultCommitted(epoch,get(w,37),count,ticketHash,resultHash,leaf,root);
    }
}
