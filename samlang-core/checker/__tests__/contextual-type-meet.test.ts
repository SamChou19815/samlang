import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
import {
  prettyPrintType,
  SamlangType,
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
  SourceUnknownType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import contextualTypeMeet from '../contextual-type-meet';

function meet(t1: SamlangType, t2: SamlangType) {
  const globalCollector = createGlobalErrorCollector();
  const errorReporter = globalCollector.getErrorReporter();
  const type = contextualTypeMeet(t1, t2, errorReporter);
  if (globalCollector.hasErrors) return 'FAILED_MEET';
  return prettyPrintType(type);
}

describe('contextual-type-meet', () => {
  it('t1=primitive type', () => {
    expect(meet(SourceUnitType(DummySourceReason), SourceUnitType(DummySourceReason))).toBe('unit');
    expect(meet(SourceUnitType(DummySourceReason), SourceBoolType(DummySourceReason))).toBe(
      'FAILED_MEET'
    );
    expect(meet(SourceUnitType(DummySourceReason), SourceIntType(DummySourceReason))).toBe(
      'FAILED_MEET'
    );
    expect(meet(SourceUnitType(DummySourceReason), SourceStringType(DummySourceReason))).toBe(
      'FAILED_MEET'
    );
    expect(meet(SourceUnknownType(DummySourceReason), SourceStringType(DummySourceReason))).toBe(
      'string'
    );
    expect(
      meet(
        SourceUnitType(DummySourceReason),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A')
      )
    ).toBe('FAILED_MEET');

    expect(meet(SourceUnitType(DummySourceReason), SourceUnknownType(DummySourceReason))).toBe(
      'unit'
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
    ).toBe('A<B>');

    expect(
      meet(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceUnknownType(DummySourceReason),
        ])
      )
    ).toBe('A<B>');
    expect(
      meet(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        SourceUnknownType(DummySourceReason)
      )
    ).toBe('B');
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
    ).toBe('(int) -> int');

    expect(
      meet(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        ),
        SourceUnknownType(DummySourceReason)
      )
    ).toBe('(int) -> bool');
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
    ).toBe('(int) -> bool');
  });
});
