// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {PublicationProbe} from "../src/labs/PublicationProbe.sol";

/// Uses the SDK's actual hub bytecode, not the lifecycle fixture. Still a local
/// diagnostic: it neither qualifies the hosted quota nor substitutes for live
/// admission/publication/renewal with the deployed hub.
contract HubCapacityBytecodeTest is Test {
    function testForkedHubCountsClosingSessions() public {
        string memory rpc=vm.envOr("PONG_HUB_FORK_RPC",string(""));if(bytes(rpc).length==0){vm.skip(true);return;}
        vm.createSelectFork(rpc);assertEq(block.chainid,10143);
        IInterludeHub hub=IInterludeHub(0x3Ef8327F69e09cf721772F345e2A887eA22cD595);
        (bool ok,bytes memory data)=address(hub).staticcall(abi.encodeWithSignature("admin()"));require(ok,"read hub admin");
        emit log_named_bytes32("deployed_hub_code_hash",address(hub).codehash);
        emit log_named_uint("forked_block",block.number);
        capacity(hub,abi.decode(data,(address)));
    }
    function testMeasureCapacityWhileStakeIsExiting() public {
        if(!vm.envOr("PONG_HUB_BYTECODE_DIAGNOSTIC",false)){vm.skip(true);return;}
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);vm.deal(address(this),10 ether);
        bytes memory init=abi.encodePacked(vm.getCode(string.concat(vm.projectRoot(),"/out/OfficialHub.sol/OfficialHub.json")),abi.encode(address(this)));
        address deployed;assembly("memory-safe"){deployed:=create(0,add(init,32),mload(init))}require(deployed!=address(0),"official hub deployment");
        capacity(IInterludeHub(deployed),address(this));
    }
    function capacity(IInterludeHub hub,address admin) private {
        // This test is entirely a local EVM fork. No transaction is broadcast.
        address validator=address(0xcafe);address resolver=address(0xbeef);
        vm.startPrank(admin);hub.allowValidator(validator,true);hub.allowResolver(resolver,true);hub.setDefaultValidator(validator);vm.stopPrank();vm.deal(validator,10 ether);
        Types.Terms memory terms=Types.Terms(resolver,Types.Spec.MonadTen,0.1 ether,0.01 ether,0,3600,86400,3600,3600,64,2,0,true);
        vm.prank(validator);hub.register{value:1 ether}(terms);
        PublicationProbe one=new PublicationProbe(hub);PublicationProbe two=new PublicationProbe(hub);PublicationProbe three=new PublicationProbe(hub);
        one.delegateAll();two.delegateAll();
        (bool full,)=address(three).call(abi.encodeWithSelector(three.delegateAll.selector));assertFalse(full,"maxDelegations is enforced");
        one.undelegate(0);assertEq(uint8(hub.statusOf(address(one),0)),uint8(Types.Status.Exiting));
        (uint256 bond,uint256 reserved)=hub.bondOf(validator);assertEq(bond,1 ether);assertEq(reserved,0.2 ether);
        (bool duringExit,bytes memory reason)=address(three).call(abi.encodeWithSelector(three.delegateAll.selector));
        emit log_named_uint("admission_while_prior_stake_exiting",duringExit?1:0);
        assertFalse(duringExit,"requalify pool sizing if the hub changes its capacity semantics");
        assertEq(bytes4(reason),bytes4(keccak256("ValidatorAtCapacity()")));
        vm.warp(block.timestamp+3601);hub.releaseStake(address(one),0);
        if(!duringExit)three.delegateAll();assertEq(uint8(hub.statusOf(address(three),0)),uint8(Types.Status.Active));
    }
}
