import type { ModuleReference } from '../ast/common-nodes';
import type { SamlangModule, SourceClassMemberDeclaration } from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { filterMap } from '../utils';
import typeCheckExpression from './expression-type-checker';
import performSSAAnalysisOnSamlangModule, { SsaAnalysisResult } from './ssa-analysis';
import TypeResolution from './type-resolution';
import {
  AccessibleGlobalTypingContext,
  LocationBasedLocalTypingContext,
  ReadonlyGlobalTypingContext,
} from './typing-context';

function typeCheckMemberDeclaration(
  memberDeclaration: SourceClassMemberDeclaration,
  accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
  ssaResult: SsaAnalysisResult
) {
  const thisType = memberDeclaration.isMethod ? accessibleGlobalTypingContext.thisType : null;
  const localTypingContext = new LocationBasedLocalTypingContext(ssaResult, thisType);
  const contextWithAdditionalTypeParameters =
    accessibleGlobalTypingContext.withAdditionalTypeParameters(
      memberDeclaration.typeParameters.map((it) => it.name)
    );
  memberDeclaration.parameters.forEach((parameter) => {
    localTypingContext.write(parameter.nameRange, parameter.type);
  });
  return { contextWithAdditionalTypeParameters, localTypingContext };
}

export default function typeCheckSamlangModule(
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  globalTypingContext: ReadonlyGlobalTypingContext,
  errorCollector: ModuleErrorCollector
): SamlangModule {
  const ssaResult = performSSAAnalysisOnSamlangModule(samlangModule, errorCollector);

  samlangModule.interfaces.forEach((interfaceDeclaration) => {
    const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
      moduleReference,
      globalTypingContext,
      interfaceDeclaration
    );
    interfaceDeclaration.members.forEach((member) =>
      typeCheckMemberDeclaration(member, accessibleGlobalTypingContext, ssaResult)
    );
  });

  const checkedClasses = samlangModule.classes.map((classDefinition) => {
    const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
      moduleReference,
      globalTypingContext,
      classDefinition
    );
    const checkedMembers = filterMap(classDefinition.members, (member) => {
      const { contextWithAdditionalTypeParameters, localTypingContext } =
        typeCheckMemberDeclaration(member, accessibleGlobalTypingContext, ssaResult);
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
