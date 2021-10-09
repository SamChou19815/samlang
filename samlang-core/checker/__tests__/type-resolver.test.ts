import {
  Type,
  UndecidedType,
  unitType,
  boolType,
  intType,
  stringType,
  identifierType,
  tupleType,
  functionType,
  ModuleReference,
} from '../../ast/common-nodes';
import typeResolver from '../type-resolver';

// eslint-disable-next-line import/prefer-default-export
export function undecidedTypeResolver({ index }: UndecidedType): Type {
  switch (index % 4) {
    case 0:
      return unitType;
    case 1:
      return boolType;
    case 2:
      return intType;
    case 3:
      return stringType;
    default:
      throw new Error('');
  }
}

const resolve = (type: Type): Type => typeResolver(type, undecidedTypeResolver);

describe('type-resolver', () => {
  it("won't affect primitive types", () => {
    expect(resolve(unitType)).toEqual(unitType);
    expect(resolve(boolType)).toEqual(boolType);
    expect(resolve(intType)).toEqual(intType);
    expect(resolve(stringType)).toEqual(stringType);
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
        identifierType(ModuleReference.DUMMY, 'A', [
          { type: 'UndecidedType', index: 0 },
          { type: 'UndecidedType', index: 1 },
        ])
      )
    ).toEqual(identifierType(ModuleReference.DUMMY, 'A', [unitType, boolType]));

    expect(
      resolve(
        tupleType([
          { type: 'UndecidedType', index: 0 },
          { type: 'UndecidedType', index: 1 },
        ])
      )
    ).toEqual(tupleType([unitType, boolType]));

    expect(
      resolve(
        functionType(
          [
            { type: 'UndecidedType', index: 0 },
            { type: 'UndecidedType', index: 1 },
          ],
          { type: 'UndecidedType', index: 2 }
        )
      )
    ).toEqual(functionType([unitType, boolType], intType));
  });
});
