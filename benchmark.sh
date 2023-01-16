#!/bin/bash

set -e

echo "Compiling samlang CLI..."
cargo b -p samlang-cli --release 2> /dev/null

time BENCHMARK_REPEAT=1000 ./target/release/samlang-cli
