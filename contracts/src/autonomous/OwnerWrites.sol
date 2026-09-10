// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

abstract contract OwnerWrites is EIP712 {
    mapping(address => uint256) public writeNonces;
    bytes32 constant WRITE = keccak256("OwnerWrite(address player,bytes32 action,uint256 nonce,uint64 deadline)");
    constructor(string memory name) EIP712(name, "1") {}

    function writeDigest(address player, bytes32 action, uint256 nonce, uint64 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(WRITE, player, action, nonce, deadline)));
    }

    function _authorize(address player, bytes32 action, uint256 nonce, uint64 deadline, bytes calldata signature)
        internal
    {
        require(
            block.chainid == 10143 && player != address(0) && deadline >= block.timestamp
                && nonce == writeNonces[player],
            "write expired or replayed"
        );
        require(ECDSA.recover(writeDigest(player, action, nonce, deadline), signature) == player, "owner signature");
        writeNonces[player]++;
    }
}
