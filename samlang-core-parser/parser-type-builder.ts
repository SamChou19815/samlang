import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import {
  Type,
  IdentifierType,
  TupleType,
  FunctionType,
  unitType,
  boolType,
  intType,
  stringType,
  identifierType,
  tupleType,
  functionType,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';
import type {
  SingleIdentifierTypeContext,
  TupleTypeContext,
  FunctionTypeContext,
  FunctionTypeNoArgContext,
} from 'samlang-core-parser-generated/PLParser';
import type { PLVisitor } from 'samlang-core-parser-generated/PLVisitor';
import { isNotNull, checkNotNull } from 'samlang-core-utils';

export default class TypeBuilder
  extends AbstractParseTreeVisitor<Type | null>
  implements PLVisitor<Type | null> {
  constructor(private readonly resolveClass: (className: string) => ModuleReference) {
    super();
  }

  defaultResult = (): Type | null => null;

  visitUnitType = (): Type => unitType;

  visitBoolType = (): Type => boolType;

  visitIntType = (): Type => intType;

  visitStrType = (): Type => stringType;

  visitSingleIdentifierType = (ctx: SingleIdentifierTypeContext): IdentifierType | null => {
    const identifier = checkNotNull(ctx.UpperId().symbol.text);
    const typeParametersContext = ctx.typeParameters();
    if (typeParametersContext == null) {
      return identifierType(this.resolveClass(identifier), identifier);
    }
    const typeArguments = typeParametersContext
      .typeExpr()
      .map((it) => it.accept(this))
      .filter(isNotNull);
    return identifierType(this.resolveClass(identifier), identifier, typeArguments);
  };

  visitTupleType = (ctx: TupleTypeContext): TupleType =>
    tupleType(
      ctx
        .typeExpr()
        .map((it) => it.accept(this))
        .filter(isNotNull)
    );

  visitFunctionType = (ctx: FunctionTypeContext): FunctionType | null => {
    const types = ctx.typeExpr();
    const returnType = types[types.length - 1]?.accept(this);
    // istanbul ignore next
    if (returnType == null) return null;
    const argumentTypes = types
      .slice(0, types.length - 1)
      .map((it) => it.accept(this))
      .filter(isNotNull);
    return functionType(argumentTypes, returnType);
  };

  visitFunctionTypeNoArg = (ctx: FunctionTypeNoArgContext): FunctionType | null => {
    const returnType = ctx.typeExpr().accept(this);
    // istanbul ignore next
    if (returnType == null) return null;
    return functionType([], returnType);
  };
}
