const { upgrades } = require("hardhat");
const { proxyAddress } = require('../../secrets.json');
const { getUpgradeContract } = require('./_utilUpgrade.js');

async function main() {
  const Guard = await getUpgradeContract();
  const guardAddress = await upgrades.prepareUpgrade(proxyAddress, Guard, { kind: 'transparent' });
  console.log("New guard at:", guardAddress);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });