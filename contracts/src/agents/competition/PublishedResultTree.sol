// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// Candidate bounded result accumulator. This library is not enabled by any
/// deployed arena. Admission and verification of the published root are separate
/// responsibilities; a proof against a caller-supplied root authorizes nothing.
library PublishedResultTree {
    uint32 internal constant CAPACITY = 65_536;
    error FullResultTree();
    error EmptyResultLeaf();

    function emptyRoot() internal pure returns(bytes32 root) {
        for(uint8 level;level<16;level++)root=keccak256(abi.encode(root,root));
    }

    /// One frontier word changes per append (none on the final full-tree append).
    /// Together with count and root, an epoch needs at most eighteen storage keys,
    /// independent of how many game results it retains. Arrays here are memory
    /// values; the arena can persist them in its existing flattened namespace.
    function append(bytes32[16] memory frontier,uint32 count,bytes32 leaf)
        internal pure returns(bytes32 root,uint8 changedLevel,bytes32 changedBranch)
    {
        if(count>=CAPACITY)revert FullResultTree();
        if(leaf==bytes32(0))revert EmptyResultLeaf();
        root=leaf;bytes32 empty;changedLevel=16;
        for(uint8 level;level<16;level++){
            if((count>>level)&1==0){
                if(changedLevel==16){changedLevel=level;changedBranch=root;}
                root=keccak256(abi.encode(root,empty));
            }else root=keccak256(abi.encode(frontier[level],root));
            empty=keccak256(abi.encode(empty,empty));
        }
    }

    /// Ordered paths, not sorted-pair Merkle proofs. Count prevents a padded
    /// empty position from being presented as a published result.
    function verify(bytes32 root,uint32 count,uint32 index,bytes32 leaf,bytes32[16] memory siblings)
        internal pure returns(bool)
    {
        if(count==0||count>CAPACITY||index>=count||leaf==bytes32(0))return false;
        bytes32 node=leaf;
        for(uint8 level;level<16;level++)node=(index>>level)&1==0
            ?keccak256(abi.encode(node,siblings[level]))
            :keccak256(abi.encode(siblings[level],node));
        return node==root;
    }

    /// Result hash must commit to the complete canonical result, participant
    /// bindings and rules. Runtime finality is not part of this immutable leaf.
    function resultLeaf(uint256 chainId,address arena,uint256 epoch,uint256 matchId,bytes32 resultHash)
        internal pure returns(bytes32)
    {
        require(chainId!=0&&arena!=address(0)&&epoch!=0&&matchId!=0&&resultHash!=0,"result identity");
        return keccak256(abi.encode(keccak256("PONGIT_PUBLISHED_RESULT_V1"),chainId,arena,epoch,matchId,resultHash));
    }
}
