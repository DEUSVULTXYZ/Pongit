// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
library IndependentTypes {
    struct Binding {
        uint256 id;
        uint256 room;
        address a;
        address b;
        address keyA;
        address keyB;
        uint64 expiresA;
        uint64 expiresB;
        uint8 mode;
        bool ranked;
        uint64 preparedBlock;
        uint256 epoch;
    }
    struct Result {
        address arena;
        uint256 epoch;
        uint256 id;
        address a;
        address b;
        address winner;
        uint8 mode;
        bool ranked;
        uint8 status;
        uint8 scoreA;
        uint8 scoreB;
        bytes32 hash;
    }
}
