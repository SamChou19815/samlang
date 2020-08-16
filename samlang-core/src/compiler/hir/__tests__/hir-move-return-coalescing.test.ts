import {
  HIR_ZERO,
  HIR_ONE,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_WHILE_TRUE,
  HIR_LET,
  HIR_NAME,
  HIR_RETURN,
} from '../../../ast/hir/hir-expressions';
import coalesceMoveAndReturnWithForHighIRStatements from '../hir-move-return-coalescing';

it('coalesceMoveAndReturnWithForHighIRStatements empty array test', () => {
  expect(coalesceMoveAndReturnWithForHighIRStatements([])).toEqual([]);
});

it('coalesceMoveAndReturnWithForHighIRStatements not end with return test', () => {
  expect(coalesceMoveAndReturnWithForHighIRStatements([HIR_WHILE_TRUE([])])).toEqual([
    HIR_WHILE_TRUE([]),
  ]);
});

it('coalesceMoveAndReturnWithForHighIRStatements not end with return variable test', () => {
  expect(coalesceMoveAndReturnWithForHighIRStatements([HIR_RETURN(HIR_ZERO)])).toEqual([
    HIR_RETURN(HIR_ZERO),
  ]);
});

it('coalesceMoveAndReturnWithForHighIRStatements linear sequence test', () => {
  expect(
    coalesceMoveAndReturnWithForHighIRStatements([
      HIR_WHILE_TRUE([]),
      HIR_LET({ name: 'one_const_value', assignedExpression: HIR_ONE }),
      HIR_LET({ name: 'one2', assignedExpression: HIR_VARIABLE('one_const_value') }),
      HIR_LET({ name: 'one1', assignedExpression: HIR_VARIABLE('one2') }),
      HIR_LET({ name: 'one', assignedExpression: HIR_VARIABLE('one1') }),
      HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('one') }),
      HIR_RETURN(HIR_VARIABLE('_t1')),
    ])
  ).toEqual([HIR_WHILE_TRUE([]), HIR_RETURN(HIR_ONE)]);
});

it('coalesceMoveAndReturnWithForHighIRStatements failed linear sequence test', () => {
  expect(
    coalesceMoveAndReturnWithForHighIRStatements([
      HIR_WHILE_TRUE([]),
      HIR_LET({ name: 'one_const_value', assignedExpression: HIR_ONE }),
      HIR_LET({ name: 'one2', assignedExpression: HIR_VARIABLE('one_const_value') }),
      HIR_LET({ name: 'one1', assignedExpression: HIR_VARIABLE('one2') }),
      HIR_LET({ name: 'one', assignedExpression: HIR_VARIABLE('one1') }),
      HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('one') }),
      HIR_LET({ name: 'garbage', assignedExpression: HIR_VARIABLE('garbage') }),
      HIR_RETURN(HIR_VARIABLE('_t1')),
    ])
  ).toEqual([
    HIR_WHILE_TRUE([]),
    HIR_LET({ name: 'one_const_value', assignedExpression: HIR_ONE }),
    HIR_LET({ name: 'one2', assignedExpression: HIR_VARIABLE('one_const_value') }),
    HIR_LET({ name: 'one1', assignedExpression: HIR_VARIABLE('one2') }),
    HIR_LET({ name: 'one', assignedExpression: HIR_VARIABLE('one1') }),
    HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('one') }),
    HIR_LET({ name: 'garbage', assignedExpression: HIR_VARIABLE('garbage') }),
    HIR_RETURN(HIR_VARIABLE('_t1')),
  ]);
});

it('coalesceMoveAndReturnWithForHighIRStatements if-else test', () => {
  expect(
    coalesceMoveAndReturnWithForHighIRStatements([
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({ operator: '==', e1: HIR_VARIABLE('n'), e2: HIR_ZERO }),
        s1: [
          HIR_LET({ name: 'one_const_value', assignedExpression: HIR_ONE }),
          HIR_LET({ name: 'one2', assignedExpression: HIR_VARIABLE('one_const_value') }),
          HIR_LET({ name: 'one1', assignedExpression: HIR_VARIABLE('one2') }),
          HIR_LET({ name: 'one', assignedExpression: HIR_VARIABLE('one1') }),
          HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('one') }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_module__class_Class1_function_factorial'),
            functionArguments: [
              HIR_BINARY({ operator: '-', e1: HIR_VARIABLE('n'), e2: HIR_ONE }),
              HIR_BINARY({ operator: '*', e1: HIR_VARIABLE('n'), e2: HIR_VARIABLE('acc') }),
            ],
            returnCollector: '_t0',
          }),
          HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('_t0') }),
        ],
      }),
      HIR_RETURN(HIR_VARIABLE('_t1')),
    ])
  ).toEqual([
    HIR_IF_ELSE({
      booleanExpression: HIR_BINARY({ operator: '==', e1: HIR_VARIABLE('n'), e2: HIR_ZERO }),
      s1: [HIR_RETURN(HIR_ONE)],
      s2: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME('_module__class_Class1_function_factorial'),
          functionArguments: [
            HIR_BINARY({ operator: '-', e1: HIR_VARIABLE('n'), e2: HIR_ONE }),
            HIR_BINARY({ operator: '*', e1: HIR_VARIABLE('n'), e2: HIR_VARIABLE('acc') }),
          ],
          returnCollector: '_t0',
        }),
        HIR_RETURN(HIR_VARIABLE('_t0')),
      ],
    }),
  ]);
});
