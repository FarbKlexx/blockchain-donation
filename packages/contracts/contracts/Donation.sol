// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Donation{

    address public contractOwner;
    uint256 public donationGoal;
    uint256 public totalDonations;
    string public description;
    uint256 public start;
    uint256 public end;

    uint256 public totalPayout;

    //solidity has no decimal numbers, so we use these variables to calculate percentages
    uint256 constant basepoints = 10000;

    mapping(address => uint256) public donations;
    address[] public validators;
    mapping(address => bool) public isValidator;

    uint256 public milestoneCount;
    uint256 public currentMilestone;
    mapping(uint256 => Milestone) public milestones;
    mapping(uint256 => mapping(address => bool)) public votesForMilestone;
    mapping(uint256 => mapping(address => bool)) hasVoted;

    struct Milestone{
        uint16 percentage;
        bool readyToBeApproved;
        uint16 approvedCount;
        uint16 rejectedCount;
        bool paid;
    }

    Status public currentStatus;
    enum Status{
        Funding,
        Payout,
        Failed,
        Closed
    }

    enum FailureReason{
        None,
        NoFunding,
        RejectedByValidators,
        ClosedByOwner
    }

    uint256 public neededVoteMajorityInBps = 6666;

    event DonationReceived(
        address indexed donor,
        uint256 amount
    );

    event VoteSubmitted(
        address indexed validator,
        uint256 milestoneIndex,
        bool approved
    );

    event VotesEnabled(
        uint256 milestoneIndex
    );

    event PayoutMade(
        uint256 milestoneIndex,
        uint256 amount
    );

    event RestPayoutMade(
        uint256 amount
    );

    event StatusChanged(
        Status oldStatus,
        Status newStatus,
        FailureReason reason
    );

    constructor(address owner, uint256 goal, address[] memory validators_, string memory description_, uint256 duration, uint16[] memory milestonePercentages){
        require(goal > 0, "Donation goal must be positive");
        require(duration > 0, "Duration must be positive");

        uint256 totalPercentage;

        for(uint i = 0; i < milestonePercentages.length; i++){
            require(milestonePercentages[i] > 0, "Milestone percentage must be positive");
            totalPercentage += milestonePercentages[i];
            milestones[i] = Milestone(milestonePercentages[i], false, 0, 0, false);
            milestoneCount++;
        }
        require(totalPercentage == basepoints, "Milestones percent have to add up to 10000");


        for(uint i = 0; i < validators_.length; i++){
            address validator = validators_[i];
            require(validator != address(0),"Empty address validator not allowed"
            );

            require(validator != owner,"Project owner cannot be a validator"
            );

            require(!isValidator[validator], "Validator already exists"
            );

            isValidator[validators_[i]] = true;
            validators.push(validator);
        }
        require(validators.length > 0, "Validator required");


        donationGoal = goal;
        description = description_;
        contractOwner = owner;
        start = block.timestamp;
        end = block.timestamp + duration;
        currentStatus = Status.Funding;

    } 

    function donate() external payable isPositiveDonation(msg.value) onlyDuringFunding() isInTimeFrame() noOverpaying(msg.value) {
        uint256 donation = msg.value;

        totalDonations += donation;
        donations[msg.sender] += donation;

        emit DonationReceived(msg.sender, msg.value);

        if(totalDonations >= donationGoal){
            Status oldStatus = currentStatus;
            currentStatus = Status.Payout;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.None);
        }
    }

    function enableVoting(uint256 milestoneIndex) external isOwner() onlyDuringPayout() isCurrentMilestone(milestoneIndex) {
        milestones[milestoneIndex].readyToBeApproved = true;
        emit VotesEnabled(milestoneIndex);
    }

    function voteMilestone(uint milestoneIndex, bool vote) external isAllowedToVote onlyDuringPayout() isMilestone(milestoneIndex) isCurrentMilestone(milestoneIndex) isReadyToBeApproved(milestoneIndex) {
        require(!hasVoted[milestoneIndex][msg.sender], "Validator has already voted");

        hasVoted[milestoneIndex][msg.sender] = true;
        votesForMilestone[milestoneIndex][msg.sender] = vote;

        if (vote){
            milestones[milestoneIndex].approvedCount++;
        } else {
            milestones[milestoneIndex].rejectedCount++;
        }


        emit VoteSubmitted(msg.sender, milestoneIndex, vote);
    }

    function payout(uint milestoneIndex) public isOwner onlyDuringPayout() isMilestone(milestoneIndex) isCurrentMilestone(milestoneIndex) isApproved(milestoneIndex){
        require(!milestones[milestoneIndex].paid, "This Milestone has already been paid");
        
        uint256 milestonePayout = calculatePortion(totalDonations, milestones[milestoneIndex].percentage);
        require(totalDonations >= milestonePayout, "Not enough funds for payout");

        milestones[milestoneIndex].paid = true;
        totalPayout += milestonePayout;
        
        if (currentMilestone < milestoneCount - 1){
            currentMilestone++;
        }else{
            Status oldStatus = currentStatus;
            currentStatus = Status.Closed;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.None);
        } 
        emit PayoutMade(milestoneIndex, milestonePayout);

        (bool success, ) = payable(contractOwner).call{value: milestonePayout}("");
        require(success, "Last Payout failed");
    }

    function payoutRest() public isOwner onlyWhenClosed {
        (bool success, ) = payable(contractOwner).call{value: address(this).balance}("");
        require(success, "Rest Payout failed");
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
        require(isValidator[msg.sender] == true, "Address is not a validator");
        _;
    }

    modifier isReadyToBeApproved(uint256 milestoneIndex){
        require(milestones[milestoneIndex].readyToBeApproved);
        _;
    }

    modifier isApproved(uint256 milestoneIndex){
        require(calculatePercentageInBps(milestones[milestoneIndex].approvedCount, validators.length) >= neededVoteMajorityInBps, "Milestone is not yet approved");
        _;
    }

    modifier isMilestone(uint256 x){
        require(x < milestoneCount, "Milestone does not exist");
        _;
    }

    modifier isOwner(){
        require(msg.sender == contractOwner, "Only Owner is allowed to do this");
        _;
    }

    modifier goalReached(){
        require(totalDonations >= donationGoal, "The donation goal has not yet been reached");
        _;
    }


    modifier isCurrentMilestone(uint256 milestoneIndex){
        require(milestoneIndex == currentMilestone, "Chosen Milestone is not the current Milestone");
        _;
    }

    modifier noOverpaying(uint256 amount) {
        require(amount <= donationGoal - totalDonations, "They payment would exceed the needed amount");
        _;
    }

    modifier onlyDuringFunding() {
        require(currentStatus == Status.Funding, "Only possible while Funding");
        _;
    }

    modifier onlyDuringPayout() {
        require(currentStatus == Status.Payout, "Only possible in Payout Phase");
        _;
    }

    modifier onlyWhenClosed() {
        require(currentStatus == Status.Closed, "Only possible when project is closed");
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
        require(total > 0, "Total cannot be 0");
        return (value * basepoints) / total;
    }
}