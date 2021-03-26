import { postProcessBlockComment } from './parser-comment-collector';
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
  BinaryOperator,
  MUL,
  DIV,
  MOD,
  PLUS,
  MINUS,
  LT,
  LE,
  GT,
  GE,
  EQ,
  NE,
  AND,
} from 'samlang-core-ast/common-operators';
import {
  SamlangExpression,
  VariantPatternToExpression,
  SamlangValStatement,
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
  EXPRESSION_BINARY,
  EXPRESSION_IF_ELSE,
  EXPRESSION_LAMBDA,
  EXPRESSION_MATCH,
  EXPRESSION_STATEMENT_BLOCK,
} from 'samlang-core-ast/samlang-expressions';
import type { Pattern } from 'samlang-core-ast/samlang-pattern';
import type { ClassMemberDefinition } from 'samlang-core-ast/samlang-toplevel';
import type { ModuleErrorCollector } from 'samlang-core-errors';
import { checkNotNull, Long } from 'samlang-core-utils';

class EOFWhileParsing extends Error {}

class BaseParser {
  private position = 0;

  constructor(
    private readonly tokens: readonly SamlangToken[],
    public readonly errorCollector: ModuleErrorCollector
  ) {}

  protected lastRange(): Range {
    return checkNotNull(this.tokens[this.position - 1]).range;
  }

  protected simplePeek(): SamlangToken {
    const peeked = this.tokens[this.position];
    if (peeked == null) throw new EOFWhileParsing();
    return peeked;
  }

  protected peek(): SamlangToken {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const peeked = this.simplePeek();
      if (typeof peeked.content === 'string') return peeked;
      if (peeked.content.__type__ === 'BlockComment' || peeked.content.__type__ === 'LineComment') {
        this.consume();
      } else {
        return peeked;
      }
    }
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

  protected assertAndPeekUpperId(): { readonly range: Range; readonly variable: string } {
    const { range, content } = this.peek();
    if (typeof content !== 'string' && content.__type__ === 'UpperId') {
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

  parseClassMemberDefinition = (): ClassMemberDefinition => {
    const documentTextList: string[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const token = this.simplePeek().content;
      if (typeof token === 'string') break;
      if (token.__type__ === 'LineComment') continue;
      if (token.__type__ !== 'BlockComment' || !token.content.startsWith('/**')) break;
      const rawText = token.content;
      documentTextList.push(postProcessBlockComment(rawText.substring(3, rawText.length - 2)));
    }
    const documentText = documentTextList.length === 0 ? null : documentTextList.join(' ');
    let startRange: Range;
    let isPublic = true;
    let isMethod = true;
    let peeked: SamlangToken;
    if (this.peek().content === 'private') {
      isPublic = false;
      startRange = this.peek().range;
      this.consume();
      peeked = this.peek();
    } else {
      peeked = this.peek();
      startRange = peeked.range;
    }
    if (peeked.content === 'function') {
      isMethod = false;
      this.consume();
    }
    this.assertAndConsume('method');
    let typeParameters: string[];
    if (this.peek().content === '<') {
      this.consume();
      typeParameters = this.parseCommaSeparatedList(() => this.assertAndPeekUpperId()).map(
        (it) => it.variable
      );
      this.assertAndConsume('>');
    } else {
      typeParameters = [];
    }
    const { range: nameRange, variable: name } = this.assertAndPeekLowerId();
    this.assertAndConsume('(');
    const parameters = this.parseCommaSeparatedList(() => {
      const lowerId = this.assertAndPeekLowerId();
      this.assertAndConsume(':');
      const typeStartRange = this.peek().range;
      const type = this.parseType();
      const typeRange = typeStartRange.union(this.lastRange());
      return { name: lowerId.variable, nameRange: lowerId.range, type, typeRange };
    });
    this.assertAndConsume(')');
    this.assertAndConsume(':');
    const returnType = this.parseType();
    this.assertAndConsume('=');
    const body = this.parseExpression();
    return {
      range: startRange.union(body.range),
      documentText,
      isPublic,
      isMethod,
      nameRange,
      name,
      typeParameters,
      type: functionType(
        parameters.map((it) => it.type),
        returnType
      ),
      parameters,
      body,
    };
  };

  parseExpression = (): SamlangExpression => this.parseMatch();

  private parseMatch = (): SamlangExpression => {
    const peeked = this.peek();
    if (peeked.content !== 'match') return this.parseIfElse();
    this.assertAndConsume('(');
    const matchedExpression = this.parseExpression();
    this.assertAndConsume(')');
    this.assertAndConsume('{');
    const matchingList = [this.parsePatternToExpression()];
    while (this.peek().content === '|') {
      matchingList.push(this.parsePatternToExpression());
    }
    const endRange = this.assertAndConsume('}');
    return EXPRESSION_MATCH({
      range: peeked.range.union(endRange),
      type: UndecidedTypes.next(),
      matchedExpression,
      matchingList,
    });
  };

  private parsePatternToExpression = (): VariantPatternToExpression => {
    const startRange = this.assertAndConsume('|');
    const { variable: tag } = this.assertAndPeekUpperId();
    let dataVariable: readonly [string, Type] | undefined;
    if (this.peek().content === '_') {
      this.consume();
    } else {
      dataVariable = [this.assertAndPeekLowerId().variable, UndecidedTypes.next()];
    }
    this.assertAndConsume('->');
    const expression = this.parseExpression();
    return {
      range: startRange.union(expression.range),
      tag,
      tagOrder: -1,
      dataVariable,
      expression,
    };
  };

  private parseIfElse = (): SamlangExpression => {
    const peeked = this.peek();
    if (peeked.content !== 'if') return this.parseDisjunction();
    this.consume();
    const boolExpression = this.parseExpression();
    this.assertAndConsume('then');
    const e1 = this.parseExpression();
    this.assertAndConsume('else');
    const e2 = this.parseExpression();
    return EXPRESSION_IF_ELSE({
      range: peeked.range.union(e2.range),
      type: UndecidedTypes.next(),
      boolExpression,
      e1,
      e2,
    });
  };

  private parseDisjunction = (): SamlangExpression => {
    let e = this.parseConjunction();
    // eslint-disable-next-line no-constant-condition
    while (this.peek().content === '||') {
      this.consume();
      const e2 = this.parseConjunction();
      e = EXPRESSION_BINARY({
        range: e.range.union(e2.range),
        type: boolType,
        operator: AND,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseConjunction = (): SamlangExpression => {
    let e = this.parseComparison();
    // eslint-disable-next-line no-constant-condition
    while (this.peek().content === '&&') {
      this.consume();
      const e2 = this.parseComparison();
      e = EXPRESSION_BINARY({
        range: e.range.union(e2.range),
        type: boolType,
        operator: AND,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseComparison = (): SamlangExpression => {
    let e = this.parseTerm();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const peeked = this.peek().content;
      if (
        peeked !== '<' &&
        peeked !== '<=' &&
        peeked !== '>' &&
        peeked !== '>=' &&
        peeked !== '==' &&
        peeked !== '!='
      ) {
        break;
      }
      this.consume();
      let operator: BinaryOperator;
      switch (peeked) {
        case '<':
          operator = LT;
          break;
        case '<=':
          operator = LE;
          break;
        case '>':
          operator = GT;
          break;
        case '>=':
          operator = GE;
          break;
        case '==':
          operator = EQ;
          break;
        case '!=':
          operator = NE;
          break;
      }
      const e2 = this.parseTerm();
      e = EXPRESSION_BINARY({
        range: e.range.union(e2.range),
        type: boolType,
        operator,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseTerm = (): SamlangExpression => {
    let e = this.parseFactor();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const peeked = this.peek().content;
      if (peeked !== '+' && peeked !== '-') break;
      this.consume();
      let operator: BinaryOperator;
      switch (peeked) {
        case '+':
          operator = PLUS;
          break;
        case '-':
          operator = MINUS;
          break;
      }
      const e2 = this.parseFactor();
      e = EXPRESSION_BINARY({
        range: e.range.union(e2.range),
        type: intType,
        operator,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseFactor = (): SamlangExpression => {
    let e = this.parseConcat();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const peeked = this.peek().content;
      if (peeked !== '*' && peeked !== '/' && peeked !== '%') break;
      this.consume();
      let operator: BinaryOperator;
      switch (peeked) {
        case '*':
          operator = MUL;
          break;
        case '/':
          operator = DIV;
          break;
        case '%':
          operator = MOD;
          break;
      }
      const e2 = this.parseConcat();
      e = EXPRESSION_BINARY({
        range: e.range.union(e2.range),
        type: intType,
        operator,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseConcat = (): SamlangExpression => {
    let e = this.parseUnaryExpression();
    // eslint-disable-next-line no-constant-condition
    while (this.peek().content === '::') {
      this.consume();
      const e2 = this.parseUnaryExpression();
      e = EXPRESSION_BINARY({
        range: e.range.union(e2.range),
        type: stringType,
        operator: AND,
        e1: e,
        e2,
      });
    }
    return e;
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

      const statements: SamlangValStatement[] = [];
      while (this.peek().content === 'val') {
        statements.push(this.parseStatement());
      }
      if (this.peek().content === '}') {
        const range = peeked.range.union(this.peek().range);
        this.consume();
        return EXPRESSION_STATEMENT_BLOCK({
          range,
          type: unitType,
          block: { range, statements },
        });
      }
      const expression = this.parseExpression();
      const range = peeked.range.union(this.assertAndConsume('}'));
      return EXPRESSION_STATEMENT_BLOCK({
        range,
        type: unitType,
        block: { range, statements, expression },
      });
    }

    // We failed to parse the base expression, so we stick in a dummy value here.
    return EXPRESSION_INT(peeked.range, 0);
  };

  parseStatement = (): SamlangValStatement => {
    const startRange = this.assertAndConsume('val');
    const pattern = this.parsePattern();
    let typeAnnotation: Type;
    if (this.peek().content === ':') {
      this.consume();
      typeAnnotation = this.parseType();
    } else {
      typeAnnotation = UndecidedTypes.next();
    }
    this.assertAndConsume('=');
    const assignedExpression = this.parseExpression();
    let range: Range;
    if (this.peek().content === ';') {
      range = startRange.union(this.peek().range);
      this.consume();
    } else {
      range = startRange.union(assignedExpression.range);
    }
    return { range, pattern, typeAnnotation, assignedExpression };
  };

  parsePattern = (): Pattern => {
    const peeked = this.peek();
    if (peeked.content === '[') {
      const destructedNames = this.parseCommaSeparatedList(() => {
        const node = this.peek();
        if (node.content === '_') return { type: UndecidedTypes.next(), range: node.range };
        return {
          name: this.assertAndPeekLowerId().variable,
          type: UndecidedTypes.next(),
          range: node.range,
        };
      });
      const endRange = this.assertAndConsume(']');
      return {
        range: peeked.range.union(endRange),
        type: 'TuplePattern',
        destructedNames,
      };
    }
    if (peeked.content === '{') {
      const destructedNames = this.parseCommaSeparatedList(() => {
        const { range: fieldRange, variable: fieldName } = this.assertAndPeekLowerId();
        let range = fieldRange;
        let alias: string | undefined;
        if (this.peek().content === 'as') {
          this.consume();
          const peekedLower = this.assertAndPeekLowerId();
          alias = peekedLower.variable;
          range = range.union(peekedLower.range);
        }
        return {
          fieldName,
          fieldOrder: -1,
          type: UndecidedTypes.next(),
          alias,
          range,
        };
      });
      const endRange = this.assertAndConsume('}');
      return {
        range: peeked.range.union(endRange),
        type: 'ObjectPattern',
        destructedNames,
      };
    }
    if (peeked.content === '_') {
      return { range: peeked.range, type: 'WildCardPattern' };
    }
    return {
      range: peeked.range,
      type: 'VariablePattern',
      name: this.assertAndPeekLowerId().variable,
    };
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
