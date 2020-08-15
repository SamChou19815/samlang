import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';
import { intType } from '../../ast/common/types';
import { EXPRESSION_METHOD_ACCESS, EXPRESSION_VARIABLE } from '../../ast/lang/samlang-expressions';
import { createGlobalErrorCollector } from '../../errors';
import { parseSamlangExpressionFromText } from '../../parser';
import { assertNotNull } from '../../util/type-assertions';
// eslint-disable-next-line camelcase
import { prettyPrintSamlangExpression_EXPOSED_FOR_TESTING } from '../printer-source-level';

const reprintExpression = (rawSourceWithTypeAnnotation: string, width = 40): string => {
  const errorCollector = createGlobalErrorCollector();
  const expression = parseSamlangExpressionFromText(
    rawSourceWithTypeAnnotation,
    errorCollector.getModuleErrorCollector(ModuleReference.ROOT)
  );
  assertNotNull(expression);
  const errors = errorCollector.getErrors().map((it) => it.toString());
  expect(errors).toEqual([]);
  return prettyPrintSamlangExpression_EXPOSED_FOR_TESTING(width, expression).trimEnd();
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

  expect(reprintExpression('foo.bar')).toBe('(foo).bar');

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
  ).toBe('(foo).bar');

  expect(reprintExpression('-42')).toBe('-(42)');
  expect(reprintExpression('!aVariableNameThatIsVeryVeryVeryVeryVeryLong')).toBe(`!(
  aVariableNameThatIsVeryVeryVeryVeryVeryLong
)`);

  expect(reprintExpression('panic(ah)')).toBe('panic(ah)');
  expect(reprintExpression('println(ah)')).toBe('println(ah)');
  expect(reprintExpression('foo()')).toBe('(foo)()');
  expect(reprintExpression('foo(bar)')).toBe('(foo)(bar)');
  expect(reprintExpression('foo(bar,baz)')).toBe('(foo)(bar, baz)');
  expect(reprintExpression('foo(v1, v2, v3, v4, v5, v6, v7, v8, v9, v10)')).toBe(
    `(foo)(
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

  expect(reprintExpression('1 + 1')).toBe('(1) + (1)');
  expect(
    reprintExpression(
      'aVariableNameThatIsVeryVeryVeryVeryVeryLong + aVariableNameThatIsVeryVeryVeryVeryVeryLong'
    )
  ).toBe(
    `(
  aVariableNameThatIsVeryVeryVeryVeryVeryLong
) + (
  aVariableNameThatIsVeryVeryVeryVeryVeryLong
)`
  );

  expect(reprintExpression('if (b) then a else c')).toBe('if (b) then (a) else (c)');
  expect(
    reprintExpression(
      'if (aVariableNameThatIsVeryVeryVeryVeryVeryLong) then aVariableNameThatIsVeryVeryVeryVeryVeryLong else aVariableNameThatIsVeryVeryVeryVeryVeryLong'
    )
  ).toBe(
    `if (
  aVariableNameThatIsVeryVeryVeryVeryVeryLong
) then (
  aVariableNameThatIsVeryVeryVeryVeryVeryLong
) else (
  aVariableNameThatIsVeryVeryVeryVeryVeryLong
)`
  );

  expect(reprintExpression('match (v) { | None _ -> fooBar | Some bazBaz -> bazBaz }'))
    .toBe(`match (v) {
  | None _ -> (fooBar)
  | Some bazBaz -> (bazBaz)
}`);

  expect(reprintExpression('() -> 1')).toBe('() -> (1)');
  expect(reprintExpression('(a: int) -> 1')).toBe('(a: int) -> (1)');
  expect(reprintExpression('(a: int) -> aVariableNameThatIsVeryVeryVeryVeryVeryLong')).toBe(
    `(a: int) -> (
  aVariableNameThatIsVeryVeryVeryVeryVeryLong
)`
  );

  expect(reprintExpression('{}')).toBe('{  }');
  expect(reprintExpression('{3}')).toBe('{ 3 }');
  expect(reprintExpression('{ val _:int=0;val _:int=0; }')).toBe(
    '{ val _: int = 0; val _: int = 0; }'
  );
  expect(reprintExpression('{ val a:int=1;val [b,_]:[int*int]=2; 3 }')).toBe(`{
  val a: int = 1;
  val [b, _]: [int * int] = 2;
  3
}`);
  expect(reprintExpression('{ val {a, b as c}: int = 3 }')).toBe('{ val { a, b as c }: int = 3; }');

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
    () -> (
      {
        val a: unit = {
          val b: unit = {
            val c: unit = {
              val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong;
            };
          };
        };
      }
    )
  )
)`);
});