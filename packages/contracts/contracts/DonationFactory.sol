// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Donation.sol";

contract DonationFactory {

    address[] public projects;

    mapping(address => address[]) public projectsPerOwner;

    event DonationContractCreated(
        address indexed creator,
        address donationContract
    );

    function createDonation(uint256 goal, address[] calldata validators, string calldata description, uint256 duration, uint16[] calldata milestonePercentages) external returns (address) {

        Donation donation = new Donation(msg.sender, goal, validators, description, duration, milestonePercentages);

        projects.push(address(donation));
        projectsPerOwner[msg.sender].push(address(donation));

        emit DonationContractCreated(msg.sender, address(donation));

        return address(donation);
    }

    function getDonations() external view returns (address[] memory) {
        return projects;
    }

    function getDonationsOfSender() external view returns (address[] memory) {
        return projectsPerOwner[msg.sender];
    }

    function getDonationsCount() external view returns (uint256) {
        return projects.length;
    }
}