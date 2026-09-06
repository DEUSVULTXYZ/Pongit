// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {Game, IMatchResult} from "../src/Game.sol";
import {Physics} from "../src/Physics.sol";
import {Vault} from "../src/Vault.sol";
import {Market, LMSR} from "../src/Market.sol";
import {Tournaments} from "../src/Tournaments.sol";

contract PongTest is Test {
    Game game;
    Vault vault;
    Market market;
    Tournaments tour;
    uint256 constant AK = 11;
    uint256 constant BK = 22;
    uint256 constant SK = 33;
    uint256 constant TK = 44;
    address a;
    address b;
    uint256 id;
    bytes32 sa = bytes32(uint256(123));
    bytes32 sb = bytes32(uint256(456));

    function setUp() public {
        a = vm.addr(AK);
        b = vm.addr(BK);
        game = new Game(address(this));
        vault = new Vault(address(this));
        market = new Market(address(this), payable(address(this)), game, new LMSR(), vault);
        tour = new Tournaments(address(this), payable(address(this)), game, vault);
        vault.registerModule(address(market));
        vault.registerModule(address(tour));
        vault.seal();
        id = create(0);
        game.reveal(id, a, sa);
        game.reveal(id, b, sb);
        vm.deal(address(this), 10000 ether);
        vault.depositFor{value: 100 ether}(vm.addr(TK));
    }
    receive() external payable {}

    function sign(uint256 key, bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function digest(string memory name, address target, bytes32 hash) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                keccak256(
                    abi.encode(
                        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                        keccak256(bytes(name)),
                        keccak256("1"),
                        block.chainid,
                        target
                    )
                ),
                hash
            )
        );
    }

    function create(uint256 tournamentId) internal returns (uint256) {
        bytes32 room = bytes32(game.nextId());
        Game.Join memory ja = Game.Join(
            a,
            b,
            room,
            keccak256(abi.encodePacked(sa)),
            vm.addr(SK),
            game.nonces(a),
            uint64(block.timestamp + 1000),
            uint64(block.timestamp + 2000),
            1000,
            tournamentId
        );
        Game.Join memory jb = Game.Join(
            b,
            a,
            room,
            keccak256(abi.encodePacked(sb)),
            vm.addr(55),
            game.nonces(b),
            uint64(block.timestamp + 1000),
            uint64(block.timestamp + 2000),
            1000,
            tournamentId
        );
        return game.createMatch(ja, sign(AK, game.joinDigest(ja)), jb, sign(BK, game.joinDigest(jb)));
    }

    function input(uint64 nonce, int8 direction, uint256 key) internal {
        Game.Input memory i =
            Game.Input(id, a, direction, nonce, uint64(vm.getBlockNumber()), uint64(vm.getBlockNumber() + 4));
        game.submitInput(i, sign(key, digest("PONG", address(game), keccak256(abi.encode(game.INPUT_TYPEHASH(), i)))));
    }

    function tryInput(uint64 nonce, int8 direction, uint256 key) external {
        input(nonce, direction, key);
    }

    function tryAction(uint256 key, uint8 code) external {
        action(key, code);
    }

    function tryBuy(uint256 key, uint8 side, uint256 shares) external {
        buy(key, side, shares);
    }

    function action(uint256 key, uint8 code) internal {
        uint256 nonce = game.nonces(a);
        uint64 deadline = uint64(block.timestamp + 1000);
        bytes memory sig = sign(
            key,
            digest("PONG", address(game), keccak256(abi.encode(game.ACTION_TYPEHASH(), a, id, code, nonce, deadline)))
        );
        game.playerAction(a, id, code, nonce, deadline, sig);
    }

    function testInputNonceAndWrongKey() public {
        input(1, 1, SK);
        vm.expectRevert("input nonce");
        this.tryInput(1, 0, SK);
        vm.expectRevert("input signature");
        this.tryInput(2, 0, AK);
    }

    function testOutOfOrderAndExpiredSession() public {
        vm.expectRevert("input nonce");
        this.tryInput(2, 1, SK);
        vm.warp(block.timestamp + 2001);
        vm.expectRevert("session");
        this.tryInput(1, 1, SK);
    }

    function testSessionCommandCap() public {
        uint256 nonce = game.nonces(a);
        uint64 expiry = uint64(block.timestamp + 100);
        uint64 deadline = expiry;
        bytes memory sig = sign(
            AK,
            digest(
                "PONG",
                address(game),
                keccak256(abi.encode(game.SESSION_TYPEHASH(), a, id, vm.addr(SK), expiry, uint32(1), nonce, deadline))
            )
        );
        game.authorizeSession(id, a, vm.addr(SK), expiry, 1, nonce, deadline, sig);
        input(1, 1, SK);
        vm.expectRevert("session");
        this.tryInput(2, 0, SK);
    }

    function testSignatureCannotMoveDifferentMatch() public {
        Game.Input memory i = Game.Input(id, a, 1, 1, uint64(block.number), uint64(block.number + 4));
        bytes memory sig = sign(SK, digest("PONG", address(game), keccak256(abi.encode(game.INPUT_TYPEHASH(), i))));
        uint256 other = create(0);
        game.reveal(other, a, sa);
        game.reveal(other, b, sb);
        i.matchId = other;
        vm.expectRevert("input signature");
        game.submitInput(i, sig);
    }

    function testRevokeAndScope() public {
        vm.expectRevert("signature");
        this.tryAction(SK, 2);
        action(AK, 1);
        vm.expectRevert("session");
        this.tryInput(1, 1, SK);
    }

    function testExpiredInputAndWrongDomain() public {
        Game.Input memory i = Game.Input(id, a, 1, 1, uint64(block.number), uint64(block.number + 4));
        bytes memory sig = sign(SK, digest("PONG", address(game), keccak256(abi.encode(game.INPUT_TYPEHASH(), i))));
        vm.roll(block.number + 5);
        vm.expectRevert("input age");
        game.submitInput(i, sig);
        i.observedBlock = uint64(vm.getBlockNumber());
        i.validUntilBlock = uint64(vm.getBlockNumber() + 4);
        sig = sign(SK, digest("PONG", address(vault), keccak256(abi.encode(game.INPUT_TYPEHASH(), i))));
        vm.expectRevert("input signature");
        game.submitInput(i, sig);
    }

    function testRateLimit() public {
        input(1, 1, SK);
        input(2, 0, SK);
        input(3, -1, SK);
        vm.expectRevert("rate limit");
        this.tryInput(4, 0, SK);
    }

    function testPauseFreezesClock() public {
        vm.roll(block.number + 2);
        uint64 before = game.clock(id);
        game.setPaused(true);
        vm.roll(block.number + 300);
        assertEq(game.clock(id), before);
        game.setPaused(false);
        assertEq(game.clock(id), before);
    }

    function testPublicKeeperCompletesAndRatingsOnlyOnce() public {
        vm.roll(block.number + 1000);
        vm.prank(address(777));
        game.resolveEvent(id);
        (,,, uint8 status) = game.result(id);
        assertEq(status, 3);
        assertEq(game.ratingOf(a).played, 1);
        vm.expectRevert("not live");
        game.resolveEvent(id);
    }

    function testNoRevealCancellation() public {
        uint256 pendingId = create(0);
        vm.roll(block.number + 201);
        game.cancelUnstarted(pendingId);
        (,,, uint8 status) = game.result(pendingId);
        assertEq(status, 4);
    }

    function testSessionCannotWithdraw() public {
        uint64 deadline = uint64(block.timestamp + 1000);
        bytes memory sig = sign(
            SK,
            digest("PONG Vault", address(vault), keccak256(abi.encode(vault.WITHDRAW_TYPEHASH(), a, a, 1, 0, deadline)))
        );
        vm.expectRevert("signature or balance");
        vault.withdraw(a, payable(a), 1, 0, deadline, sig);
        vm.expectRevert("balance or module");
        vault.debit(a, 0);
        vm.expectRevert("registration");
        vault.registerModule(address(this));
    }

    function buy(uint256 key, uint8 side, uint256 shares) internal {
        address player = vm.addr(key);
        (, uint256 version) = game.bettingWindow(id, 600000);
        Market.Bet memory bet =
            Market.Bet(
            player, id, side, shares, 100 ether, version, market.nonces(player), uint64(block.timestamp + 1000)
        );
        market.buy(
            bet, sign(key, digest("PONG Market", address(market), keccak256(abi.encode(market.BET_TYPEHASH(), bet))))
        );
    }

    function testMarketSettlementAndParticipantBan() public {
        market.open{value: 1 ether}(id, 1 ether);
        vm.expectRevert("participant");
        this.tryBuy(AK, 0, 0.1 ether);
        buy(TK, 1, 0.1 ether);
        uint256 balance = vault.balances(vm.addr(TK));
        action(AK, 2);
        market.claim(id, vm.addr(TK));
        assertEq(vault.balances(vm.addr(TK)), balance + 0.1 ether);
        vm.expectRevert("claim");
        market.claim(id, vm.addr(TK));
        market.reclaim(id);
    }

    function testCancellationRefund() public {
        market.open{value: 1 ether}(id, 1 ether);
        uint256 balance = vault.balances(vm.addr(TK));
        buy(TK, 1, 0.1 ether);
        vm.warp(block.timestamp + 31 minutes);
        game.cancelStalled(id);
        market.claim(id, vm.addr(TK));
        assertEq(vault.balances(vm.addr(TK)), balance);
        assertTrue(game.getMatch(id).state.finished);
    }

    function testMarketBoundsAndPartialTreasuryReclaim() public {
        market.open{value: 1 ether}(id, 1 ether);
        vm.expectRevert("quote bounds");
        market.quote(id, 0, 101 ether);
        buy(TK, 1, 0.1 ether);
        action(AK, 2);
        uint256 balance = vault.balances(vm.addr(TK));
        market.reclaim(id);
        market.claim(id, vm.addr(TK));
        assertEq(vault.balances(vm.addr(TK)), balance + 0.1 ether);
    }

    function testTournamentFourSeedsAndTwoRounds() public {
        uint256 tid = tour.create{value: 2 ether}(uint64(block.timestamp + 1000), 4, 0);
        for (uint256 key = 101; key <= 104; key++) {
            address p = vm.addr(key);
            uint64 deadline = uint64(block.timestamp + 500);
            bytes memory sig = sign(
                key,
                digest(
                    "PONG Tournaments", address(tour), keccak256(abi.encode(tour.ENTER_TYPEHASH(), p, tid, 0, deadline))
                )
            );
            tour.enter(tid, p, 0, deadline, sig);
        }
        tour.start(tid);
        for (uint256 round; round < 2; round++) {
            Tournaments.Tournament memory t = tour.getTournament(tid);
            for (uint256 slot; slot < t.bracket.length / 2; slot++) {
                address pa = t.bracket[slot * 2];
                address pb = t.bracket[slot * 2 + 1];
                uint256 ka;
                uint256 kb;
                for (uint256 k = 101; k <= 104; k++) {
                    if (vm.addr(k) == pa) ka = k;
                    if (vm.addr(k) == pb) kb = k;
                }
                bytes32 room = bytes32(game.nextId());
                uint64 deadline = uint64(block.timestamp + 500);
                Game.Join memory ja =
                    Game.Join(
                    pa, pb, room, keccak256(abi.encodePacked(sa)), pa, game.nonces(pa), deadline, deadline, 10, tid
                );
                Game.Join memory jb =
                    Game.Join(
                    pb, pa, room, keccak256(abi.encodePacked(sb)), pb, game.nonces(pb), deadline, deadline, 10, tid
                );
                uint256 mid = game.createMatch(ja, sign(ka, game.joinDigest(ja)), jb, sign(kb, game.joinDigest(jb)));
                game.reveal(mid, pa, sa);
                game.reveal(mid, pb, sb);
                tour.attach(tid, slot, mid);
                uint256 nonce = game.nonces(pa);
                bytes memory sig = sign(
                    ka,
                    digest(
                        "PONG",
                        address(game),
                        keccak256(abi.encode(game.ACTION_TYPEHASH(), pa, mid, uint8(2), nonce, deadline))
                    )
                );
                game.playerAction(pa, mid, 2, nonce, deadline, sig);
            }
            tour.advance(tid);
        }
        Tournaments.Tournament memory ended = tour.getTournament(tid);
        assertEq(ended.status, 3);
        assertEq(vault.balances(ended.winner), 2 ether);
    }

    function testBettingTrajectoryStaysValidUntilTheNextEvent() public {
        uint256 version = game.getMatch(id).version;
        vm.roll(block.number + 3);
        (bool open, uint256 observed) = game.bettingWindow(id, 0);
        assertTrue(open, "An unchanged trajectory remains authoritative after two blocks");
        assertEq(observed, version);
        vm.roll(block.number + 20);
        (open,) = game.bettingWindow(id, 0);
        assertFalse(open, "An unresolved past collision is stale");
    }

    function testMarketLockoutAndStaleVersion() public {
        market.open{value: 1 ether}(id, 1 ether);
        uint64 impact = Physics.next(game.getMatch(id).state).at;
        vm.roll(block.number + (impact - 600000) / game.BLOCK_US() + 1);
        vm.expectRevert("window or version");
        this.tryBuy(TK, 0, 0.1 ether);
    }

    function testTournamentWholeBracket() public {
        uint256 tid = tour.create{value: 2 ether}(uint64(block.timestamp + 1000), 2, 0);
        for (uint256 k; k < 2; k++) {
            address p = k == 0 ? a : b;
            uint64 deadline = uint64(block.timestamp + 500);
            bytes memory sig = sign(
                k == 0 ? AK : BK,
                digest(
                    "PONG Tournaments", address(tour), keccak256(abi.encode(tour.ENTER_TYPEHASH(), p, tid, 0, deadline))
                )
            );
            tour.enter(tid, p, 0, deadline, sig);
        }
        tour.start(tid);
        id = create(tid);
        game.reveal(id, a, sa);
        game.reveal(id, b, sb);
        tour.attach(tid, 0, id);
        action(AK, 2);
        tour.advance(tid);
        assertEq(tour.getTournament(tid).winner, b);
        assertEq(vault.balances(b), 2 ether);
        vm.expectRevert("not active");
        tour.advance(tid);
    }

    function testFuzzPhysicsBoundsAndNoTunneling(uint64 delta, int8 ld, int8 rd) public pure {
        Physics.State memory s = Physics.initial(bytes32(uint256(77)));
        s.leftDir = int8(int256(ld) % 3);
        if (s.leftDir > 1) s.leftDir = 1;
        if (s.leftDir < -1) s.leftDir = -1;
        s.rightDir = int8(int256(rd) % 3);
        if (s.rightDir > 1) s.rightDir = 1;
        if (s.rightDir < -1) s.rightDir = -1;
        (s,) = Physics.advance(s, uint64(uint256(delta) % 1e12), 128);
        assert(s.left >= 48e6 && s.left <= 528e6 && s.right >= 48e6 && s.right <= 528e6);
        assert(s.scoreA <= 7 && s.scoreB <= 7 && (s.finished || s.y >= 6e6 && s.y <= 570e6));
    }

    function testFuzzLongStepSameAsEventSteps(uint32 dt) public pure {
        Physics.State memory initialState = Physics.initial(bytes32(uint256(4)));
        (Physics.State memory large, bool done) = Physics.advance(initialState, uint64(dt), 128);
        Physics.State memory small = Physics.initial(bytes32(uint256(4)));
        bool complete;
        for (uint256 i; i < 128; i++) {
            (small, complete) = Physics.advance(small, uint64(dt), 1);
            if (complete) break;
        }
        assert(done == complete && keccak256(abi.encode(large)) == keccak256(abi.encode(small)));
    }
}
