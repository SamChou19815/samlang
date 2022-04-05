import { zip } from '../utils';
import {
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
  readonly type: string;
  readonly reason: SamlangReason;
}

export interface SamlangPrimitiveType extends SamlangBaseType {
  readonly type: 'PrimitiveType';
  readonly name: 'unit' | 'bool' | 'int' | 'string';
}

export interface SamlangIdentifierType extends SamlangBaseType {
  readonly type: 'IdentifierType';
  readonly moduleReference: ModuleReference;
  readonly identifier: string;
  readonly typeArguments: readonly SamlangType[];
}

export interface SamlangTupleType extends SamlangBaseType {
  readonly type: 'TupleType';
  readonly mappings: readonly SamlangType[];
}

export interface SamlangFunctionType extends SamlangBaseType {
  readonly type: 'FunctionType';
  readonly argumentTypes: readonly SamlangType[];
  readonly returnType: SamlangType;
}

export interface SamlangUndecidedType extends SamlangBaseType {
  readonly type: 'UndecidedType';
  readonly index: number;
}

export type SamlangType =
  | SamlangPrimitiveType
  | SamlangIdentifierType
  | SamlangTupleType
  | SamlangFunctionType
  | SamlangUndecidedType;

export const SourceUnitType = (reason: SamlangReason): SamlangPrimitiveType => ({
  type: 'PrimitiveType',
  reason,
  name: 'unit',
});
export const SourceBoolType = (reason: SamlangReason): SamlangPrimitiveType => ({
  type: 'PrimitiveType',
  reason,
  name: 'bool',
});
export const SourceIntType = (reason: SamlangReason): SamlangPrimitiveType => ({
  type: 'PrimitiveType',
  reason,
  name: 'int',
});
export const SourceStringType = (reason: SamlangReason): SamlangPrimitiveType => ({
  type: 'PrimitiveType',
  reason,
  name: 'string',
});

export const SourceIdentifierType = (
  reason: SamlangReason,
  moduleReference: ModuleReference,
  identifier: string,
  typeArguments: readonly SamlangType[] = []
): SamlangIdentifierType => ({
  type: 'IdentifierType',
  reason,
  moduleReference,
  identifier,
  typeArguments,
});

export const SourceTupleType = (
  reason: SamlangReason,
  mappings: readonly SamlangType[]
): SamlangTupleType => ({
  type: 'TupleType',
  reason,
  mappings,
});

export const SourceFunctionType = (
  reason: SamlangReason,
  argumentTypes: readonly SamlangType[],
  returnType: SamlangType
): SamlangFunctionType => ({
  type: 'FunctionType',
  reason,
  argumentTypes,
  returnType,
});

export class UndecidedTypes {
  private static nextUndecidedTypeIndex = 0;

  static next(reason: SamlangReason): SamlangUndecidedType {
    const type = {
      type: 'UndecidedType',
      reason,
      index: UndecidedTypes.nextUndecidedTypeIndex,
    } as const;
    UndecidedTypes.nextUndecidedTypeIndex += 1;
    return type;
  }

  static nextN(n: number): readonly SamlangUndecidedType[] {
    const list: SamlangUndecidedType[] = [];
    for (let i = 0; i < n; i += 1) {
      list.push(UndecidedTypes.next(DummySourceReason));
    }
    return list;
  }

  static resetUndecidedTypeIndex_ONLY_FOR_TEST(): void {
    UndecidedTypes.nextUndecidedTypeIndex = 0;
  }
}

export function prettyPrintType(type: SamlangType): string {
  switch (type.type) {
    case 'PrimitiveType':
      return type.name;
    case 'IdentifierType':
      if (type.typeArguments.length === 0) {
        return type.identifier;
      }
      return `${type.identifier}<${type.typeArguments.map(prettyPrintType).join(', ')}>`;
    case 'TupleType':
      return `[${type.mappings.map(prettyPrintType).join(' * ')}]`;
    case 'FunctionType':
      return `(${type.argumentTypes.map(prettyPrintType).join(', ')}) -> ${prettyPrintType(
        type.returnType
      )}`;
    case 'UndecidedType':
      return '__UNDECIDED__';
  }
}

export function isTheSameType(t1: SamlangType, t2: SamlangType): boolean {
  switch (t1.type) {
    case 'PrimitiveType':
      return t2.type === 'PrimitiveType' && t1.name === t2.name;
    case 'IdentifierType':
      return (
        t2.type === 'IdentifierType' &&
        moduleReferenceToString(t1.moduleReference) ===
          moduleReferenceToString(t2.moduleReference) &&
        t1.identifier === t2.identifier &&
        t1.typeArguments.length === t2.typeArguments.length &&
        zip(t1.typeArguments, t2.typeArguments).every(([t1Element, t2Element]) =>
          isTheSameType(t1Element, t2Element)
        )
      );
    case 'TupleType':
      return (
        t2.type === 'TupleType' &&
        t1.mappings.length === t2.mappings.length &&
        zip(t1.mappings, t2.mappings).every(([t1Element, t2Element]) =>
          isTheSameType(t1Element, t2Element)
        )
      );
    case 'FunctionType':
      return (
        t2.type === 'FunctionType' &&
        isTheSameType(t1.returnType, t2.returnType) &&
        t1.argumentTypes.length === t2.argumentTypes.length &&
        zip(t1.argumentTypes, t2.argumentTypes).every(([t1Element, t2Element]) =>
          isTheSameType(t1Element, t2Element)
        )
      );
    case 'UndecidedType':
      return t2.type === 'UndecidedType' && t1.index === t2.index;
  }
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
  }: { readonly location?: Location; readonly associatedComments?: readonly TypedComment[] } = {}
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

export interface TupleConstructorExpression extends BaseExpression {
  readonly __type__: 'TupleConstructorExpression';
  readonly type: SamlangTupleType;
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
  readonly parameters: readonly (readonly [SourceIdentifier, SamlangType])[];
  readonly captured: Record<string, SamlangType>;
  readonly body: SamlangExpression;
}

export interface TuplePattern extends Node {
  readonly type: 'TuplePattern';
  readonly destructedNames: readonly {
    readonly name?: SourceIdentifier;
    readonly type: SamlangType;
  }[];
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

export type Pattern = TuplePattern | ObjectPattern | VariablePattern | WildCardPattern;

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
  location: Location = Location.DUMMY,
  associatedComments: readonly TypedComment[] = []
): LiteralExpression => ({
  __type__: 'LiteralExpression',
  location,
  type: SourceBoolType(SourceReason(location, null)),
  precedence: 0,
  associatedComments,
  literal: TRUE,
});

export const SourceExpressionFalse = (
  location: Location = Location.DUMMY,
  associatedComments: readonly TypedComment[] = []
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
  associatedComments: readonly TypedComment[] = []
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
  associatedComments: readonly TypedComment[] = []
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

export const SourceExpressionTupleConstructor = ({
  location = Location.DUMMY,
  type,
  associatedComments = [],
  expressions,
}: ExpressionConstructorArgumentObject<TupleConstructorExpression>): TupleConstructorExpression => ({
  __type__: 'TupleConstructorExpression',
  location,
  type,
  precedence: 1,
  associatedComments,
  expressions,
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

export interface SourceAnnotatedVariable {
  readonly name: string;
  readonly nameLocation: Location;
  readonly type: SamlangType;
  readonly typeLocation: Location;
}

export interface SourceClassMemberDeclaration extends Node {
  readonly associatedComments: readonly TypedComment[];
  readonly isPublic: boolean;
  readonly isMethod: boolean;
  readonly name: SourceIdentifier;
  readonly typeParameters: readonly SourceIdentifier[];
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
  readonly typeParameters: readonly SourceIdentifier[];
  readonly typeDefinition?: TypeDefinition;
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
