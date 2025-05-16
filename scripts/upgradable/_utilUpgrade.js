const { ethers, upgrades } = require("hardhat");
const { proxyAddress } = require('../../secrets.json');

async function getUpgradeContract() {
  const [deployer] = await ethers.getSigners();
  console.log("Force import proxy...");
  // Load the old contract factory
  const Guard_OLD = await ethers.getContractFactory("TimelockGuardUpgradeable_OLD", deployer);
  await upgrades.forceImport(proxyAddress, Guard_OLD, { kind: 'transparent' });
  console.log("Preparing upgrade by account:", deployer.address);
  return ethers.getContractFactory("TimelockGuardUpgradeable", deployer);
}
module.exports = { getUpgradeContract };