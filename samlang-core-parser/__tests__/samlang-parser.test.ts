import SamlangParser, { BaseParser } from '../samlang-parser';

import { ModuleReference, Range } from 'samlang-core-ast/common-nodes';
import { createGlobalErrorCollector } from 'samlang-core-errors';

it('BaseParser test', () => {
  class P extends BaseParser {
    constructor() {
      super([], createGlobalErrorCollector().getModuleErrorCollector(ModuleReference.ROOT));
    }

    test() {
      this.consume();
      this.peek();
    }
  }

  const parser = new P();
  parser.test();
});

it('SamlangParser empty robustness test', () => {
  const parser = new SamlangParser(
    [],
    createGlobalErrorCollector().getModuleErrorCollector(ModuleReference.ROOT),
    ModuleReference.ROOT
  );
  parser.parseClass();
  parser.parseClassMemberDefinition();
  parser.parseExpression();
  parser.parseModule();
  parser.parsePattern();
  parser.parseStatement();
  parser.parseType();
});

it('SamlangParser error robustness test', () => {
  const parser = new SamlangParser(
    [{ range: Range.DUMMY, content: { __type__: 'Error', content: 'fooooo' } }],
    createGlobalErrorCollector().getModuleErrorCollector(ModuleReference.ROOT),
    ModuleReference.ROOT
  );

  parser.parseClass();
  parser.parseClassMemberDefinition();
  parser.parseExpression();
  parser.parseModule();
  parser.parsePattern();
  parser.parseStatement();
  parser.parseType();
});
