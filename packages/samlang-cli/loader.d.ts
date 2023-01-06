export default function samlangGeneratedWebAssemblyLoader(
  bytes: ArrayBufferView | ArrayBuffer,
  builtinsPatch: (
    pointerToString: (p: number) => string
    // eslint-disable-next-line @typescript-eslint/ban-types
  ) => Readonly<Record<string, Function>> = {}
  // eslint-disable-next-line @typescript-eslint/ban-types
): Record<string, Function>;
