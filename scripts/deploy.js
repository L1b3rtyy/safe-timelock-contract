//@ts-check
const { ethers } = require("hardhat");
const argumentsArray = require('./arguments.js');

async function main() {
  const [deployer] = await ethers.getSigners();

  const Guard = await ethers.getContractFactory("TimelockGuard", deployer);
  const guard = await Guard.deploy(...argumentsArray);
  await guard.deployed();

  console.log("Guard deployed at:", guard.address);
  console.log("Deployed by account:", deployer.address);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});