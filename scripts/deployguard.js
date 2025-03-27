const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  const timelockModuleAddress = "0x5e089A94b675006914545e03B020BfDE3FA1b156";

  const Guard = await ethers.getContractFactory("TimelockGuard", deployer);
  const guard = await Guard.deploy(timelockModuleAddress);
  await guard.deployed();

  console.log("Timelock Guard deployed at:", guard.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});