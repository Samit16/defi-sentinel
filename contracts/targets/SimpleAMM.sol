
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./mocks/MockERC20.sol";

/// @title SimpleAMM
/// @notice Constant-product AMM with a cumulative-price TWAP oracle.
/// @dev Educational simulation. Not intended for production use.
contract SimpleAMM {
    MockERC20 public immutable token0;
    MockERC20 public immutable token1;

    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public constant MAX_TWAP_UPDATE_DEVIATION_PCT = 5;

    uint256 public price0CumulativeLast;
    uint256 public twapPrice;
    uint256 public lastTimestamp;
    uint256 public twapTimestampLast;
    uint256 public twapCumulativeLast;

    uint256 public constant MIN_TWAP_WINDOW = 30 minutes;
    uint256 public constant MAX_TWAP_STALENESS = 2 hours;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Swap(address indexed sender, address tokenIn, uint256 amountIn, uint256 amountOut);
    event TwapUpdated(uint256 newTwapPrice, uint256 timestamp);

    constructor(address _token0, address _token1) {
    require(
        _token0 != address(0) && _token1 != address(0),
        "Invalid token address"
    );
    require(_token0 != _token1, "Tokens must differ");
    token0 = MockERC20(_token0);
    token1 = MockERC20(_token1);
    lastTimestamp = block.timestamp;
}

    /// @dev Accumulates the old reserve price before reserves change.
    function _accumulatePrice() internal {
        uint256 elapsed = block.timestamp - lastTimestamp;

        if (elapsed > 0 && reserve0 > 0 && reserve1 > 0) {
            price0CumulativeLast += getSpotPrice() * elapsed;
        }

        lastTimestamp = block.timestamp;
    }

    function addLiquidity(uint256 amount0, uint256 amount1) external {
        require(amount0 > 0 && amount1 > 0, "Invalid liquidity amounts");

        _accumulatePrice();

        require(token0.transferFrom(msg.sender, address(this), amount0), "Token0 transfer failed");
        require(token1.transferFrom(msg.sender, address(this), amount1), "Token1 transfer failed");

        reserve0 += amount0;
        reserve1 += amount1;

        if (twapTimestampLast == 0) {
            twapTimestampLast = block.timestamp;
            twapCumulativeLast = price0CumulativeLast;
        }

        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Instantaneous token0 price denominated in token1, scaled by 1e18.
    function getSpotPrice() public view returns (uint256) {
        require(reserve0 > 0, "Reserve0 empty");
        return (reserve1 * 1e18) / reserve0;
    }

    /// @notice Returns the last completed TWAP observation.
    function getTWAP() external view returns (uint256) {
        require(twapPrice > 0, "TWAP not initialized");
        require(
            block.timestamp - twapTimestampLast <= MAX_TWAP_STALENESS,
            "TWAP observation stale"
        );
        return twapPrice;
    }

    /// @notice Updates TWAP only after the minimum observation window.
    /// @dev Price accumulation uses the reserves that existed during each elapsed interval.
    function updateTWAP() external {
    _accumulatePrice();

    require(twapTimestampLast > 0, "TWAP not initialized");

    uint256 elapsed = block.timestamp - twapTimestampLast;
    require(elapsed >= MIN_TWAP_WINDOW, "TWAP window too short");

    // Reject updates when the current spot price deviates
    // excessively from the previously accepted TWAP.
    if (twapPrice > 0) {
        uint256 spotPrice = getSpotPrice();

        uint256 diff = spotPrice > twapPrice
            ? spotPrice - twapPrice
            : twapPrice - spotPrice;

        require(
            diff * 100 <=
                twapPrice * MAX_TWAP_UPDATE_DEVIATION_PCT,
            "TWAP update exceeds deviation threshold"
        );
    }

    uint256 cumulativeDelta =
        price0CumulativeLast - twapCumulativeLast;

    uint256 newTwapPrice = cumulativeDelta / elapsed;

    require(newTwapPrice > 0, "Invalid TWAP price");

    twapPrice = newTwapPrice;
    twapCumulativeLast = price0CumulativeLast;
    twapTimestampLast = block.timestamp;

    emit TwapUpdated(newTwapPrice, block.timestamp);
}

    function swap(address tokenIn, uint256 amountIn) external returns (uint256 amountOut) {
        require(tokenIn == address(token0) || tokenIn == address(token1), "Invalid token");
        require(amountIn > 0, "Zero input amount");

        bool isToken0 = tokenIn == address(token0);
        MockERC20 inputToken = isToken0 ? token0 : token1;
        MockERC20 outputToken = isToken0 ? token1 : token0;

        uint256 reserveIn = isToken0 ? reserve0 : reserve1;
        uint256 reserveOut = isToken0 ? reserve1 : reserve0;

        amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997);
        require(amountOut > 0, "Insufficient output amount");
        require(amountOut < reserveOut, "Insufficient reserves");

        _accumulatePrice();

        require(inputToken.transferFrom(msg.sender, address(this), amountIn), "Input transfer failed");
        require(outputToken.transfer(msg.sender, amountOut), "Output transfer failed");

        if (isToken0) {
            reserve0 += amountIn;
            reserve1 -= amountOut;
        } else {
            reserve1 += amountIn;
            reserve0 -= amountOut;
        }

        emit Swap(msg.sender, tokenIn, amountIn, amountOut);
    }
}
