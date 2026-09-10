// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {OwnerWrites} from "./OwnerWrites.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// Ciphertext only. Publication is permanent; closing the notebook only removes in-memory keys.
contract PrivateDataStore is OwnerWrites {
    uint256 public constant CHUNK_BYTES = 4096;
    uint256 public constant MAX_BYTES = 65536;
    bytes32 public constant NOTEBOOK = keccak256("pongit.xyz/notebook/v1");
    bytes32 public constant CONTACTS = keccak256("pongit.xyz/contacts/v1");

    struct Head {
        uint64 revision;
        bytes32 upload;
    }

    struct Upload {
        address player;
        bytes32 namespace;
        bytes32 root;
        bytes32 dataHash;
        bytes12 iv;
        uint64 expected;
        uint64 expires;
        uint32 size;
        uint16 bitmap;
        uint8 count;
        bool committed;
    }
    mapping(address => mapping(bytes32 => Head)) public heads;
    mapping(bytes32 => Upload) public uploads;
    mapping(bytes32 => mapping(uint8 => bytes)) private pieces;
    event UploadOpened(bytes32 indexed id, address indexed player, bytes32 indexed namespace, uint64 expected);
    event PrivateDataSaved(address indexed player, bytes32 indexed namespace, uint64 revision, bytes32 upload);
    constructor() OwnerWrites("PONGIT Private Data") {}

    function begin(
        address player,
        bytes32 namespace,
        uint64 expected,
        bytes32 root,
        bytes32 dataHash,
        bytes12 iv,
        uint32 size,
        uint256 nonce,
        uint64 deadline,
        bytes calldata signature
    ) external returns (bytes32 id) {
        require(namespace == NOTEBOOK || namespace == CONTACTS, "namespace");
        require(size >= 16 && size <= MAX_BYTES && root != 0 && dataHash != 0, "ciphertext bounds");
        require(heads[player][namespace].revision == expected, "revision conflict");
        bytes32 action = keccak256(abi.encode(this.begin.selector, namespace, expected, root, dataHash, iv, size));
        _authorize(player, action, nonce, deadline, signature);
        id = keccak256(abi.encode(address(this), player, namespace, nonce, action));
        uint8 count = uint8((size + CHUNK_BYTES - 1) / CHUNK_BYTES);
        uploads[id] =
            Upload(
            player, namespace, root, dataHash, iv, expected, uint64(block.timestamp + 1 days), size, 0, count, false
        );
        emit UploadOpened(id, player, namespace, expected);
    }

    function put(bytes32 id, uint8 index, bytes calldata data, bytes32[] calldata proof) external {
        Upload storage u = uploads[id];
        require(
            u.player != address(0) && !u.committed && u.expires >= block.timestamp && index < u.count,
            "upload unavailable"
        );
        uint256 length = index + 1 == u.count ? u.size - uint256(index) * CHUNK_BYTES : CHUNK_BYTES;
        require(data.length == length && proof.length <= 4, "chunk bounds");
        bytes32 leaf = keccak256(abi.encode(index, keccak256(data)));
        require(MerkleProof.verifyCalldata(proof, u.root, leaf), "chunk proof");
        if (u.bitmap & (uint16(1) << index) != 0) {
            require(keccak256(pieces[id][index]) == keccak256(data), "chunk immutable");
            return;
        }
        pieces[id][index] = data;
        u.bitmap |= uint16(1) << index;
    }

    function commit(bytes32 id) external {
        Upload storage u = uploads[id];
        if (u.committed) return;
        require(
            u.player != address(0) && u.expires >= block.timestamp && uint256(u.bitmap) == (uint256(1) << u.count) - 1,
            "incomplete upload"
        );
        Head storage head = heads[u.player][u.namespace];
        require(head.revision == u.expected, "revision conflict");
        bytes memory whole;
        for (uint8 i; i < u.count; i++) {
            whole = bytes.concat(whole, pieces[id][i]);
        }
        require(keccak256(whole) == u.dataHash, "ciphertext hash");
        u.committed = true;
        head.revision++;
        head.upload = id;
        emit PrivateDataSaved(u.player, u.namespace, head.revision, id);
    }

    function chunk(bytes32 id, uint8 index) external view returns (bytes memory) {
        require(index < uploads[id].count, "chunk index");
        return pieces[id][index];
    }
}
