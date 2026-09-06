// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {GameV3 as Game} from "./GameV3.sol";
import {Vault} from "../Vault.sol";

contract TournamentsV3 is AccessControl, EIP712, ReentrancyGuard {
    bytes32 public constant TOURNAMENT_ROLE = keccak256("TOURNAMENT_ROLE");
    bytes32 public constant ENTER_TYPEHASH =
        keccak256("Enter(address player,uint256 tournamentId,uint256 nonce,uint64 deadline)");
    Game public immutable game;
    Vault public immutable vault;
    address payable public immutable treasury;
    uint256 public nextId = 1;

    struct Tournament {
        uint64 closesAt;
        uint64 roundStarted;
        uint32 capacity;
        uint8 status;
        uint256 fee;
        uint256 prize;
        uint256 seedPrize;
        uint256 round;
        uint256 settled;
        address winner;
        address[] entrants;
        address[] bracket;
    }
    mapping(uint256 => Tournament) private tournaments;
    mapping(uint256 => mapping(address => bool)) public entered;
    mapping(uint256 => mapping(address => bool)) public refunded;
    mapping(uint256 => mapping(uint256 => uint256)) public roundMatches;
    mapping(uint256 => bool) public usedMatches;
    mapping(address => uint256) public nonces;
    event TournamentCreated(uint256 indexed tournamentId, uint64 closesAt, uint32 capacity, uint256 fee, uint256 prize);
    event Registered(uint256 indexed tournamentId, address indexed player);
    event BracketUpdated(uint256 indexed tournamentId, uint256 round, address[] bracket);
    event TournamentEnded(uint256 indexed tournamentId, address indexed winner, uint8 status, uint256 prize);

    constructor(address admin, address payable treasury_, Game game_, Vault vault_) EIP712("PONG Tournaments", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TOURNAMENT_ROLE, admin);
        game = game_;
        vault = vault_;
        treasury = treasury_;
    }

    receive() external payable {
        require(msg.sender == address(vault), "vault only");
    }

    function getTournament(uint256 id) external view returns (Tournament memory) {
        return tournaments[id];
    }

    function create(uint64 closesAt, uint32 capacity, uint256 fee)
        external
        payable
        onlyRole(TOURNAMENT_ROLE)
        returns (uint256 id)
    {
        require(
            closesAt > block.timestamp && closesAt <= block.timestamp + 30 days && capacity >= 2 && capacity <= 32
                && capacity & (capacity - 1) == 0,
            "configuration"
        );
        id = nextId++;
        Tournament storage t = tournaments[id];
        t.closesAt = closesAt;
        t.capacity = capacity;
        t.fee = fee;
        t.prize = msg.value;
        t.seedPrize = msg.value;
        t.status = 1;
        emit TournamentCreated(id, closesAt, capacity, fee, msg.value);
    }

    function enter(uint256 id, address player, uint256 nonce, uint64 deadline, bytes calldata sig)
        external
        nonReentrant
    {
        Tournament storage t = tournaments[id];
        require(
            t.status == 1 && block.timestamp < t.closesAt && t.entrants.length < t.capacity && !entered[id][player],
            "registration"
        );
        require(deadline >= block.timestamp && nonce == nonces[player]++, "nonce or deadline");
        require(
            ECDSA.recover(_hashTypedDataV4(keccak256(abi.encode(ENTER_TYPEHASH, player, id, nonce, deadline))), sig)
                == player,
            "signature"
        );
        entered[id][player] = true;
        t.entrants.push(player);
        t.prize += t.fee;
        if (t.fee > 0) vault.debit(player, t.fee);
        emit Registered(id, player);
    }

    function start(uint256 id) external {
        Tournament storage t = tournaments[id];
        require(t.status == 1 && (block.timestamp >= t.closesAt || t.entrants.length == t.capacity), "start");
        require(t.entrants.length == t.capacity, "not full; cancel and refund");
        address[] memory sorted = t.entrants;
        for (uint256 i = 1; i < sorted.length; i++) {
            address p = sorted[i];
            uint256 j = i;
            uint32 rank = game.ratingOf(p).elo;
            while (
                j > 0
                    && (game.ratingOf(sorted[j - 1]).elo < rank
                        || game.ratingOf(sorted[j - 1]).elo == rank
                        && sorted[j - 1] > p)
            ) {
                sorted[j] = sorted[j - 1];
                j--;
            }
            sorted[j] = p;
        }
        // Standard balanced seeding: 1/8, 4/5, 2/7, 3/6 for eight entrants.
        uint256[] memory seeds = new uint256[](t.capacity);
        seeds[0] = 1;
        seeds[1] = 2;
        for (uint256 n = 2; n < t.capacity; n *= 2) {
            for (uint256 k = n; k > 0; k--) {
                uint256 seed = seeds[k - 1];
                seeds[2 * (k - 1)] = seed;
                seeds[2 * (k - 1) + 1] = 2 * n + 1 - seed;
            }
        }
        for (uint256 i; i < seeds.length; i++) {
            t.bracket.push(sorted[seeds[i] - 1]);
        }
        t.status = 2;
        t.roundStarted = uint64(block.number);
        emit BracketUpdated(id, 0, t.bracket);
    }

    function attach(uint256 id, uint256 slot, uint256 matchId) external {
        Tournament storage t = tournaments[id];
        require(t.status == 2 && slot < t.bracket.length / 2, "slot");
        uint256 key = t.round * 32 + slot;
        uint256 previous = roundMatches[id][key];
        if (previous != 0) {
            Game.Match memory old = game.getMatch(previous);
            require(old.status == 4, "already attached");
        }
        Game.Match memory m = game.getMatch(matchId);
        require(!usedMatches[matchId] && m.tournamentId == id && m.createdBlock >= t.roundStarted, "match scope");
        address a = t.bracket[slot * 2];
        address b = t.bracket[slot * 2 + 1];
        require(
            a != address(0) && b != address(0)
                && (m.playerA == a && m.playerB == b || m.playerA == b && m.playerB == a),
            "pair"
        );
        roundMatches[id][key] = matchId;
        usedMatches[matchId] = true;
    }

    function advance(uint256 id) external nonReentrant {
        Tournament storage t = tournaments[id];
        require(t.status == 2, "not active");
        address[] memory winners = new address[](t.bracket.length / 2);
        for (uint256 i; i < winners.length; i++) {
            (,, address winner, uint8 status) = game.result(roundMatches[id][t.round * 32 + i]);
            require(status == 3, "round incomplete");
            winners[i] = winner;
        }
        if (winners.length == 1) {
            t.status = 3;
            t.winner = winners[0];
            uint256 prize = t.prize;
            t.prize = 0;
            vault.depositFor{value: prize}(t.winner);
            emit TournamentEnded(id, t.winner, 3, prize);
        } else {
            t.bracket = winners;
            t.round++;
            t.roundStarted = uint64(block.number);
            emit BracketUpdated(id, t.round, winners);
        }
    }

    function cancel(uint256 id) external nonReentrant {
        Tournament storage t = tournaments[id];
        require(
            t.status == 1 && block.timestamp >= t.closesAt && t.entrants.length < t.capacity || t.status == 2
                && block.number > t.roundStarted + 12000,
            "cancel window"
        );
        t.status = 4;
        t.prize -= t.seedPrize;
        uint256 seed = t.seedPrize;
        t.seedPrize = 0;
        (bool ok,) = treasury.call{value: seed}("");
        require(ok, "transfer");
        emit TournamentEnded(id, address(0), 4, t.prize);
    }

    function refund(uint256 id, address player) external nonReentrant {
        Tournament storage t = tournaments[id];
        require(t.status == 4 && entered[id][player] && !refunded[id][player], "refund");
        refunded[id][player] = true;
        t.prize -= t.fee;
        vault.depositFor{value: t.fee}(player);
    }
}
