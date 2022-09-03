/* eslint-disable no-console */

import { jest } from '@jest/globals';
import binaryen from 'binaryen';
import samlangGeneratedWebAssemblyLoader from '../loader';

describe('samlang-core/loader', () => {
  const f = samlangGeneratedWebAssemblyLoader(binaryen.parseText('(module)').emitBinary());

  it('__Builtins_println test', () => {
    // Suppress console.log
    const log = (...args: readonly unknown[]) => console.log(...args);
    const mockLog = jest.fn();
    console.log = mockLog;
    f.__Builtins$println?.();
    console.log = log;
    expect(mockLog).toBeCalled();
  });

  it('__Builtins_panic test', () => {
    expect(() => f.__Builtins$panic?.()).toThrow();
  });
});
