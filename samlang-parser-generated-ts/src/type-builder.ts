import { PLVisitor } from './generated/PLVisitor';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import {
  SingleIdentifierTypeContext,
  TupleTypeContext,
  FunctionTypeContext,
} from './generated/PLParser';
import { TsType, TsPrimitiveType, TsIdentifierType, TsTupleType, TsFunctionType } from './ast';
import { throwParserError } from './parser-util';

class TypeBuilder extends AbstractParseTreeVisitor<TsType> implements PLVisitor<TsType> {
  defaultResult = (): TsType => null!;

  visitUnitType = (): TsType => new TsPrimitiveType('unit');
  visitBoolType = (): TsType => new TsPrimitiveType('bool');
  visitIntType = (): TsType => new TsPrimitiveType('int');
  visitStrType = (): TsType => new TsPrimitiveType('string');

  visitSingleIdentifierType = (ctx: SingleIdentifierTypeContext): TsType => {
    const identifier = ctx.UpperId().symbol.text ?? throwParserError();
    const typeParametersContext = ctx.typeParameters();
    if (typeParametersContext == null) {
      return new TsIdentifierType(identifier, []);
    }
    const typeArguments = typeParametersContext.typeExpr().map((it) => it.accept(this));
    return new TsIdentifierType(identifier, typeArguments);
  };

  visitTupleType = (ctx: TupleTypeContext): TsType =>
    new TsTupleType(ctx.typeExpr().map((it) => it.accept(this)));

  visitFunctionType = (ctx: FunctionTypeContext): TsType => {
    const types = ctx.typeExpr();
    const argumentTypes = types.slice(0, types.length - 1).map((it) => it.accept(this));
    const returnType = types[types.length - 1].accept(this);
    return new TsFunctionType(argumentTypes, returnType);
  };
}

const typeBuilder = new TypeBuilder();
export default typeBuilder;
