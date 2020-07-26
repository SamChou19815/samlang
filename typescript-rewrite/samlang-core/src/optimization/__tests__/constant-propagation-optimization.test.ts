import {
  MIR_ZERO,
  MIR_ONE,
  MIR_CONST,
  MIR_TEMP,
  MIR_NAME,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  midIRStatementToString,
  MIR_RETURN,
} from '../../ast/mir';
import optimizeIRWithConstantPropagation from '../constant-propagation-optimization';

it('optimizeIRWithConstantPropagation test 1', () => {
  expect(
    optimizeIRWithConstantPropagation([
      MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_ONE),
      MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_CONST(BigInt(2))), 'true'),
      MIR_CALL_FUNCTION('f', [], 'y'),
      MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('+', MIR_ONE, MIR_ZERO)),
      MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('!=', MIR_ONE, MIR_ZERO)),
      MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_TEMP('z2')), MIR_OP('!=', MIR_ONE, MIR_ZERO)),
      MIR_JUMP('end'),
      MIR_LABEL('true'),
      MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
      MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('*', MIR_ONE, MIR_ONE)),
      MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('/', MIR_ONE, MIR_IMMUTABLE_MEM(MIR_ZERO))),
      MIR_CALL_FUNCTION(MIR_IMMUTABLE_MEM(MIR_TEMP('z2')), [MIR_OP('!=', MIR_ONE, MIR_ZERO)]),
      MIR_LABEL('end'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('!=', MIR_TEMP('y'), MIR_NAME('y'))),
      MIR_RETURN(MIR_TEMP('x')),
      MIR_RETURN(),
    ])
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(`x = 1;
goto true;
y = f();
z1 = 1;
z2 = 1;
MEM[1] = 1;
goto end;
true:
y = 2;
z1 = 1;
z2 = (1 / MEM[0]);
MEM[z2](1);
end:
a = (y != y);
return 1;
return;`);
});

it('optimizeIRWithConstantPropagation test 2', () => {
  expect(
    optimizeIRWithConstantPropagation([
      MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_ONE),
      MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_CONST(BigInt(2)), MIR_TEMP('x')), 'true'),
      MIR_CALL_FUNCTION('f', [], 'y'),
      MIR_MOVE_TEMP(MIR_TEMP('z1'), MIR_OP('+', MIR_ONE, MIR_ZERO)),
      MIR_MOVE_TEMP(MIR_TEMP('z2'), MIR_OP('!=', MIR_ONE, MIR_ZERO)),
      MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_TEMP('z2')), MIR_OP('!=', MIR_ONE, MIR_ZERO)),
      MIR_JUMP('end'),
      MIR_LABEL('true'),
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('z'), 'end'),
      MIR_LABEL('end'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('!=', MIR_TEMP('y'), MIR_NAME('y'))),
      MIR_RETURN(MIR_TEMP('x')),
      MIR_RETURN(),
    ])
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(`x = 1;
y = f();
z1 = 1;
z2 = 1;
MEM[1] = 1;
goto end;
true:
if (z) goto end;
end:
a = (y != y);
return 1;
return;`);
});
