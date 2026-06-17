// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Donation} from "./Donation.sol";
import {Test} from "forge-std/Test.sol";
import{console2} from "forge-std/console2.sol";


contract DonationTest is Test {
  Donation donation;
  address[] validators; 
  uint16[] milestonePercentages;
  string description = "This is a description";
  uint256 duration = 7 days;

  function setUp() public {
    validators.push(makeAddr("a"));
    validators.push(makeAddr("b"));
    milestonePercentages.push(2400);
    milestonePercentages.push(2600);
    milestonePercentages.push(5000);
    donation = new Donation(msg.sender, 10 ether, validators, description, duration, milestonePercentages);
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

  function testFuzz_Donate(uint256 x) public {
    vm.assume(x > 0 && x < 10 ether);
    donation.donate{value: x}();
    require(donation.totalDonations() == x);
  }

  function testFuzz_DonationPerDonatee(address sender, uint256 x, uint256 y) public {
    vm.assume(x > 0 && x < 10 ether);
    vm.assume(y > 0 && y < 10 ether);
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
    donation.donate{value: 5}();
  }
}