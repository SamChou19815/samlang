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
  Range,
  FunctionType,
  TypeDefinition,
  MemberDefinition,
  ClassDefinition,
  Expression,
} from './ast';
import expressionBuilder from './expression-builder';
import { tokenRange, contextRange, rangeUnion, throwParserError } from './parser-util';
import typeBuilder from './type-builder';

class ModuleNameBuilder extends AbstractParseTreeVisitor<[boolean, string, Range]>
  implements PLVisitor<[boolean, string, Range]> {
  defaultResult = (): [boolean, string, Range] => throwParserError();

  visitClassHeader = (ctx: ClassHeaderContext): [boolean, string, Range] => {
    const isPublic = ctx.PRIVATE() == null;
    const symbol = ctx.UpperId().symbol;
    return [isPublic, symbol.text ?? throwParserError(), tokenRange(symbol)];
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): [boolean, string, Range] => {
    const isPublic = ctx.PRIVATE() == null;
    const symbol = ctx.UpperId().symbol;
    return [isPublic, symbol.text ?? throwParserError(), tokenRange(symbol)];
  };
}

const moduleNameBuilder = new ModuleNameBuilder();

const getTypeParameters = (context: TypeParametersDeclarationContext): string[] =>
  context.UpperId().map((it) => it.symbol.text ?? throwParserError());

class TypeDefinitionBuilder extends AbstractParseTreeVisitor<TypeDefinition>
  implements PLVisitor<TypeDefinition> {
  constructor(private readonly range: Range, private readonly typeParameters: string[]) {
    super();
  }

  defaultResult = (): TypeDefinition => throwParserError();

  visitObjType(ctx: ObjTypeContext): TypeDefinition {
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

  visitVariantType(ctx: VariantTypeContext): TypeDefinition {
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

class ModuleTypeDefinitionBuilder extends AbstractParseTreeVisitor<TypeDefinition>
  implements PLVisitor<TypeDefinition> {
  defaultResult = (): TypeDefinition => throwParserError();

  visitClassHeader = (ctx: ClassHeaderContext): TypeDefinition => {
    const rawTypeParams = ctx.typeParametersDeclaration();
    const rawTypeDeclaration = ctx.typeDeclaration();
    const typeParameters = rawTypeParams != null ? getTypeParameters(rawTypeParams) : [];
    const range =
      rawTypeParams != null
        ? rangeUnion(contextRange(rawTypeParams), contextRange(rawTypeDeclaration))
        : contextRange(rawTypeDeclaration);
    return rawTypeDeclaration.accept(new TypeDefinitionBuilder(range, typeParameters));
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): TypeDefinition => ({
    range: contextRange(ctx),
    type: 'object',
    typeParameters: [],
    names: [],
    mappings: [],
  });
}

const moduleTypeDefinitionBuilder = new ModuleTypeDefinitionBuilder();

class ClassBuilder extends AbstractParseTreeVisitor<ClassDefinition>
  implements PLVisitor<ClassDefinition> {
  defaultResult = (): ClassDefinition => throwParserError();

  private buildExpression = (expressionContext: ExpressionContext): Expression =>
    expressionContext.accept(expressionBuilder);

  private buildClassMemberDefinition = (ctx: ClassMemberDefinitionContext): MemberDefinition => {
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
    const type = new FunctionType(
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

  visitClazz = (ctx: ClazzContext): ClassDefinition => {
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
