FAUCET

https://cloud.google.com/application/web3/faucet/ethereum/sepolia
https://docs.metamask.io/developer-tools/faucet/
https://sepolia-faucet.pk910.de/

HARDHAT

Compile                 npx hardhat compile
Test deployment         npx hardhat run scripts/deploy.js --network hardhat
                        npx hardhat run scripts/deployProxy.js --network hardhat
                        npx hardhat run ./scripts/validateUpgrade.js --network hardhat
                        npx hardhat run ./scripts/prepareUpgrade.js --network hardhat
Deploy contracts        npx hardhat run ./scripts/deploy.js --network sepolia
                        npx hardhat run ./scripts/deployProxy.js --network sepolia
                        npx hardhat run ./scripts/validateUpgrade.js --network sepolia
                        npx hardhat run ./scripts/prepareUpgrade.js --network sepolia
Verify contracts        npx hardhat verify --network sepolia --constructor-args ./scripts/arguments.js addGuard
                        npx hardhat verify --network sepolia addGuard

ADDRESSES

Deployer    0xc5D0588C145b6eDDa609492efE41EB1b82029d34
Safe        0x67c3092073Ca9ADC7e228d75fC8E29D504c5EFce
Proxy       0x09414351726200E272dFCD31F5092a78CB4EC3c8
Proxy Admin 0xaF6fDDC102Cf91DB982EDa41a46E17Dee5c7FD21
Imp         0x75A04D66745368086074e928B53899ef3c55aDBE  0.1.0 (Without proxy)
            0x7760f93Bb6c7c15196E551836656E43E0b7b05af  0.2.0
            0x5Be16E7d0795618E8ef015F29b72F22bFBba31Aa  0.2.1
            0x41DeBEC8262D92F6Ce4eaAa781CF2529Bba87158  0.2.2

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