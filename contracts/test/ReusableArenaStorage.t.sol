// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ReusableArenaStorage as S} from "../src/independent/ReusableArenaStorage.sol";
import {ReusableAdmission as A} from "../src/independent/ReusableAdmission.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
import {PublishedResultTree as Tree} from "../src/agents/competition/PublishedResultTree.sol";

/// Storage-only harness: terminal() is a test hook, never an arena operation.
contract ReusableStorageHarness {
    mapping(bytes32=>uint256) internal words;
    address immutable signer;
    constructor(address s){signer=s;S.initialize(words,7);}
    function admit(A.Ticket calldata t,T.Binding calldata b,bytes calldata signature) external {
        S.admit(words,t,b,signature,signer,address(0xa11),14);
    }
    function terminal(bytes32 result) external returns(bytes32){
        S.set(words,0,(S.get(words,0)&~(uint256(7)<<161))|(3<<161));return S.complete(words,result);
    }
    function dirtyPhysics() external {
        for(uint256 i=4;i<31;i++)S.set(words,i,i+999);
        for(uint256 i=40;i<63;i++)S.set(words,i,i+999);
    }
    function get(uint256 field) external view returns(uint256){return S.get(words,field);}
    function commitment() external view returns(uint256,uint32,bytes32){return S.commitment(words);}
    function assertMatch(uint256 epoch,uint256 id) external view{S.assertMatch(words,epoch,id);}
}
contract ReusableArenaStorageTest is Test {
    ReusableStorageHarness arena;
    function setUp() public {vm.warp(1_800_000_000);arena=new ReusableStorageHarness(vm.addr(812));}
    function binding(uint256 id) internal view returns(T.Binding memory){
        return T.Binding(id,123,address(uint160(id*4+1000)),address(uint160(id*4+1001)),
            address(uint160(id*4+1002)),address(uint160(id*4+1003)),uint64(block.timestamp+7200),
            uint64(block.timestamp+7200),uint8(id%2),true,99,7);
    }
    function admission(uint256 id,uint256 seq) internal view returns(A.Ticket memory t,T.Binding memory b,bytes memory sig){
        b=binding(id);t=A.Ticket(address(0xa11),address(arena),7,seq,id,keccak256(abi.encode(b)),
            uint64(block.timestamp),uint64(block.timestamp+90),99,keccak256("block"),14);
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(812,A.digest(t));sig=abi.encodePacked(r,s,v);
    }
    function testRejectUnfinishedUncommittedDuplicateAndOldLogicalCommands() public {
        (A.Ticket memory t,T.Binding memory b,bytes memory sig)=admission(101,1);arena.admit(t,b,sig);
        (A.Ticket memory next,T.Binding memory nextB,bytes memory nextSig)=admission(202,2);
        vm.expectRevert("slot busy/full");arena.admit(next,nextB,nextSig);
        arena.terminal(keccak256("first"));vm.expectRevert("uncommitted terminal result required");arena.terminal(keccak256("first"));
        arena.admit(next,nextB,nextSig);arena.assertMatch(7,202);
        vm.expectRevert("stale match reference");arena.assertMatch(7,101);
        vm.expectRevert("stale match reference");arena.assertMatch(8,202);
        vm.expectRevert("slot busy/full");arena.admit(t,b,sig);
    }
    function testClearsEveryPriorPhysicsAndPermissionWordButRetainsResultRoot() public {
        (A.Ticket memory t,T.Binding memory b,bytes memory sig)=admission(101,1);arena.admit(t,b,sig);
        arena.dirtyPhysics();bytes32 before_=arena.terminal(keccak256("result"));
        (t,b,sig)=admission(202,2);arena.admit(t,b,sig);
        for(uint256 i=4;i<31;i++)if(i!=11)assertEq(arena.get(i),0);
        for(uint256 i=40;i<63;i++)assertEq(arena.get(i),0);
        assertEq(arena.get(32),uint160(b.keyA));assertEq(arena.get(33),uint160(b.keyB));
        assertEq(arena.get(37),202);(,uint32 count,bytes32 after_)=arena.commitment();assertEq(count,1);assertEq(before_,after_);
    }
    function testChangingPlayersAndMatchIdsNeverAddsUnboundedStorageKeys() public {
        bytes32[] memory union=new bytes32[](82);uint256 length;uint256 maxAdmissionGas;uint256 maxResultGas;
        for(uint256 i=1;i<=64;i++){
            (A.Ticket memory t,T.Binding memory b,bytes memory sig)=admission(i*99,i);
            vm.record();uint256 before_=gasleft();arena.admit(t,b,sig);uint256 used=before_-gasleft();
            if(used>maxAdmissionGas)maxAdmissionGas=used;
            arena.dirtyPhysics();before_=gasleft();arena.terminal(keccak256(abi.encode(i)));used=before_-gasleft();
            if(used>maxResultGas)maxResultGas=used;
            (,bytes32[] memory writes)=vm.accesses(address(arena));
            for(uint256 j;j<writes.length;j++){
                bool known;for(uint256 k;k<length;k++)if(union[k]==writes[j]){known=true;break;}
                if(!known){assertLt(length,82);union[length++]=writes[j];}
            }
        }
        (,uint32 count,)=arena.commitment();assertEq(count,64);assertLe(length,82);
        emit log_named_uint("distinct storage keys after 64 games / 128 players",length);
        emit log_named_uint("maximum admission gas in storage harness",maxAdmissionGas);
        emit log_named_uint("maximum result append gas in storage harness",maxResultGas);
    }
}
