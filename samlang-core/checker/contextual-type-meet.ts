import { moduleReferenceToString } from '../ast/common-nodes';
import { isTheSameType, SamlangType } from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { assert, zip } from '../utils';

export default function contextualTypeMeet(
  general: SamlangType,
  specific: SamlangType,
  errorCollector: ModuleErrorCollector
): SamlangType {
  if (general.type === 'PrimitiveType' && general.name === 'unknown') {
    errorCollector.reportInsufficientTypeInferenceContextError(specific.reason.definitionLocation);
    return specific;
  }
  if (specific.type === 'PrimitiveType' && specific.name === 'unknown') {
    return { ...general, reason: specific.reason };
  }
  assert(general.type !== 'UndecidedType');
  switch (general.type) {
    case 'PrimitiveType':
      if (!isTheSameType(general, specific)) {
        errorCollector.reportUnexpectedTypeError(
          specific.reason.definitionLocation,
          general,
          specific
        );
      }
      return specific;
    case 'IdentifierType':
      if (
        specific.type === 'IdentifierType' &&
        moduleReferenceToString(general.moduleReference) ===
          moduleReferenceToString(specific.moduleReference) &&
        general.identifier === specific.identifier &&
        general.typeArguments.length === specific.typeArguments.length
      ) {
        return {
          ...specific,
          typeArguments: zip(general.typeArguments, specific.typeArguments).map(([g, s]) =>
            contextualTypeMeet(g, s, errorCollector)
          ),
        };
      }
      errorCollector.reportUnexpectedTypeError(
        specific.reason.definitionLocation,
        general,
        specific
      );
      return specific;
    case 'FunctionType':
      if (
        specific.type === 'FunctionType' &&
        general.argumentTypes.length === specific.argumentTypes.length
      ) {
        return {
          ...specific,
          argumentTypes: zip(general.argumentTypes, specific.argumentTypes).map(([g, s]) =>
            contextualTypeMeet(g, s, errorCollector)
          ),
          returnType: contextualTypeMeet(general.returnType, specific.returnType, errorCollector),
        };
      }
      errorCollector.reportUnexpectedTypeError(
        specific.reason.definitionLocation,
        general,
        specific
      );
      return specific;
  }
}
