// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Donation{

    uint256 public donationGoal;
    uint256 public totalDonations;

    mapping(address => uint256) public donations;

    //events create log entries on blockchain
    //indexed address enables efficient search for donations from a specifc donor 
    event DonationReceived(
        address indexed donor,
        uint256 amount
    );

    constructor(uint256 goal){
        donationGoal = goal;
    } 

    function donate() external payable isPositiveDonation(msg.value){
        uint256 donation = msg.value;

        totalDonations += donation;
        donations[msg.sender] += donation;

        emit DonationReceived(msg.sender, msg.value);
    }

    modifier isPositiveDonation(uint256 x){
        require(x > 0, "only positive values can be donated");
        _;
    }

    function getContractBalance() external view returns (uint256){
        return address(this).balance;
    }
}