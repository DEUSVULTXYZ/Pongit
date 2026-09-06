// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {NativePayouts} from "./NativePayouts.sol";
import {IMarketMaker} from "../v2/MarketV2.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IMatchResultV2 as IMatchResult} from "../v2/GameV2.sol";
import {Vault} from "../Vault.sol";

contract MarketV4 is AccessControl, Pausable, EIP712, NativePayouts {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant BET_TYPEHASH = keccak256(
        "Bet(address player,uint256 matchId,uint8 side,uint256 shares,uint256 maxCost,uint256 version,uint256 nonce,uint64 deadline)"
    );

    struct Bet {
        address player;
        uint256 matchId;
        uint8 side;
        uint256 shares;
        uint256 maxCost;
        uint256 version;
        uint256 nonce;
        uint64 deadline;
    }

    struct Book {
        uint256 a;
        uint256 b;
        uint256 liquidity;
        uint256 reserve;
        uint256 totalPaid;
        uint64 lockoutUs;
        bool reclaimed;
    }

    struct Position {
        uint256 a;
        uint256 b;
        uint256 paid;
        bool claimed;
    }
    IMatchResult public immutable results;
    IMarketMaker public immutable maker;
    Vault public immutable vault;
    address payable public immutable treasury;
    uint64 public lockoutUs = 600_000;
    mapping(uint256 => Book) public books;
    mapping(uint256 => mapping(address => Position)) public positions;
    mapping(address => uint256) public nonces;
    mapping(uint256 => uint256[2]) private paidBySide;
    function pressure(uint256 id) external view returns (uint256, uint256) { return (paidBySide[id][0], paidBySide[id][1]); }
    event MarketOpened(uint256 indexed matchId, uint256 liquidity, uint256 reserve);
    event BetPlaced(uint256 indexed matchId, address indexed player, uint8 side, uint256 shares, uint256 cost);
    event Claimed(uint256 indexed matchId, address indexed player, uint256 amount, bool refunded);

    constructor(address admin, address payable treasury_, IMatchResult game, IMarketMaker maker_, Vault vault_)
        EIP712("PONG Market", "1")
    {
        require(admin != address(0) && treasury_ != address(0), "roles");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(TREASURY_ROLE, treasury_);
        results = game;
        maker = maker_;
        vault = vault_;
        treasury = treasury_;
    }

    receive() external payable {
        require(msg.sender == address(vault), "vault only");
    }

    function setPaused(bool value) external onlyRole(PAUSER_ROLE) {
        if (value) _pause();
        else _unpause();
    }

    function setLockout(uint64 value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(value >= 300_000 && value <= 10_000_000, "lockout");
        lockoutUs = value;
    }

    function open(uint256 id, uint256 liquidity) external payable whenNotPaused {
        (address a,,, uint8 status) = results.result(id);
        require(a != address(0) && (status == 1 || status == 2) && books[id].liquidity == 0, "market");
        uint256 seed = maker.cost(0, 0, liquidity) + liquidity / 1e6 + 1e9;
        require(msg.value >= seed, "seed collateral");
        books[id] = Book(0, 0, liquidity, msg.value, 0, lockoutUs, false);
        emit MarketOpened(id, liquidity, msg.value);
    }

    function quote(uint256 id, uint8 side, uint256 shares) public view returns (uint256 amount) {
        Book storage b = books[id];
        require(b.liquidity > 0 && side <= 1 && shares >= 1e12 && shares <= 100 * b.liquidity, "quote bounds");
        uint256 beforeCost = maker.cost(b.a, b.b, b.liquidity);
        uint256 afterCost = maker.cost(b.a + (side == 0 ? shares : 0), b.b + (side == 1 ? shares : 0), b.liquidity);
        // Conservative per-trade margin, including the omitted exp tail and fixed point rounding.
        amount = (afterCost > beforeCost ? afterCost - beforeCost : 0) + b.liquidity / 1e12 + 1;
    }

    function buy(Bet calldata bet, bytes calldata signature) external whenNotPaused nonReentrant {
        Book storage b = books[bet.matchId];
        (address a, address c,,) = results.result(bet.matchId);
        require(bet.player != a && bet.player != c, "participant");
        (bool allowed, uint256 version) = results.bettingWindow(bet.matchId, b.lockoutUs);
        require(allowed && version == bet.version, "window or version");
        require(bet.deadline >= block.timestamp && bet.nonce == nonces[bet.player]++, "nonce or deadline");
        require(
            ECDSA.recover(_hashTypedDataV4(keccak256(abi.encode(BET_TYPEHASH, bet))), signature) == bet.player,
            "signature"
        );
        uint256 amount = quote(bet.matchId, bet.side, bet.shares);
        require(amount <= bet.maxCost, "slippage");
        Position storage p = positions[bet.matchId][bet.player];
        if (bet.side == 0) {
            b.a += bet.shares;
            p.a += bet.shares;
        } else {
            b.b += bet.shares;
            p.b += bet.shares;
        }
        b.reserve += amount;
        b.totalPaid += amount;
        paidBySide[bet.matchId][bet.side] += amount;
        p.paid += amount;
        require(b.reserve >= b.a && b.reserve >= b.b && b.reserve >= b.totalPaid, "collateral");
        vault.debit(bet.player, amount);
        emit BetPlaced(bet.matchId, bet.player, bet.side, bet.shares, amount);
    }

    function claim(uint256 id, address player) external nonReentrant {
        Book storage b = books[id];
        Position storage p = positions[id][player];
        (address a,, address winner, uint8 status) = results.result(id);
        require((status == 3 || status == 4) && !p.claimed && p.paid > 0, "claim");
        uint256 amount = status == 4 ? p.paid : winner == a ? p.a : p.b;
        p.claimed = true;
        b.a -= p.a;
        b.b -= p.b;
        b.totalPaid -= p.paid;
        b.reserve -= amount;
        _schedulePayout(0, id, player, amount);
        emit Claimed(id, player, amount, status == 4);
    }

    function reclaim(uint256 id) external onlyRole(TREASURY_ROLE) nonReentrant {
        Book storage b = books[id];
        (address a,, address winner, uint8 status) = results.result(id);
        require(status == 3 || status == 4, "not settled");
        uint256 liability = status == 4 ? b.totalPaid : winner == a ? b.a : b.b;
        uint256 free = b.reserve - liability;
        b.reserve -= free;
        (bool ok,) = treasury.call{value: free}("");
        require(ok, "transfer");
    }
}
