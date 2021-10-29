module.exports = function samlangGeneratedWebAssemblyLoader(bytes, builtinsPatch = () => ({})) {
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 65536 });
  const codeModule = new WebAssembly.Module(bytes);

  function pointerToString(p) {
    const mem = new Uint32Array(memory.buffer);
    const start = p / 4;
    const length = mem[start + 1];
    const characterCodes = Array.from(mem.subarray(start + 2, start + 2 + length).values());
    return String.fromCharCode(...characterCodes);
  }

  const builtins = {
    __Builtins_println(p) {
      // eslint-disable-next-line no-console
      console.log(pointerToString(p));
      return 0;
    },
    __Builtins_panic(p) {
      throw new Error(pointerToString(p));
    },
    ...builtinsPatch(pointerToString),
  };

  return {
    ...builtins,
    ...new WebAssembly.Instance(codeModule, { env: { memory }, builtins }).exports,
  };
};
