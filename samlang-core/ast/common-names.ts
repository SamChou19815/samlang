import { ModuleReference } from './common-nodes';

export function encodeFunctionNameGlobally(
  moduleReference: ModuleReference,
  className: string,
  functionName: string,
): string {
  const encodedModuleReference = moduleReference.map((it) => it.replace(/-/g, '_')).join('$');
  return `_${encodedModuleReference}_${className}_${functionName}`;
}

export const encodeBuiltinName = (name: string): string => `_builtin_${name}`;

export const encodeMainFunctionName = (moduleReference: ModuleReference): string =>
  encodeFunctionNameGlobally(moduleReference, 'Main', 'main');

export const ENCODED_FUNCTION_NAME_MALLOC = encodeBuiltinName('malloc');
export const ENCODED_FUNCTION_NAME_FREE = encodeBuiltinName('free');
export const ENCODED_FUNCTION_NAME_STRING_CONCAT = encodeBuiltinName('stringConcat');
export const ENCODED_FUNCTION_NAME_THROW = encodeFunctionNameGlobally(
  ModuleReference.ROOT,
  'Builtins',
  'panic',
);
export const ENCODED_FUNCTION_NAME_STRING_TO_INT = encodeFunctionNameGlobally(
  ModuleReference.ROOT,
  'Builtins',
  'stringToInt',
);
export const ENCODED_FUNCTION_NAME_INT_TO_STRING = encodeFunctionNameGlobally(
  ModuleReference.ROOT,
  'Builtins',
  'intToString',
);
export const ENCODED_FUNCTION_NAME_PRINTLN = encodeFunctionNameGlobally(
  ModuleReference.ROOT,
  'Builtins',
  'println',
);

export const ENCODED_COMPILED_PROGRAM_MAIN = '_compiled_program_main';
