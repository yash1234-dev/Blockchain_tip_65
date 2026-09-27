import "dotenv/config";
import { createRequire } from "node:module";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

// Use the exact solc build bundled by the "solc" npm package instead of
// letting Hardhat download a compiler binary at build time. This pins the
// compiler version precisely, keeps compilation reproducible, and works in
// network-restricted environments (CI runners, sandboxes) that can't reach
// binaries.soliditylang.org.
const require = createRequire(import.meta.url);
const solcJsPath = require.resolve("solc/soljson.js");

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
        path: solcJsPath,
      },
      production: {
        version: "0.8.24",
        path: solcJsPath,
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
    // In-memory simulated network used by `hardhat test`.
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // Ethereum Sepolia, reached through a QuickNode HTTP endpoint.
    // QUICKNODE_SEPOLIA_URL and DEPLOYER_PRIVATE_KEY are read from the
    // environment (.env, never committed) - see .env.example.
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: configVariable("QUICKNODE_SEPOLIA_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
