// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Types} from "./Types.sol";

/// @notice What the hub is allowed to call on an app. Nothing else crosses the boundary.
/// @dev The EVM has no way for one contract to write another's storage, so the app must keep
///      this narrow, hub-only door open. Everything heavy lives in the hub.
interface IDelegatableApp {
    /// @notice Apply committed state diffs. The hub has already checked slot permissions.
    function applyDelegatedDiffs(Types.SlotDiff[] calldata diffs) external;

    /// @notice Undo a batch: write each slot's `oldValue` back.
    /// @dev Called newest-batch-first after fraud is confirmed. The hub has already checked
    ///      the list against the fold it stored, so a write that landed after undelegate does
    ///      not block the repair: that write sat on a fraudulent baseline.
    function revertDelegatedDiffs(Types.SlotDiff[] calldata diffs) external;

    /// @notice Write `value` into `slot` without checking what is there.
    /// @dev Used after a confirmed slash to restore overlay slots the unwind list did not
    ///      name — a write that landed after undelegate on a slot an earlier honest batch
    ///      owned. The hub already knows the value from the overlay it stored at commit.
    function syncDelegatedSlot(bytes32 slot, bytes32 value) external;

    /// @notice Flip the app's local lock so `whenNotDelegated` stays a cheap storage read.
    function onDelegationChanged(bytes32 partition, bool delegated) external;
}
