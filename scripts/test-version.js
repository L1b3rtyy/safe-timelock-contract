const { spawn } = require("child_process");

const version = process.argv[2] || "1.4.1";

const test = spawn("npx.cmd", ["hardhat", "test"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SAFE_VERSION: version
  },
  shell: true
});
