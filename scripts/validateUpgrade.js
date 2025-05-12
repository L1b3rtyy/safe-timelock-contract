const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxyAddress = '0x09414351726200E272dFCD31F5092a78CB4EC3c8';

  const [deployer] = await ethers.getSigners();
  console.log("Force import proxy...");
  const Guardv020 = await ethers.getContractFactory("TimelockGuardv020", deployer);
  await upgrades.forceImport(proxyAddress, Guardv020, { kind: 'transparent' });
  console.log("Validating upgrade...");
  const Guard = await ethers.getContractFactory("TimelockGuard", deployer);
  await upgrades.validateUpgrade(proxyAddress, Guard, { kind: 'transparent' });
  console.log("Validation done");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });