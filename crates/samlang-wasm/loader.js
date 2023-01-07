// @ts-check

export default async function interpretWebAssemblyModule(
  /** @type {ArrayBufferView | ArrayBuffer} */ emittedWasmBinary
) {
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 65536 });
  function pointerToString(/** @type {number} */ p) {
    const mem = new Uint32Array(memory.buffer);
    const start = p / 4;
    const length = mem[start + 1];
    const characterCodes = Array.from(mem.subarray(start + 2, start + 2 + length).values());
    return String.fromCharCode(...characterCodes);
  }

  let printed = '';

  const builtins = {
    __Builtins$println(p) {
      printed += pointerToString(p);
      printed += '\n';
      return 0;
    },
    __Builtins$panic(p) {
      throw new Error(pointerToString(p));
    },
  };

  const codeModule = await WebAssembly.instantiate(emittedWasmBinary, {
    env: { memory },
    builtins,
  });

  /** @type {any} */
  const exports = codeModule.instance.exports;
  exports['_Demo_Main$main']?.();
  return printed;
}
