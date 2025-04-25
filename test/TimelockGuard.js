const { expect, assert } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const toRoot = "0x000000000000000000000000000000000000000";
const toAdd = [toRoot + 2, toRoot + 3, toRoot + 4, toRoot + 5]
const timelockDuration = 30, throttle = 5, limitNoTimelock = 10;
const txHash100 = "0x8b132efbd47825da4986d3581f78eddc4865866e7626f34fbe0c14c9a4d50cea";

// Start test block
describe('TimelockGuard', function () {  
  it('constructor', async function () {
    const [safe] = await ethers.getSigners();
    const TimelockGuard = await ethers.getContractFactory("TimelockGuard");
    
    const zero = "0x0000000000000000000000000000000000000000";
    await expect(
      TimelockGuard.deploy(zero, timelockDuration, throttle, limitNoTimelock).then(timelockGuard => timelockGuard.deployed())
    ).to.be.revertedWith("ZerodAddess");

    const timelockGuard = await TimelockGuard.deploy(safe.address, timelockDuration, throttle, limitNoTimelock);
    await timelockGuard.deployed();
  });
  it('queueTransaction', async function () {
    const [timelockGuard, safe, owner1] = await init();

    await expect(
      timelockGuard.queueTransaction(toAdd[0], 11, "0x", 0)
    ).to.emit(timelockGuard, "TransactionQueued");

    await expect(
      timelockGuard.queueTransaction(toAdd[0], 12, "0x", 0)
    ).to.be.revertedWith("Throttled");

    await time.increase(2*throttle);

    await expect(
      timelockGuard.connect(owner1).queueTransaction(toAdd[0], 11, "0x", 0)
    ).to.be.revertedWith("UnAuthorized");

    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x", 0)
    ).to.be.revertedWith("QueuingNotNeeded");
    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x00", 0)
    ).to.be.revertedWith("QueuingNotNeeded");
    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x", 1)
    ).to.emit(timelockGuard, "TransactionQueued");
    await time.increase(2*throttle);
    await expect(
      timelockGuard.queueTransaction(toAdd[0], 1, "0x01", 0)
    ).to.emit(timelockGuard, "TransactionQueued");
  });
  it('cancelTransaction', async function () {
    const [timelockGuard, safe, owner1] = await init();
    const to = toAdd[0], value = 11, data = "0x", operation = 0;

    await expect(
      timelockGuard.connect(owner1).cancelTransaction(txHash100, to, value, data, operation, 0, 0)
    ).to.be.revertedWith("UnAuthorized");
    await expect(
      timelockGuard.cancelTransaction(txHash100, to, value, data, operation, 0, 0)
    ).to.be.revertedWith("CancelMisMatch");

    const txHash = [];
    txHash[0] = await queueTransaction(timelockGuard, to, value+1, data, operation);
    const nbsameTx = 5;
    for(let i=1; i<nbsameTx+1; i++) {
      txHash[i] = await queueTransaction(timelockGuard, to, value, data, operation);
      assert.isTrue(i==1 || txHash[i]==txHash[1], "Queue severals transactions with same hash");
    }
    txHash[nbsameTx+1] = await queueTransaction(timelockGuard, to, value+1, data, operation);
    assert.equal(txHash[0], txHash[nbsameTx+1], "Queue 2 transactions with same hash");
    txHash[nbsameTx+2] = await queueTransaction(timelockGuard, to, value+2, data, operation);

    const tests = [
      {desc: "correct position with nb timestamp > 1", pos: 3, hash: 1},
      {desc: "correct position with nb timestamp == 1", pos: 0, hash: nbsameTx+2},
      {desc: "incorrect position", pos: 2, hash: 1, hashPos:0}];
    let nbTx = {[txHash[0]]: 2, [txHash[1]]: nbsameTx, [txHash[nbsameTx+2]]: 1};
    for(const test of tests) {      
      const _txHash = txHash[test.hash];
      const txs = await getTransactions(timelockGuard, _txHash, nbTx[_txHash]);
      const hashPos = test.hashPos===undefined ? test.pos : test.hashPos;
      const timestamp = txs[hashPos];
      console.log("cancelTransaction - " + test.desc + ", [pos, timestamp]=" + [test.pos, timestamp] + ", transactions before=", txs);
      await expect(
        timelockGuard.cancelTransaction(_txHash, to, value, data, operation, test.pos, timestamp)
      ).to.emit(timelockGuard, "TransactionCanceled");
      nbTx[_txHash]--;
      const txsAfter = await getTransactions(timelockGuard, _txHash, nbTx[_txHash]);
      console.log("cancelTransaction - " + test.desc + ", transactions after=", txsAfter);
      txs.splice(hashPos, 1);
      assert.equal(txs.toString(), txsAfter.toString(), "compare txs vs txsAfter - desc=" + test.desc);
    }
    console.log("cancelTransaction - no match"); 
    await expect(
      timelockGuard.cancelTransaction(txHash[1], to, value, data, operation, 1, 999)
    ).to.be.revertedWith("CancelMisMatch");
  });
  it('setConfig', async function () {
    const [timelockGuard, safe, owner1] = await init();

    await expect(
      timelockGuard.connect(owner1).setConfig(20, throttle, limitNoTimelock, [])
    ).to.be.revertedWith("UnAuthorized");
    await expect(
      timelockGuard.setConfig(120960000, throttle, limitNoTimelock, [])
    ).to.be.revertedWith("InvalidConfig");
    await expect(
      timelockGuard.setConfig(timelockDuration, 360000, limitNoTimelock, [])
    ).to.be.revertedWith("InvalidConfig");
    await expect(
      timelockGuard.setConfig(20, 3, 5, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    
    const to1 = toAdd[0], to2 = toAdd[1], value = 11, data = "0x", operation = 0;
    const txHash1 = await queueTransaction(timelockGuard, to1, value, data, operation);
    await queueTransaction(timelockGuard, to1, value, data, operation);
    await queueTransaction(timelockGuard, to1, value, data, operation);
    const txHash2 = await queueTransaction(timelockGuard, to2, value, data, operation);

    const txs = await getTransactions(timelockGuard, txHash1, 3);

    await expect(
      timelockGuard.cancelTransaction(txHash1, to1, value, data, operation, 1, txs[1])
    ).to.emit(timelockGuard, "TransactionCanceled");
    await expect(
      timelockGuard.setConfig(25, 4, 8, [txHash1, txHash2])
    ).to.emit(timelockGuard, "TimelockConfigChanged").to.emit(timelockGuard, "TransactionsCleared");
    await expect(
      timelockGuard.cancelTransaction(txHash1, to1, value, data, operation, 0, 0)
    ).to.be.revertedWith("CancelMisMatch");
    await expect(
      timelockGuard.cancelTransaction(txHash2, to2, value, data, operation, 0, 0)
    ).to.be.revertedWith("CancelMisMatch");

    
    await expect(
      timelockGuard.setConfig(0, 3, 5, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    await expect(
      timelockGuard.queueTransaction(to1, value, data, operation)
    ).to.be.revertedWith("QueuingNotNeeded");
  });  
  it('validateAndMarkExecuted', async function () {
    const [timelockGuard] = await init();
    const to = toAdd[0], value = 11, data = "0x", operation = 0;
    const safeTxGas = 0, baseGas = 0, gasPrice = 0, gasToken = toAdd[0], refundReceiver = toAdd[0], signatures = [], executor = toAdd[0];

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.be.revertedWith("QueuingNeeded");
    await timelockGuard.checkTransaction(to, 1, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor);

    await expect(
      timelockGuard.queueTransaction(to, value, data, operation)
    ).to.emit(timelockGuard, "TransactionQueued");

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.be.revertedWith("TimeLockActive");

    await time.increase(2*timelockDuration);

    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted");

    const timereset = 2000000000;
    await time.increaseTo(timereset+9);

    // executesAfter = [10, 30], time = 70 => expected = [10] 
    const txHash = await queueTransaction(timelockGuard, to, value, data, operation, true); // t = 10
    await time.increaseTo(timereset+29);
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 30
    await time.increaseTo(timereset+68);
    await expect(                                                                      // t = 70
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted");
    await checkExecuteAfter(timelockGuard, timereset, txHash, [10], "check1");
    
    // executesAfter = [10, 70], time = 90 => expected = [70] 
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 70
    await time.increaseTo(timereset+89);
    await expect(                                                                      // t = 90
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted");
    await checkExecuteAfter(timelockGuard, timereset, txHash, [70], "check2");
    
    // executesAfter = [70, 90, 107, 124], time = 124 => expected = [70, 107, 124] 
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 90
    await time.increaseTo(timereset+106);
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 107
    await time.increaseTo(timereset+123);
    await timelockGuard.queueTransaction(to, value, data, operation)                   // t = 124
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.emit(timelockGuard, "TransactionExecuted");
    await checkExecuteAfter(timelockGuard, timereset, txHash, [70, 107, 124], "check3");

    await expect(
      timelockGuard.setConfig(0, 3, 5, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.emit(timelockGuard, "TransactionCleared");
  });
  it('checkTransaction', async function () {
    const [timelockGuard, safe, owner1] = await init();
    const to = toAdd[0], value = 11, data = "0x", operation = 0;
    const safeTxGas = 0, baseGas = 0, gasPrice = 0, gasToken = toAdd[0], refundReceiver = toAdd[0], signatures = [], executor = toAdd[0];

    await expect(
      timelockGuard.connect(owner1).checkTransaction(timelockGuard.address, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.be.revertedWith("UnAuthorized");

    await expect(
      timelockGuard.checkTransaction(timelockGuard.address, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.be.revertedWith("QueuingNeeded");

    const txHash = await queueTransaction(timelockGuard, to, value, data, operation);
    await expect(
      timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.be.revertedWith("TimeLockActive");
    await time.increase(timelockDuration+1);
    await timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor);

    const queueData = buildData("queueTransaction", [to, value, data, 0]);
    await timelockGuard.checkTransaction(timelockGuard.address, value, queueData, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor);
    const cancelData = buildData("cancelTransaction", ["0x57c3811681d5f2025f9765a045fb5cb542a1b80e307437fbc4a693a718da1f9a", to, value, data, 0, 0, 0]);
    await timelockGuard.checkTransaction(timelockGuard.address, value, cancelData, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor);
    const configData = buildData("setConfig", [timelockDuration, throttle, limitNoTimelock, []]);
    await expect(
      timelockGuard.checkTransaction(timelockGuard.address, value, configData, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor)
    ).to.be.revertedWith("QueuingNeeded");
  });  
  it('checkAfterExecution', async function () {
    const [timelockGuard] = await init();

    await timelockGuard.checkAfterExecution(txHash100, true);
    await timelockGuard.checkAfterExecution(txHash100, false);
  });  
  it('setConfig - change timelockDuration', async function () {
    const [timelockGuard, safe, owner1] = await init(1000);

    const to = toAdd[0], value = 11, data = "0x", operation = 0;
    const txHash = await queueTransaction(timelockGuard, to, value, data, operation);
    const newTimelockDuration = 10;

    await expect(
      timelockGuard.setConfig(newTimelockDuration, throttle, limitNoTimelock, [])
    ).to.emit(timelockGuard, "TimelockConfigChanged");
    
    await queueTransaction(timelockGuard, to, value, data, operation);

    time.increase(newTimelockDuration+1);

    const transactions = await getTransactions(timelockGuard, txHash, 2);
    const latest = await time.latest()
    assert.isTrue(transactions[1]<latest, "Confirm latest transations can be executed");

    const safeTxGas = 0, baseGas = 0, gasPrice = 0, gasToken = toAdd[0], refundReceiver = toAdd[0], signatures = [], executor = toAdd[0];
    await timelockGuard.checkTransaction(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, executor);
  });  
});

async function getTransactions(timelockGuard, txHash, nb) {
  const res = [];
  for(let i=0; i<nb; i++)
    res[i] = (await timelockGuard.transactions(txHash, i)).toNumber();
  return res;
}
async function checkExecuteAfter(timelockGuard, timereset, txHash, exp, log) {
  for(let i=0; i < exp.length; i++)
    assert.equal((await timelockGuard.transactions(txHash, i)).toNumber()-timereset, exp[i], "checkExecuteAfter - " + log + ", i=" + i); 
}
async function queueTransaction(timelockGuard, to, value, data, operation, skipWait) {
  if(!skipWait)
      await time.increase(2*throttle);
  const e = await getEvent(await timelockGuard.queueTransaction(to, value, data, operation));
  assert.equal(e.name, "TransactionQueued");
  return e.args[0];
}
async function getEvent(tx) {
  const receipt = await tx.wait()
  return receipt.events.map(ev => ({name: ev.event , args: ev.args}))[0];
}
async function init(_timelockDuration) {
  const [safe, owner1, owner2] = await ethers.getSigners();
  const TimelockGuard = await ethers.getContractFactory("TimelockGuard");
  const timelockGuard = await TimelockGuard.deploy(safe.address, _timelockDuration || timelockDuration, throttle, limitNoTimelock);
  await timelockGuard.deployed();
  return [timelockGuard, safe, owner1, owner2];
}
function buildData(functionName, args) {
  let moduleAbi = "";
  if(functionName == "setConfig")           moduleAbi = "function setConfig(uint64 _timelockDuration, uint64 _throttle, uint128 _limitNoTimelock, bytes32[] calldata clearHashes)";
  if(functionName == "queueTransaction")    moduleAbi = "function queueTransaction(address to, uint256 value, bytes calldata data, uint8 operation)";
  if(functionName == "cancelTransaction")   moduleAbi = "function cancelTransaction(bytes32 txHash, address to, uint256 value, bytes calldata data, uint8 operation, uint256 timestampPos, uint256 timestamp)";
  const iface = new ethers.utils.Interface([moduleAbi]);
  return iface.encodeFunctionData(functionName, args);
}