#!/bin/bash

set -e

function repeat(){
  for ((i=0;i<$1;i++)); do
    eval ${*:2}
  done
}

echo "Compiling samlang CLI..."
cargo b -p samlang-cli --release 2> /dev/null

N=100

time RUST=1 repeat $N ./target/release/samlang-cli
