require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("hardhat-gas-reporter");
require('solidity-coverage');
require('@openzeppelin/hardhat-upgrades');

const { providerURL, deployerWalletPrivateKey, etherscanAPIkey } = require('./secrets.json');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  gasReporter: {
    enabled: true
  },
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
  },
  etherscan: {
    apiKey: etherscanAPIkey  
  },
  networks: {
    sepolia: {
      url: providerURL,
      accounts: [deployerWalletPrivateKey],
    },
  }
};
