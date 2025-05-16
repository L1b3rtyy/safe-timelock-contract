# SafeTimelock

SafeTimelock adds a timelock functionality to any Safe multisig Wallet

## Architecture

The contract should be set as the guard for the given Safe wallet and can be managed from a Safe App, https://safe-timelock-ui.vercel.app/ (repo https://github.com/L1b3rtyy/safe-timelock-ui)

WARNING: setting the guard of a Safe Wallet is very sensitive, DON'T DO this if you dont know what you are doing.

## Functionality

Once in place the SafeTimelock will:
1. Force 'most' transactions to be queued first for a given timelapse, before they can be exectued
2. Allow cancelling queued transactions
3. Allow bypassing the timelock for transactions matching some pre-configured conditions 

## Faucet to get Sepolia Test ETH

https://cloud.google.com/application/web3/faucet/ethereum/sepolia
https://docs.metamask.io/developer-tools/faucet/
https://sepolia-faucet.pk910.de/

## Compilation and Test

Compilation
```npx hardhat compile```
Test coverage
```npx hardhat coverage``` 
Gas usage
```npx hardhat test```

## Contract Deployment and Verification 

(Use --network hardhat to test first and avoid wasting gas)

Non upgradable          npx hardhat run ./scripts/deploy.js --network sepolia
Verify                  npx hardhat verify --network sepolia --constructor-args ./scripts/arguments.js {{GuardAddress}}

Upgradable
1. The implementation contract is already deployed, you just want to deploy the proxy and proxy admin - best to save gas
                        npx hardhat run ./scripts/upgradable/deployProxy.js --network sepolia
2. To deploy everything from scratch: implementation, proxy and proxy admin - will cost more
                        npx hardhat run ./scripts/upgradable/deploy.js --network sepolia
3. To upgrade an already deployed settup: will only deploy the new implementation and have the proxy point to it
                        npx hardhat run ./scripts/upgradable/validateUpgrade.js --network sepolia
                        npx hardhat run ./scripts/upgradable/prepareUpgrade.js --network sepolia
Verify implementation   npx hardhat verify --network sepolia {{ImpAddress}}

ADDRESSES

Non Upgradable      0xb3bc0C7dcE4FFD457BAB6FA4434aF413b5887067

Upgradable
Proxy               0x8AC7d9B0E7E5B63b931917442fE64Bb7A6aAD01E
Admin               0xaF6fDDC102Cf91DB982EDa41a46E17Dee5c7FD21
Imp                 0x1c51eb09730e5f6710b8A4192e54F646058BAD5b  1.0.0
                    0x1300Ba2Bd3ab957ec7caa3120d2605951a7E19C4  1.1.0

REMINDER, UINT IN SMART CONTRACTS

uint8 (8 bits): Range from 0 to 255
uint16 (16 bits): Range from 0 to 65,535
uint32 (32 bits): Range from 0 to 4,294,967,295
uint64 (64 bits): Range from 0 to 18,446,744,073,709,551,615
uint128 (128 bits): Range from 0 to 340,282,366,920,938,463,463,374,607,431,768,211,455
uint256 (256 bits): Range from 0 to 115,792,089,237,316,195,423,570,985,008,687,907,853,269,984,665,640,564,039,457,584,007,913,129,639,936