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

    uint256 constant validatorMinimumDonation = 10000000 gwei;
    uint256 constant validatorCount = 5;
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
    uint256 public votingDeadline;
    ///standard duration for how long can be voted after a milestone is paid out
    uint256 constant votingDuration = 182 days;

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

    constructor(address owner, string memory description_, uint256 duration, uint256[] memory milestoneAmounts, string[] memory milestoneDescriptions){
        require(duration > 0, "Duration must be positive");
        require(milestoneAmounts.length == milestoneDescriptions.length, "Milestone arrays not equally long");

        uint256 milestonesTotal;

        for(uint i = 0; i < milestoneAmounts.length; i++){
            require(milestoneAmounts[i] > 0, "Milestone Goal must be positive");
            milestonesTotal += milestoneAmounts[i];
            milestones.push(Milestone(milestoneAmounts[i], milestoneDescriptions[i], 0, 0, false, false));
        }


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
            setValidators(generateRandomNumber());
            votingDeadline = block.timestamp + votingDuration;
            Status oldStatus = currentStatus;
            currentStatus = Status.ToBeApproved;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.None);
        }
    }

    ///Can be called by validators to vote on the project setup so that the owner can start paying out money for the mielstones.
    ///Can be called as long as the poll has not been decided. 
    function voteProjectSetup(bool vote) external isAllowedToVote onlyDuringToBeApproved() ProjectSetupVotingOpen(){
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

        //if(isVoteRejected(projectSetup.rejectedCount, projectSetup.approvedCount + projectSetup.rejectedCount)){
        if(isVoteRejected(projectSetup.rejectedCount, validators.length)){
            projectSetup.votingFinished = true;
            emit ProjectVotingFinished(false);
            votingDeadline = 0;

            Status oldStatus = currentStatus;
            currentStatus = Status.Failed;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.RejectedByValidators);

            refundableBalance = address(this).balance;
        }
        //else if(isVoteApproved(projectSetup.approvedCount, projectSetup.approvedCount + projectSetup.rejectedCount)){
        else if(isVoteApproved(projectSetup.approvedCount, validators.length)){
            projectSetup.votingFinished = true;
            emit ProjectVotingFinished(true);
            votingDeadline = 0;

            Status oldStatus = currentStatus;
            currentStatus = Status.Payout;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.None);
        }
    }

    ///Can be called by validators to vote on the last milestone that was paid out in order to enable the payout of the next milestone.
    ///If the necessary portion of validators vote against the milestone, the project fails.
    ///Can be called as long as the poll has not been decided. 
    function voteMilestone(uint milestoneIndex, bool vote) external isAllowedToVote onlyDuringPayout() isLastMilestone(milestoneIndex) MilestoneVotingOpen(milestoneIndex){
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

        //if(isVoteRejected(milestones[milestoneIndex].rejectedCount, milestones[milestoneIndex].approvedCount + milestones[milestoneIndex].rejectedCount)){
        if(isVoteRejected(milestones[milestoneIndex].rejectedCount, validators.length)){
            milestones[milestoneIndex].votingFinished = true;
            emit MilestoneVotingFinished(milestoneIndex, false);
            votingDeadline = 0;

            Status oldStatus = currentStatus;
            currentStatus = Status.Failed;
            emit StatusChanged(oldStatus, currentStatus, FailureReason.RejectedByValidators);

            refundableBalance = address(this).balance;

        }
        //else if(isVoteApproved(milestones[milestoneIndex].approvedCount, milestones[milestoneIndex].approvedCount + milestones[milestoneIndex].rejectedCount)){
        else if(isVoteApproved(milestones[milestoneIndex].approvedCount, validators.length)){
            milestones[milestoneIndex].votingFinished = true;
            emit MilestoneVotingFinished(milestoneIndex, true);
            votingDeadline = 0;

            if(milestoneIndex == milestones.length - 1){
                Status oldStatus = currentStatus;
                currentStatus = Status.Closed;
                emit StatusChanged(oldStatus, currentStatus, FailureReason.None);
            }
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

        votingDeadline = block.timestamp + votingDuration;
        
        currentMilestoneIndex++;

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
    function markAsFailedDueToExpiredVoting() external MilestoneDeadlineIsSet() {
        require(currentStatus == Status.ToBeApproved|| currentStatus == Status.Payout, "only possible in projectSetupApproval or payout phase");
        require(block.timestamp >= votingDeadline, "Milestone Voting Duration has not been exceeded yet");

        Status oldStatus = currentStatus;
        currentStatus = Status.Failed; 

        emit StatusChanged(oldStatus, currentStatus, FailureReason.ExpiredVoting);

        refundableBalance = address(this).balance;
    }

    ///Can be called by the owner to fail the project to enable refunds as soon as it is clear they will not be able to keep working and succeed on the project.
    function endByOwner() external isOwner{
        require(currentStatus == Status.Funding || currentStatus == Status.ToBeApproved|| currentStatus == Status.Payout, "failure by owner only pssible in funding or payout phase");
        
        Status oldStatus = currentStatus;
        currentStatus = Status.Failed; 

        emit StatusChanged(oldStatus, currentStatus, FailureReason.EndedByOwner);

        refundableBalance = address(this).balance;
    }

    ///ONLY FOR LOCAL TESTING, NOT SAFE FOR DEPLOYMENT
    ///generates a pseudo random number 
    function generateRandomNumber() internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.timestamp,block.prevrandao,donors.length)));
    }

    ///Checks for donors that donated enough be a validator candidate. Returns a list of these potential validators.
    function getPotentialValidators() internal view returns (address[] memory){
        uint256 numberOfPotentialValidators = 0;
        for (uint256 i = 0; i < donors.length; i++) {
            if (donations[donors[i]] >= validatorMinimumDonation){
                numberOfPotentialValidators++;
            }
        }
        // should require enough potential validators
        //require(numberOfPotentialValidators >= validatorCount, "Not enough potential validators");
        address[] memory validatorPool = new address[](numberOfPotentialValidators);
        uint256 poolIndex = 0;

        for (uint256 i = 0; i < donors.length; i++) {
            if (donations[donors[i]] >= validatorMinimumDonation){
                validatorPool[poolIndex] = donors[i];
                poolIndex++;
            }
        }
        return validatorPool;
    }


    ///Choses random validators with the help of a random number.Validators need to have donated more than a certain minimum threshold.
    function setValidators(uint256 randomNumber) internal {
        require(validators.length == 0, "Validators already selected");
        // should require enough potential validators
        //require(donors.length >= validatorCount, "Not enough donors");

        address[] memory validatorPool = getPotentialValidators();
        uint256 poolLen = validatorPool.length;
        uint256 numberOfPicks = poolLen < validatorCount ? poolLen : validatorCount;

        //fisher yates shuffle
        for (uint256 i = 0; i < numberOfPicks; i++) {

            uint256 j = i + (randomNumber % (poolLen - i));
            (validatorPool[i], validatorPool[j]) = (validatorPool[j], validatorPool[i]);

            validators.push(validatorPool[i]);
            isValidator[validatorPool[i]] = true;

            randomNumber = uint256(keccak256(abi.encode(randomNumber)));
        }
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

    modifier ProjectSetupVotingOpen(){
        require(!projectSetup.votingFinished, "Project setup Voting has already finished");
        require(votingDeadline > block.timestamp, "Project setup Voting Deadline exceeded");
        _;  
    }

    modifier MilestoneVotingOpen(uint256 milestoneIndex){
        require(!milestones[milestoneIndex].votingFinished, "Milestone Voting has already finished");
        require(votingDeadline > block.timestamp, "Milestone Voting Deadline exceeded");
        _;  
    }

    modifier MilestoneDeadlineIsSet() {
        require(votingDeadline > 0, "Currently No Deadline is active");
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