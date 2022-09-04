import { Location, ModuleReference, SourceReason, TypedComment } from '../ast/common-nodes';
import {
  AND,
  BinaryOperator,
  CONCAT,
  DIV,
  EQ,
  GE,
  GT,
  LE,
  LT,
  MINUS,
  MOD,
  MUL,
  NE,
  OR,
  PLUS,
} from '../ast/common-operators';
import {
  Pattern,
  SamlangExpression,
  SamlangIdentifierType,
  SamlangModule,
  SamlangType,
  SamlangValStatement,
  SourceBoolType,
  SourceClassDefinition,
  SourceClassMemberDeclaration,
  SourceClassMemberDefinition,
  SourceExpressionBinary,
  SourceExpressionClassMember,
  SourceExpressionFalse,
  SourceExpressionFieldAccess,
  SourceExpressionFunctionCall,
  SourceExpressionIfElse,
  SourceExpressionInt,
  SourceExpressionLambda,
  SourceExpressionMatch,
  SourceExpressionStatementBlock,
  SourceExpressionString,
  SourceExpressionThis,
  SourceExpressionTrue,
  SourceExpressionUnary,
  SourceExpressionVariable,
  SourceFieldType,
  SourceFunctionType,
  SourceId,
  SourceIdentifier,
  SourceInterfaceDeclaration,
  SourceIntType,
  SourceModuleMembersImport,
  SourceStringType,
  SourceTypeParameter,
  SourceUnitType,
  SourceUnknownType,
  TypeDefinition,
  VariantPatternToExpression,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { checkNotNull } from '../utils';
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
    protected readonly moduleReference: ModuleReference,
    public readonly errorReporter: GlobalErrorReporter,
  ) {}

  protected lastLocation(): Location {
    const token = this.tokens[this.position - 1];
    return token?.location ?? Location.DUMMY;
  }

  protected simplePeek(): SamlangToken {
    const peeked = this.tokens[this.position];
    if (peeked != null) return peeked;
    return {
      location:
        this.tokens.length === 0
          ? Location.DUMMY
          : checkNotNull(this.tokens[this.tokens.length - 1]).location,
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
      const position = tokens[tokens.length - 1]?.location.end ?? { line: 0, character: 0 };
      const location = new Location(this.moduleReference, position, position);
      this.report(location, 'Unexpected end of file.');
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

  protected assertAndConsume(token: SamlangKeywordString | SamlangOperatorString): Location {
    const { location, content } = this.peek();
    if (content === token) {
      this.consume();
    } else {
      this.report(location, `Expected: ${token}, actual: ${samlangTokenContentToString(content)}.`);
    }
    return location;
  }

  protected assertAndPeekLowerId(): { readonly location: Location; readonly variable: string } {
    const { location, content } = this.peek();
    if (typeof content !== 'string' && content.__type__ === 'LowerId') {
      this.consume();
      return { location, variable: content.content };
    }
    this.report(location, `Expected: lowerId, actual: ${samlangTokenContentToString(content)}.`);
    return { location, variable: 'MISSING' };
  }

  protected assertAndPeekUpperId(): { readonly location: Location; readonly variable: string } {
    const { location, content } = this.peek();
    if (typeof content !== 'string' && content.__type__ === 'UpperId') {
      this.consume();
      return { location, variable: content.content };
    }
    this.report(location, `Expected: upperId, actual: ${samlangTokenContentToString(content)}.`);
    return { location, variable: 'MISSING' };
  }

  protected report(location: Location, reason: string): void {
    this.errorReporter.reportSyntaxError(location, reason);
  }

  protected parsePunctuationSeparatedList = <T>(
    punctuation: ',' | '.' | '*',
    parser: () => T,
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

  protected assertAndConsumeIdentifier() {
    const peeked = this.peek();
    this.consume();
    if (typeof peeked.content !== 'string') {
      switch (peeked.content.__type__) {
        case 'UpperId':
        case 'LowerId':
          return { identifier: peeked.content.content, location: peeked.location };
        default:
          break;
      }
    }
    this.report(
      peeked.location,
      `Expected: identifier, actual: ${samlangTokenContentToString(peeked.content)}.`,
    );
    return { identifier: 'MISSING', location: peeked.location };
  }
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
    errorReporter: GlobalErrorReporter,
    moduleReference: ModuleReference,
    private readonly builtInClasses: ReadonlySet<string>,
  ) {
    super(tokens, moduleReference, errorReporter);
  }

  private resolveClass = (className: string) => {
    if (this.builtInClasses.has(className)) return ModuleReference.ROOT;
    return this.classSourceMap.get(className) ?? this.moduleReference;
  };

  parseModule = (): SamlangModule => {
    const imports: SourceModuleMembersImport[] = [];
    while (this.peek().content === 'import') {
      const importStart = this.peek().location;
      this.consume();
      this.assertAndConsume('{');
      const importedMembers = this.parseCommaSeparatedList(this.parseUpperId);
      this.assertAndConsume('}');
      this.assertAndConsume('from');
      const importLocationStart = this.peek().location;
      const importedModule = ModuleReference(
        this.parsePunctuationSeparatedList('.', () => this.assertAndConsumeIdentifier().identifier),
      );
      const importedModuleLocation = importLocationStart.union(this.lastLocation());
      importedMembers.forEach(({ name: variable }) =>
        this.classSourceMap.set(variable, importedModule),
      );
      imports.push({
        location: importStart.union(importedModuleLocation),
        importedMembers,
        importedModule,
        importedModuleLocation,
      });
    }

    const classes: SourceClassDefinition[] = [];
    const interfaces: SourceInterfaceDeclaration[] = [];
    ParseClassesAndInterfaces: while (this.peek().content !== 'EOF') {
      let potentialGarbagePeeked = this.peek();
      while (
        potentialGarbagePeeked.content !== 'class' &&
        potentialGarbagePeeked.content !== 'interface'
      ) {
        if (potentialGarbagePeeked.content === 'EOF') break ParseClassesAndInterfaces;
        this.report(
          potentialGarbagePeeked.location,
          `Unexpected token among the classes and interfaces: ${samlangTokenContentToString(
            potentialGarbagePeeked.content,
          )}`,
        );
        this.consume();
        potentialGarbagePeeked = this.peek();
      }
      this.parseClassOrInterface(classes, interfaces);
    }

    return { imports, interfaces, classes };
  };

  private parseClassOrInterface(
    classes: SourceClassDefinition[],
    interfaces: SourceInterfaceDeclaration[],
  ) {
    const peeked = this.peek().content;
    this.unconsumeComments();
    if (peeked === 'class') {
      classes.push(this.parseClass());
    } else {
      interfaces.push(this.parseInterface());
    }
  }

  parseInterface(): SourceInterfaceDeclaration {
    const associatedComments = this.collectPrecedingComments();
    let startLocation = this.assertAndConsume('interface');
    const name = this.parseUpperId();
    let typeParameters: readonly SourceTypeParameter[];
    if (this.peek().content === '<') {
      this.consume();
      typeParameters = this.parseCommaSeparatedList(this.parseTypeParameter);
      startLocation = startLocation.union(this.assertAndConsume('>'));
    } else {
      typeParameters = [];
    }
    let extendsOrImplementsNode: SamlangIdentifierType | undefined;
    if (this.peek().content === ':') {
      this.assertAndConsume(':');
      extendsOrImplementsNode = this.parseIdentifierType(this.parseUpperId());
      startLocation = startLocation.union(extendsOrImplementsNode.reason.useLocation);
    }
    if (this.peek().content !== '{') {
      return {
        associatedComments,
        location: startLocation,
        name,
        typeParameters,
        extendsOrImplementsNode,
        members: [],
      };
    }
    this.assertAndConsume('{');
    const members: SourceClassMemberDeclaration[] = [];
    while (this.peek().content === 'function' || this.peek().content === 'method') {
      members.push(this.parseSourceClassMemberDeclaration());
    }
    const endLocation = this.assertAndConsume('}');
    return {
      associatedComments,
      location: startLocation.union(endLocation),
      name,
      typeParameters,
      extendsOrImplementsNode,
      members,
    };
  }

  parseClass(): SourceClassDefinition {
    const { startLocation, ...header } = this.parseClassHeader();
    if (this.peekedClassedOrInterfaceStart()) {
      return {
        location: startLocation,
        ...header,
        members: [],
      };
    }
    this.assertAndConsume('{');
    const members: SourceClassMemberDefinition[] = [];
    while (
      this.peek().content === 'private' ||
      this.peek().content === 'function' ||
      this.peek().content === 'method'
    ) {
      members.push(this.parseSourceClassMemberDefinition());
    }
    const endLocation = this.assertAndConsume('}');
    return {
      location: startLocation.union(endLocation),
      ...header,
      members,
    };
  }

  private parseClassHeader(): Omit<SourceClassDefinition, 'location' | 'members'> & {
    readonly startLocation: Location;
  } {
    const associatedComments = this.collectPrecedingComments();
    let startLocation = this.assertAndConsume('class');
    const name = this.parseUpperId();
    startLocation = startLocation.union(name.location);
    let typeParameters: readonly SourceTypeParameter[];
    let typeParameterLocationStart: Location | undefined;
    let typeParameterLocationEnd: Location | undefined;
    if (this.peek().content === '<') {
      typeParameterLocationStart = this.peek().location;
      this.consume();
      typeParameters = this.parseCommaSeparatedList(this.parseTypeParameter);
      typeParameterLocationEnd = this.assertAndConsume('>');
    } else {
      typeParameters = [];
    }
    if (
      this.peek().content === '{' ||
      this.peek().content === ':' ||
      this.peekedClassedOrInterfaceStart()
    ) {
      let extendsOrImplementsNode: SamlangIdentifierType | undefined;
      if (this.peek().content === ':') {
        this.assertAndConsume(':');
        extendsOrImplementsNode = this.parseIdentifierType(this.parseUpperId());
        startLocation = startLocation.union(extendsOrImplementsNode.reason.useLocation);
      }
      // Util class. Now the class header has ended.
      return {
        startLocation:
          typeParameterLocationEnd == null
            ? startLocation
            : startLocation.union(typeParameterLocationEnd),
        associatedComments,
        name,
        typeParameters,
        typeDefinition: {
          location: this.peek().location,
          type: 'object',
          names: [],
          mappings: new Map(),
        },
        extendsOrImplementsNode,
      };
    }
    const typeDefinitionLocationStart = this.assertAndConsume('(');
    const innerTypeDefinition = this.parseTypeDefinitionInner();
    const typeDefinitionLocationEnd = this.assertAndConsume(')');
    const typeDefinition: TypeDefinition = {
      location: (typeParameterLocationStart ?? typeDefinitionLocationStart).union(
        typeDefinitionLocationEnd,
      ),
      ...innerTypeDefinition,
    };
    startLocation = startLocation.union(typeDefinitionLocationEnd);
    let extendsOrImplementsNode: SamlangIdentifierType | undefined;
    if (this.peek().content === ':') {
      this.assertAndConsume(':');
      extendsOrImplementsNode = this.parseIdentifierType(this.parseUpperId());
      startLocation = startLocation.union(extendsOrImplementsNode.reason.useLocation);
    }
    return {
      startLocation,
      associatedComments,
      name,
      typeParameters,
      typeDefinition,
      extendsOrImplementsNode,
    };
  }

  private parseTypeDefinitionInner = (): Omit<TypeDefinition, 'location'> => {
    const firstPeeked = this.peek().content;
    if (typeof firstPeeked !== 'string' && firstPeeked.__type__ === 'UpperId') {
      const mappings = new Map<string, SourceFieldType>();
      const names = this.parseCommaSeparatedList(() => {
        const name = this.parseUpperId();
        this.assertAndConsume('(');
        const type = this.parseType();
        this.assertAndConsume(')');
        mappings.set(name.name, { type, isPublic: false });
        return name;
      });
      return { type: 'variant', names, mappings };
    } else {
      const mappings = new Map<string, SourceFieldType>();
      const names = this.parseCommaSeparatedList(() => {
        let isPublic = true;
        if (this.peek().content === 'private') {
          isPublic = false;
          this.consume();
        }
        this.assertAndConsume('val');
        const name = this.parseLowerId();
        this.assertAndConsume(':');
        const type = this.parseType();
        mappings.set(name.name, { type, isPublic });
        return name;
      });
      return { type: 'object', names, mappings };
    }
  };

  private peekedClassedOrInterfaceStart(): boolean {
    return this.peek().content === 'class' || this.peek().content === 'interface';
  }

  parseSourceClassMemberDeclaration = (): SourceClassMemberDeclaration => {
    return this.parseSourceClassMemberDeclarationCommon(/* allowPrivate */ false);
  };

  parseSourceClassMemberDefinition = (): SourceClassMemberDefinition => {
    const { location, ...common } = this.parseSourceClassMemberDeclarationCommon(
      /* allowPrivate */ true,
    );
    this.assertAndConsume('=');
    const body = this.parseExpression();
    return { ...common, location: location.union(body.location), body };
  };

  private parseSourceClassMemberDeclarationCommon(
    allowPrivate: boolean,
  ): SourceClassMemberDeclaration & {
    isPublic: boolean;
  } {
    const associatedComments = this.collectPrecedingComments();
    let startLocation: Location;
    let isPublic = true;
    let isMethod = true;
    let peeked: SamlangToken;
    if (allowPrivate && this.peek().content === 'private') {
      isPublic = false;
      startLocation = this.peek().location;
      this.consume();
      peeked = this.peek();
    } else {
      peeked = this.peek();
      startLocation = peeked.location;
    }
    if (peeked.content === 'function') {
      isMethod = false;
      this.consume();
    } else {
      this.assertAndConsume('method');
    }
    let typeParameters: SourceTypeParameter[];
    if (this.peek().content === '<') {
      this.consume();
      typeParameters = this.parseCommaSeparatedList(this.parseTypeParameter);
      this.assertAndConsume('>');
    } else {
      typeParameters = [];
    }
    const name = this.parseLowerId();
    const functionTypeLocationStart = this.assertAndConsume('(');
    const parameters =
      this.peek().content === ')'
        ? []
        : this.parseCommaSeparatedList(() => {
            const lowerId = this.assertAndPeekLowerId();
            this.assertAndConsume(':');
            const typeStartLocation = this.peek().location;
            const type = this.parseType();
            const typeLocation = typeStartLocation.union(this.lastLocation());
            return { name: lowerId.variable, nameLocation: lowerId.location, type, typeLocation };
          });
    this.assertAndConsume(')');
    this.assertAndConsume(':');
    const returnType = this.parseType();
    const functionTypeLocation = functionTypeLocationStart.union(returnType.reason.useLocation);
    return {
      location: startLocation,
      associatedComments,
      isPublic,
      isMethod,
      name,
      typeParameters,
      type: SourceFunctionType(
        SourceReason(functionTypeLocation, functionTypeLocation),
        parameters.map((it) => it.type),
        returnType,
      ),
      parameters,
    };
  }

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
            : rawText.substring(2, rawText.length - 2),
        ),
      });
    }
    return comments;
  };

  private parseTypeParameter = (): SourceTypeParameter => {
    const associatedComments = this.collectPrecedingComments();
    const name = this.parseUpperId();
    let bound: SamlangType | null = null;
    if (this.peek().content === ':') {
      this.consume();
      bound = this.parseIdentifierType(this.parseUpperId());
    }
    const location = bound != null ? name.location.union(bound.reason.useLocation) : name.location;
    return {
      associatedComments,
      location,
      name,
      bound,
    };
  };

  private parseUpperId = (): SourceIdentifier => {
    const associatedComments = this.collectPrecedingComments();
    const { variable, location } = this.assertAndPeekUpperId();
    return SourceId(variable, { location, associatedComments });
  };

  private parseLowerId = (): SourceIdentifier => {
    const associatedComments = this.collectPrecedingComments();
    const { variable, location } = this.assertAndPeekLowerId();
    return SourceId(variable, { location, associatedComments });
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
    const endLocation = this.assertAndConsume('}');
    const location = peeked.location.union(endLocation);
    return SourceExpressionMatch({
      location,
      type: SourceUnknownType(SourceReason(location, null)),
      associatedComments,
      matchedExpression,
      matchingList,
    });
  };

  private parsePatternToExpression = (): VariantPatternToExpression => {
    const startLocation = this.assertAndConsume('|');
    const tag = this.parseUpperId();
    let dataVariable: readonly [SourceIdentifier, SamlangType] | undefined;
    if (this.peek().content === '_') {
      this.consume();
    } else {
      const name = this.parseLowerId();
      dataVariable = [name, SourceUnknownType(SourceReason(name.location, null))];
    }
    this.assertAndConsume('->');
    const expression = this.parseExpression();
    return {
      location: startLocation.union(expression.location),
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
    const location = peeked.location.union(e2.location);
    return SourceExpressionIfElse({
      location,
      type: SourceUnknownType(SourceReason(location, null)),
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
      const location = e.location.union(e2.location);
      e = SourceExpressionBinary({
        location,
        type: SourceBoolType(SourceReason(location, null)),
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
      const location = e.location.union(e2.location);
      e = SourceExpressionBinary({
        location,
        type: SourceBoolType(SourceReason(location, null)),
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
      const location = e.location.union(e2.location);
      e = SourceExpressionBinary({
        location,
        type: SourceBoolType(SourceReason(location, null)),
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
      const location = e.location.union(e2.location);
      e = SourceExpressionBinary({
        location,
        type: SourceIntType(SourceReason(location, null)),
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
      const location = e.location.union(e2.location);
      e = SourceExpressionBinary({
        location,
        type: SourceIntType(SourceReason(location, null)),
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
      const location = e.location.union(e2.location);
      e = SourceExpressionBinary({
        location,
        type: SourceStringType(SourceReason(location, null)),
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
      const location = peeked.location.union(expression.location);
      return SourceExpressionUnary({
        location,
        type: SourceBoolType(SourceReason(location, null)),
        associatedComments,
        operator: '!',
        expression,
      });
    }
    if (peeked.content === '-') {
      this.consume();
      const expression = this.parseFunctionCallOrFieldAccess();
      const location = peeked.location.union(expression.location);
      return SourceExpressionUnary({
        location,
        type: SourceIntType(SourceReason(location, null)),
        associatedComments,
        operator: '-',
        expression,
      });
    }

    return this.parseFunctionCallOrFieldAccess();
  };

  private parseFunctionCallOrFieldAccess = (): SamlangExpression => {
    const startLocation = this.peek().location;

    // Treat function arguments or field name as postfix.
    // Then use Kleene star trick to parse.
    let functionExpression = this.parseBaseExpression();
    while (this.peek().content === '.' || this.peek().content === '(') {
      if (this.peek().content === '.') {
        const fieldPrecedingComments = this.collectPrecedingComments();
        this.consume();
        fieldPrecedingComments.push(...this.collectPrecedingComments());
        const { location: fieldLocation, variable: fieldName } = this.assertAndPeekLowerId();
        const typeArguments: SamlangType[] = [];
        let location = functionExpression.location.union(fieldLocation);
        if (this.peek().content === '<') {
          fieldPrecedingComments.push(...this.collectPrecedingComments());
          this.assertAndConsume('<');
          typeArguments.push(this.parseType());
          while (this.peek().content === ',') {
            this.consume();
            typeArguments.push(this.parseType());
          }
          location = location.union(this.assertAndConsume('>'));
        }
        functionExpression = SourceExpressionFieldAccess({
          location,
          type: SourceUnknownType(SourceReason(location, null)),
          associatedComments: [],
          expression: functionExpression,
          typeArguments,
          fieldName: SourceId(fieldName, {
            location: fieldLocation,
            associatedComments: fieldPrecedingComments,
          }),
          fieldOrder: -1,
        });
      } else {
        this.consume();
        const functionArguments =
          this.peek().content === ')' ? [] : this.parseCommaSeparatedExpressions();
        const endLocation = this.assertAndConsume(')');
        const location = startLocation.union(endLocation);
        functionExpression = SourceExpressionFunctionCall({
          location,
          type: SourceUnknownType(SourceReason(location, null)),
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
      return SourceExpressionTrue(peeked.location, associatedComments);
    }
    if (peeked.content === 'false') {
      this.consume();
      return SourceExpressionFalse(peeked.location, associatedComments);
    }
    if (peeked.content === 'this') {
      this.consume();
      return SourceExpressionThis({
        location: peeked.location,
        type: SourceUnknownType(SourceReason(peeked.location, null)),
        associatedComments,
      });
    }

    if (typeof peeked.content !== 'string') {
      if (peeked.content.__type__ === 'IntLiteral') {
        this.consume();
        return SourceExpressionInt(
          parseInt(peeked.content.content, 10),
          peeked.location,
          associatedComments,
        );
      }

      if (peeked.content.__type__ === 'StringLiteral') {
        this.consume();
        const literalText = peeked.content.content;
        return SourceExpressionString(
          unescapeQuotes(literalText.substring(1, literalText.length - 1)),
          peeked.location,
          associatedComments,
        );
      }

      if (peeked.content.__type__ === 'LowerId') {
        this.consume();
        return SourceExpressionVariable({
          location: peeked.location,
          type: SourceUnknownType(SourceReason(peeked.location, null)),
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
          const { location: memberNameLocation, identifier: memberName } =
            this.assertAndConsumeIdentifier();
          let location = peeked.location.union(memberNameLocation);
          const typeArguments: SamlangType[] = [];
          if (this.peek().content === '<') {
            memberPrecedingComments.push(...this.collectPrecedingComments());
            this.assertAndConsume('<');
            typeArguments.push(this.parseType());
            while (this.peek().content === ',') {
              this.consume();
              typeArguments.push(this.parseType());
            }
            location = location.union(this.assertAndConsume('>'));
          }
          return SourceExpressionClassMember({
            location,
            type: SourceUnknownType(SourceReason(location, null)),
            associatedComments,
            typeArguments,
            moduleReference: this.resolveClass(className),
            className: SourceId(className, { location: peeked.location }),
            memberName: SourceId(memberName, {
              location: memberNameLocation,
              associatedComments: memberPrecedingComments,
            }),
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
        const location = peeked.location.union(body.location);
        return SourceExpressionLambda({
          location,
          type: SourceFunctionType(SourceReason(location, location), [], body.type),
          associatedComments,
          parameters: [],
          captured: new Map(),
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
          const parameters = this.parseCommaSeparatedList(
            (): { name: SourceIdentifier; typeAnnotation: SamlangType | null } => {
              const name = this.parseLowerId();
              if (this.peek().content === ':') {
                this.consume();
                const typeAnnotation = this.parseType();
                return { name, typeAnnotation };
              }
              return { name, typeAnnotation: null };
            },
          );
          this.assertAndConsume(')');
          this.assertAndConsume('->');
          const body = this.parseExpression();
          const location = peeked.location.union(body.location);
          return SourceExpressionLambda({
            location,
            type: SourceFunctionType(
              SourceReason(location, location),
              parameters.map(
                (it) =>
                  it.typeAnnotation ?? SourceUnknownType(SourceReason(it.name.location, null)),
              ),
              body.type,
            ),
            associatedComments,
            parameters,
            captured: new Map(),
            body,
          });
        } else if (next.content === ')') {
          this.consume();
          if (this.peek().content === '->') {
            associatedComments.push(...this.collectPrecedingComments());
            this.consume();
            const body = this.parseExpression();
            const parameterType = SourceUnknownType(
              SourceReason(lowerIdentifierForLambdaPeeked.location, null),
            );
            const location = peeked.location.union(body.location);
            return SourceExpressionLambda({
              location,
              type: SourceFunctionType(
                SourceReason(location, location),
                [parameterType],
                body.type,
              ),
              associatedComments,
              parameters: [
                {
                  name: SourceId(lowerIdentifierForLambdaPeeked.content.content, {
                    location: lowerIdentifierForLambdaPeeked.location,
                  }),
                  typeAnnotation: null,
                },
              ],
              captured: new Map(),
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

    if (peeked.content === '{') {
      this.consume();

      const statements: SamlangValStatement[] = [];
      while (this.peek().content === 'val') {
        statements.push(this.parseStatement());
      }
      if (this.peek().content === '}') {
        const location = peeked.location.union(this.peek().location);
        this.consume();
        return SourceExpressionStatementBlock({
          location,
          type: SourceUnitType(SourceReason(location, null)),
          associatedComments,
          block: { location, statements },
        });
      }
      const expression = this.parseExpression();
      const location = peeked.location.union(this.assertAndConsume('}'));
      return SourceExpressionStatementBlock({
        location,
        type: SourceUnknownType(SourceReason(location, null)),
        associatedComments,
        block: { location, statements, expression },
      });
    }

    // We failed to parse the base expression, so we stick in a dummy value here.
    this.report(
      peeked.location,
      `Expected: expression, actual: ${samlangTokenContentToString(peeked.content)}`,
    );
    return SourceExpressionInt(0, peeked.location, associatedComments);
  };

  parseStatement = (): SamlangValStatement => {
    const associatedComments = this.collectPrecedingComments();
    const startLocation = this.assertAndConsume('val');
    const pattern = this.parsePattern();
    let typeAnnotation: SamlangType | null = null;
    if (this.peek().content === ':') {
      this.consume();
      typeAnnotation = this.parseType();
    }
    this.assertAndConsume('=');
    const assignedExpression = this.parseExpression();
    let location: Location;
    if (this.peek().content === ';') {
      location = startLocation.union(this.peek().location);
      this.consume();
    } else {
      location = startLocation.union(assignedExpression.location);
    }
    return { location, pattern, typeAnnotation, assignedExpression, associatedComments };
  };

  parsePattern = (): Pattern => {
    const peeked = this.peek();
    if (peeked.content === '{') {
      this.consume();
      const destructedNames = this.parseCommaSeparatedList(() => {
        const fieldName = this.parseLowerId();
        let location = fieldName.location;
        let alias: SourceIdentifier | undefined;
        if (this.peek().content === 'as') {
          this.consume();
          alias = this.parseLowerId();
          location = location.union(alias.location);
        }
        return {
          fieldName,
          fieldOrder: -1,
          type: SourceUnknownType(SourceReason(fieldName.location, null)),
          alias,
          location,
        };
      });
      const endLocation = this.assertAndConsume('}');
      return {
        location: peeked.location.union(endLocation),
        type: 'ObjectPattern',
        destructedNames,
      };
    }
    if (peeked.content === '_') {
      this.consume();
      return { location: peeked.location, type: 'WildCardPattern' };
    }
    return {
      location: peeked.location,
      type: 'VariablePattern',
      name: this.assertAndPeekLowerId().variable,
    };
  };

  parseType = (): SamlangType => {
    const peeked = this.peek();

    if (
      peeked.content === 'unit' ||
      peeked.content === 'bool' ||
      peeked.content === 'int' ||
      peeked.content === 'string'
    ) {
      this.consume();
      return {
        __type__: 'PrimitiveType',
        reason: SourceReason(peeked.location, peeked.location),
        name: peeked.content,
      };
    }
    if (typeof peeked.content !== 'string' && peeked.content.__type__ === 'UpperId') {
      this.consume();
      return this.parseIdentifierType(
        SourceId(peeked.content.content, { location: peeked.location }),
      );
    }
    if (peeked.content === '(') {
      this.consume();
      let argumentTypes: readonly SamlangType[];
      if (this.peek().content === ')') {
        this.consume();
        argumentTypes = [];
      } else {
        argumentTypes = this.parseCommaSeparatedList(this.parseType);
        this.assertAndConsume(')');
      }
      this.assertAndConsume('->');
      const returnType = this.parseType();
      const location = peeked.location.union(returnType.reason.useLocation);
      return {
        __type__: 'FunctionType',
        reason: SourceReason(location, location),
        argumentTypes,
        returnType,
      };
    }
    this.report(
      peeked.location,
      `Expecting: type, actual: ${samlangTokenContentToString(peeked.content)}`,
    );
    return SourceUnknownType(SourceReason(peeked.location, peeked.location));
  };

  private parseIdentifierType(identifier: SourceIdentifier): SamlangIdentifierType {
    let typeArguments: readonly SamlangType[];
    let location = identifier.location;
    if (this.peek().content === '<') {
      this.consume();
      typeArguments = this.parseCommaSeparatedList(this.parseType);
      location = location.union(this.assertAndConsume('>'));
    } else {
      typeArguments = [];
    }
    return {
      __type__: 'IdentifierType',
      reason: SourceReason(location, location),
      moduleReference: this.resolveClass(identifier.name),
      identifier: identifier.name,
      typeArguments,
    };
  }
}
