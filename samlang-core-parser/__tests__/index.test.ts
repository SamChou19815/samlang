import { parseSamlangModuleFromText, parseSamlangExpressionFromText } from '..';

import { ModuleReference } from 'samlang-core-ast/common-nodes';
import type { SamlangExpression } from 'samlang-core-ast/samlang-expressions';
import { createGlobalErrorCollector } from 'samlang-core-errors';

it('Can parse good expressions.', () => {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.ROOT);

  const expectASTWithTheSameKind = (
    text: string,
    expected: SamlangExpression['__type__']
  ): void => {
    expect(
      parseSamlangExpressionFromText(text, ModuleReference.ROOT, moduleErrorCollector)?.__type__
    ).toBe(expected);
  };

  expectASTWithTheSameKind('true /* nothing here */', 'LiteralExpression');
  expectASTWithTheSameKind('true', 'LiteralExpression');
  expectASTWithTheSameKind('false', 'LiteralExpression');
  expectASTWithTheSameKind('42', 'LiteralExpression');
  expectASTWithTheSameKind('-9223372036854775808', 'LiteralExpression');
  expectASTWithTheSameKind('9223372036854775807', 'LiteralExpression');
  expectASTWithTheSameKind('"Hello World!"', 'LiteralExpression');
  expectASTWithTheSameKind('this', 'ThisExpression');
  expectASTWithTheSameKind('abc', 'VariableExpression');
  expectASTWithTheSameKind('SomeClass.foo', 'ClassMemberExpression');
  expectASTWithTheSameKind('[3, true]', 'TupleConstructorExpression');
  expectASTWithTheSameKind('[3, true, "Ah"]', 'TupleConstructorExpression');
  expectASTWithTheSameKind('{foo, bar: 3}', 'ObjectConstructorExpression');
  expectASTWithTheSameKind('Variant({})', 'VariantConstructorExpression');
  expectASTWithTheSameKind('Variant(3)', 'VariantConstructorExpression');
  expectASTWithTheSameKind('panic(42)', 'PanicExpression');
  expectASTWithTheSameKind('foo.bar', 'FieldAccessExpression');
  expectASTWithTheSameKind('!false', 'UnaryExpression');
  expectASTWithTheSameKind('-42', 'UnaryExpression');
  expectASTWithTheSameKind('stringToInt("d")', 'BuiltInFunctionCallExpression');
  expectASTWithTheSameKind('intToString(3)', 'BuiltInFunctionCallExpression');
  expectASTWithTheSameKind('println("haha")', 'BuiltInFunctionCallExpression');
  expectASTWithTheSameKind('haha(3, 4, false, "oh no")', 'FunctionCallExpression');
  expectASTWithTheSameKind('haha()', 'FunctionCallExpression');
  expectASTWithTheSameKind('3 * 4', 'BinaryExpression');
  expectASTWithTheSameKind('3 / 4', 'BinaryExpression');
  expectASTWithTheSameKind('3 % 4', 'BinaryExpression');
  expectASTWithTheSameKind('3 + 4', 'BinaryExpression');
  expectASTWithTheSameKind('3 - 4', 'BinaryExpression');
  expectASTWithTheSameKind('3 < 4', 'BinaryExpression');
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
  expectASTWithTheSameKind('{ val [foo, _, bar]: [int * bool] = 3; }', 'StatementBlockExpression');
  expectASTWithTheSameKind('{ val _: Int<bool> = 3; }', 'StatementBlockExpression');
  expectASTWithTheSameKind('{ val _: HAHAHA = 3; }', 'StatementBlockExpression');
  expectASTWithTheSameKind('{ val _: (int, bool) -> string = 3; }', 'StatementBlockExpression');
  expectASTWithTheSameKind('{ }', 'StatementBlockExpression');

  expect(globalErrorCollector.getErrors()).toEqual([]);
});

it('Can report bad expressions.', () => {
  const expectBadAST = (text: string): void => {
    const globalErrorCollector = createGlobalErrorCollector();
    const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.ROOT);
    parseSamlangExpressionFromText(text, ModuleReference.ROOT, moduleErrorCollector);
    expect(globalErrorCollector.getErrors().length).toBeGreaterThan(0);
  };

  expectBadAST('/* nothing here */');
  expectBadAST('// haha');
  expectBadAST('_sdfsdfdsf');
  expectBadAST('9223372036854775808');
  expectBadAST('-9223372036854775889223372036854775808');
  expectBadAST('SomeClass.Foo');
  expectBadAST('SomeClass.');
  expectBadAST('.');
  expectBadAST(',');
  expectBadAST('[3]');
  expectBadAST('[]');
  expectBadAST('{: }');
  expectBadAST('{: bar}');
  expectBadAST('{foo: }');
  expectBadAST('Variant');
  expectBadAST('panic');
  expectBadAST('foo.Bar');
  expectBadAST('foo.');
  expectBadAST('stringToInt');
  expectBadAST('intToString');
  expectBadAST('println');
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
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.ROOT);

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

    class Option<T>(None(unit), Some(T)) {
      function <T> getNone(): Option<T> = None({})
      function <T> getSome(d: T): Option<T> = Some(d)
      method <R> map(f: (T) -> R): Option<R> =
        match (this) {
          | None _ -> None({})
          | Some d -> Some(f(d))
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
        { name: "Sam Zhou", github, projects: l }
      }
    }
    `,
    ModuleReference.ROOT,
    moduleErrorCollector
  );
  if (parsed == null) {
    fail();
  }
  expect(parsed.imports.length).toBe(1);
  expect(parsed.classes.length).toBe(5);
  expect(globalErrorCollector.getErrors()).toEqual([]);
});

it('Can handle bad programs.', () => {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.ROOT);

  const parsed = parseSamlangModuleFromText(
    `
    // Adapted from website
    import { Foo, Bar } from Path.To;

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
    ModuleReference.ROOT,
    moduleErrorCollector
  );
  if (parsed == null) {
    fail();
  }
  expect(parsed.imports.length).toBe(1);
  expect(parsed.classes.length).toBe(2);
  expect(globalErrorCollector.getErrors().length).toBeGreaterThan(0);
});

it('Can handle really bad programs.', () => {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.ROOT);

  const parsed = parseSamlangModuleFromText(
    `
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
    ModuleReference.ROOT,
    moduleErrorCollector
  );
  expect(parsed.imports).toEqual([]);
  expect(parsed.classes).toEqual([]);
  expect(globalErrorCollector.getErrors().length).toBeGreaterThan(0);
});
