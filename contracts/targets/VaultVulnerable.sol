// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VaultVulnerable
/// @notice Simple ETH vault vulnerable to classic reentrancy attacks.
/// @dev INTENTIONAL VULNERABILITY: External call happens before balances are updated,
///      violating the Checks-Effects-Interactions pattern and omitting a reentrancy guard.
contract VaultVulnerable {
    mapping(address => uint256) public balances;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    function deposit() external payable {
        require(msg.value > 0, "Deposit must be > 0");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance to withdraw");

        // Intentional Bug: Sends ETH before zeroing balance
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        balances[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
    }

    receive() external payable {
        balances[msg.sender] += msg.value;
    }
}
