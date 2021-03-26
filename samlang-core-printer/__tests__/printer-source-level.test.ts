import { prettyPrintSamlangModule } from '..';
import { prettyPrintSamlangExpression_EXPOSED_FOR_TESTING } from '../printer-source-level';

import { intType, Range, ModuleReference } from 'samlang-core-ast/common-nodes';
import {
  EXPRESSION_METHOD_ACCESS,
  EXPRESSION_VARIABLE,
} from 'samlang-core-ast/samlang-expressions';
import { createGlobalErrorCollector } from 'samlang-core-errors';
import { parseSamlangExpressionFromText, parseSamlangModuleFromText } from 'samlang-core-parser';
import { checkNotNull } from 'samlang-core-utils';

const reprintExpression = (rawSourceWithTypeAnnotation: string, width = 40): string => {
  const errorCollector = createGlobalErrorCollector();
  const expression = checkNotNull(
    parseSamlangExpressionFromText(
      rawSourceWithTypeAnnotation,
      ModuleReference.ROOT,
      errorCollector.getModuleErrorCollector(ModuleReference.ROOT)
    )
  );
  const errors = errorCollector.getErrors().map((it) => it.toString());
  expect(errors).toEqual([]);
  return prettyPrintSamlangExpression_EXPOSED_FOR_TESTING(width, expression).trimEnd();
};

const reprintModule = (rawSourceWithTypeAnnotation: string, width = 40): string => {
  const errorCollector = createGlobalErrorCollector();
  const samlangModule = parseSamlangModuleFromText(
    rawSourceWithTypeAnnotation,
    ModuleReference.ROOT,
    errorCollector.getModuleErrorCollector(ModuleReference.ROOT)
  );
  const errors = errorCollector.getErrors().map((it) => it.toString());
  expect(errors).toEqual([]);
  return `\n${prettyPrintSamlangModule(width, samlangModule).trimEnd()}`;
};

it('prettyPrintSamlangExpression test', () => {
  expect(reprintExpression('1')).toBe('1');
  expect(reprintExpression('hi')).toBe('hi');
  expect(reprintExpression('this')).toBe('this');
  expect(reprintExpression('ClassName.classMember')).toBe('ClassName.classMember');

  expect(reprintExpression('[1,2,3,4,5,6,7,8,9]')).toBe('[1, 2, 3, 4, 5, 6, 7, 8, 9]');
  expect(reprintExpression('[1,2,3,4,5,6,7,8,9,10,11,12,13,14]')).toBe(
    `[
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14
]`
  );

  expect(reprintExpression('{foo:bar,baz}')).toBe('{ foo: bar, baz }');
  expect(reprintExpression('{foo:bar,baz0,baz1,baz2,baz3,baz4,baz5}')).toBe(
    `{
  foo: bar,
  baz0,
  baz1,
  baz2,
  baz3,
  baz4,
  baz5
}`
  );

  expect(reprintExpression('VariantName(42)')).toBe('VariantName(42)');
  expect(reprintExpression('VariantName(aVariableNameThatIsVeryVeryVeryLong)')).toBe(
    `VariantName(
  aVariableNameThatIsVeryVeryVeryLong
)`
  );

  expect(reprintExpression('foo.bar')).toBe('foo.bar');

  expect(
    prettyPrintSamlangExpression_EXPOSED_FOR_TESTING(
      40,
      EXPRESSION_METHOD_ACCESS({
        range: Range.DUMMY,
        type: intType,
        expression: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: 'foo' }),
        methodName: 'bar',
      })
    ).trimEnd()
  ).toBe('foo.bar');

  expect(reprintExpression('-42')).toBe('-42');
  expect(reprintExpression('!(1+aVariableNameThatIsVeryVeryVeryVeryVeryLong)')).toBe(`!(
  1 + aVariableNameThatIsVeryVeryVeryVeryVeryLong
)`);

  expect(reprintExpression('panic(ah)')).toBe('panic(ah)');
  expect(reprintExpression('println(ah)')).toBe('println(ah)');
  expect(reprintExpression('foo()')).toBe('foo()');
  expect(reprintExpression('foo(bar)')).toBe('foo(bar)');
  expect(reprintExpression('foo(bar,baz)')).toBe('foo(bar, baz)');
  expect(reprintExpression('foo(v1, v2, v3, v4, v5, v6, v7, v8, v9, v10)')).toBe(
    `foo(
  v1,
  v2,
  v3,
  v4,
  v5,
  v6,
  v7,
  v8,
  v9,
  v10
)`
  );

  expect(reprintExpression('1 + 1')).toBe('1 + 1');
  expect(reprintExpression('1 + 1 * 1')).toBe('1 + 1 * 1');
  expect(reprintExpression('(1 + 1) * 1')).toBe('(1 + 1) * 1');
  expect(reprintExpression('1 + 1 + 1')).toBe('(1 + 1) + 1');

  expect(reprintExpression('if (b) then a else c')).toBe('if (b) then a else c');
  expect(
    reprintExpression(
      `
      if (b) then {
        val _ = println("");
        val _ = println("");
        val _ = println("");
        val _ = println("");
      } else if (b) then {
        val _ = println("");
        val _ = println("");
        val _ = println("");
        val _ = println("");
      } else {
        val _ = println("");
        val _ = println("");
        val _ = println("");
        val _ = println("");
      }`
    )
  ).toBe(`if (b) then {
  val _ = println("");
  val _ = println("");
  val _ = println("");
  val _ = println("");
} else if (b) then {
  val _ = println("");
  val _ = println("");
  val _ = println("");
  val _ = println("");
} else {
  val _ = println("");
  val _ = println("");
  val _ = println("");
  val _ = println("");
}`);

  expect(reprintExpression('match (v) { | None _ -> fooBar | Some bazBaz -> bazBaz }'))
    .toBe(`match (v) {
  | None _ -> fooBar
  | Some bazBaz -> bazBaz
}`);

  expect(reprintExpression('() -> 1')).toBe('() -> 1');
  expect(reprintExpression('(a: int) -> 1')).toBe('(a: int) -> 1');
  expect(reprintExpression('(a) -> 1')).toBe('(a) -> 1');
  expect(reprintExpression('(a: int) -> 1 + 1')).toBe('(a: int) -> 1 + 1');
  expect(reprintExpression('(() -> 1)()')).toBe('(() -> 1)()');

  expect(reprintExpression('{}')).toBe('{  }');
  expect(reprintExpression('{3}')).toBe('{ 3 }');
  expect(reprintExpression('{ val _:int=0;val _=0; }')).toBe(
    `{
  val _: int = 0;
  val _ = 0;
}`
  );
  expect(reprintExpression('{ val a:int=1;val [b,_]:[int*int]=2; 3 }')).toBe(`{
  val a: int = 1;
  val [b, _]: [int * int] = 2;
  3
}`);
  expect(reprintExpression('{ val {a, b as c}: int = 3 }')).toBe(`{
  val { a, b as c }: int = 3;
}`);

  expect(
    reprintExpression(
      '{ val a: unit = { val b: unit = { val c: unit = { val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong } } } }'
    )
  ).toBe(`{
  val a: unit = {
    val b: unit = {
      val c: unit = {
        val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong;
      };
    };
  };
}`);
  expect(
    reprintExpression(
      '() -> () -> () -> { val a: unit = { val b: unit = { val c: unit = { val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong } } } }'
    )
  ).toBe(`() -> (
  () -> (
    () -> {
      val a: unit = {
        val b: unit = {
          val c: unit = {
            val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong;
          };
        };
      };
    }
  )
)`);
});

it('prettyPrintSamlangModule test', () => {
  expect(reprintModule('')).toBe('\n');

  expect(
    reprintModule(`
import {Foo} from Bar.Baz
import {F1,F2,F3,F4,F5,F6,F7,F8,F9,F10} from Bar.Baz

class Option<T>(None(unit), Some(T)) {
  private method <T> matchExample(opt: Option<int>): int =
    match (opt) {
      | None _ -> 42
      | Some a -> a
    }

  /* ignored */ /** foo bar a */
  function a(): int = 3

  /** foo bar b */
  function b(): int = {}

  /** foo bar c */
  function c(): int = { val a: int = 3; }
}

class Obj(private val d: int, val e: int) {
  /** foo bar */
  function valExample(): unit = {
    val a: int = 1;
    val b: int = 2;
  }
}

/** short line */
class A(val a: int) {}

/** some very very very very very very very very very very very very very very very very very very
 * long document string
 */
class Main {}
`)
  ).toBe(`
import { Foo } from Bar.Baz
import {
  F1,
  F2,
  F3,
  F4,
  F5,
  F6,
  F7,
  F8,
  F9,
  F10
} from Bar.Baz

class Option<T>(None(unit), Some(T)) {
  private method <T> matchExample(
    opt: Option<int>
  ): int =
    match (opt) {
      | None _ -> 42
      | Some a -> a
    }

  /** foo bar a */
  function a(): int = 3

  /** foo bar b */
  function b(): int = {  }

  /** foo bar c */
  function c(): int = {
    val a: int = 3;
  }

}

class Obj(
  private val d: int,
  val e: int
) {
  /** foo bar */
  function valExample(): unit = {
    val a: int = 1;
    val b: int = 2;
  }

}

/** short line */
class A(val a: int) {  }

/**
 * some very very very very very very
 * very very very very very very very
 * very very very very very long
 * document string
 */
class Main {  }`);
});
