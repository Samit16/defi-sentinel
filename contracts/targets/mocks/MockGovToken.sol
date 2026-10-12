// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockERC20.sol";

/// @title MockGovToken
/// @notice Governance token with checkpointed balance snapshots for historical voting power lookups.
/// @dev Extends MockERC20 with block-level balance checkpoints inspired by ERC20Votes.
contract MockGovToken is MockERC20 {
    struct Checkpoint {
        uint32 fromBlock;
        uint224 votes;
    }

    mapping(address => Checkpoint[]) private _checkpoints;

    event DelegateVotesChanged(address indexed account, uint256 previousBalance, uint256 newBalance);

    constructor(string memory _name, string memory _symbol) MockERC20(_name, _symbol, 18) {}

    /// @notice Returns the number of checkpoints for a given account
    function numCheckpoints(address account) external view returns (uint32) {
        return uint32(_checkpoints[account].length);
    }

    /// @notice Returns the historical votes / balance of account at a specific past block
    function getPastVotes(address account, uint256 blockNumber) public view returns (uint256) {
        require(blockNumber < block.number, "MockGovToken: block not yet mined");
        Checkpoint[] storage ckpts = _checkpoints[account];
        if (ckpts.length == 0) {
            return 0;
        }

        // Check if latest checkpoint is before or at the queried block
        if (ckpts[ckpts.length - 1].fromBlock <= blockNumber) {
            return ckpts[ckpts.length - 1].votes;
        }
        if (ckpts[0].fromBlock > blockNumber) {
            return 0;
        }

        // Binary search for checkpoint
        uint256 low = 0;
        uint256 high = ckpts.length - 1;
        while (high > low) {
            uint256 mid = (high + low + 1) / 2;
            if (ckpts[mid].fromBlock <= blockNumber) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return ckpts[low].votes;
    }

function _writeCheckpoint(address account, uint256 newBalance) internal {
    require(block.number <= type(uint32).max, "MockGovToken: block overflow");
    require(newBalance <= type(uint224).max, "MockGovToken: votes overflow");

    Checkpoint[] storage ckpts = _checkpoints[account];
    uint32 currentBlock = uint32(block.number);

    if (
        ckpts.length > 0 &&
        ckpts[ckpts.length - 1].fromBlock == currentBlock
    ) {
        ckpts[ckpts.length - 1].votes = uint224(newBalance);
    } else {
        ckpts.push(
            Checkpoint({
                fromBlock: currentBlock,
                votes: uint224(newBalance)
            })
        );
    }

    emit DelegateVotesChanged(account, balanceOf[account], newBalance);
}

    function mint(address to, uint256 amount) external override {
        totalSupply += amount;
        balanceOf[to] += amount;
        _writeCheckpoint(to, balanceOf[to]);
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, to, amount);
        _writeCheckpoint(msg.sender, balanceOf[msg.sender]);
        _writeCheckpoint(to, balanceOf[to]);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            unchecked {
                allowance[from][msg.sender] = currentAllowance - amount;
            }
        }
        _transfer(from, to, amount);
        _writeCheckpoint(from, balanceOf[from]);
        _writeCheckpoint(to, balanceOf[to]);
        return true;
    }
}
