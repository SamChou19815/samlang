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
} from '../ast/common/types';
import {
  SingleIdentifierTypeContext,
  TupleTypeContext,
  FunctionTypeContext,
} from './generated/PLParser';
import { PLVisitor } from './generated/PLVisitor';

class TypeBuilder extends AbstractParseTreeVisitor<Type | null> implements PLVisitor<Type | null> {
  defaultResult = (): Type | null => null;

  visitUnitType = (): Type => unitType;

  visitBoolType = (): Type => boolType;

  visitIntType = (): Type => intType;

  visitStrType = (): Type => stringType;

  visitSingleIdentifierType = (ctx: SingleIdentifierTypeContext): IdentifierType | null => {
    const identifier = ctx.UpperId().symbol.text;
    if (identifier == null) {
      return null;
    }
    const typeParametersContext = ctx.typeParameters();
    if (typeParametersContext == null) {
      return identifierType(identifier);
    }
    const typeArguments = typeParametersContext
      .typeExpr()
      .map((it) => it.accept(this))
      .filter((it): it is Type => Boolean(it));
    return identifierType(identifier, typeArguments);
  };

  visitTupleType = (ctx: TupleTypeContext): TupleType =>
    tupleType(
      ctx
        .typeExpr()
        .map((it) => it.accept(this))
        .filter((it): it is Type => Boolean(it))
    );

  visitFunctionType = (ctx: FunctionTypeContext): FunctionType | null => {
    const types = ctx.typeExpr();
    const returnType = types[types.length - 1].accept(this);
    if (returnType == null) {
      return null;
    }
    const argumentTypes = types
      .slice(0, types.length - 1)
      .map((it) => it.accept(this))
      .filter((it): it is Type => Boolean(it));
    return functionType(argumentTypes, returnType);
  };
}

const typeBuilder = new TypeBuilder();
export default typeBuilder;
