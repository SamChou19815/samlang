#!/bin/bash

set -e

GENERATED=generated

# Build
wasm-pack build --out-dir samlang-demo --no-typescript

# Add necessary files
echo '{
  "//": "Sync from samlang repo",
  "name": "samlang-demo",
  "version": "0.0.1",
  "license": "AGPLv3",
  "type": "module",
  "types": "index.d.ts",
  "sideEffects": false
}' > samlang-demo/package.json

echo "// @$GENERATED

type Range = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};


type Diagnostic = {
  severity: 8;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

export type CompilationResult = string | { tsCode: string; interpreterResult: string };

export function compile(source: string): Promise<CompilationResult>;

export function typeCheck(source: string): Promise<readonly Diagnostic[]>;

export function queryType(
  source: string,
  line: number,
  column: number,
): Promise<{ contents: Array<{ language: string; value: string }>; range: Range } | null>;

export function queryDefinitionLocation(
  source: string,
  line: number,
  column: number,
): Promise<Range | null>;

export function autoComplete(
  source: string,
  line: number,
  column: number,
): Promise<Array<{
  range: Range;
  label: string;
  insertText: string;
  detail: string;
  insertTextFormat: number;
  kind: number;
}>>;" > samlang-demo/index.d.ts

node bundle.cjs

# Cleanup outputs
rm samlang-demo/.gitignore samlang-demo/*.wasm samlang-demo/*.js
mv out.js samlang-demo/index.js

# Run tests
cp test-samlang-wasm.mjs samlang-demo && \
  cd samlang-demo && \
  node test-samlang-wasm.mjs && \
  cd ../ && \
  rm samlang-demo/test-samlang-wasm.mjs

# Pack and sync
cd samlang-demo && npm pack && cd ../
if [[ ! -z "${RELEASE}" ]]
then
  mv samlang-demo/samlang-demo-0.0.1.tgz ../../../website/packages/samlang/samlang-demo-0.0.1.tgz
fi
