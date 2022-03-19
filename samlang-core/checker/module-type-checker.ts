import type { ModuleReference } from '../ast/common-nodes';
import type {
  SamlangModule,
  SamlangType,
  SourceClassMemberDeclaration,
  SourceClassMemberDefinition,
  SourceIdentifier,
  SourceInterfaceDeclaration,
  TypeDefinition,
} from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { error, filterMap, LocalStackedContext } from '../utils';
import typeCheckExpression from './expression-type-checker';
import TypeResolution from './type-resolution';
import { validateType } from './type-validator';
import { AccessibleGlobalTypingContext, ReadonlyGlobalTypingContext } from './typing-context';

class VariableCollisionCheckerStackedContext extends LocalStackedContext<void> {
  constructor(private readonly errorCollector: ModuleErrorCollector) {
    super();
  }

  add = ({ name, range }: SourceIdentifier) =>
    this.addLocalValueType(name, undefined, () =>
      this.errorCollector.reportCollisionError(range, name)
    );

  addAll = (ids: readonly SourceIdentifier[]) => ids.forEach(this.add);
}

export default class ModuleTypeChecker {
  private variableCollisionCheckerStackedContext: VariableCollisionCheckerStackedContext;

  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly errorCollector: ModuleErrorCollector
  ) {
    this.variableCollisionCheckerStackedContext = new VariableCollisionCheckerStackedContext(
      errorCollector
    );
  }

  typeCheck(
    samlangmodule: SamlangModule,
    globalTypingContext: ReadonlyGlobalTypingContext
  ): SamlangModule {
    samlangmodule.imports.forEach((oneImport) =>
      this.variableCollisionCheckerStackedContext.addAll(oneImport.importedMembers)
    );
    samlangmodule.interfaces.forEach((it) =>
      this.variableCollisionCheckerStackedContext.add(it.name)
    );
    samlangmodule.classes.forEach((it) => this.variableCollisionCheckerStackedContext.add(it.name));

    samlangmodule.interfaces.forEach((interfaceDeclaration) => {
      const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
        this.moduleReference,
        globalTypingContext,
        interfaceDeclaration
      );
      this.checkClassOrInterfaceNameValidity(accessibleGlobalTypingContext, interfaceDeclaration);
      interfaceDeclaration.members.forEach((member) =>
        this.typeCheckMemberDeclaration(member, accessibleGlobalTypingContext)
      );
    });
    const checkedClasses = samlangmodule.classes.map((classDefinition) => {
      const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
        this.moduleReference,
        globalTypingContext,
        classDefinition
      );
      this.checkClassOrInterfaceNameValidity(accessibleGlobalTypingContext, classDefinition);
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
  private checkClassOrInterfaceNameValidity(
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    interfaceDeclaration: SourceInterfaceDeclaration & { readonly typeDefinition?: TypeDefinition }
  ): void {
    this.variableCollisionCheckerStackedContext.withNestedScope(() => {
      this.variableCollisionCheckerStackedContext.addAll(interfaceDeclaration.typeParameters);
      this.variableCollisionCheckerStackedContext.addAll(
        interfaceDeclaration.members.map((it) => it.name)
      );
      const { typeDefinition } = interfaceDeclaration;
      if (typeDefinition != null) {
        this.variableCollisionCheckerStackedContext.addAll(typeDefinition.names);
        Object.values(typeDefinition.mappings).forEach((type) => {
          validateType(
            type.type,
            accessibleGlobalTypingContext,
            this.errorCollector,
            typeDefinition.range
          );
        });
      }
      interfaceDeclaration.members.forEach((member) => {
        this.variableCollisionCheckerStackedContext.withNestedScope(() => {
          this.variableCollisionCheckerStackedContext.addAll(member.typeParameters);
          let patchedContext = accessibleGlobalTypingContext.withAdditionalTypeParameters(
            member.typeParameters.map((it) => it.name)
          );
          if (member.isMethod) {
            patchedContext = patchedContext.withAdditionalTypeParameters(
              patchedContext.getCurrentClassTypeDefinition().classTypeParameters
            );
          }
          validateType(member.type, patchedContext, this.errorCollector, member.range);
        });
      });
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
}
