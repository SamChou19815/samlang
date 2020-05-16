import { PLVisitor } from './generated/PLVisitor';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import {
  ClassHeaderContext,
  UtilClassHeaderContext,
  ObjTypeContext,
  VariantTypeContext,
  TypeParametersDeclarationContext,
  ClassMemberDefinitionContext,
  ClazzContext,
  ExpressionContext,
} from './generated/PLParser';
import {
  TsRange,
  TsFunctionType,
  TsTypeDefinition,
  TsMemberDefinition,
  TsClassDefinition,
  TsExpression,
} from './ast';
import expressionBuilder from './expression-builder';
import { tokenRange, contextRange, rangeUnion, throwParserError } from './parser-util';
import typeBuilder from './type-builder';

class ModuleNameBuilder extends AbstractParseTreeVisitor<[boolean, string, TsRange]>
  implements PLVisitor<[boolean, string, TsRange]> {
  defaultResult = (): [boolean, string, TsRange] => throwParserError();

  visitClassHeader = (ctx: ClassHeaderContext): [boolean, string, TsRange] => {
    const isPublic = ctx.PRIVATE() == null;
    const symbol = ctx.UpperId().symbol;
    return [isPublic, symbol.text ?? throwParserError(), tokenRange(symbol)];
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): [boolean, string, TsRange] => {
    const isPublic = ctx.PRIVATE() == null;
    const symbol = ctx.UpperId().symbol;
    return [isPublic, symbol.text ?? throwParserError(), tokenRange(symbol)];
  };
}

const moduleNameBuilder = new ModuleNameBuilder();

const getTypeParameters = (context: TypeParametersDeclarationContext): string[] =>
  context.UpperId().map((it) => it.symbol.text ?? throwParserError());

class TypeDefinitionBuilder extends AbstractParseTreeVisitor<TsTypeDefinition>
  implements PLVisitor<TsTypeDefinition> {
  constructor(private readonly range: TsRange, private readonly typeParameters: string[]) {
    super();
  }

  defaultResult = (): TsTypeDefinition => throwParserError();

  visitObjType(ctx: ObjTypeContext): TsTypeDefinition {
    const rawDeclarations = ctx.objectTypeFieldDeclaration();
    const mappings = rawDeclarations.map((c) => {
      const name = c.LowerId().symbol.text ?? throwParserError();
      const isPublic = c.PRIVATE() == null;
      const type = c.typeAnnotation().typeExpr().accept(typeBuilder);
      return [name, { type, isPublic }] as const;
    });
    const names = mappings.map(([name]) => name);
    return {
      range: this.range,
      type: 'object',
      typeParameters: this.typeParameters,
      names,
      mappings: mappings.map(([key, value]) => ({ key, value })),
    };
  }

  visitVariantType(ctx: VariantTypeContext): TsTypeDefinition {
    const mappings = ctx.variantTypeConstructorDeclaration().map((c) => {
      const name = c.UpperId().symbol.text ?? throwParserError();
      const type = c.typeExpr().accept(typeBuilder);
      return [name, { type, isPublic: false }] as const;
    });
    const names = mappings.map(([name]) => name);
    return {
      range: this.range,
      type: 'variant',
      typeParameters: this.typeParameters,
      names,
      mappings: mappings.map(([key, value]) => ({ key, value })),
    };
  }
}

class ModuleTypeDefinitionBuilder extends AbstractParseTreeVisitor<TsTypeDefinition>
  implements PLVisitor<TsTypeDefinition> {
  defaultResult = (): TsTypeDefinition => throwParserError();

  visitClassHeader = (ctx: ClassHeaderContext): TsTypeDefinition => {
    const rawTypeParams = ctx.typeParametersDeclaration();
    const rawTypeDeclaration = ctx.typeDeclaration();
    const typeParameters = rawTypeParams != null ? getTypeParameters(rawTypeParams) : [];
    const range =
      rawTypeParams != null
        ? rangeUnion(contextRange(rawTypeParams), contextRange(rawTypeDeclaration))
        : contextRange(rawTypeDeclaration);
    return rawTypeDeclaration.accept(new TypeDefinitionBuilder(range, typeParameters));
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): TsTypeDefinition => ({
    range: contextRange(ctx),
    type: 'object',
    typeParameters: [],
    names: [],
    mappings: [],
  });
}

const moduleTypeDefinitionBuilder = new ModuleTypeDefinitionBuilder();

class ClassBuilder extends AbstractParseTreeVisitor<TsClassDefinition>
  implements PLVisitor<TsClassDefinition> {
  defaultResult = (): TsClassDefinition => throwParserError();

  private buildExpression = (expressionContext: ExpressionContext): TsExpression =>
    expressionContext.accept(expressionBuilder);

  private buildClassMemberDefinition = (ctx: ClassMemberDefinitionContext): TsMemberDefinition => {
    const nameSymbol = ctx.LowerId().symbol;
    const parameters = ctx.annotatedVariable().map((annotatedVariable) => {
      const parameterNameSymbol = annotatedVariable.LowerId().symbol;
      const typeExpression = annotatedVariable.typeAnnotation().typeExpr();
      return {
        name: parameterNameSymbol.text ?? throwParserError(),
        nameRange: tokenRange(parameterNameSymbol),
        type: typeExpression.accept(typeBuilder),
        typeRange: contextRange(typeExpression),
      };
    });
    const type = new TsFunctionType(
      parameters.map((it) => it.type),
      ctx.typeExpr()?.accept(typeBuilder) ?? throwParserError()
    );
    const body = this.buildExpression(ctx.expression());
    const typeParametersDeclaration = ctx.typeParametersDeclaration();
    return {
      range: contextRange(ctx),
      isPublic: ctx.PRIVATE() == null,
      isMethod: ctx.METHOD() != null,
      nameRange: tokenRange(nameSymbol),
      name: nameSymbol.text ?? throwParserError(),
      typeParameters:
        typeParametersDeclaration != null ? getTypeParameters(typeParametersDeclaration) : [],
      type: type,
      parameters: parameters,
      body: body,
    };
  };

  visitClazz = (ctx: ClazzContext): TsClassDefinition => {
    const [isPublic, name, nameRange] = ctx.classHeaderDeclaration().accept(moduleNameBuilder);
    return {
      range: contextRange(ctx),
      nameRange,
      name,
      isPublic,
      typeDefinition: ctx.classHeaderDeclaration().accept(moduleTypeDefinitionBuilder),
      members: ctx.classMemberDefinition().map(this.buildClassMemberDefinition),
    };
  };
}

const classBuilder = new ClassBuilder();
export default classBuilder;
