// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AuthorityStore as S} from "./AuthorityStore.sol";
import {ILobbyRatings} from "./ContractLobby.sol";
import {EloFormulaV2} from "../v2/EloFormulaV2.sol";

/// Existing rating arithmetic, linked immutably to keep the arena under EIP-170.
library AuthorityRating {
    event RatingUpdated(
        uint256 indexed id, address indexed player, uint8 mode, uint32 season, uint32 elo, uint32 played, uint32 wins
    );

    function rate(
        mapping(bytes32 => uint256) storage words,
        uint256 id,
        address a,
        address b,
        address winner,
        EloFormulaV2 eloFormula
    ) public {
        uint8 mode = uint8(S.get(words, 0, id, 0) >> 168);
        ILobbyRatings.Rating memory ra = ILobbyRatings(address(this)).ratingOf(a, mode);
        ILobbyRatings.Rating memory rb = ILobbyRatings(address(this)).ratingOf(b, mode);
        S.set(words, 0, id, 12, uint256(ra.elo) | (uint256(rb.elo) << 32));
        (ra, rb) = _calculate(eloFormula, ra, rb, winner == a, _pairCount(words, a, b, mode));
        _rating(words, id, a, ra);
        _rating(words, id, b, rb);
        S.set(words, 0, id, 12, S.get(words, 0, id, 12) | (uint256(ra.elo) << 64) | (uint256(rb.elo) << 96));
    }

    function _pairCount(mapping(bytes32 => uint256) storage words, address a, address b, uint8 mode)
        private
        returns (uint256 count)
    {
        bytes32 pair = keccak256(abi.encode(a < b ? a : b, a < b ? b : a, block.timestamp / 1 days, mode));
        bytes32 k = S.key(3, uint256(pair), 0);
        count = words[k] + 1;
        if (count > 8) count = 8;
        words[k] = count;
    }

    function _calculate(
        EloFormulaV2 eloFormula,
        ILobbyRatings.Rating memory ra,
        ILobbyRatings.Rating memory rb,
        bool aWon,
        uint256 count
    ) private view returns (ILobbyRatings.Rating memory, ILobbyRatings.Rating memory) {
        int256 difference = (aWon ? int256(1e18) : int256(0)) - eloFormula.expected(ra.elo, rb.elo);
        ra.elo = _positive(
            int256(uint256(ra.elo)) + (ra.played < 10 ? int256(64) : int256(32)) * difference / 1e18 / int256(count)
        );
        rb.elo = _positive(
            int256(uint256(rb.elo)) - (rb.played < 10 ? int256(64) : int256(32)) * difference / 1e18 / int256(count)
        );
        ra.played++;
        rb.played++;
        if (aWon) ra.wins++;
        else rb.wins++;
        return (ra, rb);
    }

    function _positive(int256 n) private pure returns (uint32) {
        return uint32(uint256(n < 100 ? int256(100) : n));
    }

    function _rating(mapping(bytes32 => uint256) storage words, uint256 id, address p, ILobbyRatings.Rating memory r)
        private
    {
        words[S.key(2, uint160(p), uint8(S.get(words, 0, id, 0) >> 168))] =
            uint256(r.elo) | (uint256(r.played) << 32) | (uint256(r.wins) << 64) | (uint256(r.season) << 96);
        emit RatingUpdated(id, p, uint8(S.get(words, 0, id, 0) >> 168), r.season, r.elo, r.played, r.wins);
    }
}
