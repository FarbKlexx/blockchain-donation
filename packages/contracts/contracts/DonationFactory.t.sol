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

    function setUp() public {
        factory = new DonationFactory();
    }

    function test_CreateDonation() public {

        address[] memory validators = new address[](2);
        validators[0] = validator1;
        validators[1] = validator2;

        uint16[] memory milestones = new uint16[](2);
        milestones[0] = 5000;
        milestones[1] = 5000;

        vm.prank(owner);

        address donationAddress = factory.createDonation(10 ether, validators, "Description", 30 days, milestones);

        assertTrue(donationAddress != address(0));
    }

    function test_StoresDonationAddress() public {

        address[] memory validators = new address[](1);
        validators[0] = validator1;

        uint16[] memory milestones = new uint16[](1);
        milestones[0] = 10000;

        vm.prank(owner);

        address donationAddress = factory.createDonation(1 ether, validators, "Test", 1 days, milestones);

        assertEq(factory.getProjectCount(), 1);
        assertEq(factory.projects(0), donationAddress);
    }

    function test_OwnerIsSetCorrectly() public {

        address[] memory validators = new address[](1);
        validators[0] = validator1;

        uint16[] memory milestones = new uint16[](1);
        milestones[0] = 10000;

        vm.prank(owner);

        address donationAddress = factory.createDonation(5 ether, validators, "Project", 7 days, milestones);

        Donation donation = Donation(donationAddress);

        assertEq(donation.contractOwner(), owner);
    }

    function test_CreateMultipleDonations() public {

        address[] memory validators = new address[](1);
        validators[0] = validator1;

        uint16[] memory milestones = new uint16[](1);
        milestones[0] = 10000;

        vm.startPrank(owner);

        factory.createDonation(1 ether, validators, "A", 1 days, milestones);

        factory.createDonation(2 ether, validators, "B", 1 days, milestones);

        vm.stopPrank();

        assertEq(factory.getProjectCount(), 2);
    }
}