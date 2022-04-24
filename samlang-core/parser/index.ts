import type { ModuleReference } from '../ast/common-nodes';
import type { SamlangExpression, SamlangModule } from '../ast/samlang-nodes';
import { createGlobalErrorCollector, GlobalErrorReporter } from '../errors';
import { filterMap } from '../utils';
import lexSamlangProgram from './samlang-lexer';
import SamlangModuleParser from './samlang-parser';

export type DefaultBuiltinClasses = 'Builtins';
export const DEFAULT_BUILTIN_CLASSES: DefaultBuiltinClasses[] = ['Builtins'];
const builtinClassesSet = new Set(DEFAULT_BUILTIN_CLASSES);

export function parseSamlangModuleFromText(
  text: string,
  moduleReference: ModuleReference,
  errorReporter: GlobalErrorReporter
): SamlangModule {
  const parser = new SamlangModuleParser(
    lexSamlangProgram(text, moduleReference, errorReporter),
    errorReporter,
    moduleReference,
    builtinClassesSet
  );
  return parser.parseModule();
}

export function parseSamlangExpressionFromText(
  text: string,
  moduleReference: ModuleReference,
  errorReporter: GlobalErrorReporter
): SamlangExpression {
  const parser = new SamlangModuleParser(
    lexSamlangProgram(text, moduleReference, errorReporter),
    errorReporter,
    moduleReference,
    builtinClassesSet
  );
  return parser.parseExpression();
}

export function parseSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[]
): readonly (readonly [ModuleReference, SamlangModule])[] {
  const errorCollector = createGlobalErrorCollector();
  return filterMap(sourceHandles, ([moduleReference, sourceString]) => {
    const errorReporter = errorCollector.getErrorReporter();
    const parsed = parseSamlangModuleFromText(sourceString, moduleReference, errorReporter);
    return errorCollector.moduleHasError(moduleReference)
      ? null
      : ([moduleReference, parsed] as const);
  });
}
