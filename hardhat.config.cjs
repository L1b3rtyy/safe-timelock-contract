require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("hardhat-gas-reporter");
require('solidity-coverage');

const { infuraAPIkeySepolia } = require('./secrets.json');
const { deployerWalletPrivateKey } = require('./secrets.json');
const { etherscanAPIkey } = require('./secrets.json');


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
      url: infuraAPIkeySepolia,
      accounts: [deployerWalletPrivateKey],
    },
  }
};
