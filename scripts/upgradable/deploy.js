//@ts-check
import hardhat from "hardhat";
const { ethers, upgrades } = hardhat;
import argumentsArray from '../arguments.js';
import secrets from '../../secrets.json' assert { type: "json" };
const { safeAddress } = secrets;

async function main() {
  const [deployer] = await ethers.getSigners();

  const Guard = await ethers.getContractFactory("TimelockGuardUpgradeable", deployer);
  const proxy = await upgrades.deployProxy(Guard, argumentsArray, { initializer: 'initialize' });
  console.log("Guard proxy deployed at:", proxy.address);
  await proxy.deployed();
  
  const impAddress = await upgrades.erc1967.getImplementationAddress(proxy.address);
  console.log("Guard implementation deployed at:", impAddress);

  const admin = await upgrades.admin.getInstance();
  console.log("Guard proxy admin deployed at:", admin.address);

  await admin.transferOwnership(safeAddress, { gasLimit: 1000000 });
  console.log("Proxy admin ownership transferred to Safe.");

  console.log("Deployed by account:", deployer.address);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});