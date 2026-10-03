// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {HousePolicies as P} from "../src/agents/competition/HousePolicies.sol";
import {HousePolicyMemory as M} from "../src/agents/competition/HousePolicyMemory.sol";

contract HouseMemoryHarness {
    function pack(P.Memory memory v) external pure returns(uint256){return M.pack(v);}
    function unpack(uint256 word) external pure returns(P.Memory memory){return M.unpack(word);}
}

/// The deployed controller is the independent reference, including unused high
/// bits, zero initialization, signed fields and invalid memory rejection.
contract HousePolicyMemoryTest is Test {
    P referencePolicy=new P();
    HouseMemoryHarness candidate=new HouseMemoryHarness();
    function testFuzzEveryPackedWord(uint256 word) public view {
        assertEq(abi.encode(candidate.unpack(word)),abi.encode(referencePolicy.unpack(word)));
    }
    function testZeroInitializationIsNotDirectionMinusOne() public view {
        P.Memory memory v=candidate.unpack(0);
        assertEq(v.held,0);assertEq(candidate.pack(v),referencePolicy.pack(v));
    }
    function testFuzzPackingAndRevertParity(P.Memory memory v) public {
        (bool a,bytes memory expected)=address(referencePolicy).call(abi.encodeCall(P.pack,(v)));
        (bool b,bytes memory actual)=address(candidate).call(abi.encodeCall(HouseMemoryHarness.pack,(v)));
        assertEq(b,a);assertEq(actual,expected);
    }
    function testFuzzValidMemoryRoundTrip(uint64 next,int8 held,int48 mean,uint16 samples,uint256 target) public view {
        P.Memory memory v=P.Memory(next%uint64(1<<40),int8(int256(held)%3),mean,samples,int256(target%576000000000001));
        if(v.held< -1)v.held= -1;if(v.held>1)v.held=1;
        uint256 word=candidate.pack(v);assertEq(word,referencePolicy.pack(v));
        assertEq(abi.encode(candidate.unpack(word)),abi.encode(v));
    }
}
