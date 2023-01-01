#!/bin/bash

set -e

echo "==================== Step 1 ===================="
echo -n "Compiling samlang CLI..."
if [[ -z "${RUST}" ]]; then
  time pnpm bundle > /dev/null
else
  cd rust-rewrite && time cargo b -p samlang-cli --release 2> /dev/null && cd ..
fi
echo "Compiled samlang CLI."

echo "==================== Step 2 ===================="
echo -n "Compiling samlang source code..."
rm -rf out
time ./samlang-dev
echo "Compiled samlang source code."

echo "==================== Step 3 ===================="
echo -n "Checking generated TS code..."
time pnpm esr out/tests.AllTests.ts > actual.txt
diff tests/snapshot.txt actual.txt
rm actual.txt
echo "Generated TS code is good."

echo "==================== Step 4 ===================="
echo -n "Checking generated WebAssembly code..."
time node out/tests.AllTests.wasm.js > actual.txt
diff tests/snapshot.txt actual.txt
rm actual.txt
echo "Generated WebAssembly code is good."

echo "==================== PASSED ===================="
