import {
  unitType,
  boolType,
  intType,
  stringType,
  identifierType,
  tupleType,
  functionType,
} from '../../ast/common-nodes';
import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';
import { createGlobalErrorCollector } from '../../errors';
import { checkAndInfer, ConstraintAwareChecker } from '../constraint-aware-checker';
import TypeResolution from '../type-resolution';

it('t1=primitive type', () => {
  const resolution = new TypeResolution();

  expect(checkAndInfer(unitType, unitType, resolution)).toEqual(unitType);
  expect(checkAndInfer(unitType, boolType, resolution).type).toBe('FAILED_MEET');
  expect(checkAndInfer(unitType, intType, resolution).type).toBe('FAILED_MEET');
  expect(checkAndInfer(unitType, stringType, resolution).type).toBe('FAILED_MEET');
  expect(checkAndInfer(unitType, identifierType('A'), resolution).type).toBe('FAILED_MEET');

  expect(checkAndInfer(unitType, { type: 'UndecidedType', index: 0 }, resolution)).toEqual(
    unitType
  );
  expect(checkAndInfer(intType, { type: 'UndecidedType', index: 0 }, resolution).type).toBe(
    'FAILED_MEET'
  );
});

it('t1=identifier type', () => {
  const resolution = new TypeResolution();

  expect(checkAndInfer(identifierType('A'), unitType, resolution).type).toBe('FAILED_MEET');
  expect(checkAndInfer(identifierType('A'), identifierType('B'), resolution).type).toBe(
    'FAILED_MEET'
  );
  expect(checkAndInfer(identifierType('A'), identifierType('A', [intType]), resolution).type).toBe(
    'FAILED_MEET'
  );
  expect(
    checkAndInfer(
      identifierType('A', [identifierType('B')]),
      identifierType('A', [identifierType('B')]),
      resolution
    )
  ).toEqual(identifierType('A', [identifierType('B')]));

  expect(
    checkAndInfer(
      identifierType('A', [identifierType('B')]),
      identifierType('A', [{ type: 'UndecidedType', index: 0 }]),
      resolution
    )
  ).toEqual(identifierType('A', [identifierType('B')]));
  expect(
    checkAndInfer(identifierType('B'), { type: 'UndecidedType', index: 0 }, resolution)
  ).toEqual(identifierType('B'));
});

it('t1=tuple type', () => {
  const resolution = new TypeResolution();

  expect(checkAndInfer(tupleType([]), unitType, resolution).type).toBe('FAILED_MEET');
  expect(checkAndInfer(tupleType([]), identifierType('B'), resolution).type).toBe('FAILED_MEET');
  expect(checkAndInfer(tupleType([]), tupleType([intType]), resolution).type).toBe('FAILED_MEET');
  expect(checkAndInfer(tupleType([intType]), tupleType([intType]), resolution)).toEqual(
    tupleType([intType])
  );

  expect(
    checkAndInfer(tupleType([intType]), { type: 'UndecidedType', index: 0 }, resolution)
  ).toEqual(tupleType([intType]));
  expect(
    checkAndInfer(
      { type: 'UndecidedType', index: 0 },
      tupleType([{ type: 'UndecidedType', index: 1 }]),
      resolution
    )
  ).toEqual(tupleType([intType]));
  expect(checkAndInfer(boolType, { type: 'UndecidedType', index: 1 }, resolution).type).toBe(
    'FAILED_MEET'
  );
});

it('t1=function type', () => {
  const resolution = new TypeResolution();

  expect(checkAndInfer(functionType([], intType), unitType, resolution).type).toBe('FAILED_MEET');
  expect(checkAndInfer(functionType([], intType), identifierType('B'), resolution).type).toBe(
    'FAILED_MEET'
  );
  expect(
    checkAndInfer(functionType([], intType), functionType([intType], intType), resolution).type
  ).toBe('FAILED_MEET');
  expect(
    checkAndInfer(functionType([intType], intType), functionType([intType], intType), resolution)
  ).toEqual(functionType([intType], intType));

  expect(
    checkAndInfer(
      functionType([intType], boolType),
      { type: 'UndecidedType', index: 0 },
      resolution
    )
  ).toEqual(functionType([intType], boolType));
  expect(
    checkAndInfer(
      { type: 'UndecidedType', index: 0 },
      functionType([{ type: 'UndecidedType', index: 1 }], { type: 'UndecidedType', index: 2 }),
      resolution
    )
  ).toEqual(functionType([intType], boolType));
  expect(checkAndInfer(boolType, { type: 'UndecidedType', index: 1 }, resolution).type).toBe(
    'FAILED_MEET'
  );
  expect(checkAndInfer(intType, { type: 'UndecidedType', index: 2 }, resolution).type).toBe(
    'FAILED_MEET'
  );
});

it('t1=undecided type', () => {
  const resolution = new TypeResolution();

  expect(checkAndInfer({ type: 'UndecidedType', index: 10086 }, intType, resolution)).toEqual(
    intType
  );

  expect(
    checkAndInfer(
      { type: 'UndecidedType', index: 0 },
      { type: 'UndecidedType', index: 1 },
      resolution
    )
  ).toEqual({ type: 'UndecidedType', index: 0 });

  expect(checkAndInfer(boolType, { type: 'UndecidedType', index: 0 }, resolution)).toEqual(
    boolType
  );
  expect(checkAndInfer({ type: 'UndecidedType', index: 0 }, intType, resolution).type).toBe(
    'FAILED_MEET'
  );
  expect(checkAndInfer({ type: 'UndecidedType', index: 1 }, boolType, resolution)).toEqual(
    boolType
  );

  expect(
    checkAndInfer(
      { type: 'UndecidedType', index: 0 },
      { type: 'UndecidedType', index: 2 },
      resolution
    )
  ).toEqual(boolType);
  expect(
    checkAndInfer(
      { type: 'UndecidedType', index: 0 },
      { type: 'UndecidedType', index: 3 },
      resolution
    )
  ).toEqual(boolType);
  expect(
    checkAndInfer(
      { type: 'UndecidedType', index: 2 },
      { type: 'UndecidedType', index: 3 },
      resolution
    )
  ).toEqual(boolType);

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
  const moduleCollector = globalCollector.getModuleErrorCollector(ModuleReference.ROOT);

  expect(
    new ConstraintAwareChecker(resolution, moduleCollector).checkAndInfer(
      unitType,
      unitType,
      Range.DUMMY
    )
  ).toEqual(unitType);
  expect(globalCollector.getErrors()).toEqual([]);
  new ConstraintAwareChecker(resolution, moduleCollector).checkAndInfer(
    unitType,
    boolType,
    Range.DUMMY
  );
  expect(globalCollector.getErrors().map((it) => it.errorType)).toEqual(['UnexpectedType']);
});
