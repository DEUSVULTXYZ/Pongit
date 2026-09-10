// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ProfileRegistry} from "../src/autonomous/ProfileRegistry.sol";
import {PrivateDataStore} from "../src/autonomous/PrivateDataStore.sol";

contract AuthorityDataTest is Test {
    ProfileRegistry p;
    PrivateDataStore d;
    uint256 constant KEY = 0xCAFE;
    address player;

    function setUp() public {
        vm.chainId(10143);
        vm.warp(1000);
        player = vm.addr(KEY);
        p = new ProfileRegistry(address(this));
        d = new PrivateDataStore();
    }

    function sig(uint256 key, bytes32 hash) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
        return abi.encodePacked(r, s, v);
    }

    function save(uint256 key, string memory name, uint8 avatar) external {
        address a = vm.addr(key);
        uint256 n = p.writeNonces(a);
        bytes32 action = keccak256(abi.encode(p.save.selector, name, avatar));
        p.save(a, name, avatar, n, 2000, sig(key, p.writeDigest(a, action, n, 2000)));
    }

    function testReservationsUniqueCaseInsensitiveAndOwnerClaim() public {
        string[] memory names = new string[](1);
        names[0] = "Nova";
        address[] memory owners = new address[](1);
        owners[0] = player;
        p.reserve(names, owners);
        p.seal();
        vm.expectRevert();
        this.save(99, "NOVA", 1);
        this.save(KEY, "nova", 11);
        assertEq(p.profileOf(player).handle, "nova");
        vm.expectRevert();
        this.save(KEY, "nova", 12);
        this.save(KEY, "nova_2", 0);
        this.save(99, "Nova", 1);
        vm.expectRevert();
        p.reserve(names, owners);
        vm.expectRevert();
        this.save(KEY, "a b", 0);
    }

    function testProfileRejectsSessionKeyAndReplay() public {
        p.seal();
        bytes32 action = keccak256(abi.encode(p.save.selector, "player", uint8(0)));
        bytes memory wrong = sig(99, p.writeDigest(player, action, 0, 2000));
        vm.expectRevert();
        p.save(player, "player", 0, 0, 2000, wrong);
        bytes memory s = sig(KEY, p.writeDigest(player, action, 0, 2000));
        p.save(player, "player", 0, 0, 2000, s);
        vm.expectRevert();
        p.save(player, "player", 0, 0, 2000, s);
    }

    function open(bytes memory cipher, bytes32 ns, uint64 expected, bytes12 iv) private returns (bytes32 id) {
        uint256 n = d.writeNonces(player);
        bytes32 hash = keccak256(cipher);
        bytes32 root = keccak256(abi.encode(uint8(0), hash));
        bytes32 action = keccak256(abi.encode(d.begin.selector, ns, expected, root, hash, iv, uint32(cipher.length)));
        return d.begin(
            player,
            ns,
            expected,
            root,
            hash,
            iv,
            uint32(cipher.length),
            n,
            2000,
            sig(KEY, d.writeDigest(player, action, n, 2000))
        );
    }

    function testPartialUploadNeverReplacesHeadConcurrentSaveRejected() public {
        bytes memory cipher = new bytes(64);
        cipher[0] = 0xAB;
        bytes32 ns = d.NOTEBOOK();
        bytes32 a = open(cipher, ns, 0, bytes12(uint96(1)));
        vm.expectRevert();
        d.commit(a);
        (uint64 rev, bytes32 head) = d.heads(player, ns);
        assertEq(rev, 0);
        assertEq(head, 0);
        bytes32 b = open(cipher, ns, 0, bytes12(uint96(2)));
        bytes32[] memory proof = new bytes32[](0);
        d.put(a, 0, cipher, proof);
        d.commit(a);
        d.commit(a);
        d.put(b, 0, cipher, proof);
        vm.expectRevert("revision conflict");
        d.commit(b);
        (rev, head) = d.heads(player, ns);
        assertEq(rev, 1);
        assertEq(head, a);
        (rev,) = d.heads(player, d.CONTACTS());
        assertEq(rev, 0);
    }

    function testCorruptChunksExpiryAndPrivateNamespace() public {
        bytes memory cipher = new bytes(16);
        bytes32 id = open(cipher, d.CONTACTS(), 0, bytes12(uint96(3)));
        cipher[0] = 0xFF;
        vm.expectRevert();
        d.put(id, 0, cipher, new bytes32[](0));
        vm.warp(block.timestamp + 1 days + 1);
        cipher[0] = 0;
        vm.expectRevert();
        d.put(id, 0, cipher, new bytes32[](0));
    }

    function testMaximumPayloadSixteenChunksAtomicCommit() public {
        bytes memory cipher = new bytes(65536);
        bytes32[] memory nodes = new bytes32[](31);
        for (uint8 i; i < 16; i++) {
            bytes memory chunk_ = new bytes(4096);
            for (uint256 j; j < 4096; j++) {
                chunk_[j] = bytes1(i);
                cipher[uint256(i) * 4096 + j] = bytes1(i);
            }
            nodes[15 + i] = keccak256(abi.encode(i, keccak256(chunk_)));
        }
        for (uint256 i = 15; i > 0; i--) {
            bytes32 a = nodes[2 * i - 1];
            bytes32 b = nodes[2 * i];
            nodes[i - 1] = a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
        }
        bytes32 ns = d.NOTEBOOK();
        bytes32 hash = keccak256(cipher);
        bytes12 iv = bytes12(uint96(8));
        bytes32 action = keccak256(abi.encode(d.begin.selector, ns, uint64(0), nodes[0], hash, iv, uint32(65536)));
        bytes32 id = d.begin(
            player, ns, 0, nodes[0], hash, iv, 65536, 0, 2000, sig(KEY, d.writeDigest(player, action, 0, 2000))
        );
        for (uint8 i; i < 16; i++) {
            bytes memory chunk_ = new bytes(4096);
            for (uint256 j; j < 4096; j++) {
                chunk_[j] = bytes1(i);
            }
            bytes32[] memory proof = new bytes32[](4);
            uint256 index = 15 + i;
            for (uint256 level; level < 4; level++) {
                proof[level] = nodes[index % 2 == 1 ? index + 1 : index - 1];
                index = (index - 1) / 2;
            }
            d.put(id, i, chunk_, proof);
        }
        uint256 gasBefore = gasleft();
        d.commit(id);
        emit log_named_uint("64 KiB commit gas", gasBefore - gasleft());
        (uint64 revision, bytes32 head) = d.heads(player, ns);
        assertEq(revision, 1);
        assertEq(head, id);
    }
}
