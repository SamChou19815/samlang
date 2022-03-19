import type { ModuleReference } from '../ast/common-nodes';
import type {
  SamlangModule,
  SamlangType,
  SourceClassMemberDeclaration,
  SourceClassMemberDefinition,
  SourceIdentifier,
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
    this.checkNameCollisionForCompoundList([
      ...samlangmodule.imports.flatMap((oneImport) => oneImport.importedMembers),
      ...samlangmodule.interfaces.map((it) => it.name),
      ...samlangmodule.classes.map((it) => it.name),
    ]);

    samlangmodule.interfaces.forEach((interfaceDeclaration) => {
      const accessibleGlobalTypingContext = new AccessibleGlobalTypingContext(
        this.moduleReference,
        globalTypingContext,
        new Set(interfaceDeclaration.typeParameters.map((it) => it.name)),
        interfaceDeclaration.name.name
      );
      // First pass: validating module's top level properties, excluding whether member's types are well-defined.
      this.checkClassOrInterfaceValidity(
        interfaceDeclaration.typeParameters,
        null,
        interfaceDeclaration.members,
        accessibleGlobalTypingContext
      );
      // Second pass: type check all members' function body
      interfaceDeclaration.members.forEach((member) =>
        this.typeCheckMemberDeclaration(member, accessibleGlobalTypingContext)
      );
    });
    const checkedClasses = samlangmodule.classes.map((classDefinition) => {
      const accessibleGlobalTypingContext = new AccessibleGlobalTypingContext(
        this.moduleReference,
        globalTypingContext,
        new Set(classDefinition.typeParameters.map((it) => it.name)),
        classDefinition.name.name
      );
      // First pass: validating module's top level properties, excluding whether member's types are well-defined.
      this.checkClassOrInterfaceValidity(
        classDefinition.typeParameters,
        classDefinition.typeDefinition,
        classDefinition.members,
        accessibleGlobalTypingContext
      );
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
  private checkClassOrInterfaceValidity(
    classTypeParameters: readonly SourceIdentifier[],
    typeDefinition: TypeDefinition | null,
    classMembers: readonly SourceClassMemberDeclaration[],
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext
  ): void {
    this.checkNameCollisionForCompoundList(classTypeParameters);
    if (typeDefinition != null) {
      this.checkNameCollisionForCompoundList(typeDefinition.names);
      Object.values(typeDefinition.mappings).forEach((type) => {
        validateType(
          type.type,
          accessibleGlobalTypingContext,
          this.errorCollector,
          typeDefinition.range
        );
      });
    }
    this.checkNameCollisionForCompoundList(classMembers.map((it) => it.name));
    classMembers.forEach((classMember) =>
      this.checkNameCollisionForCompoundList(classMember.typeParameters)
    );
    this.partiallyCheckMembers(classMembers, accessibleGlobalTypingContext);
  }

  private partiallyCheckMembers(
    classMembers: readonly SourceClassMemberDeclaration[],
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext
  ): void {
    classMembers.forEach((member) => {
      const typeParameters = member.typeParameters;
      let patchedContext = accessibleGlobalTypingContext.withAdditionalTypeParameters(
        typeParameters.map((it) => it.name)
      );
      if (member.isMethod) {
        patchedContext = patchedContext.withAdditionalTypeParameters(
          patchedContext.getCurrentClassTypeDefinition().classTypeParameters
        );
      }
      validateType(member.type, patchedContext, this.errorCollector, member.range);
    });
  }

  private typeCheckMemberDeclaration(
    memberDeclaration: SourceClassMemberDeclaration,
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext
  ) {
    const localTypingContext = new LocalStackedContext<SamlangType>();
    if (memberDeclaration.isMethod) {
      localTypingContext.addLocalValueType('this', accessibleGlobalTypingContext.thisType, error);
    }
    const contextWithAdditionalTypeParameters =
      accessibleGlobalTypingContext.withAdditionalTypeParameters(
        memberDeclaration.typeParameters.map((it) => it.name)
      );
    memberDeclaration.parameters.forEach((parameter) => {
      localTypingContext.addLocalValueType(parameter.name, parameter.type, () =>
        this.errorCollector.reportCollisionError(parameter.nameRange, parameter.name)
      );
    });
    return { contextWithAdditionalTypeParameters, localTypingContext };
  }

  private typeCheckMemberDefinition(
    memberDefinition: SourceClassMemberDefinition,
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext
  ): SourceClassMemberDefinition | null {
    const { contextWithAdditionalTypeParameters, localTypingContext } =
      this.typeCheckMemberDeclaration(memberDefinition, accessibleGlobalTypingContext);
    return {
      ...memberDefinition,
      body: typeCheckExpression(
        memberDefinition.body,
        this.errorCollector,
        contextWithAdditionalTypeParameters,
        localTypingContext,
        new TypeResolution(),
        memberDefinition.type.returnType
      ),
    };
  }

  private checkNameCollisionForCompoundList(ids: readonly SourceIdentifier[]): void {
    const nameSet = new Set<string>();
    nameSet.add('init');
    ids.forEach(({ name, range }) => {
      if (nameSet.has(name)) {
        this.errorCollector.reportCollisionError(range, name);
      } else {
        nameSet.add(name);
      }
    });
  }
}
