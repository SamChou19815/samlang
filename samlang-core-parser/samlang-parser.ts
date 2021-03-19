import {
  SamlangKeywordString,
  SamlangOperatorString,
  SamlangToken,
  samlangTokenContentToString,
} from './samlang-lexer';

import { ModuleReference, Type, unitType, Range, Position } from 'samlang-core-ast/common-nodes';
import type { ModuleErrorCollector } from 'samlang-core-errors';

class EOFWhileParsing extends Error {}

class BaseParser {
  private position = 0;

  constructor(
    private readonly tokens: readonly SamlangToken[],
    public readonly errorCollector: ModuleErrorCollector
  ) {}

  protected available(): boolean {
    return this.position < this.tokens.length;
  }

  protected peek(): SamlangToken {
    const peeked = this.tokens[this.position];
    if (peeked == null) throw new EOFWhileParsing();
    return peeked;
  }

  protected consume(): void {
    const tokens = this.tokens;
    if (this.position >= tokens.length) {
      const position = tokens[tokens.length - 1]?.range.end ?? new Position(0, 0);
      const range = new Range(position, position);
      this.report(range, 'Unexpected end of file.');
      return;
    }
    this.position += 1;
  }

  protected assertAndConsume(token: SamlangKeywordString | SamlangOperatorString): void {
    const { range, content } = this.peek();
    if (content === token) {
      this.consume();
    } else {
      this.report(range, `Expecting ${token}, seeing ${samlangTokenContentToString(content)}.`);
    }
  }

  protected report(range: Range, reason: string): void {
    this.errorCollector.reportSyntaxError(range, reason);
  }

  protected parseCommaSeparatedList = <T>(parser: () => T | null): T[] => {
    const collector: T[] = [];
    pushIfParsed(collector, parser);
    while (this.peek().content === ',') {
      this.consume();
      pushIfParsed(collector, parser);
    }
    return collector;
  };
}

const pushIfParsed = <T>(array: T[], parser: () => T | null): void => {
  const parsed = parser();
  if (parsed != null) array.push(parsed);
};

export default class SamlangParser extends BaseParser {
  constructor(
    tokens: readonly SamlangToken[],
    errorCollector: ModuleErrorCollector,
    private readonly resolveClass: (className: string) => ModuleReference
  ) {
    super(tokens, errorCollector);
  }

  parseType = (): Type => {
    const peeked = this.peek();

    if (
      peeked.content === 'unit' ||
      peeked.content === 'bool' ||
      peeked.content === 'int' ||
      peeked.content === 'string'
    ) {
      this.consume();
      return { type: 'PrimitiveType', name: peeked.content };
    }
    if (typeof peeked.content !== 'string' && peeked.content.__type__ === 'UpperId') {
      const identifier = peeked.content.content;
      this.consume();
      let typeArguments: readonly Type[];
      if (this.peek().content === '<') {
        this.consume();
        typeArguments = this.parseCommaSeparatedList(this.parseType);
        this.assertAndConsume('>');
      } else {
        typeArguments = [];
      }
      return {
        type: 'IdentifierType',
        moduleReference: this.resolveClass(identifier),
        identifier,
        typeArguments,
      };
    }
    if (peeked.content === '[') {
      this.consume();
      const mappings = this.parseCommaSeparatedList(this.parseType);
      this.assertAndConsume(']');
      return { type: 'TupleType', mappings };
    }
    if (peeked.content === '(') {
      this.consume();
      let argumentTypes: readonly Type[];
      if (this.peek().content === ')') {
        this.consume();
        argumentTypes = [];
      } else {
        argumentTypes = this.parseCommaSeparatedList(this.parseType);
        this.assertAndConsume(')');
      }
      this.assertAndConsume('->');
      const returnType = this.parseType();
      return { type: 'FunctionType', argumentTypes, returnType };
    }
    this.report(
      peeked.range,
      `Expecting type, seeing ${samlangTokenContentToString(peeked.content)}`
    );
    return unitType;
  };
}
