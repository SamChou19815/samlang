import type { ModuleReference, Range, Type } from '../ast/common-nodes';
import type {
  SamlangModule,
  SourceClassMemberDefinition,
  TypeDefinition,
} from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { error, filterMap, LocalStackedContext } from '../utils';
import typeCheckExpression from './expression-type-checker';
import TypeResolution from './type-resolution';
import { validateType } from './type-validator';
import { AccessibleGlobalTypingContext, ReadonlyGlobalTypingContext } from './typing-context';

export default class ModuleTypeChecker {
  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly errorCollector: ModuleErrorCollector
  ) {}

  typeCheck(
    samlangmodule: SamlangModule,
    globalTypingContext: ReadonlyGlobalTypingContext
  ): SamlangModule {
    this.checkNameCollisionForCompoundList(
      samlangmodule.classes.map(({ name, nameRange }) => [name, nameRange])
    );

    const checkedClasses = samlangmodule.classes.map((classDefinition) => {
      const currentClass = classDefinition.name;
      const accessibleGlobalTypingContext = new AccessibleGlobalTypingContext(
        this.moduleReference,
        globalTypingContext,
        new Set(classDefinition.typeParameters),
        currentClass
      );
      // First pass: validating module's top level properties, excluding whether member's types are well-defined.
      this.checkClassTopLevelValidity(
        classDefinition.typeParameters,
        classDefinition.typeDefinition,
        classDefinition.members,
        accessibleGlobalTypingContext
      );
      this.partiallyCheckMembers(classDefinition.members, accessibleGlobalTypingContext);
      // Second pass: type check all members' function body
      const checkedMembers = filterMap(classDefinition.members, (member) =>
        this.typeCheckMemberDefinition(member, accessibleGlobalTypingContext)
      );
      return { ...classDefinition, members: checkedMembers };
    });
    return { ...samlangmodule, classes: checkedClasses };
  }

  /**
   * Check the validity of various toplevel properties of the given module's information, including
   * - whether `classTypeParameters` and `typeDefinition`'s mappings have no name collision.
   * - whether `typeDefinition` is well defined.
   * - whether `classMembers` have no name collision.
   * - whether `classMembers`'s type parameters have no name collision.
   * - whether `classMembers` have methods when we are in a util module.
   * - whether `classMembers`'s types are well defined.
   */
  private checkClassTopLevelValidity(
    classTypeParameters: readonly string[],
    typeDefinition: TypeDefinition,
    classMembers: readonly SourceClassMemberDefinition[],
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext
  ): void {
    this.checkNameCollisionForStringList(classTypeParameters, typeDefinition.range);
    this.checkNameCollisionForStringList(
      Object.keys(typeDefinition.mappings),
      typeDefinition.range
    );
    Object.values(typeDefinition.mappings).forEach((type) => {
      validateType(
        type.type,
        accessibleGlobalTypingContext,
        this.errorCollector,
        typeDefinition.range
      );
    });
    this.checkNameCollisionForCompoundList(
      classMembers.map(({ name, nameRange }) => [name, nameRange])
    );
    classMembers.forEach((classMember) =>
      this.checkNameCollisionForStringList(classMember.typeParameters, classMember.range)
    );
  }

  private partiallyCheckMembers(
    classMembers: readonly SourceClassMemberDefinition[],
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext
  ): void {
    classMembers.forEach((member) => {
      const typeParameters = member.typeParameters;
      let patchedContext =
        accessibleGlobalTypingContext.withAdditionalTypeParameters(typeParameters);
      if (member.isMethod) {
        patchedContext = patchedContext.withAdditionalTypeParameters(
          patchedContext.getCurrentClassTypeDefinition().classTypeParameters
        );
      }
      validateType(member.type, patchedContext, this.errorCollector, member.range);
    });
  }

  private typeCheckMemberDefinition(
    memberDefinition: SourceClassMemberDefinition,
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext
  ): SourceClassMemberDefinition | null {
    const localTypingContext = new LocalStackedContext<Type>();
    const { isMethod, typeParameters, type, parameters, body } = memberDefinition;
    if (isMethod) {
      localTypingContext.addLocalValueType('this', accessibleGlobalTypingContext.thisType, error);
    }
    const contextWithAdditionalTypeParameters =
      accessibleGlobalTypingContext.withAdditionalTypeParameters(typeParameters);
    parameters.forEach((parameter) => {
      const parameterType = parameter.type;
      validateType(
        parameterType,
        contextWithAdditionalTypeParameters,
        this.errorCollector,
        parameter.typeRange
      );
      localTypingContext.addLocalValueType(parameter.name, parameterType, () =>
        this.errorCollector.reportCollisionError(parameter.nameRange, parameter.name)
      );
    });
    return {
      ...memberDefinition,
      body: typeCheckExpression(
        body,
        this.errorCollector,
        contextWithAdditionalTypeParameters,
        localTypingContext,
        new TypeResolution(),
        type.returnType
      ),
    };
  }

  private checkNameCollisionForStringList(names: readonly string[], range: Range): void {
    const nameSet = new Set<string>();
    names.forEach((name) => {
      if (nameSet.has(name)) {
        this.errorCollector.reportCollisionError(range, name);
      } else {
        nameSet.add(name);
      }
    });
  }

  private checkNameCollisionForCompoundList(
    nameWithRange: readonly (readonly [string, Range])[]
  ): void {
    const nameSet = new Set<string>();
    nameWithRange.forEach(([name, range]) => {
      if (nameSet.has(name)) {
        this.errorCollector.reportCollisionError(range, name);
      } else {
        nameSet.add(name);
      }
    });
  }
}
