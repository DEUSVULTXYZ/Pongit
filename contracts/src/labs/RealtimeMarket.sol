// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MarketV4} from "../v4/MarketV4.sol";
import {IMarketMaker} from "../v2/MarketV2.sol";
import {IMatchResultV2} from "../v2/GameV2.sol";
import {Vault} from "../Vault.sol";
interface IBetCutoff { function bettingCutoff(uint256 id) external view returns (uint64); }

/// @notice Same LMSR and owner signatures, with a bounded logarithmic cutoff lookup.
/// Bets mined in/after the final execution second are refunded, including when
/// the engine result reaches Monad later. Earlier winners remain fully reserved.
contract RealtimeMarket is MarketV4 {
    struct Ledger { uint64 at; uint256 a; uint256 b; uint256 paid; }
    struct Liability { bool initialized; uint256 remaining; }
    mapping(uint256 => Ledger[]) private totals;
    mapping(uint256 => mapping(address => Ledger[])) private personal;
    mapping(uint256 => Liability) public liabilities;
    event LateBetRefunded(uint256 indexed matchId, address indexed player, uint256 amount);
    constructor(address admin, address payable treasury_, IMatchResultV2 game, IMarketMaker maker_, Vault vault_)
        MarketV4(admin, treasury_, game, maker_, vault_) {}

    function _append(Ledger[] storage rows, uint8 side, uint256 shares, uint256 cost) private {
        Ledger memory next = rows.length == 0 ? Ledger(0,0,0,0) : rows[rows.length-1];
        require(block.timestamp <= type(uint64).max, "timestamp");
        next.at = uint64(block.timestamp); next.paid += cost;
        if (side == 0) next.a += shares; else next.b += shares;
        if (rows.length > 0 && rows[rows.length-1].at == next.at) rows[rows.length-1] = next;
        else rows.push(next);
    }
    function _afterBuy(Bet calldata bet, uint256 amount) internal override {
        _append(totals[bet.matchId], bet.side, bet.shares, amount);
        _append(personal[bet.matchId][bet.player], bet.side, bet.shares, amount);
    }
    function _before(Ledger[] storage rows, uint64 cutoff) private view returns (Ledger memory) {
        uint256 low; uint256 high = rows.length;
        while (low < high) { uint256 mid = (low+high)/2; if (rows[mid].at < cutoff) low = mid+1; else high = mid; }
        return low == 0 ? Ledger(0,0,0,0) : rows[low-1];
    }
    function claimPreview(uint256 id, address player) public view returns (uint256 amount, uint256 refunded, bool ready) {
        Position memory p = positions[id][player];
        (address a,,address winner,uint8 status) = results.result(id);
        if (status < 3 || p.claimed || p.paid == 0) return (0,0,false);
        if (status == 4) return (p.paid,p.paid,true);
        uint64 cutoff = IBetCutoff(address(results)).bettingCutoff(id); require(cutoff > 0, "cutoff pending");
        Ledger memory valid = _before(personal[id][player],cutoff);
        refunded = p.paid-valid.paid; amount = (winner == a ? valid.a : valid.b)+refunded; ready = true;
    }
    function _liability(uint256 id) private returns (Liability storage due) {
        due = liabilities[id];
        if (!due.initialized) {
            (address a,,address winner,uint8 status) = results.result(id); require(status == 3 || status == 4, "not settled");
            if (status == 4) due.remaining = books[id].totalPaid;
            else {
                uint64 cutoff = IBetCutoff(address(results)).bettingCutoff(id); require(cutoff > 0, "cutoff pending");
                Ledger memory valid = _before(totals[id],cutoff);
                due.remaining = (winner == a ? valid.a : valid.b) + books[id].totalPaid - valid.paid;
            }
            require(books[id].reserve >= due.remaining, "reserved liabilities"); due.initialized = true;
        }
    }
    function claim(uint256 id, address player) external override nonReentrant {
        (uint256 amount,uint256 refunded,bool ready) = claimPreview(id,player); require(ready,"claim");
        Liability storage due = _liability(id); Position storage p = positions[id][player]; Book storage b = books[id];
        p.claimed = true; due.remaining -= amount;
        b.a -= p.a; b.b -= p.b; b.totalPaid -= p.paid; b.reserve -= amount;
        _schedulePayout(0,id,player,amount);
        emit Claimed(id,player,amount,refunded == amount && refunded > 0);
        if (refunded > 0) emit LateBetRefunded(id,player,refunded);
    }
    function reclaim(uint256 id) external override onlyRole(TREASURY_ROLE) nonReentrant {
        Liability storage due = _liability(id); Book storage b = books[id];
        uint256 free = b.reserve-due.remaining; b.reserve -= free;
        (bool ok,) = treasury.call{value:free}(""); require(ok,"transfer");
    }
}
