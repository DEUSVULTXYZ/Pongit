// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IMonadPressure} from "./ChaosProof.sol";

library AuthorityControl {
    enum Execution {
        Interlude,
        Recovery,
        Monad,
        Returning
    }

    struct State {
        Execution execution;
        bool starting;
        address market;
        IMonadPressure pressureSource;
        bool financeSealed;
        uint64 changedAt;
        bytes32 reason;
    }
    bytes32 constant SLOT = keccak256("pongit.autonomous.non-delegated.control.v1");

    function state() internal pure returns (State storage s) {
        bytes32 slot = SLOT;
        assembly { s.slot := slot }
    }
}
