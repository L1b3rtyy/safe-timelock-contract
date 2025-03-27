const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  const SafeAddress = "0xA558BF16a22065F33136E9FcdB500bd4A17eca8E";
  const timelockDuration = 86400; // 24 hours
  const cancelQuorum = 5;

  // Pass deployer explicitly to deploy from correct wallet
  const Module = await ethers.getContractFactory("TimelockModule", deployer);
  const module = await Module.deploy(SafeAddress, timelockDuration, cancelQuorum);
  await module.deployed();

  console.log("Timelock Module deployed at:", module.address);
  console.log("Deployed by account:", deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
