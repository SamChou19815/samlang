#!/bin/bash

set -e

function repeat(){
  for ((i=0;i<$1;i++)); do
    eval ${*:2}
  done
}

echo "Compiling samlang CLIs..."
pnpm bundle > /dev/null
cargo b -p samlang-cli --release 2> /dev/null

N=100

echo "Run with TS-Based CLI..."
time repeat $N ./samlang-dev
echo "Run with Rust-Based CLI..."
time RUST=1 repeat $N ./target/release/samlang-cli
