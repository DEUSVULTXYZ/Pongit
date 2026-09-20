// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ReusableAdmission as A} from "../src/independent/ReusableAdmission.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";

contract AdmissionHarness {
    address public immutable bridge;
    uint256 public sequence;
    constructor(address signer) { bridge = signer; }
    function admit(A.Ticket calldata t, bytes calldata sig) external returns(bytes32) {
        bytes32 hash = A.verify(t, sig, bridge, address(0xa11), address(this), 9, sequence + 1, 14, block.timestamp);
        sequence++; return hash;
    }
}
contract ReusableAdmissionTest is Test {
    function testTypedDataCrossLanguageGoldenVector() public pure {
        T.Binding memory b=T.Binding(99,12,address(1),address(2),address(3),address(4),7201,7201,1,true,4,7);
        bytes32 bindingHash=keccak256(abi.encode(b));
        assertEq(bindingHash,0x5eab5bd06874a7d3f419747fd046325b8f15382dfe4a5a756e3020bda172cfca);
        A.Ticket memory t=A.Ticket(address(5),address(6),7,1,99,bindingHash,100,220,4,bytes32(uint256(5)),14);
        assertEq(A.digest(t),0xd3b24c45c87c148bf92a7990263752e3aa7d52e1a984c4fa9af4ba033b26cb5c);
    }
    AdmissionHarness gate;
    function setUp() public { vm.warp(1_800_000_000); gate = new AdmissionHarness(vm.addr(812)); }
    function ticket() internal view returns(A.Ticket memory) {
        return A.Ticket(address(0xa11),address(gate),9,1,999,keccak256("complete participant/rules binding"),
            uint64(block.timestamp),uint64(block.timestamp+90),100,keccak256("source block"),14);
    }
    function sign(A.Ticket memory t, uint256 key) internal pure returns(bytes memory) {
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,A.digest(t));return abi.encodePacked(r,s,v);
    }
    function testAdmissionWorksOnEngineChainAndCannotReplay() public {
        A.Ticket memory t=ticket();bytes memory sig=sign(t,812);
        vm.chainId(4242);assertEq(gate.admit(t,sig),A.digest(t));assertEq(gate.sequence(),1);
        vm.expectRevert(A.InvalidAdmission.selector);gate.admit(t,sig);
    }
    function testBridgeSignatureCommitsToEveryField() public {
        A.Ticket memory original=ticket();bytes memory sig=sign(original,812);
        // Every word in this entirely static tuple is authenticated, including
        // the block reference and the opaque complete participant binding.
        for(uint256 field;field<11;field++) {
            A.Ticket memory t=abi.decode(abi.encode(original),(A.Ticket));
            assembly ("memory-safe") { let at := add(t,mul(field,32)) mstore(at,xor(mload(at),1)) }
            vm.expectRevert();gate.admit(t,sig);assertEq(gate.sequence(),0);
        }
    }
    function testWrongSignerMalformedExpiryAndOversizedWindowFail() public {
        A.Ticket memory t=ticket();vm.expectRevert(A.InvalidBridgeSignature.selector);gate.admit(t,sign(t,813));
        vm.expectRevert(A.InvalidBridgeSignature.selector);gate.admit(t,hex"1234");
        t.expires=t.issuedAt+121;bytes memory sig=sign(t,812);vm.expectRevert(A.InvalidAdmission.selector);gate.admit(t,sig);
        t=ticket();sig=sign(t,812);vm.warp(t.expires);vm.expectRevert(A.InvalidAdmission.selector);gate.admit(t,sig);
    }
    function testCannotReplayOnAnotherArenaOrEpoch() public {
        A.Ticket memory t=ticket();bytes memory sig=sign(t,812);AdmissionHarness other=new AdmissionHarness(vm.addr(812));
        vm.expectRevert(A.InvalidAdmission.selector);other.admit(t,sig);
        t.epoch++;sig=sign(t,812);vm.expectRevert(A.InvalidAdmission.selector);gate.admit(t,sig);
    }
}
