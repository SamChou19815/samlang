import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import type { ModuleErrorCollector } from '../errors';
import type {
  ClassHeaderContext,
  UtilClassHeaderContext,
  ObjTypeContext,
  VariantTypeContext,
  TypeParametersDeclarationContext,
  AnnotatedVariableContext,
  ClassMemberDefinitionContext,
  ClassMemberDeclarationContext,
  ClazzContext,
  InterfazeContext,
  ExpressionContext,
} from './generated/PLParser';
import type { PLVisitor } from './generated/PLVisitor';
import ExpressionBuilder from './parser-expression-builder';
import typeBuilder from './parser-type-builder';
import { tokenRange, contextRange } from './parser-util';

import { functionType, Range } from 'samlang-core-ast/common-nodes';
import type { SamlangExpression } from 'samlang-core-ast/samlang-expressions';
import type {
  TypeDefinition,
  AnnotatedVariable,
  ClassInterface,
  ClassDefinition,
  ClassMemberDeclaration,
  ClassMemberDefinition,
} from 'samlang-core-ast/samlang-toplevel';
import { isNotNull, assertNotNull } from 'samlang-core-utils';

type ModuleName = readonly [boolean, string, Range];

class ModuleNameBuilder
  extends AbstractParseTreeVisitor<ModuleName | null>
  implements PLVisitor<ModuleName | null> {
  defaultResult = (): ModuleName | null => null;

  visitClassHeader = (ctx: ClassHeaderContext): ModuleName | null => {
    const isPublic = ctx.PRIVATE() == null;
    const symbol = ctx.UpperId().symbol;
    const name = symbol.text;
    assertNotNull(name);
    return [isPublic, name, tokenRange(symbol)];
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): ModuleName | null => {
    const isPublic = ctx.PRIVATE() == null;
    const symbol = ctx.UpperId().symbol;
    const name = symbol.text;
    assertNotNull(name);
    return [isPublic, name, tokenRange(symbol)];
  };
}

const moduleNameBuilder = new ModuleNameBuilder();

const getTypeParameters = (context: TypeParametersDeclarationContext): readonly string[] =>
  context
    .UpperId()
    .map((it) => it.symbol.text)
    .filter(isNotNull);

const getAnnotatedVariable = (context: AnnotatedVariableContext): AnnotatedVariable => {
  const parameterNameSymbol = context.LowerId().symbol;
  const variablename = parameterNameSymbol.text;
  const typeExpression = context.typeAnnotation().typeExpr();
  const type = typeExpression.accept(typeBuilder);
  assertNotNull(variablename);
  assertNotNull(type);
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
  constructor(private readonly range: Range, private readonly typeParameters: readonly string[]) {
    super();
  }

  // istanbul ignore next
  defaultResult = (): TypeDefinitionWithTypeParameters | null => null;

  visitObjType(ctx: ObjTypeContext): TypeDefinitionWithTypeParameters {
    const rawDeclarations = ctx.objectTypeFieldDeclaration();
    const mappings = rawDeclarations
      .map((c) => {
        const name = c.LowerId().symbol.text;
        const type = c.typeAnnotation().typeExpr().accept(typeBuilder);
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
        const type = c.typeExpr().accept(typeBuilder);
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
  defaultResult = (): TypeDefinitionWithTypeParameters | null => null;

  visitClassHeader = (ctx: ClassHeaderContext): TypeDefinitionWithTypeParameters | null => {
    const rawTypeParams = ctx.typeParametersDeclaration();
    const rawTypeDeclaration = ctx.typeDeclaration();
    const typeParameters = rawTypeParams != null ? getTypeParameters(rawTypeParams) : [];
    const range =
      rawTypeParams != null
        ? contextRange(rawTypeParams).union(contextRange(rawTypeDeclaration))
        : contextRange(rawTypeDeclaration);
    return rawTypeDeclaration.accept(new TypeDefinitionBuilder(range, typeParameters));
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): TypeDefinitionWithTypeParameters => ({
    range: contextRange(ctx),
    type: 'object',
    typeParameters: [],
    names: [],
    mappings: {},
  });
}

const moduleTypeDefinitionBuilder = new ModuleTypeDefinitionBuilder();

class ClassInterfaceBuilder
  extends AbstractParseTreeVisitor<ClassInterface | null>
  implements PLVisitor<ClassInterface | null> {
  // istanbul ignore next
  defaultResult = (): ClassInterface | null => null;

  private buildClassMemberDeclaration = (
    ctx: ClassMemberDeclarationContext
  ): ClassMemberDeclaration | null => {
    const nameSymbol = ctx.LowerId().symbol;
    const name = nameSymbol.text;
    const returnType = ctx.typeExpr()?.accept(typeBuilder);
    if (name == null || returnType == null) return null;
    const parameters = ctx.annotatedVariable().map(getAnnotatedVariable);
    const type = functionType(
      parameters.map((it) => it.type),
      returnType
    );
    const typeParametersDeclaration = ctx.typeParametersDeclaration();
    return {
      range: contextRange(ctx),
      isPublic: true,
      isMethod: true,
      nameRange: tokenRange(nameSymbol),
      name,
      typeParameters:
        typeParametersDeclaration != null ? getTypeParameters(typeParametersDeclaration) : [],
      type,
      parameters,
    };
  };

  visitInterfaze = (ctx: InterfazeContext): ClassInterface | null => {
    const typeParametersContext = ctx.typeParametersDeclaration();
    const typeParameters =
      typeParametersContext == null ? [] : getTypeParameters(typeParametersContext);
    return {
      range: contextRange(ctx),
      nameRange: tokenRange(ctx.UpperId().symbol),
      name: ctx.UpperId().text,
      isPublic: ctx.PRIVATE() == null,
      typeParameters,
      members: ctx.classMemberDeclaration().map(this.buildClassMemberDeclaration).filter(isNotNull),
    };
  };
}

export const classInterfaceBuilder = new ClassInterfaceBuilder();

export class ClassDefinitionBuilder
  extends AbstractParseTreeVisitor<ClassDefinition | null>
  implements PLVisitor<ClassDefinition | null> {
  private readonly expressionBuilder: ExpressionBuilder;

  constructor(errorCollector: ModuleErrorCollector) {
    super();
    this.expressionBuilder = new ExpressionBuilder(errorCollector);
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
    const returnType = ctx.typeExpr()?.accept(typeBuilder);
    const body = this.buildExpression(ctx.expression());
    if (name == null || returnType == null || body == null) return null;
    const parameters = ctx.annotatedVariable().map(getAnnotatedVariable);
    const type = functionType(
      parameters.map((it) => it.type),
      returnType
    );
    const typeParametersDeclaration = ctx.typeParametersDeclaration();
    return {
      range: contextRange(ctx),
      isPublic: ctx.PRIVATE() == null,
      isMethod: ctx.METHOD() != null,
      nameRange: tokenRange(nameSymbol),
      name,
      typeParameters:
        typeParametersDeclaration != null ? getTypeParameters(typeParametersDeclaration) : [],
      type,
      parameters,
      body,
    };
  };

  visitClazz = (ctx: ClazzContext): ClassDefinition | null => {
    const moduleName = ctx.classHeaderDeclaration().accept(moduleNameBuilder);
    const typeDefinitionWithTypeParameters = ctx
      .classHeaderDeclaration()
      .accept(moduleTypeDefinitionBuilder);
    if (moduleName == null || typeDefinitionWithTypeParameters == null) {
      return null;
    }
    const [isPublic, name, nameRange] = moduleName;
    const { typeParameters, ...typeDefinition } = typeDefinitionWithTypeParameters;
    return {
      range: contextRange(ctx),
      nameRange,
      name,
      isPublic,
      typeParameters,
      typeDefinition,
      members: ctx.classMemberDefinition().map(this.buildClassMemberDefinition).filter(isNotNull),
    };
  };
}
