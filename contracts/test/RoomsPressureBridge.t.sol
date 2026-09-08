// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PongRoomsTestnet} from "../src/labs/PongRoomsTestnet.sol";
import {PongInterludeRoomsChaos} from "../src/labs/PongInterludeRoomsChaos.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";

contract RoomsPressureBridgeTest is Test {
    // Public deterministic signing fixtures, never network accounts.
    uint256 constant ADMISSION = 0xa110;
    uint256 constant BRIDGE = 0xb170;
    PongRoomsTestnet g;
    address a = address(0xa);
    address b = address(0xb);

    function setUp() public {
        vm.chainId(10143);
        vm.warp(1000);
        vm.roll(100);
        g = new PongRoomsTestnet(IInterludeHub(address(0x1234)), vm.addr(ADMISSION), vm.addr(BRIDGE));
        vm.chainId(4242);
    }

    function sign(bytes32 digest, uint256 key) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function start(uint256 id, address p, address q, uint8 mode) private {
        PongInterludeRoomsChaos.Offer memory o =
            PongInterludeRoomsChaos.Offer(id, bytes32(id), p, q, mode, true, 1020, 4, bytes32(id));
        bytes memory signature = sign(g.ticketDigest(o), ADMISSION);
        vm.prank(p);
        g.acceptMatch(o, signature);
        vm.prank(q);
        g.acceptMatch(o, signature);
    }

    function state(uint256 id) private view returns (PhysicsV2.State memory s) {
        (,,,,,,,,,,,, s) = g.getSnapshot(id);
    }

    function pressure(uint256 id) private view returns (PongRoomsTestnet.Attestation memory p) {
        PhysicsV2.State memory s = state(id);
        return PongRoomsTestnet.Attestation(
            id, s.scoreA + s.scoreB, s.resumeAt, 2e15, 0, 12345, bytes32(uint256(444)), uint64(block.timestamp + 30)
        );
    }

    function paused() private returns (PongRoomsTestnet.Attestation memory p) {
        start(1, a, b, 1);
        vm.roll(3100);
        g.tick(1);
        assertTrue(state(1).awaitingServe);
        return pressure(1);
    }

    function submit(PongRoomsTestnet.Attestation memory p) private {
        g.submitPressure(p, sign(g.pressureDigest(p), BRIDGE));
    }

    function testValidAttestationResumesAndCannotBeConsumedTwice() public {
        PongRoomsTestnet.Attestation memory p = paused();
        submit(p);
        submit(p);
        g.tick(1);
        assertFalse(state(1).awaitingServe);
        assertEq(state(1).halfA, 36e6);
        (uint256 paidA, uint256 paidB) = g.paidPressure(1);
        assertEq(paidA, 2e15);
        assertEq(paidB, 0);
        bytes memory signature = sign(g.pressureDigest(p), BRIDGE);
        vm.expectRevert();
        g.submitPressure(p, signature);
    }

    function testPlayerAndAdmissionKeysCannotAttest() public {
        PongRoomsTestnet.Attestation memory p = paused();
        bytes memory signature = sign(g.pressureDigest(p), ADMISSION);
        vm.prank(a);
        vm.expectRevert();
        g.submitPressure(p, signature);
        signature = sign(g.pressureDigest(p), 0xabc);
        vm.expectRevert();
        g.submitPressure(p, signature);
        g.tick(1);
        assertTrue(state(1).awaitingServe);
    }

    function testSignatureBindsAmountsMatchRallyCutoffAndApplication() public {
        PongRoomsTestnet.Attestation memory p = paused();
        bytes memory signature = sign(g.pressureDigest(p), BRIDGE);
        p.paidA++;
        vm.expectRevert();
        g.submitPressure(p, signature);
        p.paidA--;
        p.matchId = 2;
        vm.expectRevert();
        g.submitPressure(p, signature);
        p.matchId = 1;
        p.rally++;
        vm.expectRevert();
        g.submitPressure(p, signature);
        p.rally--;
        p.resumeAt++;
        vm.expectRevert();
        g.submitPressure(p, signature);
        p.resumeAt--;
        vm.chainId(10143);
        PongRoomsTestnet other =
            new PongRoomsTestnet(IInterludeHub(address(0x1234)), vm.addr(ADMISSION), vm.addr(BRIDGE));
        assertNotEq(g.pressureDigest(p), other.pressureDigest(p));
        vm.chainId(4242);
        submit(p);
        g.tick(1);
        assertFalse(state(1).awaitingServe);
    }

    function testCheckpointCannotBeRevisedButExpiryCanBeRefreshed() public {
        PongRoomsTestnet.Attestation memory p = paused();
        submit(p);
        p.paidB = 2e15;
        bytes memory signature = sign(g.pressureDigest(p), BRIDGE);
        vm.expectRevert();
        g.submitPressure(p, signature);
        p.paidB = 0;
        p.sourceBlock++;
        signature = sign(g.pressureDigest(p), BRIDGE);
        vm.expectRevert();
        g.submitPressure(p, signature);
        p.sourceBlock--;
        vm.warp(1031);
        g.tick(1);
        assertTrue(state(1).awaitingServe);
        p.expires = 1061;
        submit(p);
        g.tick(1);
        assertFalse(state(1).awaitingServe);
    }

    function testExpiredOrLongLivedAttestationsRejected() public {
        PongRoomsTestnet.Attestation memory p = paused();
        p.expires = 1000;
        bytes memory signature = sign(g.pressureDigest(p), BRIDGE);
        vm.expectRevert();
        g.submitPressure(p, signature);
        p.expires = 1031;
        signature = sign(g.pressureDigest(p), BRIDGE);
        vm.expectRevert();
        g.submitPressure(p, signature);
        p.expires = 1030;
        p.sourceBlock = 0;
        signature = sign(g.pressureDigest(p), BRIDGE);
        vm.expectRevert();
        g.submitPressure(p, signature);
    }

    function testOnlyTestnetAndEngineCallsAllowed() public {
        vm.chainId(1);
        vm.expectRevert();
        new PongRoomsTestnet(IInterludeHub(address(0x1234)), vm.addr(ADMISSION), vm.addr(BRIDGE));
        vm.chainId(4242);
        PongRoomsTestnet.Attestation memory p = paused();
        bytes memory signature = sign(g.pressureDigest(p), BRIDGE);
        vm.chainId(10143);
        vm.expectRevert();
        g.submitPressure(p, signature);
    }

    function testTwoChaosMatchesAndAttestationsFitPublicationBudget() public {
        vm.record();
        start(1, a, b, 1);
        start(2, address(0xc), address(0xd), 1);
        vm.roll(3100);
        g.tick(1);
        g.tick(2);
        submit(pressure(1));
        submit(pressure(2));
        g.tick(1);
        g.tick(2);
        vm.prank(a);
        g.concede(1);
        vm.prank(address(0xc));
        g.concede(2);
        (, bytes32[] memory writes) = vm.accesses(address(g));
        uint256 unique;
        for (uint256 i; i < writes.length; i++) {
            bool seen;
            for (uint256 j; j < i; j++) {
                if (writes[j] == writes[i]) seen = true;
            }
            if (!seen) unique++;
        }
        assertLe(unique, 64);
        emit log_named_uint("Engine storage diffs", unique);
    }
}
