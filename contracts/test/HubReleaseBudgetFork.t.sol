// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {PublicationProbe} from "../src/labs/PublicationProbe.sol";

interface ICommitHash {
    function hashCommit(Types.Batch calldata, Types.SlotDiff[] calldata) external view returns(bytes32);
    function hashTxLog(Types.TxEntry[] calldata) external pure returns(bytes32);
}

/// READ-ONLY RPC fork: no deployed validator is impersonated on a network.
/// Setup uses a new fork-only validator and cold-storage release measurement.
/// This diagnoses the real hub bytecode, not hosted publication availability.
contract HubReleaseBudgetForkTest is Test {
    IInterludeHub hub;
    PublicationProbe probe;
    uint256 batches;
    uint256 width;
    bool distinct;
    bool enabled;
    function setUp() public {
        string memory rpc=vm.envOr("PONG_HUB_RELEASE_FORK_RPC",string(""));
        if(bytes(rpc).length==0)return;
        enabled=true;
        vm.createSelectFork(rpc);assertEq(block.chainid,10143);
        address live=0x3Ef8327F69e09cf721772F345e2A887eA22cD595;
        // Start with empty local storage so thousands of synthetic batch slots
        // do not cause thousands of unrelated RPC storage reads. Replace the
        // constructor's runtime with the exact deployed hub bytes, then verify
        // its admin getter before configuring this fork-only instance.
        bytes memory init=abi.encodePacked(vm.getCode(string.concat(vm.projectRoot(),"/out/OfficialHub.sol/OfficialHub.json")),abi.encode(address(this)));
        address clone;assembly("memory-safe"){clone:=create(0,add(init,32),mload(init))}require(clone!=address(0));
        vm.etch(clone,live.code);assertEq(clone.codehash,live.codehash);
        hub=IInterludeHub(clone);
        (bool ok,bytes memory data)=address(hub).staticcall(abi.encodeWithSignature("admin()"));require(ok);
        address admin=abi.decode(data,(address));assertEq(admin,address(this));uint256 validatorKey=uint256(keccak256("PONGIT FORK ONLY RELEASE BUDGET"));
        address validator=vm.addr(validatorKey);address resolver=address(0xb00c);
        emit log_named_uint("fork_block",block.number);emit log_named_bytes32("hub_code_hash",address(hub).codehash);
        vm.startPrank(admin);hub.allowValidator(validator,true);hub.allowResolver(resolver,true);hub.setDefaultValidator(validator);vm.stopPrank();
        vm.deal(validator,2 ether);
        vm.prank(validator);hub.register{value:1 ether}(Types.Terms(resolver,Types.Spec.MonadTen,0.1 ether,0.01 ether,0,3600,86400,3600,3600,64,2,0,true));
        probe=new PublicationProbe(hub);probe.delegateAll();
        batches=vm.envOr("PONG_HUB_RELEASE_BATCHES",uint256(1200));
        width=vm.envOr("PONG_HUB_RELEASE_WIDTH",uint256(64));
        distinct=vm.envOr("PONG_HUB_RELEASE_DISTINCT",false);
        require(batches>0&&batches<=16000&&width<=64,"bounded diagnostic");
        // Setup gas is not part of the release measurement. The release itself
        // has a real 30 M call allowance, before refunds, with all slots cold.
        vm.pauseGasMetering();
        for(uint256 i=1;i<=batches;i++)this.syntheticCommit(i,validatorKey);
        assertEq(hub.sessionOf(address(probe),0).batchIndex,batches);
        probe.undelegate(0);vm.warp(block.timestamp+3601);vm.resumeGasMetering();
    }
    // Separate memory frame per synthetic batch: a large diagnostic must not
    // fail because the harness retains every temporary ABI encoding in memory.
    function syntheticCommit(uint256 i,uint256 validatorKey) external {
        require(msg.sender==address(this));
        Types.SlotDiff[] memory diffs=new Types.SlotDiff[](width);
        Types.TxEntry[] memory entries=new Types.TxEntry[](1);bytes[] memory raws=new bytes[](1);
        raws[0]=abi.encode(i);
        for(uint256 j;j<width;j++){
            bytes32 key=bytes32(j+1+(distinct?(i-1)*width:0));
            diffs[j]=Types.SlotDiff(keccak256(abi.encode(key,uint256(0))),distinct?bytes32(0):bytes32(i-1),bytes32(i),true,0,key);
        }
        entries[0]=Types.TxEntry(keccak256(raws[0]),uint64(i),uint64(block.timestamp));
        Types.Batch memory batch=Types.Batch(address(probe),0,i,hub.hashOverlay(diffs),ICommitHash(address(hub)).hashTxLog(entries),uint64(block.timestamp));
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(validatorKey,ICommitHash(address(hub)).hashCommit(batch,diffs));
        hub.commit(batch,diffs,entries,raws,abi.encodePacked(r,s,v));
    }
    function testColdReleaseAtConfiguredBatchCount() public {
        if(!enabled){vm.skip(true);return;}
        // setUp is a separate transaction: otherwise SSTORE would see dirty
        // slots created in this same call and understate deletion gas.
        vm.cool(address(hub));vm.cool(address(probe));uint256 beforeGas=gasleft();
        (bool released,)=address(hub).call{gas:30_000_000}(abi.encodeCall(hub.releaseStake,(address(probe),bytes32(0))));
        uint256 used=beforeGas-gasleft();
        emit log_named_uint("batches",batches);emit log_named_uint("changed_words_per_batch",width);
        emit log_named_uint("distinct_overlay_slots",distinct?batches*width:width);
        emit log_named_uint("release_call_gas_before_refunds",used);emit log_named_uint("released_within_30M",released?1:0);
        assertTrue(released,"This workload exceeds the release transaction budget");
        assertEq(uint8(hub.statusOf(address(probe),0)),uint8(Types.Status.None));
    }
}
