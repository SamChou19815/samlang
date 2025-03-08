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

export const State = compiled.State;
