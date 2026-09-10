// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AuthorityStore as S} from "./AuthorityStore.sol";

library BaseAuthorization {
    struct Grant {
        address player;
        address key;
        uint256 generation;
        uint256 epoch;
        uint64 expires;
    }
    bytes32 constant GRANT =
        keccak256("ArcadeGrant(address player,address key,uint256 generation,uint256 epoch,uint64 expires)");
    bytes32 constant COMMAND =
        keccak256("ArcadeCommand(bytes32 grantHash,bytes32 dataHash,uint256 nonce,uint64 deadline)");

    function domain() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PONGIT Autonomous Arcade"),
                keccak256("1"),
                uint256(10143),
                address(this)
            )
        );
    }

    function grantHash(Grant memory g) public pure returns (bytes32) {
        return keccak256(abi.encode(GRANT, g.player, g.key, g.generation, g.epoch, g.expires));
    }

    function digest(bytes32 h) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domain(), h));
    }

    function commandHash(Grant memory g, bytes memory data, uint256 nonce, uint64 deadline)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(COMMAND, grantHash(g), keccak256(data), nonce, deadline));
    }

    function consume(
        mapping(bytes32 => uint256) storage w,
        Grant calldata g,
        bytes calldata ownerSignature,
        bytes calldata data,
        uint256 nonce,
        uint64 deadline,
        bytes calldata keySignature,
        uint256 epoch
    ) public returns (address) {
        require(
            block.chainid == 10143 && g.generation == S.generation(w) && g.player != address(0) && g.key != address(0),
            "grant deployment"
        );
        require(
            g.epoch == epoch && g.expires > block.timestamp && g.expires <= block.timestamp + 2 hours
                && deadline >= block.timestamp && deadline <= g.expires,
            "grant expired or revoked"
        );
        bytes32 gh = grantHash(g);
        require(ECDSA.recover(digest(gh), ownerSignature) == g.player, "owner grant");
        require(
            ECDSA.recover(digest(commandHash(g, data, nonce, deadline)), keySignature) == g.key, "command signature"
        );
        uint256 expected = S.get(w, 60, uint256(gh), 0);
        require(nonce == expected, "command nonce");
        S.set(w, 60, uint256(gh), 0, expected + 1);
        return g.player;
    }
}
