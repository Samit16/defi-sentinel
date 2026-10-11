// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VaultProtected
/// @notice Secure ETH vault implementing defensive measures against reentrancy.
/// @dev DEFENSE: Adheres to Checks-Effects-Interactions (CEI) by zeroing balance prior
///      to transferring funds, combined with an explicit nonReentrant reentrancy lock.
contract VaultProtected {
    mapping(address => uint256) public balances;
    bool private _locked;

    modifier nonReentrant() {
        require(!_locked, "ReentrancyGuard: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    function deposit() external payable {
        require(msg.value > 0, "Deposit must be > 0");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance to withdraw");

        // Protected: State is updated BEFORE any external interaction
        balances[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    receive() external payable {
        balances[msg.sender] += msg.value;
    }
}
