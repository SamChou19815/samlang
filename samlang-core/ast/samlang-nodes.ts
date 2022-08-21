import { zip } from '../utils';
import {
  defReasonToUseReason,
  DummySourceReason,
  FALSE,
  intLiteralOf,
  Literal,
  Location,
  ModuleReference,
  moduleReferenceToString,
  Node,
  SamlangReason,
  SourceReason,
  stringLiteralOf,
  TRUE,
  TypedComment,
} from './common-nodes';
import type { BinaryOperator } from './common-operators';

interface SamlangBaseType {
  readonly __type__: string;
  readonly reason: SamlangReason;
}

export interface SamlangUnknownType extends SamlangBaseType {
  readonly __type__: 'UnknownType';
}

export interface SamlangPrimitiveType extends SamlangBaseType {
  readonly __type__: 'PrimitiveType';
  readonly name: 'unit' | 'bool' | 'int' | 'string';
}

export interface SamlangIdentifierType extends SamlangBaseType {
  readonly __type__: 'IdentifierType';
  readonly moduleReference: ModuleReference;
  readonly identifier: string;
  readonly typeArguments: readonly SamlangType[];
}

export interface SamlangFunctionType extends SamlangBaseType {
  readonly __type__: 'FunctionType';
  readonly argumentTypes: readonly SamlangType[];
  readonly returnType: SamlangType;
}

export type SamlangType =
  | SamlangUnknownType
  | SamlangPrimitiveType
  | SamlangIdentifierType
  | SamlangFunctionType;

export interface TypeParameterSignature {
  readonly name: string;
  readonly bound: SamlangIdentifierType | null;
}

export const SourceUnitType = (reason: SamlangReason): SamlangPrimitiveType => ({
  __type__: 'PrimitiveType',
  reason,
  name: 'unit',
});
export const SourceBoolType = (reason: SamlangReason): SamlangPrimitiveType => ({
  __type__: 'PrimitiveType',
  reason,
  name: 'bool',
});
export const SourceIntType = (reason: SamlangReason): SamlangPrimitiveType => ({
  __type__: 'PrimitiveType',
  reason,
  name: 'int',
});
export const SourceStringType = (reason: SamlangReason): SamlangPrimitiveType => ({
  __type__: 'PrimitiveType',
  reason,
  name: 'string',
});
export const SourceUnknownType = (reason: SamlangReason): SamlangUnknownType => ({
  __type__: 'UnknownType',
  reason,
});

export const SourceIdentifierType = (
  reason: SamlangReason,
  moduleReference: ModuleReference,
  identifier: string,
  typeArguments: readonly SamlangType[] = [],
): SamlangIdentifierType => ({
  __type__: 'IdentifierType',
  reason,
  moduleReference,
  identifier,
  typeArguments,
});

export const SourceFunctionType = (
  reason: SamlangReason,
  argumentTypes: readonly SamlangType[],
  returnType: SamlangType,
): SamlangFunctionType => ({
  __type__: 'FunctionType',
  reason,
  argumentTypes,
  returnType,
});

export function prettyPrintType(type: SamlangType): string {
  switch (type.__type__) {
    case 'UnknownType':
      return 'unknown';
    case 'PrimitiveType':
      return type.name;
    case 'IdentifierType':
      if (type.typeArguments.length === 0) {
        return type.identifier;
      }
      return `${type.identifier}<${type.typeArguments.map(prettyPrintType).join(', ')}>`;
    case 'FunctionType':
      return `(${type.argumentTypes.map(prettyPrintType).join(', ')}) -> ${prettyPrintType(
        type.returnType,
      )}`;
  }
}

export function isTheSameType(t1: SamlangType, t2: SamlangType): boolean {
  switch (t1.__type__) {
    case 'UnknownType':
      return t2.__type__ === 'UnknownType';
    case 'PrimitiveType':
      return t2.__type__ === 'PrimitiveType' && t1.name === t2.name;
    case 'IdentifierType':
      return (
        t2.__type__ === 'IdentifierType' &&
        moduleReferenceToString(t1.moduleReference) ===
          moduleReferenceToString(t2.moduleReference) &&
        t1.identifier === t2.identifier &&
        t1.typeArguments.length === t2.typeArguments.length &&
        zip(t1.typeArguments, t2.typeArguments).every(([t1Element, t2Element]) =>
          isTheSameType(t1Element, t2Element),
        )
      );
    case 'FunctionType':
      return (
        t2.__type__ === 'FunctionType' &&
        isTheSameType(t1.returnType, t2.returnType) &&
        t1.argumentTypes.length === t2.argumentTypes.length &&
        zip(t1.argumentTypes, t2.argumentTypes).every(([t1Element, t2Element]) =>
          isTheSameType(t1Element, t2Element),
        )
      );
  }
}

export function typeReposition<T extends SamlangType>(type: T, useLocation: Location): T {
  return { ...type, reason: defReasonToUseReason(type.reason, useLocation) };
}

/** An identifier with attached comments. */
export interface SourceIdentifier extends Node {
  readonly associatedComments: readonly TypedComment[];
  readonly name: string;
}

export const SourceId = (
  name: string,
  {
    location = Location.DUMMY,
    associatedComments = [],
  }: { readonly location?: Location; readonly associatedComments?: readonly TypedComment[] } = {},
): SourceIdentifier => ({ location, associatedComments, name });

interface BaseExpression extends Node {
  /** Identity of the object used for pattern matching. */
  readonly __type__: string;
  /** Static type of the expression. */
  readonly type: SamlangType;
  /** Precedence level. Lower the number, higher the precedence. */
  readonly precedence: number;
  /** A list of comments associated with the expression. */
  readonly associatedComments: readonly TypedComment[];
}

type ExpressionConstructorArgumentObject<E extends BaseExpression> = Omit<
  E,
  '__type__' | 'location' | 'precedence' | 'associatedComments'
> & { readonly location?: Location; readonly associatedComments?: readonly TypedComment[] };

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
  readonly typeArguments: readonly SamlangType[];
  readonly moduleReference: ModuleReference;
  readonly className: SourceIdentifier;
  readonly memberName: SourceIdentifier;
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
  readonly location: Location;
  readonly tag: SourceIdentifier;
  readonly tagOrder: number;
  readonly dataVariable?: readonly [SourceIdentifier, SamlangType];
  readonly expression: SamlangExpression;
}

export interface MatchExpression extends BaseExpression {
  readonly __type__: 'MatchExpression';
  readonly matchedExpression: SamlangExpression;
  readonly matchingList: readonly VariantPatternToExpression[];
}

export interface LambdaExpression extends BaseExpression {
  readonly __type__: 'LambdaExpression';
  readonly type: SamlangFunctionType;
  readonly parameters: readonly {
    readonly name: SourceIdentifier;
    readonly typeAnnotation: SamlangType | null;
  }[];
  readonly captured: Record<string, SamlangType>;
  readonly body: SamlangExpression;
}

export interface ObjectPatternDestucturedName {
  readonly fieldName: SourceIdentifier;
  readonly fieldOrder: number;
  readonly type: SamlangType;
  readonly alias?: SourceIdentifier;
  readonly location: Location;
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

export type Pattern = ObjectPattern | VariablePattern | WildCardPattern;

export interface SamlangValStatement extends Node {
  readonly pattern: Pattern;
  readonly typeAnnotation: SamlangType | null;
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
  location: Location,
  associatedComments: readonly TypedComment[],
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  location,
  type: SourceBoolType(SourceReason(location, null)),
  precedence: 0,
  associatedComments,
  literal: TRUE,
});

export const SourceExpressionFalse = (
  location: Location,
  associatedComments: readonly TypedComment[],
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  location,
  type: SourceBoolType(SourceReason(location, null)),
  precedence: 0,
  associatedComments,
  literal: FALSE,
});

export const SourceExpressionInt = (
  value: number,
  location: Location = Location.DUMMY,
  associatedComments: readonly TypedComment[] = [],
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  location,
  type: SourceIntType(SourceReason(location, null)),
  precedence: 0,
  associatedComments,
  literal: intLiteralOf(value),
});

export const SourceExpressionString = (
  value: string,
  location: Location = Location.DUMMY,
  associatedComments: readonly TypedComment[] = [],
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  location,
  type: SourceStringType(SourceReason(location, null)),
  precedence: 0,
  associatedComments,
  literal: stringLiteralOf(value),
});

export const SourceExpressionThis = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
}: ExpressionConstructorArgumentObject<ThisExpression>): ThisExpression => ({
  __type__: 'ThisExpression',
  location,
  type,
  precedence: 0,
  associatedComments,
});

export const SourceExpressionVariable = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  name,
}: ExpressionConstructorArgumentObject<VariableExpression>): VariableExpression => ({
  __type__: 'VariableExpression',
  location,
  type,
  precedence: 0,
  associatedComments,
  name,
});

export const SourceExpressionClassMember = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  typeArguments,
  moduleReference,
  className,
  memberName,
}: ExpressionConstructorArgumentObject<ClassMemberExpression>): ClassMemberExpression => ({
  __type__: 'ClassMemberExpression',
  location,
  type,
  precedence: 1,
  associatedComments,
  typeArguments,
  moduleReference,
  className,
  memberName,
});

export const SourceExpressionFieldAccess = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  expression,
  fieldName,
  fieldOrder,
}: ExpressionConstructorArgumentObject<FieldAccessExpression>): FieldAccessExpression => ({
  __type__: 'FieldAccessExpression',
  location,
  type,
  precedence: 2,
  associatedComments,
  expression,
  fieldName,
  fieldOrder,
});

export const SourceExpressionMethodAccess = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  expression,
  methodName,
}: ExpressionConstructorArgumentObject<MethodAccessExpression>): MethodAccessExpression => ({
  __type__: 'MethodAccessExpression',
  location,
  type,
  precedence: 2,
  associatedComments,
  expression,
  methodName,
});

export const SourceExpressionUnary = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  operator,
  expression,
}: ExpressionConstructorArgumentObject<UnaryExpression>): UnaryExpression => ({
  __type__: 'UnaryExpression',
  location,
  type,
  precedence: 3,
  associatedComments,
  operator,
  expression,
});

export const SourceExpressionFunctionCall = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  functionExpression,
  functionArguments,
}: ExpressionConstructorArgumentObject<FunctionCallExpression>): FunctionCallExpression => ({
  __type__: 'FunctionCallExpression',
  location,
  type,
  precedence: 2,
  associatedComments,
  functionExpression,
  functionArguments,
});

export const SourceExpressionBinary = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  operatorPrecedingComments,
  operator,
  e1,
  e2,
}: ExpressionConstructorArgumentObject<BinaryExpression>): BinaryExpression => ({
  __type__: 'BinaryExpression',
  location,
  type,
  precedence: 5 + operator.precedence,
  associatedComments,
  operatorPrecedingComments,
  operator,
  e1,
  e2,
});

export const SourceExpressionIfElse = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  boolExpression,
  e1,
  e2,
}: ExpressionConstructorArgumentObject<IfElseExpression>): IfElseExpression => ({
  __type__: 'IfElseExpression',
  location,
  type,
  precedence: 11,
  associatedComments,
  boolExpression,
  e1,
  e2,
});

export const SourceExpressionMatch = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  matchedExpression,
  matchingList,
}: ExpressionConstructorArgumentObject<MatchExpression>): MatchExpression => ({
  __type__: 'MatchExpression',
  location,
  type,
  precedence: 12,
  associatedComments,
  matchedExpression,
  matchingList,
});

export const SourceExpressionLambda = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  parameters,
  captured,
  body,
}: ExpressionConstructorArgumentObject<LambdaExpression>): LambdaExpression => ({
  __type__: 'LambdaExpression',
  location,
  type,
  precedence: 13,
  associatedComments,
  parameters,
  captured,
  body,
});

export const SourceExpressionStatementBlock = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  block,
}: ExpressionConstructorArgumentObject<StatementBlockExpression>): StatementBlockExpression => ({
  __type__: 'StatementBlockExpression',
  location,
  type,
  precedence: 2,
  associatedComments,
  block,
});

export const sourceExpressionWithNewType = <E extends SamlangExpression>(
  expression: E,
  type: E['type'],
): E => ({ ...expression, type });

export interface SourceAnnotatedVariable {
  readonly name: string;
  readonly nameLocation: Location;
  readonly type: SamlangType;
  readonly typeLocation: Location;
}

export interface SourceTypeParameter extends Node {
  readonly associatedComments: readonly TypedComment[];
  readonly name: SourceIdentifier;
  readonly bound: SamlangIdentifierType | null;
}

export function prettyPrintTypeParameter({ name, bound }: SourceTypeParameter): string {
  if (bound == null) return name.name;
  return `${name.name}: ${prettyPrintType(bound)}`;
}

export interface SourceClassMemberDeclaration extends Node {
  readonly associatedComments: readonly TypedComment[];
  readonly isPublic: boolean;
  readonly isMethod: boolean;
  readonly name: SourceIdentifier;
  readonly typeParameters: readonly SourceTypeParameter[];
  readonly type: SamlangFunctionType;
  readonly parameters: readonly SourceAnnotatedVariable[];
  readonly body?: SamlangExpression;
}

export interface SourceClassMemberDefinition extends SourceClassMemberDeclaration {
  readonly body: SamlangExpression;
}

export interface SourceInterfaceDeclaration extends Node {
  readonly associatedComments: readonly TypedComment[];
  readonly name: SourceIdentifier;
  readonly typeParameters: readonly SourceTypeParameter[];
  readonly typeDefinition?: TypeDefinition;
  /** The node after colon, interpreted as extends in interfaces and implements in classes. */
  readonly extendsOrImplementsNode?: SamlangIdentifierType;
  readonly members: readonly SourceClassMemberDeclaration[];
}

export interface SourceFieldType {
  readonly type: SamlangType;
  readonly isPublic: boolean;
}

export interface TypeDefinition extends Node {
  readonly type: 'object' | 'variant';
  /** A list of fields. Used for ordering during codegen. */
  readonly names: readonly SourceIdentifier[];
  readonly mappings: Readonly<Record<string, SourceFieldType>>;
}

export interface SourceClassDefinition extends SourceInterfaceDeclaration {
  readonly typeDefinition: TypeDefinition;
  readonly members: readonly SourceClassMemberDefinition[];
}

export interface SourceModuleMembersImport extends Node {
  readonly importedMembers: readonly SourceIdentifier[];
  readonly importedModule: ModuleReference;
  readonly importedModuleLocation: Location;
}

export interface SamlangModule {
  readonly imports: readonly SourceModuleMembersImport[];
  readonly interfaces: readonly SourceInterfaceDeclaration[];
  readonly classes: readonly SourceClassDefinition[];
}

/** A factory class to conveniently building AST nodes for the purpose of testing or synthesis. */
export class CustomizedReasonAstBuilder {
  constructor(
    private readonly reason: SamlangReason,
    private readonly moduleReference: ModuleReference,
  ) {}

  UnitType: SamlangPrimitiveType = SourceUnitType(this.reason);
  IntType: SamlangPrimitiveType = SourceIntType(this.reason);
  BoolType: SamlangPrimitiveType = SourceBoolType(this.reason);
  StringType: SamlangPrimitiveType = SourceStringType(this.reason);

  IdType = (id: string, typeArguments: readonly SamlangType[] = []): SamlangIdentifierType =>
    SourceIdentifierType(this.reason, this.moduleReference, id, typeArguments);

  FunType = (argumentTypes: readonly SamlangType[], returnType: SamlangType): SamlangFunctionType =>
    SourceFunctionType(this.reason, argumentTypes, returnType);

  // EXPRESSIONS

  TRUE: LiteralExpression = SourceExpressionTrue(Location.DUMMY, []);
  FALSE: LiteralExpression = SourceExpressionFalse(Location.DUMMY, []);
  ZERO: LiteralExpression = SourceExpressionInt(0);
}

export const AstBuilder: CustomizedReasonAstBuilder = new CustomizedReasonAstBuilder(
  DummySourceReason,
  ModuleReference.DUMMY,
);
