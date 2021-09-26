import {
  Type,
  UndecidedTypes,
  unitType,
  boolType,
  intType,
  stringType,
  tupleType,
  functionType,
  Position,
  Range,
  ModuleReference,
  TypedComment,
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
  OR,
  CONCAT,
} from 'samlang-core-ast/common-operators';
import {
  SamlangExpression,
  Pattern,
  VariantPatternToExpression,
  SamlangValStatement,
  SourceExpressionTrue,
  SourceExpressionFalse,
  SourceExpressionInt,
  SourceExpressionString,
  SourceExpressionVariable,
  SourceExpressionThis,
  SourceExpressionClassMember,
  SourceExpressionTupleConstructor,
  SourceExpressionObjectConstructor,
  SourceExpressionVariantConstructor,
  SourceExpressionFieldAccess,
  SourceExpressionUnary,
  SourceExpressionFunctionCall,
  SourceExpressionBinary,
  SourceExpressionIfElse,
  SourceExpressionLambda,
  SourceExpressionMatch,
  SourceExpressionStatementBlock,
  SourceClassDefinition,
  SourceClassMemberDefinition,
  SourceModuleMembersImport,
  SamlangModule,
  TypeDefinition,
} from 'samlang-core-ast/samlang-nodes';
import type { ModuleErrorCollector } from 'samlang-core-errors';
import { checkNotNull } from 'samlang-core-utils';

import {
  SamlangKeywordString,
  SamlangOperatorString,
  SamlangToken,
  samlangTokenContentToString,
} from './samlang-lexer';

/** @internal */
export class BaseParser {
  private position = 0;

  constructor(
    private readonly tokens: readonly SamlangToken[],
    public readonly errorCollector: ModuleErrorCollector
  ) {}

  protected lastRange(): Range {
    const token = this.tokens[this.position - 1];
    return token?.range ?? Range.DUMMY;
  }

  protected simplePeek(): SamlangToken {
    const peeked = this.tokens[this.position];
    if (peeked != null) return peeked;
    return {
      range:
        this.tokens.length === 0
          ? Range.DUMMY
          : checkNotNull(this.tokens[this.tokens.length - 1]).range,
      content: 'EOF',
    };
  }

  protected peek(): SamlangToken {
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
    let leftOver = n;
    while (leftOver > 0) {
      this.position -= 1;
      const content = checkNotNull(this.tokens[this.position]).content;
      if (
        typeof content === 'string' ||
        (content.__type__ !== 'BlockComment' && content.__type__ !== 'LineComment')
      ) {
        leftOver -= 1;
      }
    }
  }

  protected unconsumeComments(): void {
    let i = this.position - 1;
    while (i >= 0) {
      const token = checkNotNull(this.tokens[i]).content;
      if (typeof token === 'string') break;
      if (token.__type__ !== 'LineComment' && token.__type__ !== 'BlockComment') break;
      i -= 1;
    }
    this.position = i + 1;
  }

  protected assertAndConsume(token: SamlangKeywordString | SamlangOperatorString): Range {
    const { range, content } = this.peek();
    if (content === token) {
      this.consume();
    } else {
      this.report(range, `Expected: ${token}, actual: ${samlangTokenContentToString(content)}.`);
    }
    return range;
  }

  protected assertAndPeekLowerId(): { readonly range: Range; readonly variable: string } {
    const { range, content } = this.peek();
    if (typeof content !== 'string' && content.__type__ === 'LowerId') {
      this.consume();
      return { range, variable: content.content };
    }
    this.report(range, `Expected: lowerId, actual: ${samlangTokenContentToString(content)}.`);
    return { range, variable: 'MISSING' };
  }

  protected assertAndPeekUpperId(): { readonly range: Range; readonly variable: string } {
    const { range, content } = this.peek();
    if (typeof content !== 'string' && content.__type__ === 'UpperId') {
      this.consume();
      return { range, variable: content.content };
    }
    this.report(range, `Expected: upperId, actual: ${samlangTokenContentToString(content)}.`);
    return { range, variable: 'MISSING' };
  }

  protected report(range: Range, reason: string): void {
    this.errorCollector.reportSyntaxError(range, reason);
  }

  protected parsePunctuationSeparatedList = <T>(
    punctuation: ',' | '.' | '*',
    parser: () => T
  ): T[] => {
    const collector: T[] = [];
    collector.push(parser());
    while (this.peek().content === punctuation) {
      this.consume();
      collector.push(parser());
    }
    return collector;
  };

  protected parseCommaSeparatedList = <T>(parser: () => T): T[] =>
    this.parsePunctuationSeparatedList(',', parser);
}

const unescapeQuotes = (source: string): string => source.replace(/\\"/g, '"');

const postProcessBlockComment = (blockComment: string): string =>
  blockComment
    .split('\n')
    .map((line) => line.trimStart())
    .map((line) => (line.startsWith('*') ? line.substring(1).trim() : line.trimEnd()))
    .filter((line) => line.length > 0)
    .join(' ');

export default class SamlangModuleParser extends BaseParser {
  private classSourceMap = new Map<string, ModuleReference>();

  constructor(
    tokens: readonly SamlangToken[],
    errorCollector: ModuleErrorCollector,
    private readonly moduleReference: ModuleReference,
    private readonly builtInClasses: ReadonlySet<string>
  ) {
    super(tokens, errorCollector);
  }

  private resolveClass = (className: string) => {
    if (this.builtInClasses.has(className)) return ModuleReference.ROOT;
    return this.classSourceMap.get(className) ?? this.moduleReference;
  };

  parseModule = (): SamlangModule => {
    const imports: SourceModuleMembersImport[] = [];
    while (this.peek().content === 'import') {
      const importStart = this.peek().range;
      this.consume();
      this.assertAndConsume('{');
      const importedMembers = this.parseCommaSeparatedList(() => {
        const { range, variable } = this.assertAndPeekUpperId();
        return [variable, range] as const;
      });
      this.assertAndConsume('}');
      this.assertAndConsume('from');
      const importRangeStart = this.peek().range;
      const importedModule = new ModuleReference(
        this.parsePunctuationSeparatedList('.', () => {
          const peeked = this.peek();
          this.consume();
          if (typeof peeked.content !== 'string') {
            switch (peeked.content.__type__) {
              case 'UpperId':
              case 'LowerId':
                return peeked.content.content;
              default:
                break;
            }
          }
          this.report(
            peeked.range,
            `Expected: identifier, actual: ${samlangTokenContentToString(peeked.content)}.`
          );
          return 'MISSING';
        })
      );
      const importedModuleRange = importRangeStart.union(this.lastRange());
      importedMembers.forEach(([variable]) => this.classSourceMap.set(variable, importedModule));
      imports.push({
        range: importStart.union(importedModuleRange),
        importedMembers,
        importedModule,
        importedModuleRange,
      });
    }

    const classes: SourceClassDefinition[] = [];
    ParseClasses: while (this.peek().content !== 'EOF') {
      let potentialGarbagePeeked = this.peek();
      while (potentialGarbagePeeked.content !== 'class') {
        if (potentialGarbagePeeked.content === 'EOF') break ParseClasses;
        this.report(potentialGarbagePeeked.range, 'Unexpected token among the classes.');
        this.consume();
        potentialGarbagePeeked = this.peek();
      }
      classes.push(this.parseClass());
    }

    return { imports, classes };
  };

  parseClass = (): SourceClassDefinition => {
    const { startRange, ...header } = this.parseClassHeader();
    this.assertAndConsume('{');
    const members: SourceClassMemberDefinition[] = [];
    while (
      this.peek().content === 'private' ||
      this.peek().content === 'function' ||
      this.peek().content === 'method'
    ) {
      members.push(this.parseSourceClassMemberDefinition());
    }
    const endRange = this.assertAndConsume('}');
    return { range: startRange.union(endRange), ...header, members };
  };

  private parseClassHeader = (): Omit<SourceClassDefinition, 'range' | 'members'> & {
    readonly startRange: Range;
  } => {
    const associatedComments = this.collectPrecedingComments();
    const startRange = this.assertAndConsume('class');
    const { range: nameRange, variable: name } = this.assertAndPeekUpperId();
    if (this.peek().content === '{') {
      // Util class. Now the class header has ended.
      return {
        startRange,
        associatedComments,
        nameRange,
        name,
        typeParameters: [],
        typeDefinition: { range: this.peek().range, type: 'object', names: [], mappings: {} },
      };
    }
    let typeParameters: readonly string[];
    let typeParameterRangeStart: Range | undefined;
    if (this.peek().content === '<') {
      typeParameterRangeStart = this.peek().range;
      this.consume();
      typeParameters = this.parseCommaSeparatedList(() => this.assertAndPeekUpperId().variable);
      this.assertAndConsume('>');
    } else {
      typeParameters = [];
    }
    const typeDefinitionRangeStart = this.assertAndConsume('(');
    const innerTypeDefinition = this.parseTypeDefinitionInner();
    const typeDefinitionRangeEnd = this.assertAndConsume(')');
    const typeDefinition: TypeDefinition = {
      range: (typeParameterRangeStart || typeDefinitionRangeStart).union(typeDefinitionRangeEnd),
      ...innerTypeDefinition,
    };
    return { startRange, associatedComments, nameRange, name, typeParameters, typeDefinition };
  };

  private parseTypeDefinitionInner = (): Omit<TypeDefinition, 'range'> => {
    const firstPeeked = this.peek().content;
    if (typeof firstPeeked !== 'string' && firstPeeked.__type__ === 'UpperId') {
      const mappings = this.parseCommaSeparatedList(() => {
        const name = this.assertAndPeekUpperId().variable;
        this.assertAndConsume('(');
        const type = this.parseType();
        this.assertAndConsume(')');
        return [name, { type, isPublic: false }] as const;
      });
      return {
        type: 'variant',
        names: mappings.map(([name]) => name),
        mappings: Object.fromEntries(mappings),
      };
    } else {
      const mappings = this.parseCommaSeparatedList(() => {
        let isPublic = true;
        if (this.peek().content === 'private') {
          isPublic = false;
          this.consume();
        }
        this.assertAndConsume('val');
        const name = this.assertAndPeekLowerId().variable;
        this.assertAndConsume(':');
        const type = this.parseType();
        return [name, { type, isPublic }] as const;
      });
      return {
        type: 'object',
        names: mappings.map(([name]) => name),
        mappings: Object.fromEntries(mappings),
      };
    }
  };

  parseSourceClassMemberDefinition = (): SourceClassMemberDefinition => {
    const associatedComments = this.collectPrecedingComments();
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
    } else {
      this.assertAndConsume('method');
    }
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
    const parameters =
      this.peek().content === ')'
        ? []
        : this.parseCommaSeparatedList(() => {
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
      associatedComments,
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

  private collectPrecedingComments = (): TypedComment[] => {
    this.unconsumeComments();
    const comments: TypedComment[] = [];
    while (true) {
      const token = this.simplePeek().content;
      if (typeof token === 'string') break;
      if (token.__type__ === 'LineComment') {
        this.consume();
        comments.push({ type: 'line', text: token.content.substring(2).trim() });
        continue;
      }
      if (token.__type__ !== 'BlockComment') break;
      this.consume();
      const isDocComment = token.content.startsWith('/**');
      const rawText = token.content;
      comments.push({
        type: isDocComment ? 'doc' : 'block',
        text: postProcessBlockComment(
          isDocComment
            ? rawText.substring(3, rawText.length - 2)
            : rawText.substring(2, rawText.length - 2)
        ),
      });
    }
    return comments;
  };

  parseExpression = (): SamlangExpression => this.parseMatch();

  private parseExpressionWithEndingComments = (): SamlangExpression => {
    const parsed = this.parseExpression();
    return {
      ...parsed,
      associatedComments: [...parsed.associatedComments, ...this.collectPrecedingComments()],
    };
  };

  private parseCommaSeparatedExpressions = (): SamlangExpression[] => {
    const collector: SamlangExpression[] = [];
    collector.push(this.parseExpressionWithEndingComments());
    while (this.peek().content === ',') {
      this.consume();
      collector.push(this.parseExpressionWithEndingComments());
    }
    return collector;
  };

  private parseMatch = (): SamlangExpression => {
    const associatedComments = this.collectPrecedingComments();
    const peeked = this.peek();
    if (peeked.content !== 'match') return this.parseIfElse();
    this.consume();
    this.assertAndConsume('(');
    const matchedExpression = this.parseExpressionWithEndingComments();
    this.assertAndConsume(')');
    this.assertAndConsume('{');
    const matchingList = [this.parsePatternToExpression()];
    while (this.peek().content === '|') {
      matchingList.push(this.parsePatternToExpression());
    }
    const endRange = this.assertAndConsume('}');
    return SourceExpressionMatch({
      range: peeked.range.union(endRange),
      type: UndecidedTypes.next(),
      associatedComments,
      matchedExpression,
      matchingList,
    });
  };

  private parsePatternToExpression = (): VariantPatternToExpression => {
    const startRange = this.assertAndConsume('|');
    const { variable: tag } = this.assertAndPeekUpperId();
    let dataVariable: readonly [string, Range, Type] | undefined;
    if (this.peek().content === '_') {
      this.consume();
    } else {
      const { variable, range } = this.assertAndPeekLowerId();
      dataVariable = [variable, range, UndecidedTypes.next()];
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
    const associatedComments = this.collectPrecedingComments();
    const peeked = this.peek();
    if (peeked.content !== 'if') return this.parseDisjunction();
    this.consume();
    const boolExpression = this.parseExpression();
    this.assertAndConsume('then');
    const e1 = this.parseExpression();
    this.assertAndConsume('else');
    const e2 = this.parseExpression();
    return SourceExpressionIfElse({
      range: peeked.range.union(e2.range),
      type: UndecidedTypes.next(),
      associatedComments,
      boolExpression,
      e1,
      e2,
    });
  };

  private parseDisjunction = (): SamlangExpression => {
    let e = this.parseConjunction();
    while (this.peek().content === '||') {
      const operatorPrecedingComments = this.collectPrecedingComments();
      this.consume();
      const e2 = this.parseConjunction();
      e = SourceExpressionBinary({
        range: e.range.union(e2.range),
        type: boolType,
        associatedComments: [],
        operatorPrecedingComments,
        operator: OR,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseConjunction = (): SamlangExpression => {
    let e = this.parseComparison();
    while (this.peek().content === '&&') {
      const operatorPrecedingComments = this.collectPrecedingComments();
      this.consume();
      const e2 = this.parseComparison();
      e = SourceExpressionBinary({
        range: e.range.union(e2.range),
        type: boolType,
        associatedComments: [],
        operatorPrecedingComments,
        operator: AND,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseComparison = (): SamlangExpression => {
    let e = this.parseTerm();
    while (true) {
      const operatorPrecedingComments = this.collectPrecedingComments();
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
      e = SourceExpressionBinary({
        range: e.range.union(e2.range),
        type: boolType,
        associatedComments: [],
        operatorPrecedingComments,
        operator,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseTerm = (): SamlangExpression => {
    let e = this.parseFactor();
    while (true) {
      const operatorPrecedingComments = this.collectPrecedingComments();
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
      e = SourceExpressionBinary({
        range: e.range.union(e2.range),
        type: intType,
        associatedComments: [],
        operatorPrecedingComments,
        operator,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseFactor = (): SamlangExpression => {
    let e = this.parseConcat();
    while (true) {
      const operatorPrecedingComments = this.collectPrecedingComments();
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
      e = SourceExpressionBinary({
        range: e.range.union(e2.range),
        type: intType,
        associatedComments: [],
        operatorPrecedingComments,
        operator,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseConcat = (): SamlangExpression => {
    let e = this.parseUnaryExpression();
    while (this.peek().content === '::') {
      const operatorPrecedingComments = this.collectPrecedingComments();
      this.consume();
      const e2 = this.parseUnaryExpression();
      e = SourceExpressionBinary({
        range: e.range.union(e2.range),
        type: stringType,
        operator: CONCAT,
        associatedComments: [],
        operatorPrecedingComments,
        e1: e,
        e2,
      });
    }
    return e;
  };

  private parseUnaryExpression = (): SamlangExpression => {
    const associatedComments = this.collectPrecedingComments();
    const peeked = this.peek();

    if (peeked.content === '!') {
      this.consume();
      const expression = this.parseFunctionCallOrFieldAccess();
      return SourceExpressionUnary({
        range: peeked.range.union(expression.range),
        type: boolType,
        associatedComments,
        operator: '!',
        expression,
      });
    }
    if (peeked.content === '-') {
      this.consume();
      const expression = this.parseFunctionCallOrFieldAccess();
      return SourceExpressionUnary({
        range: peeked.range.union(expression.range),
        type: intType,
        associatedComments,
        operator: '-',
        expression,
      });
    }

    return this.parseFunctionCallOrFieldAccess();
  };

  private parseFunctionCallOrFieldAccess = (): SamlangExpression => {
    const startRange = this.peek().range;

    // Treat function arguments or field name as postfix.
    // Then use Kleene star trick to parse.
    let functionExpression = this.parseBaseExpression();
    while (this.peek().content === '.' || this.peek().content === '(') {
      if (this.peek().content === '.') {
        const fieldPrecedingComments = this.collectPrecedingComments();
        this.consume();
        fieldPrecedingComments.push(...this.collectPrecedingComments());
        const { range, variable: fieldName } = this.assertAndPeekLowerId();
        functionExpression = SourceExpressionFieldAccess({
          range: functionExpression.range.union(range),
          type: UndecidedTypes.next(),
          associatedComments: [],
          expression: functionExpression,
          fieldPrecedingComments,
          fieldName,
          fieldOrder: -1,
        });
      } else {
        this.consume();
        const functionArguments =
          this.peek().content === ')' ? [] : this.parseCommaSeparatedExpressions();
        const endRange = this.assertAndConsume(')');
        functionExpression = SourceExpressionFunctionCall({
          range: startRange.union(endRange),
          type: UndecidedTypes.next(),
          associatedComments: [],
          functionExpression,
          functionArguments,
        });
      }
    }

    return functionExpression;
  };

  private parseBaseExpression = (): SamlangExpression => {
    const associatedComments = this.collectPrecedingComments();
    const peeked = this.peek();

    if (peeked.content === 'true') {
      this.consume();
      return SourceExpressionTrue(peeked.range, associatedComments);
    }
    if (peeked.content === 'false') {
      this.consume();
      return SourceExpressionFalse(peeked.range, associatedComments);
    }
    if (peeked.content === 'this') {
      this.consume();
      return SourceExpressionThis({
        range: peeked.range,
        type: UndecidedTypes.next(),
        associatedComments,
      });
    }

    if (typeof peeked.content !== 'string') {
      if (peeked.content.__type__ === 'IntLiteral') {
        this.consume();
        return SourceExpressionInt(
          parseInt(peeked.content.content, 10),
          peeked.range,
          associatedComments
        );
      }

      if (peeked.content.__type__ === 'StringLiteral') {
        this.consume();
        const literalText = peeked.content.content;
        return SourceExpressionString(
          unescapeQuotes(literalText.substring(1, literalText.length - 1)),
          peeked.range,
          associatedComments
        );
      }

      if (peeked.content.__type__ === 'LowerId') {
        this.consume();
        return SourceExpressionVariable({
          range: peeked.range,
          type: UndecidedTypes.next(),
          associatedComments,
          name: peeked.content.content,
        });
      }

      if (peeked.content.__type__ === 'UpperId') {
        this.consume();
        const className = peeked.content.content;
        const nextPeeked = this.peek();
        if (nextPeeked.content === '.') {
          const memberPrecedingComments = this.collectPrecedingComments();
          this.consume();
          memberPrecedingComments.push(...this.collectPrecedingComments());
          const { range: memberNameRange, variable: memberName } = this.assertAndPeekLowerId();
          return SourceExpressionClassMember({
            range: peeked.range.union(memberNameRange),
            type: UndecidedTypes.next(),
            associatedComments,
            typeArguments: [],
            moduleReference: this.resolveClass(className),
            className,
            classNameRange: peeked.range,
            memberPrecedingComments,
            memberName,
            memberNameRange,
          });
        }
        if (nextPeeked.content === '(') {
          associatedComments.push(...this.collectPrecedingComments());
          this.consume();
          const child = this.parseExpressionWithEndingComments();
          const endRange = this.assertAndConsume(')');
          return SourceExpressionVariantConstructor({
            range: peeked.range.union(endRange),
            type: UndecidedTypes.next(),
            associatedComments,
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
        associatedComments.push(...this.collectPrecedingComments());
        this.consume();
        associatedComments.push(...this.collectPrecedingComments());
        this.assertAndConsume('->');
        const body = this.parseExpression();
        return SourceExpressionLambda({
          range: peeked.range.union(body.range),
          type: functionType([], body.type),
          associatedComments,
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
          const parameters = this.parseCommaSeparatedList((): readonly [string, Range, Type] => {
            const { variable, range } = this.assertAndPeekLowerId();
            if (this.peek().content === ':') {
              this.consume();
              const type = this.parseType();
              return [variable, range, type];
            }
            return [variable, range, UndecidedTypes.next()];
          });
          this.assertAndConsume(')');
          this.assertAndConsume('->');
          const body = this.parseExpression();
          return SourceExpressionLambda({
            range: peeked.range.union(body.range),
            type: functionType(
              parameters.map((it) => it[2]),
              body.type
            ),
            associatedComments,
            parameters,
            captured: {},
            body,
          });
        } else if (next.content === ')') {
          this.consume();
          if (this.peek().content === '->') {
            associatedComments.push(...this.collectPrecedingComments());
            this.consume();
            const body = this.parseExpression();
            const parameterType = UndecidedTypes.next();
            return SourceExpressionLambda({
              range: peeked.range.union(body.range),
              type: functionType([parameterType], body.type),
              associatedComments,
              parameters: [
                [
                  lowerIdentifierForLambdaPeeked.content.content,
                  lowerIdentifierForLambdaPeeked.range,
                  parameterType,
                ],
              ],
              captured: {},
              body,
            });
          } else {
            this.unconsume();
          }
        }
        this.unconsume();
      }
      const nestedExpression = this.parseExpressionWithEndingComments();
      this.assertAndConsume(')');
      return nestedExpression;
    }

    if (peeked.content === '[') {
      this.consume();
      const expressions = this.parseCommaSeparatedExpressions();
      const endRange = this.assertAndConsume(']');
      return SourceExpressionTupleConstructor({
        range: peeked.range.union(endRange),
        type: tupleType(UndecidedTypes.nextN(expressions.length)),
        associatedComments,
        expressions,
      });
    }

    if (peeked.content === '{') {
      this.consume();
      const lowerIdentifierForObjectFieldPeeked = this.peek();
      if (
        typeof lowerIdentifierForObjectFieldPeeked.content !== 'string' &&
        lowerIdentifierForObjectFieldPeeked.content.__type__ === 'LowerId'
      ) {
        this.consume();
        const next = this.peek();
        if (next.content === ',' || next.content === ':' || next.content === '}') {
          this.unconsume();
          const fieldDeclarations = this.parseCommaSeparatedList(() => {
            const declarationAssociatedComments = this.collectPrecedingComments();
            const { range, variable } = this.assertAndPeekLowerId();
            if (this.peek().content !== ':') {
              return {
                range,
                type: UndecidedTypes.next(),
                associatedComments: declarationAssociatedComments,
                name: variable,
                nameRange: range,
              };
            }
            this.consume();
            const expression = this.parseExpressionWithEndingComments();
            return {
              range: range.union(expression.range),
              type: UndecidedTypes.next(),
              associatedComments: declarationAssociatedComments,
              name: variable,
              nameRange: range,
              expression,
            };
          });
          const endRange = this.assertAndConsume('}');
          return SourceExpressionObjectConstructor({
            range: peeked.range.union(endRange),
            type: UndecidedTypes.next(),
            associatedComments,
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
        return SourceExpressionStatementBlock({
          range,
          type: unitType,
          associatedComments,
          block: { range, statements },
        });
      }
      const expression = this.parseExpression();
      const range = peeked.range.union(this.assertAndConsume('}'));
      return SourceExpressionStatementBlock({
        range,
        type: UndecidedTypes.next(),
        associatedComments,
        block: { range, statements, expression },
      });
    }

    // We failed to parse the base expression, so we stick in a dummy value here.
    this.report(
      peeked.range,
      `Expected: expression, actual: ${samlangTokenContentToString(peeked.content)}`
    );
    return SourceExpressionInt(0, peeked.range, associatedComments);
  };

  parseStatement = (): SamlangValStatement => {
    const associatedComments = this.collectPrecedingComments();
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
    return { range, pattern, typeAnnotation, assignedExpression, associatedComments };
  };

  parsePattern = (): Pattern => {
    const peeked = this.peek();
    if (peeked.content === '[') {
      this.consume();
      const destructedNames = this.parseCommaSeparatedList(() => {
        const node = this.peek();
        if (node.content === '_') {
          this.consume();
          return { type: UndecidedTypes.next(), range: node.range };
        }
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
      this.consume();
      const destructedNames = this.parseCommaSeparatedList(() => {
        const { range: fieldRange, variable: fieldName } = this.assertAndPeekLowerId();
        let range = fieldRange;
        let alias: [string, Range] | undefined;
        if (this.peek().content === 'as') {
          this.consume();
          const peekedLower = this.assertAndPeekLowerId();
          alias = [peekedLower.variable, peekedLower.range];
          range = range.union(peekedLower.range);
        }
        return {
          fieldName,
          fieldNameRange: fieldRange,
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
      this.consume();
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
      const mappings = this.parsePunctuationSeparatedList('*', this.parseType);
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
      `Expecting: type, actual: ${samlangTokenContentToString(peeked.content)}`
    );
    return UndecidedTypes.next();
  };
}
