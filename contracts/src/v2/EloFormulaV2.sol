// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {SD59x18, sd, exp} from "@prb/math/src/SD59x18.sol";

/// @notice Stateless, immutable arithmetic. Game owns all season and rating state.
contract EloFormulaV2 {
    function expected(uint32 eloA, uint32 eloB) external pure returns (int256) {
        int256 diff = int256(uint256(eloB)) - int256(uint256(eloA));
        if (diff > 2000) diff = 2000;
        if (diff < -2000) diff = -2000;
        return 1e36 / (1e18 + SD59x18.unwrap(exp(sd(diff * 5756462732485114))));
    }
}
