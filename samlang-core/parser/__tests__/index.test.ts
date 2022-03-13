import { parseSamlangExpressionFromText, parseSamlangModuleFromText, parseSources } from '..';
import { ModuleReference } from '../../ast/common-nodes';
import type { SamlangExpression } from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';

describe('samlang-core/parser', () => {
  it('Can parse good expressions.', () => {
    const globalErrorCollector = createGlobalErrorCollector();
    const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(
      ModuleReference.DUMMY
    );

    function expectASTWithTheSameKind(text: string, expected: SamlangExpression['__type__']): void {
      expect(
        parseSamlangExpressionFromText(text, ModuleReference.DUMMY, moduleErrorCollector)?.__type__
      ).toBe(expected);
    }

    expectASTWithTheSameKind('true /* nothing here */', 'LiteralExpression');
    expectASTWithTheSameKind('true', 'LiteralExpression');
    expectASTWithTheSameKind('false', 'LiteralExpression');
    expectASTWithTheSameKind('42', 'LiteralExpression');
    expectASTWithTheSameKind('-2147483648', 'LiteralExpression');
    expectASTWithTheSameKind('2147483647', 'LiteralExpression');
    expectASTWithTheSameKind('"Hello World!"', 'LiteralExpression');
    expectASTWithTheSameKind('this', 'ThisExpression');
    expectASTWithTheSameKind('abc', 'VariableExpression');
    expectASTWithTheSameKind('SomeClass.foo', 'ClassMemberExpression');
    expectASTWithTheSameKind('SomeClass.<A,B>foo', 'ClassMemberExpression');
    expectASTWithTheSameKind('SomeClass.<A>foo', 'ClassMemberExpression');
    expectASTWithTheSameKind('[3, true]', 'TupleConstructorExpression');
    expectASTWithTheSameKind('[3, true, "Ah"]', 'TupleConstructorExpression');
    expectASTWithTheSameKind('V.Variant({})', 'FunctionCallExpression');
    expectASTWithTheSameKind('V.Variant(3)', 'FunctionCallExpression');
    expectASTWithTheSameKind('V.<T>Variant(3)', 'FunctionCallExpression');
    expectASTWithTheSameKind('foo.bar', 'FieldAccessExpression');
    expectASTWithTheSameKind('!false', 'UnaryExpression');
    expectASTWithTheSameKind('-42', 'UnaryExpression');
    expectASTWithTheSameKind('haha(3, 4, false, "oh no")', 'FunctionCallExpression');
    expectASTWithTheSameKind('haha()', 'FunctionCallExpression');
    expectASTWithTheSameKind('3 * 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 / 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 % 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 + 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 - 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 < 4', 'BinaryExpression');
    expectASTWithTheSameKind('/* hi */ 3 < 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 /* hi */ < 4', 'BinaryExpression');
    expectASTWithTheSameKind('(i /* */ < j && i > 0)', 'BinaryExpression');
    expectASTWithTheSameKind('3 <= 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 > 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 >= 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 == 4', 'BinaryExpression');
    expectASTWithTheSameKind('3 != 4', 'BinaryExpression');
    expectASTWithTheSameKind('true && false', 'BinaryExpression');
    expectASTWithTheSameKind('false || true', 'BinaryExpression');
    expectASTWithTheSameKind('"hello"::"world"', 'BinaryExpression');
    expectASTWithTheSameKind('if (true) then 3 else bar', 'IfElseExpression');
    expectASTWithTheSameKind('match (this) { | None _ -> 0 | Some d -> d }', 'MatchExpression');
    expectASTWithTheSameKind('(a, b: int, c: Type) -> 3', 'LambdaExpression');
    expectASTWithTheSameKind('() -> 3', 'LambdaExpression');
    expectASTWithTheSameKind('(foo) -> 3', 'LambdaExpression');
    expectASTWithTheSameKind('(foo: bool) -> 3', 'LambdaExpression');
    expectASTWithTheSameKind('{ val a = 3; }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ val a: () -> int = () -> 3; }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ val a = 3 val b = 3 }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ val a = 3; a }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ val a: int = 3; }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ val a: unit = {}; }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ val {foo, bar as baz}: Type = 3; }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ val [foo, _, bar] = 3; }', 'StatementBlockExpression');
    expectASTWithTheSameKind(
      '{ val [foo, _, bar]: [int * bool] = 3; }',
      'StatementBlockExpression'
    );
    expectASTWithTheSameKind('{ val _: Int<bool> = 3; }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ val _: HAHAHA = 3; }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ val _: (int, bool) -> string = 3; }', 'StatementBlockExpression');
    expectASTWithTheSameKind('{ }', 'StatementBlockExpression');

    expect(globalErrorCollector.getErrors().map((it) => it.toString())).toEqual([]);
  });

  it('Can report bad expressions.', () => {
    function expectBadAST(text: string): void {
      const globalErrorCollector = createGlobalErrorCollector();
      const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(
        ModuleReference.DUMMY
      );
      parseSamlangExpressionFromText(text, ModuleReference.DUMMY, moduleErrorCollector);
      expect(globalErrorCollector.getErrors().length).toBeGreaterThan(0);
    }

    expectBadAST('/* nothing here */');
    expectBadAST('// haha');
    expectBadAST('_sdfsdfdsf');
    expectBadAST('9223372036854775808');
    expectBadAST('-9223372036854775889223372036854775808');
    expectBadAST('SomeClass.<>foo');
    expectBadAST('SomeClass.<foo');
    expectBadAST('SomeClass.');
    expectBadAST('.');
    expectBadAST(',');
    expectBadAST('[]');
    expectBadAST('{: }');
    expectBadAST('{ hello / }');
    expectBadAST('{: bar}');
    expectBadAST('{foo: }');
    expectBadAST('Variant');
    expectBadAST('foo.Bar');
    expectBadAST('foo.');
    expectBadAST('if (true) then 3');
    expectBadAST('if (true) else 4');
    expectBadAST('if (true)');
    expectBadAST('match (this) { | None _  }');
    expectBadAST('match (this) { |  _ -> }');
    expectBadAST('match (this) { |  -> }');
    expectBadAST('(: int) -> 3');
    expectBadAST('(:) -> 3');
    expectBadAST('(a:) -> 3');
    expectBadAST('{ val a =  }');
    expectBadAST('{ val  = 3 }');
    expectBadAST('{ val a = /* empty */ }');
    expectBadAST('{ val a = int }');
    expectBadAST('{ val a:  = 3; a }');
    expectBadAST('{ val a: <int> = 3; a }');
    expectBadAST('{ val {foo, as baz}: Type = 3; }');
    expectBadAST('{ val {foo, bar as }: Type = 3; }');
    expectBadAST('{ val a: () ->  = 3; a }');
  });

  it('Can parse good programs.', () => {
    const globalErrorCollector = createGlobalErrorCollector();
    const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(
      ModuleReference.DUMMY
    );

    const parsed = parseSamlangModuleFromText(
      `
    // Adapted from website
    import { Foo, Bar } from Path.To

    class Main {
      function main(): string = "Hello World"
    }

    class Main {
      function main(): int = 2 * 21
    }

    class Util {}

    class Util

    class A(val a: int)

    class Option<T>(None(unit), Some(T)) {
      function <T> getNone(): Option<T> = Option.None({})
      function <T> getSome(d: T): Option<T> = Option.Some(d)
      method <R> map(f: (T) -> R): Option<R> =
        match (this) {
          | None _ -> Option.None({})
          | Some d -> Option.Some(f(d))
        }
    }

    class TypeInference {
      function notAnnotated(): unit = {
        val _ = (a, b, c) -> if a(b + 1) then b else c;
      }
      // Read the docs to see how we do the type inference.
      function annotated(): unit = {
        val _: ((int) -> bool, int, int) -> int =
          (a: (int) -> bool, b: int, c: int) -> (
            if a(b + 1) then b else c
          );
      }
    }

    class Developer(
      val name: string, val github: string,
      val projects: List<string>
    ) {
      function sam(): Developer = {
        val l = List.of("SAMLANG").cons("...")
        val github = "SamChou19815"
        Developer.init("Sam Zhou", github, l)
      }
    }
    `,
      ModuleReference.DUMMY,
      moduleErrorCollector
    );
    expect(globalErrorCollector.getErrors().map((it) => it.toString())).toEqual([]);
    expect(
      parsed.imports.map((it) => ({
        members: it.importedMembers.map(({ name }) => name),
        importedModule: it.importedModule.toString(),
      }))
    ).toEqual([{ importedModule: 'Path.To', members: ['Foo', 'Bar'] }]);
    expect(parsed.classes.map((it) => it.name.name)).toEqual([
      'Main',
      'Main',
      'Util',
      'Util',
      'A',
      'Option',
      'TypeInference',
      'Developer',
    ]);
  });

  it('Can handle bad programs.', () => {
    const globalErrorCollector = createGlobalErrorCollector();
    const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(
      ModuleReference.DUMMY
    );

    const parsed = parseSamlangModuleFromText(
      `
    // Adapted from website
    import { Foo, Bar } from path.To;

    class Main(Boo(), ()) {
      function main(): string = "Hello World"
    }

    class {
      function main(): int =
    }

    class TypeInference(val : string, val foo: ) {
      function notAnnotated(bad: ):  = {
        val _ = (a, b, c) -> if a(b + 1) then b else c;
      }
    }
    `,
      ModuleReference.DUMMY,
      moduleErrorCollector
    );
    if (parsed == null) throw new Error();
    expect(parsed.imports.length).toBe(1);
    expect(globalErrorCollector.getErrors().length).toBeGreaterThan(0);
  });

  it('Can handle really bad programs.', () => {
    const globalErrorCollector = createGlobalErrorCollector();
    const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(
      ModuleReference.DUMMY
    );

    parseSamlangModuleFromText(
      `import {Foo} from 3.2
    import {Bar} from +.3

    class {
      function main(): int =
    }

    interface {}

    interface Ahhh {
      method notAnnotated(bad: , : int):
    }

    class TypeInference(vafl : string, val foo: ) {
      function notAnnotated(bad: , : int):  = {
        val _ = (a, b, c) -> if a(b + 1) then b else c;
      }
    }
    `,
      ModuleReference.DUMMY,
      moduleErrorCollector
    );
    expect(globalErrorCollector.getErrors().length).toBeGreaterThan(0);
  });

  it('Can handle complete trash', () => {
    const globalErrorCollector = createGlobalErrorCollector();
    const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(
      ModuleReference.DUMMY
    );

    parseSamlangModuleFromText(
      'This is not a program.',
      ModuleReference.DUMMY,
      moduleErrorCollector
    );
    expect(globalErrorCollector.getErrors().map((it) => it.toString())).toEqual([
      '__DUMMY__.sam:1:1-1:5: [SyntaxError]: Unexpected token among the classes.',
      '__DUMMY__.sam:1:6-1:8: [SyntaxError]: Unexpected token among the classes.',
      '__DUMMY__.sam:1:9-1:12: [SyntaxError]: Unexpected token among the classes.',
      '__DUMMY__.sam:1:13-1:14: [SyntaxError]: Unexpected token among the classes.',
      '__DUMMY__.sam:1:15-1:22: [SyntaxError]: Unexpected token among the classes.',
      '__DUMMY__.sam:1:22-1:23: [SyntaxError]: Unexpected token among the classes.',
    ]);
  });

  it('parseSources test', () => {
    expect(
      parseSources([
        [new ModuleReference(['Test1']), 'class Main { function main(): unit = {} }'],
        // with syntax error
        [new ModuleReference(['Test2']), 'class Main { function main(): unt = {} }'],
      ]).length
    ).toBe(1);
  });
});
