function samlangGeneratedWebAssemblyLoader(bytes, builtinsPatch = () => ({})) {
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 65536 });
  const codeModule = new WebAssembly.Module(bytes);
  let instance = null;

  // Convert a WASM GC string array to a JavaScript string using exported helpers
  function gcArrayToString(arr) {
    if (!instance) throw new Error('Instance not initialized');
    const len = instance.exports.__strLen(arr);
    const codes = [];
    for (let i = 0; i < len; i++) {
      codes.push(instance.exports.__strGet(arr, i));
    }
    return String.fromCharCode(...codes);
  }

  const builtins = {
    __Process$println(_, strArr) {
      console.log(gcArrayToString(strArr));
      return 0;
    },
    __Process$panic(_, strArr) {
      throw new Error(gcArrayToString(strArr));
    },
    ...builtinsPatch(gcArrayToString),
  };

  instance = new WebAssembly.Instance(codeModule, { env: { memory }, builtins });

  return {
    ...builtins,
    ...instance.exports,
  };
}

module.exports = samlangGeneratedWebAssemblyLoader;
