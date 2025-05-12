//@ts-check
const { ethers, upgrades } = require("hardhat");
const argumentsArray = require('./arguments.js');

async function main() {
  if (argumentsArray.length !== 4)
    throw new Error("Expected 4 constructor arguments. Check your arguments.js file.");
  const [SafeAdd, timelockDuration, throttle, limitNoTimelock] = argumentsArray;
  const [deployer] = await ethers.getSigners();

  const Guard = await ethers.getContractFactory("TimelockGuard", deployer);
  const guard = await upgrades.deployProxy(Guard, [SafeAdd, timelockDuration, throttle, limitNoTimelock], { initializer: 'initialize' });

  console.log("Guard proxy deployed at:", guard.address);

  const admin = await upgrades.admin.getInstance();
  console.log("Guard proxy admin deployed at:", admin.address);

  await admin.transferOwnership(SafeAdd);
  console.log("Proxy admin ownership transferred.");

  console.log("Deployed by account:", deployer.address);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});