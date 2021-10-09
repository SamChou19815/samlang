import type { ModuleReference } from 'samlang-core/ast/common-nodes';
import type { SamlangExpression, SamlangModule } from 'samlang-core/ast/samlang-nodes';
import { ModuleErrorCollector, createGlobalErrorCollector } from 'samlang-core/errors';
import { filterMap } from 'samlang-core/utils';

import lexSamlangProgram from './samlang-lexer';
import SamlangModuleParser from './samlang-parser';

export function parseSamlangModuleFromText(
  text: string,
  moduleReference: ModuleReference,
  builtInClasses: ReadonlySet<string>,
  moduleErrorCollector: ModuleErrorCollector
): SamlangModule {
  const parser = new SamlangModuleParser(
    lexSamlangProgram(text, moduleErrorCollector),
    moduleErrorCollector,
    moduleReference,
    builtInClasses
  );
  return parser.parseModule();
}

export function parseSamlangExpressionFromText(
  text: string,
  moduleReference: ModuleReference,
  builtInClasses: ReadonlySet<string>,
  moduleErrorCollector: ModuleErrorCollector
): SamlangExpression {
  const parser = new SamlangModuleParser(
    lexSamlangProgram(text, moduleErrorCollector),
    moduleErrorCollector,
    moduleReference,
    builtInClasses
  );
  return parser.parseExpression();
}

export function parseSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
  builtInClasses: ReadonlySet<string>
): readonly (readonly [ModuleReference, SamlangModule])[] {
  const errorCollector = createGlobalErrorCollector();
  return filterMap(sourceHandles, ([moduleReference, sourceString]) => {
    const moduleErrorCollector = errorCollector.getModuleErrorCollector(moduleReference);
    const parsed = parseSamlangModuleFromText(
      sourceString,
      moduleReference,
      builtInClasses,
      moduleErrorCollector
    );
    return moduleErrorCollector.hasErrors ? null : ([moduleReference, parsed] as const);
  });
}
