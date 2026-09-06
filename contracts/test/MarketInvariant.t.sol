// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IMatchResult} from "../src/Game.sol";
import {Market, LMSR} from "../src/Market.sol";
import {Vault} from "../src/Vault.sol";

contract MockResults is IMatchResult {
    function result(uint256) external pure returns (address, address, address, uint8) {
        return (address(1), address(2), address(0), 2);
    }

    function bettingWindow(uint256, uint64) external pure returns (bool, uint256) {
        return (true, 1);
    }
}

contract BuyerHandler is Test {
    Market public market;
    address public player;

    constructor(Market m) {
        market = m;
        player = vm.addr(12345);
    }

    function buy(uint64 amount, bool side) external {
        uint256 shares = bound(uint256(amount), 1e12, 0.1 ether);
        Market.Bet memory bet =
            Market.Bet(
            player, 1, side ? 1 : 0, shares, 1 ether, 1, market.nonces(player), uint64(block.timestamp + 1000)
        );
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PONG Market"),
                keccak256("1"),
                block.chainid,
                address(market)
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", domain, keccak256(abi.encode(market.BET_TYPEHASH(), bet))));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(12345, digest);
        market.buy(bet, abi.encodePacked(r, s, v));
    }
}

contract MarketInvariantTest is StdInvariant, Test {
    Market market;
    Vault vault;
    BuyerHandler handler;

    function setUp() public {
        vault = new Vault(address(this));
        market = new Market(address(this), payable(address(this)), new MockResults(), new LMSR(), vault);
        vault.registerModule(address(market));
        vault.registerModule(address(this));
        vault.seal();
        handler = new BuyerHandler(market);
        vm.deal(address(this), 100000 ether);
        vault.depositFor{value: 99990 ether}(handler.player());
        market.open{value: 1 ether}(1, 1 ether);
        targetContract(address(handler));
    }

    function invariantAllOutcomesAndRefundsCollateralized() public view {
        (uint256 a, uint256 b,, uint256 reserve, uint256 paid,,) = market.books(1);
        assertGe(reserve, a);
        assertGe(reserve, b);
        assertGe(reserve, paid);
        assertEq(address(market).balance, reserve);
        assertGe(address(vault).balance, vault.totalBalances());
    }
}
