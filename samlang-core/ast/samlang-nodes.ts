import {
  boolType,
  FALSE,
  FunctionType,
  intLiteralOf,
  intType,
  Literal,
  ModuleReference,
  Node,
  Range,
  stringLiteralOf,
  stringType,
  TRUE,
  TupleType,
  Type,
  TypedComment,
} from './common-nodes';
import type { BinaryOperator } from './common-operators';

/** An identifier with attached comments. */
export interface SourceIdentifier extends Node {
  readonly associatedComments: readonly TypedComment[];
  readonly name: string;
}

export const SourceId = (
  name: string,
  {
    range = Range.DUMMY,
    associatedComments = [],
  }: { readonly range?: Range; readonly associatedComments?: readonly TypedComment[] } = {}
): SourceIdentifier => ({ range, associatedComments, name });

interface BaseExpression extends Node {
  /** Identity of the object used for pattern matching. */
  readonly __type__: string;
  /** Static type of the expression. */
  readonly type: Type;
  /** Precedence level. Lower the number, higher the precedence. */
  readonly precedence: number;
  /** A list of comments associated with the expression. */
  readonly associatedComments: readonly TypedComment[];
}

type ExpressionConstructorArgumentObject<E extends BaseExpression> = Omit<
  E,
  '__type__' | 'range' | 'precedence' | 'associatedComments'
> & { readonly range?: Range; readonly associatedComments?: readonly TypedComment[] };

export interface LiteralExpression extends BaseExpression {
  readonly __type__: 'LiteralExpression';
  readonly literal: Literal;
}

export interface ThisExpression extends BaseExpression {
  readonly __type__: 'ThisExpression';
}

export interface VariableExpression extends BaseExpression {
  readonly __type__: 'VariableExpression';
  readonly name: string;
}

export interface ClassMemberExpression extends BaseExpression {
  readonly __type__: 'ClassMemberExpression';
  readonly typeArguments: readonly Type[];
  readonly moduleReference: ModuleReference;
  readonly className: SourceIdentifier;
  readonly memberName: SourceIdentifier;
}

export interface TupleConstructorExpression extends BaseExpression {
  readonly __type__: 'TupleConstructorExpression';
  readonly type: TupleType;
  readonly expressions: readonly SamlangExpression[];
}

export interface FieldAccessExpression extends BaseExpression {
  readonly __type__: 'FieldAccessExpression';
  readonly expression: SamlangExpression;
  readonly fieldName: SourceIdentifier;
  readonly fieldOrder: number;
}

export interface MethodAccessExpression extends BaseExpression {
  readonly __type__: 'MethodAccessExpression';
  readonly expression: SamlangExpression;
  readonly methodName: SourceIdentifier;
}

export interface UnaryExpression extends BaseExpression {
  readonly __type__: 'UnaryExpression';
  readonly operator: '!' | '-';
  readonly expression: SamlangExpression;
}

export interface FunctionCallExpression extends BaseExpression {
  readonly __type__: 'FunctionCallExpression';
  readonly functionExpression: SamlangExpression;
  readonly functionArguments: readonly SamlangExpression[];
}

export interface BinaryExpression extends BaseExpression {
  readonly __type__: 'BinaryExpression';
  readonly operatorPrecedingComments: readonly TypedComment[];
  readonly operator: BinaryOperator;
  readonly e1: SamlangExpression;
  readonly e2: SamlangExpression;
}

export interface IfElseExpression extends BaseExpression {
  readonly __type__: 'IfElseExpression';
  readonly boolExpression: SamlangExpression;
  readonly e1: SamlangExpression;
  readonly e2: SamlangExpression;
}

export interface VariantPatternToExpression {
  readonly range: Range;
  readonly tag: SourceIdentifier;
  readonly tagOrder: number;
  readonly dataVariable?: readonly [SourceIdentifier, Type];
  readonly expression: SamlangExpression;
}

export interface MatchExpression extends BaseExpression {
  readonly __type__: 'MatchExpression';
  readonly matchedExpression: SamlangExpression;
  readonly matchingList: readonly VariantPatternToExpression[];
}

export interface LambdaExpression extends BaseExpression {
  readonly __type__: 'LambdaExpression';
  readonly type: FunctionType;
  readonly parameters: readonly (readonly [SourceIdentifier, Type])[];
  readonly captured: Record<string, Type>;
  readonly body: SamlangExpression;
}

export interface TuplePattern extends Node {
  readonly type: 'TuplePattern';
  readonly destructedNames: readonly {
    readonly name?: SourceIdentifier;
    readonly type: Type;
  }[];
}

export interface ObjectPatternDestucturedName {
  readonly fieldName: SourceIdentifier;
  readonly fieldOrder: number;
  readonly type: Type;
  readonly alias?: SourceIdentifier;
  readonly range: Range;
}

export interface ObjectPattern extends Node {
  readonly type: 'ObjectPattern';
  readonly destructedNames: readonly ObjectPatternDestucturedName[];
}

export interface VariablePattern extends Node {
  readonly type: 'VariablePattern';
  readonly name: string;
}

export interface WildCardPattern extends Node {
  readonly type: 'WildCardPattern';
}

export type Pattern = TuplePattern | ObjectPattern | VariablePattern | WildCardPattern;

export interface SamlangValStatement extends Node {
  readonly pattern: Pattern;
  readonly typeAnnotation: Type;
  readonly assignedExpression: SamlangExpression;
  readonly associatedComments: readonly TypedComment[];
}

export interface StatementBlock extends Node {
  readonly statements: readonly SamlangValStatement[];
  readonly expression?: SamlangExpression;
}

export interface StatementBlockExpression extends BaseExpression {
  readonly __type__: 'StatementBlockExpression';
  readonly block: StatementBlock;
}

export type SamlangExpression =
  | LiteralExpression
  | ThisExpression
  | VariableExpression
  | ClassMemberExpression
  | TupleConstructorExpression
  | FieldAccessExpression
  | MethodAccessExpression
  | UnaryExpression
  | FunctionCallExpression
  | BinaryExpression
  | IfElseExpression
  | MatchExpression
  | LambdaExpression
  | StatementBlockExpression;

export const SourceExpressionTrue = (
  range: Range = Range.DUMMY,
  associatedComments: readonly TypedComment[] = []
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: boolType,
  precedence: 0,
  associatedComments,
  literal: TRUE,
});

export const SourceExpressionFalse = (
  range: Range = Range.DUMMY,
  associatedComments: readonly TypedComment[] = []
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: boolType,
  precedence: 0,
  associatedComments,
  literal: FALSE,
});

export const SourceExpressionInt = (
  value: number,
  range: Range = Range.DUMMY,
  associatedComments: readonly TypedComment[] = []
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: intType,
  precedence: 0,
  associatedComments,
  literal: intLiteralOf(value),
});

export const SourceExpressionString = (
  value: string,
  range: Range = Range.DUMMY,
  associatedComments: readonly TypedComment[] = []
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  range,
  type: stringType,
  precedence: 0,
  associatedComments,
  literal: stringLiteralOf(value),
});

export const SourceExpressionThis = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
}: ExpressionConstructorArgumentObject<ThisExpression>): ThisExpression => ({
  __type__: 'ThisExpression',
  range,
  type,
  precedence: 0,
  associatedComments,
});

export const SourceExpressionVariable = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  name,
}: ExpressionConstructorArgumentObject<VariableExpression>): VariableExpression => ({
  __type__: 'VariableExpression',
  range,
  type,
  precedence: 0,
  associatedComments,
  name,
});

export const SourceExpressionClassMember = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  typeArguments,
  moduleReference,
  className,
  memberName,
}: ExpressionConstructorArgumentObject<ClassMemberExpression>): ClassMemberExpression => ({
  __type__: 'ClassMemberExpression',
  range,
  type,
  precedence: 1,
  associatedComments,
  typeArguments,
  moduleReference,
  className,
  memberName,
});

export const SourceExpressionTupleConstructor = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  expressions,
}: ExpressionConstructorArgumentObject<TupleConstructorExpression>): TupleConstructorExpression => ({
  __type__: 'TupleConstructorExpression',
  range,
  type,
  precedence: 1,
  associatedComments,
  expressions,
});

export const SourceExpressionFieldAccess = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  expression,
  fieldName,
  fieldOrder,
}: ExpressionConstructorArgumentObject<FieldAccessExpression>): FieldAccessExpression => ({
  __type__: 'FieldAccessExpression',
  range,
  type,
  precedence: 2,
  associatedComments,
  expression,
  fieldName,
  fieldOrder,
});

export const SourceExpressionMethodAccess = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  expression,
  methodName,
}: ExpressionConstructorArgumentObject<MethodAccessExpression>): MethodAccessExpression => ({
  __type__: 'MethodAccessExpression',
  range,
  type,
  precedence: 2,
  associatedComments,
  expression,
  methodName,
});

export const SourceExpressionUnary = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  operator,
  expression,
}: ExpressionConstructorArgumentObject<UnaryExpression>): UnaryExpression => ({
  __type__: 'UnaryExpression',
  range,
  type,
  precedence: 3,
  associatedComments,
  operator,
  expression,
});

export const SourceExpressionFunctionCall = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  functionExpression,
  functionArguments,
}: ExpressionConstructorArgumentObject<FunctionCallExpression>): FunctionCallExpression => ({
  __type__: 'FunctionCallExpression',
  range,
  type,
  precedence: 2,
  associatedComments,
  functionExpression,
  functionArguments,
});

export const SourceExpressionBinary = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  operatorPrecedingComments,
  operator,
  e1,
  e2,
}: ExpressionConstructorArgumentObject<BinaryExpression>): BinaryExpression => ({
  __type__: 'BinaryExpression',
  range,
  type,
  precedence: 5 + operator.precedence,
  associatedComments,
  operatorPrecedingComments,
  operator,
  e1,
  e2,
});

export const SourceExpressionIfElse = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  boolExpression,
  e1,
  e2,
}: ExpressionConstructorArgumentObject<IfElseExpression>): IfElseExpression => ({
  __type__: 'IfElseExpression',
  range,
  type,
  precedence: 11,
  associatedComments,
  boolExpression,
  e1,
  e2,
});

export const SourceExpressionMatch = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  matchedExpression,
  matchingList,
}: ExpressionConstructorArgumentObject<MatchExpression>): MatchExpression => ({
  __type__: 'MatchExpression',
  range,
  type,
  precedence: 12,
  associatedComments,
  matchedExpression,
  matchingList,
});

export const SourceExpressionLambda = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  parameters,
  captured,
  body,
}: ExpressionConstructorArgumentObject<LambdaExpression>): LambdaExpression => ({
  __type__: 'LambdaExpression',
  range,
  type,
  precedence: 13,
  associatedComments,
  parameters,
  captured,
  body,
});

export const SourceExpressionStatementBlock = ({
  range = Range.DUMMY,
  type,
  associatedComments = [],
  block,
}: ExpressionConstructorArgumentObject<StatementBlockExpression>): StatementBlockExpression => ({
  __type__: 'StatementBlockExpression',
  range,
  type,
  precedence: 2,
  associatedComments,
  block,
});

export interface SourceAnnotatedVariable {
  readonly name: string;
  readonly nameRange: Range;
  readonly type: Type;
  readonly typeRange: Range;
}

export interface SourceClassMemberDefinition extends Node {
  readonly associatedComments: readonly TypedComment[];
  readonly isPublic: boolean;
  readonly isMethod: boolean;
  readonly nameRange: Range;
  readonly name: string;
  readonly typeParameters: readonly string[];
  readonly type: FunctionType;
  readonly parameters: readonly SourceAnnotatedVariable[];
  readonly body: SamlangExpression;
}

export interface SourceFieldType {
  readonly type: Type;
  readonly isPublic: boolean;
}

export interface TypeDefinition extends Node {
  readonly type: 'object' | 'variant';
  /** A list of fields. Used for ordering during codegen. */
  readonly names: readonly string[];
  readonly mappings: Readonly<Record<string, SourceFieldType>>;
}

export interface SourceClassDefinition extends Node {
  readonly associatedComments: readonly TypedComment[];
  readonly nameRange: Range;
  readonly name: string;
  readonly typeParameters: readonly string[];
  readonly typeDefinition: TypeDefinition;
  readonly members: readonly SourceClassMemberDefinition[];
}

export interface SourceModuleMembersImport extends Node {
  readonly importedMembers: readonly (readonly [string, Range])[];
  readonly importedModule: ModuleReference;
  readonly importedModuleRange: Range;
}

export interface SamlangModule {
  readonly imports: readonly SourceModuleMembersImport[];
  readonly classes: readonly SourceClassDefinition[];
}
