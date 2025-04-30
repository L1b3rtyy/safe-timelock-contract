FAUCET

https://cloud.google.com/application/web3/faucet/ethereum/sepolia

HARDHAT

Compile                 npx hardhat compile
Deploy contracts        npx hardhat run ./scripts/deploy.js --network sepolia
Verify contracts        npx hardhat verify --network sepolia --constructor-args ./scripts/arguments.js add

ADDRESSES

Deployer    0xc5D0588C145b6eDDa609492efE41EB1b82029d34
Safe        0x67c3092073Ca9ADC7e228d75fC8E29D504c5EFce
Guard       0x75A04D66745368086074e928B53899ef3c55aDBE

EXPLORER

https://sepolia.etherscan.io/address/add

DEPLOYMENT
1. Create Safe with 1/2 signers
2. Copy Safe add to arguments.js - Deploy and verify guard
3. Change Safe to 2/2 signers
4. Call setGuard on Safe contract
=> 4 transactions

TESTS
npx hardhat coverage    => Test coverage
npx hardhat test        => Gas usage
