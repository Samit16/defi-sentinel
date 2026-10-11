// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./mocks/MockERC20.sol";

/// @notice Interface for flash loan receivers
interface IFlashBorrower {
    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external returns (bytes32);
}

/// @title FlashLender
/// @notice Simple uncollateralized flash loan provider.
/// @dev Borrows require returning principal plus fee in the same transaction.
contract FlashLender {
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");
    uint256 public constant FEE_BPS = 9; // 0.09% fee

    event FlashLoan(address indexed receiver, address indexed token, uint256 amount, uint256 fee);

    /// @notice Issues a flash loan to the receiver
    function flashLoan(
        IFlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool) {
        MockERC20 tokenContract = MockERC20(token);
        uint256 balanceBefore = tokenContract.balanceOf(address(this));
        require(balanceBefore >= amount, "FlashLender: not enough liquidity");

        uint256 fee = (amount * FEE_BPS) / 10000;

        // Transfer funds to receiver
        tokenContract.transfer(address(receiver), amount);

        // Execute receiver callback
        bytes32 callbackResult = receiver.onFlashLoan(msg.sender, token, amount, fee, data);
        require(callbackResult == CALLBACK_SUCCESS, "FlashLender: invalid callback return");

        // Verify repayment plus fee
        uint256 balanceAfter = tokenContract.balanceOf(address(this));
        require(balanceAfter >= balanceBefore + fee, "FlashLender: flash loan not repaid with fee");

        emit FlashLoan(address(receiver), token, amount, fee);
        return true;
    }
}
