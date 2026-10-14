
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockERC20.sol";

/// @title MockGovToken
/// @notice Governance token with block-level historical balance checkpoints.
/// @dev Educational mock; voting power follows balances without delegation.
contract MockGovToken is MockERC20 {
    struct Checkpoint {
        uint32 fromBlock;
        uint224 votes;
    }

    mapping(address => Checkpoint[]) private _checkpoints;

    event DelegateVotesChanged(
        address indexed account,
        uint256 previousBalance,
        uint256 newBalance
    );

    constructor(string memory _name, string memory _symbol)
        MockERC20(_name, _symbol, 18)
    {}

    function numCheckpoints(address account)
        external
        view
        returns (uint32)
    {
        return uint32(_checkpoints[account].length);
    }

    function getPastVotes(address account, uint256 blockNumber)
        public
        view
        returns (uint256)
    {
        require(
            blockNumber < block.number,
            "MockGovToken: block not yet mined"
        );

        Checkpoint[] storage ckpts = _checkpoints[account];

        if (ckpts.length == 0 || ckpts[0].fromBlock > blockNumber) {
            return 0;
        }

        if (ckpts[ckpts.length - 1].fromBlock <= blockNumber) {
            return ckpts[ckpts.length - 1].votes;
        }

        uint256 low = 0;
        uint256 high = ckpts.length - 1;

        while (high > low) {
            uint256 mid = (low + high + 1) / 2;

            if (ckpts[mid].fromBlock <= blockNumber) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }

        return ckpts[low].votes;
    }

    function _writeCheckpoint(
        address account,
        uint256 previousBalance,
        uint256 newBalance
    ) internal {
        require(
            block.number <= type(uint32).max,
            "MockGovToken: block overflow"
        );
        require(
            newBalance <= type(uint224).max,
            "MockGovToken: votes overflow"
        );

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

        emit DelegateVotesChanged(
            account,
            previousBalance,
            newBalance
        );
    }

    function mint(address to, uint256 amount) external override {
        uint256 previousBalance = balanceOf[to];

        totalSupply += amount;
        balanceOf[to] += amount;

        _writeCheckpoint(to, previousBalance, balanceOf[to]);
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount)
        external
        override
        returns (bool)
    {
        uint256 previousFrom = balanceOf[msg.sender];
        uint256 previousTo = balanceOf[to];

        _transfer(msg.sender, to, amount);

        _writeCheckpoint(
            msg.sender,
            previousFrom,
            balanceOf[msg.sender]
        );

        if (to != msg.sender) {
            _writeCheckpoint(to, previousTo, balanceOf[to]);
        }

        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        override
        returns (bool)
    {
        uint256 currentAllowance = allowance[from][msg.sender];

        if (currentAllowance != type(uint256).max) {
            require(
                currentAllowance >= amount,
                "ERC20: insufficient allowance"
            );

            unchecked {
                allowance[from][msg.sender] = currentAllowance - amount;
            }
        }

        uint256 previousFrom = balanceOf[from];
        uint256 previousTo = balanceOf[to];

        _transfer(from, to, amount);

        _writeCheckpoint(from, previousFrom, balanceOf[from]);

        if (to != from) {
            _writeCheckpoint(to, previousTo, balanceOf[to]);
        }

        return true;
    }
}
