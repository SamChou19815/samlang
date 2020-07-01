import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import Range from '../ast/common/range';
import { TypeDefinition, AnnotatedParameter } from '../ast/common/structs';
import { Type, functionType } from '../ast/common/types';
import { ClassDefinition, ClassMemberDefinition } from '../ast/lang/samlang-classes';
import { SamlangExpression } from '../ast/lang/samlang-expressions';
import type { ModuleErrorCollector } from '../errors/error-collector';
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
import { PLVisitor } from './generated/PLVisitor';
import ExpressionBuilder from './parser-expression-builder';
import typeBuilder from './parser-type-builder';
import { tokenRange, contextRange } from './parser-util';

type ModuleName = readonly [boolean, string, Range];

class ModuleNameBuilder extends AbstractParseTreeVisitor<ModuleName | null>
  implements PLVisitor<ModuleName | null> {
  defaultResult = (): ModuleName | null => null;

  visitClassHeader = (ctx: ClassHeaderContext): ModuleName | null => {
    const isPublic = ctx.PRIVATE() == null;
    const symbol = ctx.UpperId().symbol;
    const name = symbol.text;
    if (name == null) {
      return null;
    }
    return [isPublic, name, tokenRange(symbol)];
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): ModuleName | null => {
    const isPublic = ctx.PRIVATE() == null;
    const symbol = ctx.UpperId().symbol;
    const name = symbol.text;
    if (name == null) {
      return null;
    }
    return [isPublic, name, tokenRange(symbol)];
  };
}

const moduleNameBuilder = new ModuleNameBuilder();

const getTypeParameters = (context: TypeParametersDeclarationContext): readonly string[] =>
  context
    .UpperId()
    .map((it) => it.symbol.text)
    .filter((it): it is string => Boolean(it));

class TypeDefinitionBuilder extends AbstractParseTreeVisitor<TypeDefinition | null>
  implements PLVisitor<TypeDefinition | null> {
  constructor(private readonly range: Range, private readonly typeParameters: readonly string[]) {
    super();
  }

  defaultResult = (): TypeDefinition | null => null;

  visitObjType(ctx: ObjTypeContext): TypeDefinition {
    const rawDeclarations = ctx.objectTypeFieldDeclaration();
    const mappings = rawDeclarations
      .map((c) => {
        const name = c.LowerId().symbol.text;
        const type = c.typeAnnotation().typeExpr().accept(typeBuilder);
        if (name == null || type == null) {
          return null;
        }
        const isPublic = c.PRIVATE() == null;
        return [name, { type, isPublic }] as const;
      })
      .filter((it): it is readonly [string, { readonly type: Type; readonly isPublic: boolean }] =>
        Boolean(it)
      );
    const names = mappings.map(([name]) => name);
    return {
      range: this.range,
      type: 'object',
      typeParameters: this.typeParameters,
      names,
      mappings: Object.fromEntries(mappings),
    };
  }

  visitVariantType(ctx: VariantTypeContext): TypeDefinition {
    const mappings = ctx
      .variantTypeConstructorDeclaration()
      .map((c) => {
        const name = c.UpperId().symbol.text;
        const type = c.typeExpr().accept(typeBuilder);
        if (name == null || type == null) {
          return null;
        }
        return [name, { type, isPublic: false }] as const;
      })
      .filter((it): it is readonly [string, { readonly type: Type; readonly isPublic: false }] =>
        Boolean(it)
      );
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

class ModuleTypeDefinitionBuilder extends AbstractParseTreeVisitor<TypeDefinition | null>
  implements PLVisitor<TypeDefinition | null> {
  defaultResult = (): TypeDefinition | null => null;

  visitClassHeader = (ctx: ClassHeaderContext): TypeDefinition | null => {
    const rawTypeParams = ctx.typeParametersDeclaration();
    const rawTypeDeclaration = ctx.typeDeclaration();
    const typeParameters = rawTypeParams != null ? getTypeParameters(rawTypeParams) : [];
    const range =
      rawTypeParams != null
        ? contextRange(rawTypeParams).union(contextRange(rawTypeDeclaration))
        : contextRange(rawTypeDeclaration);
    return rawTypeDeclaration.accept(new TypeDefinitionBuilder(range, typeParameters));
  };

  visitUtilClassHeader = (ctx: UtilClassHeaderContext): TypeDefinition => ({
    range: contextRange(ctx),
    type: 'object',
    typeParameters: [],
    names: [],
    mappings: {},
  });
}

const moduleTypeDefinitionBuilder = new ModuleTypeDefinitionBuilder();

export default class ClassBuilder extends AbstractParseTreeVisitor<ClassDefinition | null>
  implements PLVisitor<ClassDefinition | null> {
  private readonly expressionBuilder: ExpressionBuilder;

  constructor(errorCollector: ModuleErrorCollector) {
    super();
    this.expressionBuilder = new ExpressionBuilder(errorCollector);
  }

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
    if (name == null || returnType == null || body == null) {
      return null;
    }
    const parameters = ctx
      .annotatedVariable()
      .map((annotatedVariable) => {
        const parameterNameSymbol = annotatedVariable.LowerId().symbol;
        const variablename = parameterNameSymbol.text;
        const typeExpression = annotatedVariable.typeAnnotation().typeExpr();
        const type = typeExpression.accept(typeBuilder);
        if (variablename == null || type == null) {
          return null;
        }
        return {
          name: variablename,
          nameRange: tokenRange(parameterNameSymbol),
          type,
          typeRange: contextRange(typeExpression),
        };
      })
      .filter((it): it is AnnotatedParameter => Boolean(it));
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
    const typeDefinition = ctx.classHeaderDeclaration().accept(moduleTypeDefinitionBuilder);
    if (moduleName == null || typeDefinition == null) {
      return null;
    }
    const [isPublic, name, nameRange] = moduleName;
    return {
      range: contextRange(ctx),
      nameRange,
      name,
      isPublic,
      typeDefinition,
      members: ctx
        .classMemberDefinition()
        .map(this.buildClassMemberDefinition)
        .filter((it): it is ClassMemberDefinition => Boolean(it)),
    };
  };
}
