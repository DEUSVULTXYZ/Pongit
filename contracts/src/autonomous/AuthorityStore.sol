// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// Same flattened mapping as the engine surface. Namespace 0-4 belongs to physics/ELO.
library AuthorityStore {
    function key(uint256 ns, uint256 id, uint256 field) internal view returns (bytes32) {
        return keccak256(abi.encode(address(this), ns, id, field));
    }

    function get(mapping(bytes32 => uint256) storage w, uint256 ns, uint256 id, uint256 field)
        internal
        view
        returns (uint256)
    {
        return w[key(ns, id, field)];
    }

    function set(mapping(bytes32 => uint256) storage w, uint256 ns, uint256 id, uint256 field, uint256 value) internal {
        w[key(ns, id, field)] = value;
    }

    function generation(mapping(bytes32 => uint256) storage w) internal view returns (uint256) {
        return get(w, 100, 0, 0);
    }

    function nextId(mapping(bytes32 => uint256) storage w) internal returns (uint256 id) {
        uint256 n = get(w, 100, 0, 1) + 1;
        require(n < type(uint128).max, "id range");
        set(w, 100, 0, 1, n);
        id = (generation(w) << 128) | n;
    }
}
