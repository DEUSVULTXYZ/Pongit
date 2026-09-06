// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Fixed-beneficiary native payouts. A rejected transfer never forfeits the debt.
abstract contract NativePayouts is ReentrancyGuard {
    uint256 internal constant PAYOUT_CALL_GAS = 50_000;
    struct Payout { address recipient; uint256 amount; uint8 status; uint32 attempts; }
    mapping(bytes32 => Payout) public payouts;
    uint256 public totalPendingPayouts;
    event PayoutCreated(bytes32 indexed payoutId, uint256 indexed sourceId, address indexed recipient, uint8 kind, uint256 amount);
    event PayoutPaid(bytes32 indexed payoutId, address indexed recipient, uint256 amount);
    event PayoutDeferred(bytes32 indexed payoutId, address indexed recipient, uint256 amount, uint32 attempts);

    function payoutId(uint8 kind, uint256 sourceId, address recipient) public pure returns (bytes32) {
        return keccak256(abi.encode(kind, sourceId, recipient));
    }

    /// @dev Called only inside a nonReentrant accounting transition. kind: bet=0, prize=1, entry refund=2, seed refund=3.
    function _schedulePayout(uint8 kind, uint256 sourceId, address recipient, uint256 amount) internal {
        bytes32 id = payoutId(kind, sourceId, recipient);
        require(recipient != address(0) && payouts[id].status == 0, "payout exists");
        payouts[id] = Payout(recipient, amount, 1, 0);
        totalPendingPayouts += amount;
        emit PayoutCreated(id, sourceId, recipient, kind, amount);
        _attemptPayout(id);
    }

    function retryPayout(bytes32 id) external nonReentrant {
        require(payouts[id].status == 1, "not pending");
        _attemptPayout(id);
    }

    function _attemptPayout(bytes32 id) private {
        Payout storage p = payouts[id];
        // Make gas estimation preserve the receiver allowance and the post-call bookkeeping.
        require(gasleft() >= PAYOUT_CALL_GAS + 70_000, "payout gas");
        p.attempts++;
        bool paid = p.amount == 0;
        if (!paid) (paid,) = payable(p.recipient).call{value: p.amount, gas: PAYOUT_CALL_GAS}("");
        if (paid) {
            p.status = 2;
            totalPendingPayouts -= p.amount;
            emit PayoutPaid(id, p.recipient, p.amount);
        } else {
            emit PayoutDeferred(id, p.recipient, p.amount, p.attempts);
        }
    }
}
