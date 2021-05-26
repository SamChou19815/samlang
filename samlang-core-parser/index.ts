import lexSamlangProgram from './samlang-lexer';
import SamlangModuleParser from './samlang-parser';

import type { ModuleReference } from 'samlang-core-ast/common-nodes';
import type { SamlangExpression } from 'samlang-core-ast/samlang-expressions';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import type { ModuleErrorCollector } from 'samlang-core-errors';

export const parseSamlangModuleFromText = (
  text: string,
  moduleReference: ModuleReference,
  builtInClasses: ReadonlySet<string>,
  moduleErrorCollector: ModuleErrorCollector
): SamlangModule => {
  const parser = new SamlangModuleParser(
    lexSamlangProgram(text, moduleErrorCollector),
    moduleErrorCollector,
    moduleReference,
    builtInClasses
  );
  return parser.parseModule();
};

export const parseSamlangExpressionFromText = (
  text: string,
  moduleReference: ModuleReference,
  builtInClasses: ReadonlySet<string>,
  moduleErrorCollector: ModuleErrorCollector
): SamlangExpression => {
  const parser = new SamlangModuleParser(
    lexSamlangProgram(text, moduleErrorCollector),
    moduleErrorCollector,
    moduleReference,
    builtInClasses
  );
  return parser.parseExpression();
};
