// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {OwnerWrites} from "./OwnerWrites.sol";

contract ProfileRegistry is OwnerWrites {
    struct Profile {
        string handle;
        uint8 avatar;
    }
    address public immutable administrator;
    bool public migrationSealed;
    mapping(bytes32 => address) public handleOwner;
    mapping(address => Profile) private profiles;
    mapping(address => bytes32) private ownerHandle;
    event ProfileSaved(address indexed player, string handle, uint8 avatar);

    constructor(address admin) OwnerWrites("PONGIT Profiles") {
        require(admin != address(0));
        administrator = admin;
    }

    function handleKey(string memory name) public pure returns (bytes32) {
        bytes memory b = bytes(name);
        require(b.length >= 3 && b.length <= 20, "username length");
        for (uint256 i; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 65 && c <= 90) c += 32;
            require(c >= 97 && c <= 122 || c >= 48 && c <= 57 || c == 95, "username characters");
            b[i] = bytes1(c);
        }
        require(uint8(b[0]) >= 97 && uint8(b[0]) <= 122, "username starts with letter");
        return keccak256(b);
    }

    function reserve(string[] calldata names, address[] calldata players) external {
        require(
            msg.sender == administrator && !migrationSealed && names.length == players.length && names.length <= 32,
            "migration closed"
        );
        for (uint256 i; i < names.length; i++) {
            bytes32 key = handleKey(names[i]);
            address p = players[i];
            require(p != address(0) && handleOwner[key] == address(0) && ownerHandle[p] == 0, "reservation conflict");
            handleOwner[key] = p;
            ownerHandle[p] = key;
        }
    }

    function seal() external {
        require(msg.sender == administrator && !migrationSealed, "migrationSealed");
        migrationSealed = true;
    }

    function profileOf(address player) external view returns (Profile memory) {
        return profiles[player];
    }

    function save(
        address player,
        string calldata name,
        uint8 avatar,
        uint256 nonce,
        uint64 deadline,
        bytes calldata signature
    ) external {
        require(migrationSealed && avatar < 12, "profile bounds");
        bytes32 key = handleKey(name);
        _authorize(player, keccak256(abi.encode(this.save.selector, name, avatar)), nonce, deadline, signature);
        require(handleOwner[key] == address(0) || handleOwner[key] == player, "username taken");
        bytes32 old = ownerHandle[player];
        if (old != 0 && old != key) delete handleOwner[old];
        handleOwner[key] = player;
        ownerHandle[player] = key;
        profiles[player] = Profile(name, avatar);
        emit ProfileSaved(player, name, avatar);
    }
}
