import { stringType, identifierType, ModuleReference } from 'samlang-core-ast/common-nodes';
import {
  SamlangExpression,
  VariantConstructorExpression,
  SourceExpressionTrue,
  SourceExpressionMethodAccess,
  SourceExpressionMatch,
} from 'samlang-core-ast/samlang-expressions';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from 'samlang-core-checker';
import { createGlobalErrorCollector } from 'samlang-core-errors';
import { parseSamlangExpressionFromText, parseSamlangModuleFromText } from 'samlang-core-parser';
import { checkNotNull } from 'samlang-core-utils';

import interpretSamlangModule, {
  ExpressionInterpreter,
  InterpretationContext,
  EMPTY,
  FunctionValue,
  ClassValue,
  Value,
} from '../source-level-interpreter';

const getExpression = (rawSourceWithTypeAnnotation: string): SamlangExpression => {
  const errorCollector = createGlobalErrorCollector();
  const expression = checkNotNull(
    parseSamlangExpressionFromText(
      rawSourceWithTypeAnnotation,
      ModuleReference.DUMMY,
      new Set(Object.keys(DEFAULT_BUILTIN_TYPING_CONTEXT)),
      errorCollector.getModuleErrorCollector(ModuleReference.DUMMY)
    )
  );
  const errors = errorCollector.getErrors().map((it) => it.toString());
  expect(errors).toEqual([]);
  return expression;
};

const interpret = (
  rawSourceWithTypeAnnotation: string,
  interpretationContext: InterpretationContext = EMPTY
): Value =>
  new ExpressionInterpreter().eval(
    getExpression(rawSourceWithTypeAnnotation),
    interpretationContext
  );

const interpretModule = (rawSourceWithTypeAnnotation: string): string => {
  const errorCollector = createGlobalErrorCollector();
  const samlangModule = parseSamlangModuleFromText(
    rawSourceWithTypeAnnotation,
    ModuleReference.DUMMY,
    new Set(Object.keys(DEFAULT_BUILTIN_TYPING_CONTEXT)),
    errorCollector.getModuleErrorCollector(ModuleReference.DUMMY)
  );
  expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
  return interpretSamlangModule(samlangModule);
};

describe('source-level-interpreter', () => {
  it('value equality test', () => {
    expect({ type: 'unit' }).toEqual({ type: 'unit' });
    expect({ type: 'unit' }).not.toEqual({ type: 'bool', value: true });
    expect({ type: 'unit' }).not.toEqual({ type: 'int', value: 1 });
    expect({ type: 'unit' }).not.toEqual({ type: 'string', value: 'string' });
    expect({ type: 'unit' }).not.toEqual({ type: 'tuple', tupleContent: [] });
    expect({ type: 'unit' }).not.toEqual({ type: 'object', objectContent: new Map() });
    expect({ type: 'unit' }).not.toEqual({ type: 'variant', tag: 'tag', data: { type: 'unit' } });

    expect({ type: 'bool', value: true }).toEqual({ type: 'bool', value: true });
    expect({ type: 'bool', value: false }).toEqual({ type: 'bool', value: false });
    expect({ type: 'bool', value: true }).not.toEqual({ type: 'bool', value: false });
    expect({ type: 'bool', value: false }).not.toEqual({ type: 'bool', value: true });

    expect({ type: 'int', value: 1 }).toEqual({ type: 'int', value: 1 });
    expect({ type: 'int', value: 1 }).not.toEqual({ type: 'int', value: 2 });

    expect({ type: 'string', value: 'string' }).toEqual({ type: 'string', value: 'string' });
    expect({ type: 'string', value: 'string' }).not.toEqual({
      type: 'string',
      value: 'not a string',
    });

    expect({ type: 'string', value: 'string' }).toEqual({ type: 'string', value: 'string' });
    expect({ type: 'string', value: 'string' }).not.toEqual({
      type: 'string',
      value: 'not a string',
    });

    expect({ type: 'tuple', tupleContent: [] }).toEqual({ type: 'tuple', tupleContent: [] });
    expect({ type: 'tuple', tupleContent: [] }).not.toEqual({
      type: 'tuple',
      tupleContent: [{ type: 'unit' }],
    });
    expect({ type: 'tuple', tupleContent: [{ type: 'unit' }] }).toEqual({
      type: 'tuple',
      tupleContent: [{ type: 'unit' }],
    });

    expect({ type: 'object', objectContent: new Map() }).toEqual({
      type: 'object',
      objectContent: new Map(),
    });
    const objectContent1 = new Map<string, Value>();
    objectContent1.set('field1', { type: 'unit' });
    const objectContent2 = new Map<string, Value>();
    objectContent2.set('field1', 1);
    expect({ type: 'object', objectContent: objectContent1 }).not.toEqual({
      type: 'object',
      objectContent: objectContent2,
    });
    objectContent2.set('field2', { type: 'unit' });
    expect({ type: 'object', objectContent: objectContent1 }).not.toEqual({
      type: 'object',
      objectContent: objectContent2,
    });

    expect({ type: 'variant', tag: 'tag', data: { type: 'unit' } }).toEqual({
      type: 'variant',
      tag: 'tag',
      data: { type: 'unit' },
    });
    expect({ type: 'variant', tag: 'tag', data: { type: 'unit' } }).not.toEqual({
      type: 'variant',
      tag: 'diff tag',
      data: { type: 'unit' },
    });
    expect({ type: 'variant', tag: 'tag', data: { type: 'unit' } }).not.toEqual({
      type: 'variant',
      tag: 'diff tag',
      data: { type: 'int', value: 1 },
    });

    const samlangExpression = SourceExpressionTrue();
    expect({
      type: 'functionValue',
      arguments: [],
      body: samlangExpression,
      context: { classes: new Map(), localValues: new Map() },
    }).toEqual({
      type: 'functionValue',
      arguments: [],
      body: samlangExpression,
      context: { classes: new Map(), localValues: new Map() },
    });
    expect({
      type: 'functionValue',
      arguments: ['param'],
      body: samlangExpression,
      context: { classes: new Map(), localValues: new Map() },
    }).not.toEqual({
      type: 'functionValue',
      arguments: [],
      body: samlangExpression,
      context: { classes: new Map(), localValues: new Map() },
    });
  });

  it('empty context equality check', () => {
    expect(EMPTY).toEqual(EMPTY);
  });

  it('non-empty context equality check', () => {
    const testFunctions: Record<string, FunctionValue> = {};
    const testMethods: Record<string, FunctionValue> = {};
    const samlangExpression = SourceExpressionTrue();
    const functionValue: FunctionValue = {
      type: 'functionValue',
      arguments: [],
      body: samlangExpression,
      context: EMPTY,
    };
    testFunctions.function1 = functionValue;
    testMethods.method1 = functionValue;
    const testClassValue = { functions: testFunctions, methods: testMethods };
    const testClasses: Record<string, ClassValue> = {};
    testClasses.class1 = testClassValue;
    const testLocalValues: Record<string, Value> = {};
    testLocalValues.v1 = { type: 'unit' };
    const testContext = { classes: testClasses, localValues: testLocalValues };

    expect(testContext).toEqual(testContext);
  });

  it('literal expressions evaluate correctly', () => {
    expect(interpret('5')).toEqual(5);
    expect(interpret('"value"')).toEqual('value');
    expect(interpret('true')).toEqual(true);
  });

  it('this expressions evaluate correctly', () => {
    expect(interpret('this', { classes: {}, localValues: { this: true } })).toEqual(true);
    expect(() => interpret('this')).toThrow('Missing `this`');
  });

  it('variable expressions evaluate correctly', () => {
    expect(
      interpret('test', {
        classes: {},
        localValues: { test: true },
      })
    ).toEqual(true);
    expect(() => interpret('test')).toThrow(`Missing variable test`);
  });

  it('class member expressions evaluate correctly', () => {
    expect(
      interpret('(MyClass.classFunction)()', {
        classes: {
          MyClass: {
            functions: {
              classFunction: {
                type: 'functionValue',
                arguments: [],
                body: getExpression('5'),
                context: EMPTY,
              },
            },
            methods: {},
          },
        },
        localValues: {},
      })
    ).toBe(5);

    expect(() => interpret('MyClass.func')).toThrow('');
  });

  it('tuple expression evaluates correctly', () => {
    expect(interpret('[5, true]')).toEqual({
      type: 'tuple',
      tupleContent: [5, true],
    });
  });

  it('object constructor expression evaluates correctly', () => {
    expect(() => interpret('{ test }')).toThrow('Missing variable test');
    expect(interpret('{ test: 5 }')).toEqual({
      type: 'object',
      objectContent: new Map([['test', 5]]),
    });
  });

  it('variant expression evaluates correctly', () => {
    expect(interpret('Tag(5)')).toEqual({
      type: 'variant',
      tag: 'Tag',
      data: 5,
    });
  });

  it('field access expression evaluates correctly', () => {
    expect(interpret('{test:5}.test')).toEqual(5);
    expect(() => interpret('"value".test')).toThrow('');
  });

  it('method access expression evaluates correctly', () => {
    const methodAccessExpression = SourceExpressionMethodAccess({
      type: identifierType(ModuleReference.DUMMY, 'C', []),
      expression: {
        ...(getExpression('Tag(5)') as VariantConstructorExpression),
        type: identifierType(ModuleReference.DUMMY, 'C', []),
      },
      methodPrecedingComments: [],
      methodName: 'method',
    });

    expect(
      (
        new ExpressionInterpreter().eval(methodAccessExpression, {
          classes: {
            C: {
              functions: {},
              methods: {
                method: {
                  type: 'functionValue',
                  arguments: [],
                  body: getExpression('5'),
                  context: EMPTY,
                },
              },
            },
          },
          localValues: {},
        }) as FunctionValue
      ).type
    ).toBe('functionValue');
    expect(() => new ExpressionInterpreter().eval(methodAccessExpression, EMPTY)).toThrow('');
  });

  it('unary expression evaluates correctly', () => {
    expect(interpret('-5')).toEqual(-5);
    expect(interpret('!true')).toEqual(false);
  });

  it('panic expression evaluates correctly', () => {
    expect(() => interpret('Builtins.panic("value")')).toThrow('value');
  });

  it('built in function call expression evaluates correctly', () => {
    expect(interpret('Builtins.stringToInt("5")')).toEqual(5);
    expect(() => interpret('Builtins.stringToInt("value")')).toThrow(
      `Cannot convert \`value\` to int.`
    );
    expect(interpret('Builtins.intToString(5)')).toEqual('5');

    const temporaryInterpreterForPrint = new ExpressionInterpreter();
    expect(
      temporaryInterpreterForPrint.eval(getExpression('Builtins.println("value")'), EMPTY)
    ).toEqual({
      type: 'unit',
    });
    expect(temporaryInterpreterForPrint.printed()).toEqual('value\n');
  });

  it('function expression evaluates correctly', () => {
    expect(interpret('(() -> "value")()')).toEqual('value');
    expect(interpret('((arg1: string) -> "value")("aaa")')).toEqual('value');
  });

  it('binary expression evaluates correctly', () => {
    expect(interpret('5 * 5')).toEqual(25);
    expect(interpret('5 / 5')).toEqual(1);
    expect(interpret('6 / 5')).toEqual(1);
    expect(interpret('-6 / 5')).toEqual(-1);
    expect(() => interpret('5 / 0')).toThrow('Division by zero!');
    expect(interpret('5 % 5')).toEqual(0);
    expect(() => interpret('5 % 0')).toThrow('Mod by zero!');
    expect(interpret('5 + 5')).toEqual(10);
    expect(interpret('5 - 5')).toEqual(0);
    expect(interpret('5 < 5')).toEqual(false);
    expect(interpret('5 <= 5')).toEqual(true);
    expect(interpret('5 > 5')).toEqual(false);
    expect(interpret('5 >= 5')).toEqual(true);
    expect(interpret('5 == 5')).toEqual(true);
    expect(() => interpret('(() -> "value") == (() -> "value")')).toThrow(
      'Cannot compare functions!'
    );
    expect(interpret('5 != 5')).toEqual(false);
    expect(() => interpret('(() -> "value") != 5')).toThrow('Cannot compare functions!');
    expect(interpret('true && true')).toEqual(true);
    expect(interpret('false && true')).toEqual(false);
    expect(interpret('true || true')).toEqual(true);
    expect(interpret('false || true')).toEqual(true);
    expect(interpret('"value"::"value"')).toEqual('valuevalue');
  });

  it('if else expression evaluates correctly', () => {
    expect(interpret('if (true) then "true branch" else "false branch"')).toEqual('true branch');
    expect(interpret('if (false) then "true branch" else "false branch"')).toEqual('false branch');
  });

  it('matching list evaluates correctly', () => {
    expect(interpret('match (Tag(5)) { | Tag data -> data }')).toEqual(5);
    expect(interpret('match (Tag(5)) { | Tag _ -> "value" }')).toEqual('value');
    expect(() =>
      new ExpressionInterpreter().eval(
        SourceExpressionMatch({
          type: stringType,
          matchedExpression: getExpression('Tag(5)'),
          matchingList: [],
        }),
        EMPTY
      )
    ).toThrow();
  });

  it('lambda expression evaluates correctly', () => {
    expect((interpret('() -> 5') as FunctionValue).type).toBe('functionValue');
  });

  it('statement block expression evalutes correctly', () => {
    expect(
      interpret(`{
      val [tuple, _] = [5, 6];
      val {field as f, field} = {field: 5};
      val varrr = {bar:4}.bar;
      val _ = 5;
    }`)
    ).toEqual({ type: 'unit' });

    expect(() =>
      interpret(`{
      val diffVar = {
        val varrr = 5;
        varrr
      };
      val varrr = varrr;
    }`)
    ).toThrow('Missing variable varrr');

    expect(interpret('{ 5 }')).toEqual(5);

    expect(interpret('{ val varrr = 5; varrr }')).toEqual(5);

    expect(() => interpret('{ val {fieldName as f} = {field: 5}; }')).toThrow();
  });

  it('module runs correctly', () => {
    expect(interpretModule('')).toBe('');
    expect(interpretModule('class ExampleClass<P>(val types: int) { }')).toBe('');
    expect(interpretModule(`class Main { }`)).toBe('');
    expect(interpretModule('class Main { function main(): int = 2 }')).toBe('');
    expect(interpretModule('class Main { method main(): unit = Builtins.println("a") }')).toBe('');
    expect(
      interpretModule('class Main { function main(a: int): unit = Builtins.println("a") }')
    ).toBe('');
    expect(
      interpretModule('class Main { function main(): unit = Builtins.println("Hello World!") }')
    ).toBe('Hello World!\n');
    expect(() =>
      interpretModule('class Main { function main(): unit = Builtins.panic("Hello World!") }')
    ).toThrow();
  });
});
