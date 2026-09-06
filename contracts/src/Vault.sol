// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Native MON balances. The two immutable application modules enforce signed spending.
/// Module registration must be modulesSealed during deployment; no later admin can add a spending module.
contract Vault is EIP712, ReentrancyGuard {
    address public immutable administrator;
    bool public modulesSealed;
    uint256 public moduleCount;
    mapping(address => bool) public modules;
    mapping(address => uint256) public balances;
    mapping(address => uint256) public nonces;
    uint256 public totalBalances;
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address player,address recipient,uint256 amount,uint256 nonce,uint64 deadline)");
    event BalanceChanged(address indexed player, uint256 balance);

    constructor(address admin) EIP712("PONG Vault", "1") {
        require(admin != address(0), "admin");
        administrator = admin;
    }

    function registerModule(address module) external {
        require(
            msg.sender == administrator && !modulesSealed && module.code.length > 0 && !modules[module]
                && moduleCount < 2,
            "registration"
        );
        modules[module] = true;
        moduleCount++;
    }

    function seal() external {
        require(msg.sender == administrator && moduleCount == 2, "seal");
        modulesSealed = true;
    }

    function depositFor(address player) external payable {
        require(player != address(0), "player");
        balances[player] += msg.value;
        totalBalances += msg.value;
        emit BalanceChanged(player, balances[player]);
    }

    function debit(address player, uint256 amount) external nonReentrant {
        require(modulesSealed && modules[msg.sender] && balances[player] >= amount, "balance or module");
        balances[player] -= amount;
        totalBalances -= amount;
        emit BalanceChanged(player, balances[player]);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer");
    }

    function withdraw(
        address player,
        address payable recipient,
        uint256 amount,
        uint256 nonce,
        uint64 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(
            recipient != address(0) && amount > 0 && deadline >= block.timestamp && nonce == nonces[player]++,
            "withdraw bounds"
        );
        bytes32 hash =
            _hashTypedDataV4(keccak256(abi.encode(WITHDRAW_TYPEHASH, player, recipient, amount, nonce, deadline)));
        require(ECDSA.recover(hash, signature) == player && balances[player] >= amount, "signature or balance");
        balances[player] -= amount;
        totalBalances -= amount;
        emit BalanceChanged(player, balances[player]);
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "transfer");
    }
}
