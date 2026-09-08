// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Vault} from "../Vault.sol";

/// @notice Rooms have exactly one spending module, the immutable prediction market.
contract RoomsVault is Vault {
    constructor(address admin) Vault(admin) { require(block.chainid == 10143, "testnet only"); }
    function _moduleLimit() internal pure override returns (uint256) { return 1; }
}
