import type { ModuleReference } from 'samlang-core-ast/common-nodes';
import type { SamlangExpression, SamlangModule } from 'samlang-core-ast/samlang-nodes';
import type { ModuleErrorCollector } from 'samlang-core-errors';

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
