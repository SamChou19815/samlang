#!/bin/bash

set -e

echo "Compiling samlang CLI..."
cargo b -p samlang-cli --release
echo "Compiled samlang CLI!"

time BENCHMARK_REPEAT=1000 ./target/release/samlang-cli
