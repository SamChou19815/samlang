import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';
import { stringType, identifierType } from '../../ast/common/types';
import {
  SamlangExpression,
  VariantConstructorExpression,
  EXPRESSION_METHOD_ACCESS,
  EXPRESSION_MATCH,
} from '../../ast/lang/samlang-expressions';
import { createGlobalErrorCollector } from '../../errors';
import { parseSamlangExpressionFromText, parseSamlangModuleFromText } from '../../parser';
import { assertNotNull } from '../../util/type-assertions';
import { EMPTY, InterpretationContext } from '../interpretation-context';
import interpretSamlangModule, { ExpressionInterpreter } from '../module-interpreter';
import type { FunctionValue, Value } from '../value';

const getExpression = (rawSourceWithTypeAnnotation: string): SamlangExpression => {
  const errorCollector = createGlobalErrorCollector();
  const expression = parseSamlangExpressionFromText(
    rawSourceWithTypeAnnotation,
    errorCollector.getModuleErrorCollector(ModuleReference.ROOT)
  );
  assertNotNull(expression);
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
    errorCollector.getModuleErrorCollector(ModuleReference.ROOT)
  );
  expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
  return interpretSamlangModule(samlangModule);
};

it('literal expressions evaluate correctly', () => {
  expect(interpret('5')).toEqual(BigInt(5));
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
  ).toBe(BigInt(5));

  expect(() => interpret('MyClass.func')).toThrow('');
});

it('tuple expression evaluates correctly', () => {
  expect(interpret('[5, true]')).toEqual({
    type: 'tuple',
    tupleContent: [BigInt(5), true],
  });
});

it('object constructor expression evaluates correctly', () => {
  expect(() => interpret('{ test }')).toThrow('Missing variable test');
  expect(interpret('{ test: 5 }')).toEqual({
    type: 'object',
    objectContent: new Map([['test', BigInt(5)]]),
  });
});

it('variant expression evaluates correctly', () => {
  expect(interpret('Tag(5)')).toEqual({
    type: 'variant',
    tag: 'Tag',
    data: BigInt(5),
  });
});

it('field access expression evaluates correctly', () => {
  expect(interpret('{test:5}.test')).toEqual(BigInt(5));
  expect(() => interpret('"value".test')).toThrow('');
});

it('method access expression evaluates correctly', () => {
  const methodAccessExpression = EXPRESSION_METHOD_ACCESS({
    range: Range.DUMMY,
    type: identifierType('C', []),
    expression: {
      ...(getExpression('Tag(5)') as VariantConstructorExpression),
      type: identifierType('C', []),
    },
    methodName: 'method',
  });

  expect(
    (new ExpressionInterpreter().eval(methodAccessExpression, {
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
    }) as FunctionValue).type
  ).toBe('functionValue');
  expect(() => new ExpressionInterpreter().eval(methodAccessExpression, EMPTY)).toThrow('');
});

it('unary expression evaluates correctly', () => {
  expect(interpret('-5')).toEqual(BigInt(-5));
  expect(interpret('!true')).toEqual(false);
});

it('panic expression evaluates correctly', () => {
  expect(() => interpret('panic("value")')).toThrow('value');
});

it('built in function call expression evaluates correctly', () => {
  expect(interpret('stringToInt("5")')).toEqual(BigInt(5));
  expect(() => interpret('stringToInt("value")')).toThrow(`Cannot convert \`value\` to int.`);
  expect(interpret('intToString(5)')).toEqual('5');

  const temporaryInterpreterForPrint = new ExpressionInterpreter();
  expect(temporaryInterpreterForPrint.eval(getExpression('println("value")'), EMPTY)).toEqual({
    type: 'unit',
  });
  expect(temporaryInterpreterForPrint.printed()).toEqual('value\n');
});

it('function expression evaluates correctly', () => {
  expect(interpret('(() -> "value")()')).toEqual('value');
  expect(interpret('((arg1: string) -> "value")("aaa")')).toEqual('value');
});

it('binary expression evaluates correctly', () => {
  expect(interpret('5 * 5')).toEqual(BigInt(25));
  expect(interpret('5 / 5')).toEqual(BigInt(1));
  expect(() => interpret('5 / 0')).toThrow('Division by zero!');
  expect(interpret('5 % 5')).toEqual(BigInt(0));
  expect(() => interpret('5 % 0')).toThrow('Mod by zero!');
  expect(interpret('5 + 5')).toEqual(BigInt(10));
  expect(interpret('5 - 5')).toEqual(BigInt(0));
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
  expect(interpret('match (Tag(5)) { | Tag data -> data }')).toEqual(BigInt(5));
  expect(interpret('match (Tag(5)) { | Tag _ -> "value" }')).toEqual('value');
  expect(() =>
    new ExpressionInterpreter().eval(
      EXPRESSION_MATCH({
        range: Range.DUMMY,
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

  expect(interpret('{ 5 }')).toEqual(BigInt(5));

  expect(interpret('{ val varrr = 5; varrr }')).toEqual(BigInt(5));

  expect(() => interpret('{ val {fieldName as f} = {field: 5}; }')).toThrow();
});

it('module runs correctly', () => {
  expect(interpretModule('')).toBe('');
  expect(interpretModule('class ExampleClass<P>(val types: int) { }')).toBe('');
  expect(interpretModule(`class Main { }`)).toBe('');
  expect(interpretModule('class Main { function main(): int = 2 }')).toBe('');
  expect(interpretModule('class Main { method main(): unit = println("a") }')).toBe('');
  expect(interpretModule('class Main { function main(a: int): unit = println("a") }')).toBe('');
  expect(interpretModule('class Main { function main(): unit = println("Hello World!") }')).toBe(
    'Hello World!\n'
  );
  expect(() =>
    interpretModule('class Main { function main(): unit = panic("Hello World!") }')
  ).toThrow();
});
