// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ArcadeSessions} from "../src/v3/ArcadeSessions.sol";
import {GameV3} from "../src/v3/GameV3.sol";
import {TournamentsV3} from "../src/v3/TournamentsV3.sol";
import {Vault} from "../src/Vault.sol";
import {MarketV2, LMSRV2} from "../src/v2/MarketV2.sol";
import {IMatchResultV2} from "../src/v2/GameV2.sol";

contract PreviousRatings {
    function genesisTime() external view returns (uint256) {
        return block.timestamp;
    }

    function ratingFor(address, uint8 mode) external pure returns (uint32, uint32, uint32) {
        return (mode == 0 ? 1234 : 1456, 20, 12);
    }
}

contract ArcadeV3Test is Test {
    ArcadeSessions registry;
    GameV3 game;
    Vault vault;
    MarketV2 market;
    uint256 constant AK = 11;
    uint256 constant BK = 22;
    uint256 constant SK = 33;
    uint256 constant TK = 44;
    address a;
    address b;

    function setUp() public {
        a = vm.addr(AK);
        b = vm.addr(BK);
        registry = new ArcadeSessions();
        game = new GameV3(address(this), address(new PreviousRatings()), registry);
        registry.bind(address(game));
        vault = new Vault(address(this));
        market = new MarketV2(address(this), payable(address(this)), IMatchResultV2(address(game)), new LMSRV2(), vault);
        vault.registerModule(address(market));
        vault.registerModule(address(new TournamentsV3(address(this), payable(address(this)), game, vault)));
        vault.seal();
        game.setMarket(address(market));
        vm.deal(address(this), 100 ether);
        vault.depositFor{value: 1 ether}(a);
    }

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

    function grant(uint256 owner, uint256 key, uint64 expires) internal {
        ArcadeSessions.Grant memory g =
            ArcadeSessions.Grant(vm.addr(owner), vm.addr(key), address(game), expires, registry.nonces(vm.addr(owner)));
        bytes32 h = registry.grantDigest(g);
        registry.register(g, sign(owner, h), sign(key, h));
    }

    function join(address player, address opponent, address key) internal view returns (GameV3.Join memory) {
        return GameV3.Join(
            player,
            opponent,
            bytes32(game.nextId()),
            keccak256(abi.encodePacked(bytes32(uint256(123)))),
            key,
            game.nonces(player),
            uint64(block.timestamp + 60),
            uint64(block.timestamp + 3600),
            1000,
            0,
            0,
            false,
            2
        );
    }

    function create() internal returns (uint256 id) {
        GameV3.Join memory ja = join(a, b, vm.addr(SK));
        GameV3.Join memory jb = join(b, a, vm.addr(TK));
        id = game.createMatch(ja, sign(SK, game.joinDigest(ja)), jb, sign(TK, game.joinDigest(jb)));
        game.reveal(id, a, bytes32(uint256(123)));
        game.reveal(id, b, bytes32(uint256(123)));
    }

    function authorize() internal {
        grant(AK, SK, uint64(block.timestamp + 7200));
        grant(BK, TK, uint64(block.timestamp + 7200));
    }

    function input(uint256 id, uint64 nonce) external {
        GameV3.Input memory i = GameV3.Input(id, a, 1, nonce, uint64(block.number), uint64(block.number + 4));
        game.submitInput(i, sign(SK, digest("PONG", address(game), keccak256(abi.encode(game.INPUT_TYPEHASH(), i)))));
    }

    function action(uint256 id, uint8 code) external {
        uint256 nonce = game.nonces(a);
        uint64 deadline = uint64(block.timestamp + 60);
        game.playerAction(
            a,
            id,
            code,
            nonce,
            deadline,
            sign(
                SK,
                digest(
                    "PONG", address(game), keccak256(abi.encode(game.ACTION_TYPEHASH(), a, id, code, nonce, deadline))
                )
            )
        );
    }

    function revoke(uint256 key) internal {
        uint256 nonce = registry.nonces(a);
        uint64 deadline = uint64(block.timestamp + 120);
        bytes32 h = digest(
            "PONGIT Arcade",
            address(registry),
            keccak256(abi.encode(registry.REVOKE_TYPEHASH(), a, vm.addr(SK), nonce, deadline))
        );
        registry.revoke(a, vm.addr(SK), nonce, deadline, sign(key, h));
    }

    function testBothRatingsInherited() public view {
        assertEq(game.ratingFor(a, 0).elo, 1234);
        assertEq(game.ratingFor(a, 1).elo, 1456);
    }

    function testGameKeyCreatesPlaysAndConcedesMultipleMatches() public {
        authorize();
        uint256 id = create();
        this.input(id, 1);
        this.action(id, 2);
        assertEq(game.getMatch(id).winner, b);
        uint256 next = create();
        assertEq(next, id + 1);
        this.input(next, 1);
        assertEq(game.ratingOf(a).elo, 1234);
    }

    function testGrantReplayRejected() public {
        ArcadeSessions.Grant memory g =
            ArcadeSessions.Grant(a, vm.addr(SK), address(game), uint64(block.timestamp + 3600), 0);
        bytes32 h = registry.grantDigest(g);
        bytes memory sa = sign(AK, h);
        bytes memory ss = sign(SK, h);
        registry.register(g, sa, ss);
        vm.expectRevert("bounds");
        registry.register(g, sa, ss);
    }

    function testWrongChainGrantRejected() public {
        ArcadeSessions.Grant memory g =
            ArcadeSessions.Grant(a, vm.addr(SK), address(game), uint64(block.timestamp + 3600), 0);
        bytes32 h = registry.grantDigest(g);
        bytes memory sa = sign(AK, h);
        bytes memory ss = sign(SK, h);
        vm.chainId(block.chainid + 1);
        vm.expectRevert("signature");
        registry.register(g, sa, ss);
    }

    function testKeyPossessionPreventsPoisoning() public {
        ArcadeSessions.Grant memory g =
            ArcadeSessions.Grant(b, vm.addr(SK), address(game), uint64(block.timestamp + 3600), 0);
        bytes32 h = registry.grantDigest(g);
        bytes memory sa = sign(BK, h);
        bytes memory ss = sign(TK, h);
        vm.expectRevert("signature");
        registry.register(g, sa, ss);
        assertTrue(registry.validInput(a, vm.addr(SK)));
    }

    function testMaximumTwoHours() public {
        ArcadeSessions.Grant memory g =
            ArcadeSessions.Grant(a, vm.addr(SK), address(game), uint64(block.timestamp + 7201), 0);
        bytes32 h = registry.grantDigest(g);
        bytes memory sa = sign(AK, h);
        bytes memory ss = sign(SK, h);
        vm.expectRevert("bounds");
        registry.register(g, sa, ss);
    }

    function testRevokedKeyCannotInputOrConcede() public {
        authorize();
        uint256 id = create();
        revoke(SK);
        vm.expectRevert();
        this.input(id, 1);
        vm.expectRevert("arcade authorization");
        this.action(id, 2);
        assertFalse(registry.isSigner(a, vm.addr(SK)));
    }

    function testOwnerRevokes() public {
        authorize();
        revoke(AK);
        assertFalse(registry.isSigner(a, vm.addr(SK)));
    }

    function testExpiredKeyCannotCreate() public {
        authorize();
        vm.warp(block.timestamp + 7201);
        GameV3.Join memory ja = join(a, b, vm.addr(SK));
        GameV3.Join memory jb = join(b, a, vm.addr(TK));
        bytes memory sa = sign(SK, game.joinDigest(ja));
        bytes memory sb = sign(TK, game.joinDigest(jb));
        vm.expectRevert("arcade authorization");
        game.createMatch(ja, sa, jb, sb);
    }

    function testRenewalInvalidatesOldKey() public {
        authorize();
        grant(AK, 55, uint64(block.timestamp + 7200));
        assertFalse(registry.isSigner(a, vm.addr(SK)));
        assertFalse(registry.validInput(a, vm.addr(SK)));
        assertTrue(registry.isSigner(a, vm.addr(55)));
    }

    function testGameKeyCannotDelegateAnotherKey() public {
        authorize();
        GameV3.Join memory ja = join(a, b, vm.addr(55));
        GameV3.Join memory jb = join(b, a, vm.addr(TK));
        bytes memory sa = sign(SK, game.joinDigest(ja));
        bytes memory sb = sign(TK, game.joinDigest(jb));
        vm.expectRevert("arcade input scope");
        game.createMatch(ja, sa, jb, sb);
    }

    function testConsentCommitsOpponentModeAndRanked() public {
        authorize();
        GameV3.Join memory ja = join(a, b, vm.addr(SK));
        GameV3.Join memory jb = join(b, a, vm.addr(TK));
        bytes memory sa = sign(SK, game.joinDigest(ja));
        bytes memory sb = sign(TK, game.joinDigest(jb));
        ja.mode = 1;
        jb.mode = 1;
        vm.expectRevert();
        game.createMatch(ja, sa, jb, sb);
    }

    function testDuplicateInputRejected() public {
        authorize();
        uint256 id = create();
        this.input(id, 1);
        vm.expectRevert();
        this.input(id, 1);
    }

    function testGameKeyCannotWithdrawOwnerFunds() public {
        authorize();
        uint64 deadline = uint64(block.timestamp + 60);
        bytes32 h =
            digest(
            "PONG Vault", address(vault), keccak256(abi.encode(vault.WITHDRAW_TYPEHASH(), a, a, 1 ether, 0, deadline))
        );
        bytes memory sig = sign(SK, h);
        vm.expectRevert();
        vault.withdraw(a, payable(a), 1 ether, 0, deadline, sig);
        assertEq(vault.balances(a), 1 ether);
    }

    function testRegistryBindingSealed() public {
        vm.expectRevert("sealed");
        registry.bind(address(market));
    }
}
