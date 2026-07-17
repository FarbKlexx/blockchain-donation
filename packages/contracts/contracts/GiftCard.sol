// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA}  from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract GiftCardProject is EIP712{

    address public owner;

    address[] public whiteList;
    mapping(address => bool) isWhiteListed;
    mapping(address => uint256) institutionIndex;

    struct GiftCard{
        address creator;
        uint256 amount;
        address publicKey;
        bool redeemed;
        uint256 expirationDate;
    }

    mapping(address => uint256) giftCardIndices;
    mapping(address => bool) public giftCardExists;
    GiftCard[] public giftCards;

    uint256 public giftCardValueMinimum = 3000000 gwei;
    uint256 public validityDurationMinimum = 365 days;

    bytes32 private constant GIFTCARD_TYPEHASH = keccak256("GiftCard(address recipient,address institution, uint256 amount)");

    constructor(address[] memory _whiteList) EIP712("GiftCard", "1"){
        owner = msg.sender;

        uint256 length = _whiteList.length;
        for(uint i = 0; i < length;){
            address institution = _whiteList[i];
            require(institution != address(0),"Empty address institution not allowed");

            require(!isWhiteListed[institution], "Institution already whitelisted");

            isWhiteListed[_whiteList[i]] = true;
            whiteList.push(institution);
            institutionIndex[institution] = i;

            unchecked {
                ++i;
            }
        }
    }

    function createGiftCard(address _publicKey, uint256 duration) external payable isAllowedToCreateGiftCard() isNoZeroAddress(_publicKey) isGiftCardNotExisting(_publicKey) isEnoughGiftCardAmount(msg.value) isAboveMinimumDuration(duration){
        GiftCard memory giftCard = GiftCard(msg.sender, msg.value, _publicKey, false, block.timestamp + duration);
        giftCards.push(giftCard);
        giftCardIndices[_publicKey] = giftCards.length -1;
        giftCardExists[_publicKey] = true;
    }

    function useGiftCard(address _publicKey,uint256 amount, bytes calldata signature) external isWhiteListedInstitution(msg.sender) isGiftCardExisting(_publicKey) isRedeemable(_publicKey) isGiftCardNotExpired(_publicKey){
        uint256 giftCardIndex = giftCardIndices[_publicKey];
        require(amount == giftCards[giftCardIndex].amount, "Given amount does not match actual amount.");
        require(verify(_publicKey, amount, signature), "Verification not successful");
        GiftCard storage giftCard = giftCards[giftCardIndex];
        giftCard.redeemed = true;

        (bool success, ) = payable(msg.sender).call{value: giftCard.amount}("");
        require(success, "Transfer failed");
    }

    function refundGiftCard(address _publicKey) external isCreator(_publicKey) isRedeemable(_publicKey) isGiftCardExpired(_publicKey){
        GiftCard storage giftCard = giftCards[giftCardIndices[_publicKey]];
        giftCard.redeemed = true;

        (bool success, ) = payable(msg.sender).call{value: giftCard.amount}("");
        require(success, "Transfer failed");
    }

    function verify(address _publicKey, uint256 amount, bytes calldata signature) public view returns (bool){
        // 1. Struct-Hash mit abi.encode (NICHT encodePacked)
        bytes32 structHash = keccak256(abi.encode(GIFTCARD_TYPEHASH, _publicKey, msg.sender, amount));

        // 2. EIP-712-Digest (\x19\x01 + Domain + Struct) – ersetzt toEthSignedMessageHash
        bytes32 digest = _hashTypedDataV4(structHash);

        // 3. Signer rekonstruieren und vergleichen
        return ECDSA.recover(digest, signature) == _publicKey;
    }

    function addInstitution(address institution) external isOwner(){
        require(institution != address(0),"Empty address institution not allowed");
        require(!isWhiteListed[institution], "Institution already whitelisted");
        whiteList.push(institution);
        isWhiteListed[institution] = true;
        institutionIndex[institution] = whiteList.length -1;
    }

    function removeInstitution(address institution) external isOwner() isWhiteListedInstitution(institution){
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

    modifier isWhiteListedInstitution(address sender) {
        require(isWhiteListed[sender], "Not a white listed institution.");
        _;
    }

    modifier isEnoughGiftCardAmount(uint256 amount) {
        require(amount >=  giftCardValueMinimum, "Amount does not fulfill minimum requirement.");
        _;
    }

    modifier isRedeemable(address _publicKey){
        require(!giftCards[giftCardIndices[_publicKey]].redeemed, "GiftCard is already redeemed.");
        _;
    }

    modifier isGiftCardExisting(address _publicKey){
        require(giftCardExists[_publicKey], "GiftCard with Key does not exist.");
        _;
    }

    modifier isGiftCardNotExisting(address _publicKey){
        require(!giftCardExists[_publicKey], "GiftCard with Key already exists.");
        _;
    }

    modifier isCreator(address _publicKey){
        require(giftCards[giftCardIndices[_publicKey]].creator == msg.sender, "Sender is not the Creator.");
        _;
    }

    modifier isGiftCardExpired(address _publicKey){
        require(block.timestamp >= giftCards[giftCardIndices[_publicKey]].expirationDate, "Gift card has expired.");
        _;
    }

    modifier isGiftCardNotExpired(address _publicKey){
        require(block.timestamp < giftCards[giftCardIndices[_publicKey]].expirationDate, "Gift card has not yet expired.");
        _;
    }

    modifier isAboveMinimumDuration(uint256 duration){
        require(duration >= validityDurationMinimum, "Duration is too short.");
        _;
    }
    
    modifier isNoZeroAddress(address _publicKey){
        require(_publicKey != address(0), "Zero Address not allowed.");
        _; 
    }

}