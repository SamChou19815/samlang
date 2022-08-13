import type { ModuleReference } from '../ast/common-nodes';
import type { SamlangModule, SourceClassMemberDeclaration } from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { filterMap } from '../utils';
import typeCheckExpression from './expression-type-checker';
import performSSAAnalysisOnSamlangModule, { SsaAnalysisResult } from './ssa-analysis';
import {
  AccessibleGlobalTypingContext,
  LocationBasedLocalTypingContext,
  UnoptimizedGlobalTypingContext,
} from './typing-context';

function typeCheckMemberDeclaration(
  memberDeclaration: SourceClassMemberDeclaration,
  accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
  ssaResult: SsaAnalysisResult,
  inClass: boolean,
) {
  const thisType =
    inClass && memberDeclaration.isMethod ? accessibleGlobalTypingContext.thisType : null;
  const localTypingContext = new LocationBasedLocalTypingContext(ssaResult, thisType);
  const contextWithAdditionalTypeParameters =
    accessibleGlobalTypingContext.withAdditionalTypeParameters(
      memberDeclaration.typeParameters.map((it) => it.name.name),
    );
  memberDeclaration.parameters.forEach((parameter) => {
    localTypingContext.write(parameter.nameLocation, parameter.type);
  });
  return { contextWithAdditionalTypeParameters, localTypingContext };
}

export default function typeCheckSamlangModule(
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  globalTypingContext: UnoptimizedGlobalTypingContext,
  errorReporter: GlobalErrorReporter,
): SamlangModule {
  const ssaResult = performSSAAnalysisOnSamlangModule(samlangModule, errorReporter);

  samlangModule.interfaces.forEach((interfaceDeclaration) => {
    const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
      moduleReference,
      globalTypingContext,
      interfaceDeclaration,
    );
    interfaceDeclaration.members.forEach((member) =>
      typeCheckMemberDeclaration(
        member,
        accessibleGlobalTypingContext,
        ssaResult,
        /* inClass */ false,
      ),
    );
  });

  const checkedClasses = samlangModule.classes.map((classDefinition) => {
    const accessibleGlobalTypingContext = AccessibleGlobalTypingContext.fromInterface(
      moduleReference,
      globalTypingContext,
      classDefinition,
    );
    const checkedMembers = filterMap(classDefinition.members, (member) => {
      const { contextWithAdditionalTypeParameters, localTypingContext } =
        typeCheckMemberDeclaration(
          member,
          accessibleGlobalTypingContext,
          ssaResult,
          /* inClass */ true,
        );
      return {
        ...member,
        body: typeCheckExpression(
          member.body,
          errorReporter,
          contextWithAdditionalTypeParameters,
          localTypingContext,
          member.type.returnType,
        ),
      };
    });
    return { ...classDefinition, members: checkedMembers };
  });
  return { ...samlangModule, classes: checkedClasses };
}
