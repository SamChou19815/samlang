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
import { error, filterMap, ignore, LocalStackedContext } from '../utils';
import typeCheckExpression from './expression-type-checker';
import TypeResolution from './type-resolution';
import { validateType } from './type-validator';
import { AccessibleGlobalTypingContext, ReadonlyGlobalTypingContext } from './typing-context';

class VariableCollisionCheckerStackedContext extends LocalStackedContext<void> {
  constructor(private readonly errorCollector: ModuleErrorCollector) {
    super();
  }

  private add = ({ name, range }: Omit<SourceIdentifier, 'associatedComments'>) =>
    this.addLocalValueType(name, undefined, () =>
      this.errorCollector.reportCollisionError(range, name)
    );

  private addAll = (ids: readonly SourceIdentifier[]) => ids.forEach(this.add);

  checkNameCollision(samlangModule: SamlangModule) {
    samlangModule.imports.forEach((oneImport) => this.addAll(oneImport.importedMembers));

    type InterfaceWithOptionalTypeDefinition = SourceInterfaceDeclaration & {
      readonly typeDefinition?: TypeDefinition;
    };
    const interfaces: InterfaceWithOptionalTypeDefinition[] = [
      ...samlangModule.interfaces,
      ...samlangModule.classes,
    ];
    interfaces.forEach((interfaceDeclaration) => {
      this.add(interfaceDeclaration.name);

      this.withNestedScope(() => {
        this.addAll(interfaceDeclaration.typeParameters);
        if (interfaceDeclaration.typeDefinition != null) {
          this.addAll(interfaceDeclaration.typeDefinition.names);
        }

        interfaceDeclaration.members.map((member) => {
          this.add(member.name);
          this.withNestedScope(() => {
            this.addAll(member.typeParameters);
            member.parameters.forEach(({ name, nameRange: range }) => this.add({ name, range }));
          });
        });
      });
    });
  }
}

function typeCheckMemberDeclaration(
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
    localTypingContext.addLocalValueType(parameter.name, parameter.type, ignore);
  });
  return { contextWithAdditionalTypeParameters, localTypingContext };
}

export default class ModuleTypeChecker {
  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly errorCollector: ModuleErrorCollector
  ) {}

  typeCheck(
    samlangModule: SamlangModule,
    globalTypingContext: ReadonlyGlobalTypingContext
  ): SamlangModule {
    new VariableCollisionCheckerStackedContext(this.errorCollector).checkNameCollision(
      samlangModule
    );

    samlangModule.interfaces.forEach((interfaceDeclaration) => {
      const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
        this.moduleReference,
        globalTypingContext,
        interfaceDeclaration
      );
      this.checkClassOrInterfaceTypeValidity(accessibleGlobalTypingContext, interfaceDeclaration);
      interfaceDeclaration.members.forEach((member) =>
        typeCheckMemberDeclaration(member, accessibleGlobalTypingContext)
      );
    });
    const checkedClasses = samlangModule.classes.map((classDefinition) => {
      const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
        this.moduleReference,
        globalTypingContext,
        classDefinition
      );
      this.checkClassOrInterfaceTypeValidity(accessibleGlobalTypingContext, classDefinition);
      const checkedMembers = filterMap(classDefinition.members, (member) =>
        this.typeCheckMemberDefinition(member, accessibleGlobalTypingContext)
      );
      return { ...classDefinition, members: checkedMembers };
    });
    return { ...samlangModule, classes: checkedClasses };
  }

  /**
   * Check the validity of various toplevel properties of the given module's information, including
   * - whether `typeDefinition` is well defined.
   * - whether `classMembers`'s types are well defined.
   */
  private checkClassOrInterfaceTypeValidity(
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    interfaceDeclaration: SourceInterfaceDeclaration & { readonly typeDefinition?: TypeDefinition }
  ): void {
    const { typeDefinition } = interfaceDeclaration;
    if (typeDefinition != null) {
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
  }

  private typeCheckMemberDefinition(
    memberDefinition: SourceClassMemberDefinition,
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext
  ): SourceClassMemberDefinition | null {
    const { contextWithAdditionalTypeParameters, localTypingContext } = typeCheckMemberDeclaration(
      memberDefinition,
      accessibleGlobalTypingContext
    );
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
