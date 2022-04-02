import { ModuleReference } from '../../ast/common-nodes';
import {
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceTupleType,
} from '../../ast/samlang-nodes';
import performTypeSubstitution from '../type-substitution';

describe('type-substitution', () => {
  it('can replace deeply nested identifiers', () => {
    expect(
      performTypeSubstitution(
        SourceFunctionType(
          [
            SourceIdentifierType(ModuleReference.DUMMY, 'A', [
              SourceIdentifierType(ModuleReference.DUMMY, 'B'),
              SourceIdentifierType(ModuleReference.DUMMY, 'C', [SourceIntType]),
            ]),
            SourceTupleType([
              SourceIdentifierType(ModuleReference.DUMMY, 'D'),
              SourceIdentifierType(ModuleReference.DUMMY, 'E', [
                SourceIdentifierType(ModuleReference.DUMMY, 'F'),
              ]),
            ]),
            { type: 'UndecidedType', index: 0 },
          ],
          SourceIntType
        ),
        { A: SourceIntType, B: SourceIntType, C: SourceIntType, D: SourceIntType, E: SourceIntType }
      )
    ).toEqual(
      SourceFunctionType(
        [
          SourceIdentifierType(ModuleReference.DUMMY, 'A', [
            SourceIntType,
            SourceIdentifierType(ModuleReference.DUMMY, 'C', [SourceIntType]),
          ]),
          SourceTupleType([
            SourceIntType,
            SourceIdentifierType(ModuleReference.DUMMY, 'E', [
              SourceIdentifierType(ModuleReference.DUMMY, 'F'),
            ]),
          ]),
          { type: 'UndecidedType', index: 0 },
        ],
        SourceIntType
      )
    );
  });
});
