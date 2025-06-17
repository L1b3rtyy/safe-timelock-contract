import { assert } from "chai";
import hardhat from "hardhat";
const { ethers } = hardhat; // ✅ Works with CJS in ESM

export const ZeroAddress = "0x0000000000000000000000000000000000000000";

export async function getSafe(nbOwners, threshold, contractName, argFunc) {
  const accounts = await ethers.getSigners();
  // nbOwners for the owners, plus 1 for the deployer, plus 2 for the first and last that will be non-owners
  assert.isAtLeast(accounts.length, nbOwners + 3, "Not enough accounts available, decrease the number of owners or increase the number of accounts in your test environment");
  // Ensure the accounts are ordered by address so that we control the order of the owners when calling the execTransaction function
  orderWallets(accounts);
  const deployer = accounts[0];
  const safeFactory = await ethers.getContractFactory("Safe", deployer);
  const masterCopy = await safeFactory.deploy();

  const proxyFactory = await (
    await ethers.getContractFactory("SafeProxyFactory", deployer)
  ).deploy();

  const others = {first: accounts[1], last: accounts[accounts.length-1]};
  const owners = accounts.slice(2, nbOwners+2);
  const ownerAddresses = owners.map(x => x.address);

  const safeData = masterCopy.interface.encodeFunctionData("setup", [
    ownerAddresses,
    threshold,
    ZeroAddress,
    "0x",
    ZeroAddress,
    ZeroAddress,
    0,
    ZeroAddress,
  ]);

  // Read the safe address by executing the static call to createProxyWithNonce function
  const safeAddress = await proxyFactory.callStatic.createProxyWithNonce(
    masterCopy.address,
    safeData,
    0n
  );

  // Create the proxy with nonce
  await proxyFactory.createProxyWithNonce(
    masterCopy.address,
    safeData,
    0n
  );

  if (safeAddress === ZeroAddress)
    throw new Error("Safe address not found");

  // Deploy the NoDelegatecallGuard contract
  const Guard = await ethers.getContractFactory(contractName, deployer)
  const guard = await Guard.deploy();
  await guard.deployed();
  if(argFunc)
    await guard.initialize(...argFunc(safeAddress));

  const safe = await ethers.getContractAt("Safe", safeAddress);

  const testedSafeVersions = await guard.TESTED_SAFE_VERSIONS(); 
  const safeVersion = await safe.VERSION();
  assert.isTrue(testedSafeVersions.includes(safeVersion), "Safe version not tested: [safeVersion, testedSafeVersions]" + [safeVersion, "|" ,testedSafeVersions]);

  // Set the guard in the safe
  const setGuardData = masterCopy.interface.encodeFunctionData("setGuard", [ guard.address ]);

  // Execute the transaction to set the Guard
  const signers = owners.slice(0, threshold);
  await execTransaction(signers, safe, safe.address, 0, setGuardData, 0);

  return { owners, safe, masterCopy, others, guard }; 
}

export async function execTransaction(wallets, safe, to, value, data = "0x", operation = 0, malformed, notOrder) {
  let signatureBytes = await getSignatures(wallets, safe, to, value, data, operation, 0, notOrder);
  if(malformed)
    signatureBytes = signatureBytes.slice(0, -2);

  return safe.execTransaction(
    to,
    value,
    data,
    operation,
    0,
    0,
    0,
    ZeroAddress,
    ZeroAddress,
    signatureBytes
  );
};

export async function getSignatures(wallets, safe, to, value, data = "0x", operation = 0, nonceIncrement = 0, notOrder) {
  const nonce = parseInt(await safe.nonce());

  // Get the transaction hash for the Safe transaction
  const transactionHash = await safe.getTransactionHash(
    to,
    value,
    data,
    operation,
    0,
    0,
    0,
    ZeroAddress,
    ZeroAddress,
    String(nonce + nonceIncrement)
  );

  let signatureBytes = "0x";
  const bytesDataHash = ethers.utils.arrayify(transactionHash);

  // Sort the signers by their addresses
  const sorted = notOrder ? [...wallets]: orderWallets([...wallets])

  // Sign the transaction hash with each signer
  for (let i = 0; i < sorted.length; i++) {
    const flatSig = (await sorted[i].signMessage(bytesDataHash))
      .replace(/1b$/, "1f")
      .replace(/1c$/, "20");
    signatureBytes += flatSig.slice(2);
  }
  return signatureBytes;
}
function orderWallets(wallets) {
  return wallets.sort((a, b) => a.address.localeCompare(b.address, "en", { sensitivity: "base" }));
}