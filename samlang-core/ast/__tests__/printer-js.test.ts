// @author meganyin13
// @origin https://github.com/SamChou19815/samlang/pull/39
// @origin https://github.com/SamChou19815/samlang/pull/65
// @origin https://github.com/SamChou19815/samlang/pull/67

import { typeCheckSourceHandles } from '../../checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
} from '../../compiler';
import {
  ENCODED_FUNCTION_NAME_FREE,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_THROW,
  encodeMainFunctionName,
} from '../common-names';
import { ModuleReference } from '../common-nodes';
import {
  MIR_BINARY,
  MIR_CAST,
  MIR_FUNCTION_CALL,
  MIR_FUNCTION_TYPE,
  MIR_IF_ELSE,
  MIR_INDEX_ACCESS,
  MIR_INT,
  MIR_INT_TYPE,
  MIR_NAME,
  MIR_STRING_TYPE,
  MIR_STRUCT_INITIALIZATION,
  MIR_VARIABLE,
  MIR_ZERO,
  prettyPrintMidIRFunction,
  prettyPrintMidIRSourcesAsJSSources,
} from '../mir-nodes';

describe('printer-js', () => {
  it('compile hello world to JS integration test', () => {
    const moduleReference = ModuleReference(['Test']);
    const sourceCode = `
    class Main {
        function main(): unit = Builtins.println("Hello "::"World!")
    }
    `;
    const { checkedSources } = typeCheckSourceHandles([[moduleReference, sourceCode]]);
    const mirSources = lowerHighIRSourcesToMidIRSources(
      compileSamlangSourcesToHighIRSources(checkedSources)
    );
    expect(prettyPrintMidIRSourcesAsJSSources(mirSources)).toBe(
      `const GLOBAL_STRING_0 = [0, "Hello World!"];
function _Test_Main_main() {
  __Builtins_println(GLOBAL_STRING_0);
  return 0;
}
`
    );
  });

  it('HIR function to JS string test', () => {
    expect(
      prettyPrintMidIRFunction(
        {
          name: 'baz',
          parameters: ['d', 't', 'i'],
          type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
          body: [
            MIR_IF_ELSE({
              booleanExpression: MIR_VARIABLE('m', MIR_INT_TYPE),
              s1: [
                MIR_FUNCTION_CALL({
                  functionArguments: [],
                  functionExpression: MIR_NAME('func', MIR_INT_TYPE),
                  returnCollector: 'val',
                  returnType: MIR_INT_TYPE,
                }),
              ],
              s2: [
                MIR_CAST({
                  name: 'foo',
                  type: MIR_INT_TYPE,
                  assignedExpression: MIR_INT(19815),
                }),
              ],
              finalAssignments: [],
            }),
            MIR_STRUCT_INITIALIZATION({
              structVariableName: 'st',
              type: MIR_INT_TYPE,
              expressionList: [MIR_ZERO, MIR_INT(13)],
            }),
            MIR_CAST({
              name: 'b',
              type: MIR_INT_TYPE,
              assignedExpression: MIR_INT(1857),
            }),
            MIR_CAST({
              name: 'm',
              type: MIR_INT_TYPE,
              assignedExpression: MIR_INT(1305),
            }),
            MIR_INDEX_ACCESS({
              name: 'a',
              type: MIR_INT_TYPE,
              pointerExpression: MIR_VARIABLE('samlang', MIR_INT_TYPE),
              index: 3,
            }),
            MIR_BINARY({
              name: 'key',
              operator: '!=',
              e1: MIR_VARIABLE('ts', MIR_INT_TYPE),
              e2: MIR_INT(7),
            }),
            MIR_FUNCTION_CALL({
              functionArguments: [MIR_VARIABLE('hw', MIR_STRING_TYPE)],
              functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN, MIR_INT_TYPE),
              returnCollector: 'res',
              returnType: MIR_INT_TYPE,
            }),
            MIR_FUNCTION_CALL({
              functionArguments: [MIR_VARIABLE('five', MIR_STRING_TYPE)],
              functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT, MIR_INT_TYPE),
              returnCollector: 'res',
              returnType: MIR_INT_TYPE,
            }),
            MIR_FUNCTION_CALL({
              functionArguments: [MIR_INT(5)],
              functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING, MIR_INT_TYPE),
              returnCollector: 'res',
              returnType: MIR_INT_TYPE,
            }),
            MIR_FUNCTION_CALL({
              functionArguments: [
                MIR_VARIABLE('five', MIR_STRING_TYPE),
                MIR_VARIABLE('four', MIR_STRING_TYPE),
              ],
              functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_STRING_CONCAT, MIR_INT_TYPE),
              returnCollector: 'res',
              returnType: MIR_INT_TYPE,
            }),
          ],
          returnValue: MIR_ZERO,
        },
        false
      )
    ).toBe(
      `
function baz(d, t, i) {
  if (m) {
    let val = func();
  } else {
    let foo = 19815;
  }
  let st = [0, 13];
  let b = 1857;
  let m = 1305;
  let a = samlang[3];
  let key = ts != 7;
  let res = ${ENCODED_FUNCTION_NAME_PRINTLN}(hw);
  let res = ${ENCODED_FUNCTION_NAME_STRING_TO_INT}(five);
  let res = ${ENCODED_FUNCTION_NAME_INT_TO_STRING}(5);
  let res = ${ENCODED_FUNCTION_NAME_STRING_CONCAT}(five, four);
  return 0;
}
`.trimStart()
    );
  });

  const setupIntegration = (sourceCode: string): string => {
    const moduleReference = ModuleReference(['Test']);
    const { checkedSources, compileTimeErrors } = typeCheckSourceHandles([
      [moduleReference, sourceCode],
    ]);
    expect(compileTimeErrors.map((it) => it.toString())).toEqual([]);

    const printed = prettyPrintMidIRSourcesAsJSSources(
      lowerHighIRSourcesToMidIRSources(compileSamlangSourcesToHighIRSources(checkedSources))
    );
    const mainFunctionName = encodeMainFunctionName(moduleReference);
    const jsCode = `let printed = '';
    const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = ([,a], [,b]) => [1,a + b];
    const ${ENCODED_FUNCTION_NAME_PRINTLN} = ([,line]) => { printed += line; printed += "\\n" };;
    const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = ([,v]) => parseInt(v, 10);
    const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => [1,String(v)];
    const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };
    const ${ENCODED_FUNCTION_NAME_FREE} = (v) => {};
    ${printed}
    ${printed.includes(mainFunctionName) ? `${mainFunctionName}();` : ''}
    printed`;
    // eslint-disable-next-line no-eval
    return eval(jsCode);
  };

  it('confirm samlang & equivalent JS have same print output', () => {
    expect(
      setupIntegration(
        `
      class Main {
          function main(): unit = {
            Builtins.println("Hello "::"World!")
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
        function main(): unit = Builtins.println(Builtins.intToString(Main.sum(42, 7)))
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
        function main(): unit = Builtins.println(MeaningOfLife.conditional(Main.sum(42, 7)))
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
        function main(): unit = Builtins.println(Builtins.intToString(Foo.bar() * Main.oof()))
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
        function dummyStudent(): Student = Student.init("RANDOM_BABY", 0)
      }
      class Main {
        function main(): unit = {
          val _ = Builtins.println(Student.dummyStudent().getName())
          val _ = Builtins.println(Builtins.intToString(Student.dummyStudent().age))
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
          val hw = HelloWorld.init("Hello World");
          hw.getMessage()
        }
      }

      class Main {
        function main(): unit = Builtins.println(HelloWorld.getGlobalMessage())
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
          Builtins.panic("Division by zero is illegal!")
        ) else (
          a / b
        )
      function main(): unit = {
        val _ = Builtins.println(Builtins.intToString(Main.div(42, 0)))
        val _ = Builtins.println(Builtins.intToString(Main.div(30, 2)))
      }
    }
    `
      )
    ).toThrow(`Division by zero is illegal!`);
  });
});
