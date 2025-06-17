# SafeTimelock

SafeTimelock adds a timelock functionality to any Safe multisig Wallet

## Architecture

The contract should be set as the guard for the given Safe wallet and can be managed from a Safe App, (repo for the Safe App https://github.com/L1b3rtyy/safe-timelock-ui)

WARNING: setting the guard of a Safe Wallet is very sensitive, DON'T DO this if you don't know what you are doing.

More details on building a Guard: [Building a Guard for Safe Smart Account](https://docs.safe.global/advanced/smart-account-guards/smart-account-guard-tutorial)

## Functionality

Once in place the SafeTimelock will:
1. Force 'most' transactions to be queued first for a given time span, before they can be executed
2. Allow cancelling queued transactions
3. Allow bypassing the timelock for transactions matching some pre-configured conditions 

Main configuration parameters are:

- ```timelockDuration```: duration of the timelock in seconds, 0 disables the timelock

- ```throttle```: duration enforced between queued transaction, 0 disables this feature. This prevents a Safe from being DoS if the owners are compromised, by continuously consuming available nonce. Allows for an emergency change of owner with ```#signatures = quorumExecute > threshold```. (See ```quorumExecute``` below)

- ```limitNoTimelock```: limit in Wei under which a simple transfer is allowed without timelock, 0 disables this feature

- ```quorumCancel```: the number of signatures needed to cancel a queued transaction. Not relevant if equal or under the Safe's threshold

- ```quorumExecute```: the number of signatures needed to execute any transaction directly without timelock. Not relevant if equal or under the Safe's threshold

Typically you would have ```threshold < quorumCancel <= quorumExecute <= nb owners```. This is not enforced in the contract

Note: once set, all transactions except queuing and cancelling are subject to a timelock, including changing any of the parameters above or removing/upgrading the guard.

## Use Cases

Example values for Safe 2/5 (5 owners, 2 signatures required)

### Allowing for additional time to review transactions

Get a automated tools and a technical team to review queued transactions and flag suspicious ones to owners

```
timelockDuration = 172800               // 2 days
throttle = 0                            // Disabled
limitNoTimelock = 0                     // Disabled
quorumCancel = 0                        // Disabled
quorumExecute = 0                       // Disabled
```

### Adding a layer of security above the Safe

Prevents the Safe from being taken over even if owners are compromised up to the threshold

```
timelockDuration = 172800               // 2 days
throttle = 180                          // 3 minutes
limitNoTimelock = 0                     // Disabled
quorumCancel = 3
quorumExecute = 4
```

### Maximizing usability: lower threshold and allowing direct send without timelock 

The Safe's threshold is lowered to 1 but keeping the same security level

```
timelockDuration = 172800               // 2 days
throttle = 180                          // 3 minutes
limitNoTimelock = 1                     // 1 ETH
quorumCancel = 2
quorumExecute = 2
```

### All included

```
timelockDuration = 172800               // 2 days
throttle = 180                          // 3 minutes
limitNoTimelock = 1                     // 1 ETH
quorumCancel = 3
quorumExecute = 4
```

## Faucets to get Sepolia Test ETH

https://cloud.google.com/application/web3/faucet/ethereum/sepolia

https://docs.metamask.io/developer-tools/faucet/

https://sepolia-faucet.pk910.de/

## Contract Compilation and Test

### Compilation

```
npx hardhat compile
```

### Test coverage

```solidity-coverage``` is used

```
npx hardhat coverage
```

```
File                               |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
-----------------------------------|----------|----------|----------|----------|----------------|
 contracts\                        |      100 |      100 |      100 |      100 |                |
  BaseTimelockGuard.sol            |      100 |      100 |      100 |      100 |                |
  TimelockGuard.sol                |      100 |      100 |      100 |      100 |                |
  TimelockGuardUpgradeable.sol     |      100 |      100 |      100 |      100 |                |
  TimelockGuardUpgradeableHack.sol |      100 |      100 |      100 |      100 |                |
-----------------------------------|----------|----------|----------|----------|----------------|
All files                          |      100 |      100 |      100 |      100 |                |
```

### Gas usage

```hardhat-gas-reporter``` is used

```
npx hardhat test
```

### Mutation Testing

```@morenabarboni/sumo``` is used

To make test execution faster:
- Disable ```hardhat-gas-reporter``` in ```hardhat.config.cjs``` with
```javascript
  gasReporter: {
    enabled: false,
    ...
  },
  ...
```
- Set ```MAX_QUEUE``` in ```contracts\BaseTimelockGuard.sol``` to a lower value such as ```10```, and update the corresponding test case in ```test\TimelockGuard.js```.

To make sure all tests pass without mutations run
```
npx sumo pretest
```

Then run the mutation testing:
```
npx sumo test
```

Only false positive are left.

Note: due to the project using ESM Javascript modules by default the configuration file has to be renamed ```sumo-config.cjs``` with the ```cjs``` extension. And a few files in the library needs to be updated to import this file instead of the original one. Check the errors on first run. 

## Contract Deployment and Verification 

The deployment scripts will log to the console the deployed contract addresses

(Use ```--network hardhat``` to test first and avoid wasting gas)

### Setup ```secrets.json```

The scripts load sensitive data from a file ```secrets.json```. It should contain:
```javascript
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
3. To upgrade an already deployed setup. It will only deploy the new implementation and have the proxy point to it.
```
npx hardhat run ./scripts/upgradable/validateUpgrade.js --network sepolia  // Confirm the upgrade is fine
npx hardhat run ./scripts/upgradable/prepareUpgrade.js --network sepolia   // Deploy the implementation contract only
```
Note: you will need the old version of the contract to run these, check the scripts
   
Verify implementation (the proxy and proxy admin are automatically verified)
```
npx hardhat verify --network sepolia {{ImpAddress}}
```

## Static analysis

### LLM

This contract has seen some back and force with chatGPT and Claude to fix obvious issues

### [Slither](https://github.com/crytic/slither)

```
py -m slither .\contracts\BaseTimelockGuard.sol --solc-remaps @safe-global=node_modules/@safe-global
```

No relevant warning lefts

### [solhint](https://github.com/protofire/solhint)

```
solhint 'contracts/**/*.sol' 
```

## Deployed Implementations for Upgradable Contracts

[Version 1.0.0](https://sepolia.etherscan.io/address/0x1c51eb09730e5f6710b8A4192e54F646058BAD5b)

First upgradable version

[Version 1.1.0](https://sepolia.etherscan.io/address/0x1300Ba2Bd3ab957ec7caa3120d2605951a7E19C4)

Simplified some event's signature to save gas

[Version 1.1.1](https://sepolia.etherscan.io/address/0xe508A96611cfDC1828fDd3ba82c61665B6063A8b)

Moved condition on ```quorumExecute``` to exit ```checkTransaction``` earlier and save gas

[Version 1.2.0](https://sepolia.etherscan.io/address/0x16Be677756C52Cb55E38d1a3661b7060b850edB5)

Removed throttle functionality as it 
- Uses gas
- Does not provide clear value
- Allows for a DOS attack

[Version 1.3.0](https://sepolia.etherscan.io/address/0xDB95BdFB38a75764368335ECc137dE19D4705b7F)

- Fully tested the usage of ```quorumCancel``` and ```quorumExecute``` and the verification of the additional signatures
- Added a field showing the supported Safe' versions  

[Version 1.3.1](https://sepolia.etherscan.io/address/0x05f0ebc08633674b063B1b6b0A0ad6Bffab1a53E)

Changed field name to describe tested Safe' version and not supported

[Version 1.3.2](https://sepolia.etherscan.io/address/0x37daBc6ebd85f0Ad9D8dB79993b5A1a9027Fb27a)

Gas optimization:
- Shallow slice signatures before verifying them
- Convert to assembly ```shiftAndPop```

[Version 1.3.3](https://sepolia.etherscan.io/address/0x326CDb9fEA2A4722988Fa36d97398D6eB8033B6c)

- Added mutation testing and static analysis
- Various small tweaks.
- Simplification of the ```cancelTransaction``` function as transactions must be in order according to the Safe's nonce.

[Version 1.3.4](https://sepolia.etherscan.io/address/0x4Ef5ECd9b73A3d10CD7DEA563E956cfa64c616fe)

- Added back throttle functionality, as without it there is an even worse DoS attack available to an attacker having compromised a Safe: just consume nonce as soon as available.
- Various simplifications and small tweaks
- Indexed some events for better searching capability

[Version 1.4.0](https://sepolia.etherscan.io/address/0xaeEB03289310E26Cb6e6F6654AD0Da84C63cC695)

Fixed a vulnerability where owners' signatures could be re-used between the ones submitted to the Safe (indices ```1``` to ```threshold```) and the ones submitted to the Guard (indices ```threshold+1``` to ```quorumCancel``` or ```quorumExecute```).

[Version 1.5.0](https://sepolia.etherscan.io/address/0xB6e25E793D80a4F972DdB252821F3c49df7bE91D)

Rollback event changes to maintain compatibility with UI