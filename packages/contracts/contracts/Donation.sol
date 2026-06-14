// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Donation{

    address public contractOwner;
    uint256 public donationGoal;
    uint256 public totalDonations;
    string public description;
    uint256 public start;
    uint256 public end;

    //solidity has no decimal numbers, so we use these variables to calculate percentages
    uint256 constant basepoints = 10000;

    mapping(address => uint256) public donations;
    address[] public validators;
    mapping(address => bool) public isValidator;

    mapping(uint256 => Milestone) public milestones;
    mapping(uint256 => mapping(address => bool)) public votesForMilestone;
    mapping(uint256 => mapping(address => bool)) hasVoted;

    struct Milestone{
        uint16 percentage;
        uint16 approvedCount;
        uint16 rejectedCount;
        bool paid;
    }

    uint256 public neededVoteMajorityInBps = 667;

    //events create log entries on blockchain
    //indexed address enables efficient search for donations from a specifc donor 
    event DonationReceived(
        address indexed donor,
        uint256 amount
    );

    event VoteSubmitted(
        address indexed validator,
        uint256 milestoneIndex,
        bool approved
    );

    constructor(uint256 goal, address[] memory validators_, string memory description_, uint256 duration, uint16[] memory milestonePercentages){
        donationGoal = goal;
        validators = validators_;
        for(uint i = 0; i < validators_.length; i++){
            isValidator[validators_[i]] = true;
        }
        description = description_;
        contractOwner = msg.sender;
        start = block.timestamp;
        end = block.timestamp + duration;

        for(uint i = 0; i < milestonePercentages.length; i++){
            milestones[i] = Milestone(milestonePercentages[i], 0, 0, false);
        }

    } 

    function donate() external payable isPositiveDonation(msg.value) isInTimeFrame(){
        uint256 donation = msg.value;

        totalDonations += donation;
        donations[msg.sender] += donation;

        emit DonationReceived(msg.sender, msg.value);
    }

    function voteMilestone(uint milestoneIndex, bool vote) external isAllowedToVote{
        require(!hasVoted[milestoneIndex][msg.sender]);
        hasVoted[milestoneIndex][msg.sender] = true;
        votesForMilestone[milestoneIndex][msg.sender] = vote;

        emit VoteSubmitted(msg.sender, milestoneIndex, vote);
    }

    function payout(uint milestoneIndex) public isApproved(milestoneIndex){
        require(!milestones[milestoneIndex].paid);
        payable(contractOwner).transfer(address(this).balance);
    }

    modifier isPositiveDonation(uint256 x){
        require(x > 0, "only positive values can be donated");
        _;
    }

    modifier isInTimeFrame(){
        require(block.timestamp >= start && block.timestamp <= end, "not in timeframe");
        _;
    }

    modifier isAllowedToVote(){
        require(isValidator[msg.sender] == true);
        _;
    }

    modifier isApproved(uint256 milestoneIndex){
        require(calculatePercentageInBps(milestones[milestoneIndex].approvedCount, validators.length) >=  neededVoteMajorityInBps);
        _;
    }
    function getContractBalance() external view returns (uint256){
        return address(this).balance;
    }

    function getValidator(uint256 x) external view returns (address){
        return validators[x];
    }

    //no decimal numbers so we need basepoints
    //basepoints is 100%
    //if basepoints = 10000, then 1% = 100bps
    function calculatePortion(uint256 value, uint256 bsp)internal pure returns (uint256) {
        return (value * bsp) / basepoints;
    }

    function calculatePercentageInBps(uint256 value, uint256 total)internal pure returns (uint256) {
        return (value * basepoints) / total;
    }
}