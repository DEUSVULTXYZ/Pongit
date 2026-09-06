// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EloFormulaV2} from "./EloFormulaV2.sol";
import {PhysicsV2 as Physics} from "./PhysicsV2.sol";

interface IPressure {
    function pressure(uint256 id) external view returns (uint256, uint256);
    function results() external view returns (address);
}
interface IPreviousGame {
    function genesisTime() external view returns (uint256);
    function ratingOf(address player) external view returns (uint32, uint32, uint32);
}

interface IMatchResultV2 {
    function result(uint256 id) external view returns (address a, address b, address winner, uint8 status);
    function bettingWindow(uint256 id, uint64 lockoutUs) external view returns (bool open, uint256 version);
}

/// @notice UI/keeper clock boundary; a future chain deployment can replace its implementation.
interface IGameClockV2 {
    function clock(uint256 id) external view returns (uint64);
}

contract GameV2 is AccessControl, Pausable, EIP712, IMatchResultV2, IGameClockV2 {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant JOIN_TYPEHASH = keccak256(
        "Join(address player,address opponent,bytes32 roomId,bytes32 commitment,address sessionKey,uint256 nonce,uint64 deadline,uint64 sessionExpiry,uint32 maxInputs,uint256 tournamentId,uint8 mode,bool ranked,uint16 rulesVersion)"
    );
    bytes32 public constant INPUT_TYPEHASH = keccak256(
        "Input(uint256 matchId,address player,int8 direction,uint64 nonce,uint64 observedBlock,uint64 validUntilBlock)"
    );
    bytes32 public constant ACTION_TYPEHASH =
        keccak256("GameAction(address player,uint256 matchId,uint8 action,uint256 nonce,uint64 deadline)");
    bytes32 public constant SESSION_TYPEHASH = keccak256(
        "Session(address player,uint256 matchId,address sessionKey,uint64 expiry,uint32 maxInputs,uint256 nonce,uint64 deadline)"
    );
    uint64 public constant BLOCK_US = 300_000;
    uint64 public constant MAX_INPUT_BLOCK_AGE = 16;
    uint256 public immutable genesisTime;
    address public immutable previousGame;
    EloFormulaV2 public immutable eloFormula;
    address public immutable configurator;
    address public market;
    uint256 public nextId = 1;
    uint8 public maxInputsPerBlock = 3;
    uint256 private pauseStart;
    uint256 private pausedBlocks;

    struct Join {
        address player;
        address opponent;
        bytes32 roomId;
        bytes32 commitment;
        address sessionKey;
        uint256 nonce;
        uint64 deadline;
        uint64 sessionExpiry;
        uint32 maxInputs;
        uint256 tournamentId;
        uint8 mode;
        bool ranked;
        uint16 rulesVersion;
    }

    struct Input {
        uint256 matchId;
        address player;
        int8 direction;
        uint64 nonce;
        uint64 observedBlock;
        uint64 validUntilBlock;
    }

    struct Session {
        address key;
        uint64 expiry;
        uint64 nonce;
        uint32 remaining;
        uint64 rateBlock;
        uint8 rateCount;
    }

    struct Match {
        address playerA;
        address playerB;
        address winner;
        bytes32 commitA;
        bytes32 commitB;
        bytes32 secretA;
        bytes32 secretB;
        bool revealedA;
        bool revealedB;
        uint64 createdBlock;
        uint64 startBlock;
        uint64 startedAt;
        uint64 version;
        uint8 status;
        uint256 tournamentId;
        Session a;
        Session b;
        Physics.State state;
        uint8 mode;
        bool ranked;
        uint16 rulesVersion;
        bool ratingFinalized;
        uint8 inputLimit;
    }

    struct Rating {
        uint32 elo;
        uint32 played;
        uint32 wins;
    }
    mapping(uint256 => Match) private matches;
    mapping(address => uint256) public nonces;
    mapping(address => uint256) public activeMatchOf;
    mapping(address => uint256) public pendingRatingOf;
    mapping(bytes32 => bool) public usedRooms;
    mapping(uint8 => mapping(uint256 => mapping(address => Rating))) public ratings;
    mapping(uint8 => mapping(address => uint256)) public lastSeason;
    mapping(bytes32 => uint256) public pairGames;
    event MatchCreated(uint256 indexed matchId, address indexed playerA, address indexed playerB, uint256 tournamentId, uint8 mode, bool ranked, uint16 rulesVersion);
    event HandicapSet(uint256 indexed matchId, int256 halfA, int256 halfB, uint256 paidA, uint256 paidB, uint64 at);
    event Snapshot(uint256 indexed matchId, uint64 version, bytes state, uint64 nextAt, uint8 nextKind, uint64 clock);
    event MatchEnded(uint256 indexed matchId, address indexed winner, uint8 status);
    event RatingUpdated(address indexed player, uint256 indexed season, uint8 indexed mode, uint32 elo, uint32 played, uint32 wins);
    event SessionChanged(uint256 indexed matchId, address indexed player, address key);

    constructor(address admin, address previousGame_) EIP712("PONG", "1") {
        require(admin != address(0), "admin");
        eloFormula = new EloFormulaV2();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        previousGame = previousGame_;
        configurator = msg.sender;
        genesisTime = previousGame_ == address(0) ? block.timestamp : IPreviousGame(previousGame_).genesisTime();
    }

    function setMarket(address value) external {
        require(msg.sender == configurator && market == address(0) && value.code.length > 0 && nextId == 1, "market sealed");
        require(IPressure(value).results() == address(this), "wrong game");
        market = value;
    }

    function setPaused(bool value) external onlyRole(PAUSER_ROLE) {
        if (value) {
            pauseStart = block.number;
            _pause();
        } else {
            pausedBlocks += block.number - pauseStart;
            _unpause();
        }
    }

    function setInputLimit(uint8 value) external onlyRole(ADMIN_ROLE) {
        require(value > 0 && value <= 10, "limit");
        maxInputsPerBlock = value;
    }

    function activeBlock() public view returns (uint64) {
        return uint64(block.number - pausedBlocks - (paused() ? block.number - pauseStart : 0));
    }

    function clock(uint256 id) public view returns (uint64) {
        Match storage m = matches[id];
        return m.status < 2 ? 0 : m.status >= 3 ? m.state.t : (activeBlock() - m.startBlock) * BLOCK_US;
    }

    function getMatch(uint256 id) external view returns (Match memory) {
        return matches[id];
    }

    function joinDigest(Join calldata j) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(JOIN_TYPEHASH, j)));
    }

    function _checkJoin(Join calldata j, bytes calldata sig) private {
        require(j.player != address(0) && j.sessionKey != address(0) && j.commitment != bytes32(0), "identity");
        require(
            j.deadline >= block.timestamp && j.sessionExpiry > block.timestamp
                && j.sessionExpiry <= block.timestamp + 1 days,
            "expiry"
        );
        require(j.maxInputs > 0 && j.maxInputs <= 20000 && j.nonce == nonces[j.player]++, "nonce or cap");
        require(ECDSA.recover(joinDigest(j), sig) == j.player, "signature");
    }

    function createMatch(Join calldata a, bytes calldata sigA, Join calldata b, bytes calldata sigB)
        external
        whenNotPaused
        returns (uint256 id)
    {
        require(a.player != b.player && a.opponent == b.player && b.opponent == a.player, "opponents");
        require(a.roomId == b.roomId && a.tournamentId == b.tournamentId && !usedRooms[a.roomId], "room");
        require(market != address(0), "market not sealed");
        require(activeMatchOf[a.player] == 0 && activeMatchOf[b.player] == 0, "active match");
        require(pendingRatingOf[a.player] == 0 && pendingRatingOf[b.player] == 0, "rating pending");
        require(a.mode <= 1 && a.mode == b.mode && a.ranked == b.ranked && a.rulesVersion == 2 && b.rulesVersion == 2, "rules");
        require(a.tournamentId == 0 || a.mode == 0 && a.ranked, "tournament rules");
        _checkJoin(a, sigA);
        _checkJoin(b, sigB);
        usedRooms[a.roomId] = true;
        id = nextId++;
        activeMatchOf[a.player] = id; activeMatchOf[b.player] = id;
        Match storage m = matches[id];
        m.playerA = a.player;
        m.playerB = b.player;
        m.commitA = a.commitment;
        m.commitB = b.commitment;
        m.createdBlock = uint64(block.number);
        m.status = 1;
        m.tournamentId = a.tournamentId;
        m.mode = a.mode; m.ranked = a.ranked; m.rulesVersion = a.rulesVersion; m.inputLimit = maxInputsPerBlock;
        m.a.key = a.sessionKey;
        m.a.expiry = a.sessionExpiry;
        m.a.remaining = a.maxInputs;
        m.b.key = b.sessionKey;
        m.b.expiry = b.sessionExpiry;
        m.b.remaining = b.maxInputs;
        emit MatchCreated(id, a.player, b.player, a.tournamentId, a.mode, a.ranked, a.rulesVersion);
    }

    function reveal(uint256 id, address player, bytes32 secret) external whenNotPaused {
        Match storage m = matches[id];
        require(m.status == 1 && block.number <= m.createdBlock + 200, "reveal window");
        if (player == m.playerA) {
            require(!m.revealedA && keccak256(abi.encodePacked(secret)) == m.commitA, "commitment");
            m.secretA = secret;
            m.revealedA = true;
        } else {
            require(
                player == m.playerB && !m.revealedB && keccak256(abi.encodePacked(secret)) == m.commitB, "commitment"
            );
            m.secretB = secret;
            m.revealedB = true;
        }
        if (m.revealedA && m.revealedB) {
            m.state = Physics.initial(keccak256(abi.encode(m.secretA, m.secretB, id)), m.mode);
            m.status = 2;
            m.startBlock = activeBlock();
            m.startedAt = uint64(block.timestamp);
            _emit(id, m);
        }
    }

    function cancelUnstarted(uint256 id) external {
        Match storage m = matches[id];
        require(m.status == 1 && block.number > m.createdBlock + 200, "not expired");
        m.status = 4;
        delete activeMatchOf[m.playerA]; delete activeMatchOf[m.playerB];
        emit MatchEnded(id, address(0), 4);
    }

    function cancelStalled(uint256 id) external {
        Match storage m = matches[id];
        require(
            m.status == 2
                && (block.timestamp > m.startedAt + 30 minutes || paused() && block.number > pauseStart + 200),
            "not stalled"
        );
        m.status = 4;
        delete activeMatchOf[m.playerA]; delete activeMatchOf[m.playerB];
        m.state.finished = true;
        emit MatchEnded(id, address(0), 4);
        _emit(id, m);
    }

    function resolveEvent(uint256 id) external whenNotPaused {
        require(matches[id].status == 2, "not live");
        _advance(id, 64);
    }

    function _emit(uint256 id, Match storage m) private {
        Physics.Event memory e = Physics.next(m.state);
        m.version++;
        emit Snapshot(id, m.version, abi.encode(m.state), e.at, e.kind, clock(id));
    }

    function _advance(uint256 id, uint256 limit) private returns (bool caught) {
        Match storage m = matches[id];
        uint64 target = clock(id);
        if (m.state.awaitingServe) {
            if (target < m.state.resumeAt) return true;
            (uint256 paidA, uint256 paidB) = IPressure(market).pressure(id);
            m.state = Physics.resume(m.state, target, paidA, paidB);
            emit HandicapSet(id, m.state.halfA, m.state.halfB, paidA, paidB, target);
            _emit(id, m);
            return true;
        }
        (Physics.State memory state, bool done) = Physics.advance(m.state, target, limit);
        // Always give players the whole break, even after a delayed keeper.
        if (state.awaitingServe) { state.t = target; state.resumeAt = target + 3_000_000; }
        m.state = state;
        if (state.finished) {
            m.status = 3;
            delete activeMatchOf[m.playerA]; delete activeMatchOf[m.playerB];
            m.winner = state.scoreA == 7 ? m.playerA : m.playerB;
            if(m.ranked) {pendingRatingOf[m.playerA]=id;pendingRatingOf[m.playerB]=id;}

            emit MatchEnded(id, m.winner, 3);
        }
        _emit(id, m);
        return done;
    }

    function submitInput(Input calldata input, bytes calldata signature) external whenNotPaused {
        Match storage m = matches[input.matchId];
        require(m.status == 2, "not live");
        require(input.direction >= -1 && input.direction <= 1, "direction");
        require(
            input.observedBlock <= block.number && block.number - input.observedBlock <= MAX_INPUT_BLOCK_AGE
                && input.validUntilBlock >= block.number
                && input.validUntilBlock <= input.observedBlock + MAX_INPUT_BLOCK_AGE,
            "input age"
        );
        Session storage session = input.player == m.playerA ? m.a : m.b;
        require(input.player == m.playerA || input.player == m.playerB, "player");
        require(session.key != address(0) && block.timestamp <= session.expiry && session.remaining > 0, "session");
        require(input.nonce == session.nonce + 1, "input nonce");
        require(
            ECDSA.recover(_hashTypedDataV4(keccak256(abi.encode(INPUT_TYPEHASH, input))), signature) == session.key,
            "input signature"
        );
        if (session.rateBlock != block.number) {
            session.rateBlock = uint64(block.number);
            session.rateCount = 0;
        }
        require(session.rateCount < m.inputLimit, "rate limit");
        require(_advance(input.matchId, 32), "keeper catchup required");
        require(m.status == 2, "match ended");
        session.nonce = input.nonce;
        session.remaining--;
        session.rateCount++;
        if (input.player == m.playerA) m.state.leftDir = input.direction;
        else m.state.rightDir = input.direction;
        _emit(input.matchId, m);
    }

    function authorizeSession(
        uint256 id,
        address player,
        address key,
        uint64 expiry,
        uint32 maxInputs,
        uint256 nonce,
        uint64 deadline,
        bytes calldata sig
    ) external {
        Match storage m = matches[id];
        require(m.status == 2 && (player == m.playerA || player == m.playerB), "player");
        require(
            deadline >= block.timestamp && nonce == nonces[player]++ && expiry <= block.timestamp + 1 days
                && expiry > block.timestamp && maxInputs <= 20000 && maxInputs > 0,
            "session bounds"
        );
        bytes32 hash = keccak256(abi.encode(SESSION_TYPEHASH, player, id, key, expiry, maxInputs, nonce, deadline));
        require(ECDSA.recover(_hashTypedDataV4(hash), sig) == player, "signature");
        Session storage s = player == m.playerA ? m.a : m.b;
        s.key = key;
        s.expiry = expiry;
        s.remaining = maxInputs;
        emit SessionChanged(id, player, key);
    }

    /// @param action 1 revokes the session; 2 concedes the match. Both need the owner, never a session key.
    function playerAction(address player, uint256 id, uint8 action, uint256 nonce, uint64 deadline, bytes calldata sig)
        external
    {
        Match storage m = matches[id];
        require(m.status == 2 && (player == m.playerA || player == m.playerB), "player");
        require(deadline >= block.timestamp && nonce == nonces[player]++, "nonce or deadline");
        require(
            ECDSA.recover(
                _hashTypedDataV4(keccak256(abi.encode(ACTION_TYPEHASH, player, id, action, nonce, deadline))), sig
            ) == player,
            "signature"
        );
        if (action == 1) {
            if (player == m.playerA) m.a.key = address(0);
            else m.b.key = address(0);
            emit SessionChanged(id, player, address(0));
        } else {
            require(action == 2, "action");
            m.winner = player == m.playerA ? m.playerB : m.playerA;
            m.status = 3;
            delete activeMatchOf[m.playerA]; delete activeMatchOf[m.playerB];
            m.state.finished = true;
            if(m.ranked) {pendingRatingOf[m.playerA]=id;pendingRatingOf[m.playerB]=id;}
            _emit(id, m);
            emit MatchEnded(id, m.winner, 3);
        }
    }

    function result(uint256 id) external view returns (address, address, address, uint8) {
        Match storage m = matches[id];
        return (m.playerA, m.playerB, m.winner, m.status);
    }

    function bettingWindow(uint256 id, uint64 lockoutUs) external view returns (bool, uint256) {
        Match storage m = matches[id];
        if (paused() || m.status != 2) return (false, m.version);
        uint64 nowUs = clock(id);
        Physics.Event memory e = Physics.next(m.state);
        // Between events the stored trajectory is still authoritative. Reject
        // any unresolved/imminent collision; age alone must not require extra
        // snapshots that would invalidate every in-flight signed quote.
        return (e.at > nowUs + lockoutUs && nowUs >= m.state.t, m.version);
    }

    function currentSeason() public view returns (uint256) {
        return 1 + (block.timestamp - genesisTime) / 30 days;
    }

    function ratingOf(address player) public view returns (Rating memory) { return ratingFor(player, 0); }

    function ratingFor(address player, uint8 mode) public view returns (Rating memory r) {
        require(mode <= 1, "mode");
        uint256 season = currentSeason();
        r = ratings[mode][season][player];
        if (r.elo != 0) return r;
        uint256 previous = lastSeason[mode][player];
        if (mode == 0 && previous == 0 && previousGame != address(0)) {
            (r.elo,r.played,r.wins) = IPreviousGame(previousGame).ratingOf(player);
            return r;
        }
        int256 value = previous == 0 ? int256(1000) : int256(uint256(ratings[mode][previous][player].elo));
        for (uint256 i; i < 16 && previous + i < season; i++) {
            value = 1000 + (value - 1000) / 2;
        }
        r.elo = uint32(uint256(value));
    }

    function finalizeRating(uint256 id) external {
        Match storage m = matches[id];
        require(m.status == 3 && !m.ratingFinalized, "rating finalized");
        m.ratingFinalized = true;
        delete pendingRatingOf[m.playerA]; delete pendingRatingOf[m.playerB];
        if (!m.ranked) return;
        _rate(m);
    }

    function _rate(Match storage m) private {
        Rating memory a = ratingFor(m.playerA, m.mode);
        Rating memory b = ratingFor(m.playerB, m.mode);
        int256 expected = eloFormula.expected(a.elo,b.elo);
        bytes32 pair = keccak256(
            abi.encode(
                m.playerA < m.playerB ? m.playerA : m.playerB,
                m.playerA < m.playerB ? m.playerB : m.playerA,
                m.mode, block.timestamp / 1 days
            )
        );
        uint256 count = ++pairGames[pair];
        if (count > 8) count = 8;
        int256 actual = m.winner == m.playerA ? int256(1e18) : int256(0);
        int256 da = (a.played < 10 ? int256(64) : int256(32)) * (actual - expected) / 1e18 / int256(count);
        int256 db = (b.played < 10 ? int256(64) : int256(32)) * (expected - actual) / 1e18 / int256(count);
        a.elo = uint32(uint256(_positive(int256(uint256(a.elo)) + da)));
        b.elo = uint32(uint256(_positive(int256(uint256(b.elo)) + db)));
        a.played++;
        b.played++;
        if (m.winner == m.playerA) a.wins++;
        else b.wins++;
        uint256 season = currentSeason();
        ratings[m.mode][season][m.playerA] = a;
        ratings[m.mode][season][m.playerB] = b;
        lastSeason[m.mode][m.playerA] = season;
        lastSeason[m.mode][m.playerB] = season;
        emit RatingUpdated(m.playerA, season, m.mode, a.elo, a.played, a.wins);
        emit RatingUpdated(m.playerB, season, m.mode, b.elo, b.played, b.wins);
    }

    function _positive(int256 n) private pure returns (int256) {
        return n < 100 ? int256(100) : n;
    }
}
