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
  boolType,
  intType,
  stringType,
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
  EXPRESSION_THIS,
  EXPRESSION_CLASS_MEMBER,
  EXPRESSION_TUPLE_CONSTRUCTOR,
  EXPRESSION_OBJECT_CONSTRUCTOR,
  EXPRESSION_VARIANT_CONSTRUCTOR,
  EXPRESSION_FIELD_ACCESS,
  EXPRESSION_UNARY,
  EXPRESSION_PANIC,
  EXPRESSION_BUILTIN_FUNCTION_CALL,
  EXPRESSION_FUNCTION_CALL,
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
    return this.parseUnaryExpression();
  };

  private parseUnaryExpression = (): SamlangExpression => {
    const peeked = this.peek();

    if (peeked.content === '!') {
      this.consume();
      const expression = this.parseBaseExpression();
      return EXPRESSION_UNARY({
        range: peeked.range.union(expression.range),
        type: boolType,
        operator: '!',
        expression,
      });
    }
    if (peeked.content === '-') {
      this.consume();
      const expression = this.parseBaseExpression();
      return EXPRESSION_UNARY({
        range: peeked.range.union(expression.range),
        type: intType,
        operator: '-',
        expression,
      });
    }

    return this.parseFunctionCall();
  };

  private parseFunctionCall = (): SamlangExpression => {
    const peeked = this.peek();

    if (peeked.content === 'panic') {
      this.consume();
      this.assertAndConsume('(');
      const expression = this.parseExpression();
      const endRange = this.assertAndConsume(')');
      return EXPRESSION_PANIC({
        range: peeked.range.union(endRange),
        type: UndecidedTypes.next(),
        expression,
      });
    }
    if (peeked.content === 'stringToInt') {
      this.consume();
      this.assertAndConsume('(');
      const argumentExpression = this.parseExpression();
      const endRange = this.assertAndConsume(')');
      return EXPRESSION_BUILTIN_FUNCTION_CALL({
        range: peeked.range.union(endRange),
        type: intType,
        functionName: 'stringToInt',
        argumentExpression,
      });
    }
    if (peeked.content === 'intToString') {
      this.consume();
      this.assertAndConsume('(');
      const argumentExpression = this.parseExpression();
      const endRange = this.assertAndConsume(')');
      return EXPRESSION_BUILTIN_FUNCTION_CALL({
        range: peeked.range.union(endRange),
        type: stringType,
        functionName: 'intToString',
        argumentExpression,
      });
    }
    if (peeked.content === 'println') {
      this.consume();
      this.assertAndConsume('(');
      const argumentExpression = this.parseExpression();
      const endRange = this.assertAndConsume(')');
      return EXPRESSION_BUILTIN_FUNCTION_CALL({
        range: peeked.range.union(endRange),
        type: unitType,
        functionName: 'println',
        argumentExpression,
      });
    }

    const functionExpression = this.parseFieldAccessExpression();
    if (this.peek().content !== '(') return functionExpression;
    this.consume();
    const functionArguments = this.parseCommaSeparatedList(this.parseExpression);
    const endRange = this.assertAndConsume(')');
    return EXPRESSION_FUNCTION_CALL({
      range: peeked.range.union(endRange),
      type: UndecidedTypes.next(),
      functionExpression,
      functionArguments,
    });
  };

  private parseFieldAccessExpression = (): SamlangExpression => {
    const baseExpression = this.parseBaseExpression();
    if (this.peek().content !== '.') return baseExpression;
    const { range, variable } = this.assertAndPeekLowerId();
    return EXPRESSION_FIELD_ACCESS({
      range: baseExpression.range.union(range),
      type: UndecidedTypes.next(),
      expression: baseExpression,
      fieldName: variable,
      fieldOrder: -1,
    });
  };

  private parseBaseExpression = (): SamlangExpression => {
    const peeked = this.peek();

    if (peeked.content === 'true') {
      this.consume();
      return EXPRESSION_TRUE(peeked.range);
    }
    if (peeked.content === 'false') {
      this.consume();
      return EXPRESSION_FALSE(peeked.range);
    }
    if (peeked.content === 'this') {
      this.consume();
      return EXPRESSION_THIS({ range: peeked.range, type: UndecidedTypes.next() });
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
          const parameters = this.parseCommaSeparatedList((): readonly [string, Type] => {
            const { variable } = this.assertAndPeekLowerId();
            if (this.peek().content === ':') {
              this.consume();
              const type = this.parseType();
              return [variable, type];
            }
            return [variable, UndecidedTypes.next()];
          });
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

    if (peeked.content === '{') {
      const lowerIdentifierForObjectFieldPeeked = this.peek();
      if (
        typeof lowerIdentifierForObjectFieldPeeked.content !== 'string' &&
        lowerIdentifierForObjectFieldPeeked.content.__type__ === 'LowerId'
      ) {
        this.consume();
        const next = this.peek();
        if (next.content === ',' || next.content === ':') {
          this.unconsume();
          const fieldDeclarations = this.parseCommaSeparatedList(() => {
            const { range, variable } = this.assertAndPeekLowerId();
            if (this.peek().content !== ':') {
              return { range, type: UndecidedTypes.next(), name: variable };
            }
            this.consume();
            const expression = this.parseExpression();
            return {
              range: range.union(expression.range),
              type: UndecidedTypes.next(),
              name: variable,
              expression,
            };
          });
          const endRange = this.assertAndConsume('}');
          return EXPRESSION_OBJECT_CONSTRUCTOR({
            range: peeked.range.union(endRange),
            type: UndecidedTypes.next(),
            fieldDeclarations,
          });
        }
      }

      // TODO parse statement block
    }

    // We failed to parse the base expression, so we stick in a dummy value here.
    return EXPRESSION_INT(peeked.range, 0);
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
