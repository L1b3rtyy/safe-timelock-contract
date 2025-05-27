const { safeAddress } = require('../secrets.json');

module.exports = [
  safeAddress,
  150,                                          // Minimum delay timer in seconds
  1000000000000000,                             // ETH amount sendable without timelock
  0,                                            // Quorum needed to cancel a queueued transaction
  0,                                            // Quorum needed to execute a transaction without timelock (0 = disabled)
];