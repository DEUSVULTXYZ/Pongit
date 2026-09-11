// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AuthorityStore as S} from "./AuthorityStore.sol";
import {ContractLobby as Lobby} from "./ContractLobby.sol";
import {PlayerIndex} from "./PlayerIndex.sol";

/// Completion bookkeeping is linked code, never a user-callable arena selector.
library AuthorityLifecycle {
    event SessionDraining(uint256 indexed generation, uint256 indexed epoch, uint256 indexed lastMatch);

    function finish(
        mapping(bytes32 => uint256) storage words,
        uint256 id,
        uint256 phase,
        address winner,
        uint256 engineEpoch
    ) public {
        Lobby.finish(words, id, winner);
        uint256 header = S.get(words, 0, id, 0);
        if (phase == 3 && (header & (1 << 160)) != 0) {
            uint8 mode = uint8(header >> 168);
            PlayerIndex.add(words, address(uint160(header)), mode);
            PlayerIndex.add(words, address(uint160(S.get(words, 0, id, 1))), mode);
        }
        if (engineEpoch != 0) {
            uint256 field = S.get(words, 101, S.generation(words), 2) == 0 ? 2 : 3;
            require(S.get(words, 101, S.generation(words), field) == 0, "session result capacity");
            S.set(words, 101, S.generation(words), field, id);
        }
        // A completed match begins a drain of the shared delegation. It must
        // never close the second active match or erase an unpublished result.
        if (engineEpoch != 0 && S.get(words, 101, S.generation(words), 0) == 0) {
            S.set(words, 101, S.generation(words), 0, engineEpoch);
            emit SessionDraining(S.generation(words), engineEpoch, id);
        }
    }
}
