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

    function createDonation(string calldata description, uint256 duration, uint256[] calldata milestoneAmounts, string[] calldata milestoneDescriptions) external returns (address) {

        Donation donation = new Donation(msg.sender, description, duration, milestoneAmounts, milestoneDescriptions);

        projects.push(address(donation));
        projectsPerOwner[msg.sender].push(address(donation));

        emit DonationContractCreated(msg.sender, address(donation));

        return address(donation);
    }

    function getProjects() external view returns (address[] memory) {
        return projects;
    }

    function getProjectsOfSender() external view returns (address[] memory) {
        return projectsPerOwner[msg.sender];
    }

    function getProjectCount() external view returns (uint256) {
        return projects.length;
    }
}