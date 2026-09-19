// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// Tournament strategies must be immutable functions of their supplied game view.
/// A code hash alone cannot freeze proxy storage or external dependencies between
/// independently pinned arenas. Reject those dependencies before qualification.
library StrategyCode {
    error UnsupportedCode(uint256 offset,uint8 opcode);
    function verify(address strategy) internal view returns(bytes32 hash) {
        bytes memory code=strategy.code;
        require(code.length>0&&code.length<=16_384,"strategy code size");
        require(!(code.length>=3&&uint8(code[0])==0xef&&uint8(code[1])==1&&code[2]==0),"key delegation is not a strategy");
        for(uint256 i;i<code.length;i++){
            uint8 op=uint8(code[i]);
            // PUSH payloads are data, and cannot be EVM jump destinations.
            if(op>=0x60&&op<=0x7f){require(i+op-0x5f<code.length,"truncated push");i+=op-0x5f;continue;}
            if(op==0x31||op==0x32||op==0x33||op==0x3a||op==0x3b||op==0x3c||op==0x3f
                ||op>=0x40&&op<=0x4f||op==0x54||op==0x55||op==0x5a||op==0x5c||op==0x5d
                ||op>=0xa0&&op<=0xa4||op==0xf0||op==0xf1||op==0xf2||op==0xf4||op==0xf5||op==0xfa||op==0xff)
                revert UnsupportedCode(i,op);
        }
        // Scan the entire runtime, including metadata: no unverified suffix is
        // assumed unreachable. The example build disables appended CBOR metadata.
        return keccak256(code);
    }
}
