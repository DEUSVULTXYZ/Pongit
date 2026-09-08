// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PongInterludeRoomsChaos} from "../src/labs/PongInterludeRoomsChaos.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";

// Test-only transport. Its setter is deliberately absent from src/ and cannot be
// deployed through the application's ship scripts. It is not a monetary oracle.
contract ChaosCandidateFixture is PongInterludeRoomsChaos {
    mapping(bytes32 => Pressure) private fixtures;
    constructor(IInterludeHub h, address c) PongInterludeRoomsChaos(h, c) {}

    function fixture(uint256 id, uint8 rally, uint64 at, uint256 a, uint256 b, bytes32 checkpoint) external {
        fixtures[keccak256(abi.encode(id, rally, at))] = Pressure(true, a, b, checkpoint);
    }

    function _verifiedPressure(uint256 id, uint8 rally, uint64 at) internal view override returns (Pressure memory) {
        return fixtures[keccak256(abi.encode(id, rally, at))];
    }
}

contract InterludeRoomsChaosTest is Test {
    ChaosCandidateFixture g;
    uint256 constant KEY = 0xBEEF123; // Deterministic signing fixture, never a network account.
    address a = address(0xA);
    address b = address(0xB);
    address c = address(0xC);
    address d = address(0xD);

    function setUp() public {
        vm.chainId(10143);
        vm.warp(1000);
        vm.roll(100);
        g = new ChaosCandidateFixture(IInterludeHub(address(0x1234)), vm.addr(KEY));
        vm.chainId(4242);
    }

    function offer(uint256 id, address p, address q, bool ranked)
        private
        view
        returns (PongInterludeRoomsChaos.Offer memory)
    {
        return PongInterludeRoomsChaos.Offer(
            id, bytes32(id), p, q, 0, ranked, uint64(block.timestamp + 20), 4, bytes32(id)
        );
    }

    function sig(PongInterludeRoomsChaos.Offer memory o) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, g.ticketDigest(o));
        return abi.encodePacked(r, s, v);
    }

    function start(uint256 id, address p, address q, bool ranked) private {
        PongInterludeRoomsChaos.Offer memory o = offer(id, p, q, ranked);
        bytes memory s = sig(o);
        vm.prank(p);
        g.acceptMatch(o, s);
        vm.prank(q);
        g.acceptMatch(o, s);
    }

    function phase(uint256 id) private view returns (uint256 p) {
        (,, p,,,,,,,,,,) = g.getSnapshot(id);
    }

    function state(uint256 id) private view returns (PhysicsV2.State memory s) {
        (,,,,,,,,,,,, s) = g.getSnapshot(id);
    }

    function testTwoAgreementsRequired() public {
        PongInterludeRoomsChaos.Offer memory o = offer(1, a, b, true);
        bytes memory s = sig(o);
        vm.prank(a);
        g.acceptMatch(o, s);
        assertEq(phase(1), 1);
        vm.roll(150);
        assertEq(state(1).t, 0);
        vm.prank(a);
        vm.expectRevert();
        g.acceptMatch(o, s);
        vm.prank(b);
        g.acceptMatch(o, s);
        assertEq(phase(1), 2);
    }

    function testTwoIndependentArenasAndCapacity() public {
        start(1, a, b, true);
        start(2, c, d, false);
        vm.prank(a);
        g.input(1, -1, 1, 200);
        vm.roll(120);
        g.tick(1);
        assertLt(state(1).left, state(2).left);
        PongInterludeRoomsChaos.Offer memory o = offer(3, address(5), address(6), false);
        bytes memory s = sig(o);
        vm.prank(address(5));
        vm.expectRevert(PongInterludeRoomsChaos.ArenaBusy.selector);
        g.acceptMatch(o, s);
    }

    function testCannotPlayTwiceOrMoveOtherArena() public {
        start(1, a, b, true);
        PongInterludeRoomsChaos.Offer memory o = offer(2, a, c, false);
        bytes memory s = sig(o);
        vm.prank(c);
        vm.expectRevert();
        g.acceptMatch(o, s);
        start(3, c, d, false);
        vm.prank(a);
        vm.expectRevert();
        g.input(3, 1, 1, 200);
    }

    function testTicketBindsAllRulesAndParticipants() public {
        PongInterludeRoomsChaos.Offer memory o = offer(1, a, b, true);
        bytes memory s = sig(o);
        o.ranked = false;
        vm.prank(a);
        vm.expectRevert();
        g.acceptMatch(o, s);
        o.ranked = true;
        o.b = c;
        vm.prank(a);
        vm.expectRevert();
        g.acceptMatch(o, s);
        o.b = b;
        o.room = bytes32(uint256(99));
        vm.prank(a);
        vm.expectRevert();
        g.acceptMatch(o, s);
    }

    function testWrongCoordinatorAndApplication() public {
        PongInterludeRoomsChaos.Offer memory o = offer(1, a, b, true);
        bytes memory s = sig(o);
        vm.chainId(10143);
        PongInterludeRoomsChaos other = new ChaosCandidateFixture(IInterludeHub(address(0x1234)), vm.addr(KEY));
        vm.chainId(4242);
        vm.prank(a);
        vm.expectRevert();
        other.acceptMatch(o, s);
    }

    function testExpiredTicketAndCancellationNoElo() public {
        PongInterludeRoomsChaos.Offer memory o = offer(1, a, b, true);
        bytes memory s = sig(o);
        vm.prank(a);
        g.acceptMatch(o, s);
        vm.warp(1021);
        vm.prank(b);
        vm.expectRevert();
        g.acceptMatch(o, s);
        g.cancelMatch(1);
        assertEq(g.ratingOf(a, 0).elo, 1000);
        assertEq(g.activeCount(), 0);
        assertEq(g.activeMatchOf(b), 0);
    }

    function testTicketCannotBeReplayedAfterEnd() public {
        PongInterludeRoomsChaos.Offer memory o = offer(1, a, b, true);
        bytes memory s = sig(o);
        vm.prank(a);
        g.acceptMatch(o, s);
        vm.prank(b);
        g.acceptMatch(o, s);
        vm.prank(a);
        g.concede(1);
        vm.prank(a);
        vm.expectRevert();
        g.acceptMatch(o, s);
    }

    function testRankedEloExactAndSingleSettlement() public {
        start(1, a, b, true);
        vm.prank(b);
        g.concede(1);
        assertEq(g.ratingOf(a, 0).elo, 1032);
        assertEq(g.ratingOf(b, 0).elo, 968);
        assertEq(g.ratingOf(a, 0).wins, 1);
        assertEq(g.ratingOf(b, 0).played, 1);
        (uint32 ba, uint32 bb, uint32 aa, uint32 ab) = g.ratingChange(1);
        assertEq(ba, 1000);
        assertEq(bb, 1000);
        assertEq(aa, 1032);
        assertEq(ab, 968);
        vm.expectRevert();
        g.tick(1);
        vm.prank(a);
        vm.expectRevert();
        g.concede(1);
        assertEq(g.ratingOf(a, 0).played, 1);
    }

    function testFriendlyDoesNotModifyRatings() public {
        start(1, a, b, false);
        vm.prank(a);
        g.concede(1);
        assertEq(g.ratingOf(a, 0).elo, 1000);
        assertEq(g.ratingOf(b, 0).played, 0);
        assertEq(g.activeCount(), 0);
    }

    function testRepeatOpponentHasDiminishingGain() public {
        start(1, a, b, true);
        vm.prank(b);
        g.concede(1);
        start(2, a, b, true);
        vm.prank(b);
        g.concede(2);
        assertLt(g.ratingOf(a, 0).elo - 1032, 16);
    }

    function testSeasonSoftReset() public {
        start(1, a, b, true);
        vm.prank(b);
        g.concede(1);
        vm.warp(1000 + 30 days);
        assertEq(g.ratingOf(a, 0).elo, 1016);
        assertEq(g.ratingOf(a, 0).played, 0);
        assertEq(g.ratingOf(a, 0).season, 2);
    }

    function testNaturalSevenEndsAndKeepsOtherMatch() public {
        start(1, a, b, true);
        start(2, c, d, false);
        vm.prank(a);
        g.input(1, -1, 1, 200);
        vm.prank(b);
        g.input(1, 1, 1, 200);
        vm.roll(60100);
        g.tick(1);
        assertEq(phase(1), 3);
        assertTrue(state(1).scoreA == 7 || state(1).scoreB == 7);
        assertEq(phase(2), 2);
        assertEq(g.activeCount(), 1);
        assertEq(g.ratingOf(a, 0).played, 1);
    }

    function testStrictInputNoncesAndRelease() public {
        start(1, a, b, false);
        vm.prank(a);
        g.input(1, 1, 1, 150);
        vm.roll(120);
        vm.prank(a);
        g.input(1, 0, 2, 150);
        assertEq(state(1).left, 324000000);
        vm.roll(140);
        g.tick(1);
        assertEq(state(1).left, 324000000);
        vm.prank(a);
        vm.expectRevert();
        g.input(1, -1, 2, 160);
        vm.prank(a);
        vm.expectRevert();
        g.input(1, 0, 4, 160);
        vm.prank(a);
        vm.expectRevert();
        g.input(1, 0, 3, 139);
    }

    function testSnapshotSurvivesReadHeadBeforeMatchStart() public {
        start(1, a, b, false);
        vm.roll(99);
        (bool ok, bytes memory data) = address(g).staticcall(abi.encodeCall(g.getSnapshot, (1)));
        assertTrue(ok, "a stale read must not return a Panic payload instead of a snapshot");
        assertGt(data.length, 36);
        (,,,,,,, uint256 head, uint256 clock,,,, PhysicsV2.State memory s) = g.getSnapshot(1);
        assertEq(head, 99);
        assertEq(clock, 0);
        assertEq(s.t, 0);
    }

    function testReadClockNeverPrecedesProcessedState() public {
        chaos(1, a, b, false);
        vm.roll(120);
        g.tick(1);
        vm.roll(110);
        (,,,,,,,, uint256 clock,,,, PhysicsV2.State memory s) = g.getSnapshot(1);
        assertEq(clock, s.t);
        assertEq(s.t, 200000);
        // A reset execution clock resumes from processed state. It does not replay
        // the rally, reset the nonce or wait for the old process height to catch up.
        vm.prank(a);
        g.input(1, 1, 1, 150);
        assertEq(state(1).t, 200000);
        assertEq(state(1).left, 288000000);
        vm.roll(121);
        vm.prank(a);
        g.input(1, 0, 2, 150);
        (,,,,,,,,, uint256 nonceA,,,) = g.getSnapshot(1);
        assertEq(nonceA, 2);
        assertEq(state(1).t, 310000);
        assertEq(state(1).left, 307800000);
    }

    function testRepeatedEngineRestartsKeepClockRevisionAndScores() public {
        start(1, a, b, false);
        start(2, c, d, false);
        vm.roll(150);
        g.tick(1);
        PhysicsV2.State memory before_ = state(1);
        vm.roll(15);
        vm.prank(a);
        g.input(1, 0, 1, 100);
        assertEq(state(1).t, before_.t);
        assertEq(state(1).x, before_.x);
        assertEq(state(1).scoreA, before_.scoreA);
        ( ,uint256 revision,,,,,,,,,,,) = g.getSnapshot(1);
        assertEq(revision, 4);
        vm.roll(25);
        g.tick(1);
        assertEq(state(1).t, 600000);
        vm.roll(1);
        g.tick(1);
        assertEq(state(1).t, 600000);
        vm.roll(11);
        g.tick(1);
        assertEq(state(1).t, 700000);
        assertEq(state(2).t, 0, "other arena is not advanced by clock recovery");
        vm.prank(a);
        vm.expectRevert(PongInterludeRoomsChaos.StaleInput.selector);
        g.input(1, 0, 1, 100);
        vm.prank(a);
        g.concede(1);
        assertEq(phase(1), 3);
        assertEq(g.activeCount(), 1);
    }

    function testRestartDuringChaosPauseStillRequiresFreshPressure() public {
        chaos(1, a, b, false);
        PhysicsV2.State memory paused = pause(1);
        vm.roll(1);
        g.tick(1);
        assertEq(state(1).t, paused.t);
        assertEq(state(1).resumeAt, paused.resumeAt);
        vm.roll(302);
        g.tick(1);
        assertTrue(state(1).awaitingServe);
        checkpoint(1, paused, 2e15, 0);
        g.tick(1);
        assertFalse(state(1).awaitingServe);
        assertEq(state(1).t, uint256(paused.t) + 3010000);
        assertEq(state(1).halfA, 36e6);
    }

    function testBothTerminalStatesFitCommitBudget() public {
        vm.record();
        start(1, a, b, true);
        start(2, c, d, true);
        vm.prank(a);
        g.concede(1);
        vm.prank(c);
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
    }

    function testTimeoutNoRatingAndEngineOnly() public {
        start(1, a, b, true);
        vm.roll(200000);
        g.tick(1);
        assertEq(phase(1), 4);
        assertEq(g.ratingOf(a, 0).played, 0);
        vm.chainId(10143);
        PongInterludeRoomsChaos.Offer memory o = offer(2, a, b, false);
        bytes memory s = sig(o);
        vm.prank(a);
        vm.expectRevert();
        g.acceptMatch(o, s);
    }

    function chaos(uint256 id, address p, address q, bool ranked) private {
        PongInterludeRoomsChaos.Offer memory o = offer(id, p, q, ranked);
        o.mode = 1;
        bytes memory signature = sig(o);
        vm.prank(p);
        g.acceptMatch(o, signature);
        vm.prank(q);
        g.acceptMatch(o, signature);
    }

    function pause(uint256 id) private returns (PhysicsV2.State memory s) {
        vm.roll(block.number + 3000);
        g.tick(id);
        s = state(id);
        assertTrue(s.awaitingServe);
    }

    function checkpoint(uint256 id, PhysicsV2.State memory s, uint256 pa, uint256 pb) private {
        g.fixture(id, s.scoreA + s.scoreB, s.resumeAt, pa, pb, keccak256(abi.encode(id, s.resumeAt)));
    }

    function testModeIsSignedAndCannotChangeAfterFirstConsent() public {
        PongInterludeRoomsChaos.Offer memory o = offer(1, a, b, true);
        bytes memory signature = sig(o);
        o.mode = 1;
        vm.prank(a);
        vm.expectRevert();
        g.acceptMatch(o, signature);
        o.mode = 0;
        vm.prank(a);
        g.acceptMatch(o, signature);
        o.mode = 1;
        signature = sig(o);
        vm.prank(b);
        vm.expectRevert();
        g.acceptMatch(o, signature);
        o = offer(2, c, d, true);
        o.mode = 2;
        signature = sig(o);
        vm.prank(c);
        vm.expectRevert();
        g.acceptMatch(o, signature);
    }

    function testIndependentChaosRatingAndOpponentHistory() public {
        start(1, a, b, true);
        vm.prank(b);
        g.concede(1);
        assertEq(g.ratingOf(a, 0).elo, 1032);
        assertEq(g.ratingOf(a, 1).elo, 1000);
        chaos(2, a, b, true);
        vm.prank(b);
        g.concede(2);
        assertEq(g.ratingOf(a, 1).elo, 1032);
        assertEq(g.ratingOf(b, 1).elo, 968);
        assertEq(g.ratingOf(a, 0).played, 1);
        assertEq(g.ratingOf(a, 1).played, 1);
        chaos(3, a, b, false);
        vm.prank(a);
        g.concede(3);
        assertEq(g.ratingOf(a, 1).played, 1);
    }

    function testMissingCheckpointWaitsWithoutBlockingClassicOrCommands() public {
        chaos(1, a, b, false);
        start(2, c, d, false);
        PhysicsV2.State memory s = pause(1);
        uint64 stopped = s.t;
        vm.roll(block.number + 100);
        g.tick(1);
        assertEq(state(1).t, stopped);
        assertTrue(state(1).awaitingServe);
        vm.prank(a);
        g.input(1, -1, 1, block.number + 100);
        vm.prank(a);
        g.input(1, 0, 2, block.number + 100);
        assertEq(state(1).leftDir, 0);
        g.tick(2);
        assertGt(state(2).t, 0);
        assertEq(state(2).mode, 0);
        // A checkpoint for a different match/rally/pause cannot satisfy this query.
        g.fixture(2, s.scoreA + s.scoreB, s.resumeAt, 2e15, 0, bytes32(uint256(1)));
        g.fixture(1, s.scoreA + s.scoreB + 1, s.resumeAt, 2e15, 0, bytes32(uint256(1)));
        g.tick(1);
        assertTrue(state(1).awaitingServe);
        checkpoint(1, s, 2e15, 0);
        g.tick(1);
        assertFalse(state(1).awaitingServe);
        assertEq(state(1).halfA, 36e6);
        assertEq(state(1).halfB, 48e6);
        assertEq(state(1).t, (block.number - 100) * 10000);
    }

    function testSizesFrozenWithinRallyAndCumulativePressureCannotDecrease() public {
        chaos(1, a, b, false);
        PhysicsV2.State memory s = pause(1);
        checkpoint(1, s, 4e15, 0);
        g.tick(1);
        assertEq(state(1).halfA, 36e6);
        checkpoint(1, s, 4e15, 8e15);
        vm.roll(block.number + 10);
        g.tick(1);
        assertEq(state(1).halfA, 36e6);
        s = pause(1);
        checkpoint(1, s, 3e15, 8e15);
        vm.expectRevert(PongInterludeRoomsChaos.InvalidPressure.selector);
        g.tick(1);
        assertTrue(state(1).awaitingServe);
        checkpoint(1, s, 4e15, 8e15);
        g.tick(1);
        assertEq(state(1).halfA, 48e6);
        assertLt(state(1).halfB, 48e6);
    }

    function testPressureCannotOverflowAndNeedsCheckpointIdentity() public {
        chaos(1, a, b, false);
        PhysicsV2.State memory s = pause(1);
        checkpoint(1, s, type(uint256).max, 0);
        vm.expectRevert(PongInterludeRoomsChaos.InvalidPressure.selector);
        g.tick(1);
        g.fixture(1, s.scoreA + s.scoreB, s.resumeAt, 0, 0, bytes32(0));
        vm.expectRevert(PongInterludeRoomsChaos.InvalidPressure.selector);
        g.tick(1);
        checkpoint(1, s, 0, 0);
        g.tick(1);
        assertEq(state(1).halfA, 48e6);
    }

    function testChaosSevenFinishesOnceWithoutRequiringAnotherCheckpoint() public {
        chaos(1, a, b, true);
        uint256 height = block.number;
        for (uint256 i; i < 14 && phase(1) == 2; i++) {
            height += 3000;
            vm.roll(height);
            g.tick(1);
            PhysicsV2.State memory s = state(1);
            if (s.awaitingServe && !s.finished) {
                checkpoint(1, s, 2e15, 0);
                g.tick(1);
            }
        }
        assertEq(phase(1), 3);
        assertTrue(state(1).finished);
        assertFalse(state(1).awaitingServe);
        assertTrue(state(1).scoreA == 7 || state(1).scoreB == 7);
        assertEq(g.ratingOf(a, 1).played, 1);
        vm.expectRevert();
        g.tick(1);
        assertEq(g.ratingOf(a, 1).played, 1);
    }

    function testMissingPressureStillAllowsConcessionAndTimeout() public {
        chaos(1, a, b, true);
        pause(1);
        vm.prank(a);
        g.concede(1);
        assertEq(phase(1), 3);
        chaos(2, a, b, true);
        pause(2);
        vm.roll(block.number + 180001);
        g.tick(2);
        assertEq(phase(2), 4);
        assertEq(g.ratingOf(a, 1).played, 1);
    }

    function testInvalidPressureCannotBlockReleaseOrConcession() public {
        chaos(1, a, b, true);
        PhysicsV2.State memory s = pause(1);
        checkpoint(1, s, type(uint256).max, 0);
        vm.expectRevert(PongInterludeRoomsChaos.InvalidPressure.selector);
        g.tick(1);
        vm.prank(a);
        g.input(1, 0, 1, block.number + 100);
        vm.prank(a);
        g.concede(1);
        assertEq(phase(1), 3);
        assertEq(g.ratingOf(b, 1).elo, 1032);
    }

    function testResultCommitmentNamesDeploymentModeAndRules() public {
        chaos(1, a, b, true);
        vm.prank(b);
        g.concede(1);
        PhysicsV2.State memory s = state(1);
        uint256 ratings = uint256(1000) | (uint256(1000) << 32) | (uint256(1032) << 64) | (uint256(968) << 96);
        assertEq(
            g.resultHashes(1),
            keccak256(
                abi.encode(
                    address(g),
                    uint256(4),
                    uint256(1),
                    a,
                    b,
                    a,
                    uint256(3),
                    uint8(1),
                    true,
                    s.scoreA,
                    s.scoreB,
                    s.t,
                    ratings
                )
            )
        );
    }

    function testTwoChaosResultsWithPressureFitGamePublicationBudget() public {
        // Seed the test transport before recording. The measured writes below are
        // only game state; a real transport and market need their own budget.
        g.fixture(1, 1, 5697918, 2e15, 0, bytes32(uint256(1)));
        g.fixture(2, 1, 5697918, 0, 2e15, bytes32(uint256(2)));
        vm.record();
        chaos(1, a, b, true);
        chaos(2, c, d, true);
        vm.roll(3100);
        g.tick(1);
        g.tick(2);
        assertEq(state(1).resumeAt, 5697918);
        assertEq(state(2).resumeAt, 5697918);
        g.tick(1);
        g.tick(2);
        assertFalse(state(1).awaitingServe);
        assertFalse(state(2).awaitingServe);
        vm.prank(a);
        g.concede(1);
        vm.prank(c);
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
        emit log_named_uint("Game storage diffs for two Chaos matches", unique);
    }
}
