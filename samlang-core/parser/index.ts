import type { ModuleReference } from '../ast/common-nodes';
import type { SamlangExpression, SamlangModule } from '../ast/samlang-nodes';
import { ModuleErrorCollector, createGlobalErrorCollector } from '../errors';
import { filterMap } from '../utils';
import lexSamlangProgram from './samlang-lexer';
import SamlangModuleParser from './samlang-parser';

export type DefaultBuiltinClasses = 'Builtins';
export const DEFAULT_BUILTIN_CLASSES: DefaultBuiltinClasses[] = ['Builtins'];
const builtinClassesSet = new Set(DEFAULT_BUILTIN_CLASSES);

export function parseSamlangModuleFromText(
  text: string,
  moduleReference: ModuleReference,
  moduleErrorCollector: ModuleErrorCollector
): SamlangModule {
  const parser = new SamlangModuleParser(
    lexSamlangProgram(text, moduleErrorCollector),
    moduleErrorCollector,
    moduleReference,
    builtinClassesSet
  );
  return parser.parseModule();
}

export function parseSamlangExpressionFromText(
  text: string,
  moduleReference: ModuleReference,
  moduleErrorCollector: ModuleErrorCollector
): SamlangExpression {
  const parser = new SamlangModuleParser(
    lexSamlangProgram(text, moduleErrorCollector),
    moduleErrorCollector,
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
    const moduleErrorCollector = errorCollector.getModuleErrorCollector(moduleReference);
    const parsed = parseSamlangModuleFromText(sourceString, moduleReference, moduleErrorCollector);
    return moduleErrorCollector.hasErrors ? null : ([moduleReference, parsed] as const);
  });
}
