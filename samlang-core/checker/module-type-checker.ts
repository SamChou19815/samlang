import type { ModuleReference } from '../ast/common-nodes';
import type {
  SamlangModule,
  SamlangType,
  SourceClassMemberDeclaration,
  SourceIdentifier,
  SourceInterfaceDeclaration,
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

  static checkNameCollision(errorCollector: ModuleErrorCollector, samlangModule: SamlangModule) {
    const checker = new VariableCollisionCheckerStackedContext(errorCollector);
    samlangModule.imports.forEach((oneImport) => checker.addAll(oneImport.importedMembers));

    const interfaces: SourceInterfaceDeclaration[] = [
      ...samlangModule.interfaces,
      ...samlangModule.classes,
    ];
    interfaces.forEach((interfaceDeclaration) => {
      checker.add(interfaceDeclaration.name);

      checker.withNestedScope(() => {
        checker.addAll(interfaceDeclaration.typeParameters);
        if (interfaceDeclaration.typeDefinition != null) {
          checker.addAll(interfaceDeclaration.typeDefinition.names);
        }

        interfaceDeclaration.members.map((member) => {
          checker.add(member.name);
          checker.withNestedScope(() => {
            checker.addAll(member.typeParameters);
            member.parameters.forEach(({ name, nameRange: range }) => checker.add({ name, range }));
          });
        });
      });
    });
  }
}

function checkClassOrInterfaceTypeValidity(
  accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
  errorCollector: ModuleErrorCollector,
  interfaceDeclaration: SourceInterfaceDeclaration
) {
  const { typeDefinition } = interfaceDeclaration;
  if (typeDefinition != null) {
    Object.values(typeDefinition.mappings).forEach((type) => {
      validateType(type.type, accessibleGlobalTypingContext, errorCollector, typeDefinition.range);
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
    validateType(member.type, patchedContext, errorCollector, member.range);
  });
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

export default function typeCheckSamlangModule(
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  globalTypingContext: ReadonlyGlobalTypingContext,
  errorCollector: ModuleErrorCollector
): SamlangModule {
  VariableCollisionCheckerStackedContext.checkNameCollision(errorCollector, samlangModule);

  samlangModule.interfaces.forEach((interfaceDeclaration) => {
    const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
      moduleReference,
      globalTypingContext,
      interfaceDeclaration
    );
    checkClassOrInterfaceTypeValidity(
      accessibleGlobalTypingContext,
      errorCollector,
      interfaceDeclaration
    );
    interfaceDeclaration.members.forEach((member) =>
      typeCheckMemberDeclaration(member, accessibleGlobalTypingContext)
    );
  });

  const checkedClasses = samlangModule.classes.map((classDefinition) => {
    const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
      moduleReference,
      globalTypingContext,
      classDefinition
    );
    checkClassOrInterfaceTypeValidity(
      accessibleGlobalTypingContext,
      errorCollector,
      classDefinition
    );
    const checkedMembers = filterMap(classDefinition.members, (member) => {
      const { contextWithAdditionalTypeParameters, localTypingContext } =
        typeCheckMemberDeclaration(member, accessibleGlobalTypingContext);
      return {
        ...member,
        body: typeCheckExpression(
          member.body,
          errorCollector,
          contextWithAdditionalTypeParameters,
          localTypingContext,
          new TypeResolution(),
          member.type.returnType
        ),
      };
    });
    return { ...classDefinition, members: checkedMembers };
  });
  return { ...samlangModule, classes: checkedClasses };
}
