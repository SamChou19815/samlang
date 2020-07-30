import { Range, Position } from '../..';
import { EXPRESSION_TRUE } from '../../ast/lang/samlang-expressions';
import { EMPTY, isSameContext, ClassValue } from '../interpretation-context';
import { FunctionValue, Value } from '../value';

it('empty context equality check', () => {
  expect(isSameContext(EMPTY, EMPTY)).toBeTruthy();
});

it('non-empty context equality check', () => {
  const testFunctions = new Map<string, FunctionValue>();
  const testMethods = new Map<string, FunctionValue>();
  const samlangExpression = EXPRESSION_TRUE(new Range(new Position(1, 2), new Position(3, 4)));
  const functionValue: FunctionValue = {
    type: 'functionValue',
    arguments: [],
    body: samlangExpression,
    context: { classes: new Map(), localValues: new Map() },
  };
  testFunctions.set('function1', functionValue);
  testMethods.set('method1', functionValue);
  const testClassValue = { functions: testFunctions, methods: testMethods };
  const testClasses = new Map<string, ClassValue>();
  testClasses.set('class1', testClassValue);
  const testLocalValues = new Map<string, Value>();
  testLocalValues.set('v1', { type: 'unit' });
  const testContext = { classes: testClasses, localValues: testLocalValues };

  expect(isSameContext(testContext, testContext)).toBeTruthy();
});
