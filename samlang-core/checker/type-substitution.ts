import { DummySourceReason, ModuleReference } from '../ast/common-nodes';
import { SamlangType, SourceFunctionType, SourceIdentifierType } from '../ast/samlang-nodes';
import { assert } from '../utils';
import type { MemberTypeInformation } from './typing-context';

export default function performTypeSubstitution(
  type: SamlangType,
  mapping: Readonly<Record<string, SamlangType>>
): SamlangType {
  switch (type.type) {
    case 'PrimitiveType':
      return type;
    case 'IdentifierType':
      if (type.typeArguments.length === 0) {
        return mapping[type.identifier] ?? type;
      }
      return SourceIdentifierType(
        type.reason,
        type.moduleReference,
        type.identifier,
        type.typeArguments.map((it) => performTypeSubstitution(it, mapping))
      );
    case 'FunctionType':
      return SourceFunctionType(
        type.reason,
        type.argumentTypes.map((it) => performTypeSubstitution(it, mapping)),
        performTypeSubstitution(type.returnType, mapping)
      );
    case 'UndecidedType':
      return type;
  }
}

export function normalizeTypeInformation(
  currentModuleReference: ModuleReference,
  { isPublic, typeParameters, type }: MemberTypeInformation
): MemberTypeInformation {
  const mappings = typeParameters.map(
    (typeParameter, i) =>
      [
        typeParameter,
        SourceIdentifierType(DummySourceReason, currentModuleReference, `_T${i}`),
      ] as const
  );
  const newType = performTypeSubstitution(type, Object.fromEntries(mappings));
  assert(newType.type === 'FunctionType');
  return {
    isPublic,
    typeParameters: mappings.map(([, { identifier }]) => identifier),
    type: newType,
  };
}
