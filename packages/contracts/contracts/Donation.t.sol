// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Donation} from "./Donation.sol";
import {Test} from "forge-std/Test.sol";


contract DonationTest is Test {
  Donation donation;

  function setUp() public {
    donation = new Donation(10 ether);
  }

  function test_InitialDonations() public view {
    require(donation.totalDonations() == 0, "Initial value should be 0");
  }

  function testFuzz_Donate(uint256 x) public {
    vm.assume(x > 0 && x < 10 ether);
    donation.donate{value: x}();
    require(donation.totalDonations() == x);
  }

  function test_DonateNothing() public {
    vm.expectRevert();
    donation.donate{value:0}();
  }
}