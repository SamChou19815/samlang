import { ENCODED_COMPILED_PROGRAM_MAIN } from '../../ast/common/name-encoder';
import {
  MIR_ZERO,
  MIR_NAME,
  MIR_TEMP,
  MIR_OP,
  MIR_IMMUTABLE_MEM,
  MIR_MOVE_TEMP,
  MIR_CALL_FUNCTION,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_JUMP,
  MIR_RETURN,
  MIR_CJUMP_FALLTHROUGH,
} from '../../ast/mir';
import analyzeUsedFunctionNames from '../used-name-analysis';

it('analyzeUsedFunctionNames test', () => {
  expect(
    Array.from(
      analyzeUsedFunctionNames({
        globalVariables: [],
        functions: [
          {
            functionName: ENCODED_COMPILED_PROGRAM_MAIN,
            argumentNames: [],
            hasReturn: false,
            mainBodyStatements: [MIR_CALL_FUNCTION('foo', [])],
          },
          {
            functionName: 'foo',
            argumentNames: [],
            hasReturn: false,
            mainBodyStatements: [
              MIR_MOVE_TEMP(MIR_TEMP(''), MIR_ZERO),
              MIR_MOVE_IMMUTABLE_MEM(
                MIR_IMMUTABLE_MEM(MIR_NAME('bar')),
                MIR_IMMUTABLE_MEM(MIR_NAME('bar'))
              ),
              MIR_JUMP(''),
              MIR_CALL_FUNCTION('baz', [MIR_NAME('haha')]),
              MIR_RETURN(MIR_NAME('bar')),
              MIR_RETURN(),
              MIR_CJUMP_FALLTHROUGH(MIR_OP('+', MIR_NAME('foo'), MIR_NAME('bar')), ''),
            ],
          },
          {
            functionName: 'bar',
            argumentNames: [],
            hasReturn: false,
            mainBodyStatements: [MIR_CALL_FUNCTION('foo', [])],
          },
          {
            functionName: 'baz',
            argumentNames: [],
            hasReturn: false,
            mainBodyStatements: [],
          },
        ],
      }).values()
    ).sort((a, b) => a.localeCompare(b))
  ).toEqual([ENCODED_COMPILED_PROGRAM_MAIN, 'bar', 'baz', 'foo', 'haha']);
});
