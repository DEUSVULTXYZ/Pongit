// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PublishedResultTree as Tree} from "../src/agents/competition/PublishedResultTree.sol";

contract PublishedResultTreeTest is Test {
    // Shared fixed vector with tests/published-result-tree.test.ts. It catches
    // ABI/domain/order drift between the proof producer and Solidity consumer.
    function testCrossLanguageGoldenVector() public pure {
        address arena=0x1111111111111111111111111111111111111111;
        bytes32 a=Tree.resultLeaf(10143,arena,7,1,keccak256(abi.encode(bytes32(uint256(123)),bytes32(uint256(1)))));
        bytes32 b=Tree.resultLeaf(10143,arena,7,2,keccak256(abi.encode(bytes32(uint256(123)),bytes32(uint256(2)))));
        assertEq(a,0x4539959cb7342a6c4fc0cdcce1bb7000479e97c00df3e093eec4e79753798013);
        assertEq(b,0xe494af79a9c93028ff6b1ae7e6ebc176f9a9756bc1d3f38a23a241d8611554e7);
        bytes32[16] memory frontier;(,uint8 changed,bytes32 branch)=Tree.append(frontier,0,a);frontier[changed]=branch;
        (bytes32 root,,)=Tree.append(frontier,1,b);
        assertEq(root,0x5615732222ead24391252c04d4851b3464d5257999892fd4d69ab9ed15cbf25b);
    }
    function leaf(uint256 id) internal pure returns(bytes32){return Tree.resultLeaf(10143,address(0xbeef),7,id,keccak256(abi.encode(id)));}

    // Independent full-array construction, deliberately not the frontier
    // algorithm under test. It also builds proofs for historical results.
    function referenceTree(uint32 count,uint32 wanted) internal pure returns(bytes32 root,bytes32[16] memory proof){
        bytes32[] memory nodes=new bytes32[](512);
        for(uint256 i;i<count;i++)nodes[i]=leaf(i+1);
        uint256 index=wanted;uint256 width=512;uint8 level;
        while(width>1){
            proof[level]=nodes[index^1];
            for(uint256 i;i<width/2;i++)nodes[i]=keccak256(abi.encode(nodes[2*i],nodes[2*i+1]));
            width/=2;index/=2;level++;
        }
        root=nodes[0];bytes32 empty;
        for(uint8 i;i<9;i++)empty=keccak256(abi.encode(empty,empty));
        for(;level<16;level++){proof[level]=empty;root=keccak256(abi.encode(root,empty));empty=keccak256(abi.encode(empty,empty));}
    }

    function testHistoricalProofsAndBoundedFrontier() public pure {
        bytes32[16] memory frontier;bytes32 root;
        for(uint32 count;count<257;count++){
            uint8 changed;bytes32 branch;(root,changed,branch)=Tree.append(frontier,count,leaf(count+1));
            require(changed<16);frontier[changed]=branch;
        }
        for(uint32 i;i<257;i+=17){
            (bytes32 expected,bytes32[16] memory proof)=referenceTree(257,i);
            assertEq(root,expected);assertTrue(Tree.verify(root,257,i,leaf(i+1),proof));
            assertFalse(Tree.verify(root,257,i,leaf(i+2),proof));
            assertFalse(Tree.verify(root,257,i^1,leaf(i+1),proof));
            proof[15]=bytes32(uint256(proof[15])^1);assertFalse(Tree.verify(root,257,i,leaf(i+1),proof));
        }
    }
    function testEpochArenaAndResultCannotBeReplayed() public pure {
        (bytes32 root,bytes32[16] memory proof)=referenceTree(1,0);bytes32 hash=keccak256(abi.encode(uint256(1)));
        assertFalse(Tree.verify(root,1,0,Tree.resultLeaf(10143,address(0xbeef),8,1,hash),proof));
        assertFalse(Tree.verify(root,1,0,Tree.resultLeaf(10143,address(0xcafe),7,1,hash),proof));
        assertFalse(Tree.verify(root,1,0,Tree.resultLeaf(1,address(0xbeef),7,1,hash),proof));
        assertFalse(Tree.verify(root,1,1,leaf(1),proof));
        assertFalse(Tree.verify(root,0,0,leaf(1),proof));
        assertFalse(Tree.verify(root,65537,0,leaf(1),proof));
    }
    function testFullTreeLastAppendNeedsNoNewFrontierKey() public pure {
        bytes32[16] memory frontier;
        for(uint256 i;i<16;i++)frontier[i]=keccak256(abi.encode(i));
        (bytes32 root,uint8 changed,)=Tree.append(frontier,65535,leaf(65536));
        assertEq(changed,16);assertTrue(Tree.verify(root,65536,65535,leaf(65536),frontier));
    }
    function appendExternal(uint32 count,bytes32 value) external pure {bytes32[16] memory frontier;Tree.append(frontier,count,value);}
    function testOverflowAndEmptyLeafFail() public {
        vm.expectRevert(Tree.FullResultTree.selector);this.appendExternal(65536,leaf(1));
        vm.expectRevert(Tree.EmptyResultLeaf.selector);this.appendExternal(0,0);
    }
}
