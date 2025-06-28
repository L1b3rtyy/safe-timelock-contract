require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("hardhat-gas-reporter");
require('solidity-coverage');
require('@openzeppelin/hardhat-upgrades');
require("hardhat-dependency-compiler");

const { providerURL, deployerWalletPrivateKey, etherscanAPIkey } = require('./secrets.json');

module.exports = {
  
  gasReporter: {
    enabled: false,
    trackGasDeltas: true,
  },
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      }
    }
  },
  paths: {
    sources: "./contracts",
  },
  etherscan: {
    apiKey: etherscanAPIkey  
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true, // Required for Safe contracts
      gas: "auto"                       // Necessary to impersonate the Safe contract
    },
    sepolia: {
      url: providerURL,
      accounts: [deployerWalletPrivateKey],
    },
  },
  dependencyCompiler: {
    paths: [
      "@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol",
      "@safe-global/safe-contracts/contracts/Safe.sol",
      // Comment the following lines if you have not cloned the corresponding repositories (see REWADME)
      "external/safe-1.3.0/contracts/proxies/GnosisSafeProxyFactory.sol",
      "external/safe-1.3.0/contracts/GnosisSafe.sol",
      "external/safe-1.4.0/contracts/proxies/SafeProxyFactory.sol",
      "external/safe-1.4.0/contracts/Safe.sol"
    ],
  },
};
