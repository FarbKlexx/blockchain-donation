import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys the GiftCardProject contract. The DEPLOYER becomes the on-chain
// `owner` (may create cards + manage the whitelist); the constructor's
// `_whiteList` are the initial institutions (may create AND redeem cards).
//
// Default local-dev whitelist: Hardhat test accounts #1 and #6 — the personas
// the frontend can log in as to act as institutions (see mockUsers.ts). Override
// for other networks with an Ignition parameters file:
//   hardhat ignition deploy ignition/modules/GiftCard.ts \
//     --network sepolia --parameters '{"GiftCardModule":{"whiteList":["0x…"]}}'
//
// After deploying, put the printed address in packages/frontend/.env as
// VITE_GIFTCARD_ADDRESS so the frontend can talk to it.
const DEFAULT_WHITELIST = [
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Hardhat account #1
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9", // Hardhat account #6
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", // Hardhat account #7 — "Beispiel-Shop" persona
];

export default buildModule("GiftCardModule", (m) => {
  const whiteList = m.getParameter("whiteList", DEFAULT_WHITELIST);
  const giftCard = m.contract("GiftCardProject", [whiteList]);
  return { giftCard };
});
