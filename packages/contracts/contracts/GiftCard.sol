// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA}  from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";


/** @title A contract for a gift card project with whitelisted institutions.
 *  @notice This contract manages a gift card system in which institutions are able to redeem gift cards when they have the private key.
 * The idea is that customers buy the gift card and then in order to use it they send the key to a shop that is registered in the system so that they can redeem it.
 */

contract GiftCardProject is EIP712{

    address public owner;

    ///stores the institutions that are allowed to redeem gift cards
    address[] public whiteList;
    mapping(address => bool) isWhiteListed;
    mapping(address => uint256) institutionIndex;

    ///stores all needed information of a giftCard. 
    struct GiftCard{
        address creator;
        ///the address derived from a key pair. Corresponding private key is needed to redeem.
        address redemptionKey;
        uint256 amount;
        bool redeemed;
        ///the date when they gift card expires. After Expiration it can be refunded by creator.
        uint256 expirationDate;
    }

    mapping(address => uint256) giftCardIndices;
    mapping(address => bool) public giftCardExists;
    GiftCard[] public giftCards;

    ///the minimum value that a gift card needs in order to be created
    uint256 public giftCardValueMinimum = 3000000 gwei;
    ///the minimum duration after that a gift card can expire.
    uint256 public validityDurationMinimum = 365 days;

    ///defines the structure of the signature in EIP-712
    bytes32 private constant GIFTCARD_TYPEHASH = keccak256("GiftCard(address redemptionKey,address institution, uint256 amount)");


    event GiftCardCreated(
        address indexed creator,
        address indexed redemptionKey,
        uint256 amount,
        uint256 expirationDate
    );

    event GiftCardRedeemed(
        address indexed institution,
        address indexed redemptionKey,
        uint256 amount    
    );

    event GiftcardRefunded(
        address indexed redemptionKey,
        uint256 amount
    );

    event InstitutionAdded(
        address indexed institution
    );

    event InstitutionRemoved(
        address indexed institution
    );

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

    ///Creates a giftcard with the given key as identifier and the duration to determine the xpiration date.
    function createGiftCard(address _redemptionKey, uint256 duration) external payable isAllowedToCreateGiftCard() isNoZeroAddress(_redemptionKey) isGiftCardNotExisting(_redemptionKey) isEnoughGiftCardAmount(msg.value) isAboveMinimumDuration(duration){
        GiftCard memory giftCard = GiftCard(msg.sender, _redemptionKey, msg.value, false, block.timestamp + duration);
        giftCards.push(giftCard);
        giftCardIndices[_redemptionKey] = giftCards.length -1;
        giftCardExists[_redemptionKey] = true;

        emit GiftCardCreated(giftCard.creator, giftCard.redemptionKey, giftCard.amount, giftCard.expirationDate);
    }

    ///Redeems a gift card from a whiteleisted institution. Needs a valid EIP-712 signature for the redemption key.
    function redeemGiftCard(address _redemptionKey,uint256 amount, bytes calldata signature) external isWhiteListedInstitution(msg.sender) isGiftCardExisting(_redemptionKey) isRedeemable(_redemptionKey) isGiftCardNotExpired(_redemptionKey){
        uint256 giftCardIndex = giftCardIndices[_redemptionKey];
        require(amount == giftCards[giftCardIndex].amount, "Given amount does not match actual amount.");
        require(verify(_redemptionKey, amount, signature), "Verification not successful");
        GiftCard storage giftCard = giftCards[giftCardIndex];
        giftCard.redeemed = true;

        emit GiftCardRedeemed(msg.sender, giftCard.redemptionKey, giftCard.amount);

        (bool success, ) = payable(msg.sender).call{value: giftCard.amount}("");
        require(success, "Transfer failed");
    }

    ///Refunds the value of the gift card to the creator after it expired.
    function refundGiftCard(address _redemptionKey) external isCreator(_redemptionKey) isRedeemable(_redemptionKey) isGiftCardExpired(_redemptionKey){
        GiftCard storage giftCard = giftCards[giftCardIndices[_redemptionKey]];
        giftCard.redeemed = true;

        emit GiftcardRefunded(giftCard.redemptionKey, giftCard.amount);

        (bool success, ) = payable(msg.sender).call{value: giftCard.amount}("");
        require(success, "Transfer failed");
    }

    ///Verifies whether the the signature corresponds to the redemption key. Uses EIP-712.
    function verify(address _redemptionKey, uint256 amount, bytes calldata signature) public view returns (bool){

        //create hash of the given data that send with the signature
        bytes32 structHash = keccak256(abi.encode(GIFTCARD_TYPEHASH, _redemptionKey, msg.sender, amount));

        // combine data of this contract with the hash so that the signature is only valid for this contract and network
        bytes32 digest = _hashTypedDataV4(structHash);

        // reconstruct redemption key and compare
        return ECDSA.recover(digest, signature) == _redemptionKey;
    }

    ///Adds an institution to the white list so that they can also redeem giftCards.
    function addInstitution(address institution) external isOwner(){
        require(institution != address(0),"Empty address institution not allowed");
        require(!isWhiteListed[institution], "Institution already whitelisted");
        whiteList.push(institution);
        isWhiteListed[institution] = true;
        institutionIndex[institution] = whiteList.length -1;

        emit InstitutionAdded(institution);
    }

    ///Removes an institution from the white list so that they are unable to redeem giftCards.
    function removeInstitution(address institution) external isOwner() isWhiteListedInstitution(institution){
        uint256 index = institutionIndex[institution];
        address lastInstitution = whiteList[whiteList.length - 1];

        whiteList[index] = lastInstitution;
        institutionIndex[lastInstitution] = index;

        whiteList.pop();

        delete institutionIndex[institution];
        isWhiteListed[institution] = false;

        emit InstitutionRemoved(institution);
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

    modifier isRedeemable(address _redemptionKey){
        require(!giftCards[giftCardIndices[_redemptionKey]].redeemed, "GiftCard is already redeemed.");
        _;
    }

    modifier isGiftCardExisting(address _redemptionKey){
        require(giftCardExists[_redemptionKey], "GiftCard with Key does not exist.");
        _;
    }

    modifier isGiftCardNotExisting(address _redemptionKey){
        require(!giftCardExists[_redemptionKey], "GiftCard with Key already exists.");
        _;
    }

    modifier isCreator(address _redemptionKey){
        require(giftCards[giftCardIndices[_redemptionKey]].creator == msg.sender, "Sender is not the Creator.");
        _;
    }

    modifier isGiftCardExpired(address _redemptionKey){
        require(block.timestamp >= giftCards[giftCardIndices[_redemptionKey]].expirationDate, "Gift card has not yet expired.");
        _;
    }

    modifier isGiftCardNotExpired(address _redemptionKey){
        require(block.timestamp < giftCards[giftCardIndices[_redemptionKey]].expirationDate, "Gift card has expired.");
        _;
    }

    modifier isAboveMinimumDuration(uint256 duration){
        require(duration >= validityDurationMinimum, "Duration is too short.");
        _;
    }
    
    modifier isNoZeroAddress(address _redemptionKey){
        require(_redemptionKey != address(0), "Zero Address not allowed.");
        _; 
    }

}