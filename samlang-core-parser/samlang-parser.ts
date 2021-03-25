import {
  SamlangKeywordString,
  SamlangOperatorString,
  SamlangToken,
  samlangTokenContentToString,
} from './samlang-lexer';

import {
  ModuleReference,
  Type,
  UndecidedTypes,
  unitType,
  tupleType,
  functionType,
  Range,
  Position,
} from 'samlang-core-ast/common-nodes';
import {
  SamlangExpression,
  EXPRESSION_TRUE,
  EXPRESSION_FALSE,
  EXPRESSION_INT,
  EXPRESSION_STRING,
  EXPRESSION_VARIABLE,
  EXPRESSION_CLASS_MEMBER,
  EXPRESSION_VARIANT_CONSTRUCTOR,
  EXPRESSION_TUPLE_CONSTRUCTOR,
  EXPRESSION_LAMBDA,
} from 'samlang-core-ast/samlang-expressions';
import type { ModuleErrorCollector } from 'samlang-core-errors';
import { Long } from 'samlang-core-utils';

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

  protected unconsume(n = 1): void {
    this.position -= n;
  }

  protected assertAndConsume(token: SamlangKeywordString | SamlangOperatorString): Range {
    const { range, content } = this.peek();
    if (content === token) {
      this.consume();
    } else {
      this.report(range, `Expecting ${token}, seeing ${samlangTokenContentToString(content)}.`);
    }
    return range;
  }

  protected assertAndPeekLowerId(): { readonly range: Range; readonly variable: string } {
    const { range, content } = this.peek();
    if (typeof content !== 'string' && content.__type__ === 'LowerId') {
      this.consume();
      return { range, variable: content.content };
    }
    this.report(range, `Expecting lowerId, seeing ${samlangTokenContentToString(content)}.`);
    return { range, variable: 'MISSING' };
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

const unescapeQuotes = (source: string): string => source.replace(/\\"/g, '"');

export default class SamlangParser extends BaseParser {
  constructor(
    tokens: readonly SamlangToken[],
    errorCollector: ModuleErrorCollector,
    private readonly resolveClass: (className: string) => ModuleReference
  ) {
    super(tokens, errorCollector);
  }

  parseExpression = (): SamlangExpression => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.parseBaseExpression()!;
  };

  private parseBaseExpression = (): SamlangExpression | null => {
    const peeked = this.peek();

    if (peeked.content === 'true') {
      this.consume();
      return EXPRESSION_TRUE(peeked.range);
    }
    if (peeked.content === 'false') {
      this.consume();
      return EXPRESSION_FALSE(peeked.range);
    }

    if (typeof peeked.content !== 'string') {
      if (peeked.content.__type__ === 'IntLiteral') {
        this.consume();
        return EXPRESSION_INT(peeked.range, Long.fromString(peeked.content.content));
      }

      if (peeked.content.__type__ === 'StringLiteral') {
        this.consume();
        const literalText = peeked.content.content;
        return EXPRESSION_STRING(
          peeked.range,
          unescapeQuotes(literalText.substring(1, literalText.length - 1))
        );
      }

      if (peeked.content.__type__ === 'LowerId') {
        this.consume();
        return EXPRESSION_VARIABLE({
          range: peeked.range,
          type: UndecidedTypes.next(),
          name: peeked.content.content,
        });
      }

      if (peeked.content.__type__ === 'UpperId') {
        this.consume();
        const className = peeked.content.content;
        const nextPeeked = this.peek();
        if (nextPeeked.content === '.') {
          this.consume();
          const lowerIdPeeked = this.peek();
          let lowerId: string;
          if (
            typeof lowerIdPeeked.content === 'string' ||
            lowerIdPeeked.content.__type__ !== 'LowerId'
          ) {
            this.report(
              lowerIdPeeked.range,
              `Expecting lowerId, seeing ${samlangTokenContentToString(lowerIdPeeked.content)}.`
            );
            lowerId = '';
          } else {
            this.consume();
            lowerId = lowerIdPeeked.content.content;
          }
          return EXPRESSION_CLASS_MEMBER({
            range: peeked.range.union(lowerIdPeeked.range),
            type: UndecidedTypes.next(),
            typeArguments: [],
            moduleReference: this.resolveClass(className),
            className,
            classNameRange: peeked.range,
            memberName: lowerId,
            memberNameRange: lowerIdPeeked.range,
          });
        }
        if (nextPeeked.content === '(') {
          this.consume();
          const child = this.parseExpression();
          const endRange = this.assertAndConsume(')');
          return EXPRESSION_VARIANT_CONSTRUCTOR({
            range: peeked.range.union(endRange),
            type: UndecidedTypes.next(),
            tag: peeked.content.content,
            tagOrder: -1,
            data: child,
          });
        }
      }
    }

    if (peeked.content === '(') {
      this.consume();
      if (this.peek().content === ')') {
        this.consume();
        this.assertAndConsume('->');
        const body = this.parseExpression();
        return EXPRESSION_LAMBDA({
          range: peeked.range.union(body.range),
          type: functionType([], body.type),
          parameters: [],
          captured: {},
          body,
        });
      }
      const lowerIdentifierForLambdaPeeked = this.peek();
      if (
        typeof lowerIdentifierForLambdaPeeked.content !== 'string' &&
        lowerIdentifierForLambdaPeeked.content.__type__ === 'LowerId'
      ) {
        this.consume();
        const next = this.peek();
        if (next.content === ',' || next.content === ':') {
          this.unconsume();
          const parameters = this.parseCommaSeparatedList(this.parseOptionallyAnnotatedVariable);
          this.assertAndConsume(')');
          this.assertAndConsume('->');
          const body = this.parseExpression();
          return EXPRESSION_LAMBDA({
            range: peeked.range.union(body.range),
            type: functionType(
              parameters.map((it) => it[1]),
              body.type
            ),
            parameters,
            captured: {},
            body,
          });
        } else if (next.content === ')') {
          this.consume();
          if (this.peek().content === '->') {
            this.consume();
            const body = this.parseExpression();
            return EXPRESSION_LAMBDA({
              range: peeked.range.union(body.range),
              type: functionType([UndecidedTypes.next()], body.type),
              parameters: [[lowerIdentifierForLambdaPeeked.content.content, UndecidedTypes.next()]],
              captured: {},
              body,
            });
          }
        } else {
          this.unconsume();
        }
      }
      const nestedExpression = this.parseExpression();
      this.assertAndConsume(')');
      return nestedExpression;
    }

    if (peeked.content === '[') {
      this.consume();
      const expressions = this.parseCommaSeparatedList(this.parseExpression);
      const endRange = this.assertAndConsume(']');
      return EXPRESSION_TUPLE_CONSTRUCTOR({
        range: peeked.range.union(endRange),
        type: tupleType(UndecidedTypes.nextN(expressions.length)),
        expressions,
      });
    }

    // TODO: parse ObjConstructor

    return null;
  };

  private parseOptionallyAnnotatedVariable = (): readonly [string, Type] => {
    const { variable } = this.assertAndPeekLowerId();
    if (this.peek().content === ':') {
      this.consume();
      const type = this.parseType();
      return [variable, type];
    }
    return [variable, UndecidedTypes.next()];
  };

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
