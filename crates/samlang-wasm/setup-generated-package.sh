#!/bin/bash

set -e

GENERATED=generated

# Build
wasm-pack build --out-dir samlang-demo -t web --no-typescript

echo "// @$GENERATED

export function init(url?: string): Promise<void>;

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

export function typeCheck(source: string): Diagnostic[];

export function queryType(
  source: string,
  line: number,
  column: number
): { contents: Array<{ language: string; value: string }>; range: Range } | null;

export function queryDefinitionLocation(source: string, line: number, column: number): Range | null;

export function autoComplete(
  source: string,
  line: number,
  column: number
): Array<{
  range: Range;
  label: string;
  insertText: string;
  detail: string;
  insertTextFormat: number;
  kind: number;
}>;" > samlang-demo/index.d.ts

../../packages/samlang-vscode/node_modules/.bin/esbuild ./lazy-index.js --bundle --outfile=samlang-demo/index.js --format=esm
# node samlang-wasm.test.mjs --experimental-wasm-modules

# Cleanup outputs
# rm samlang-demo/.gitignore samlang-demo/*.wasm samlang-demo/*.js
if [[ ! -z "${RELEASE}" ]]
then
  cp samlang-demo/samlang_wasm_bg.wasm ../../packages/samlang-website/src/components/samlang_wasm_bg.wasm
  cp samlang-demo/index.js ../../packages/samlang-website/src/components/samlang-wasm-glue.js
  cp samlang-demo/index.d.ts ../../packages/samlang-website/src/components/samlang-wasm-glue.d.ts
fi
