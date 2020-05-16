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

export class TsLiteral {
  constructor(public readonly type: 'int' | 'string' | 'bool', public readonly value: string) {}
}

export type TsLocation = { readonly moduleReference: ModuleReference; readonly range: TsRange };

export interface TsModuleMembersImport extends TsNode {
  readonly importedMembers: TsImportedMember[];
  readonly importedModule: ModuleReference;
  readonly importedModuleRange: TsRange;
}

export type TsImportedMember = { readonly name: string; readonly range: TsRange };

export type ModuleReference = { readonly parts: string[] };

export interface TsNode {
  readonly range: TsRange;
}

export type TsPosition = { readonly line: number; readonly column: number };

export type TsRange = { readonly start: TsPosition; readonly end: TsPosition };

export type TsStringMapElement<V> = { readonly key: string; readonly value: V };
export type TsStringMap<V> = TsStringMapElement<V>[];

export interface TsType {
  accept<T>(visitor: TypeVisitor<T>): T;
}

export interface TypeVisitor<T> {
  visitPrimitive(type: TsPrimitiveType): T;
  visitIdentifier(type: TsIdentifierType): T;
  visitTuple(type: TsTupleType): T;
  visitFunction(type: TsFunctionType): T;
  visitUndecided(type: TsUndecidedType): T;
}

export class TsPrimitiveType implements TsType {
  constructor(public readonly name: 'unit' | 'bool' | 'int' | 'string') {}
  accept<T>(visitor: TypeVisitor<T>): T {
    return visitor.visitPrimitive(this);
  }
}

export class TsIdentifierType implements TsType {
  constructor(public readonly identifier: string, public readonly typeArguments: TsType[]) {}
  accept<T>(visitor: TypeVisitor<T>): T {
    return visitor.visitIdentifier(this);
  }
}

export class TsTupleType implements TsType {
  constructor(public readonly mappings: TsType[]) {}
  accept<T>(visitor: TypeVisitor<T>): T {
    return visitor.visitTuple(this);
  }
}

export class TsFunctionType implements TsType {
  constructor(public readonly argumentTypes: TsType[], public readonly returnType: TsType) {}
  accept<T>(visitor: TypeVisitor<T>): T {
    return visitor.visitFunction(this);
  }
}

export class TsUndecidedType implements TsType {
  accept<T>(visitor: TypeVisitor<T>): T {
    return visitor.visitUndecided(this);
  }
}

export interface TsTypeDefinition extends TsNode {
  readonly type: 'object' | 'variant';
  readonly typeParameters: string[];
  readonly names: string[];
  readonly mappings: TsStringMap<TsFieldType>;
}

export type TsFieldType = { readonly type: TsType; readonly isPublic: boolean };

// lang

export interface TsClassDefinition extends TsNode {
  readonly nameRange: TsRange;
  readonly name: string;
  readonly isPublic: boolean;
  readonly typeDefinition: TsTypeDefinition;
  readonly members: TsMemberDefinition[];
}

export interface TsMemberDefinition extends TsNode {
  readonly isPublic: boolean;
  readonly isMethod: boolean;
  readonly nameRange: TsRange;
  readonly name: string;
  readonly typeParameters: string[];
  readonly type: TsFunctionType;
  readonly parameters: TsMemberDefinitionParameter[];
  readonly body: TsExpression;
}

export type TsMemberDefinitionParameter = {
  readonly name: string;
  readonly nameRange: TsRange;
  readonly type: TsType;
  readonly typeRange: TsRange;
};

export interface TsExpression extends TsNode {
  readonly type: TsType;
  accept<T>(visitor: TsExpressionVisitor<T>): T;
}

export interface TsExpressionVisitor<T> {
  visitLiteral(expression: TsLiteralExpression): T;
  visitThis(expression: TsThisExpression): T;
  visitVariable(expression: TsVariableExpression): T;
  visitClassMember(expression: TsClassMemberExpression): T;
  visitTupleConstructor(expression: TsTupleConstructorExpression): T;
  visitObjectConstructor(expression: TsObjectConstructorExpression): T;
  visitVariantConstructor(expression: TsVariantConstructorExpression): T;
  visitFieldAccess(expression: TsFieldAccessExpression): T;
  visitMethodAccess(expression: TsMethodAccessExpression): T;
  visitUnary(expression: TsUnaryExpression): T;
  visitPanic(expression: TsPanicExpression): T;
  visitBuiltInFunctionCall(expression: TsBuiltInFunctionCallExpression): T;
  visitFunctionApplication(expression: TsFunctionApplicationExpression): T;
  visitBinary(expression: TsBinaryExpression): T;
  visitIfElse(expression: TsIfElseExpression): T;
  visitMatch(expression: TsMatchExpression): T;
  visitLambda(expression: TsLambdaExpression): T;
  visitStatementBlock(expression: TsStatementBlockExpression): T;
}

export class TsLiteralExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly literal: TsLiteral
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitLiteral(this);
  }
}

export class TsThisExpression implements TsExpression {
  constructor(public readonly range: TsRange, public readonly type: TsType) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitThis(this);
  }
}

export class TsVariableExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly name: string
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitVariable(this);
  }
}

export class TsClassMemberExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly typeArguments: TsType[],
    public readonly className: string,
    public readonly classNameRange: TsRange,
    public readonly memberName: string
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitClassMember(this);
  }
}

export class TsTupleConstructorExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly expressionList: TsExpression[]
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitTupleConstructor(this);
  }
}

export class TsObjectConstructorExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly fieldDeclarations: TsFieldConstructor[]
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitObjectConstructor(this);
  }
}

export interface TsFieldConstructor {
  readonly range: TsRange;
  readonly type: TsType;
  readonly name: string;
  readonly expression?: TsExpression;
}

export class TsVariantConstructorExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly tag: string,
    public readonly tagOrder: number,
    public readonly data: TsExpression
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitVariantConstructor(this);
  }
}

export class TsFieldAccessExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly expression: TsExpression,
    public readonly fieldName: string,
    public readonly fieldOrder: number
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitFieldAccess(this);
  }
}

export class TsMethodAccessExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly expression: TsExpression,
    public readonly methodName: string
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitMethodAccess(this);
  }
}

export class TsUnaryExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly operator: '!' | '-',
    public readonly expression: TsExpression
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitUnary(this);
  }
}

export class TsPanicExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly expression: TsExpression
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitPanic(this);
  }
}

export class TsBuiltInFunctionCallExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly functionName: 'stringToInt' | 'intToString' | 'println',
    public readonly argumentExpression: TsExpression
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitBuiltInFunctionCall(this);
  }
}

export class TsFunctionApplicationExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly functionExpression: TsExpression,
    public readonly functionArguments: TsExpression[]
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitFunctionApplication(this);
  }
}

export class TsBinaryExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly e1: TsExpression,
    public readonly operator: BinaryOperator,
    public readonly e2: TsExpression
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitBinary(this);
  }
}

export class TsIfElseExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly boolExpression: TsExpression,
    public readonly e1: TsExpression,
    public readonly e2: TsExpression
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitIfElse(this);
  }
}

export class TsMatchExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly matchedExpression: TsExpression,
    public readonly matchingList: TsVariantPatternToExpr[]
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitMatch(this);
  }
}

export type TsVariantPatternToExpr = {
  readonly range: TsRange;
  readonly tag: string;
  readonly tagOrder: number;
  readonly dataVariable?: string;
  readonly expression: TsExpression;
};

export class TsLambdaExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly parameters: NameType[],
    public readonly body: TsExpression
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitLambda(this);
  }
}

export type NameType = { readonly name: string; readonly type: TsType };

export class TsStatementBlockExpression implements TsExpression {
  constructor(
    public readonly range: TsRange,
    public readonly type: TsType,
    public readonly block: TsStatementBlock
  ) {}

  accept<T>(visitor: TsExpressionVisitor<T>): T {
    return visitor.visitStatementBlock(this);
  }
}

export type TsModule = {
  readonly imports: TsModuleMembersImport[];
  readonly classDefinitions: TsClassDefinition[];
};

export interface TsPattern {
  readonly range: TsRange;
  accept<T>(visitor: TsPatternVisitor<T>): T;
}

export interface TsPatternVisitor<T> {
  visitTuple(pattern: TsTuplePattern): T;
  visitObject(pattern: TsObjectPattern): T;
  visitVariable(pattern: TsVariablePattern): T;
  visitWildcard(pattern: TsWildCardPattern): T;
}

export class TsTuplePattern implements TsPattern {
  constructor(
    public readonly range: TsRange,
    public readonly destructedNames: TsTupleDestructedName[]
  ) {}

  accept<T>(visitor: TsPatternVisitor<T>): T {
    return visitor.visitTuple(this);
  }
}

export type TsTupleDestructedName = {
  readonly name?: string;
  readonly range: TsRange;
};

export class TsObjectPattern implements TsPattern {
  constructor(
    public readonly range: TsRange,
    public readonly destructedNames: TsObjectDestructedName[]
  ) {}

  accept<T>(visitor: TsPatternVisitor<T>): T {
    return visitor.visitObject(this);
  }
}

export type TsObjectDestructedName = {
  readonly fieldName: string;
  readonly fieldOrder: number;
  readonly alias?: string;
  readonly range: TsRange;
};

export class TsVariablePattern implements TsPattern {
  constructor(public readonly range: TsRange, public readonly name: string) {}

  accept<T>(visitor: TsPatternVisitor<T>): T {
    return visitor.visitVariable(this);
  }
}

export class TsWildCardPattern implements TsPattern {
  constructor(public readonly range: TsRange) {}

  accept<T>(visitor: TsPatternVisitor<T>): T {
    return visitor.visitWildcard(this);
  }
}

export class TsValStatement implements TsNode {
  constructor(
    public readonly range: TsRange,
    public readonly pattern: TsPattern,
    public readonly typeAnnotation: TsType,
    public readonly assignedExpression: TsExpression
  ) {}
}

export class TsStatementBlock implements TsNode {
  constructor(
    public readonly range: TsRange,
    public readonly statements: TsValStatement[],
    public readonly expression?: TsExpression
  ) {}
}
