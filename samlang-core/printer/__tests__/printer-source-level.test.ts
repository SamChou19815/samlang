import prettyPrintSamlangModule from '..';
import { intType, ModuleReference } from '../../ast/common-nodes';
import {
  SourceExpressionMethodAccess,
  SourceExpressionVariable,
  SourceId,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { parseSamlangExpressionFromText, parseSamlangModuleFromText } from '../../parser';
import { checkNotNull } from '../../utils';
import { prettyPrintSamlangExpression_EXPOSED_FOR_TESTING } from '../printer-source-level';

function reprintExpression(rawSourceWithTypeAnnotation: string, width = 40): string {
  const errorCollector = createGlobalErrorCollector();
  const expression = checkNotNull(
    parseSamlangExpressionFromText(
      rawSourceWithTypeAnnotation,
      ModuleReference.DUMMY,
      errorCollector.getModuleErrorCollector(ModuleReference.DUMMY)
    )
  );
  const errors = errorCollector.getErrors().map((it) => it.toString());
  expect(errors).toEqual([]);
  return prettyPrintSamlangExpression_EXPOSED_FOR_TESTING(width, expression).trimEnd();
}

function reprintModule(rawSourceWithTypeAnnotation: string, width = 40): string {
  const errorCollector = createGlobalErrorCollector();
  const samlangModule = parseSamlangModuleFromText(
    rawSourceWithTypeAnnotation,
    ModuleReference.DUMMY,
    errorCollector.getModuleErrorCollector(ModuleReference.DUMMY)
  );
  const errors = errorCollector.getErrors().map((it) => it.toString());
  expect(errors).toEqual([]);
  return `\n${prettyPrintSamlangModule(width, samlangModule).trimEnd()}`;
}

describe('printer-source-level', () => {
  it('prettyPrintSamlangExpression test', () => {
    expect(reprintExpression('1')).toBe('1');
    expect(reprintExpression('/* dsfsd */ 1')).toBe('/* dsfsd */ 1');
    expect(reprintExpression('/* long long long long long long long long long long */ 1')).toBe(
      `/*
 * long long long long long long long
 * long long long
 */
1`
    );
    expect(reprintExpression('hi')).toBe('hi');
    expect(reprintExpression('this')).toBe('this');
    expect(reprintExpression('ClassName.classMember')).toBe('ClassName.classMember');
    expect(reprintExpression('ClassName.<A,B>classMember')).toBe('ClassName.<A, B>classMember');
    expect(reprintExpression('/* a */ ClassName./* b */ <A,B> /* c */ classMember')).toBe(
      `/* a */
ClassName
/* b */ /* c */
.<A, B>classMember`
    );
    expect(reprintExpression('ClassName/* a */.classMember')).toBe(
      'ClassName /* a */ .classMember'
    );
    expect(reprintExpression('ClassName. /* b */classMember')).toBe(
      'ClassName /* b */ .classMember'
    );
    expect(reprintExpression('ClassName/* a */. /* b */classMember')).toBe(
      'ClassName /* a */ /* b */ .classMember'
    );

    expect(reprintExpression('[1,2,3,4,5,6,7,8,9]')).toBe('[1, 2, 3, 4, 5, 6, 7, 8, 9]');
    expect(reprintExpression('// a\n[/* a*/ 1,// abc\n2,3]')).toBe(`// a
[
  /* a */ 1,
  // abc
  2,
  3
]`);
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
    expect(
      reprintExpression(
        '[/* a */ 1, /* a */ 2, /* a */ 3, /* a */ 4, /* a */ 5, /* a */ 6, /* a */ 7, ' +
          '/* a */ 8, /* a */ 9, /* a */ 10, /* a */ 11, /* a */ 12, /* a */ 13, /* a */ 14]'
      )
    ).toBe(
      `[
  /* a */ 1,
  /* a */ 2,
  /* a */ 3,
  /* a */ 4,
  /* a */ 5,
  /* a */ 6,
  /* a */ 7,
  /* a */ 8,
  /* a */ 9,
  /* a */ 10,
  /* a */ 11,
  /* a */ 12,
  /* a */ 13,
  /* a */ 14
]`
    );

    expect(reprintExpression('Test.VariantName(42)')).toBe('Test.VariantName(42)');
    expect(reprintExpression('Test.<T>VariantName(42)')).toBe('Test.<T>VariantName(42)');
    expect(reprintExpression('/* a */ Test./* b */ <T>/* c */ VariantName(42)')).toBe(
      `/* a */
Test /* b */ /* c */ .<T>VariantName(42)`
    );
    expect(reprintExpression('/* a */Obj.VariantName(/* b */42)')).toBe(
      '/* a */ Obj.VariantName(/* b */ 42)'
    );
    expect(reprintExpression('V.VariantName(aVariableNameThatIsVeryVeryVeryLong)')).toBe(
      `V.VariantName(
  aVariableNameThatIsVeryVeryVeryLong
)`
    );

    expect(reprintExpression('foo.bar')).toBe('foo.bar');

    expect(
      prettyPrintSamlangExpression_EXPOSED_FOR_TESTING(
        40,
        SourceExpressionMethodAccess({
          type: intType,
          expression: SourceExpressionVariable({ type: intType, name: 'foo' }),
          methodName: SourceId('bar'),
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
    expect(reprintExpression('/* a */ 1 /* plus */ + /* b */ 1')).toBe(
      '/* a */ 1 /* plus */ + /* b */ 1'
    );
    expect(reprintExpression('1 + 1 * 1')).toBe('1 + 1 * 1');
    expect(reprintExpression('(1 + 1) * 1')).toBe('(1 + 1) * 1');
    expect(reprintExpression('1 - (1 + 1)')).toBe('1 - (1 + 1)');
    expect(reprintExpression('1 + (1 + 1)')).toBe('1 + 1 + 1');
    expect(reprintExpression('1 + 1 + 1 + 1')).toBe('1 + 1 + 1 + 1');
    expect(reprintExpression('1 + 1 + 1 - 1')).toBe('1 + 1 + 1 - 1');
    expect(reprintExpression('1 * 1 * 1')).toBe('1 * 1 * 1');
    expect(reprintExpression('1 / 1 % 1 * 1')).toBe('1 / 1 % 1 * 1');
    expect(reprintExpression('true && false && true')).toBe('true && false && true');
    expect(reprintExpression('true || false || true')).toBe('true || false || true');
    expect(reprintExpression('"dev" :: "meggo" :: "vibez"')).toBe('"dev" :: "meggo" :: "vibez"');

    expect(reprintExpression('if (b) then a else c')).toBe('if (b) then a else c');
    expect(
      reprintExpression(
        `
      if (b) then {
        // fff
        val _ = println("");
        val _ = println("");
        val _ = println("");
        /* f */
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
  // fff
  val _ = println("");
  val _ = println("");
  val _ = println("");
  /* f */
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
    ).toBe(`() -> () -> () -> {
  val a: unit = {
    val b: unit = {
      val c: unit = {
        val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong;
      };
    };
  };
}`);
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

  /* not ignored */ /** foo bar a */
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

  /* not ignored */ /** foo bar a */
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
class A(val a: int)

/**
 * some very very very very very very
 * very very very very very very very
 * very very very very very long
 * document string
 */
class Main`);
  });
});
