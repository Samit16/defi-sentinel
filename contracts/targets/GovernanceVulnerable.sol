// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./mocks/MockGovToken.sol";

/// @title GovernanceVulnerable
/// @notice DAO governance contract vulnerable to flash-loan vote hijacking.
/// @dev INTENTIONAL VULNERABILITY: Uses live token balance (balanceOf) rather than a historical snapshot.
///      An attacker can borrow tokens, vote, pass a proposal to drain the treasury, and return the loan in one transaction.
contract GovernanceVulnerable {
    MockGovToken public immutable govToken;
    uint256 public constant QUORUM = 100_000 * 1e18;

    struct Proposal {
        address recipient;
        uint256 amount;
        uint256 votes;
        bool executed;
    }

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed proposalId, address recipient, uint256 amount);
    event VoteCast(uint256 indexed proposalId, address voter, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId, address recipient, uint256 amount);

    constructor(address _govToken) payable {
        govToken = MockGovToken(_govToken);
    }

    /// @notice Allows funding the DAO treasury
    receive() external payable {}

    /// @notice Creates a governance proposal to transfer treasury funds
    function propose(address recipient, uint256 amount) external returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(amount <= address(this).balance, "Amount exceeds treasury");

        uint256 proposalId = proposals.length;
        proposals.push(Proposal({
            recipient: recipient,
            amount: amount,
            votes: 0,
            executed: false
        }));

        emit ProposalCreated(proposalId, recipient, amount);
        return proposalId;
    }

    /// @notice Casts vote on a proposal using live token balance
    function castVote(uint256 proposalId) external {
        require(proposalId < proposals.length, "Invalid proposal");
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Proposal already executed");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        // Intentional Bug: Counts live token balance as voting power
        uint256 votes = govToken.balanceOf(msg.sender);
        require(votes > 0, "No voting weight");

        hasVoted[proposalId][msg.sender] = true;
        proposal.votes += votes;

        emit VoteCast(proposalId, msg.sender, votes);
    }

    /// @notice Executes proposal immediately once quorum is reached
    function execute(uint256 proposalId) external {
        require(proposalId < proposals.length, "Invalid proposal");
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Already executed");
        require(proposal.votes >= QUORUM, "Quorum not met");

        proposal.executed = true;

        (bool success, ) = proposal.recipient.call{value: proposal.amount}("");
        require(success, "Treasury transfer failed");

        emit ProposalExecuted(proposalId, proposal.recipient, proposal.amount);
    }
}
