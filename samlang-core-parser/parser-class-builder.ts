import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import ExpressionBuilder from './parser-expression-builder';
import TypeBuilder from './parser-type-builder';
import { tokenRange, contextRange } from './parser-util';

import { functionType, ModuleReference, Range } from 'samlang-core-ast/common-nodes';
import type { SamlangExpression } from 'samlang-core-ast/samlang-expressions';
import type {
  TypeDefinition,
  AnnotatedVariable,
  ClassDefinition,
  ClassMemberDefinition,
} from 'samlang-core-ast/samlang-toplevel';
import type { ModuleErrorCollector } from 'samlang-core-errors';
import type {
  ClassHeaderContext,
  UtilClassHeaderContext,
  ObjTypeContext,
  VariantTypeContext,
  TypeParametersDeclarationContext,
  AnnotatedVariableContext,
  ClassMemberDefinitionContext,
  ClazzContext,
  ExpressionContext,
} from 'samlang-core-parser-generated/PLParser';
import type { PLVisitor } from 'samlang-core-parser-generated/PLVisitor';
import { isNotNull, checkNotNull } from 'samlang-core-utils';

type ModuleName = readonly [string, Range];

class ModuleNameBuilder
  extends AbstractParseTreeVisitor<ModuleName | null>
  implements PLVisitor<ModuleName | null> {
  defaultResult = (): ModuleName | null => null;

  visitClassHeader = (ctx: ClassHeaderContext): ModuleName | null => {
    const symbol = ctx.UpperId().symbol;
    return [checkNotNull(symbol.text), tokenRange(symbol)];
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): ModuleName | null => {
    const symbol = ctx.UpperId().symbol;
    return [checkNotNull(symbol.text), tokenRange(symbol)];
  };
}

const moduleNameBuilder = new ModuleNameBuilder();

const getTypeParameters = (context: TypeParametersDeclarationContext): readonly string[] =>
  context
    .UpperId()
    .map((it) => it.symbol.text)
    .filter(isNotNull);

const getAnnotatedVariable = (
  context: AnnotatedVariableContext,
  typeBuilder: TypeBuilder
): AnnotatedVariable => {
  const parameterNameSymbol = context.LowerId().symbol;
  const variablename = checkNotNull(parameterNameSymbol.text);
  const typeExpression = context.typeAnnotation().typeExpr();
  const type = checkNotNull(typeExpression.accept(typeBuilder));
  return {
    name: variablename,
    nameRange: tokenRange(parameterNameSymbol),
    type,
    typeRange: contextRange(typeExpression),
  };
};

type TypeDefinitionWithTypeParameters = TypeDefinition & {
  readonly typeParameters: readonly string[];
};

class TypeDefinitionBuilder
  extends AbstractParseTreeVisitor<TypeDefinitionWithTypeParameters | null>
  implements PLVisitor<TypeDefinitionWithTypeParameters | null> {
  constructor(
    private readonly range: Range,
    private readonly typeParameters: readonly string[],
    private readonly typeBuilder: TypeBuilder
  ) {
    super();
  }

  // istanbul ignore next
  defaultResult = (): TypeDefinitionWithTypeParameters | null => null;

  visitObjType(ctx: ObjTypeContext): TypeDefinitionWithTypeParameters {
    const rawDeclarations = ctx.objectTypeFieldDeclaration();
    const mappings = rawDeclarations
      .map((c) => {
        const name = c.LowerId().symbol.text;
        const type = c.typeAnnotation().typeExpr().accept(this.typeBuilder);
        if (name == null || type == null) return null;
        const isPublic = c.PRIVATE() == null;
        return [name, { type, isPublic }] as const;
      })
      .filter(isNotNull);
    const names = mappings.map(([name]) => name);
    return {
      range: this.range,
      type: 'object',
      typeParameters: this.typeParameters,
      names,
      mappings: Object.fromEntries(mappings),
    };
  }

  visitVariantType(ctx: VariantTypeContext): TypeDefinitionWithTypeParameters {
    const mappings = ctx
      .variantTypeConstructorDeclaration()
      .map((c) => {
        const name = c.UpperId().symbol.text;
        const type = c.typeExpr().accept(this.typeBuilder);
        if (name == null || type == null) return null;
        return [name, { type, isPublic: false }] as const;
      })
      .filter(isNotNull);
    const names = mappings.map(([name]) => name);
    return {
      range: this.range,
      type: 'variant',
      typeParameters: this.typeParameters,
      names,
      mappings: Object.fromEntries(mappings),
    };
  }
}

class ModuleTypeDefinitionBuilder
  extends AbstractParseTreeVisitor<TypeDefinitionWithTypeParameters | null>
  implements PLVisitor<TypeDefinition | null> {
  constructor(private readonly typeBuilder: TypeBuilder) {
    super();
  }

  defaultResult = (): TypeDefinitionWithTypeParameters | null => null;

  visitClassHeader = (ctx: ClassHeaderContext): TypeDefinitionWithTypeParameters | null => {
    const rawTypeParams = ctx.typeParametersDeclaration();
    const rawTypeDeclaration = ctx.typeDeclaration();
    const typeParameters = rawTypeParams != null ? getTypeParameters(rawTypeParams) : [];
    const range =
      rawTypeParams != null
        ? contextRange(rawTypeParams).union(contextRange(rawTypeDeclaration))
        : contextRange(rawTypeDeclaration);
    return rawTypeDeclaration.accept(
      new TypeDefinitionBuilder(range, typeParameters, this.typeBuilder)
    );
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): TypeDefinitionWithTypeParameters => ({
    range: contextRange(ctx),
    type: 'object',
    typeParameters: [],
    names: [],
    mappings: {},
  });
}

export default class ClassDefinitionBuilder
  extends AbstractParseTreeVisitor<ClassDefinition | null>
  implements PLVisitor<ClassDefinition | null> {
  private readonly expressionBuilder: ExpressionBuilder;
  private readonly typeBuilder: TypeBuilder;
  private readonly moduleTypeDefinitionBuilder: ModuleTypeDefinitionBuilder;

  constructor(
    errorCollector: ModuleErrorCollector,
    resolveClass: (className: string) => ModuleReference
  ) {
    super();
    this.expressionBuilder = new ExpressionBuilder(errorCollector, resolveClass);
    this.typeBuilder = new TypeBuilder(resolveClass);
    this.moduleTypeDefinitionBuilder = new ModuleTypeDefinitionBuilder(this.typeBuilder);
  }

  // istanbul ignore next
  defaultResult = (): ClassDefinition | null => null;

  private buildExpression = (expressionContext: ExpressionContext): SamlangExpression | null =>
    expressionContext.accept(this.expressionBuilder);

  private buildClassMemberDefinition = (
    ctx: ClassMemberDefinitionContext
  ): ClassMemberDefinition | null => {
    const nameSymbol = ctx.LowerId().symbol;
    const name = nameSymbol.text;
    const returnType = ctx.typeExpr()?.accept(this.typeBuilder);
    const body = this.buildExpression(ctx.expression());
    if (name == null || returnType == null || body == null) return null;
    const parameters = ctx
      .annotatedVariable()
      .map((it) => getAnnotatedVariable(it, this.typeBuilder));
    const type = functionType(
      parameters.map((it) => it.type),
      returnType
    );
    const typeParametersDeclaration = ctx.typeParametersDeclaration();
    const typeParameters =
      typeParametersDeclaration != null ? getTypeParameters(typeParametersDeclaration) : [];
    return {
      range: contextRange(ctx),
      isPublic: ctx.PRIVATE() == null,
      isMethod: ctx.METHOD() != null,
      nameRange: tokenRange(nameSymbol),
      name,
      typeParameters,
      type,
      parameters,
      body,
    };
  };

  visitClazz = (ctx: ClazzContext): ClassDefinition | null => {
    const moduleName = ctx.classHeaderDeclaration().accept(moduleNameBuilder);
    const typeDefinitionWithTypeParameters = ctx
      .classHeaderDeclaration()
      .accept(this.moduleTypeDefinitionBuilder);
    if (moduleName == null || typeDefinitionWithTypeParameters == null) {
      return null;
    }
    const [name, nameRange] = moduleName;
    const { typeParameters, ...typeDefinition } = typeDefinitionWithTypeParameters;
    return {
      range: contextRange(ctx),
      nameRange,
      name,
      typeParameters,
      typeDefinition,
      members: ctx.classMemberDefinition().map(this.buildClassMemberDefinition).filter(isNotNull),
    };
  };
}
