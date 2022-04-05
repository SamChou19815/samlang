import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
import {
  SamlangType,
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
  SourceUnknownType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import contextualTypeMeet from '../contextual-type-meet';

function meet(t1: SamlangType, t2: SamlangType) {
  const globalCollector = createGlobalErrorCollector();
  const moduleCollector = globalCollector.getModuleErrorCollector();
  const type = contextualTypeMeet(t1, t2, moduleCollector);
  if (moduleCollector.hasErrors) {
    return 'FAILED_MEET';
  }
  return type;
}

describe('contextual-type-meet', () => {
  it('t1=primitive type', () => {
    expect(meet(SourceUnitType(DummySourceReason), SourceUnitType(DummySourceReason))).toEqual(
      SourceUnitType(DummySourceReason)
    );
    expect(meet(SourceUnitType(DummySourceReason), SourceBoolType(DummySourceReason))).toBe(
      'FAILED_MEET'
    );
    expect(meet(SourceUnitType(DummySourceReason), SourceIntType(DummySourceReason))).toBe(
      'FAILED_MEET'
    );
    expect(meet(SourceUnitType(DummySourceReason), SourceStringType(DummySourceReason))).toBe(
      'FAILED_MEET'
    );
    expect(
      meet(
        SourceUnitType(DummySourceReason),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A')
      )
    ).toBe('FAILED_MEET');

    expect(meet(SourceUnitType(DummySourceReason), SourceUnknownType(DummySourceReason))).toEqual(
      SourceUnitType(DummySourceReason)
    );
  });

  it('t1=identifier type', () => {
    expect(
      meet(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        SourceUnitType(DummySourceReason)
      )
    ).toBe('FAILED_MEET');
    expect(
      meet(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B')
      )
    ).toBe('FAILED_MEET');
    expect(
      meet(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
        ])
      )
    ).toBe('FAILED_MEET');
    expect(
      meet(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        ])
      )
    ).toEqual(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
      ])
    );

    expect(
      meet(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceUnknownType(DummySourceReason),
        ])
      )
    ).toEqual(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
      ])
    );
    expect(
      meet(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        SourceUnknownType(DummySourceReason)
      )
    ).toEqual(SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'));
  });

  it('t1=tuple type', () => {
    expect(meet(SourceTupleType(DummySourceReason, []), SourceUnitType(DummySourceReason))).toBe(
      'FAILED_MEET'
    );
    expect(
      meet(
        SourceTupleType(DummySourceReason, []),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B')
      )
    ).toBe('FAILED_MEET');
    expect(
      meet(
        SourceTupleType(DummySourceReason, []),
        SourceTupleType(DummySourceReason, [SourceIntType(DummySourceReason)])
      )
    ).toBe('FAILED_MEET');
    expect(
      meet(
        SourceTupleType(DummySourceReason, [SourceIntType(DummySourceReason)]),
        SourceTupleType(DummySourceReason, [SourceIntType(DummySourceReason)])
      )
    ).toEqual(SourceTupleType(DummySourceReason, [SourceIntType(DummySourceReason)]));

    expect(
      meet(
        SourceTupleType(DummySourceReason, [SourceIntType(DummySourceReason)]),
        SourceUnknownType(DummySourceReason)
      )
    ).toEqual(SourceTupleType(DummySourceReason, [SourceIntType(DummySourceReason)]));
    expect(
      meet(
        SourceTupleType(DummySourceReason, [SourceIntType(DummySourceReason)]),
        SourceTupleType(DummySourceReason, [SourceUnknownType(DummySourceReason)])
      )
    ).toEqual(SourceTupleType(DummySourceReason, [SourceIntType(DummySourceReason)]));
  });

  it('t1=function type', () => {
    expect(
      meet(
        SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        SourceUnitType(DummySourceReason)
      )
    ).toBe('FAILED_MEET');
    expect(
      meet(
        SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B')
      )
    ).toBe('FAILED_MEET');
    expect(
      meet(
        SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceIntType(DummySourceReason)
        )
      )
    ).toBe('FAILED_MEET');
    expect(
      meet(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceIntType(DummySourceReason)
        ),
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceIntType(DummySourceReason)
        )
      )
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [SourceIntType(DummySourceReason)],
        SourceIntType(DummySourceReason)
      )
    );

    expect(
      meet(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        ),
        SourceUnknownType(DummySourceReason)
      )
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [SourceIntType(DummySourceReason)],
        SourceBoolType(DummySourceReason)
      )
    );
    expect(
      meet(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        ),
        SourceFunctionType(
          DummySourceReason,
          [SourceUnknownType(DummySourceReason)],
          SourceUnknownType(DummySourceReason)
        )
      )
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [SourceIntType(DummySourceReason)],
        SourceBoolType(DummySourceReason)
      )
    );
  });
});
