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

    uint256 public refundableBalance;

    //solidity has no decimal numbers, so we usebasepoints to represent percentages
    uint256 constant basepoints = 10000;

    address[] public donors;
    mapping(address => uint256) public donations;

    address[] public validators;
    mapping(address => bool) public isValidator;

    uint256 public currentMilestone;
    Milestone[] public milestones;
    mapping(uint256 => mapping(address => bool)) public votesForMilestone;
    mapping(uint256 => mapping(address => bool)) hasVoted;

    struct Milestone{
        uint16 percentage;
        uint16 approvedCount;
        uint16 rejectedCount;
        bool votingFinished;
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
        EndedByOwner
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

    event MilestoneVotingFinished(
        uint256 milestoneIndex,
        bool approved
    );

    event PayoutMade(
        uint256 milestoneIndex,
        uint256 amount
    );

    event RestPayoutMade(
        uint256 amount
    );

    event RefundMade(
        address donor,
        uint256 refundAmount
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
            milestones.push(Milestone(milestonePercentages[i], 0, 0, false, false));
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

    function donate() external payable isPositiveDonation(msg.value) onlyDuringFunding() isInProjectTimeFrame() noOverpaying(msg.value) {
        uint256 donation = msg.value;
        address donor = msg.sender;

        if(donations[donor] == 0){
            donors.push(donor);
        }
        totalDonations += donation;
        donations[donor] += donation;

        emit DonationReceived(donor, donation);

        if(totalDonations >= donationGoal){
            Status oldStatus = currentStatus;
            currentStatus = Status.Payout;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.None);
        }
    }

    function voteMilestone(uint milestoneIndex, bool vote) external isAllowedToVote onlyDuringPayout() isMilestone(milestoneIndex) isLastMilestone(milestoneIndex) MilestoneVotingOpen(milestoneIndex){
        if(hasVoted[milestoneIndex][msg.sender] == true){
            bool lastVote = votesForMilestone[milestoneIndex][msg.sender];
            require(lastVote != vote, "Same Vote was already made");

            if(lastVote){
                milestones[milestoneIndex].approvedCount--;
            } else {
                milestones[milestoneIndex].rejectedCount--;
            }
        }
        else{
            hasVoted[milestoneIndex][msg.sender] = true;
        }
        votesForMilestone[milestoneIndex][msg.sender] = vote;

        if (vote){
            milestones[milestoneIndex].approvedCount++;
        } else {
            milestones[milestoneIndex].rejectedCount++;
        }

        emit VoteSubmitted(msg.sender, milestoneIndex, vote);

        if(isMilestoneRejected(milestoneIndex)){
            milestones[milestoneIndex].votingFinished = true;
            emit MilestoneVotingFinished(milestoneIndex, false);

            Status oldStatus = currentStatus;
            currentStatus = Status.Failed;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.RejectedByValidators);

            refundableBalance = address(this).balance;
        }
        else if(isMilestoneApproved(milestoneIndex)){
            milestones[milestoneIndex].votingFinished = true;
            emit MilestoneVotingFinished(milestoneIndex, true);
        }
    }

    function payout(uint milestoneIndex) external isOwner onlyDuringPayout() isMilestone(milestoneIndex) isCurrentMilestone(milestoneIndex) lastMilestoneApproved(currentMilestone){
        require(!milestones[milestoneIndex].paid, "This Milestone has already been paid");
        
        uint256 milestonePayout = calculatePortion(totalDonations, milestones[milestoneIndex].percentage);
        require(totalDonations >= milestonePayout, "Not enough funds for payout");

        milestones[milestoneIndex].paid = true;
        totalPayout += milestonePayout;
        
        if (currentMilestone < milestones.length - 1){
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

    function payoutRest() external isOwner onlyWhenClosed {
        (bool success, ) = payable(contractOwner).call{value: address(this).balance}("");
        require(success, "Rest Payout failed");
    }

    function refund() external onlyWhenFailed isDonor {
        uint256 refundAmount = (donations[msg.sender] * refundableBalance) / totalDonations;
        donations[msg.sender] = 0;

        emit RefundMade(msg.sender, refundAmount);

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund failed");

    }

    function markAsFailedFunding() external onlyDuringFunding {
        require(block.timestamp > end, "Funding duration is not over yet");
        require(totalDonations < donationGoal, "The donation Goal has been reached");

        Status oldStatus = currentStatus;
        currentStatus = Status.Failed; 

        emit StatusChanged(oldStatus, currentStatus, FailureReason.NoFunding);

        refundableBalance = address(this).balance;
    }

    function endByOwner() external isOwner{
        require(currentStatus == Status.Funding || currentStatus == Status.Payout, "failure by owner only pssible in funding or payout phase");
        
        Status oldStatus = currentStatus;
        currentStatus = Status.Failed; 

        emit StatusChanged(oldStatus, currentStatus, FailureReason.EndedByOwner);

        refundableBalance = address(this).balance;
    }

    modifier isPositiveDonation(uint256 x){
        require(x > 0, "only positive values can be donated");
        _;
    }

    modifier isInProjectTimeFrame(){
        require(block.timestamp >= start && block.timestamp <= end, "not in time frame");
        _;
    }

    modifier isAllowedToVote(){
        require(isValidator[msg.sender] == true, "Address is not a validator");
        _;
    }

    modifier isMilestone(uint256 x){
        require(x < milestones.length, "Milestone does not exist");
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

    modifier isLastMilestone(uint256 milestoneIndex){
        require(currentMilestone > 0, "The first milestone has no predecessor");
        require(milestoneIndex == currentMilestone - 1, "Chosen Milestone is not the last Milestone");
        _;
    }

    modifier lastMilestoneApproved(uint256 milestoneIndex){
        if (milestoneIndex > 0){
            require(isMilestoneApproved(milestoneIndex-1));
        }
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

    modifier onlyWhenFailed() {
        require(currentStatus == Status.Failed, "Only possible when project has failed");
        _;
    }
    
    modifier isDonor() {
        require(donations[msg.sender] > 0, "Sender has not donated anything");
        _;
    }

    modifier MilestoneVotingOpen(uint256 milestoneIndex){
        require(!milestones[milestoneIndex].votingFinished, "Milestone Voting has already finished");
        _;  
    }


    function getContractBalance() external view returns (uint256){
        return address(this).balance;
    }

    function getValidator(uint256 x) external view returns (address){
        return validators[x];
    }

    function getDonors() external view returns (address[] memory){
        return donors;
    }
    
    function getDonorCount() external view returns (uint256) {
        return donors.length;
    }

    function getValidators() external view returns (address[] memory){
        return validators;
    }

    function getValidatorCount() external view returns (uint256) {
        return validators.length;
    }

    function getMilestones() external view returns (Milestone[] memory){
        return milestones;
    }

    function getMilestoneCount() external view returns (uint256){
        return milestones.length;
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

    function isMilestoneApproved(uint256 milestoneIndex) internal view returns (bool) {
        return calculatePercentageInBps(milestones[milestoneIndex].approvedCount, validators.length) >= neededVoteMajorityInBps;        
    }

    function isMilestoneRejected(uint256 milestoneIndex) internal view returns (bool) {
        return calculatePercentageInBps(milestones[milestoneIndex].rejectedCount, validators.length) >= basepoints - neededVoteMajorityInBps;        
    }
}