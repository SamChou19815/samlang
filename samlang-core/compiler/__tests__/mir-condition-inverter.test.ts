import {
  MIR_ZERO,
  MIR_ONE,
  MIR_EIGHT,
  MIR_NAME,
  MIR_TEMP,
  MIR_OP,
  MIR_IMMUTABLE_MEM,
} from '../../ast/mir-nodes';
import invertMidIRConditionExpression from '../mir-condition-inverter';

it('invertMidIRConditionExpression constant inversion tests', () => {
  expect(invertMidIRConditionExpression(MIR_ZERO)).toEqual(MIR_ONE);
  expect(invertMidIRConditionExpression(MIR_ONE)).toEqual(MIR_ZERO);
  expect(() => invertMidIRConditionExpression(MIR_EIGHT)).toThrow();
});

it('invertMidIRConditionExpression non-statically analyzable inversion tests', () => {
  expect(invertMidIRConditionExpression(MIR_NAME(''))).toEqual(MIR_OP('^', MIR_NAME(''), MIR_ONE));
  expect(invertMidIRConditionExpression(MIR_TEMP(''))).toEqual(MIR_OP('^', MIR_TEMP(''), MIR_ONE));
  expect(invertMidIRConditionExpression(MIR_IMMUTABLE_MEM(MIR_TEMP('')))).toEqual(
    MIR_OP('^', MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_ONE)
  );
});

it('invertMidIRConditionExpression binary expression tests', () => {
  expect(() => invertMidIRConditionExpression(MIR_OP('+', MIR_ZERO, MIR_ZERO))).toThrow();
  expect(() => invertMidIRConditionExpression(MIR_OP('-', MIR_ZERO, MIR_ZERO))).toThrow();
  expect(() => invertMidIRConditionExpression(MIR_OP('*', MIR_ZERO, MIR_ZERO))).toThrow();
  expect(() => invertMidIRConditionExpression(MIR_OP('/', MIR_ZERO, MIR_ZERO))).toThrow();
  expect(() => invertMidIRConditionExpression(MIR_OP('%', MIR_ZERO, MIR_ZERO))).toThrow();

  expect(invertMidIRConditionExpression(MIR_OP('^', MIR_ZERO, MIR_ONE))).toEqual(MIR_ZERO);
  expect(invertMidIRConditionExpression(MIR_OP('^', MIR_ONE, MIR_ZERO))).toEqual(MIR_ZERO);
  expect(invertMidIRConditionExpression(MIR_OP('^', MIR_ZERO, MIR_ZERO))).toEqual(
    MIR_OP('^', MIR_OP('^', MIR_ZERO, MIR_ZERO), MIR_ONE)
  );

  expect(invertMidIRConditionExpression(MIR_OP('<', MIR_ZERO, MIR_ONE))).toEqual(
    MIR_OP('>=', MIR_ZERO, MIR_ONE)
  );
  expect(invertMidIRConditionExpression(MIR_OP('<=', MIR_ZERO, MIR_ONE))).toEqual(
    MIR_OP('>', MIR_ZERO, MIR_ONE)
  );
  expect(invertMidIRConditionExpression(MIR_OP('>', MIR_ZERO, MIR_ONE))).toEqual(
    MIR_OP('<=', MIR_ZERO, MIR_ONE)
  );
  expect(invertMidIRConditionExpression(MIR_OP('>=', MIR_ZERO, MIR_ONE))).toEqual(
    MIR_OP('<', MIR_ZERO, MIR_ONE)
  );
  expect(invertMidIRConditionExpression(MIR_OP('==', MIR_ZERO, MIR_ONE))).toEqual(
    MIR_OP('!=', MIR_ZERO, MIR_ONE)
  );
  expect(invertMidIRConditionExpression(MIR_OP('!=', MIR_ZERO, MIR_ONE))).toEqual(
    MIR_OP('==', MIR_ZERO, MIR_ONE)
  );
});
