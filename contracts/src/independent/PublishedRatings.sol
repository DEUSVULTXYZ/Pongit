// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IndependentTypes as T} from "./IndependentTypes.sol";
import {ILobbyRatings} from "../autonomous/ContractLobby.sol";
import {EloFormulaV2} from "../v2/EloFormulaV2.sol";

/// Ordered published-result ledger. Corrections rebuild a new rating generation in
/// bounded batches, then swap it atomically. The original payment decision is immutable.
contract PublishedRatings is ILobbyRatings {
    struct Entry { T.Result first; T.Result latest; uint64 at; bool finality; }
    address public immutable lobby;
    address public immutable migrationOwner;
    uint256 public immutable genesisTime;
    EloFormulaV2 public immutable formula;
    bool public migrationSealed;
    bytes32 public migrationEvidence;
    Entry[] private entries;
    mapping(uint256 => uint256) public indexOf;
    mapping(address => mapping(uint8 => Rating)) private seeds;
    mapping(uint256 => mapping(address => mapping(uint8 => Rating))) private ratings;
    mapping(uint256 => mapping(bytes32 => uint8)) private pairCounts;
    mapping(bytes32 => uint8) private pairSeeds;
    mapping(uint8 => address[]) private players;
    mapping(uint8 => mapping(address => bool)) private known;
    mapping(uint256 => mapping(uint256 => uint128)) private changes;
    uint256 public generation = 1;
    uint256 public buildGeneration;
    uint256 public cursor;
    uint256 public revision;
    event ResultPublished(uint256 indexed id, address indexed arena, uint256 epoch, bytes32 hash, uint256 index);
    event ResultCorrected(uint256 indexed id, bytes32 previousHash, bytes32 correctedHash, uint256 revision);
    event ResultFinal(uint256 indexed id, bytes32 hash);
    event RatingUpdated(uint256 indexed id, address indexed player, uint8 mode, uint32 season, uint32 elo, uint32 played, uint32 wins);
    event RankingRebuilt(uint256 generation, uint256 revision, uint256 count);
    constructor(address lobby_, address admin, uint256 genesis) {
        require(block.chainid == 10143 && lobby_ != address(0) && admin != address(0) && genesis <= block.timestamp, "identities");
        lobby = lobby_; migrationOwner = admin; genesisTime = genesis; formula = new EloFormulaV2();
    }
    modifier onlyLobby() { require(msg.sender == lobby && block.chainid == 10143, "lobby only"); _; }
    function _add(address p, uint8 mode) private {
        if (!known[mode][p]) { known[mode][p] = true; players[mode].push(p); }
    }
    function seed(address[] calldata accounts, uint8 mode, Rating[] calldata values) external {
        require(msg.sender == migrationOwner && !migrationSealed && accounts.length == values.length
            && accounts.length <= 100 && mode < 2, "migration only");
        for (uint256 i; i < accounts.length; i++) {
            require(accounts[i] != address(0) && values[i].elo >= 100 && values[i].season > 0, "seed value");
            require(seeds[accounts[i]][mode].season == 0, "seed immutable");
            seeds[accounts[i]][mode] = values[i]; _add(accounts[i],mode);
        }
    }
    function sealMigration(bytes32 evidence) external {
        require(msg.sender == migrationOwner && !migrationSealed && evidence != 0, "migration only");
        migrationEvidence = evidence; migrationSealed = true;
    }
    function seedPairCounts(bytes32[] calldata pairs, uint8[] calldata values) external {
        require(msg.sender == migrationOwner && !migrationSealed && pairs.length == values.length
            && pairs.length <= 100, "migration only");
        for (uint256 i; i < pairs.length; i++) {
            require(pairs[i] != 0 && values[i] > 0 && values[i] <= 8 && pairSeeds[pairs[i]] == 0, "pair seed");
            pairSeeds[pairs[i]] = values[i];
        }
    }
    function count() external view returns (uint256) { return entries.length; }
    function resultPage(uint256 offset,uint256 limit) external view returns(Entry[] memory page,uint256 total) {
        require(limit<=50,"page bounds");total=entries.length;
        uint256 n=offset>=total?0:total-offset;if(n>limit)n=limit;
        page=new Entry[](n);for(uint256 i;i<n;i++)page[i]=entries[total-1-offset-i];
    }
    function entry(uint256 id) external view returns (Entry memory) {
        require(indexOf[id] > 0, "unpublished result"); return entries[indexOf[id]-1];
    }
    function playerPage(uint8 mode, uint256 offset, uint256 limit) external view returns (address[] memory page, uint256 total) {
        require(mode < 2 && limit <= 100, "page bounds"); total = players[mode].length;
        uint256 n = offset >= total ? 0 : total-offset; if (n > limit) n = limit;
        page = new address[](n); for (uint256 i; i < n; i++) page[i] = players[mode][offset+i];
    }
    function currentSeason() public view returns (uint32) { return _season(block.timestamp); }
    function _season(uint256 at) private view returns (uint32) { return uint32(1 + (at-genesisTime)/30 days); }
    function _at(uint256 gen, address p, uint8 mode, uint256 at) private view returns (Rating memory r) {
        r = ratings[gen][p][mode]; if (r.season == 0) r = seeds[p][mode];
        uint32 season = _season(at);
        if (r.season == 0) return Rating(1000,0,0,season);
        if (r.season == season) return r;
        require(r.season < season, "seed season is in future");
        int256 value = int256(uint256(r.elo));
        for (uint256 i; i < 16 && uint256(r.season)+i < season; i++) value = 1000 + (value-1000)/2;
        return Rating(uint32(uint256(value)),0,0,season);
    }
    function ratingOf(address p, uint8 mode) external view returns (Rating memory) {
        require(mode < 2, "mode"); return _at(generation,p,mode,block.timestamp);
    }
    function ratingChange(uint256 id) external view returns (uint32 beforeA,uint32 beforeB,uint32 afterA,uint32 afterB) {
        uint128 v = changes[generation][id]; return (uint32(v),uint32(v>>32),uint32(v>>64),uint32(v>>96));
    }
    function publish(T.Result calldata r, bool finality) external onlyLobby {
        require(migrationSealed && indexOf[r.id] == 0 && r.id != 0 && r.epoch > 0 && r.hash != 0, "result identity");
        _terminal(r);
        indexOf[r.id] = entries.length+1;
        entries.push(Entry(r,r,uint64(block.timestamp),finality));
        if (r.ranked) { _add(r.a,r.mode); _add(r.b,r.mode); }
        if (buildGeneration == 0) _apply(generation,entries.length-1);
        emit ResultPublished(r.id,r.arena,r.epoch,r.hash,entries.length-1);
        if (finality) emit ResultFinal(r.id,r.hash);
    }
    function _terminal(T.Result calldata r) private pure {
        require(r.mode < 2 && r.a != address(0) && r.b != address(0) && r.a != r.b, "participants");
        require((r.status == 3 && (r.winner == r.a || r.winner == r.b)) || (r.status == 4 && r.winner == address(0)), "terminal result");
    }
    function reconcile(T.Result calldata r, bool finality) external onlyLobby {
        require(indexOf[r.id] > 0, "unpublished result");
        Entry storage e = entries[indexOf[r.id]-1];
        require(e.first.arena == r.arena && e.first.epoch == r.epoch && e.first.a == r.a && e.first.b == r.b
            && e.first.mode == r.mode && e.first.ranked == r.ranked, "result binding");
        require(!e.finality || keccak256(abi.encode(e.latest)) == keccak256(abi.encode(r)), "final result immutable");
        if (finality) _terminal(r);
        if (keccak256(abi.encode(e.latest)) != keccak256(abi.encode(r))) {
            bytes32 oldHash = e.latest.hash; e.latest = r; revision++;
            // Never reuse a partially rebuilt generation after a second correction.
            buildGeneration = buildGeneration == 0 ? generation+1 : buildGeneration+1; cursor = 0;
            emit ResultCorrected(r.id,oldHash,r.hash,revision);
        }
        if (finality && !e.finality) { e.finality = true; emit ResultFinal(r.id,r.hash); }
    }
    function rebuild(uint256 budget) external {
        require(buildGeneration > 0 && budget > 0 && budget <= 32, "rebuild bounds");
        uint256 end = cursor+budget; if (end > entries.length) end = entries.length;
        while (cursor < end) { _apply(buildGeneration,cursor); cursor++; }
        if (cursor == entries.length) {
            generation = buildGeneration; buildGeneration = 0;
            emit RankingRebuilt(generation,revision,cursor);
        }
    }
    function _positive(int256 n) private pure returns (uint32) { return uint32(uint256(n < 100 ? int256(100) : n)); }
    function _apply(uint256 gen, uint256 i) private {
        Entry storage e = entries[i]; T.Result memory r = e.latest;
        if (!r.ranked || r.status != 3) return;
        Rating memory a = _at(gen,r.a,r.mode,e.at); Rating memory b = _at(gen,r.b,r.mode,e.at);
        uint128 before = uint128(a.elo) | (uint128(b.elo)<<32);
        bytes32 pair = keccak256(abi.encode(r.a < r.b ? r.a:r.b,r.a < r.b ? r.b:r.a,uint256(e.at)/1 days,r.mode));
        uint8 n = pairCounts[gen][pair]; if (n == 0) n = pairSeeds[pair];
        if (n < 8) n++; pairCounts[gen][pair] = n;
        int256 diff = (r.winner == r.a ? int256(1e18) : int256(0)) - formula.expected(a.elo,b.elo);
        a.elo = _positive(int256(uint256(a.elo)) + (a.played < 10 ? int256(64):int256(32))*diff/1e18/int256(uint256(n)));
        b.elo = _positive(int256(uint256(b.elo)) - (b.played < 10 ? int256(64):int256(32))*diff/1e18/int256(uint256(n)));
        a.played++; b.played++; if (r.winner == r.a) a.wins++; else b.wins++;
        ratings[gen][r.a][r.mode] = a; ratings[gen][r.b][r.mode] = b;
        changes[gen][r.id] = before | (uint128(a.elo)<<64) | (uint128(b.elo)<<96);
        emit RatingUpdated(r.id,r.a,r.mode,a.season,a.elo,a.played,a.wins);
        emit RatingUpdated(r.id,r.b,r.mode,b.season,b.elo,b.played,b.wins);
    }
}
