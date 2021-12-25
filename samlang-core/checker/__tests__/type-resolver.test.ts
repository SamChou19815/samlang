import { ModuleReference } from '../../ast/common-nodes';
import {
  SamlangType,
  SamlangUndecidedType,
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import typeResolver from '../type-resolver';

export function undecidedTypeResolver({ index }: SamlangUndecidedType): SamlangType {
  switch (index % 4) {
    case 0:
      return SourceUnitType;
    case 1:
      return SourceBoolType;
    case 2:
      return SourceIntType;
    case 3:
      return SourceStringType;
    default:
      throw new Error('');
  }
}

const resolve = (type: SamlangType): SamlangType => typeResolver(type, undecidedTypeResolver);

describe('type-resolver', () => {
  it("won't affect primitive types", () => {
    expect(resolve(SourceUnitType)).toEqual(SourceUnitType);
    expect(resolve(SourceBoolType)).toEqual(SourceBoolType);
    expect(resolve(SourceIntType)).toEqual(SourceIntType);
    expect(resolve(SourceStringType)).toEqual(SourceStringType);
  });

  it('Undecided types will always be resolved', () => {
    for (let index = 0; index < 1000; index += 1) {
      expect(resolve({ type: 'UndecidedType', index })).toEqual(
        undecidedTypeResolver({ type: 'UndecidedType', index })
      );
    }
  });

  it('Recursive types will be resolved', () => {
    expect(
      resolve(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [
          { type: 'UndecidedType', index: 0 },
          { type: 'UndecidedType', index: 1 },
        ])
      )
    ).toEqual(SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceUnitType, SourceBoolType]));

    expect(
      resolve(
        SourceTupleType([
          { type: 'UndecidedType', index: 0 },
          { type: 'UndecidedType', index: 1 },
        ])
      )
    ).toEqual(SourceTupleType([SourceUnitType, SourceBoolType]));

    expect(
      resolve(
        SourceFunctionType(
          [
            { type: 'UndecidedType', index: 0 },
            { type: 'UndecidedType', index: 1 },
          ],
          { type: 'UndecidedType', index: 2 }
        )
      )
    ).toEqual(SourceFunctionType([SourceUnitType, SourceBoolType], SourceIntType));
  });
});
