import { ModuleReference, Range } from '../../ast/common-nodes';
import {
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { checkAndInfer, ConstraintAwareChecker } from '../constraint-aware-checker';
import TypeResolution from '../type-resolution';

describe('constraint-aware-checker', () => {
  it('t1=primitive type', () => {
    const resolution = new TypeResolution();

    expect(checkAndInfer(SourceUnitType, SourceUnitType, resolution)).toEqual(SourceUnitType);
    expect(checkAndInfer(SourceUnitType, SourceBoolType, resolution).type).toBe('FAILED_MEET');
    expect(checkAndInfer(SourceUnitType, SourceIntType, resolution).type).toBe('FAILED_MEET');
    expect(checkAndInfer(SourceUnitType, SourceStringType, resolution).type).toBe('FAILED_MEET');
    expect(
      checkAndInfer(SourceUnitType, SourceIdentifierType(ModuleReference.DUMMY, 'A'), resolution)
        .type
    ).toBe('FAILED_MEET');

    expect(checkAndInfer(SourceUnitType, { type: 'UndecidedType', index: 0 }, resolution)).toEqual(
      SourceUnitType
    );
    expect(checkAndInfer(SourceIntType, { type: 'UndecidedType', index: 0 }, resolution).type).toBe(
      'FAILED_MEET'
    );
  });

  it('t1=identifier type', () => {
    const resolution = new TypeResolution();

    expect(
      checkAndInfer(SourceIdentifierType(ModuleReference.DUMMY, 'A'), SourceUnitType, resolution)
        .type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceIdentifierType(ModuleReference.DUMMY, 'A'),
        SourceIdentifierType(ModuleReference.DUMMY, 'B'),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceIdentifierType(ModuleReference.DUMMY, 'A'),
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [SourceIntType]),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(ModuleReference.DUMMY, 'B'),
        ]),
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(ModuleReference.DUMMY, 'B'),
        ]),
        resolution
      )
    ).toEqual(
      SourceIdentifierType(ModuleReference.DUMMY, 'A', [
        SourceIdentifierType(ModuleReference.DUMMY, 'B'),
      ])
    );

    expect(
      checkAndInfer(
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [
          SourceIdentifierType(ModuleReference.DUMMY, 'B'),
        ]),
        SourceIdentifierType(ModuleReference.DUMMY, 'A', [{ type: 'UndecidedType', index: 0 }]),
        resolution
      )
    ).toEqual(
      SourceIdentifierType(ModuleReference.DUMMY, 'A', [
        SourceIdentifierType(ModuleReference.DUMMY, 'B'),
      ])
    );
    expect(
      checkAndInfer(
        SourceIdentifierType(ModuleReference.DUMMY, 'B'),
        { type: 'UndecidedType', index: 0 },
        resolution
      )
    ).toEqual(SourceIdentifierType(ModuleReference.DUMMY, 'B'));
  });

  it('t1=tuple type', () => {
    const resolution = new TypeResolution();

    expect(checkAndInfer(SourceTupleType([]), SourceUnitType, resolution).type).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceTupleType([]),
        SourceIdentifierType(ModuleReference.DUMMY, 'B'),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(SourceTupleType([]), SourceTupleType([SourceIntType]), resolution).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(SourceTupleType([SourceIntType]), SourceTupleType([SourceIntType]), resolution)
    ).toEqual(SourceTupleType([SourceIntType]));

    expect(
      checkAndInfer(
        SourceTupleType([SourceIntType]),
        { type: 'UndecidedType', index: 0 },
        resolution
      )
    ).toEqual(SourceTupleType([SourceIntType]));
    expect(
      checkAndInfer(
        { type: 'UndecidedType', index: 0 },
        SourceTupleType([{ type: 'UndecidedType', index: 1 }]),
        resolution
      )
    ).toEqual(SourceTupleType([SourceIntType]));
    expect(
      checkAndInfer(SourceBoolType, { type: 'UndecidedType', index: 1 }, resolution).type
    ).toBe('FAILED_MEET');
  });

  it('t1=function type', () => {
    const resolution = new TypeResolution();

    expect(
      checkAndInfer(SourceFunctionType([], SourceIntType), SourceUnitType, resolution).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceFunctionType([], SourceIntType),
        SourceIdentifierType(ModuleReference.DUMMY, 'B'),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceFunctionType([], SourceIntType),
        SourceFunctionType([SourceIntType], SourceIntType),
        resolution
      ).type
    ).toBe('FAILED_MEET');
    expect(
      checkAndInfer(
        SourceFunctionType([SourceIntType], SourceIntType),
        SourceFunctionType([SourceIntType], SourceIntType),
        resolution
      )
    ).toEqual(SourceFunctionType([SourceIntType], SourceIntType));

    expect(
      checkAndInfer(
        SourceFunctionType([SourceIntType], SourceBoolType),
        { type: 'UndecidedType', index: 0 },
        resolution
      )
    ).toEqual(SourceFunctionType([SourceIntType], SourceBoolType));
    expect(
      checkAndInfer(
        { type: 'UndecidedType', index: 0 },
        SourceFunctionType([{ type: 'UndecidedType', index: 1 }], {
          type: 'UndecidedType',
          index: 2,
        }),
        resolution
      )
    ).toEqual(SourceFunctionType([SourceIntType], SourceBoolType));
    expect(
      checkAndInfer(SourceBoolType, { type: 'UndecidedType', index: 1 }, resolution).type
    ).toBe('FAILED_MEET');
    expect(checkAndInfer(SourceIntType, { type: 'UndecidedType', index: 2 }, resolution).type).toBe(
      'FAILED_MEET'
    );
  });

  it('t1=undecided type', () => {
    const resolution = new TypeResolution();

    expect(
      checkAndInfer({ type: 'UndecidedType', index: 10086 }, SourceIntType, resolution)
    ).toEqual(SourceIntType);

    expect(
      checkAndInfer(
        { type: 'UndecidedType', index: 0 },
        { type: 'UndecidedType', index: 1 },
        resolution
      )
    ).toEqual({ type: 'UndecidedType', index: 0 });

    expect(checkAndInfer(SourceBoolType, { type: 'UndecidedType', index: 0 }, resolution)).toEqual(
      SourceBoolType
    );
    expect(checkAndInfer({ type: 'UndecidedType', index: 0 }, SourceIntType, resolution).type).toBe(
      'FAILED_MEET'
    );
    expect(checkAndInfer({ type: 'UndecidedType', index: 1 }, SourceBoolType, resolution)).toEqual(
      SourceBoolType
    );

    expect(
      checkAndInfer(
        { type: 'UndecidedType', index: 0 },
        { type: 'UndecidedType', index: 2 },
        resolution
      )
    ).toEqual(SourceBoolType);
    expect(
      checkAndInfer(
        { type: 'UndecidedType', index: 0 },
        { type: 'UndecidedType', index: 3 },
        resolution
      )
    ).toEqual(SourceBoolType);
    expect(
      checkAndInfer(
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 3 },
        resolution
      )
    ).toEqual(SourceBoolType);

    expect(
      checkAndInfer(
        { type: 'UndecidedType', index: 4 },
        { type: 'UndecidedType', index: 5 },
        resolution
      )
    ).toEqual({ type: 'UndecidedType', index: 4 });
    expect(
      checkAndInfer(
        { type: 'UndecidedType', index: 6 },
        { type: 'UndecidedType', index: 7 },
        resolution
      )
    ).toEqual({ type: 'UndecidedType', index: 6 });
    expect(
      checkAndInfer(
        { type: 'UndecidedType', index: 4 },
        { type: 'UndecidedType', index: 7 },
        resolution
      )
    ).toEqual({ type: 'UndecidedType', index: 4 });
  });

  it('checkAndInferWithErrorRecording type', () => {
    const resolution = new TypeResolution();
    const globalCollector = createGlobalErrorCollector();
    const moduleCollector = globalCollector.getModuleErrorCollector(ModuleReference.DUMMY);

    expect(
      new ConstraintAwareChecker(resolution, moduleCollector).checkAndInfer(
        SourceUnitType,
        SourceUnitType,
        Range.DUMMY
      )
    ).toEqual(SourceUnitType);
    expect(globalCollector.getErrors()).toEqual([]);
    new ConstraintAwareChecker(resolution, moduleCollector).checkAndInfer(
      SourceUnitType,
      SourceBoolType,
      Range.DUMMY
    );
    expect(globalCollector.getErrors().map((it) => it.errorType)).toEqual(['UnexpectedType']);
  });
});
