// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Vote {
    address public owner;
    uint256 public candidatesCount;
    uint256 public totalVotes;
    
    mapping(uint256 => string) public candidateNames;
    mapping(uint256 => uint256) public candidateVotes;
    mapping(address => uint256) public lastVoteTime;
    
    uint256 public constant COOLDOWN = 1 minutes;
    
    event VoteCast(address indexed voter, uint256 indexed candidateId, uint256 timestamp);
    event CandidateAdded(uint256 indexed candidateId, string name);
    
    constructor() {
        owner = msg.sender;
        candidatesCount = 0;
        totalVotes = 0;
    }
    
    function addCandidate(string memory _name) external {
        require(msg.sender == owner, "Seul le proprietaire peut ajouter un candidat");
        require(bytes(_name).length > 0, "Le nom ne peut pas etre vide");
        
        candidateNames[candidatesCount] = _name;
        candidateVotes[candidatesCount] = 0;
        
        emit CandidateAdded(candidatesCount, _name);
        candidatesCount++;
    }
    
    function getCandidate(uint256 _candidateId) external view returns (string memory name, uint256 votes) {
        require(_candidateId < candidatesCount, "ID candidat invalide");
        return (candidateNames[_candidateId], candidateVotes[_candidateId]);
    }
    
    function getTotalVotes() external view returns (uint256) {
        return totalVotes;
    }
    
    function getTimeUntilNextVote(address _voter) external view returns (uint256) {
        if (lastVoteTime[_voter] == 0) {
            return 0;
        }
        uint256 timeElapsed = block.timestamp - lastVoteTime[_voter];
        if (timeElapsed >= COOLDOWN) {
            return 0;
        }
        return COOLDOWN - timeElapsed;
    }
    
    function getWinner() external view returns (uint256 winnerId, string memory winnerName, uint256 winnerVotes) {
        require(candidatesCount > 0, "Aucun candidat");
        
        uint256 maxVotes = 0;
        uint256 winner = 0;
        
        for (uint256 i = 0; i < candidatesCount; i++) {
            if (candidateVotes[i] > maxVotes) {
                maxVotes = candidateVotes[i];
                winner = i;
            }
        }
        
        return (winner, candidateNames[winner], maxVotes);
    }
    
    function vote(uint256 _candidateId) external {
        require(_candidateId < candidatesCount, "ID candidat invalide");
        require(
            block.timestamp >= lastVoteTime[msg.sender] + COOLDOWN,
            "Attendez 1 minute entre deux votes"
        );
        
        candidateVotes[_candidateId]++;
        totalVotes++;
        lastVoteTime[msg.sender] = block.timestamp;
        
        emit VoteCast(msg.sender, _candidateId, block.timestamp);
    }
    
    function voteWithValue(uint256 _candidateId) external payable {
        require(msg.value > 0, "Envoyez de l'ETH pour voter");
        require(_candidateId < candidatesCount, "ID candidat invalide");
        require(
            block.timestamp >= lastVoteTime[msg.sender] + COOLDOWN,
            "Attendez 1 minute entre deux votes"
        );
        
        candidateVotes[_candidateId]++;
        totalVotes++;
        lastVoteTime[msg.sender] = block.timestamp;
        
        emit VoteCast(msg.sender, _candidateId, block.timestamp);
    }
}
