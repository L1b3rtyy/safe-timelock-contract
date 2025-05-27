//@ts-check
import hardhat from "hardhat";
const { ethers, upgrades } = hardhat;
import argumentsArray from '../arguments.js';
import secrets from '../../secrets.json' assert { type: "json" };
const { safeAddress, latestImplAddress } = secrets;

async function main() {
  const [deployer] = await ethers.getSigners();

  const Guard = await ethers.getContractFactory("TimelockGuardUpgradeable", deployer);
  await upgrades.forceImport(latestImplAddress, Guard, { kind: "transparent" });

  const proxy = await upgrades.deployProxy(Guard, argumentsArray, {
    initializer: "initialize",
    kind: "transparent",
    useDeployedImplementation: true, // 👈 tells plugin to skip logic contract deploy
  });
  console.log("Guard proxy deployed at:", proxy.address);

  const admin = await upgrades.admin.getInstance();
  console.log("Guard proxy admin deployed at:", admin.address);

  await admin.transferOwnership(safeAddress, { gasLimit: 1000000 });
  console.log("Proxy admin ownership transferred.");

  console.log("Deployed by account:", deployer.address);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
