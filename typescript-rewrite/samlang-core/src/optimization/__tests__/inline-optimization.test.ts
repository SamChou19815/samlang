import {
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
  MIR_ZERO,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
} from '../../ast/mir';
// eslint-disable-next-line camelcase
import { estimateMidIRFunctionInlineCost_EXPOSED_FOR_TESTING } from '../inline-optimization';

it('estimateMidIRFunctionInlineCost test', () => {
  expect(
    estimateMidIRFunctionInlineCost_EXPOSED_FOR_TESTING({
      functionName: '',
      argumentNames: [],
      hasReturn: true,
      mainBodyStatements: [
        MIR_MOVE_TEMP(MIR_TEMP(''), MIR_TEMP('')), // 0,
        MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_IMMUTABLE_MEM(MIR_TEMP(''))), // 2
        MIR_JUMP(''), // 1
        MIR_LABEL(''), // 1
        MIR_RETURN(), // 1,
        MIR_CJUMP_FALLTHROUGH(MIR_TEMP(''), ''), // 1
        MIR_RETURN(MIR_OP('+', MIR_ZERO, MIR_ZERO)), // 2
        MIR_CALL_FUNCTION('f', [MIR_TEMP('')]), // 5 + 1 = 6
      ],
    })
  ).toBe(14);
});
