import { network } from "hardhat";

/**
 * Deploys PraiseBoard to Ethereum Sepolia through the QuickNode HTTP
 * endpoint configured in hardhat.config.ts (network "sepolia"), using the
 * burner/testnet wallet from DEPLOYER_PRIVATE_KEY.
 *
 * Run with: npm run deploy:sepolia
 */
async function main() {
  const { ethers } = await network.create({ network: "sepolia" });

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log("Deployer address:", deployer.address);
  console.log("Network / Chain ID:", net.name || "sepolia", "/", net.chainId.toString());

  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer Sepolia ETH balance:", ethers.formatEther(deployerBalance), "ETH");

  console.log("\nDeploying PraiseBoard...");
  const praiseBoard = await ethers.deployContract("PraiseBoard");
  await praiseBoard.waitForDeployment();

  const address = await praiseBoard.getAddress();
  const deployTx = praiseBoard.deploymentTransaction();

  console.log("\n=== PraiseBoard deployed ===");
  console.log("Contract address:", address);
  console.log("Transaction hash:", deployTx?.hash ?? "(unknown)");
  console.log("Etherscan (contract):", `https://sepolia.etherscan.io/address/${address}`);
  if (deployTx?.hash) {
    console.log("Etherscan (tx):", `https://sepolia.etherscan.io/tx/${deployTx.hash}`);
  }
  console.log("\nNext step: put this address in frontend/src/contract.ts (CONTRACT_ADDRESS).");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
