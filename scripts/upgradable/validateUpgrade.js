const { upgrades } = require("hardhat");
const { proxyAddress } = require('../../secrets.json');
const { getUpgradeContract } = require('./_utilUpgrade.js');

async function main() {
  const Guard = await getUpgradeContract();
  await upgrades.validateUpgrade(proxyAddress, Guard, { kind: 'transparent' });
  console.log("Validation done");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });