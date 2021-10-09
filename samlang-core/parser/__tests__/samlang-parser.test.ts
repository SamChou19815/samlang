import { ModuleReference, Range } from '../../ast/common-nodes';
import { createGlobalErrorCollector } from '../../errors';
import SamlangParser, { BaseParser } from '../samlang-parser';

describe('samlang-parser', () => {
  it('BaseParser test', () => {
    class P extends BaseParser {
      constructor() {
        super([], createGlobalErrorCollector().getModuleErrorCollector(ModuleReference.DUMMY));
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
      createGlobalErrorCollector().getModuleErrorCollector(ModuleReference.DUMMY),
      ModuleReference.DUMMY,
      new Set()
    );
    parser.parseClass();
    parser.parseSourceClassMemberDefinition();
    parser.parseExpression();
    parser.parseModule();
    parser.parsePattern();
    parser.parseStatement();
    parser.parseType();
  });

  it('SamlangParser error robustness test', () => {
    const parser = new SamlangParser(
      [{ range: Range.DUMMY, content: { __type__: 'Error', content: 'fooooo' } }],
      createGlobalErrorCollector().getModuleErrorCollector(ModuleReference.DUMMY),
      ModuleReference.DUMMY,
      new Set()
    );

    parser.parseClass();
    parser.parseSourceClassMemberDefinition();
    parser.parseExpression();
    parser.parseModule();
    parser.parsePattern();
    parser.parseStatement();
    parser.parseType();
  });
});
