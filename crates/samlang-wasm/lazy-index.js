import interpret from './loader.js';

const singleton = import('./samlang-demo/samlang_wasm.js');

// Use the indirection to avoid the need of toplevel await

export async function compile(source) {
  try {
    const compilationResult = (await singleton).compile(source);
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

export async function queryType(source, line, number) {
  return (await singleton).queryType(source, line, number);
}

export async function queryDefinitionLocation(source, line, number) {
  return (await singleton).queryDefinitionLocation(source, line, number);
}

export async function autoComplete(source, line, number) {
  return (await singleton).autoComplete(source, line, number);
}
