#!/bin/bash

set -e

# Build
wasm-pack build --out-dir samlang-core

# Cleanup outputs
rm samlang-core/.gitignore
echo '{
  "name": "@dev-sam/samlang-core",
  "version": "0.8.0",
  "license": "AGPLv3",
  "module": "index.mjs",
  "type": "module",
  "types": "index.d.ts",
  "sideEffects": false
}' > samlang-core/package.json
mv samlang-core/samlang_wasm.d.ts samlang-core/index.d.ts
rm samlang-core/samlang_wasm_bg.wasm.d.ts
echo 'export * from "./samlang_wasm_bg.js";' > samlang-core/index.js
rm samlang-core/samlang_wasm.js

# Run tests
cp test-samlang-wasm.mjs samlang-core && \
  cd samlang-core && \
  node --experimental-wasm-modules test-samlang-wasm.mjs && \
  cd ../ && \
  rm samlang-core/test-samlang-wasm.mjs
