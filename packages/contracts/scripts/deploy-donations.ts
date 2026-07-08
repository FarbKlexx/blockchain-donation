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
const validators = signers.slice(6, 9);
const donorPool = signers.slice(9, 20);

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

  const owner = owners[i];
  const validatorAddresses = validators.map((v) => v.address);
  const milestoneAmounts = campaign.milestones.map((m: any) => scaledWei(m.amount));
  const milestoneDescriptions = campaign.milestones.map(
    (_m: any, idx: number) => meta.milestones[idx]?.title ?? `Meilenstein ${idx + 1}`,
  );
  const duration = BigInt(campaign.end - campaign.start);
  const description: string = meta.summary ?? meta.title;

  console.log(`\n[${meta.id}] deploying as owner ${owner.address} ...`);
  const tx = await factory
    .connect(owner)
    .createDonation(validatorAddresses, description, duration, milestoneAmounts, milestoneDescriptions);
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
    const donor = donorPool[donorCursor % donorPool.length];
    donorCursor++;
    donorsUsed++;
    await (await donation.connect(donor).donate({ value: chunk })).wait();
    remaining -= chunk;
  }
  console.log(`[${meta.id}] donated ${ethers.formatEther(targetTotal)} ETH from ${donorsUsed} donor(s)`);

  // --- replay milestone payouts/votes, driven directly by contractData.json's target state ---
  // Each milestone's approvedCount/rejectedCount describe votes cast ON that
  // milestone (after it's paid) to gate the payout of the NEXT one — see
  // contractData.json's own `_comment`. Stop at the first unpaid milestone.
  for (let m = 0; m < campaign.milestones.length; m++) {
    const target = campaign.milestones[m];
    if (!target.paid) break;

    await (await donation.connect(owner).payout(m)).wait();

    // The contract auto-finalizes voting the instant the 66.66% approve/
    // reject threshold is crossed (e.g. 2 of 3 validators already clears
    // it), so casting the mock's raw approvedCount/rejectedCount blindly
    // can revert with "Milestone Voting has already finished". Cast up to
    // that many votes, but stop as soon as the milestone actually finishes.
    let approvesCast = 0;
    let rejectsCast = 0;
    for (let v = 0; v < validators.length; v++) {
      if (approvesCast >= target.approvedCount && rejectsCast >= target.rejectedCount) break;
      const milestones = await donation.getMilestones();
      if (milestones[m].votingFinished) break;

      if (approvesCast < target.approvedCount) {
        await (await donation.connect(validators[v]).voteMilestone(m, true)).wait();
        approvesCast++;
      } else {
        await (await donation.connect(validators[v]).voteMilestone(m, false)).wait();
        rejectsCast++;
      }
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
