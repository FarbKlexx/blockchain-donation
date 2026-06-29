import {expect} from "chai";
import {network} from "hardhat";

const {ethers} = await network.create();

describe("Donation", function(){
    it("Should emit the DonationReceived event when calling the donate() function", async function(){
        const donation = await ethers.deployContract("Donation", [ethers.parseEther("5")]);
        const [owner] = await ethers.getSigners();

        await expect(
            donation.donate({value:ethers.parseEther("2")})
        ).to.emit(donation, "DonationReceived")
        .withArgs(owner.address, ethers.parseEther("2"));
    });

    it("Should deployContract with a DonationGoal of 10 ether", async function(){
        const goal = ethers.parseEther("10");
        const donation = await ethers.deployContract("Donation", [goal]);
        expect(
            await donation.donationGoal()
        ).to.equal(goal);
    })
})