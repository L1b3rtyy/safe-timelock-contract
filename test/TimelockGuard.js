import { expect, assert } from "chai";
import hardhat from 'hardhat';
const { ethers } = hardhat;
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { execTransaction, getSafe, ZeroAddress, getSignatures } from "./utils/utils.js";

const toRoot = "0x000000000000000000000000000000000000000";
const toAdd = [toRoot + 2, toRoot + 3, toRoot + 4, toRoot + 5]
const timelockDuration = 30, limitNoTimelock = 10;
const txHash100 = "0x8b132efbd47825da4986d3581f78eddc4865866e7626f34fbe0c14c9a4d50cea";
const quorumCancel = 2, quorumExecute = 3;
const safeTxGas = 0, baseGas = 0, gasPrice = 0;

describe('TimelockGuardUpgradeable', function () { 
  it('initialize', async function () {
    const [safe, other] = await ethers.getSigners();
    const TimelockGuard = await ethers.getContractFactory("TimelockGuardUpgradeable");
    const timelockGuard = await TimelockGuard.deploy();
    await timelockGuard.deployed();

    await expect(
      timelockGuard.initialize(ZeroAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute)
    ).to.be.revertedWith("ZeroAddress");

    await timelockGuard.initialize(safe.address, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute);

    await expect(
      timelockGuard.initialize(other.address, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute)
    ).to.be.revertedWith("InvalidInitialization");
  });
})
describe('TimelockGuard', function () { 
    it('constructor', async function () {
      const [safe] = await ethers.getSigners();
      const TimelockGuard = await ethers.getContractFactory("TimelockGuard");
      
      await expect(
        TimelockGuard.deploy(ZeroAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute).then(timelockGuard => timelockGuard.deployed())
      ).to.be.revertedWith("ZeroAddress");
  
      const timelockGuard = await TimelockGuard.deploy(safe.address, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute);
      await timelockGuard.deployed();
    });
})
describe('BaseTimelockGuard', function () { 
  it('initialize', async function () {
    const [safe, other] = await ethers.getSigners();
    const TimelockGuard = await ethers.getContractFactory("TimelockGuardUpgradeableHack");
    const timelockGuard = await TimelockGuard.deploy();
    await timelockGuard.deployed();

    await expect(
      timelockGuard.initialize(ZeroAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute)
    ).to.be.revertedWith("ZeroAddress");

    await timelockGuard.initialize(safe.address, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute);

    await expect(
      timelockGuard.initialize(other.address, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute)
    ).to.be.revertedWith("UnAuthorized");
  });
  it('queueTransaction', async function () {
    const [timelockGuard, safe, owner1] = await init();

    await expect(
      timelockGuard.queueTransaction(toAdd[0], 11, "0x", 0)
    ).to.emit(timelockGuard, "TransactionQueued");

    await expect(
      timelockGuard.connect(owner1).queueTransaction(toAdd[0], 11, "0x", 0)
    ).to.be.revertedWith("UnAuthorized");

    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x", 0)
    ).to.be.revertedWith("QueuingNotNeeded");
    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x", 1)
    ).to.emit(timelockGuard, "TransactionQueued");

    const MAX_QUEUE = await timelockGuard.MAX_QUEUE();
    for(let i=0; i<MAX_QUEUE; i++)
      await expect(
        timelockGuard.queueTransaction(toAdd[0], 1, "0x01", 0)
      ).to.emit(timelockGuard, "TransactionQueued");

    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x01", 0)
    ).to.be.revertedWith("MaxQueue");
  });
  it('cancelTransaction', async function () {
    const [timelockGuard, safe, owner1] = await init();
    const to = toAdd[0], value = 11, data = "0x", operation = 0;

    await expect(
      timelockGuard.connect(owner1).cancelTransaction(txHash100, 0, 0)
    ).to.be.revertedWith("UnAuthorized");
    await expect(
      timelockGuard.cancelTransaction(txHash100, 0, 0)
    ).to.be.revertedWith("CancelMisMatch");

    const txHash = [];
    txHash[0] = await queueTransaction(timelockGuard, to, value+1, data, operation);
    const nbSameTx = 5;
    for(let i=1; i<nbSameTx+1; i++) {
      txHash[i] = await queueTransaction(timelockGuard, to, value, data, operation);
      assert.isTrue(i==1 || txHash[i]==txHash[1], "Queue severals transactions with same hash");
    }
    txHash[nbSameTx+1] = await queueTransaction(timelockGuard, to, value+1, data, operation);
    assert.equal(txHash[0], txHash[nbSameTx+1], "Queue 2 transactions with same hash");
    txHash[nbSameTx+2] = await queueTransaction(timelockGuard, to, value+2, data, operation);

    await expect(
      timelockGuard.cancelTransaction(txHash[0], 0, 0)
    ).to.be.revertedWith("CancelMisMatch");

    const tests = [
      {desc: "correct position with nb timestamp > 1", pos: 3, hash: 1},
      {desc: "correct position with nb timestamp == 1", pos: 0, hash: nbSameTx+2},
      {desc: "incorrect position", pos: 2, hash: 1, hashPos:0}];
    let nbTx = {[txHash[0]]: 2, [txHash[1]]: nbSameTx, [txHash[nbSameTx+2]]: 1};
    for(const test of tests) {      
      const _txHash = txHash[test.hash];
      const txs = await getTransactions(timelockGuard, _txHash, nbTx[_txHash]);
      const hashPos = test.hashPos===undefined ? test.pos : test.hashPos;
      const timestamp = txs[hashPos];
      console.log("cancelTransaction - " + test.desc + ", [pos, timestamp]=" + [test.pos, timestamp] + ", transactions before=", txs);
      await expect(
        timelockGuard.cancelTransaction(_txHash, test.pos, timestamp)
      ).to.emit(timelockGuard, "TransactionCanceled");
      nbTx[_txHash]--;
      const txsAfter = await getTransactions(timelockGuard, _txHash, nbTx[_txHash]);
      console.log("cancelTransaction - " + test.desc + ", transactions after=", txsAfter);
      txs.splice(hashPos, 1);
      assert.equal(txs.toString(), txsAfter.toString(), "compare txs vs txsAfter - desc=" + test.desc);
    }
    console.log("cancelTransaction - no match"); 
    await expect(
      timelockGuard.cancelTransaction(txHash[1], 1, 999)
    ).to.be.revertedWith("CancelMisMatch");
  });
  it('setConfig', async function () {
    const [timelockGuard, safe, owner1] = await init();

    await expect(
      timelockGuard.connect(owner1).setConfig(20, limitNoTimelock, 0, 100, [])
    ).to.be.revertedWith("UnAuthorized");
    await expect(
      timelockGuard.setConfig(120960000, limitNoTimelock, 0, 100, [])
    ).to.be.revertedWith("InvalidConfig");
    await expect(
      timelockGuard.setConfig(20, 5, 0, 100, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    
    const to1 = toAdd[0], to2 = toAdd[1], value = 11, data = "0x", operation = 0;
    const txHash1 = await queueTransaction(timelockGuard, to1, value, data, operation);
    await queueTransaction(timelockGuard, to1, value, data, operation);
    await queueTransaction(timelockGuard, to1, value, data, operation);
    const txHash2 = await queueTransaction(timelockGuard, to2, value, data, operation);

    const txs = await getTransactions(timelockGuard, txHash1, 3);

    await expect(
      timelockGuard.cancelTransaction(txHash1, 1, txs[1])
    ).to.emit(timelockGuard, "TransactionCanceled");
    await expect(
      timelockGuard.setConfig(25, 8, 0, 100, [txHash1, txHash2])
    ).to.emit(timelockGuard, "TimelockConfigChanged").to.emit(timelockGuard, "TransactionsCleared");
    await expect(
      timelockGuard.cancelTransaction(txHash1, 0, 0)
    ).to.be.revertedWith("CancelMisMatch");
    await expect(
      timelockGuard.cancelTransaction(txHash2, 0, 0)
    ).to.be.revertedWith("CancelMisMatch");

    
    await expect(
      timelockGuard.setConfig(0, 5, 0, 100, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    await expect(
      timelockGuard.queueTransaction(to1, value, data, operation)
    ).to.be.revertedWith("QueuingNotNeeded");
  });  
  it('validateAndMarkExecuted', async function () {
    const [timelockGuard] = await init();
    const to = toAdd[0], value = 11, data = "0x", operation = 0;
    const signatures = [], executor = toAdd[0];

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("QueuingNeeded");
    await timelockGuard.checkTransaction(to, 1, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor);

    await expect(
      timelockGuard.queueTransaction(to, value, data, operation)
    ).to.emit(timelockGuard, "TransactionQueued");

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("TimeLockActive");

    await time.increase(2*timelockDuration);

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted");

    const timeReset = 2000000000;
    await time.increaseTo(timeReset+9);

    // executesAfter = [10, 30], time = 70 => expected = [10] 
    const txHash = await queueTransaction(timelockGuard, to, value, data, operation); // t = 10
    await time.increaseTo(timeReset+29);
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 30
    await time.increaseTo(timeReset+68);
    await expect(                                                                      // t = 70
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted");
    await checkExecuteAfter(timelockGuard, timeReset, txHash, [10], "check1");
    
    // executesAfter = [10, 70], time = 90 => expected = [70] 
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 70
    await time.increaseTo(timeReset+89);
    await expect(                                                                      // t = 90
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted");
    await checkExecuteAfter(timelockGuard, timeReset, txHash, [70], "check2");
    
    // executesAfter = [70, 90, 107, 124], time = 124 => expected = [70, 107, 124] 
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 90
    await time.increaseTo(timeReset+106);
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 107
    await time.increaseTo(timeReset+123);
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 124
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted");
    await checkExecuteAfter(timelockGuard, timeReset, txHash, [70, 107, 124], "check3");

    await expect(
      timelockGuard.setConfig(0, 5, 0, 100, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionCleared");
  });
  it('checkTransaction', async function () {
    const [timelockGuard, safe, owner1] = await init();
    const to = toAdd[0], value = 11, data = "0x", operation = 0;
    const signatures = [], executor = toAdd[0];

    await expect(
      timelockGuard.connect(owner1).checkTransaction(timelockGuard.address, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("UnAuthorized");

    await expect(
      timelockGuard.checkTransaction(timelockGuard.address, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("QueuingNeeded");

    const txHash = await queueTransaction(timelockGuard, to, value, data, operation);
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("TimeLockActive");
    await time.increase(timelockDuration+1);
    await timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor);

    const configData = buildData("setConfig", [timelockDuration, limitNoTimelock, 1, 2, []]);
    await expect(
      timelockGuard.checkTransaction(timelockGuard.address, 0, configData, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("QueuingNeeded");

    const queueData = buildData("queueTransaction", [to, value, data, 0]);
    await timelockGuard.checkTransaction(timelockGuard.address, value, queueData, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor);
    const cancelData = buildData("cancelTransaction", [txHash, 0, 0]);
    await timelockGuard.checkTransaction(timelockGuard.address, value, cancelData, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor);
    await expect(
      timelockGuard.setConfig(timelockDuration, limitNoTimelock, 1, 2, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    await expect(
      timelockGuard.checkTransaction(timelockGuard.address, value, cancelData, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("UnAuthorized");
  });  
  it('checkAfterExecution', async function () {
    const [timelockGuard] = await init();

    await timelockGuard.checkAfterExecution(txHash100, true);
    await timelockGuard.checkAfterExecution(txHash100, false);
  });  
  it('setConfig - change timelockDuration', async function () {
    const [timelockGuard] = await init(1000);

    const to = toAdd[0], value = 11, data = "0x", operation = 0;
    const txHash = await queueTransaction(timelockGuard, to, value, data, operation);
    const newTimelockDuration = 10;

    await expect(
      timelockGuard.setConfig(newTimelockDuration, limitNoTimelock, 0, 100, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    
    await queueTransaction(timelockGuard, to, value, data, operation);

    time.increase(newTimelockDuration+1);

    const transactions = await getTransactions(timelockGuard, txHash, 2);
    const latest = await time.latest()
    assert.isTrue(transactions[1]<latest, "Confirm latest transactions can be executed");

    const signatures = [], executor = toAdd[0];
    await timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor);
  });  
});
describe("End To End", function () {
  const threshold = 2, quorumCancel = 3, quorumExecute = 4, nbOwners = 5;
  it('Queuing and executing a transaction after the timelock', async function () {
    const { owners, safe, guard } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute]);
    const requiredSigners = owners.slice(0, threshold);

    await owners[0].sendTransaction({to: safe.address, value: 10000});
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - before execution");

    console.log("queuing transaction");
    const rawTxData = [owners[0].address, 1000, "0x", 0];
    const queueData = buildData("queueTransaction", rawTxData);
    expect(await execTransaction(requiredSigners, safe, guard.address, 0, queueData));
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - after queuing transaction");

    console.log("trying to execute transaction before timelock");
    await expect(
      execTransaction(requiredSigners, safe, ...rawTxData)
    ).to.be.revertedWith("TimeLockActive");
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - after reverted execution");

    console.log("waiting for timelock to expire");
    await time.increase(timelockDuration + 1);
    expect(await execTransaction(requiredSigners, safe, ...rawTxData));
    assert.equal(await ethers.provider.getBalance(safe.address), 9000, "Check safe balance - after execution");
  }); 
  it('Execute a transaction directly with quorumExecute > threshold', async function () {
    const { owners, safe, others } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute]);

    await owners[0].sendTransaction({to: safe.address, value: 10000});
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - before execution");

    console.log("direct execute with #signers = threshold < quorumExecute");
    const rawTxData = [owners[0].address, 1000, "0x", 0];
    await expect(
      execTransaction(owners.slice(0, threshold), safe, ...rawTxData)
    ).to.be.revertedWith("QueuingNeeded");
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - #signers = threshold");

    console.log("direct execute with #signers = quorumExecute > threshold but non owners (=" + others.last.address + ")");
    await expect(
      execTransaction([...owners.slice(0, quorumExecute-1), others.last], safe, ...rawTxData)
    ).to.be.reverted;
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - #signers = quorumExecute but with a non owner");

    console.log("direct execute with #signers = quorumExecute > threshold");
    expect(await execTransaction(owners.slice(0, quorumExecute), safe, ...rawTxData));
    assert.equal(await ethers.provider.getBalance(safe.address), 9000, "Check safe balance - after execution with quorumExecute > threshold");
  });
  it('Execute a transaction directly with quorumExecute > threshold', async function () {
    // This test is used to optimized the gas usage of the checkNSignatures function, which is not properly calculated if the guard is called from the Safe contract.
    const { owners, safe, others, guard } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute]);
    const to = toAdd[0], value = 11, data = "0x", operation = 0;

    await owners[0].sendTransaction({to: safe.address, value: 1000000000000000});
    assert.equal(await ethers.provider.getBalance(safe.address), 1000000000000000, "Check safe balance - before execution");

    console.log("direct execute with #signers = threshold < quorumExecute");
    await expect(
      checkTransaction(owners.slice(0, threshold), to, value, data, operation, guard, safe)
    ).to.be.revertedWith("QueuingNeeded");

    console.log("direct execute with #signers = quorumExecute > threshold but non owners (=" + others.last.address + ")");
    await expect(
      checkTransaction([...owners.slice(0, quorumExecute-1), others.last], to, value, data, operation, guard, safe)
    ).to.be.reverted;

    console.log("direct execute with #signers = quorumExecute > threshold");
    expect(await checkTransaction(owners.slice(0, quorumExecute), to, value, data, operation, guard, safe));
  });
  it('Execute a transaction directly with quorumExecute = threshold', async function () {
    const { owners, safe } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, threshold]);

    await owners[0].sendTransaction({to: safe.address, value: 10000});
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - before execution");

    console.log("direct execute with #signers = threshold = quorumExecute");
    const rawTxData = [owners[0].address, 1000, "0x", 0];
    await expect(
      execTransaction(owners.slice(0, threshold), safe, ...rawTxData)
    ).to.be.revertedWith("QueuingNeeded");
  });
  it('Canceling a transaction with quorumCancel > threshold', async function () {
    const { owners, safe, guard, others } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute]);
    const requiredSigners = owners.slice(0, threshold);

    await owners[0].sendTransaction({to: safe.address, value: 10000});
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - before execution");

    const rawTxData = [owners[0].address, 1000, "0x", 0];
    const queueData = buildData("queueTransaction", rawTxData);
    const txHash = await getEventQueue(await execTransaction(requiredSigners, safe, guard.address, 0, queueData));

    const lastBlock = await ethers.provider.getBlock("latest");
    const cancelData = buildData("cancelTransaction", [txHash, 0, lastBlock.timestamp]);
    console.log("cancelling with #signers = threshold < quorumCancel");
    await expect(
      execTransaction(requiredSigners, safe, guard.address, 0, cancelData)
    ).to.be.reverted;
    console.log("cancelling with #signers = quorumCancel > threshold but non owners (=" + others.last.address + ")");
    await expect(
      execTransaction([...owners.slice(0, quorumCancel-1), others.last], safe, guard.address, 0, cancelData)
    ).to.be.reverted;
    console.log("cancelling with #signers = quorumCancel > threshold");
    expect(await execTransaction(owners.slice(0, quorumCancel), safe, guard.address, 0, cancelData));
  }); 
  it('Canceling a transaction with quorumCancel = threshold', async function () {
    const { owners, safe, guard } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, threshold, quorumExecute]);
    const requiredSigners = owners.slice(0, threshold);

    await owners[0].sendTransaction({to: safe.address, value: 10000});
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - before execution");

    const rawTxData = [owners[0].address, 1000, "0x", 0];
    const queueData = buildData("queueTransaction", rawTxData);
    const txHash = await getEventQueue(await execTransaction(requiredSigners, safe, guard.address, 0, queueData));

    const lastBlock = await ethers.provider.getBlock("latest");
    const cancelData = buildData("cancelTransaction", [txHash, 0, lastBlock.timestamp]);
    console.log("cancelling with #signers = quorumCancel = threshold");
    expect(await execTransaction(owners.slice(0, threshold), safe, guard.address, 0, cancelData));
  });
  it('Removing the guard', async function () {
    const { owners, safe, guard, masterCopy } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute]);
    const requiredSigners = owners.slice(0, threshold);

    assert.equal(await getGuard(safe), guard.address, "Check guard - before removal");

    console.log("queuing transaction");
    const setGuardData = masterCopy.interface.encodeFunctionData("setGuard", [ ZeroAddress ]);
    const rawTxData = [safe.address, 0, setGuardData, 0]
    const queueData = buildData("queueTransaction", rawTxData);
    expect(await execTransaction(requiredSigners, safe, guard.address, 0, queueData));

    console.log("waiting for timelock to expire");
    await time.increase(timelockDuration + 1);

    console.log("executing transaction to remove the guard");
    expect(await execTransaction(requiredSigners, safe, ...rawTxData));

    assert.equal(await getGuard(safe), ZeroAddress, "Check guard - after removal");
  });
})
async function getGuard(safe) {
  return safe.getStorageAt("0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8", 1)
  .then(data => ethers.utils.getAddress("0x" + data.slice(26, 66)))
}
async function getTransactions(timelockGuard, txHash, nb) {
  const res = [];
  for(let i=0; i<nb; i++)
    res[i] = (await timelockGuard.transactions(txHash, i)).toNumber();
  return res;
}
async function checkExecuteAfter(timelockGuard, timeReset, txHash, exp, log) {
  for(let i=0; i < exp.length; i++)
    assert.equal((await timelockGuard.transactions(txHash, i)).toNumber()-timeReset, exp[i], "checkExecuteAfter - " + log + ", i=" + i); 
}
async function queueTransaction(timelockGuard, to, value, data, operation) {
  return getEventQueue(await timelockGuard.queueTransaction(to, value, data, operation));
}
async function getEventQueue(tx) {
  const receipt = await tx.wait();
  assert.isTrue(Boolean(receipt && receipt.events && receipt.events.length && receipt.events[0] && receipt.events[0].data), "getEventQueue")
  return receipt.events[0].data;
}
async function init(_timelockDuration) {
  const [safe, owner1, owner2] = await ethers.getSigners();
  const TimelockGuard = await ethers.getContractFactory("TimelockGuardUpgradeable");
  const timelockGuard = await TimelockGuard.deploy();
  await timelockGuard.deployed();
  await timelockGuard.initialize(safe.address, _timelockDuration || timelockDuration, limitNoTimelock, 0, 100);
  return [timelockGuard, safe, owner1, owner2];
}
function buildData(functionName, args) {
  let moduleAbi = "";
  if(functionName == "setConfig")           moduleAbi = "function setConfig(uint64 _timelockDuration, uint128 _limitNoTimelock, uint32 _quorumCancel, uint32 _quorumExecute, bytes32[] calldata clearHashes)";
  if(functionName == "queueTransaction")    moduleAbi = "function queueTransaction(address to, uint256 value, bytes calldata data, uint8 operation)";
  if(functionName == "cancelTransaction")   moduleAbi = "function cancelTransaction(bytes32 txHash, uint256 timestampPos, uint256 timestamp)";
  const iface = new ethers.utils.Interface([moduleAbi]);
  return iface.encodeFunctionData(functionName, args);
}
async function checkTransaction(wallets, to, value, data, operation, timelockGuard, safe) {
    // Get signature with a nonce increment of -1 to match the guard. Check the guard code for more details. 
    const signatures = await getSignatures(wallets, safe, to, value, data, operation, -1);
    const contractSigner = await ethers.getImpersonatedSigner(safe.address);
    return timelockGuard.connect(contractSigner).checkTransaction(to, value, data, operation, 0, 0, 0, ZeroAddress, ZeroAddress, signatures, safe.address);
}