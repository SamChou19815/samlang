function samlangGeneratedWebAssemblyLoader(bytes, builtinsPatch = () => ({})) {
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 65536 });
  const codeModule = new WebAssembly.Module(bytes);

  function pointerToString(p) {
    const mem = new Uint8Array(memory.buffer);
    const length = mem[p + 4] | (mem[p + 5] << 8) | (mem[p + 6] << 16) | (mem[p + 7] << 24);
    const characterCodes = Array.from(mem.subarray(p + 8, p + 8 + length).values());
    return String.fromCharCode(...characterCodes);
  }

  const builtins = {
    __Process$println(_, p) {
      console.log(pointerToString(p));
      return 0;
    },
    __Process$panic(_, p) {
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
