// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract GiftCardProject{

    address public owner;

    address[] public whiteList;
    mapping(address => bool) isWhiteListed;
    mapping(address => uint256) institutionIndex;

    struct GiftCard{
        address creator;
        uint256 amount;
        bytes32 publicKey;
        bool valid;
    }

    GiftCard[] public giftCards;

    uint256 public giftCardValueMinimum = 3000000 gwei;

    constructor(address[] memory _whiteList){
        owner = msg.sender;

        for(uint i = 0; i < _whiteList.length; i++){
            address institution = _whiteList[i];
            require(institution != address(0),"Empty address institution not allowed"
            );

            require(!isWhiteListed[institution], "Institution already whitelisted"
            );

            isWhiteListed[_whiteList[i]] = true;
            whiteList.push(institution);
            institutionIndex[institution] = i;
        }
    }

    function createGiftCard(bytes32 _publicKey) external payable isAllowedToCreateGiftCard() isEnoughGiftCardAmount(msg.value){
        giftCards.push(GiftCard(msg.sender, msg.value, _publicKey, true));
    }

    function useGiftCard(uint256 giftCardIndex) external isWhiteListedInstitutuion(msg.sender) isValidGiftCard(giftCardIndex){
        GiftCard storage giftCard = giftCards[giftCardIndex];
        giftCard.valid = false;

        (bool success, ) = payable(msg.sender).call{value: giftCard.amount}("");
        require(success, "Transfer failed");
    }

    function addInstitution(address institution) external isOwner(){
        require(!isWhiteListed[institution], "Institution already whitelisted");
        whiteList.push(institution);
        isWhiteListed[institution] = true;
        institutionIndex[institution] = whiteList.length -1;
    }

    function removeInstitution(address institution) external isOwner() isWhiteListedInstitutuion(msg.sender){
        uint256 index = institutionIndex[institution];
        address lastInstitution = whiteList[whiteList.length - 1];

        whiteList[index] = lastInstitution;
        institutionIndex[lastInstitution] = index;

        whiteList.pop();

        delete institutionIndex[institution];
        isWhiteListed[institution] = false;
    }

    modifier isOwner(){
        require(msg.sender == owner, "Sender is not the Owner");
        _;
    }

    modifier isAllowedToCreateGiftCard() {
        require(msg.sender == owner || isWhiteListed[msg.sender], "Not allowed to create gift cards");
        _;
    }

    modifier isWhiteListedInstitutuion(address sender) {
        require(isWhiteListed[sender], "Not a white listed institution.");
        _;
    }

    modifier isEnoughGiftCardAmount(uint256 amount) {
        require(amount >=  giftCardValueMinimum, "Amount does not fulfill minimum requirement.");
        _;
    }

    modifier isValidGiftCard(uint256 giftCardIndex){
        require(giftCardIndex < giftCards.length, "GiftCard does not exist.");
        require(giftCards[giftCardIndex].valid, "GiftCard is not valid.");
        _;
    }

}