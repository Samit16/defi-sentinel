// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./mocks/MockERC20.sol";
import "./SimpleAMM.sol";

/// @title LendingProtected
/// @notice Secure lending pool using TWAP and price-deviation circuit breaker.
/// @dev DEFENSE: Replaces instantaneous spot price with TWAP oracle and enforces a 5%
///      maximum price deviation tolerance between spot and TWAP to block manipulation.
contract LendingProtected {
    MockERC20 public immutable collateralToken;
    MockERC20 public immutable borrowToken;
    SimpleAMM public immutable amm;

    uint256 public constant LTV = 75; // 75% loan-to-value ratio
    uint256 public constant MAX_DEVIATION_PCT = 5; // Maximum 5% deviation allowed

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
    require(amount > 0, "Invalid liquidity amount");
    require(
        borrowToken.transferFrom(msg.sender, address(this), amount),
        "Borrow token transfer failed"
    );
    emit LiquiditySupplied(msg.sender, amount);
}

    /// @notice Deposits collateral token
    function depositCollateral(uint256 amount) external {
    require(amount > 0, "Invalid collateral amount");
    require(
        collateralToken.transferFrom(msg.sender, address(this), amount),
        "Collateral transfer failed"
    );
    collateralDeposited[msg.sender] += amount;
    emit CollateralDeposited(msg.sender, amount);
}

    /// @notice Validates the spot price against the last completed TWAP.
    function getSafePrice() public view returns (uint256) {
        uint256 spotPrice = amm.getSpotPrice();
        uint256 twapPrice = amm.getTWAP();
        require(twapPrice > 0, "Invalid TWAP price");
        uint256 diff = spotPrice > twapPrice
            ? spotPrice - twapPrice
            : twapPrice - spotPrice;

        require(
            (diff * 100) <= twapPrice * MAX_DEVIATION_PCT,
            "Price deviation exceeds threshold: oracle manipulated"
        );
        return twapPrice;
    }

    /// @notice Borrows borrowToken against deposited collateral using validated price
    function borrow(uint256 amount) external {
    require(amount > 0, "Invalid borrow amount");
    require(
        borrowToken.balanceOf(address(this)) >= amount,
        "Insufficient pool liquidity"
    );

    uint256 safePrice = getSafePrice();
    uint256 collateralValue =
        (collateralDeposited[msg.sender] * safePrice) / 1e18;
    uint256 maxBorrow = (collateralValue * LTV) / 100;

    require(
        borrowedAmount[msg.sender] + amount <= maxBorrow,
        "Borrow exceeds collateral limit"
    );

    borrowedAmount[msg.sender] += amount;

    require(
        borrowToken.transfer(msg.sender, amount),
        "Borrow token transfer failed"
    );

    emit Borrowed(msg.sender, amount);
}
}
