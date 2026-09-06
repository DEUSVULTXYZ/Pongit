// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice A wallet grant authorizes gameplay only. Financial contracts never consult this registry.
contract ArcadeSessions is EIP712 {
    struct Grant {
        address player;
        address key;
        address game;
        uint64 expires;
        uint256 nonce;
    }

    struct Session {
        address key;
        uint64 expires;
    }
    bytes32 public constant GRANT_TYPEHASH =
        keccak256("ArcadeGrant(address player,address key,address game,uint64 expires,uint256 nonce)");
    bytes32 public constant REVOKE_TYPEHASH =
        keccak256("ArcadeRevoke(address player,address key,uint256 nonce,uint64 deadline)");
    address public immutable configurator;
    address public game;
    mapping(address => uint256) public nonces;
    mapping(address => Session) public sessions;
    mapping(address => address) public keyOwner;
    event Granted(address indexed player, address indexed key, uint64 expires);
    event Revoked(address indexed player, address indexed key);

    constructor() EIP712("PONGIT Arcade", "1") {
        configurator = msg.sender;
    }

    function bind(address target) external {
        require(msg.sender == configurator && game == address(0) && target.code.length > 0, "sealed");
        game = target;
    }

    function grantDigest(Grant calldata g) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(GRANT_TYPEHASH, g)));
    }

    function register(Grant calldata g, bytes calldata ownerSignature, bytes calldata keySignature) external {
        require(
            game != address(0) && g.game == game && g.player != address(0) && g.key != address(0) && g.player != g.key,
            "identity"
        );
        require(
            g.expires > block.timestamp && g.expires <= block.timestamp + 2 hours && g.nonce == nonces[g.player]++,
            "bounds"
        );
        bytes32 digest = grantDigest(g);
        require(
            ECDSA.recover(digest, ownerSignature) == g.player && ECDSA.recover(digest, keySignature) == g.key,
            "signature"
        );
        // Proof of key possession prevents another wallet registering a victim's public session key.
        require(keyOwner[g.key] == address(0) || keyOwner[g.key] == g.player, "key owner");
        keyOwner[g.key] = g.player;
        sessions[g.player] = Session(g.key, g.expires);
        emit Granted(g.player, g.key, g.expires);
    }

    function expiresAt(address player, address key) public view returns (uint64) {
        Session memory s = sessions[player];
        return key != address(0) && s.key == key && s.expires > block.timestamp ? s.expires : 0;
    }

    function isSigner(address player, address signer) public view returns (bool) {
        return signer == player || expiresAt(player, signer) != 0;
    }

    function validInput(address player, address key) external view returns (bool) {
        return keyOwner[key] == address(0) || expiresAt(player, key) != 0;
    }

    function checkJoin(address player, bytes32 digest, bytes calldata signature, address inputKey, uint64 expiry)
        external
        view
    {
        address signer = ECDSA.recover(digest, signature);
        require(isSigner(player, signer), "arcade authorization");
        if (signer != player) require(inputKey == signer && expiry <= expiresAt(player, signer), "arcade input scope");
        else if (keyOwner[inputKey] != address(0)) require(expiry <= expiresAt(player, inputKey), "arcade expiry");
    }

    function checkSignature(address player, bytes32 digest, bytes calldata signature) external view {
        require(isSigner(player, ECDSA.recover(digest, signature)), "arcade authorization");
    }

    function revoke(address player, address key, uint256 nonce, uint64 deadline, bytes calldata signature) external {
        require(
            nonce == nonces[player]++ && deadline >= block.timestamp && deadline <= block.timestamp + 5 minutes,
            "bounds"
        );
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(REVOKE_TYPEHASH, player, key, nonce, deadline)));
        address signer = ECDSA.recover(digest, signature);
        require(signer == player || signer == key && sessions[player].key == key, "signature");
        require(sessions[player].key == key, "key");
        delete sessions[player];
        emit Revoked(player, key);
    }
}
