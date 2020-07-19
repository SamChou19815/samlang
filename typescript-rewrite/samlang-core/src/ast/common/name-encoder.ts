import type ModuleReference from './module-reference';

export const encodeFunctionNameLocally = (className: string, functionName: string): string =>
  `class_${className}_function_${functionName}`;

export const encodeFunctionNameGlobally = (
  moduleReference: ModuleReference,
  className: string,
  functionName: string
): string => {
  const encodedModuleReference = moduleReference.parts
    .map((it) => it.replace(/-/g, '_'))
    .join('__');
  return `_module_${encodedModuleReference}_${encodeFunctionNameLocally(className, functionName)}`;
};

export const encodeBuiltinName = (name: string): string => `_builtin_${name}`;

export const encodeMainFunctionName = (moduleReference: ModuleReference): string =>
  encodeFunctionNameGlobally(moduleReference, 'Main', 'main');

export const ENCODED_FUNCTION_NAME_THROW = encodeBuiltinName('throw');
export const ENCODED_FUNCTION_NAME_MALLOC = encodeBuiltinName('malloc');
export const ENCODED_FUNCTION_NAME_STRING_CONCAT = encodeBuiltinName('stringConcat');
export const ENCODED_FUNCTION_NAME_STRING_TO_INT = encodeBuiltinName('stringToInt');
export const ENCODED_FUNCTION_NAME_INT_TO_STRING = encodeBuiltinName('intToString');
export const ENCODED_FUNCTION_NAME_PRINTLN = encodeBuiltinName('println');

export const ENCODED_COMPILED_PROGRAM_MAIN = '_compiled_program_main';
