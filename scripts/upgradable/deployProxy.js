//@ts-check
const { ethers, upgrades } = require("hardhat");
const argumentsArray = require('../arguments.js');
const { safeAddress } = require('../../secrets.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  const implAddress = "0x1300Ba2Bd3ab957ec7caa3120d2605951a7E19C4";

  const Guard = await ethers.getContractFactory("TimelockGuardUpgradeable", deployer);
  await upgrades.forceImport(implAddress, Guard, { kind: "transparent" });

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
