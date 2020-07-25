import {
  MidIRFunction,
  midIRFunctionToString,
  MIR_ZERO,
  MIR_ONE,
  MIR_TEMP,
  MIR_OP,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
  MIR_MOVE_TEMP,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
} from '../../ast/mir';
import optimizeIRWithTailRecursiveCallTransformation from '../tail-recursion-optimization';

const optimizeAndTurnIntoString = (midIRFunction: MidIRFunction): string =>
  midIRFunctionToString(optimizeIRWithTailRecursiveCallTransformation(midIRFunction));

it('run optimizeIRWithTailRecursiveCallTransformation on empty function.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'emptyFunction',
      argumentNames: [],
      hasReturn: false,
      mainBodyStatements: [],
    })
  ).toBe(`function emptyFunction {

}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation on dynamicCall.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'dynamicCall',
      argumentNames: [],
      hasReturn: false,
      mainBodyStatements: [MIR_CALL_FUNCTION(MIR_TEMP('aaa'), [], 'dummy'), MIR_RETURN()],
    })
  ).toBe(`function dynamicCall {

  dummy = aaa();
  return;
}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation infiniteLoop.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'infiniteLoop',
      argumentNames: [],
      hasReturn: false,
      mainBodyStatements: [MIR_CALL_FUNCTION('infiniteLoop', []), MIR_RETURN()],
    })
  ).toBe(`function infiniteLoop {

  LABEL_TAIL_REC_OPTIMIZATION_FOR_infiniteLoop:
  goto LABEL_TAIL_REC_OPTIMIZATION_FOR_infiniteLoop;
}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation infiniteLoopWithLabel.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'infiniteLoopWithLabel',
      argumentNames: [],
      hasReturn: false,
      mainBodyStatements: [
        MIR_CALL_FUNCTION('infiniteLoopWithLabel', []),
        MIR_LABEL('fooBar'),
        MIR_RETURN(),
      ],
    })
  ).toBe(`function infiniteLoopWithLabel {

  LABEL_TAIL_REC_OPTIMIZATION_FOR_infiniteLoopWithLabel:
  goto LABEL_TAIL_REC_OPTIMIZATION_FOR_infiniteLoopWithLabel;
}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation on factorial.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'factorial',
      argumentNames: ['n', 'acc'],
      hasReturn: true,
      mainBodyStatements: [
        MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
        MIR_CALL_FUNCTION(
          'factorial',
          [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
          'dummy'
        ),
        MIR_RETURN(MIR_TEMP('dummy')),
        MIR_LABEL('LABEL_RETURN_ACC'),
        MIR_RETURN(MIR_TEMP('acc')),
      ],
    })
  ).toBe(`function factorial {
  let n = _ARG0;
  let acc = _ARG1;

  LABEL_TAIL_REC_OPTIMIZATION_FOR_factorial:
  if ((n == 0)) goto LABEL_RETURN_ACC;
  _OPT_TAIL_REC_ARG_TEMP_0 = (n - 1);
  _OPT_TAIL_REC_ARG_TEMP_1 = (acc * n);
  n = _OPT_TAIL_REC_ARG_TEMP_0;
  acc = _OPT_TAIL_REC_ARG_TEMP_1;
  goto LABEL_TAIL_REC_OPTIMIZATION_FOR_factorial;
  LABEL_RETURN_ACC:
  return acc;
}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation on factorialWithSelfCallReturnNothing.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'factorialWithSelfCallReturnNothing',
      argumentNames: ['n', 'acc'],
      hasReturn: true,
      mainBodyStatements: [
        MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
        MIR_CALL_FUNCTION(
          'factorialWithSelfCallReturnNothing',
          [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
          'dummy'
        ),
        MIR_RETURN(),
        MIR_LABEL('LABEL_RETURN_ACC'),
        MIR_RETURN(MIR_TEMP('acc')),
      ],
    })
  ).toBe(`function factorialWithSelfCallReturnNothing {
  let n = _ARG0;
  let acc = _ARG1;

  LABEL_TAIL_REC_OPTIMIZATION_FOR_factorialWithSelfCallReturnNothing:
  if ((n == 0)) goto LABEL_RETURN_ACC;
  _OPT_TAIL_REC_ARG_TEMP_0 = (n - 1);
  _OPT_TAIL_REC_ARG_TEMP_1 = (acc * n);
  n = _OPT_TAIL_REC_ARG_TEMP_0;
  acc = _OPT_TAIL_REC_ARG_TEMP_1;
  goto LABEL_TAIL_REC_OPTIMIZATION_FOR_factorialWithSelfCallReturnNothing;
  LABEL_RETURN_ACC:
  return acc;
}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation on factorialWithGarbage.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'factorialWithGarbage',
      argumentNames: ['n', 'acc'],
      hasReturn: true,
      mainBodyStatements: [
        MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
        MIR_CALL_FUNCTION(
          'factorialWithGarbage',
          [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
          'dummy'
        ),
        MIR_MOVE_TEMP(MIR_TEMP('dummy'), MIR_TEMP('garbage')),
        MIR_RETURN(MIR_TEMP('dummy')),
        MIR_LABEL('LABEL_RETURN_ACC'),
        MIR_RETURN(MIR_TEMP('acc')),
      ],
    })
  ).toBe(`function factorialWithGarbage {
  let n = _ARG0;
  let acc = _ARG1;

  if ((n == 0)) goto LABEL_RETURN_ACC;
  dummy = factorialWithGarbage((n - 1), (acc * n));
  dummy = garbage;
  return dummy;
  LABEL_RETURN_ACC:
  return acc;
}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation on factorialWithReturnGarbage1.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'factorialWithReturnGarbage1',
      argumentNames: ['n', 'acc'],
      hasReturn: true,
      mainBodyStatements: [
        MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
        MIR_CALL_FUNCTION(
          'factorialWithReturnGarbage1',
          [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
          'dummy'
        ),
        MIR_RETURN(MIR_TEMP('garbage')),
        MIR_LABEL('LABEL_RETURN_ACC'),
        MIR_RETURN(MIR_TEMP('acc')),
      ],
    })
  ).toBe(`function factorialWithReturnGarbage1 {
  let n = _ARG0;
  let acc = _ARG1;

  if ((n == 0)) goto LABEL_RETURN_ACC;
  dummy = factorialWithReturnGarbage1((n - 1), (acc * n));
  return garbage;
  LABEL_RETURN_ACC:
  return acc;
}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation on factorialWithReturnGarbage2.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'factorialWithReturnGarbage2',
      argumentNames: ['n', 'acc'],
      hasReturn: true,
      mainBodyStatements: [
        MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
        MIR_CALL_FUNCTION(
          'factorialWithReturnGarbage2',
          [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
          'dummy'
        ),
        MIR_RETURN(MIR_ZERO),
        MIR_LABEL('LABEL_RETURN_ACC'),
        MIR_RETURN(MIR_TEMP('acc')),
      ],
    })
  ).toBe(`function factorialWithReturnGarbage2 {
  let n = _ARG0;
  let acc = _ARG1;

  if ((n == 0)) goto LABEL_RETURN_ACC;
  dummy = factorialWithReturnGarbage2((n - 1), (acc * n));
  return 0;
  LABEL_RETURN_ACC:
  return acc;
}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation on factorialWithIntermediateMove.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'factorialWithIntermediateMove',
      argumentNames: ['n', 'acc'],
      hasReturn: true,
      mainBodyStatements: [
        MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
        MIR_CALL_FUNCTION(
          'factorialWithIntermediateMove',
          [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
          'dummy'
        ),
        MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('dummy')),
        MIR_MOVE_TEMP(MIR_TEMP('b'), MIR_TEMP('a')),
        MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_TEMP('b')),
        MIR_RETURN(MIR_TEMP('c')),
        MIR_LABEL('LABEL_RETURN_ACC'),
        MIR_RETURN(MIR_TEMP('acc')),
      ],
    })
  ).toBe(`function factorialWithIntermediateMove {
  let n = _ARG0;
  let acc = _ARG1;

  LABEL_TAIL_REC_OPTIMIZATION_FOR_factorialWithIntermediateMove:
  if ((n == 0)) goto LABEL_RETURN_ACC;
  _OPT_TAIL_REC_ARG_TEMP_0 = (n - 1);
  _OPT_TAIL_REC_ARG_TEMP_1 = (acc * n);
  n = _OPT_TAIL_REC_ARG_TEMP_0;
  acc = _OPT_TAIL_REC_ARG_TEMP_1;
  goto LABEL_TAIL_REC_OPTIMIZATION_FOR_factorialWithIntermediateMove;
  LABEL_RETURN_ACC:
  return acc;
}
`);
});

it('run optimizeIRWithTailRecursiveCallTransformation on factorialWithIntermediateJump.', () => {
  expect(
    optimizeAndTurnIntoString({
      functionName: 'factorialWithIntermediateJump',
      argumentNames: ['n', 'acc'],
      hasReturn: true,
      mainBodyStatements: [
        MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
        MIR_CALL_FUNCTION(
          'factorialWithIntermediateJump',
          [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
          'dummy'
        ),
        MIR_JUMP('aaa'),
        MIR_LABEL('LABEL_RETURN_ACC'),
        MIR_RETURN(MIR_TEMP('acc')),
      ],
    })
  ).toBe(`function factorialWithIntermediateJump {
  let n = _ARG0;
  let acc = _ARG1;

  if ((n == 0)) goto LABEL_RETURN_ACC;
  dummy = factorialWithIntermediateJump((n - 1), (acc * n));
  goto aaa;
  LABEL_RETURN_ACC:
  return acc;
}
`);
});
