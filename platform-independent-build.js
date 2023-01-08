// @ts-check

const { spawnSync } = require('child_process');
const { cpSync } = require('fs');

function build(/** @type {string | void} */ target) {
  const cargoArgs = ['b', '--release', '-p', 'samlang-cli'];
  if (target) {
    cargoArgs.push('--target', target);
  }
  spawnSync('cargo', cargoArgs, { stdio: 'inherit', shell: true });
}

switch (process.platform) {
  case 'linux':
    build();
    cpSync('target/release/samlang-cli', 'packages/samlang-cli/bin/samlang-cli-linux');
    break;
  case 'darwin':
    build('aarch64-apple-darwin');
    build('x86_64-apple-darwin');
    cpSync(
      'target/aarch64-apple-darwin/release/samlang-cli',
      'packages/samlang-cli/bin/samlang-cli-darwin-arm64'
    );
    cpSync(
      'target/x86_64-apple-darwin/release/samlang-cli',
      'packages/samlang-cli/bin/samlang-cli-darwin-x64'
    );
    break;
  case 'win32':
    // Assuming we are on windows
    build();
    cpSync('target/release/samlang-cli.exe', 'packages/samlang-cli/bin/samlang-cli-windows.exe');
  default:
    throw new Error(`Unsupported platform: ${process.platform}`);
}
