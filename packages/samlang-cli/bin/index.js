// @ts-check

function binPath() {
  switch (process.platform) {
    case 'linux':
      return 'samlang-cli-linux';
    case 'darwin':
      return `samlang-cli-darwin-${process.arch}`;
    case 'win32':
      return 'samlang-cli-windows.exe';
    default:
      console.error(`Unsupported platform: ${process.platform}`);
      process.exit(1);
  }
}

require('child_process')
  .spawn(require('path').join(__dirname, binPath()), process.argv.slice(2), { stdio: 'inherit' })
  .on('exit', process.exit);
