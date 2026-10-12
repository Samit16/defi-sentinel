// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./mocks/MockGovToken.sol";

/// @title GovernanceProtected
/// @notice Secure DAO governance contract using snapshot voting power from past blocks.
/// @dev DEFENSE: Determines voting power using getPastVotes() from a prior snapshot block,
///      and enforces a voting period so proposals cannot be passed and executed atomically.
contract GovernanceProtected {
    MockGovToken public immutable govToken;
    uint256 public constant QUORUM = 100_000 * 1e18;

    struct Proposal {
        address recipient;
        uint256 amount;
        uint256 votes;
        uint256 snapshotBlock;
        uint256 startBlock;
        uint256 endBlock;
        bool executed;
    }

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed proposalId, address recipient, uint256 amount, uint256 snapshotBlock);
    event VoteCast(uint256 indexed proposalId, address voter, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId, address recipient, uint256 amount);

    constructor(address _govToken) payable {
        govToken = MockGovToken(_govToken);
    }

    /// @notice Allows funding the DAO treasury
    receive() external payable {}

    /// @notice Creates a proposal locking the snapshot block to the previous block
    function propose(address recipient, uint256 amount) external returns (uint256) {

        // Ensure the proposer has sufficient voting power at the snapshot block
        uint256 proposalThreshold = 1_000 ether;
        uint256 proposerVotes = govToken.getPastVotes(msg.sender, block.number - 1);
    require(
    proposerVotes >= proposalThreshold,
    "Proposer below proposal threshold"
);
        require(recipient != address(0), "Invalid recipient");
        require(amount <= address(this).balance, "Amount exceeds treasury");
        require(block.number > 0, "Genesis block not allowed");

        uint256 proposalId = proposals.length;
        proposals.push(Proposal({
            recipient: recipient,
            amount: amount,
            votes: 0,
            snapshotBlock: block.number - 1,
            startBlock: block.number + 1,
            endBlock: block.number + 5,
            executed: false
        }));

        emit ProposalCreated(proposalId, recipient, amount, block.number - 1);
        return proposalId;
    }

    /// @notice Casts vote using historical snapshot voting power
    function castVote(uint256 proposalId) external {
        require(proposalId < proposals.length, "Invalid proposal");
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Proposal already executed");
        require(!hasVoted[proposalId][msg.sender], "Already voted");
        require(block.number >= proposal.startBlock, "Voting has not started");
        require(block.number <= proposal.endBlock, "Voting period ended");

        // Protected: Query voting power at the proposal's snapshot block
        uint256 votes = govToken.getPastVotes(msg.sender, proposal.snapshotBlock);
        require(votes > 0, "No snapshot voting weight from past block");

        hasVoted[proposalId][msg.sender] = true;
        proposal.votes += votes;

        emit VoteCast(proposalId, msg.sender, votes);
    }

    /// @notice Executes proposal only after voting period and if quorum is reached
    function execute(uint256 proposalId) external {
        require(proposalId < proposals.length, "Invalid proposal");
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Already executed");
        require(block.number > proposal.endBlock, "Voting period still active");
        require(proposal.votes >= QUORUM, "Quorum not met");

        proposal.executed = true;

        (bool success, ) = proposal.recipient.call{value: proposal.amount}("");
        require(success, "Treasury transfer failed");

        emit ProposalExecuted(proposalId, proposal.recipient, proposal.amount);
    }
}
