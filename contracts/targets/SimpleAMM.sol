// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./mocks/MockERC20.sol";

/// @title SimpleAMM
/// @notice Constant-product (x * y = k) Automated Market Maker exposing instantaneous spot price and TWAP.
/// @dev Used as a price oracle source to demonstrate oracle manipulation vulnerabilities.
contract SimpleAMM {
    MockERC20 public immutable token0;
    MockERC20 public immutable token1;

    uint256 public reserve0;
    uint256 public reserve1;

    uint256 public twapPrice;
    uint256 public lastBlockTimestamp;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Swap(address indexed sender, address tokenIn, uint256 amountIn, uint256 amountOut);
    event TwapUpdated(uint256 newTwapPrice, uint256 timestamp);

    constructor(address _token0, address _token1) {
        token0 = MockERC20(_token0);
        token1 = MockERC20(_token1);
        lastBlockTimestamp = block.timestamp;
    }

    /// @notice Adds liquidity to the AMM pool
    function addLiquidity(uint256 amount0, uint256 amount1) external {
        require(amount0 > 0 && amount1 > 0, "Invalid liquidity amounts");
        token0.transferFrom(msg.sender, address(this), amount0);
        token1.transferFrom(msg.sender, address(this), amount1);

        reserve0 += amount0;
        reserve1 += amount1;

        if (twapPrice == 0) {
            twapPrice = (reserve1 * 1e18) / reserve0;
            lastBlockTimestamp = block.timestamp;
        }

        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Returns instantaneous spot price of token0 denominated in token1 (with 18 decimals)
    /// @dev Vulnerable to flash loan and single-transaction manipulation!
    function getSpotPrice() public view returns (uint256) {
        require(reserve0 > 0, "Reserve0 empty");
        return (reserve1 * 1e18) / reserve0;
    }

    /// @notice Returns time-weighted average price (TWAP)
    /// @dev Resists single-transaction or intra-block manipulation.
    function getTWAP() external view returns (uint256) {
        return twapPrice == 0 ? getSpotPrice() : twapPrice;
    }

    /// @notice Updates the TWAP checkpoint if time has elapsed
    function updateTWAP() external {
        if (block.timestamp > lastBlockTimestamp) {
            twapPrice = getSpotPrice();
            lastBlockTimestamp = block.timestamp;
            emit TwapUpdated(twapPrice, block.timestamp);
        }
    }

    /// @notice Swaps tokenIn for the other token using constant product formula
    function swap(address tokenIn, uint256 amountIn) external returns (uint256 amountOut) {
        require(tokenIn == address(token0) || tokenIn == address(token1), "Invalid token");
        require(amountIn > 0, "Zero input amount");

        bool isToken0 = tokenIn == address(token0);
        MockERC20 inputToken = isToken0 ? token0 : token1;
        MockERC20 outputToken = isToken0 ? token1 : token0;

        uint256 reserveIn = isToken0 ? reserve0 : reserve1;
        uint256 reserveOut = isToken0 ? reserve1 : reserve0;

        inputToken.transferFrom(msg.sender, address(this), amountIn);

        // Constant product formula with 0.3% fee: dy = (y * dx * 997) / (x * 1000 + dx * 997)
        uint256 amountInWithFee = amountIn * 997;
        amountOut = (amountInWithFee * reserveOut) / ((reserveIn * 1000) + amountInWithFee);
        require(amountOut > 0, "Insufficient output amount");

        if (isToken0) {
            reserve0 += amountIn;
            reserve1 -= amountOut;
        } else {
            reserve1 += amountIn;
            reserve0 -= amountOut;
        }

        outputToken.transfer(msg.sender, amountOut);
        emit Swap(msg.sender, tokenIn, amountIn, amountOut);
    }
}
