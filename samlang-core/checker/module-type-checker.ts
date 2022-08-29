import { ModuleReference, SourceReason } from '../ast/common-nodes';
import { SamlangModule, SourceIdentifierType } from '../ast/samlang-nodes';
import type { GlobalErrorReporter } from '../errors';
import { filterMap } from '../utils';
import typeCheckExpression from './expression-type-checker';
import performSSAAnalysisOnSamlangModule from './ssa-analysis';
import {
  AccessibleGlobalTypingContext,
  GlobalTypingContext,
  LocationBasedLocalTypingContext,
} from './typing-context';

export default function typeCheckSamlangModule(
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  globalTypingContext: GlobalTypingContext,
  errorReporter: GlobalErrorReporter,
): SamlangModule {
  const ssaResult = performSSAAnalysisOnSamlangModule(samlangModule, errorReporter);
  const localTypingContext = new LocationBasedLocalTypingContext(ssaResult);

  samlangModule.interfaces.forEach((interfaceDeclaration) => {
    interfaceDeclaration.members.forEach((member) => {
      member.parameters.forEach((parameter) => {
        localTypingContext.write(parameter.nameLocation, parameter.type);
      });
    });
  });

  const checkedClasses = samlangModule.classes.map((classDefinition) => {
    const accessibleGlobalTypingContext = new AccessibleGlobalTypingContext(
      globalTypingContext,
      moduleReference,
      classDefinition.name.name,
    );
    localTypingContext.write(
      classDefinition.location,
      SourceIdentifierType(
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
      ),
    );
    const checkedMembers = filterMap(classDefinition.members, (member) => {
      member.parameters.forEach((parameter) => {
        localTypingContext.write(parameter.nameLocation, parameter.type);
      });
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
