// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {Donation} from "./Donation.sol";
import {DonationFactory} from "./DonationFactory.sol";

contract DonationFactoryTest is Test {

    DonationFactory factory;

    address owner =  makeAddr("owner");
    address validator1 =  makeAddr("val1");
    address validator2 = makeAddr("val2");

    address[] validators = new address[](2);


    uint256[] milestoneAmounts1 = new uint256[](2);
    string[] milestoneDescriptions1 = new string[](2);

    uint256[] milestoneAmounts2 = new uint256[](2);
    string[] milestoneDescriptions2 = new string[](2);


    function setUp() public {
        factory = new DonationFactory();
        validators[0] = validator1;
        validators[1] = validator2;

        milestoneAmounts1[0] = 1200;
        milestoneAmounts1[1] = 5000;

        milestoneDescriptions1[0] = "milestone1";
        milestoneDescriptions1[1] = "milestone2";
    }

    function test_CreateDonation() public {

        vm.prank(owner);

        address donationAddress = factory.createDonation(validators, "Description", 30 days, milestoneAmounts1, milestoneDescriptions1);

        assertTrue(donationAddress != address(0));
    }

    function test_StoresDonationAddress() public {

        vm.prank(owner);

        address donationAddress = factory.createDonation( validators, "Test", 1 days, milestoneAmounts1, milestoneDescriptions1);

        assertEq(factory.getProjectCount(), 1);
        assertEq(factory.projects(0), donationAddress);
    }

    function test_OwnerIsSetCorrectly() public {

        vm.prank(owner);

        address donationAddress = factory.createDonation( validators, "Project", 7 days, milestoneAmounts1, milestoneDescriptions1);

        Donation donation = Donation(donationAddress);

        assertEq(donation.contractOwner(), owner);
    }

    function test_CreateMultipleDonations() public {

        milestoneAmounts2[0] = 3000;
        milestoneAmounts2[1] = 4000;

        milestoneDescriptions2[0] = "milestone1";
        milestoneDescriptions2[1] = "milestone2";

        vm.startPrank(owner);
        factory.createDonation( validators, "A", 1 days, milestoneAmounts1, milestoneDescriptions1);
        factory.createDonation( validators, "B", 1 days, milestoneAmounts2, milestoneDescriptions2);
        vm.stopPrank();

        assertEq(factory.getProjectCount(), 2);
    }
}