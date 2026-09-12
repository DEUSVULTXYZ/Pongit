// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {OwnerWrites} from "../autonomous/OwnerWrites.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// Monad admission authority. A root grant never authorizes a financial operation.
/// Active arenas snapshot the key; their separate revocation is executed on the engine.
contract ArcadeFamily is OwnerWrites {
    struct Grant {
        address player;
        address key;
        uint64 issuedAt;
        uint64 expires;
        uint256 revision;
    }
    bytes32 public constant GRANT_TYPEHASH = keccak256(
        "ArcadeFamilyGrant(address player,address key,uint64 issuedAt,uint64 expires,uint256 revision)"
    );
    mapping(address => uint256) public revisions;
    mapping(address => Grant) private grants;
    event Granted(address indexed player, address indexed key, uint64 expires, uint256 revision);
    event AdmissionsRevoked(address indexed player, uint256 revision);
    constructor() OwnerWrites("PONGIT Arcade Family") { require(block.chainid == 10143, "testnet only"); }

    function grantDigest(Grant memory g) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(GRANT_TYPEHASH, g)));
    }
    function register(Grant calldata g, bytes calldata signature) external {
        require(block.chainid == 10143 && g.player != address(0) && g.key != address(0), "grant identity");
        require(g.revision == revisions[g.player] && g.issuedAt <= block.timestamp && g.expires > block.timestamp,
            "grant expired or revoked");
        require(g.expires > g.issuedAt && g.expires - g.issuedAt <= 2 hours, "grant duration");
        require(ECDSA.recover(grantDigest(g), signature) == g.player, "owner grant");
        Grant memory old = grants[g.player];
        if (old.key != address(0) && old.revision == g.revision) {
            require(g.issuedAt >= old.issuedAt, "older grant");
            if (g.issuedAt == old.issuedAt) require(grantDigest(old) == grantDigest(g), "grant conflict");
        }
        grants[g.player] = g;
        emit Granted(g.player, g.key, g.expires, g.revision);
    }
    function grantOf(address player) public view returns (Grant memory g) {
        g = grants[player];
        if (g.revision != revisions[player] || g.expires <= block.timestamp) delete g;
    }
    function revoke(address player, uint256 nonce, uint64 deadline, bytes calldata signature) external {
        _authorize(player, keccak256(abi.encode(this.revoke.selector, revisions[player])), nonce, deadline, signature);
        revisions[player]++;
        emit AdmissionsRevoked(player, revisions[player]);
    }
}
