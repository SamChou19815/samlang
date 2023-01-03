#!/bin/bash

set -e

echo "===== Compile Repository Integration Tests ====="
echo ""
echo "==================== Step 1 ===================="
echo "Compiling samlang CLI..."
cargo b -p samlang-cli 2> /dev/null
echo "Compiled samlang CLI."

echo "==================== Step 2 ===================="
echo "Compiling samlang source code..."
rm -rf out
./samlang-dev
echo "Compiled samlang source code."

echo "==================== Step 3 ===================="
echo "Checking generated TS code..."
corepack enable
pnpm install > /dev/null 2> /dev/null
pnpm esbuild out/tests.AllTests.ts | node > actual.txt
diff tests/snapshot.txt actual.txt
rm actual.txt
echo "Generated TS code is good."

echo "==================== Step 4 ===================="
echo "Checking generated WebAssembly code..."
node out/tests.AllTests.wasm.js > actual.txt
diff tests/snapshot.txt actual.txt
rm actual.txt
echo "Generated WebAssembly code is good."

echo "==================== PASSED ===================="
