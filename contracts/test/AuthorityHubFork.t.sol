// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Delegatable} from "../vendor/interlude/Delegatable.sol";
import {Delegated} from "../vendor/interlude/libraries/Delegated.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

/// A local fork probe, never a hosted app or a deployment artifact.
contract AuthorityHubProbe is Delegatable {
    uint256 public value;

    constructor(IInterludeHub hub_) Delegatable(hub_) {
        _registerGlobal(Delegated.Uint256Slot.wrap(bytes32(uint256(0))));
    }

    function write(uint256 next) external whenNotDelegated(Types.GLOBAL) {
        value = next;
    }
}

/// Explicit opt-in, using real deployed hub code and terms on a private fork.
/// No public transactions or validator-key impersonation.
contract AuthorityHubForkTest is Test {
    IInterludeHub constant HUB = IInterludeHub(0x3Ef8327F69e09cf721772F345e2A887eA22cD595);
    AuthorityHubProbe probe;
    uint256 fee;
    bool enabled;

    function setUp() public {
        string memory rpc = vm.envOr("AUTHORITY_FORK_RPC", string(""));
        enabled = bytes(rpc).length != 0;
        if (!enabled) return;
        uint256 pin = vm.envOr("AUTHORITY_FORK_BLOCK", uint256(0));
        if (pin == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, pin);
        assertEq(block.chainid, 10143);
        assertGt(address(HUB).code.length, 0);
        // Optional fork-only capacity setup. This never sends a public write.
        // Keep the unmodified fork run as the admission-readiness evidence.
        if (vm.envOr("AUTHORITY_FORK_FREE_EXPIRED_SLOT", false)) {
            address legacy = 0xfd1693294fED77304662f08e827b043B0Ba386A3;
            Types.Session memory expired = HUB.sessionOf(legacy, Types.GLOBAL);
            assertEq(uint8(expired.status), uint8(Types.Status.Active));
            assertGt(vm.getBlockTimestamp(), expired.expiresAt);
            HUB.forceClose(legacy, Types.GLOBAL);
            vm.warp(vm.getBlockTimestamp() + HUB.termsOf(expired.validator).challengeWindow + 1);
            HUB.releaseStake(legacy, Types.GLOBAL);
            emit log("FORK ONLY: released the expired legacy slot; public state unchanged");
        }
        Types.Terms memory terms = HUB.termsOf(HUB.defaultValidator());
        fee = terms.delegationFee;
        vm.deal(address(this), fee * 3 + 1 ether);
        probe = new AuthorityHubProbe(HUB);
        emit log_named_uint("Monad fork block", block.number);
        emit log_named_uint("challenge seconds", terms.challengeWindow);
        emit log_named_uint("diff cap", terms.maxDiffsPerCommit);
    }

    function testRealHubCloseReleaseAndNewEpoch() public {
        if (!enabled) vm.skip(true);
        probe.write(7);
        probe.delegateAll{value: fee}();
        Types.Session memory first = HUB.sessionOf(address(probe), Types.GLOBAL);
        assertEq(uint8(first.status), uint8(Types.Status.Active));
        vm.expectRevert(Delegatable.DelegatedWritesDisabled.selector);
        probe.write(8);
        vm.recordLogs();
        probe.undelegate(Types.GLOBAL);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint64 unlockAt;
        for (uint256 i; i < logs.length; i++) {
            if (
                logs[i].emitter == address(HUB)
                    && logs[i].topics[0] == keccak256("DelegationClosing(address,bytes32,uint64)")
            ) {
                unlockAt = abi.decode(logs[i].data, (uint64));
            }
        }
        Types.Session memory closing = HUB.sessionOf(address(probe), Types.GLOBAL);
        assertEq(uint8(closing.status), uint8(Types.Status.Exiting));
        assertGt(unlockAt, vm.getBlockTimestamp());
        vm.expectRevert();
        probe.delegateAll{value: fee}();
        vm.expectRevert();
        HUB.releaseStake(address(probe), Types.GLOBAL);
        vm.warp(unlockAt);
        HUB.releaseStake(address(probe), Types.GLOBAL);
        assertEq(uint8(HUB.statusOf(address(probe), Types.GLOBAL)), uint8(Types.Status.None));
        probe.write(8);
        probe.delegateAll{value: fee}();
        Types.Session memory next = HUB.sessionOf(address(probe), Types.GLOBAL);
        assertGt(next.epoch, first.epoch);
        assertEq(probe.value(), 8);
    }

    function testRealHubForceCloseCannotSkipProtocolDeadline() public {
        if (!enabled) vm.skip(true);
        probe.delegateAll{value: fee}();
        Types.Session memory first = HUB.sessionOf(address(probe), Types.GLOBAL);
        vm.expectRevert();
        HUB.forceClose(address(probe), Types.GLOBAL);
        vm.warp(uint256(first.lastCommitAt) + first.maxBatchInterval + 1);
        HUB.forceClose(address(probe), Types.GLOBAL);
        assertEq(uint8(HUB.statusOf(address(probe), Types.GLOBAL)), uint8(Types.Status.Exiting));
    }
}
