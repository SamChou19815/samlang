import interpret from './loader.js';

import * as compiled from './samlang-demo/samlang_wasm.js';

export async function init(url) {
  await compiled.default(url);
}

export async function compile(source) {
  try {
    const compilationResult = compiled.compile(source);
    const result = {
      tsCode: compilationResult.ts_code,
      interpreterResult: await interpret(compilationResult.wasm_bytes),
    };
    compilationResult.free();
    return result;
  } catch (e) {
    return e;
  }
}

export function typeCheck(source) {
  return compiled.typeCheck(source) || [];
}

export function queryType(source, line, number) {
  return compiled.queryType(source, line, number);
}

export function queryDefinitionLocation(source, line, number) {
  return compiled.queryDefinitionLocation(source, line, number);
}

export function autoComplete(source, line, number) {
  return compiled.autoComplete(source, line, number);
}
