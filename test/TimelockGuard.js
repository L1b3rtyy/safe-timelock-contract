import { expect, assert } from "chai";
import hardhat from 'hardhat';
const { ethers } = hardhat;
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { execTransaction, getSafe, ZeroAddress, getSignatures } from "./utils/utils.js";

const consoleLog = () => {};  // Set to console.log to enable

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

      const isVersion = str => {
        const parts = str.split(".");
        if(parts.length != 3)
          return false;
        for(let i=0; i < parts.length; i++) {
          const temp = Number.parseInt(parts[i]);
          if(isNaN(temp) || temp < 0)
            return false;
        }
        return true;
      }
      const version = await timelockGuard.VERSION()
      assert.isTrue(isVersion(version), "Invalid version=" + version);

      const testedSafeVersion = await timelockGuard.TESTED_SAFE_VERSIONS();
      const parts = testedSafeVersion.split("|");
      for(const part of parts)
        assert.isTrue(isVersion(part), "Invalid version part=" + part);
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
    ).to.be.revertedWith("UnAuthorized").withArgs(safe.address, 1);
  });
  it('queueTransaction', async function () {
    const [timelockGuard, safe, owner1] = await init();

    consoleLog("QueuingNotNeeded with value lower than the limit");
    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x", 0)
    ).to.be.revertedWith("QueuingNotNeeded");
    consoleLog("QueuingNotNeeded with value equal to the limit");
    await expect(
      timelockGuard.queueTransaction(toAdd[0], limitNoTimelock, "0x", 0)
    ).to.be.revertedWith("QueuingNotNeeded");
    consoleLog("Queueing with value above the limit");
    await expect(
      timelockGuard.queueTransaction(toAdd[0], limitNoTimelock+1, "0x", 0)
    ).to.emit(timelockGuard, "TransactionQueued");
    await expect(
      timelockGuard.connect(owner1).queueTransaction(toAdd[0], limitNoTimelock+1, "0x", 0)
    ).to.be.revertedWith("UnAuthorized").withArgs(owner1.address, 0);
    consoleLog("Queueing with value below the limit but different operation");
    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x", 1)
    ).to.emit(timelockGuard, "TransactionQueued");

    consoleLog("Testing MAX_QUEUE");
    const MAX_QUEUE = await timelockGuard.MAX_QUEUE();
    assert.equal(MAX_QUEUE, 100, "invalid MAX_QUEUE=" + MAX_QUEUE);
    const txHash = await queueTransaction(timelockGuard, toAdd[0], 1, "0x01", 0)
    for(let i=1; i<MAX_QUEUE; i++)
      await expect(
        timelockGuard.queueTransaction(toAdd[0], 1, "0x01", 0)
      ).to.emit(timelockGuard, "TransactionQueued");

    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x01", 0)
    ).to.be.revertedWith("MaxQueue").withArgs(txHash);
  });
  it('cancelTransaction', async function () {
    const [timelockGuard, safe, owner1] = await init();
    const to = toAdd[0], value = 11, data = "0x", operation = 0;

    consoleLog("Canceling as non Safe");
    await expect(
      timelockGuard.connect(owner1).cancelTransaction(txHash100, 0, 0)
    ).to.be.revertedWith("UnAuthorized").withArgs(owner1.address, 0);
    consoleLog("Canceling a transaction for which no hash is in the queued");
    await expect(
      timelockGuard.cancelTransaction(txHash100, 0, 0)
    ).to.be.revertedWith("CancelMisMatch");

    consoleLog("Queue and cancel - happy case");
    const hash = await queueTransaction(timelockGuard, to, limitNoTimelock+1, "0x", 0);
    const txs = await getTransactions(timelockGuard, hash); 
    assert.equal(txs.length, 1, "Queue and cancel - happy case - #=" + txs.length);
    await expect(
      timelockGuard.cancelTransaction(hash, 0, txs[0])
    ).to.emit(timelockGuard, "TransactionCanceled");
    const txsAfter = await timelockGuard.getTransactions(hash);
    assert.equal(txsAfter.length, 0, "Queue and cancel - happy case - no more timestamp, #=" + txsAfter.length);

    consoleLog("Queue 2 and cancel - happy case");
    await queueTransaction(timelockGuard, to, limitNoTimelock+1, "0x", 0);
    await queueTransaction(timelockGuard, to, limitNoTimelock+1, "0x", 0);
    const txs2 = await getTransactions(timelockGuard, hash); 
    assert.equal(txs2.length, 2, "Queue 2 and cancel - happy case - #=" + txs2.length);
    await expect(
      timelockGuard.cancelTransaction(hash, 1, txs2[1])
    ).to.emit(timelockGuard, "TransactionCanceled");
    const txsAfter1 = await timelockGuard.getTransactions(hash);
    assert.equal(txsAfter1.length, 1, "Queue 2 and cancel 1 - happy case - #=" + txsAfter1.length);
    await expect(
      timelockGuard.cancelTransaction(hash, 0, txs2[0])
    ).to.emit(timelockGuard, "TransactionCanceled");
    const txsAfter2 = await timelockGuard.getTransactions(hash);
    assert.equal(txsAfter2.length, 0, "Queue 2 and cancel 2 - happy case - #=" + txsAfter2.length);

    const rawData0 = [to, value, data, operation];
    const rawData1 = [to, value+1, data, operation];
    const txHash = [];
    txHash[0] = await queueTransaction(timelockGuard, ...rawData1);
    const nbSameTx = 5;
    for(let i=1; i<nbSameTx+1; i++) {
      txHash[i] = await queueTransaction(timelockGuard, ...rawData0);
      await time.increase(2); // Ensure different timestamps
      assert.isTrue(i==1 || txHash[i]==txHash[1], "Queue severals transactions with same hash");
    }
    txHash[nbSameTx+1] = await queueTransaction(timelockGuard, ...rawData1);
    assert.equal(txHash[0], txHash[nbSameTx+1], "Queue 2 transactions with same hash");
    txHash[nbSameTx+2] = await queueTransaction(timelockGuard, to, value+2, data, operation);

    consoleLog("Cancelling transaction where timestamp does not exist");
    await expect(
      timelockGuard.cancelTransaction(txHash[0], 0, 0)
    ).to.be.revertedWith("CancelMisMatch");

    consoleLog("Cancelling transaction with timestampPos > transactions[txHash].length");
    await expect(
      timelockGuard.cancelTransaction(txHash[0], 100, 0)
    ).to.be.revertedWith("CancelMisMatch");
    consoleLog("Cancelling transaction with timestampPos == transactions[txHash].length");
    await expect(
      timelockGuard.cancelTransaction(txHash[0], 2, 0)
    ).to.be.revertedWith("CancelMisMatch");

    const tests = [
      {desc: "Match with nb timestamp > 1 but inc=1", pos: 3, hash: 1, inc: 1},
      {desc: "Match with nb timestamp > 1 but inc=-1", pos: 3, hash: 1, inc: -1},
      {desc: "Match with nb timestamp > 1", pos: 3, hash: 1},
      {desc: "Match with nb timestamp == 1", pos: 0, hash: nbSameTx+2},
      {desc: "Incorrect position", pos: 2, hash: 1, hashPos:0, failure: true}];
    for(const test of tests) {      
      const _txHash = txHash[test.hash];
      const txs = await getTransactions(timelockGuard, _txHash);
      const hashPos = test.hashPos===undefined ? test.pos : test.hashPos;
      const timestamp = txs[hashPos] + (test.inc || 0);
      consoleLog(test.desc + ", [pos, timestamp]=" + [test.pos, timestamp] + ", transactions before=", txs);
      if(test.failure || test.inc)
        await expect(
          timelockGuard.cancelTransaction(_txHash, test.pos, timestamp)
        ).to.be.revertedWith("CancelMisMatch");
      else {
        await expect(
          timelockGuard.cancelTransaction(_txHash, test.pos, timestamp)
        ).to.emit(timelockGuard, "TransactionCanceled");
        const txsAfter = await getTransactions(timelockGuard, _txHash);
        consoleLog(test.desc + ", transactions after=", txsAfter);
        txs.splice(hashPos, 1);
        assert.equal(txs.toString(), txsAfter.toString(), "compare txs vs txsAfter - desc=" + test.desc);
      }
    }
  });
  it('setConfig', async function () {
    const [timelockGuard, safe, owner1] = await init();

    consoleLog("Calling as non Safe");
    await expect(
      timelockGuard.connect(owner1).setConfig(20, limitNoTimelock, 0, 100, [])
    ).to.be.revertedWith("UnAuthorized").withArgs(owner1.address, 0);
    consoleLog("Setting timelockDuration above the limit");
    await expect(
      timelockGuard.setConfig(120960000, limitNoTimelock, 0, 100, [])
    ).to.be.revertedWith("InvalidConfig").withArgs(120960000)
    consoleLog("Setting timelockDuration right above the limit");
    const maxLimitNoTimelock = 1209600;
    await expect(
      timelockGuard.setConfig(maxLimitNoTimelock+1, limitNoTimelock, 0, 100, [])
    ).to.be.revertedWith("InvalidConfig").withArgs(maxLimitNoTimelock+1);
    consoleLog("Setting timelockDuration to the limit");
    await expect(
      timelockGuard.setConfig(maxLimitNoTimelock, limitNoTimelock, 0, 100, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    consoleLog("Normal");
    await expect(
      timelockGuard.setConfig(20, 5, 0, 100, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    
    const to1 = toAdd[0], to2 = toAdd[1], value = 11, data = "0x", operation = 0;
    const txHash1 = await queueTransaction(timelockGuard, to1, value, data, operation);
    await queueTransaction(timelockGuard, to1, value, data, operation);
    await queueTransaction(timelockGuard, to1, value, data, operation);
    const txHash2 = await queueTransaction(timelockGuard, to2, value, data, operation);

    const txs1 = await getTransactions(timelockGuard, txHash1);
    const timestampPos = 1;
    await expect(
      timelockGuard.cancelTransaction(txHash1, timestampPos, txs1[1])
    ).to.emit(timelockGuard, "TransactionCanceled");
    txs1.splice(timestampPos, 1);
    const txs2 = await getTransactions(timelockGuard, txHash2);

    await expect(
      timelockGuard.setConfig(25, 8, 0, 100, [txHash1, txHash2])
    ).to.emit(timelockGuard, "TimelockConfigChanged").to.emit(timelockGuard, "TransactionsCleared");
    consoleLog("Cancelling already cleared transactions");
    await expect(
      timelockGuard.cancelTransaction(txHash1, 0, txs1[0])
    ).to.be.revertedWith("CancelMisMatch");
    await expect(
      timelockGuard.cancelTransaction(txHash2, 0, txs2[0])
    ).to.be.revertedWith("CancelMisMatch");
    
    await expect(
      timelockGuard.setConfig(0, 5, 0, 100, [])
    ).to.not.emit(timelockGuard, "TransactionsCleared");
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

    consoleLog("Executing within timelock and then after waiting for well over timelockDuration");
    await expect(
      timelockGuard.queueTransaction(to, value, data, operation)
    ).to.emit(timelockGuard, "TransactionQueued");

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("TimeLockActive");

    await time.increase(2*timelockDuration);

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.not.emit(timelockGuard, "TransactionCleared");

    consoleLog("Executing after waiting exactly timelockDuration");
    await expect(
      timelockGuard.queueTransaction(to, value, data, operation)
    ).to.emit(timelockGuard, "TransactionQueued");

    await time.increase(timelockDuration-1);

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted");

    consoleLog("Executing with several tx in the queue and latest one after waiting exactly timelockDuration");
    await expect(
      timelockGuard.queueTransaction(to, value, data, operation)
    ).to.emit(timelockGuard, "TransactionQueued");
    await time.increase(2);
    const txHash = await queueTransaction(timelockGuard, to, value, data, operation);
    const txs = await getTransactions(timelockGuard, txHash);
    await time.increase(timelockDuration+1-2);

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted").withArgs(txHash, txs[1]);
    txs.pop();
    const txsAfter = await getTransactions(timelockGuard, txHash);
    assert.equal(txs.toString(), txsAfter.toString(), "compare txs vs txsAfter");
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted").withArgs(txHash, txsAfter[0]);

    const timeReset = 2000000000;
    await time.increaseTo(timeReset+9);

    // executesAfter = [10, 30], time = 70 => expected = [10]
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 10
    await time.increaseTo(timeReset+29);
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 30
    await time.increaseTo(timeReset+68);
    await expect(                                                                      // t = 70
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted").withNamedArgs({ txHash });
    await checkExecuteAfter(timelockGuard, timeReset, txHash, [10], "check1");
    
    // executesAfter = [10, 70], time = 90 => expected = [70] 
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 70
    await time.increaseTo(timeReset+89);
    await expect(                                                                      // t = 90
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted").withNamedArgs({ txHash });
    await checkExecuteAfter(timelockGuard, timeReset, txHash, [70], "check2");
    
    // executesAfter = [70, 90, 107, 124], time = 124 => expected = [70, 107, 124] 
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 90
    await time.increaseTo(timeReset+106);
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 107
    await time.increaseTo(timeReset+123);
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 124
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted").withNamedArgs({ txHash });
    await checkExecuteAfter(timelockGuard, timeReset, txHash, [70, 107, 124], "check3");

    await expect(
      timelockGuard.setConfig(0, 5, 0, 100, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.emit(timelockGuard, "TransactionCleared").withArgs(txHash);

    const txsAfter2 = await timelockGuard.getTransactions(txHash);
    assert.equal(txsAfter2.length, 0, "TransactionCleared - no more timestamp, #=" + txsAfter.length);

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.not.emit(timelockGuard, "TransactionCleared");
  });
  it('checkTransaction', async function () {
    const [timelockGuard, safe, owner1] = await init();
    const to = toAdd[0], value = 11, data = "0x", operation = 0;
    const signatures = [], executor = toAdd[0];

    await expect(
      timelockGuard.checkTransaction(timelockGuard.address, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("UnAuthorized").withArgs(executor, 3);

    const txHash = await queueTransaction(timelockGuard, to, value, data, operation);
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("TimeLockActive").withArgs(txHash);
    await time.increase(timelockDuration+1);
    await expect(
      timelockGuard.connect(owner1).checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor)
    ).to.be.revertedWith("UnAuthorized").withArgs(owner1.address, 0);
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
    ).to.be.revertedWith("UnAuthorized").withArgs(executor, 2);
  });  
  it('checkAfterExecution', async function () {
    const [timelockGuard] = await init();

    await timelockGuard.checkAfterExecution(txHash100, true);
    await timelockGuard.checkAfterExecution(txHash100, false);
  });  
  it('change timelockDuration', async function () {
    const [timelockGuard] = await init(1000);

    const to = toAdd[0], value = 11, data = "0x", operation = 0;
    const txHash = await queueTransaction(timelockGuard, to, value, data, operation);
    const newTimelockDuration = 10;

    await expect(
      timelockGuard.setConfig(newTimelockDuration, limitNoTimelock, 0, 100, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    
    await queueTransaction(timelockGuard, to, value, data, operation);

    time.increase(newTimelockDuration+1);

    const transactions = await getTransactions(timelockGuard, txHash);
    const latest = await time.latest()
    assert.isTrue(transactions[1]<latest, "Confirm latest transactions can be executed");

    const signatures = [], executor = toAdd[0];
    await timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, ZeroAddress, ZeroAddress, signatures, executor);
  });  
});
describe("End To End", function () {
  const threshold = 2, quorumCancel = 4, quorumExecute = 6, nbOwners = 8;
  it('Queuing and executing a transaction after the timelock', async function () {
    const { owners, safe, guard } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute]);
    const requiredSigners = owners.slice(0, threshold);

    await owners[0].sendTransaction({to: safe.address, value: 10000});
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - before execution");

    consoleLog("Queuing transaction");
    const rawTxData = [owners[0].address, 1000, "0x", 0];
    const queueData = buildData("queueTransaction", rawTxData);
    expect(await execTransaction(requiredSigners, safe, guard.address, 0, queueData));
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - after queuing transaction");

    consoleLog("Trying to execute transaction before timelock");
    await expect(
      execTransaction(requiredSigners, safe, ...rawTxData)
    ).to.be.revertedWith("TimeLockActive");
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - after reverted execution");

    consoleLog("Waiting for timelock to expire");
    await time.increase(timelockDuration + 1);
    expect(await execTransaction(requiredSigners, safe, ...rawTxData));
    assert.equal(await ethers.provider.getBalance(safe.address), 9000, "Check safe balance - after execution");
  }); 
  runTest_quorumExecute(threshold, quorumCancel, quorumExecute, nbOwners);
  runTest_quorumExecute(1, quorumCancel, quorumExecute, nbOwners);
  it('Execute a transaction directly with quorumExecute = threshold', async function () {
    const { owners, safe } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, threshold]);

    await owners[0].sendTransaction({to: safe.address, value: 10000});
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - before execution");

    consoleLog("Direct execute with #signers = threshold = quorumExecute");
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

    const queueData = buildData("queueTransaction", [owners[0].address, 1000, "0x", 0]);
    const txHash = await getEventQueue(await execTransaction(requiredSigners, safe, guard.address, 0, queueData));

    const lastBlock = await ethers.provider.getBlock("latest");
    const cancelData = buildData("cancelTransaction", [txHash, 0, lastBlock.timestamp]);
    consoleLog("Cancelling with #signers = threshold < quorumCancel");
    await expect(
      execTransaction(requiredSigners, safe, guard.address, 0, cancelData)
    ).to.be.revertedWith("UnAuthorized").withArgs(safe.signer.address, 2);
    consoleLog("Cancelling with #signers = quorumCancel > threshold but non owners (=" + others.last.address + ")");
    await expect(
      execTransaction([...owners.slice(0, quorumCancel-1), others.last], safe, guard.address, 0, cancelData)
    ).to.be.revertedWith("GS026");
    consoleLog("Cancelling with #signers = quorumCancel > threshold");
    expect(await execTransaction(owners.slice(0, quorumCancel), safe, guard.address, 0, cancelData));

    const queueData2 = buildData("queueTransaction", [owners[0].address, 1001, "0x", 0]);
    const txHash2 = await getEventQueue(await execTransaction(requiredSigners, safe, guard.address, 0, queueData2));
    
    const lastBlock2 = await ethers.provider.getBlock("latest");
    const cancelData2 = buildData("cancelTransaction", [txHash2, 0, lastBlock2.timestamp]);

    consoleLog("Cancelling with #signers > quorumCancel > threshold");
    expect(await execTransaction(owners.slice(0, quorumCancel+1), safe, guard.address, 0, cancelData2));
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
    consoleLog("Cancelling with #signers = quorumCancel = threshold");
    expect(await execTransaction(owners.slice(0, threshold), safe, guard.address, 0, cancelData));
  });
  it('Removing the guard', async function () {
    const { owners, safe, guard, masterCopy } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute]);
    const requiredSigners = owners.slice(0, threshold);

    assert.equal(await getGuard(safe), guard.address, "Check guard - before removal");

    consoleLog("Queuing transaction");
    const setGuardData = masterCopy.interface.encodeFunctionData("setGuard", [ ZeroAddress ]);
    const rawTxData = [safe.address, 0, setGuardData, 0]
    const queueData = buildData("queueTransaction", rawTxData);
    expect(await execTransaction(requiredSigners, safe, guard.address, 0, queueData));

    consoleLog("Waiting for timelock to expire");
    await time.increase(timelockDuration + 1);

    consoleLog("Executing transaction to remove the guard");
    expect(await execTransaction(requiredSigners, safe, ...rawTxData));

    assert.equal(await getGuard(safe), ZeroAddress, "Check guard - after removal");
  });
  it('Sending ETH to the guard', async function () {
    const { owners, safe, guard } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute]);
    const requiredSigners = owners.slice(0, threshold);

    await owners[0].sendTransaction({to: safe.address, value: 10000});
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - before execution");

    consoleLog("Queuing a direct send to the guard");
    const rawTxData = [guard.address, 1000, "0x", 0];
    const queueData = buildData("queueTransaction", rawTxData);
    expect(await execTransaction(requiredSigners, safe, guard.address, 0, queueData));

    consoleLog("Direct send to the guard from the Safe after queuing");
    await time.increase(timelockDuration + 1);
    await expect(
      execTransaction(requiredSigners, safe, ...rawTxData)
    ).to.be.revertedWith("UnAuthorized").withArgs(safe.signer.address, 3);
    
    consoleLog("Direct send to the guard from the Safe with #signers = quorumExecute > threshold");
    await expect(
      execTransaction(owners.slice(0, quorumExecute), safe, ...rawTxData)
    ).to.be.revertedWith("GS013");

    consoleLog("Direct send to the guard from any address should fail");
    await expect(
      owners[0].sendTransaction({to: guard.address, value: 10000})
    ).to.be.revertedWith("function selector was not recognized and there's no fallback nor receive function");
  });
})
async function getGuard(safe) {
  return safe.getStorageAt("0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8", 1)
  .then(data => ethers.utils.getAddress("0x" + data.slice(26, 66)))
}
async function getTransactions(timelockGuard, txHash) {
  const temp = await timelockGuard.getTransactions(txHash);
  const res = Array(temp.length);
  for(let i=0; i<temp.length; i++)
    res[i] = temp[i].toNumber();
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

function runTest_quorumExecute(threshold, quorumCancel, quorumExecute, nbOwners) {
  it('Execute a transaction directly with quorumExecute > threshold = ' + threshold, async function () {
    const { owners, safe, others } = await getSafe(nbOwners, threshold, "TimelockGuardUpgradeable", safeAddress => [safeAddress, timelockDuration, limitNoTimelock, quorumCancel, quorumExecute]);

    await owners[0].sendTransaction({to: safe.address, value: 10000});
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - before execution");

    consoleLog("Direct execute with #signers = threshold < quorumExecute");
    const rawTxData = [owners[0].address, 1000, "0x", 0];
    await expect(
      execTransaction(owners.slice(0, threshold), safe, ...rawTxData)
    ).to.be.revertedWith("QueuingNeeded");
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - #signers = threshold");

    consoleLog("Direct execute with #signers = quorumExecute > threshold but non owners (=" + others.last.address + ")");
    await expect(
      execTransaction([...owners.slice(0, quorumExecute-1), others.last], safe, ...rawTxData)
    ).to.be.revertedWith("GS026");
    assert.equal(await ethers.provider.getBalance(safe.address), 10000, "Check safe balance - #signers = quorumExecute but with a non owner");

    consoleLog("Direct execute with #signers = quorumExecute > threshold");
    expect(await execTransaction(owners.slice(0, quorumExecute), safe, ...rawTxData));
    assert.equal(await ethers.provider.getBalance(safe.address), 9000, "Check safe balance - after execution with quorumExecute > threshold");
    
    consoleLog("Direct execute with #signers > quorumExecute > threshold");
    expect(await execTransaction(owners.slice(0, quorumExecute+1), safe, ...rawTxData));
    assert.equal(await ethers.provider.getBalance(safe.address), 8000, "Check safe balance - after execution with quorumExecute > threshold");
  });  
}