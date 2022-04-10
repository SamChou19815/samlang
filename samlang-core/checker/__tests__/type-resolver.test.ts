import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
import {
  SamlangType,
  SamlangUndecidedType,
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import typeResolver from '../type-resolver';

export function undecidedTypeResolver({ index }: SamlangUndecidedType): SamlangType {
  switch (index % 4) {
    case 0:
      return SourceUnitType(DummySourceReason);
    case 1:
      return SourceBoolType(DummySourceReason);
    case 2:
      return SourceIntType(DummySourceReason);
    case 3:
      return SourceStringType(DummySourceReason);
    default:
      throw new Error('');
  }
}

const resolve = (type: SamlangType): SamlangType => typeResolver(type, undecidedTypeResolver);

describe('type-resolver', () => {
  it("won't affect primitive types", () => {
    expect(resolve(SourceUnitType(DummySourceReason))).toEqual(SourceUnitType(DummySourceReason));
    expect(resolve(SourceBoolType(DummySourceReason))).toEqual(SourceBoolType(DummySourceReason));
    expect(resolve(SourceIntType(DummySourceReason))).toEqual(SourceIntType(DummySourceReason));
    expect(resolve(SourceStringType(DummySourceReason))).toEqual(
      SourceStringType(DummySourceReason)
    );
  });

  it('Undecided types will always be resolved', () => {
    for (let index = 0; index < 1000; index += 1) {
      expect(resolve({ type: 'UndecidedType', reason: DummySourceReason, index })).toEqual(
        undecidedTypeResolver({ type: 'UndecidedType', reason: DummySourceReason, index })
      );
    }
  });

  it('Recursive types will be resolved', () => {
    expect(
      resolve(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
          { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        ])
      )
    ).toEqual(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
        SourceUnitType(DummySourceReason),
        SourceBoolType(DummySourceReason),
      ])
    );

    expect(
      resolve(
        SourceFunctionType(
          DummySourceReason,
          [
            { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
            { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
          ],
          { type: 'UndecidedType', reason: DummySourceReason, index: 2 }
        )
      )
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [SourceUnitType(DummySourceReason), SourceBoolType(DummySourceReason)],
        SourceIntType(DummySourceReason)
      )
    );
  });
});
