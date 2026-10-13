// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./mocks/MockERC20.sol";
import "./SimpleAMM.sol";

/// @title LendingVulnerable
/// @notice Lending pool using AMM instantaneous spot price to value collateral.
/// @dev INTENTIONAL VULNERABILITY: Valuing collateral directly from spot price allows attackers
///      to skew the pool via swaps or flash loans, overborrow, and drain pool assets.
contract LendingVulnerable {
    MockERC20 public immutable collateralToken;
    MockERC20 public immutable borrowToken;
    SimpleAMM public immutable amm;

    uint256 public constant LTV = 75; // 75% loan-to-value ratio

    mapping(address => uint256) public collateralDeposited;
    mapping(address => uint256) public borrowedAmount;

    event CollateralDeposited(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event LiquiditySupplied(address indexed supplier, uint256 amount);

    constructor(
    address _collateralToken,
    address _borrowToken,
    address _amm
) {
    require(
        _collateralToken != address(0) &&
        _borrowToken != address(0) &&
        _amm != address(0),
        "Invalid dependency address"
    );
    require(
        _collateralToken != _borrowToken,
        "Tokens must differ"
    );

    collateralToken = MockERC20(_collateralToken);
    borrowToken = MockERC20(_borrowToken);
    amm = SimpleAMM(_amm);
}

    /// @notice Supplies borrowToken liquidity to the lending pool
    function supplyBorrowLiquidity(uint256 amount) external {
        borrowToken.transferFrom(msg.sender, address(this), amount);
        emit LiquiditySupplied(msg.sender, amount);
    }

    /// @notice Deposits collateral token
    function depositCollateral(uint256 amount) external {
        require(amount > 0, "Invalid collateral amount");
        collateralToken.transferFrom(msg.sender, address(this), amount);
        collateralDeposited[msg.sender] += amount;
        emit CollateralDeposited(msg.sender, amount);
    }

    /// @notice Borrows borrowToken against deposited collateral
    function borrow(uint256 amount) external {
        require(amount > 0, "Invalid borrow amount");
        require(borrowToken.balanceOf(address(this)) >= amount, "Insufficient pool liquidity");

        // Intentional Bug: Uses instantaneous spot price directly from AMM
        uint256 spotPrice = amm.getSpotPrice();
        uint256 collateralValue = (collateralDeposited[msg.sender] * spotPrice) / 1e18;
        uint256 maxBorrow = (collateralValue * LTV) / 100;

        require(borrowedAmount[msg.sender] + amount <= maxBorrow, "Borrow exceeds collateral limit");

        borrowedAmount[msg.sender] += amount;
        borrowToken.transfer(msg.sender, amount);

        emit Borrowed(msg.sender, amount);
    }
}
