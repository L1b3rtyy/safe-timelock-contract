//@ts-check
const { ethers } = require("hardhat");
const argumentsArray = require('./arguments.js');

async function main() {
  const [SafeAdd, timelockDuration, throttle, limitNoTimelock] = argumentsArray;
  const [deployer] = await ethers.getSigners();

  const Module = await ethers.getContractFactory("TimelockGuard", deployer);
  const module = await Module.deploy(SafeAdd, timelockDuration, throttle, limitNoTimelock);
  await module.deployed();

  console.log("Timelock Module deployed at:", module.address);
  console.log("Deployed by account:", deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
