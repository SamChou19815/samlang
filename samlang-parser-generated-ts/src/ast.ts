/**
 * AST type definitions with pure JS objects.
 * A conversion is required to translate this back into Kotlin AST.
 */

// common

export type BinaryOperator =
  | '*'
  | '/'
  | '%'
  | '+'
  | '-'
  | '<'
  | '<='
  | '>'
  | '>='
  | '=='
  | '!='
  | '&&'
  | '||'
  | '::';

export type BuiltInFunctionName = 'stringToInt' | 'intToString' | 'println';

export interface Literal {}

export class IntLiteral implements Literal {
  constructor(public readonly value: string) {}
}
export class StringLiteral {
  constructor(public readonly value: string) {}
}
export class BoolLiteral {
  constructor(public readonly value: boolean) {}
}

export type Location = { readonly moduleReference: ModuleReference; readonly range: Range };

export interface ModuleMembersImport extends Node {
  readonly importedMembers: ImportedMember[];
  readonly importedModule: ModuleReference;
  readonly importedModuleRange: Range;
}

export type ImportedMember = { readonly name: string; readonly range: Range };

export type ModuleReference = { readonly parts: string[] };

export interface Node {
  readonly range: Range;
}

export type Position = { readonly line: number; readonly column: number };

export type Range = { readonly start: Position; readonly end: Position };

export interface Type {
  accept<T>(visitor: TypeVisitor<T>): T;
}

export interface TypeVisitor<T> {
  visitPrimitive(type: PrimitiveType): T;
  visitIdentifier(type: IdentifierType): T;
  visitTuple(type: TupleType): T;
  visitFunction(type: FunctionType): T;
  visitUndecided(type: UndecidedType): T;
}

export class PrimitiveType implements Type {
  constructor(public readonly name: 'unit' | 'bool' | 'int' | 'string') {}
  accept = <T>(visitor: TypeVisitor<T>): T => visitor.visitPrimitive(this);
}

export class IdentifierType implements Type {
  constructor(public readonly identifier: string, public readonly typeArguments: Type[]) {}
  accept = <T>(visitor: TypeVisitor<T>): T => visitor.visitIdentifier(this);
}

export class TupleType implements Type {
  constructor(public readonly mappings: Type[]) {}
  accept = <T>(visitor: TypeVisitor<T>): T => visitor.visitTuple(this);
}

export class FunctionType implements Type {
  constructor(public readonly argumentTypes: Type[], public readonly returnType: Type) {}
  accept = <T>(visitor: TypeVisitor<T>): T => visitor.visitFunction(this);
}

export class UndecidedType implements Type {
  accept = <T>(visitor: TypeVisitor<T>): T => visitor.visitUndecided(this);
}

export interface TypeDefinition extends Node {
  readonly type: 'object' | 'variant';
  readonly typeParameters: string[];
  readonly names: string[];
  readonly mappings: Map<string, FieldType>;
}

export type FieldType = { readonly type: Type; readonly isPublic: boolean };

export type UnaryOperator = '!' | '-';

// lang

export interface ClassDefinition extends Node {
  readonly nameRange: Range;
  readonly name: string;
  readonly isPublic: boolean;
  readonly typeDefinition: TypeDefinition;
  readonly members: MemberDefinition[];
}

export interface MemberDefinition extends Node {
  readonly isPublic: boolean;
  readonly isMethod: boolean;
  readonly nameRange: Range;
  readonly name: string;
  readonly typeParameters: string[];
  readonly type: FunctionType;
  readonly parameters: MemberDefinitionParameter[];
  readonly body: Expression;
}

export type MemberDefinitionParameter = {
  readonly name: string;
  readonly nameRange: Range;
  readonly type: Type;
  readonly typeRange: Range;
};

export interface Expression extends Node {
  readonly type: Type;
  accept<T>(visitor: ExpressionVisitor<T>): T;
}

export interface ExpressionVisitor<T> {
  visitLiteral(expression: LiteralExpression): T;
  visitThis(expression: ThisExpression): T;
  visitVariable(expression: VariableExpression): T;
  visitClassMember(expression: ClassMemberExpression): T;
  visitTupleConstructor(expression: TupleConstructorExpression): T;
  visitObjectConstructor(expression: ObjectConstructorExpression): T;
  visitVariantConstructor(expression: VariantConstructorExpression): T;
  visitFieldAccess(expression: FieldAccessExpression): T;
  visitMethodAccess(expression: MethodAccessExpression): T;
  visitUnary(expression: UnaryExpression): T;
  visitPanic(expression: PanicExpression): T;
  visitBuiltInFunctionCall(expression: BuiltInFunctionCallExpression): T;
  visitFunctionApplication(expression: FunctionApplicationExpression): T;
  visitBinary(expression: BinaryExpression): T;
  visitIfElse(expression: IfElseExpression): T;
  visitMatch(expression: MatchExpression): T;
  visitLambda(expression: LambdaExpression): T;
  visitStatementBlock(expression: StatementBlockExpression): T;
}

export class LiteralExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly literal: Literal
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitLiteral(this);
}

export class ThisExpression implements Expression {
  constructor(public readonly range: Range, public readonly type: Type) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitThis(this);
}

export class VariableExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly name: string
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitVariable(this);
}

export class ClassMemberExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly typeArguments: Type[],
    public readonly className: string,
    public readonly classNameRange: Range,
    public readonly memberName: string
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitClassMember(this);
}

export class TupleConstructorExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: TupleType,
    public readonly expressionList: Expression[]
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitTupleConstructor(this);
}

export class ObjectConstructorExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly fieldDeclarations: FieldConstructor[]
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitObjectConstructor(this);
}

export interface FieldConstructor {
  readonly range: Range;
  readonly type: Type;
  readonly name: string;
}

export class FieldAsFieldConstructor implements FieldConstructor {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly name: string,
    public readonly expression: Expression
  ) {}
}

export class FieldShorthandAsFieldConstructor implements FieldConstructor {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly name: string
  ) {}
}

export class VariantConstructorExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly tag: string,
    public readonly tagOrder: number,
    public readonly data: Expression
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitVariantConstructor(this);
}

export class FieldAccessExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly expression: Expression,
    public readonly fieldName: string,
    public readonly fieldOrder: number
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitFieldAccess(this);
}

export class MethodAccessExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly expression: Expression,
    public readonly methodName: string
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitMethodAccess(this);
}

export class UnaryExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly operator: UnaryOperator,
    public readonly expression: Expression
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitUnary(this);
}

export class PanicExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly expression: Expression
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitPanic(this);
}

export class BuiltInFunctionCallExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly functionName: BuiltInFunctionName,
    public readonly argumentExpression: Expression
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitBuiltInFunctionCall(this);
}

export class FunctionApplicationExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly functionExpression: Expression,
    public readonly functionArguments: Expression[]
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitFunctionApplication(this);
}

export class BinaryExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly e1: Expression,
    public readonly operator: BinaryOperator,
    public readonly e2: Expression
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitBinary(this);
}

export class IfElseExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly boolExpression: Expression,
    public readonly e1: Expression,
    public readonly e2: Expression
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitIfElse(this);
}

export class MatchExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly matchedExpression: Expression,
    public readonly matchingList: VariantPatternToExpr[]
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitMatch(this);
}

export type VariantPatternToExpr = {
  readonly range: Range;
  readonly tag: string;
  readonly tagOrder: number;
  readonly dataVariable?: string;
  readonly expression: Expression;
};

export class LambdaExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: FunctionType,
    public readonly parameters: NameType[],
    public readonly captured: Map<string, Type>,
    public readonly body: Expression
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitLambda(this);
}

export type NameType = { readonly name: string; readonly type: Type };

export class StatementBlockExpression implements Expression {
  constructor(
    public readonly range: Range,
    public readonly type: Type,
    public readonly block: StatementBlock
  ) {}

  accept = <T>(visitor: ExpressionVisitor<T>): T => visitor.visitStatementBlock(this);
}

export type Module = {
  readonly imports: ModuleMembersImport[];
  readonly classDefinitions: ClassDefinition[];
};

export interface Pattern {
  readonly range: Range;
}

export class TuplePattern implements Pattern {
  constructor(
    public readonly range: Range,
    public readonly destructedNames: TupleDestructedName[]
  ) {}
}

export type TupleDestructedName = {
  readonly name?: string;
  readonly range: Range;
};

export class ObjectPattern implements Pattern {
  constructor(
    public readonly range: Range,
    public readonly destructedNames: ObjectDestructedName[]
  ) {}
}

export type ObjectDestructedName = {
  readonly fieldName: string;
  readonly fieldOrder: number;
  readonly alias?: string;
  readonly range: Range;
};

export class VariablePattern implements Pattern {
  constructor(public readonly range: Range, public readonly name: string) {}
}

export class WildCardPattern implements Pattern {
  constructor(public readonly range: Range) {}
}

export class ValStatement implements Node {
  constructor(
    public readonly range: Range,
    public readonly pattern: Pattern,
    public readonly typeAnnotation: Type,
    public readonly assignedExpression: Expression
  ) {}
}

export class StatementBlock implements Node {
  constructor(
    public readonly range: Range,
    public readonly statements: ValStatement[],
    public readonly expression?: Expression
  ) {}
}
