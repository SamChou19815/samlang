# samlang

![GitHub](https://img.shields.io/github/license/SamChou19815/samlang.svg)
![VSCode Extension](https://img.shields.io/visual-studio-marketplace/i/dev-sam.vscode-samlang.svg?label=vscode%20extension%20installs)

Sam's Programming Language

<img alt="samlang" src="https://raw.githubusercontent.com/SamChou19815/design/master/samlang.png" width=300 height=300/>

Read the docs at [the official documentation site](https://samlang.io).

Install the VSCode Extension at [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=dev-sam.vscode-samlang).

## Getting Started

If you want to use samlang as a user, it is better to read
[the official documentation](https://samlang.io). If you want to develop on samlang, clone this
repository and run `yarn install`.

Most commands of samlang can be run with only Node.JS installed. However, `samlang compile`
requires the LLVM toolchain to be installed. The repository's code is tested against LLVM 11,
although it's very likely that it can work against any modern LLVM version.

To test that your LLVM environment has been properly setup, you can run `yarn test:integration`
at the root of the repo. After the integration tests pass, you can inspect the emitted LLVM `ll`
code under the `out` directory.

## Language Features

- Type Inference
- First Class Functions
- Pattern Matching
- Produce Optimized LLVM IR

## Planned Language Features

- Interfaces
- Functors

## Planned Optimizations

- Loop invariant code motion
