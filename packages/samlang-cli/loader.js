function samlangGeneratedWebAssemblyLoader(
  /** @type {ArrayBufferView | ArrayBuffer} */ bytes,
  builtinsPatch = () => ({})
) {
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 65536 });
  const codeModule = new WebAssembly.Module(bytes);

  function pointerToString(/** @type {number} */ p) {
    const mem = new Uint32Array(memory.buffer);
    const start = p / 4;
    const length = mem[start + 1];
    const characterCodes = Array.from(mem.subarray(start + 2, start + 2 + length).values());
    return String.fromCharCode(...characterCodes);
  }

  const builtins = {
    __Builtins$println(p) {
      // eslint-disable-next-line no-console
      console.log(pointerToString(p));
      return 0;
    },
    __Builtins$panic(p) {
      throw new Error(pointerToString(p));
    },
    ...builtinsPatch(pointerToString),
  };

  return {
    ...builtins,
    ...new WebAssembly.Instance(codeModule, { env: { memory }, builtins }).exports,
  };
}

module.exports = samlangGeneratedWebAssemblyLoader;