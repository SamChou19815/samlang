// @ts-check

export default async function interpretWebAssemblyModule(
  /** @type {ArrayBufferView | ArrayBuffer} */ emittedWasmBinary
) {
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 65536 });

  let printed = '';

  /** @type {any} */
  let exports;

  /** @param {any} strRef */
  function gcStringToJS(strRef) {
    const len = exports.__strLen(strRef);
    let result = '';
    for (let i = 0; i < len; i++) {
      result += String.fromCharCode(exports.__strGet(strRef, i));
    }
    return result;
  }

  const builtins = {
    /** @param {any} _ @param {any} strRef */
    __Process$println(_, strRef) {
      printed += gcStringToJS(strRef);
      printed += '\n';
      return 0;
    },
    /** @param {any} _ @param {any} strRef */
    __Process$panic(_, strRef) {
      throw new Error(gcStringToJS(strRef));
    },
  };

  const codeModule = await WebAssembly.instantiate(emittedWasmBinary, {
    env: { memory },
    builtins,
  });

  exports = codeModule.instance.exports;
  exports['_Demo_Main$main']?.();
  return printed;
}
