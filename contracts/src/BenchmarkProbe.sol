// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Physics} from "./Physics.sol";

/// @notice Isolated testnet measurement tool, never part of the production trust boundary.
contract BenchmarkProbe {
    address public immutable owner = msg.sender;
    uint64 public sequence;
    uint64 public immutable startBlock = uint64(block.number);
    Physics.State private state = Physics.initial(bytes32(uint256(1234)));
    event Transition(uint64 indexed sequence, bytes state);

    function step(uint64 seq) external {
        require(msg.sender == owner && seq == sequence + 1, "sequence or owner");
        sequence = seq;
        if (state.finished) {
            state = Physics.initial(bytes32(uint256(1234)));
            state.t = (uint64(block.number) - startBlock) * 300000;
        }
        (state,) = Physics.advance(state, (uint64(block.number) - startBlock) * 300000, 32);
        state.leftDir = seq % 2 == 0 ? int8(-1) : int8(1);
        emit Transition(seq, abi.encode(state));
    }
}
