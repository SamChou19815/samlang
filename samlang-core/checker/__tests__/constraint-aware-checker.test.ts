import { DummySourceReason, Location, ModuleReference } from '../../ast/common-nodes';
import {
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { checkAndInfer, ConstraintAwareChecker } from '../constraint-aware-checker';
import TypeResolution from '../type-resolution';

describe('constraint-aware-checker', () => {
  it('t1=primitive type', () => {
    const resolution = new TypeResolution();

    expect(
      checkAndInfer(
        SourceUnitType(DummySourceReason),
        SourceUnitType(DummySourceReason),
        resolution
      )
    ).toEqual(SourceUnitType(DummySourceReason));
    expect(
      checkAndInfer(
        SourceUnitType(DummySourceReason),
        SourceBoolType(DummySourceReason),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(SourceUnitType(DummySourceReason), SourceIntType(DummySourceReason), resolution)
        .type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceUnitType(DummySourceReason),
        SourceStringType(DummySourceReason),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceUnitType(DummySourceReason),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        resolution
      ).type
    ).toBe('FAILED_MEET');

    expect(
      checkAndInfer(
        SourceUnitType(DummySourceReason),
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        resolution
      )
    ).toEqual(SourceUnitType(DummySourceReason));
    expect(
      checkAndInfer(
        SourceIntType(DummySourceReason),
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        resolution
      ).type
    ).toBe('FAILED_MEET');
  });

  it('t1=identifier type', () => {
    const resolution = new TypeResolution();

    expect(
      checkAndInfer(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        SourceUnitType(DummySourceReason),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIntType(DummySourceReason),
        ]),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        ]),
        resolution
      )
    ).toEqual(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
      ])
    );

    expect(
      checkAndInfer(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
          { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        ]),
        resolution
      )
    ).toEqual(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
      ])
    );
    expect(
      checkAndInfer(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        resolution
      )
    ).toEqual(SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'));
  });

  it('t1=function type', () => {
    const resolution = new TypeResolution();

    expect(
      checkAndInfer(
        SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        SourceUnitType(DummySourceReason),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceIntType(DummySourceReason)
        ),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceIntType(DummySourceReason)
        ),
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceIntType(DummySourceReason)
        ),
        resolution
      )
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [SourceIntType(DummySourceReason)],
        SourceIntType(DummySourceReason)
      )
    );

    expect(
      checkAndInfer(
        SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceBoolType(DummySourceReason)
        ),
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        resolution
      )
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [SourceIntType(DummySourceReason)],
        SourceBoolType(DummySourceReason)
      )
    );
    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        SourceFunctionType(
          DummySourceReason,
          [{ type: 'UndecidedType', reason: DummySourceReason, index: 1 }],
          {
            type: 'UndecidedType',
            reason: DummySourceReason,
            index: 2,
          }
        ),
        resolution
      )
    ).toEqual(
      SourceFunctionType(
        DummySourceReason,
        [SourceIntType(DummySourceReason)],
        SourceBoolType(DummySourceReason)
      )
    );
    expect(
      checkAndInfer(
        SourceBoolType(DummySourceReason),
        { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceIntType(DummySourceReason),
        { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        resolution
      ).type
    ).toBe('FAILED_MEET');
  });

  it('t1=undecided type', () => {
    const resolution = new TypeResolution();

    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 10086 },
        SourceIntType(DummySourceReason),
        resolution
      )
    ).toEqual(SourceIntType(DummySourceReason));

    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        resolution
      )
    ).toEqual({ type: 'UndecidedType', reason: DummySourceReason, index: 0 });

    expect(
      checkAndInfer(
        SourceBoolType(DummySourceReason),
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        resolution
      )
    ).toEqual(SourceBoolType(DummySourceReason));
    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        SourceIntType(DummySourceReason),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        SourceBoolType(DummySourceReason),
        resolution
      )
    ).toEqual(SourceBoolType(DummySourceReason));

    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        resolution
      )
    ).toEqual(SourceBoolType(DummySourceReason));
    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 3 },
        resolution
      )
    ).toEqual(SourceBoolType(DummySourceReason));
    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 3 },
        resolution
      )
    ).toEqual(SourceBoolType(DummySourceReason));

    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 4 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 5 },
        resolution
      )
    ).toEqual({ type: 'UndecidedType', reason: DummySourceReason, index: 4 });
    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 6 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 7 },
        resolution
      )
    ).toEqual({ type: 'UndecidedType', reason: DummySourceReason, index: 6 });
    expect(
      checkAndInfer(
        { type: 'UndecidedType', reason: DummySourceReason, index: 4 },
        { type: 'UndecidedType', reason: DummySourceReason, index: 7 },
        resolution
      )
    ).toEqual({ type: 'UndecidedType', reason: DummySourceReason, index: 4 });
  });

  it('checkAndInferWithErrorRecording type', () => {
    const resolution = new TypeResolution();
    const globalCollector = createGlobalErrorCollector();
    const moduleCollector = globalCollector.getModuleErrorCollector();

    expect(
      new ConstraintAwareChecker(resolution, moduleCollector).checkAndInfer(
        SourceUnitType(DummySourceReason),
        SourceUnitType(DummySourceReason),
        Location.DUMMY
      )
    ).toEqual(SourceUnitType(DummySourceReason));
    expect(globalCollector.getErrors()).toEqual([]);
    new ConstraintAwareChecker(resolution, moduleCollector).checkAndInfer(
      SourceUnitType(DummySourceReason),
      SourceBoolType(DummySourceReason),
      Location.DUMMY
    );
    expect(globalCollector.getErrors().map((it) => it.errorType)).toEqual(['UnexpectedType']);
  });
});
