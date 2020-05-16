import { PLVisitor } from './generated/PLVisitor';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import {
  SingleIdentifierTypeContext,
  TupleTypeContext,
  FunctionTypeContext,
} from './generated/PLParser';
import { Type, PrimitiveType, IdentifierType, TupleType, FunctionType } from './ast';
import { throwParserError } from './parser-util';

class TypeBuilder extends AbstractParseTreeVisitor<Type> implements PLVisitor<Type> {
  defaultResult = (): Type => throwParserError();

  visitUnitType = (): Type => new PrimitiveType('unit');
  visitBoolType = (): Type => new PrimitiveType('bool');
  visitIntType = (): Type => new PrimitiveType('int');
  visitStrType = (): Type => new PrimitiveType('string');

  visitSingleIdentifierType = (ctx: SingleIdentifierTypeContext): Type => {
    const identifier = ctx.UpperId().symbol.text ?? throwParserError();
    const typeParametersContext = ctx.typeParameters();
    if (typeParametersContext == null) {
      return new IdentifierType(identifier, []);
    }
    const typeArguments = typeParametersContext.typeExpr().map((it) => it.accept(this));
    return new IdentifierType(identifier, typeArguments);
  };

  visitTupleType = (ctx: TupleTypeContext): Type =>
    new TupleType(ctx.typeExpr().map((it) => it.accept(this)));

  visitFunctionType = (ctx: FunctionTypeContext): Type => {
    const types = ctx.typeExpr();
    const argumentTypes = types.slice(0, types.length - 1).map((it) => it.accept(this));
    const returnType = types[types.length - 1].accept(this);
    return new FunctionType(argumentTypes, returnType);
  };
}

const typeBuilder = new TypeBuilder();
export default typeBuilder;
