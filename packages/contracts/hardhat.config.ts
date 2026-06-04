import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  // TypeChain-Typen werden beim Compile nach types/ethers-contracts generiert
  // und per scripts/copy-artifacts.js ins Frontend gespiegelt. tsNocheck setzt
  // ein // @ts-nocheck in die generierten Dateien, damit das strenge
  // Frontend-Type-Check (vue-tsc) nicht an Generat-Code scheitert. Die
  // exportierten Contract-Typen bleiben für Importeure voll typisiert.
  typechain: {
    tsNocheck: true,
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
