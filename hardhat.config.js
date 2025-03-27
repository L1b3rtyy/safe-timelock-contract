require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,            // explicitly fixes "stack too deep" issues
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
  },
  networks: {
    sepolia: {
      url: "https://sepolia.infura.io/v3/a5ffef7d370c43ee9e4ff15efedc52e5",
      accounts: ["910dff50052d5918fe0888ae279ed96ef744af58c4a9575f20dc368f1126fb7f"],
    },
  }
};
