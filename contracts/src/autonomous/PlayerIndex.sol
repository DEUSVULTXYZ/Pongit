// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AuthorityStore as S} from "./AuthorityStore.sol";

library PlayerIndex {
    function add(mapping(bytes32 => uint256) storage w, address player, uint8 mode) public {
        if (S.get(w, 31, uint160(player), mode) != 0) return;
        uint256 n = S.get(w, 30, mode, 0);
        S.set(w, 30, mode, n + 1, uint160(player));
        S.set(w, 30, mode, 0, n + 1);
        S.set(w, 31, uint160(player), mode, 1);
    }

    function page(mapping(bytes32 => uint256) storage w, uint8 mode, uint256 offset, uint256 limit)
        public
        view
        returns (address[] memory players, uint256 total)
    {
        require(mode < 2 && limit <= 100, "page bounds");
        total = S.get(w, 30, mode, 0);
        uint256 n = offset >= total ? 0 : total - offset;
        if (n > limit) n = limit;
        players = new address[](n);
        for (uint256 i; i < n; i++) {
            players[i] = address(uint160(S.get(w, 30, mode, offset + i + 1)));
        }
    }
}
