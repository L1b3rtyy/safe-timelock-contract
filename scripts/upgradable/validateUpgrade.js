import hardhat from "hardhat";
const { upgrades } = hardhat;
import secrets from '../../secrets.json' assert { type: "json" };
const { proxyAddress } = secrets;
import { getUpgradeContract } from './_utilUpgrade.js';

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