// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Donation} from "./Donation.sol";
import {Test} from "forge-std/Test.sol";
import{console2} from "forge-std/console2.sol";


contract DonationTest is Test {
  Donation donation;
  address[] validators; 
  address owner;
  uint16[] milestonePercentages;
  string description = "This is a description";
  uint256 duration = 7 days;
  uint256 donationGoal = 10 ether;

  function setUp() public {
    validators.push(makeAddr("a"));
    validators.push(makeAddr("b"));
    owner = makeAddr("owner");
    milestonePercentages.push(2400);
    milestonePercentages.push(2600);
    milestonePercentages.push(5000);
    donation = new Donation(owner, donationGoal, validators, description, duration, milestonePercentages);
  }

  function test_InitialDonations() public view {
    require(donation.totalDonations() == 0, "Initial value should be 0");
  }

  function test_EndDate() public view {
    assertEq(donation.start() + duration, donation.end());
  }

  function test_InitialValidators() public view{
    for (uint i = 0; i < validators.length; i++){
      require(donation.getValidator(i) == validators[i]);
    }
  }

  function test_InitialDescription() public view {
    assertEq(donation.description(), "This is a description");
  }

  function test_EmitDonationReceivedEvent() public {
    address donor = makeAddr("donor");

    vm.deal(donor, 1 ether);

    vm.expectEmit(true, false, false, true);
    emit Donation.DonationReceived(donor, 1 ether);

    vm.prank(donor);
    donation.donate{value: 1 ether}();
  }

  function test_EmitDonationStatusChangedEvent() public {
    vm.expectEmit(false, false, false, true);
    emit Donation.StatusChanged(Donation.Status.Funding, Donation.Status.Payout, Donation.FailureReason.None);

    donation.donate{value: donationGoal}();
  }

  function testFuzz_Donate(uint256 x) public {
    vm.assume(x > 0 && x < donationGoal);
    donation.donate{value: x}();
    require(donation.totalDonations() == x);

  }


  function testFuzz_DonationPerDonatee(address sender, uint256 x, uint256 y) public {
    vm.assume(x > 0 && x < donationGoal / 2);
    vm.assume(y > 0 && y < donationGoal / 2);
    vm.assume(sender != address(0));
    vm.deal(sender, x+y);
    vm.startPrank(sender);
    donation.donate{value: x}();
    donation.donate{value: y}();
    require(donation.donations(sender)== x+y);
  }

  function test_DonateNothing() public {
    vm.expectRevert();
    donation.donate{value:0}();
  }

  function test_DonateAfteEndDate() public {
    vm.warp(donation.end() + 1);
    vm.expectRevert();
    donation.donate{value: donationGoal / 2}();
  }

  function test_Overdonating() public {
    vm.expectRevert();
    donation.donate{value: donationGoal + 1}();
  }

  function test_DonateAfterFunding() public {
    donation.donate{value: donationGoal}();
    vm.expectRevert();
    donation.donate{value: 1 ether}();
  }

  function test_Funded() public {
    require(donation.currentStatus() == Donation.Status.Funding);
    donation.donate{value: donationGoal / 2}();
    require(donation.currentStatus() == Donation.Status.Funding);
    donation.donate{value: donationGoal / 2}();
    require(donation.currentStatus() == Donation.Status.Payout);
  }


  function test_VoteByValidator() public {
    donation.donate{value: donationGoal}();
    uint256 milestoneIndex = donation.currentMilestone();
    bool vote = true;
    address validator = validators[0];

    vm.expectEmit(true, false, false, true);
    emit Donation.VoteSubmitted(validator, milestoneIndex, vote);

    vm.prank(validator);
    donation.voteMilestone(milestoneIndex, vote);

    assertTrue(donation.votesForMilestone(0, validator));
  }

  function test_VoteByNonValidator() public {
    donation.donate{value: donationGoal}();
    uint256 milestoneIndex = donation.currentMilestone();

    vm.prank(makeAddr("nonValidator"));
    vm.expectRevert();
    donation.voteMilestone(milestoneIndex, true);
  }

  function test_VoteByValidatorWrongMilestone() public {
    donation.donate{value: donationGoal}();
    uint256 milestoneIndex = donation.currentMilestone();

    vm.prank(validators[0]);
    vm.expectRevert();
    donation.voteMilestone(milestoneIndex+1, true);
  }

  function test_VoteByValidatorMakesProjectFailed() public {
    donation.donate{value: donationGoal}();
    uint256 milestoneIndex = donation.currentMilestone();
    bool vote = false;
    address validator = validators[0];

    vm.expectEmit(true, false, false, true);
    emit Donation.VoteSubmitted(validator, milestoneIndex, vote);
  
    vm.expectEmit(false, false, false, true);
    emit Donation.StatusChanged(Donation.Status.Payout, Donation.Status.Failed, Donation.FailureReason.RejectedByValidators);

    vm.prank(validator);
    donation.voteMilestone(milestoneIndex, vote);

    assertFalse(donation.votesForMilestone(0, validator));
  }

  function test_MarkAsFailedFunding() public {
    vm.warp(donation.end() + 1);
    vm.expectEmit(false, false, false, true);
    emit Donation.StatusChanged(Donation.Status.Funding, Donation.Status.Failed, Donation.FailureReason.NoFunding);

    donation.markAsFailedFunding();
    require(donation.currentStatus() == Donation.Status.Failed);
  }

  function test_MarkAsFailedFundingAfterFunding() public {
    donation.donate{value: donationGoal}();
    vm.warp(donation.end() + 1);

    vm.expectRevert();
    donation.markAsFailedFunding();
  }

  function test_EndByOwnerDuringFunding() public {
    vm.expectEmit(false, false, false, true);
    emit Donation.StatusChanged(Donation.Status.Funding, Donation.Status.Failed, Donation.FailureReason.EndedByOwner);
    vm.prank(owner);
    donation.endByOwner();

    require(donation.currentStatus() == Donation.Status.Failed);
  }

  function test_EndByOwnerDuringPayout() public {
    donation.donate{value: donationGoal}();
    vm.expectEmit(false, false, false, true);
    emit Donation.StatusChanged(Donation.Status.Payout, Donation.Status.Failed, Donation.FailureReason.EndedByOwner);
    vm.prank(owner);
    donation.endByOwner();

    require(donation.currentStatus() == Donation.Status.Failed);
  }
}