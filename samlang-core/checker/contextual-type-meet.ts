import { moduleReferenceToString } from '../ast/common-nodes';
import { isTheSameType, SamlangType } from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { zip } from '../utils';

function contextualTypeMeetWithThrow(general: SamlangType, specific: SamlangType): SamlangType {
  if (general.__type__ === 'UnknownType') return specific;
  if (specific.__type__ === 'UnknownType') return { ...general, reason: specific.reason };
  switch (general.__type__) {
    case 'PrimitiveType':
      if (!isTheSameType(general, specific)) throw new Error();
      return specific;
    case 'IdentifierType':
      if (
        specific.__type__ === 'IdentifierType' &&
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
        specific.__type__ === 'FunctionType' &&
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
    errorCollector.reportUnexpectedTypeError(specific.reason.useLocation, general, specific);
    return specific;
  }
}
