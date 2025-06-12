module.exports = {  
      buildDir: "auto",
      contractsDir: "auto",
      testDir: "auto",
      skipContracts: ["TimelockGuardUpgradeableHack.sol"],
      skipTests: ["utils/utils.js"],
      testingFramework: "hardhat",
      minimalOperators: false,
      randomSampling: false,
      randomMutants: 100,
      testingTimeOutInSec: 500  
}