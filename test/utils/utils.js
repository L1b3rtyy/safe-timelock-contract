const { assert } = require("chai");
const { ethers } = require("hardhat");

const ZeroAddress = "0x0000000000000000000000000000000000000000";

const versionArg = process.env.SAFE_VERSION || "1.4.1";
console.log("Testing for Safe version: " + versionArg);

let safeFQN, proxyFactoryFQN;

if (versionArg === "1.3.0") {
  safeFQN = "external/safe-1.3.0/contracts/GnosisSafe.sol:GnosisSafe";
  proxyFactoryFQN = "external/safe-1.3.0/contracts/proxies/GnosisSafeProxyFactory.sol:GnosisSafeProxyFactory";
} else if (versionArg === "1.4.0") {
  safeFQN = "external/safe-1.4.0/contracts/Safe.sol:Safe";
  proxyFactoryFQN = "external/safe-1.4.0/contracts/proxies/SafeProxyFactory.sol:SafeProxyFactory";
} else {
  safeFQN = "@safe-global/safe-contracts/contracts/Safe.sol:Safe";
  proxyFactoryFQN = "@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol:SafeProxyFactory";
}

async function getSafe(nbOwners, threshold, contractName, argFunc) {
  const accounts = await ethers.getSigners();
  // nbOwners for the owners, plus 1 for the deployer, plus 2 for the first and last that will be non-owners
  assert.isAtLeast(accounts.length, nbOwners + 3, "Not enough accounts available, decrease the number of owners or increase the number of accounts in your test environment");
  // Ensure the accounts are ordered by address so that we control the order of the owners when calling the execTransaction function
  orderWallets(accounts);
  const deployer = accounts[0];
  const safeFactory = await ethers.getContractFactory(safeFQN, { signer: deployer });
  const masterCopy = await safeFactory.deploy();

  const proxyFactory = await (
    await ethers.getContractFactory(proxyFactoryFQN, { signer: deployer })
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

  const safe = await ethers.getContractAt(safeFQN, safeAddress);

  const testedSafeVersions = await guard.TESTED_SAFE_VERSIONS(); 
  const safeVersion = await safe.VERSION();
  assert.strictEqual(safeVersion, versionArg, "Safe not as expected version");
  assert.isTrue(testedSafeVersions.includes(safeVersion), "Safe version not tested: [safeVersion, testedSafeVersions]" + [safeVersion, "|" ,testedSafeVersions]);

  // Set the guard in the safe
  const setGuardData = masterCopy.interface.encodeFunctionData("setGuard", [ guard.address ]);

  // Execute the transaction to set the Guard
  const signers = owners.slice(0, threshold);
  await execTransaction(signers, safe, safe.address, 0, setGuardData, 0);

  return { owners, safe, masterCopy, others, guard }; 
}

async function execTransaction(wallets, safe, to, value, data = "0x", operation = 0, malformed, orderSection, useEIP712Sign = []) {
  let signatureBytes = await getSignatures(wallets, safe, to, value, data, operation, 0, orderSection, useEIP712Sign);

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
}

async function getSignatures(wallets, safe, to, value, data = "0x", operation = 0, nonceIncrement = 0, orderSection, useEIP712Sign = []) {
  if(orderSection === true || orderSection === 0) {
    console.error("Invalid orderSection=" + orderSection);
    throw new Error("Invalid orderSection=" + orderSection);
  }
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
  const sorted = orderSection ? [...orderWallets(wallets.slice(0, orderSection)), ...orderWallets(wallets.slice(orderSection, wallets.length))] : (orderSection === null ? [...wallets] : orderWallets([...wallets]));

  for (let i = 0; i < sorted.length; i++) {

    let flatSig;
    if (!useEIP712Sign.includes(i)) {
      // Use eth_sign (v > 30)
      flatSig = (await sorted[i].signMessage(bytesDataHash))
        .replace(/1b$/, "1f")
        .replace(/1c$/, "20");
    } else {
      // Use EIP-712
      const wallet = sorted[i];
      const domain = { verifyingContract: safe.address, chainId: await wallet.getChainId() };

      const types = {
        SafeTx: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
          { name: "operation", type: "uint8" },
          { name: "safeTxGas", type: "uint256" },
          { name: "baseGas", type: "uint256" },
          { name: "gasPrice", type: "uint256" },
          { name: "gasToken", type: "address" },
          { name: "refundReceiver", type: "address" },
          { name: "nonce", type: "uint256" },
        ],
      };

      const message = {
        to,
        value,
        data,
        operation,
        safeTxGas: 0,
        baseGas: 0,
        gasPrice: 0,
        gasToken: ZeroAddress,
        refundReceiver: ZeroAddress,
        nonce: nonce + nonceIncrement,
      };

      const signature = await wallet._signTypedData(domain, types, message);
      const { r, s, v } = ethers.utils.splitSignature(signature);
      flatSig = r + s.slice(2) + ethers.utils.hexlify(v).slice(2); // v is 27 or 28
    }
    signatureBytes += flatSig.slice(2); // remove '0x' before concatenating
  }
  return signatureBytes;
}
function orderWallets(wallets) {
  return wallets.sort((a, b) => a.address.localeCompare(b.address, "en", { sensitivity: "base" }));
}

module.exports = { ZeroAddress, getSafe, execTransaction, getSignatures};