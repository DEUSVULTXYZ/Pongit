// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {AuthorityActions} from "../src/autonomous/AuthorityActions.sol";
import {AutonomousArena, IPreviousRating} from "../src/autonomous/AutonomousArena.sol";
import {AutonomousGameBase} from "../src/autonomous/AutonomousGameBase.sol";
import {ContractLobby as Lobby} from "../src/autonomous/ContractLobby.sol";
import {BaseAuthorization as Auth} from "../src/autonomous/BaseAuthorization.sol";
import {IChaosProof, UnsupportedChaosProof, IMonadPressure} from "../src/autonomous/ChaosProof.sol";
import {AutonomousFinance, IPaidMarket} from "../src/autonomous/AutonomousFinance.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {IDelegatableApp} from "../vendor/interlude/interfaces/IDelegatableApp.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {MarketV4} from "../src/v4/MarketV4.sol";
import {LMSRV2} from "../src/v2/MarketV2.sol";
import {RoomsVault} from "../src/labs/RoomsVault.sol";

// Deliberately test-only. No deploy script accepts this permissive proof fixture.
contract QualifiedProofFixture is IChaosProof {
    function supported() external pure returns (bool) {
        return true;
    }

    function verify(Boundary calldata, bytes calldata) external pure returns (Checkpoint memory) {
        revert("fixture has no oracle");
    }
}

contract AuthorityHubFixture {
    Types.Session private session;
    mapping(address => uint256) public sessionEpochOf;
    uint256 public unlockAt;
    address public app;

    function statusOf(address, bytes32) external view returns (Types.Status) {
        return session.status;
    }

    function sessionOf(address, bytes32) external view returns (Types.Session memory) {
        return session;
    }

    function bump(address player) external {
        sessionEpochOf[player]++;
    }

    function openDelegation(bytes32, bytes32[] calldata, bytes32[] calldata, address, address, uint256)
        external
        payable
    {
        app = msg.sender;
        session.status = Types.Status.Active;
        session.epoch++;
        session.lastCommitAt = uint64(block.timestamp);
        session.maxBatchInterval = 60;
        session.expiresAt = uint64(block.timestamp + 86400);
        IDelegatableApp(app).onDelegationChanged(Types.GLOBAL, true);
    }

    function forceClose(address, bytes32) external {
        require(session.status == Types.Status.Active);
        session.status = Types.Status.Exiting;
        unlockAt = block.timestamp + 120;
    }

    function releaseStake(address, bytes32) external {
        require(session.status == Types.Status.Exiting && block.timestamp >= unlockAt, "challenge window");
        session.status = Types.Status.None;
        IDelegatableApp(app).onDelegationChanged(Types.GLOBAL, false);
    }

    function challenge() external {
        session.status = Types.Status.Challenged;
    }

    function resolve() external {
        session.status = Types.Status.Exiting;
        unlockAt = block.timestamp + 120;
    }
}

contract PaidFixture is IPaidMarket {
    address public immutable results;
    uint256 public a;
    uint256 public b;

    constructor(address f) {
        results = f;
    }

    function paid(uint256 x, uint256 y) external {
        a = x;
        b = y;
    }

    function pressure(uint256) external view returns (uint256, uint256) {
        return (a, b);
    }
}

contract AuthorityArenaTest is Test {
    AutonomousArena g;
    AuthorityActions ops;
    AuthorityHubFixture h;
    AutonomousFinance finance;
    PaidFixture market;
    uint256 constant ALICE = 0xA11CE;
    uint256 constant BOB = 0xB0B;
    uint256 constant KEY = 0xA4CADE;
    receive() external payable {}

    function setUp() public {
        vm.chainId(10143);
        vm.warp(10000);
        vm.roll(100);
        h = new AuthorityHubFixture();
        g = new AutonomousArena(
            IInterludeHub(address(h)),
            address(this),
            new QualifiedProofFixture(),
            IPreviousRating(address(0)),
            new AuthorityActions()
        );
        ops = AuthorityActions(address(g));
        finance = new AutonomousFinance(g, address(this));
        market = new PaidFixture(address(finance));
        finance.bindMarket(market);
        g.bindFinance(address(market), finance);
    }

    function sig(uint256 key, bytes32 digest) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function grant(uint256 key) private view returns (Auth.Grant memory) {
        return Auth.Grant(
            vm.addr(key), vm.addr(KEY), g.generation(), h.sessionEpochOf(vm.addr(key)), uint64(block.timestamp + 3600)
        );
    }

    function baseCall(uint256 key, bytes memory data) external returns (bytes memory) {
        Auth.Grant memory a = grant(key);
        uint256 nonce = ops.commandNonce(a);
        uint64 deadline = uint64(block.timestamp + 30);
        return g.relayCommand(
            a,
            sig(key, ops.baseGrantDigest(a)),
            data,
            nonce,
            deadline,
            sig(KEY, ops.baseCommandDigest(a, data, nonce, deadline))
        );
    }

    function callAs(uint256 key, bytes memory data) private returns (bytes memory) {
        if (block.chainid == 10143) return this.baseCall(key, data);
        uint256 gen = g.generation();
        vm.prank(vm.addr(key));
        return g.command(gen, data);
    }

    function start(uint256 a, uint256 b, uint8 mode, bool ranked) private returns (uint256 room, uint256 matchId) {
        if (ranked) {
            callAs(a, abi.encodeCall(ops.queue, (mode)));
            callAs(b, abi.encodeCall(ops.queue, (mode)));
            room = ops.matchmake(mode, 32);
        } else {
            room = abi.decode(callAs(a, abi.encodeCall(ops.createRoom, (mode))), (uint256));
            callAs(b, abi.encodeCall(ops.joinRoom, (room)));
            ops.propose(room);
        }
        matchId = ops.getRoom(room).proposal;
        callAs(a, abi.encodeCall(ops.acceptProposal, (matchId)));
        callAs(b, abi.encodeCall(ops.acceptProposal, (matchId)));
    }

    function testScopedSponsorshipRejectsReplayFundsAndWrongSignature() public {
        Auth.Grant memory a = grant(ALICE);
        bytes memory data = abi.encodeCall(ops.queue, (0));
        uint64 deadline = uint64(block.timestamp + 20);
        bytes memory ownerSig = sig(ALICE, ops.baseGrantDigest(a));
        bytes memory commandSig = sig(KEY, ops.baseCommandDigest(a, data, 0, deadline));
        g.relayCommand(a, ownerSig, data, 0, deadline, commandSig);
        vm.expectRevert();
        g.relayCommand(a, ownerSig, data, 0, deadline, commandSig);
        data = abi.encodeCall(g.bindFinance, (address(market), IMonadPressure(address(finance))));
        commandSig = sig(KEY, ops.baseCommandDigest(a, data, 1, deadline));
        vm.expectRevert("game scope");
        g.relayCommand(a, ownerSig, data, 1, deadline, commandSig);
        assertEq(ops.commandNonce(a), 1);
        data = abi.encodeCall(ops.cancelQueue, ());
        bytes memory wrong = sig(999, ops.baseCommandDigest(a, data, 1, deadline));
        vm.expectRevert();
        g.relayCommand(a, ownerSig, data, 1, deadline, wrong);
    }

    function testRevokedExpiredAndCrossGenerationGrantsRejected() public {
        Auth.Grant memory a = grant(ALICE);
        bytes memory data = abi.encodeCall(ops.queue, (0));
        uint64 deadline = uint64(block.timestamp + 20);
        bytes memory ownerSig = sig(ALICE, ops.baseGrantDigest(a));
        bytes memory commandSig = sig(KEY, ops.baseCommandDigest(a, data, 0, deadline));
        h.bump(a.player);
        vm.expectRevert();
        g.relayCommand(a, ownerSig, data, 0, deadline, commandSig);
        a = grant(ALICE);
        a.generation++;
        ownerSig = sig(ALICE, ops.baseGrantDigest(a));
        commandSig = sig(KEY, ops.baseCommandDigest(a, data, 0, deadline));
        vm.expectRevert();
        g.relayCommand(a, ownerSig, data, 0, deadline, commandSig);
        a = grant(ALICE);
        ownerSig = sig(ALICE, ops.baseGrantDigest(a));
        commandSig = sig(KEY, ops.baseCommandDigest(a, data, 0, deadline));
        vm.warp(block.timestamp + 21);
        vm.expectRevert();
        g.relayCommand(a, ownerSig, data, 0, deadline, commandSig);
    }

    function testTwoConsentsCrossModeLockAndDuplicateAcceptance() public {
        this.baseCall(ALICE, abi.encodeCall(ops.queue, (0)));
        vm.expectRevert();
        this.baseCall(ALICE, abi.encodeCall(ops.queue, (1)));
        this.baseCall(BOB, abi.encodeCall(ops.queue, (0)));
        uint256 r = ops.matchmake(0, 32);
        uint256 id = ops.getRoom(r).proposal;
        this.baseCall(ALICE, abi.encodeCall(ops.acceptProposal, (id)));
        assertEq(g.activeCount(), 0);
        this.baseCall(ALICE, abi.encodeCall(ops.acceptProposal, (id)));
        this.baseCall(BOB, abi.encodeCall(ops.acceptProposal, (id)));
        assertEq(g.activeCount(), 1);
        this.baseCall(BOB, abi.encodeCall(ops.acceptProposal, (id)));
        assertEq(g.activeCount(), 1);
        vm.expectRevert();
        this.baseCall(ALICE, abi.encodeCall(ops.leaveRoom, ()));
    }

    function testFifoExpiredQueueAndThirdArenaWaits() public {
        this.baseCall(99, abi.encodeCall(ops.queue, (0)));
        vm.warp(block.timestamp + 31);
        (uint256 r1, uint256 id) = start(ALICE, BOB, 0, true);
        start(3, 4, 1, true);
        this.baseCall(5, abi.encodeCall(ops.queue, (0)));
        this.baseCall(6, abi.encodeCall(ops.queue, (0)));
        assertEq(ops.matchmake(0, 32), 0);
        assertEq(ops.participation(vm.addr(99)), 0);
        this.baseCall(ALICE, abi.encodeCall(g.concede, (id)));
        assertGt(ops.matchmake(0, 32), r1);
        assertEq(g.activeCount(), 1);
    }

    function testEightMembersHostTransferWinnerStaysAndAway() public {
        (uint256 room, uint256 id) = start(ALICE, BOB, 0, false);
        for (uint256 i = 3; i <= 8; i++) {
            this.baseCall(i, abi.encodeCall(ops.joinRoom, (room)));
        }
        vm.expectRevert();
        this.baseCall(9, abi.encodeCall(ops.joinRoom, (room)));
        this.baseCall(ALICE, abi.encodeCall(g.concede, (id)));
        uint256 next = ops.propose(room);
        Lobby.Proposal memory p = ops.getProposal(next);
        assertEq(p.a, vm.addr(BOB));
        assertEq(p.b, vm.addr(3));
        this.baseCall(BOB, abi.encodeCall(ops.declineProposal, (next)));
        this.baseCall(BOB, abi.encodeCall(ops.rejoinQueue, (room)));
        this.baseCall(ALICE, abi.encodeCall(ops.leaveRoom, ()));
        assertEq(ops.getRoom(room).host, vm.addr(BOB));
    }

    function testRankedRoomCannotBypassMatchmakingWithAnInvitation() public {
        (uint256 room,) = start(ALICE, BOB, 0, true);
        vm.expectRevert("ranked room admission");
        this.baseCall(ALICE, abi.encodeCall(ops.inviteToRoom, (room, vm.addr(3))));
        vm.expectRevert();
        this.baseCall(3, abi.encodeCall(ops.joinRoom, (room)));
        assertEq(ops.getRoom(room).members.length, 2);
        assertEq(ops.participation(vm.addr(3)), 0);
    }

    function testReturnLogsOnlyPendingThenConfirmedStates() public {
        vm.recordLogs();
        g.returnToInterlude();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = keccak256("ExecutionChanged(uint8,uint8,uint256,bytes32,uint64)");
        uint256 transitions;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter != address(g) || logs[i].topics[0] != topic) continue;
            (uint8 before_, uint8 after_,,,) = abi.decode(logs[i].data, (uint8, uint8, uint256, bytes32, uint64));
            assertEq(before_, 2);
            assertEq(after_, 3);
            transitions++;
        }
        assertEq(transitions, 1);
        assertEq(uint8(g.executionState()), 3);
        g.confirmInterlude(1);
        assertEq(uint8(g.executionState()), 0);
    }

    function testProposalExpiryAndTargetedInvitationSingleAcceptance() public {
        uint256 invite =
            abi.decode(this.baseCall(ALICE, abi.encodeCall(ops.inviteSomeone, (vm.addr(BOB), uint8(1)))), (uint256));
        uint256 same =
            abi.decode(this.baseCall(ALICE, abi.encodeCall(ops.inviteSomeone, (vm.addr(BOB), uint8(1)))), (uint256));
        assertEq(invite, same);
        vm.expectRevert();
        this.baseCall(3, abi.encodeCall(ops.answerInvitation, (invite, true)));
        this.baseCall(BOB, abi.encodeCall(ops.answerInvitation, (invite, true)));
        uint256 r = ops.getInvitation(invite).room;
        uint256 id = ops.getRoom(r).proposal;
        assertEq(ops.getProposal(id).accepted, 2);
        vm.warp(block.timestamp + 21);
        ops.expireProposal(id);
        assertEq(ops.getProposal(id).status, 4);
        assertEq(g.activeCount(), 0);
    }

    function testEloExactFriendlyUnchangedAndPagination() public {
        (, uint256 id) = start(ALICE, BOB, 0, true);
        this.baseCall(ALICE, abi.encodeCall(g.concede, (id)));
        assertEq(g.ratingOf(vm.addr(ALICE), 0).elo, 968);
        assertEq(g.ratingOf(vm.addr(BOB), 0).elo, 1032);
        assertEq(g.ratingOf(vm.addr(ALICE), 1).elo, 1000);
        (address[] memory players, uint256 total) = ops.rankedPlayers(0, 0, 1);
        assertEq(total, 2);
        assertEq(players.length, 1);
        (players, total) = ops.rankedPlayers(0, 1, 100);
        assertEq(players.length, 1);
        vm.expectRevert();
        ops.rankedPlayers(0, 0, 101);
        (, uint256 friendly) = start(3, 4, 1, false);
        this.baseCall(3, abi.encodeCall(g.concede, (friendly)));
        assertEq(g.ratingOf(vm.addr(3), 1).played, 0);
        vm.expectRevert();
        this.baseCall(ALICE, abi.encodeCall(g.concede, (id)));
        assertEq(g.ratingOf(vm.addr(ALICE), 0).played, 1);
    }

    function testRematchesCrossedProduceOnlyOneMatch() public {
        (, uint256 id) = start(ALICE, BOB, 0, false);
        this.baseCall(ALICE, abi.encodeCall(g.concede, (id)));
        uint256 p = abi.decode(this.baseCall(ALICE, abi.encodeCall(ops.rematch, (id))), (uint256));
        assertEq(g.activeCount(), 0);
        uint256 q = abi.decode(this.baseCall(BOB, abi.encodeCall(ops.rematch, (id))), (uint256));
        assertEq(p, q);
        assertEq(g.activeCount(), 1);
    }

    function testProtocolGatedRecoveryCancelsUnfinishedAndChangesGeneration() public {
        g.returnToInterlude();
        g.confirmInterlude(1);
        vm.expectRevert();
        g.beginRecovery();
        vm.chainId(4242);
        (, uint256 id) = start(ALICE, BOB, 0, true);
        uint256 old = g.generation();
        vm.chainId(10143);
        vm.expectRevert();
        this.baseCall(3, abi.encodeCall(ops.queue, (0)));
        vm.warp(block.timestamp + 61);
        g.beginRecovery();
        vm.expectRevert();
        g.finishRecovery();
        h.challenge();
        vm.warp(vm.getBlockTimestamp() + 121);
        vm.expectRevert();
        g.finishRecovery();
        h.resolve();
        vm.warp(vm.getBlockTimestamp() + 121);
        g.finishRecovery();
        assertEq(uint256(g.executionState()), 2);
        assertEq(g.generation(), old + 1);
        assertEq(g.activeCount(), 0);
        assertEq(g.ratingOf(vm.addr(ALICE), 0).played, 0);
        finance.finalizeResult(id);
        (,,, uint8 status) = finance.result(id);
        assertEq(status, 4);
        finance.finalizeResult(id);
        g.returnToInterlude();
        g.confirmInterlude(2);
        assertEq(uint256(g.executionState()), 0);
    }

    function testUnsupportedProofBlocksInterludeAndNoPrivilegedReplacement() public {
        AutonomousArena unsupported = new AutonomousArena(
            IInterludeHub(address(h)),
            address(this),
            new UnsupportedChaosProof(),
            IPreviousRating(address(0)),
            new AuthorityActions()
        );
        unsupported.bindFinance(address(market), finance);
        vm.expectRevert("Chaos proof not qualified");
        unsupported.returnToInterlude();
        IChaosProof.Boundary memory b;
        IChaosProof verifier = unsupported.proofs();
        vm.expectRevert();
        verifier.verify(b, hex"00");
    }

    function countDifferences(uint256 snapshot, bytes32[] memory slots) private returns (uint256 count) {
        bytes32[] memory afterValues = new bytes32[](slots.length);
        for (uint256 i; i < slots.length; i++) {
            afterValues[i] = vm.load(address(g), slots[i]);
        }
        vm.revertToStateAndDelete(snapshot);
        for (uint256 i; i < slots.length; i++) {
            bool duplicate;
            for (uint256 j; j < i; j++) {
                if (slots[j] == slots[i]) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate && vm.load(address(g), slots[i]) != afterValues[i]) count++;
        }
    }

    function testStorageBudgetTwoAdmissionsAndResults() public {
        g.returnToInterlude();
        g.confirmInterlude(1);
        vm.chainId(4242);
        uint256 before = vm.snapshotState();
        vm.record();
        start(ALICE, BOB, 0, true);
        start(3, 4, 1, true);
        (, bytes32[] memory admission) = vm.accesses(address(g));
        emit log_named_uint("two admissions net storage diffs", countDifferences(before, admission));
        (, uint256 first) = start(ALICE, BOB, 0, true);
        (, uint256 second) = start(3, 4, 1, true);
        before = vm.snapshotState();
        vm.record();
        callAs(ALICE, abi.encodeCall(g.concede, (first)));
        callAs(3, abi.encodeCall(g.concede, (second)));
        (, bytes32[] memory finish) = vm.accesses(address(g));
        assertEq(g.activeCount(), 0);
        emit log_named_uint("two results net storage diffs", countDifferences(before, finish));
    }

    function testFuzzOrderedInputs(uint8 steps) public {
        steps = uint8(bound(steps, 1, 12));
        (, uint256 id) = start(ALICE, BOB, 0, false);
        for (uint256 i = 1; i <= steps; i++) {
            this.baseCall(
                ALICE, abi.encodeCall(g.input, (id, int8(i % 2 == 0 ? int8(1) : int8(-1)), i, block.number + 20))
            );
        }
        vm.expectRevert();
        this.baseCall(ALICE, abi.encodeCall(g.input, (id, int8(0), uint256(steps), block.number + 20)));
    }

    function testSdkGrantScopedCommandAndInternalBridgeBlocked() public {
        g.returnToInterlude();
        g.confirmInterlude(1);
        vm.chainId(4242);
        Types.SessionGrant memory session =
            Types.SessionGrant(vm.addr(ALICE), vm.addr(KEY), uint64(block.timestamp + 3600), 0, false, new bytes4[](1));
        session.selectors[0] = g.command.selector;
        bytes memory signature = sig(ALICE, g.sessionDigest(session));
        bytes memory data = abi.encodeCall(g.command, (g.generation(), abi.encodeCall(ops.queue, (0))));
        vm.prank(vm.addr(KEY));
        g.withSession(session, signature, data);
        assertEq(ops.participation(vm.addr(ALICE)), type(uint256).max);
        session.anyFunction = true;
        signature = sig(ALICE, g.sessionDigest(session));
        data = abi.encodeCall(g.cancelRecovered, (uint256(1)));
        vm.prank(vm.addr(KEY));
        vm.expectRevert();
        g.withSession(session, signature, data);
        h.bump(vm.addr(ALICE));
        data = abi.encodeCall(g.command, (g.generation(), abi.encodeCall(ops.cancelQueue, ())));
        vm.prank(vm.addr(KEY));
        vm.expectRevert();
        g.withSession(session, signature, data);
    }

    function testTwentyMatchmakingCyclesAcrossBothModes() public {
        for (uint256 i; i < 20; i++) {
            (, uint256 id) = start(ALICE, BOB, uint8(i % 2), true);
            this.baseCall((i / 2) % 2 == 0 ? ALICE : BOB, abi.encodeCall(g.concede, (id)));
            this.baseCall(ALICE, abi.encodeCall(ops.leaveRoom, ()));
            this.baseCall(BOB, abi.encodeCall(ops.leaveRoom, ()));
            assertEq(g.activeCount(), 0);
            assertEq(ops.participation(vm.addr(ALICE)), 0);
        }
        assertEq(g.ratingOf(vm.addr(ALICE), 0).played, 10);
        assertEq(g.ratingOf(vm.addr(ALICE), 1).played, 10);
    }

    function testMonadChaosCheckpointBoundToPauseAndImmutable() public {
        (, uint256 id) = start(ALICE, BOB, 1, false);
        PhysicsV2.State memory state = g.stateOf(id);
        for (uint256 i; i < 30 && !state.awaitingServe; i++) {
            vm.roll(vm.getBlockNumber() + 1);
            g.tick(id);
            state = g.stateOf(id);
        }
        assertTrue(state.awaitingServe);
        uint8 rally = state.scoreA + state.scoreB;
        finance.openRound(id);
        (bool betting,) = finance.bettingWindow(id, 0);
        assertTrue(betting);
        vm.expectRevert();
        finance.freezeCheckpoint(id, rally);
        market.paid(0.004 ether, 0.001 ether);
        uint256 at = vm.getBlockNumber() + 42;
        vm.roll(at);
        vm.setBlockhash(vm.getBlockNumber() - 1, keccak256("canonical fixture block"));
        (betting,) = finance.bettingWindow(id, 0);
        assertFalse(betting);
        finance.freezeCheckpoint(id, rally);
        (bool ready, IChaosProof.Checkpoint memory c) = finance.checkpoint(id, rally, state.resumeAt);
        assertTrue(ready);
        assertEq(c.paidA, 0.004 ether);
        market.paid(1 ether, 2 ether);
        finance.freezeCheckpoint(id, rally);
        (, c) = finance.checkpoint(id, rally, state.resumeAt);
        assertEq(c.paidA, 0.004 ether);
        (ready,) = finance.checkpoint(id, rally, state.resumeAt + 1);
        assertFalse(ready);
        g.tick(id);
        assertFalse(g.stateOf(id).awaitingServe);
        assertLt(g.stateOf(id).halfA, g.stateOf(id).halfB);
        this.baseCall(ALICE, abi.encodeCall(g.concede, (id)));
        finance.finalizeResult(id);
        (,, address winner, uint8 status) = finance.result(id);
        assertEq(status, 3);
        assertEq(winner, vm.addr(BOB));
    }

    function _realFinance() private returns (MarketV4 realMarket, RoomsVault vault, uint256 id) {
        g = new AutonomousArena(
            IInterludeHub(address(h)),
            address(this),
            new UnsupportedChaosProof(),
            IPreviousRating(address(0)),
            new AuthorityActions()
        );
        ops = AuthorityActions(address(g));
        finance = new AutonomousFinance(g, address(this));
        vault = new RoomsVault(address(this));
        realMarket = new MarketV4(address(this), payable(address(this)), finance, new LMSRV2(), vault);
        finance.bindMarket(IPaidMarket(address(realMarket)));
        g.bindFinance(address(realMarket), finance);
        vault.registerModule(address(realMarket));
        vault.seal();
        (, id) = start(ALICE, BOB, 1, false);
        for (uint256 i; i < 30 && !g.stateOf(id).awaitingServe; i++) {
            vm.roll(vm.getBlockNumber() + 1);
            g.tick(id);
        }
        assertTrue(g.stateOf(id).awaitingServe);
        vm.deal(address(this), 10 ether);
        realMarket.open{value: 1 ether}(id, 1 ether);
        finance.openRound(id);
    }

    function _realBuy(MarketV4 realMarket, RoomsVault vault, uint256 id, uint256 key, uint8 side, uint256 shares)
        private
        returns (uint256 cost)
    {
        address who = vm.addr(key);
        vault.depositFor{value: 1 ether}(who);
        cost = realMarket.quote(id, side, shares);
        (, uint256 version) = finance.bettingWindow(id, 0);
        MarketV4.Bet memory b =
            MarketV4.Bet(who, id, side, shares, cost, version, realMarket.nonces(who), uint64(block.timestamp + 60));
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PONG Market"),
                keccak256("1"),
                uint256(10143),
                address(realMarket)
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", domain, keccak256(abi.encode(realMarket.BET_TYPEHASH(), b))));
        realMarket.buy(b, sig(key, digest));
    }

    function testRealMarketCheckpointAndPermissionlessWalletPayout() public {
        (MarketV4 realMarket, RoomsVault vault, uint256 id) = _realFinance();
        uint256 paidA = _realBuy(realMarket, vault, id, 33, 0, 0.2 ether);
        uint256 paidB = _realBuy(realMarket, vault, id, 44, 1, 0.1 ether);
        PhysicsV2.State memory state = g.stateOf(id);
        vm.roll(vm.getBlockNumber() + 42);
        vm.setBlockhash(vm.getBlockNumber() - 1, keccak256("real market checkpoint fixture"));
        finance.freezeCheckpoint(id, state.scoreA + state.scoreB);
        g.tick(id);
        (uint256 a, uint256 b) = g.paidPressure(id);
        assertEq(a, paidA);
        assertEq(b, paidB);
        assertFalse(g.stateOf(id).awaitingServe);
        assertLt(g.stateOf(id).halfA, g.stateOf(id).halfB);
        this.baseCall(BOB, abi.encodeCall(g.concede, (id)));
        vm.expectRevert("claim");
        realMarket.claim(id, vm.addr(33));
        finance.finalizeResult(id);
        uint256 oldVault = vault.balances(vm.addr(33));
        vm.prank(vm.addr(999));
        realMarket.claim(id, vm.addr(33));
        realMarket.claim(id, vm.addr(44));
        assertEq(vm.addr(33).balance, 0.2 ether);
        assertEq(vm.addr(44).balance, 0);
        assertEq(vault.balances(vm.addr(33)), oldVault);
        vm.expectRevert("claim");
        realMarket.claim(id, vm.addr(33));
    }

    function testRealMarketInterruptedMatchRefundAndParticipantRestriction() public {
        (MarketV4 realMarket, RoomsVault vault, uint256 id) = _realFinance();
        uint256 paid = _realBuy(realMarket, vault, id, 33, 0, 0.1 ether);
        (, uint256 version) = finance.bettingWindow(id, 0);
        MarketV4.Bet memory participant =
            MarketV4.Bet(vm.addr(ALICE), id, 0, 0.1 ether, 1 ether, version, 0, uint64(block.timestamp + 60));
        vm.expectRevert("participant");
        realMarket.buy(participant, hex"");
        vm.roll(vm.getBlockNumber() + 6_001);
        g.tick(id);
        assertEq(g.phaseOf(id), 4);
        finance.finalizeResult(id);
        realMarket.claim(id, vm.addr(33));
        assertEq(vm.addr(33).balance, paid);
        assertEq(g.ratingOf(vm.addr(ALICE), 1).played, 0);
        assertEq(realMarket.totalPendingPayouts(), 0);
    }
}
