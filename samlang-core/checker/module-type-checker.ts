import { ModuleReference, SourceReason } from '../ast/common-nodes';
import {
  SamlangIdentifierType,
  SamlangModule,
  SourceClassMemberDeclaration,
  SourceIdentifierType,
} from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { filterMap } from '../utils';
import typeCheckExpression from './expression-type-checker';
import performSSAAnalysisOnSamlangModule, { SsaAnalysisResult } from './ssa-analysis';
import {
  AccessibleGlobalTypingContext,
  GlobalTypingContext,
  LocationBasedLocalTypingContext,
} from './typing-context';

function typeCheckMemberDeclaration(
  memberDeclaration: SourceClassMemberDeclaration,
  ssaResult: SsaAnalysisResult,
  thisType: SamlangIdentifierType | null,
) {
  const localTypingContext = new LocationBasedLocalTypingContext(ssaResult, thisType);
  memberDeclaration.parameters.forEach((parameter) => {
    localTypingContext.write(parameter.nameLocation, parameter.type);
  });
  return localTypingContext;
}

export default function typeCheckSamlangModule(
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  globalTypingContext: GlobalTypingContext,
  errorReporter: GlobalErrorReporter,
): SamlangModule {
  const ssaResult = performSSAAnalysisOnSamlangModule(samlangModule, errorReporter);

  samlangModule.interfaces.forEach((interfaceDeclaration) => {
    interfaceDeclaration.members.forEach((member) =>
      typeCheckMemberDeclaration(member, ssaResult, /* thisType */ null),
    );
  });

  const checkedClasses = samlangModule.classes.map((classDefinition) => {
    const accessibleGlobalTypingContext = new AccessibleGlobalTypingContext(
      globalTypingContext,
      moduleReference,
      classDefinition.name.name,
    );
    const checkedMembers = filterMap(classDefinition.members, (member) => {
      const thisType = SourceIdentifierType(
        SourceReason(classDefinition.name.location, classDefinition.name.location),
        moduleReference,
        classDefinition.name.name,
        classDefinition.typeParameters.map((it) =>
          SourceIdentifierType(
            SourceReason(it.location, it.location),
            moduleReference,
            it.name.name,
          ),
        ),
      );
      const localTypingContext = typeCheckMemberDeclaration(member, ssaResult, thisType);
      return {
        ...member,
        body: typeCheckExpression(
          member.body,
          errorReporter,
          accessibleGlobalTypingContext,
          localTypingContext,
          member.type.returnType,
        ),
      };
    });
    return { ...classDefinition, members: checkedMembers };
  });
  return { ...samlangModule, classes: checkedClasses };
}
