import { parseText } from 'binaryen';

import samlangGeneratedWebAssemblyLoader from '../loader';

describe('samlang-core/loader', () => {
  const f = samlangGeneratedWebAssemblyLoader(parseText('(module)').emitBinary());

  it('__Builtins_println test', () => {
    f.__Builtins_println?.();
  });

  it('__Builtins_panic test', () => {
    expect(() => f.__Builtins_panic?.()).toThrow();
  });
});
