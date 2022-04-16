import { moduleReferenceToString } from '../ast/common-nodes';
import { isTheSameType, SamlangType } from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { zip } from '../utils';

function contextualTypeMeetWithThrow(general: SamlangType, specific: SamlangType): SamlangType {
  if (general.type === 'PrimitiveType' && general.name === 'unknown') return specific;
  if (specific.type === 'PrimitiveType' && specific.name === 'unknown') {
    return { ...general, reason: specific.reason };
  }
  switch (general.type) {
    case 'PrimitiveType':
      if (!isTheSameType(general, specific)) throw new Error();
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
            contextualTypeMeetWithThrow(g, s)
          ),
        };
      }
      throw new Error();
    case 'FunctionType':
      if (
        specific.type === 'FunctionType' &&
        general.argumentTypes.length === specific.argumentTypes.length
      ) {
        return {
          ...specific,
          argumentTypes: zip(general.argumentTypes, specific.argumentTypes).map(([g, s]) =>
            contextualTypeMeetWithThrow(g, s)
          ),
          returnType: contextualTypeMeetWithThrow(general.returnType, specific.returnType),
        };
      }
      throw new Error();
  }
}

export default function contextualTypeMeet(
  general: SamlangType,
  specific: SamlangType,
  errorCollector: ModuleErrorCollector
): SamlangType {
  try {
    return contextualTypeMeetWithThrow(general, specific);
  } catch {
    errorCollector.reportUnexpectedTypeError(specific.reason.definitionLocation, general, specific);
    return specific;
  }
}
