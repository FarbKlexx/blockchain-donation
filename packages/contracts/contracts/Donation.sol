// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/** @title A contract for a donation project with milestones.
 *  @notice This contract manages a crowdfunding system in which milestones are defined that can only paid out after validators approve the previous milestone.
 */
contract Donation{

    address public contractOwner;
    uint256 public donationGoal;
    ///stores total donations that where made
    uint256 public totalDonations;
    ///descripion of the project
    string public description;
    ///start date of the project
    uint256 public start;
    ///end date of the project
    uint256 public end;

    ///The amount that das already been paid out
    uint256 public totalPayout;

    ///The amount that can be refunded, set at time of project failure
    uint256 public refundableBalance;

    ///solidity has no decimal numbers, so we use basepoints to represent percentages
    uint256 constant basepoints = 10000;

    address[] public donors;
    ///stores the total donations per donor
    mapping(address => uint256) public donations;

    address[] public validators;
    ///makes check whether adress is a validator cheap and fast
    mapping(address => bool) public isValidator;

    Milestone public projectSetup;
    mapping(address => bool) public votesForProjectSetup;
    mapping(address => bool) public hasVotedForProjectSetup;

    ///The Milestone taht will be paid out next
    uint256 public currentMilestoneIndex;
    Milestone[] public milestones;

    mapping(uint256 => mapping(address => bool)) public votesForMilestone;
    mapping(uint256 => mapping(address => bool)) public hasVotedForMilestone;

    ///set whenever a milestone is paid out so that validators can vote until the deadline
    uint256 public milestoneVotingDeadline;
    ///standard duration for how long can be voted after a milestone is paid out
    uint256 constant milestoneVotingDuration = 182 days;

    struct Milestone{
        uint256 amount;
        string description;
        uint16 approvedCount;
        uint16 rejectedCount;
        bool votingFinished;
        bool paid;
    }
    ///Status in which the project is currently
    Status public currentStatus;

    ///The Statius the project can be in
    enum Status{
        Funding,
        ToBeApproved,
        Payout,
        Failed,
        Closed
    }

    ///Reasons for project failure
    enum FailureReason{
        None,
        NoFunding,
        ExpiredVoting,
        RejectedByValidators,
        EndedByOwner
    }

    ///defines the needed majority vor a validated milestone, the complement is needed to block a milestone
    uint256 constant neededVoteMajorityInBps = 6666;

    event DonationReceived(
        address indexed donor,
        uint256 amount
    );

    event ProjectVoteSubmitted(
        address indexed validator,
        bool approved
    );

    event ProjectVotingFinished(
        bool approved
    );

    event MilestoneVoteSubmitted(
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

    constructor(address owner, address[] memory validators_, string memory description_, uint256 duration, uint256[] memory milestoneAmounts, string[] memory milestoneDescriptions){
        require(duration > 0, "Duration must be positive");
        require(milestoneAmounts.length == milestoneDescriptions.length, "Milestone arrays not equally long");

        uint256 milestonesTotal;

        for(uint i = 0; i < milestoneAmounts.length; i++){
            require(milestoneAmounts[i] > 0, "Milestone Goal must be positive");
            milestonesTotal += milestoneAmounts[i];
            milestones.push(Milestone(milestoneAmounts[i], milestoneDescriptions[i], 0, 0, false, false));
        }


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


        donationGoal = milestonesTotal;
        description = description_;
        contractOwner = owner;
        start = block.timestamp;
        end = block.timestamp + duration;
        currentStatus = Status.Funding;

    } 

    ///Used to donate money to the project during the funding phase. When the goal is reached, it automatically changes the Status to Payout.
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
            currentStatus = Status.ToBeApproved;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.None);
        }
    }

    function voteProjectSetup(bool vote) external isAllowedToVote onlyDuringToBeApproved(){
        if(hasVotedForProjectSetup[msg.sender] == true){
            bool lastVote = votesForProjectSetup[msg.sender];
            require(lastVote != vote, "Same Vote was already made");

            if(lastVote){
                projectSetup.approvedCount--;
            } else {
                projectSetup.rejectedCount--;
            }
        }
        else{
            hasVotedForProjectSetup[msg.sender] = true;
        }
        votesForProjectSetup[msg.sender] = vote;

        if (vote){
            projectSetup.approvedCount++;
        } else {
            projectSetup.rejectedCount++;
        }

        emit ProjectVoteSubmitted(msg.sender, vote);

        if(isVoteRejected(projectSetup.approvedCount, projectSetup.approvedCount + projectSetup.rejectedCount)){
            projectSetup.votingFinished = true;
            emit ProjectVotingFinished(false);
            milestoneVotingDeadline = 0;

            Status oldStatus = currentStatus;
            currentStatus = Status.Failed;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.RejectedByValidators);

            refundableBalance = address(this).balance;
        }
        else if(isVoteApproved(projectSetup.rejectedCount, projectSetup.approvedCount + projectSetup.rejectedCount)){
            projectSetup.votingFinished = true;
            emit ProjectVotingFinished(true);
            milestoneVotingDeadline = 0;

            Status oldStatus = currentStatus;
            currentStatus = Status.Payout;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.None);
        }
    }

    ///Can be called by validators to vote on the last milestone that was paid out in order to enable the payout of the next milestone.
    ///If the necessary portion of validators vote against the milestone, the project fails.
    ///Can be called as long as the poll has not been decided. 
    function voteMilestone(uint milestoneIndex, bool vote) external isAllowedToVote onlyDuringPayout() isMilestone(milestoneIndex) isLastMilestone(milestoneIndex) MilestoneVotingOpen(milestoneIndex){
        if(hasVotedForMilestone[milestoneIndex][msg.sender] == true){
            bool lastVote = votesForMilestone[milestoneIndex][msg.sender];
            require(lastVote != vote, "Same Vote was already made");

            if(lastVote){
                milestones[milestoneIndex].approvedCount--;
            } else {
                milestones[milestoneIndex].rejectedCount--;
            }
        }
        else{
            hasVotedForMilestone[milestoneIndex][msg.sender] = true;
        }
        votesForMilestone[milestoneIndex][msg.sender] = vote;

        if (vote){
            milestones[milestoneIndex].approvedCount++;
        } else {
            milestones[milestoneIndex].rejectedCount++;
        }

        emit MilestoneVoteSubmitted(msg.sender, milestoneIndex, vote);

        if(isMilestoneRejected(milestoneIndex)){
            milestones[milestoneIndex].votingFinished = true;
            emit MilestoneVotingFinished(milestoneIndex, false);
            milestoneVotingDeadline = 0;

            Status oldStatus = currentStatus;
            currentStatus = Status.Failed;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.RejectedByValidators);

            refundableBalance = address(this).balance;
        }
        else if(isMilestoneApproved(milestoneIndex)){
            milestones[milestoneIndex].votingFinished = true;
            emit MilestoneVotingFinished(milestoneIndex, true);
            milestoneVotingDeadline = 0;
        }
    }

    ///Can be called by the owner after funding to pay out the money for the next milestone when the last milestone has been approved.
    ///When the last milestone is paid out, the Project is closed. 
    function payout(uint milestoneIndex) external isOwner onlyDuringPayout() isMilestone(milestoneIndex) isCurrentMilestone(milestoneIndex) lastMilestoneApproved(currentMilestoneIndex){
        require(!milestones[milestoneIndex].paid, "This Milestone has already been paid");
        
        uint256 milestonePayout = milestones[milestoneIndex].amount;
        require(totalDonations >= milestonePayout, "Not enough funds for payout");

        milestones[milestoneIndex].paid = true;
        totalPayout += milestonePayout;

        milestoneVotingDeadline = block.timestamp + milestoneVotingDuration;
        
        if (currentMilestoneIndex < milestones.length - 1){
            currentMilestoneIndex++;
        }else{
            Status oldStatus = currentStatus;
            currentStatus = Status.Closed;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.None);
        } 
        emit PayoutMade(milestoneIndex, milestonePayout);

        (bool success, ) = payable(contractOwner).call{value: milestonePayout}("");
        require(success, "Last Payout failed");
    }

    ///Can be called by the owner to pay out any rest amount of money that is in the contract after all milestones have been payid out.
    function payoutRest() external isOwner onlyWhenClosed {
        (bool success, ) = payable(contractOwner).call{value: address(this).balance}("");
        require(success, "Rest Payout failed");
    }

    ///Can be called by donors to get their money back in case the project failed. 
    ///The refund is proportional to what the donor donated towards the goal and the money that was left at time of failure. 
    function refund() external onlyWhenFailed isDonor {
        uint256 refundAmount = (donations[msg.sender] * refundableBalance) / totalDonations;
        donations[msg.sender] = 0;

        emit RefundMade(msg.sender, refundAmount);

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund failed");

    }

    ///Marks the project as failed when the project was not funded at the end of the funding campaign.
    function markAsFailedFunding() external onlyDuringFunding {
        require(block.timestamp >= end, "Funding duration is not over yet");
        require(totalDonations < donationGoal, "The donation Goal has been reached");

        Status oldStatus = currentStatus;
        currentStatus = Status.Failed; 

        emit StatusChanged(oldStatus, currentStatus, FailureReason.NoFunding);

        refundableBalance = address(this).balance;
    }

    ///Marks the project as failed when the validators did not approve the last milestone within the deadline.
    function markAsFailedDueToExpiredVoting() external onlyDuringPayout MilestoneDeadlineIsSet() {
        require(block.timestamp >= milestoneVotingDeadline, "Milestone Voting Duration has not been exceeded yet");
        require(milestones[currentMilestoneIndex-1].paid, "This Milestone wasnt paid out yet");

        Status oldStatus = currentStatus;
        currentStatus = Status.Failed; 

        emit StatusChanged(oldStatus, currentStatus, FailureReason.ExpiredVoting);

        refundableBalance = address(this).balance;
    }

    ///Can be called by the owner to fail the project to enable refunds as soon as it is clear they will not be able to keep working and succeed on the project.
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
        require(milestoneIndex == currentMilestoneIndex, "Chosen Milestone is not the current Milestone");
        _;
    }

    modifier isLastMilestone(uint256 milestoneIndex){
        require(currentMilestoneIndex > 0, "The first milestone has no predecessor");
        require(milestoneIndex == currentMilestoneIndex - 1, "Chosen Milestone is not the last Milestone");
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

    modifier onlyDuringToBeApproved(){
        require(currentStatus == Status.ToBeApproved, "Only possible while Project Approval");
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
        require(milestoneVotingDeadline > block.timestamp, "Milestone Voting Deadline exceeded");
        _;  
    }

    modifier MilestoneDeadlineIsSet() {
        require(milestoneVotingDeadline > 0, "Currently No Deadline is active");
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

    ///Calculates the percentage of the value to the total and returns it in Bps.
    ///Basepoints are used since solidity does not allow decimal numbers.
    function calculatePercentageInBps(uint256 value, uint256 total)internal pure returns (uint256) {
        require(total > 0, "Total cannot be 0");
        return (value * basepoints) / total;
    }

    ///Returns whether the Milestone has been approved.
    function isMilestoneApproved(uint256 milestoneIndex) internal view returns (bool) {
        return calculatePercentageInBps(milestones[milestoneIndex].approvedCount, validators.length) >= neededVoteMajorityInBps;        
    }


    ///Returns whether the Milestone has been rejected.
    function isMilestoneRejected(uint256 milestoneIndex) internal view returns (bool) {
        return calculatePercentageInBps(milestones[milestoneIndex].rejectedCount, validators.length) > basepoints - neededVoteMajorityInBps;        
    }

    ///Returns whether the Vote has been approved.
    function isVoteApproved(uint256 approvedCount, uint256 totalVotes) internal pure returns (bool) {
        return calculatePercentageInBps(approvedCount, totalVotes) >= neededVoteMajorityInBps;        
    }

    ///Returns whether the Vote has been rejected.
    function isVoteRejected(uint256 rejectedCount, uint256 totalVotes) internal pure returns (bool) {
        return calculatePercentageInBps(rejectedCount, totalVotes) > basepoints - neededVoteMajorityInBps;        
    }
}