import type { ModuleReference } from '../ast/common-nodes';
import type {
  SamlangModule,
  SamlangType,
  SourceClassMemberDeclaration,
  SourceInterfaceDeclaration,
} from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { error, filterMap, ignore, LocalStackedContext } from '../utils';
import typeCheckExpression from './expression-type-checker';
import performSSAAnalysisOnSamlangModule from './ssa-analysis';
import TypeResolution from './type-resolution';
import { validateType } from './type-validator';
import { AccessibleGlobalTypingContext, ReadonlyGlobalTypingContext } from './typing-context';

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
  performSSAAnalysisOnSamlangModule(samlangModule, errorCollector);

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
