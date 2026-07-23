// Deploys DonationFactory + one Donation contract per campaign in
// ../frontend/src/data/contractData.json onto a running local Hardhat node
// (`npm run node -w contracts`), then replays each campaign's donations,
// payouts and validator votes so the on-chain state matches that JSON file's
// numbers. Finally writes the real addresses back into the frontend/backend
// so the app picks them up automatically:
//   - packages/frontend/.env (VITE_CONTRACT_ADDRESS = the factory address)
//   - packages/frontend/src/data/projectMetadata.json (per-project `address`)
//   - deletes packages/backend/data.db so it reseeds from the updated
//     projectMetadata.json on next backend start
//
// contractData.json's fake donor/owner/validator addresses are NOT reused
// (no private keys for them) — real Hardhat test accounts stand in instead.
// All monetary amounts are scaled down 1000x so they fit comfortably inside
// the default 10,000-ETH test-account balances; contractData.json's
// `currentStatus`/`milestones[].paid` etc. are otherwise reproduced exactly.

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { network } from "hardhat";

const { ethers } = await network.create("localhost");

const contractsRoot = path.resolve(import.meta.dirname, "..");
const frontendRoot = path.resolve(contractsRoot, "..", "frontend");
const backendRoot = path.resolve(contractsRoot, "..", "backend");

const contractDataPath = path.join(frontendRoot, "src/data/contractData.json");
const metadataPath = path.join(frontendRoot, "src/data/projectMetadata.json");

const contractData = JSON.parse(readFileSync(contractDataPath, "utf8"));
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));

// contractData.json's amounts are arbitrary fictional units, not real
// currency — deploy at 1/1000th so campaign totals stay well inside a test
// account's 10,000 ETH balance. Division is on wei (BigInt), so it's exact.
const SCALE = 1000n;
function scaledWei(mockAmount: number): bigint {
  return ethers.parseEther(String(mockAmount)) / SCALE;
}

function updateFrontendEnv(factoryAddress: string) {
  const envPath = path.join(frontendRoot, ".env");
  const examplePath = path.join(frontendRoot, ".env.example");
  if (!existsSync(envPath)) copyFileSync(examplePath, envPath);

  let contents = readFileSync(envPath, "utf8");
  const line = `VITE_CONTRACT_ADDRESS=${factoryAddress}`;
  contents = /^VITE_CONTRACT_ADDRESS=.*$/m.test(contents)
    ? contents.replace(/^VITE_CONTRACT_ADDRESS=.*$/m, line)
    : `${contents}\n${line}\n`;
  writeFileSync(envPath, contents);
  console.log(`\nWrote VITE_CONTRACT_ADDRESS to ${path.relative(contractsRoot, envPath)}`);
}

function updateMetadataAddresses(results: Array<{ id: string; address: string }>) {
  const byId = new Map(results.map((r) => [r.id, r.address]));
  for (const project of metadata.projects) {
    const newAddress = byId.get(project.id);
    if (newAddress) project.address = newAddress;
  }
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Updated addresses in ${path.relative(contractsRoot, metadataPath)}`);
}

async function resetBackendDb() {
  const dbPath = path.join(backendRoot, "data.db");
  if (!existsSync(dbPath)) return;

  // Windows briefly locks the file (indexing/AV) right after other processes
  // touch the directory; a short retry avoids failing the whole script over it.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      unlinkSync(dbPath);
      console.log(`Deleted ${path.relative(contractsRoot, dbPath)} — backend will reseed from projectMetadata.json on next start`);
      return;
    } catch (err: any) {
      if (err.code !== "EBUSY" || attempt === 5) {
        console.warn(`Could not delete ${path.relative(contractsRoot, dbPath)} (${err.code}); delete it manually so the backend reseeds.`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

const signers = await ethers.getSigners();
const deployer = signers[0];
const owners = signers.slice(1, 6);
// Validators are NO LONGER chosen here — reaching the funding goal makes the
// contract pick them at random from donors who gave >= validatorMinimumDonation
// (0.01 ETH). We read the selected set from the chain per campaign (below).
const donorPool = signers.slice(6, 20);

// Donation.Status enum order (Funding, ToBeApproved, Payout, Failed, Closed).
const StatusEnum = { Funding: 0, ToBeApproved: 1, Payout: 2, Failed: 3, Closed: 4 } as const;
const signerByAddress = new Map(signers.map((s) => [s.address.toLowerCase(), s]));

// Demo seam: the project id whose final PAID milestone is left with an OPEN vote
// after seeding (see the replay loop below), so validator voting + the follow-up
// owner payout are both exercisable in the UI immediately. "" disables it.
const LEAVE_VOTE_OPEN_FOR = "mobile-suppenkueche-berlin";

// Demo seam: the project id that FUNDS fully but is left in ToBeApproved (its
// project-setup vote NOT cast), so a validator can approve the project start in
// the UI. "" disables it.
const LEAVE_SETUP_OPEN_FOR = "gemeinschaftsgarten-lindenau";

// Demo seam: the project id that ran OUT OF TIME below its goal. Must have a
// SHORT window (small end-start in the mock) and be listed LAST, so jumping past
// its `end` to call markAsFailedFunding() doesn't expire the other campaigns
// (whose windows are ~weeks long). "" disables it.
const MARK_FAILED_FUNDING_FOR = "open-air-kino-hinterhof";

// Demo seam: the project id that FUNDS fully, has milestone 0 PAID, but is then
// DECLINED by the validators (they reject milestone 0) — failing the project and
// freezing refundableBalance for donor refunds. Demonstrates the refund flow
// after a milestone rejection (vs. the funding-timeout failure above). It is
// funded from a fixed donor set (below) that includes the "Beispiel-Spender"
// persona, so that persona can reclaim its refund in the UI. "" disables it.
const MARK_FAILED_MILESTONE_FOR = "lastenrad-kollektiv";

console.log("Deploying DonationFactory from", deployer.address);
const factory = await ethers.deployContract("DonationFactory", deployer);
await factory.waitForDeployment();
const factoryAddress = await factory.getAddress();
console.log("DonationFactory:", factoryAddress);

if (contractData.campaigns.length !== metadata.projects.length) {
  throw new Error("contractData.json and projectMetadata.json have a different number of projects — can't join positionally");
}

const results: Array<{ id: string; address: string }> = [];
let donorCursor = 0;

for (let i = 0; i < contractData.campaigns.length; i++) {
  const campaign = contractData.campaigns[i];
  // Joined positionally, not by `address`: this script overwrites
  // projectMetadata.json's addresses on every run, so matching against the
  // (now stale) mock address would only work once. Both mock files list
  // campaigns/projects in the same fixed order.
  const meta = metadata.projects[i];

  // Reuse owners cyclically so more campaigns than owner accounts still deploy
  // (e.g. the 6th campaign wraps back to the first owner).
  const owner = owners[i % owners.length];
  const milestoneAmounts = campaign.milestones.map((m: any) => scaledWei(m.amount));
  const milestoneDescriptions = campaign.milestones.map(
    (_m: any, idx: number) => meta.milestones[idx]?.title ?? `Meilenstein ${idx + 1}`,
  );
  const duration = BigInt(campaign.end - campaign.start);
  const description: string = meta.summary ?? meta.title;

  console.log(`\n[${meta.id}] deploying as owner ${owner.address} ...`);
  const tx = await factory
    .connect(owner)
    .createDonation(description, duration, milestoneAmounts, milestoneDescriptions);
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`createDonation for ${meta.id} did not produce a receipt`);

  const created = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "DonationContractCreated");
  if (!created) throw new Error(`DonationContractCreated event not found for ${meta.id}`);
  const donationAddress: string = created.args.donationContract;
  console.log(`[${meta.id}] deployed at ${donationAddress}`);

  const donation = await ethers.getContractAt("Donation", donationAddress);

  // --- donate up to the scaled target, from a rotating pool of donor accounts ---
  const targetTotal = scaledWei(campaign.totalDonations);
  let remaining = targetTotal;
  const CHUNKS = 4;
  let donorsUsed = 0;
  for (let c = 0; c < CHUNKS && remaining > 0n; c++) {
    const chunk = c === CHUNKS - 1 ? remaining : remaining / BigInt(CHUNKS - c);
    if (chunk <= 0n) continue;
    // The milestone-rejection demo is funded from a FIXED set (accounts #10–#13,
    // incl. the "Beispiel-Spender" persona #10) so that persona can reclaim its
    // refund in the UI. It does NOT advance the global donor cursor, so the
    // documented donor→campaign mapping for every other campaign is unchanged.
    const isRejectionDemo = meta.id === MARK_FAILED_MILESTONE_FOR;
    const donor = isRejectionDemo ? signers[10 + c] : donorPool[donorCursor % donorPool.length];
    if (!isRejectionDemo) donorCursor++;
    donorsUsed++;
    await (await donation.connect(donor).donate({ value: chunk })).wait();
    remaining -= chunk;
  }
  console.log(`[${meta.id}] donated ${ethers.formatEther(targetTotal)} ETH from ${donorsUsed} donor(s)`);

  // DEMO SEAM: this campaign ran out of time below its goal. Jump past its (short)
  // funding window, then markAsFailedFunding() -> Failed(NoFunding), which freezes
  // refundableBalance for donor refunds. Its window is short and it's LAST, so the
  // time jump doesn't expire the other (long-running) campaigns.
  if (meta.id === MARK_FAILED_FUNDING_FOR) {
    const end = Number(await donation.end());
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    if (now <= end) {
      await ethers.provider.send("evm_increaseTime", [end - now + 1]);
      await ethers.provider.send("evm_mine", []);
    }
    await (await donation.connect(owner).markAsFailedFunding()).wait();
    console.log(`[${meta.id}] funding window expired below goal -> marked Failed (NoFunding)`);
    results.push({ id: meta.id, address: donationAddress });
    continue;
  }

  // Funding only completes once totalDonations reaches the goal. If the mock
  // campaign is still under its goal the contract stays in Funding: no
  // validators were selected and there is nothing to approve or pay out.
  if (Number(await donation.currentStatus()) === StatusEnum.Funding) {
    console.log(`[${meta.id}] still Funding (goal not reached) — nothing to approve or pay out`);
    results.push({ id: meta.id, address: donationAddress });
    continue;
  }

  // We don't choose validators — reaching the goal made the contract pick them
  // at random from qualifying donors. Read the selected set and map each address
  // back to its signer so we can act as those validators.
  const onchainValidators = (await donation.getValidators()).map((addr: string) => {
    const s = signerByAddress.get(addr.toLowerCase());
    if (!s) throw new Error(`[${meta.id}] selected validator ${addr} is not a known test signer`);
    return s;
  });
  console.log(`[${meta.id}] contract selected ${onchainValidators.length} validator(s)`);

  // DEMO SEAM: this campaign funds fully and milestone 0 is PAID, but the
  // validators then DECLINE milestone 0 — which fails the project and freezes
  // refundableBalance for donor refunds. Demonstrates the refund flow after a
  // milestone rejection (distinct from the funding-timeout failure below).
  if (meta.id === MARK_FAILED_MILESTONE_FOR) {
    // Approve the project setup so the payout phase opens.
    for (const v of onchainValidators) {
      if (Number(await donation.currentStatus()) !== StatusEnum.ToBeApproved) break;
      await (await donation.connect(v).voteProjectSetup(true)).wait();
    }
    if (Number(await donation.currentStatus()) !== StatusEnum.Payout) {
      throw new Error(`[${meta.id}] setup not approved — cannot demo a milestone rejection`);
    }
    // Pay milestone 0 (opens its vote), then have the validators REJECT it until
    // the contract flips the project to Failed.
    await (await donation.connect(owner).payout(0)).wait();
    for (const v of onchainValidators) {
      if (Number(await donation.currentStatus()) === StatusEnum.Failed) break;
      await (await donation.connect(v).voteMilestone(0, false)).wait();
    }
    if (Number(await donation.currentStatus()) !== StatusEnum.Failed) {
      throw new Error(`[${meta.id}] milestone 0 was not declined — expected Failed`);
    }
    console.log(`[${meta.id}] milestone 0 paid then DECLINED by validators -> Failed (refunds open)`);
    results.push({ id: meta.id, address: donationAddress });
    continue;
  }

  // DEMO SEAM: leave this campaign in ToBeApproved with its project-setup vote
  // OPEN, so a validator can approve the project start from the UI. We pre-cast a
  // few approvals from validators OTHER than the demo persona so that logging in
  // as that persona and approving is the DECIDING vote. We cap the pre-votes at
  // (required - 1) so the vote can NEVER finalize here — with 4 validators the
  // 66.66% threshold is 3, so this leaves exactly 2/4 approved and open.
  if (meta.id === LEAVE_SETUP_OPEN_FOR) {
    // "Beispiel-Validator" persona (Hardhat #14) — kept UNVOTED so its approval
    // in the UI is the one that reaches the threshold. See frontend mockUsers.ts.
    const DEMO_PERSONA = "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097".toLowerCase();
    const required = Math.ceil((onchainValidators.length * 6666) / 10000);
    const prevotes = Math.max(0, required - 1);
    let cast = 0;
    for (const v of onchainValidators) {
      if (cast >= prevotes) break;
      if (v.address.toLowerCase() === DEMO_PERSONA) continue; // keep the persona unvoted
      await (await donation.connect(v).voteProjectSetup(true)).wait();
      cast++;
    }
    console.log(
      `[${meta.id}] left in ToBeApproved with ${cast}/${onchainValidators.length} setup approvals ` +
        `(threshold ${required}) — the persona's vote decides`,
    );
    results.push({ id: meta.id, address: donationAddress });
    continue;
  }

  // Project-setup approval (ToBeApproved -> Payout): every funded campaign must
  // clear this before ANY milestone can be paid. Approve from the selected
  // validators until the contract finalizes the vote (66.66% majority).
  for (const v of onchainValidators) {
    if (Number(await donation.currentStatus()) !== StatusEnum.ToBeApproved) break;
    await (await donation.connect(v).voteProjectSetup(true)).wait();
  }
  if (Number(await donation.currentStatus()) !== StatusEnum.Payout) {
    throw new Error(`[${meta.id}] project setup was not approved — cannot replay payouts`);
  }

  // --- replay milestone payouts/votes ---
  // In this contract a milestone is voted on AFTER it is paid, and that approval
  // is what unlocks the NEXT payout (payout(m+1) requires milestone m approved).
  // Every paid milestone in the seed is approved unanimously (rejected == 0), so
  // pay each and approve until the contract finalizes its vote — this is robust
  // to however many validators were selected. Stop at the first unpaid milestone.
  for (let m = 0; m < campaign.milestones.length; m++) {
    if (!campaign.milestones[m].paid) break;

    await (await donation.connect(owner).payout(m)).wait();

    // DEMO SEAM: for ONE campaign, leave its FINAL paid milestone's vote OPEN so
    // that a validator can vote right after seeding (and, once it's approved, the
    // owner can pay the next milestone) — without this every seeded vote is
    // already finalized and the UI has nothing open to act on. Earlier milestones
    // must still finalize, else their payout wouldn't have been unlocked.
    const isFinalPaid = !campaign.milestones[m + 1]?.paid;
    if (meta.id === LEAVE_VOTE_OPEN_FOR && isFinalPaid) {
      console.log(`[${meta.id}] left milestone ${m} vote OPEN (demo seam)`);
      continue;
    }

    for (const v of onchainValidators) {
      const milestones = await donation.getMilestones();
      if (milestones[m].votingFinished) break;
      await (await donation.connect(v).voteMilestone(m, true)).wait();
    }
  }
  console.log(`[${meta.id}] replayed to status ${campaign.currentStatus}`);

  results.push({ id: meta.id, address: donationAddress });
}

updateFrontendEnv(factoryAddress);
updateMetadataAddresses(results);
await resetBackendDb();

console.log("\nDone. DonationFactory:", factoryAddress);
for (const r of results) console.log(` - ${r.id}: ${r.address}`);
