# SafeTimelock

SafeTimelock adds a timelock functionality to any Safe multisig Wallet

## Architecture

The contract should be set as the guard for the given Safe wallet and can be managed from a Safe App, (repo for the Safe App https://github.com/L1b3rtyy/safe-timelock-ui)

WARNING: setting the guard of a Safe Wallet is very sensitive, DON'T DO this if you dont know what you are doing.

## Functionality

Once in place the SafeTimelock will:
1. Force 'most' transactions to be queued first for a given timelapse, before they can be executed
2. Allow cancelling queued transactions
3. Allow bypassing the timelock for transactions matching some pre-configured conditions 

## Faucets to get Sepolia Test ETH

https://cloud.google.com/application/web3/faucet/ethereum/sepolia

https://docs.metamask.io/developer-tools/faucet/

https://sepolia-faucet.pk910.de/

## Contract Compilation and Test

Compilation
```
npx hardhat compile
```

Test coverage
```
npx hardhat coverage
``` 

Gas usage
```
npx hardhat test
```

## Contract Deployment and Verification 

The deployment scripts will log to the console the deployed contract addresses

(Use ```--network hardhat``` to test first and avoid wasting gas)

### Setup ```secrets.json```

The scripts load sensitive data from a file ```secrets.json```. It should contain:
```
{
  "safeAddress"                 // Mandatory  Address of the Safe wallet
  "proxyAddress"                // Optional   Address of the proxy once deployed, used for upgrades
  "latestImplAddress"           // Optional   Address of the latest implementation, used to deploy the proxy only
  "providerURL"                 // Mandatory  Full URL with API key of the web3 provider, e.g. Infura
  "deployerWalletPrivateKey"    // Mandatory  Private key of the account making the deployment and paying for gas
  "etherscanAPIkey"             // Optional   Etherscan API key used for contract verification
}
```

### Non upgradable

Deployment
```
npx hardhat run ./scripts/deploy.js --network sepolia
```
Verify
```
npx hardhat verify --network sepolia --constructor-args ./scripts/arguments.cjs {{GuardAddress}}
```

### Upgradable

1. The implementation contract is already deployed, you just want to deploy the proxy and proxy admin - best to save gas
```
npx hardhat run ./scripts/upgradable/deployProxy.js --network sepolia
```
2. To deploy everything from scratch: implementation, proxy and proxy admin - will cost more
```
npx hardhat run ./scripts/upgradable/deploy.js --network sepolia
```
3. To upgrade an already deployed settup. It will only deploy the new implementation and have the proxy point to it.
```
npx hardhat run ./scripts/upgradable/validateUpgrade.js --network sepolia  // Confirm the upgrade is fine
npx hardhat run ./scripts/upgradable/prepareUpgrade.js --network sepolia   // Deploy the implementation contract only
```
Note: you will need the old version of the contract to run these, check the scripts
   
Verify implementation (the proxy and proxy admin are automatically verified)
```
npx hardhat verify --network sepolia {{ImpAddress}}
```

## Deployed Implementations for Upgradable Contracts

[Version 1.0.0](https://sepolia.etherscan.io/address/0x1c51eb09730e5f6710b8A4192e54F646058BAD5b)

First upgradable version

[Version 1.1.0](https://sepolia.etherscan.io/address/0x1300Ba2Bd3ab957ec7caa3120d2605951a7E19C4)

Simplified some event's signature to save gas

[Version 1.1.1](https://sepolia.etherscan.io/address/0xe508A96611cfDC1828fDd3ba82c61665B6063A8b)

Moved condition on ```quorumExecute``` to exit ```checkTransaction``` earlier and save gas

[Version 1.2.0](https://sepolia.etherscan.io/address/0x16Be677756C52Cb55E38d1a3661b7060b850edB5)

Removes throttle functionality as it 
- Uses gas
- Does not provide clear value
- Allows for a DOS attack