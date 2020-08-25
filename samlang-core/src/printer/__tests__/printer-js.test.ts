import { ModuleReference, checkSources } from '../..';
import {
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_THROW,
} from '../../ast/common/name-encoder';
import {
  HIR_IF_ELSE,
  HIR_BINARY,
  HIR_INT,
  HIR_FUNCTION_CALL,
  HIR_NAME,
  HIR_LET,
  HIR_RETURN,
  HIR_ZERO,
  HIR_STRUCT_INITIALIZATION,
  HIR_STRING,
  HIR_INDEX_ACCESS,
  HIR_VARIABLE,
  HIR_WHILE_TRUE,
} from '../../ast/hir/hir-expressions';
import { compileSamlangSourcesToHighIRSources } from '../../compiler';
import {
  highIRSourcesToJSString,
  highIRStatementToString,
  highIRFunctionToString,
  highIRExpressionToString,
} from '../printer-js';

it('compile hello world to JS integration test', () => {
  const moduleReference = new ModuleReference(['Test']);
  const sourceCode = `
    class Main {
        function main(): unit = println("Hello "::"World!")
    }
    `;
  const { checkedSources } = checkSources([[moduleReference, sourceCode]]);
  const hirSources = compileSamlangSourcesToHighIRSources(checkedSources);
  expect(highIRSourcesToJSString(hirSources)).toBe(
    `let printed = '';
  const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
  const _builtin_println = (line) => {
    printed += \`\${line}\n\`;
  };
  const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => BigInt(v);
  const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);
  const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); }
const _module_Test_class_Main_function_main = () => {
  var _t0 = _builtin_stringConcat('Hello ', 'World!');
  var _t1 = _builtin_println(_t0);
};

printed`
  );
  expect(highIRSourcesToJSString(hirSources, moduleReference)).toBe(
    `let printed = '';
  const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
  const _builtin_println = (line) => {
    printed += \`\${line}\n\`;
  };
  const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => BigInt(v);
  const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);
  const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); }
const _module_Test_class_Main_function_main = () => {
  var _t0 = _builtin_stringConcat('Hello ', 'World!');
  var _t1 = _builtin_println(_t0);
};

_module_Test_class_Main_function_main();
printed`
  );
});

const setupIntegration = (sourceCode: string): string => {
  const moduleReference = new ModuleReference(['Test']);
  const { checkedSources, compileTimeErrors } = checkSources([[moduleReference, sourceCode]]);
  expect(compileTimeErrors).toEqual([]);
  const hirSources = compileSamlangSourcesToHighIRSources(checkedSources);
  // eslint-disable-next-line no-eval
  return eval(highIRSourcesToJSString(hirSources, moduleReference));
};

it('confirm samlang & equivalent JS have same print output', () => {
  expect(
    setupIntegration(
      `
    class Main {
        function main(): unit = {
          println("Hello "::"World!")
        }
    }
    `
    )
  ).toBe('Hello World!\n');

  expect(
    setupIntegration(
      `
    class Main {
        function main(a: int, b: int): int = a + b
    }
    `
    )
  ).toBe('');
  expect(
    setupIntegration(
      `
    class Main {
      function sum(a: int, b: int): int = a + b
      function main(): unit = println(intToString(Main.sum(42, 7)))
    }
    `
    )
  ).toBe('49\n');
  expect(
    setupIntegration(
      `
    class MeaningOfLife {
      function conditional(sum: int): string = if (sum == 42) then ("Meaning of life") else ("Not the meaning of life... keep looking")
    }

    class Main {
      function main(): unit = println(MeaningOfLife.conditional(Main.sum(42, 7)))
      function sum(a: int, b: int): int = a + b
    }
    `
    )
  ).toBe('Not the meaning of life... keep looking\n');
  expect(
    setupIntegration(
      `
    class Foo {
      function bar(): int = 3
    }

    class Main {
      function oof(): int = 14
      function main(): unit = println(intToString(Foo.bar() * Main.oof()))
    }
    `
    )
  ).toBe(`42\n`);
  expect(
    setupIntegration(
      `
    class Student(private val name: string, val age: int) {
      method getName(): string = this.name
      private method getAge(): int = this.age
      function dummyStudent(): Student = { name: "RANDOM_BABY", age: 0 }
    }

    class Main {
      function main(): unit = {
        val _ = println(Student.dummyStudent().getName())
        val _ = println(intToString(Student.dummyStudent().age))
      }
    }
    `
    )
  ).toBe(`RANDOM_BABY\n0\n`);
  expect(
    setupIntegration(
      `
    class HelloWorld(val message: string) {
      private method getMessage(): string = {
        val { message } = this;
        message
      }

      function getGlobalMessage(): string = {
        val hw = { message: "Hello World" };
        hw.getMessage()
      }
    }

    class Main {
      function main(): unit = println(HelloWorld.getGlobalMessage())
    }
    `
    )
  ).toBe(`Hello World\n`);
  expect(() =>
    setupIntegration(
      `
  class Main {
    function div(a: int, b: int): int =
      if b == 0 then (
        panic("Division by zero is illegal!")
      ) else (
        a / b
      )
    function main(): unit = {
      val _ = println(intToString(Main.div(42, 0)))
      val _ = println(intToString(Main.div(30, 2)))
    }
  }
  `
    )
  ).toThrow(`Division by zero is illegal!`);
});

it('HIR statements to JS string test', () => {
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_INT(BigInt(5)),
          e2: HIR_INT(BigInt(5)),
        }),
        s1: [],
        s2: [HIR_RETURN(HIR_ZERO)],
      })
    )
  ).toBe(`if (5 == 5) {

} else {
  return 0;
}`);
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_INT(BigInt(5)),
          e2: HIR_INT(BigInt(5)),
        }),
        s1: [HIR_RETURN(HIR_ZERO)],
        s2: [HIR_RETURN(HIR_ZERO)],
      })
    )
  ).toBe(`if (5 == 5) {
  return 0;
} else {
  return 0;
}`);
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_INT(BigInt(5)),
          e2: HIR_INT(BigInt(5)),
        }),
        s1: [HIR_RETURN(HIR_ZERO)],
        s2: [
          HIR_IF_ELSE({
            booleanExpression: HIR_BINARY({
              operator: '==',
              e1: HIR_INT(BigInt(5)),
              e2: HIR_INT(BigInt(5)),
            }),
            s1: [HIR_RETURN(HIR_ZERO)],
            s2: [HIR_RETURN(HIR_ZERO)],
          }),
        ],
      })
    )
  ).toBe(`if (5 == 5) {
  return 0;
} else {
  if (5 == 5) {
    return 0;
  } else {
    return 0;
  }
}`);
  expect(
    highIRStatementToString(
      HIR_WHILE_TRUE([
        HIR_FUNCTION_CALL({
          functionArguments: [],
          functionExpression: HIR_NAME('func'),
          returnCollector: 'val',
        }),
      ])
    )
  ).toBe(`while (true) {
  var val = func();
}`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [],
        functionExpression: HIR_NAME('func'),
        returnCollector: 'val',
      })
    )
  ).toBe('var val = func();');
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_STRING('Hello, world')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_PRINTLN}('Hello, world');`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_STRING('5')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_STRING_TO_INT}('5');`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_INT(BigInt(5))],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_INT_TO_STRING}(5);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_STRING('5'), HIR_STRING('4')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_STRING_CONCAT),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_STRING_CONCAT}('5', '4');`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_STRING('panik')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_THROW),
        returnCollector: 'panik',
      })
    )
  ).toBe(`var panik = ${ENCODED_FUNCTION_NAME_THROW}('panik');`);
  expect(
    highIRStatementToString(
      HIR_LET({
        name: 'foo',
        assignedExpression: HIR_INT(BigInt(19815)),
      })
    )
  ).toBe(`var foo = 19815;`);
  expect(highIRStatementToString(HIR_RETURN(HIR_ZERO))).toBe('return 0;');
  expect(
    highIRStatementToString(
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 'st',
        expressionList: [HIR_ZERO, HIR_STRING('bar'), HIR_INT(BigInt(13))],
      })
    )
  ).toBe(`var st = [0, 'bar', 13];`);
});

it('HIR function to JS string test 1', () => {
  expect(
    highIRFunctionToString({
      name: 'baz',
      parameters: ['d', 't', 'i'],
      hasReturn: true,
      body: [
        HIR_LET({
          name: 'b',
          assignedExpression: HIR_INT(BigInt(1857)),
        }),
      ],
    })
  ).toBe(`const baz = (d, t, i) => {
  var b = 1857;
};
`);
});

it('HIR function to JS string test 2', () => {
  expect(
    highIRFunctionToString({
      name: 'baz',
      parameters: ['d', 't', 'i'],
      hasReturn: true,
      body: [HIR_RETURN(HIR_INT(BigInt(42)))],
    })
  ).toBe(`const baz = (d, t, i) => {
  return 42;
};
`);
});

it('HIR expression to JS string test', () => {
  expect(highIRExpressionToString(HIR_INT(BigInt(1305)))).toBe('1305');
  expect(highIRExpressionToString(HIR_STRING('bloop'))).toBe(`'bloop'`);
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        expression: HIR_VARIABLE('samlang'),
        index: 3,
      })
    )
  ).toBe(`samlang[3]`);
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        expression: HIR_INDEX_ACCESS({
          expression: HIR_VARIABLE('a'),
          index: 4,
        }),
        index: 3,
      })
    )
  ).toBe('a[4][3]');
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        expression: HIR_BINARY({
          operator: '+',
          e1: HIR_STRING('a'),
          e2: HIR_STRING('b'),
        }),
        index: 0,
      })
    )
  ).toBe("('a' + 'b')[0]");
  expect(highIRExpressionToString(HIR_VARIABLE('ts'))).toBe('ts');
  expect(highIRExpressionToString(HIR_NAME('key'))).toBe('key');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '!=',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_INT(BigInt(7)),
      })
    )
  ).toBe('7 != 7');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(BigInt(4)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('7 + 4 * 4');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '*',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_BINARY({
          operator: '+',
          e1: HIR_INT(BigInt(4)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('7 * (4 + 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '*',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(BigInt(4)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('7 * (4 * 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '*',
        e1: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(BigInt(1)),
          e2: HIR_INT(BigInt(2)),
        }),
        e2: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(BigInt(3)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('(1 * 2) * (3 * 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_BINARY({
          operator: '-',
          e1: HIR_INT(BigInt(1)),
          e2: HIR_INT(BigInt(2)),
        }),
        e2: HIR_BINARY({
          operator: '%',
          e1: HIR_INT(BigInt(3)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('(1 - 2) + 3 % 4');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_NAME('somevar'),
        e2: HIR_BINARY({
          operator: '-',
          e1: HIR_INT(BigInt(3)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('somevar + (3 - 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_INDEX_ACCESS({
          expression: HIR_VARIABLE('a'),
          index: 2,
        }),
        e2: HIR_INT(BigInt(1)),
      })
    )
  ).toBe('a[2] + 1');
});
