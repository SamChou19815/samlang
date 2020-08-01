import { Range, Position } from '../..';
import { EXPRESSION_TRUE } from '../../ast/lang/samlang-expressions';
import { EMPTY, ClassValue } from '../interpretation-context';
import { FunctionValue, Value } from '../value';

it('empty context equality check', () => {
  expect(EMPTY).toEqual(EMPTY);
});

it('non-empty context equality check', () => {
  const testFunctions: Record<string, FunctionValue | undefined> = {};
  const testMethods: Record<string, FunctionValue | undefined> = {};
  const samlangExpression = EXPRESSION_TRUE(new Range(new Position(1, 2), new Position(3, 4)));
  const functionValue: FunctionValue = {
    type: 'functionValue',
    arguments: [],
    body: samlangExpression,
    context: EMPTY,
  };
  testFunctions.function1 = functionValue;
  testMethods.method1 = functionValue;
  const testClassValue = { functions: testFunctions, methods: testMethods };
  const testClasses: Record<string, ClassValue | undefined> = {};
  testClasses.class1 = testClassValue;
  const testLocalValues: Record<string, Value | undefined> = {};
  testLocalValues.v1 = { type: 'unit' };
  const testContext = { classes: testClasses, localValues: testLocalValues };

  expect(testContext).toEqual(testContext);
});
