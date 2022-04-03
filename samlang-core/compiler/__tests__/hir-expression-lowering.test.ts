import { DummySourceReason, ModuleReference, Range } from '../../ast/common-nodes';
import { AND, CONCAT, MUL, OR, PLUS } from '../../ast/common-operators';
import {
  debugPrintHighIRExpression,
  debugPrintHighIRSources,
  debugPrintHighIRStatement,
  HighIRSources,
  HIR_BOOL_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_INT_TYPE,
} from '../../ast/hir-nodes';
import {
  SamlangExpression,
  SourceBoolType,
  SourceExpressionBinary,
  SourceExpressionClassMember,
  SourceExpressionFalse,
  SourceExpressionFieldAccess,
  SourceExpressionFunctionCall,
  SourceExpressionIfElse,
  SourceExpressionInt,
  SourceExpressionLambda,
  SourceExpressionMatch,
  SourceExpressionMethodAccess,
  SourceExpressionStatementBlock,
  SourceExpressionString,
  SourceExpressionThis,
  SourceExpressionTrue,
  SourceExpressionTupleConstructor,
  SourceExpressionUnary,
  SourceExpressionVariable,
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import lowerSamlangExpression from '../hir-expression-lowering';
import HighIRStringManager from '../hir-string-manager';
import { HighIRTypeSynthesizer, SamlangTypeLoweringManager } from '../hir-type-conversion';

const DUMMY_IDENTIFIER_TYPE = SourceIdentifierType(
  DummySourceReason,
  ModuleReference.DUMMY,
  'Dummy'
);
const THIS = SourceExpressionThis({ type: DUMMY_IDENTIFIER_TYPE });

function expectCorrectlyLowered(
  samlangExpression: SamlangExpression,
  expectedString: string
): void {
  const typeSynthesizer = new HighIRTypeSynthesizer();
  const typeLoweringManager = new SamlangTypeLoweringManager(new Set(), typeSynthesizer);
  const stringManager = new HighIRStringManager();
  const { statements, expression, syntheticFunctions } = lowerSamlangExpression(
    /* moduleReference */ ModuleReference.DUMMY,
    /* encodedFunctionName */ 'ENCODED_FUNCTION_NAME',
    [
      ['_this', HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('__DUMMY___Dummy')],
      ['foo', HIR_INT_TYPE],
      ['bar', HIR_BOOL_TYPE],
      ['closure', HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Closure')],
      ['closure_unit_return', HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Closure')],
      ['captured_a', HIR_INT_TYPE],
    ],
    /* typeDefinitionMapping */ {
      __DUMMY___Foo: {
        identifier: '__DUMMY___Foo',
        type: 'object',
        typeParameters: [],
        names: [],
        mappings: [HIR_INT_TYPE, HIR_INT_TYPE],
      },
      __DUMMY___Dummy: {
        identifier: '__DUMMY___Dummy',
        type: 'object',
        typeParameters: [],
        names: [],
        mappings: [HIR_INT_TYPE, HIR_INT_TYPE],
      },
    },
    /* typeLoweringManager */ typeLoweringManager,
    /* stringManager */ stringManager,
    /* expression */ samlangExpression
  );
  const syntheticModule: HighIRSources = {
    globalVariables: stringManager.globalVariables,
    closureTypes: typeSynthesizer.synthesizedClosureTypes,
    typeDefinitions: typeSynthesizer.synthesizedTupleTypes,
    mainFunctionNames: [],
    functions: syntheticFunctions,
  };
  expect(
    `${debugPrintHighIRSources(syntheticModule)}
${statements.map((it) => debugPrintHighIRStatement(it)).join('\n')}
return ${debugPrintHighIRExpression(expression)};`.trim()
  ).toBe(expectedString);
}

describe('hir-expression-lowering', () => {
  it('Literal lowering works.', () => {
    expectCorrectlyLowered(SourceExpressionFalse(), 'return 0;');
    expectCorrectlyLowered(SourceExpressionTrue(), 'return 1;');
    expectCorrectlyLowered(SourceExpressionInt(0), 'return 0;');
    expectCorrectlyLowered(
      SourceExpressionString('foo'),
      "const GLOBAL_STRING_0 = 'foo';\n\n\nreturn GLOBAL_STRING_0;"
    );
  });

  it('This lowering works.', () => {
    expectCorrectlyLowered(THIS, 'return (_this: __DUMMY___Dummy);');
  });

  it('Variable lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionVariable({ type: SourceUnitType(DummySourceReason), name: 'foo' }),
      'return (foo: int);'
    );
  });

  it('ClassMember lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionClassMember({
        type: SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceIntType(DummySourceReason)
        ),
        typeArguments: [],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('A'),
        memberName: SourceId('b'),
      }),
      `closure type $SyntheticIDType0 = (int) -> int
let _t0: $SyntheticIDType0 = Closure { fun: (___DUMMY___A_b_with_context: (int, int) -> int), context: 0 };
return (_t0: $SyntheticIDType0);`
    );
  });

  it('Lowering to StructConstructor works', () => {
    expectCorrectlyLowered(
      SourceExpressionTupleConstructor({
        type: SourceTupleType(DummySourceReason, [DUMMY_IDENTIFIER_TYPE]),
        expressions: [THIS],
      }),
      `object type $SyntheticIDType0 = [__DUMMY___Dummy]
let _t0: $SyntheticIDType0 = [(_this: __DUMMY___Dummy)];
return (_t0: $SyntheticIDType0);`
    );
  });

  it('FieldAccess lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionFieldAccess({
        type: SourceUnitType(DummySourceReason),
        expression: THIS,
        fieldName: SourceId('foo'),
        fieldOrder: 0,
      }),
      'let _t0: int = (_this: __DUMMY___Dummy)[0];\nreturn (_t0: int);'
    );
  });

  it('MethodAccess lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionMethodAccess({
        type: SourceFunctionType(
          DummySourceReason,
          [SourceIntType(DummySourceReason)],
          SourceIntType(DummySourceReason)
        ),
        expression: THIS,
        methodName: SourceId('foo'),
      }),
      `closure type $SyntheticIDType0 = (int) -> int
let _t0: $SyntheticIDType0 = Closure { fun: (___DUMMY___Dummy_foo: (__DUMMY___Dummy, int) -> int), context: (_this: __DUMMY___Dummy) };
return (_t0: $SyntheticIDType0);`
    );
  });

  it('Unary lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionUnary({
        type: SourceUnitType(DummySourceReason),
        operator: '!',
        expression: THIS,
      }),
      'let _t0: bool = (_this: __DUMMY___Dummy) ^ 1;\nreturn (_t0: bool);'
    );

    expectCorrectlyLowered(
      SourceExpressionUnary({
        type: SourceUnitType(DummySourceReason),
        operator: '-',
        expression: THIS,
      }),
      'let _t0: int = 0 - (_this: __DUMMY___Dummy);\nreturn (_t0: int);'
    );
  });

  describe('FunctionCall family lowering works', () => {
    it('1/n: class member call with return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: SourceIntType(DummySourceReason),
          functionExpression: SourceExpressionClassMember({
            type: SourceFunctionType(
              DummySourceReason,
              [DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE],
              SourceIntType(DummySourceReason)
            ),
            typeArguments: [],
            moduleReference: ModuleReference(['ModuleModule']),
            className: SourceId('ImportedClass'),
            memberName: SourceId('bar'),
          }),
          functionArguments: [THIS, THIS],
        }),
        `let _t0: int = _ModuleModule_ImportedClass_bar((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t0: int);`
      );
    });

    it('2/n class member call without return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: SourceUnitType(DummySourceReason),
          functionExpression: SourceExpressionClassMember({
            type: SourceFunctionType(
              DummySourceReason,
              [SourceIntType(DummySourceReason)],
              SourceUnitType(DummySourceReason)
            ),
            typeArguments: [],
            moduleReference: ModuleReference.DUMMY,
            className: SourceId('C'),
            memberName: SourceId('m1'),
          }),
          functionArguments: [SourceExpressionInt(0)],
        }),
        `___DUMMY___C_m1(0);
return 0;`
      );
    });

    it('3/n class member call with return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: DUMMY_IDENTIFIER_TYPE,
          functionExpression: SourceExpressionClassMember({
            type: SourceFunctionType(
              DummySourceReason,
              [SourceIntType(DummySourceReason)],
              DUMMY_IDENTIFIER_TYPE
            ),
            typeArguments: [],
            moduleReference: ModuleReference.DUMMY,
            className: SourceId('C'),
            memberName: SourceId('m2'),
          }),
          functionArguments: [SourceExpressionInt(0)],
        }),
        `let _t0: __DUMMY___Dummy = ___DUMMY___C_m2(0);
return (_t0: __DUMMY___Dummy);`
      );
    });

    it('4/n method call with return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: SourceIntType(DummySourceReason),
          functionExpression: SourceExpressionMethodAccess({
            type: SourceFunctionType(
              DummySourceReason,
              [DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE],
              SourceIntType(DummySourceReason)
            ),
            expression: THIS,
            methodName: SourceId('fooBar'),
          }),
          functionArguments: [THIS, THIS],
        }),
        `let _t0: int = ___DUMMY___Dummy_fooBar((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t0: int);`
      );
    });

    it('5/n closure call with return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: SourceIntType(DummySourceReason),
          functionExpression: SourceExpressionVariable({
            type: SourceFunctionType(
              DummySourceReason,
              [SourceBoolType(DummySourceReason)],
              SourceIntType(DummySourceReason)
            ),
            name: 'closure',
          }),
          functionArguments: [SourceExpressionTrue(Range.DUMMY, [])],
        }),
        `let _t0: int = (closure: Closure)(1);
return (_t0: int);`
      );
    });

    it('6/n closure call without return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: SourceUnitType(DummySourceReason),
          functionExpression: SourceExpressionVariable({
            type: SourceFunctionType(
              DummySourceReason,
              [SourceBoolType(DummySourceReason)],
              SourceUnitType(DummySourceReason)
            ),
            name: 'closure_unit_return',
          }),
          functionArguments: [SourceExpressionTrue(Range.DUMMY, [])],
        }),
        `(closure_unit_return: Closure)(1);
return 0;`
      );
    });
  });

  describe('Binary lowering works.', () => {
    it('Normal +', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceIntType(DummySourceReason),
          operatorPrecedingComments: [],
          operator: PLUS,
          e1: THIS,
          e2: THIS,
        }),
        'let _t0: int = (_this: __DUMMY___Dummy) + (_this: __DUMMY___Dummy);\nreturn (_t0: int);'
      );
    });

    it('Normal *', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceIntType(DummySourceReason),
          operatorPrecedingComments: [],
          operator: MUL,
          e1: THIS,
          e2: THIS,
        }),
        'let _t0: int = (_this: __DUMMY___Dummy) * (_this: __DUMMY___Dummy);\nreturn (_t0: int);'
      );
    });

    it('Short circuiting &&', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceBoolType(DummySourceReason),
          operatorPrecedingComments: [],
          operator: AND,
          e1: SourceExpressionVariable({ type: SourceBoolType(DummySourceReason), name: 'foo' }),
          e2: SourceExpressionVariable({ type: SourceBoolType(DummySourceReason), name: 'bar' }),
        }),
        `let _t0: bool;
if (foo: int) {
  _t0 = (bar: bool);
} else {
  _t0 = 0;
}
return (_t0: bool);`
      );

      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceBoolType(DummySourceReason),
          operatorPrecedingComments: [],
          operator: AND,
          e1: SourceExpressionTrue(),
          e2: SourceExpressionVariable({ type: SourceIntType(DummySourceReason), name: 'foo' }),
        }),
        'return (foo: int);'
      );

      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceBoolType(DummySourceReason),
          operatorPrecedingComments: [],
          operator: AND,
          e1: SourceExpressionFalse(),
          e2: SourceExpressionVariable({ type: SourceIntType(DummySourceReason), name: 'foo' }),
        }),
        'return 0;'
      );
    });

    it('Short circuiting ||', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceBoolType(DummySourceReason),
          operator: OR,
          operatorPrecedingComments: [],
          e1: SourceExpressionTrue(),
          e2: SourceExpressionInt(65536),
        }),
        'return 1;'
      );

      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceBoolType(DummySourceReason),
          operatorPrecedingComments: [],
          operator: OR,
          e1: SourceExpressionFalse(),
          e2: SourceExpressionInt(65536),
        }),
        'return 65536;'
      );

      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceBoolType(DummySourceReason),
          operatorPrecedingComments: [],
          operator: OR,
          e1: SourceExpressionVariable({ type: SourceBoolType(DummySourceReason), name: 'foo' }),
          e2: SourceExpressionVariable({ type: SourceBoolType(DummySourceReason), name: 'bar' }),
        }),
        `let _t0: bool;
if (foo: int) {
  _t0 = 1;
} else {
  _t0 = (bar: bool);
}
return (_t0: bool);`
      );
    });

    it('Normal string concat', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceStringType(DummySourceReason),
          operatorPrecedingComments: [],
          operator: CONCAT,
          e1: THIS,
          e2: THIS,
        }),
        `let _t0: string = _builtin_stringConcat((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t0: string);`
      );
    });

    it('Optimizing string concat', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: SourceStringType(DummySourceReason),
          operatorPrecedingComments: [],
          operator: CONCAT,
          e1: SourceExpressionString('hello '),
          e2: SourceExpressionString('world'),
        }),
        "const GLOBAL_STRING_0 = 'hello world';\n\n\nreturn GLOBAL_STRING_0;"
      );
    });
  });

  describe('Lambda lowering works', () => {
    it('1/n', () => {
      expectCorrectlyLowered(
        SourceExpressionLambda({
          type: SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason)),
          parameters: [[SourceId('a'), SourceUnitType(DummySourceReason)]],
          captured: { captured_a: SourceUnitType(DummySourceReason) },
          body: THIS,
        }),
        `closure type $SyntheticIDType1 = (int) -> int
object type $SyntheticIDType0 = [int]
function ___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0(_context: $SyntheticIDType0, a: int): int {
  let captured_a: int = (_context: $SyntheticIDType0)[0];
  return (_this: __DUMMY___Dummy);
}

let _t1: $SyntheticIDType0 = [(captured_a: int)];
let _t0: $SyntheticIDType1 = Closure { fun: (___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0: ($SyntheticIDType0, int) -> int), context: (_t1: $SyntheticIDType0) };
return (_t0: $SyntheticIDType1);`
      );
    });

    it('2/n', () => {
      expectCorrectlyLowered(
        SourceExpressionLambda({
          type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
          parameters: [[SourceId('a'), SourceUnitType(DummySourceReason)]],
          captured: { captured_a: SourceUnitType(DummySourceReason) },
          body: THIS,
        }),
        `closure type $SyntheticIDType1 = (int) -> int
object type $SyntheticIDType0 = [int]
function ___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0(_context: $SyntheticIDType0, a: int): int {
  let captured_a: int = (_context: $SyntheticIDType0)[0];
  return (_this: __DUMMY___Dummy);
}

let _t1: $SyntheticIDType0 = [(captured_a: int)];
let _t0: $SyntheticIDType1 = Closure { fun: (___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0: ($SyntheticIDType0, int) -> int), context: (_t1: $SyntheticIDType0) };
return (_t0: $SyntheticIDType1);`
      );
    });

    it('3/n', () => {
      expectCorrectlyLowered(
        SourceExpressionLambda({
          type: SourceFunctionType(DummySourceReason, [], DUMMY_IDENTIFIER_TYPE),
          parameters: [[SourceId('a'), SourceUnitType(DummySourceReason)]],
          captured: { captured_a: SourceUnitType(DummySourceReason) },
          body: THIS,
        }),
        `closure type $SyntheticIDType1 = (int) -> __DUMMY___Dummy
object type $SyntheticIDType0 = [int]
function ___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0(_context: $SyntheticIDType0, a: int): __DUMMY___Dummy {
  let captured_a: int = (_context: $SyntheticIDType0)[0];
  return (_this: __DUMMY___Dummy);
}

let _t1: $SyntheticIDType0 = [(captured_a: int)];
let _t0: $SyntheticIDType1 = Closure { fun: (___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0: ($SyntheticIDType0, int) -> __DUMMY___Dummy), context: (_t1: $SyntheticIDType0) };
return (_t0: $SyntheticIDType1);`
      );
    });

    it('4/n', () => {
      expectCorrectlyLowered(
        SourceExpressionLambda({
          type: SourceFunctionType(DummySourceReason, [], DUMMY_IDENTIFIER_TYPE),
          parameters: [[SourceId('a'), SourceUnitType(DummySourceReason)]],
          captured: {},
          body: THIS,
        }),
        `closure type $SyntheticIDType0 = (int) -> __DUMMY___Dummy
function ___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0(_context: int, a: int): __DUMMY___Dummy {
  return (_this: __DUMMY___Dummy);
}

let _t0: $SyntheticIDType0 = Closure { fun: (___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0: (int, int) -> __DUMMY___Dummy), context: 0 };
return (_t0: $SyntheticIDType0);`
      );
    });
  });

  describe('IfElse lowering works', () => {
    it('1/n', () => {
      expectCorrectlyLowered(
        SourceExpressionIfElse({
          type: DUMMY_IDENTIFIER_TYPE,
          boolExpression: THIS,
          e1: THIS,
          e2: THIS,
        }),
        `let _t0: __DUMMY___Dummy;
if (_this: __DUMMY___Dummy) {
  _t0 = (_this: __DUMMY___Dummy);
} else {
  _t0 = (_this: __DUMMY___Dummy);
}
return (_t0: __DUMMY___Dummy);`
      );
    });

    it('2/n', () => {
      expectCorrectlyLowered(
        SourceExpressionIfElse({
          type: SourceUnitType(DummySourceReason),
          boolExpression: THIS,
          e1: THIS,
          e2: THIS,
        }),
        `if (_this: __DUMMY___Dummy) {
} else {
}
return 0;`
      );
    });
  });

  describe('Match lowering works', () => {
    it('1/n', () => {
      expectCorrectlyLowered(
        SourceExpressionMatch({
          type: DUMMY_IDENTIFIER_TYPE,
          matchedExpression: THIS,
          matchingList: [
            {
              range: Range.DUMMY,
              tag: SourceId('Foo'),
              tagOrder: 0,
              dataVariable: [SourceId('bar'), SourceIntType(DummySourceReason)],
              expression: THIS,
            },
            {
              range: Range.DUMMY,
              tag: SourceId('Bar'),
              tagOrder: 1,
              expression: THIS,
            },
          ],
        }),
        `let _t0: int = (_this: __DUMMY___Dummy)[0];
let _t1: bool = (_t0: int) == 0;
let _t2: __DUMMY___Dummy;
if (_t1: bool) {
  let bar: int = (_this: __DUMMY___Dummy)[1];
  _t2 = (_this: __DUMMY___Dummy);
} else {
  _t2 = (_this: __DUMMY___Dummy);
}
return (_t2: __DUMMY___Dummy);`
      );
    });

    it('2/n', () => {
      expectCorrectlyLowered(
        SourceExpressionMatch({
          type: SourceUnitType(DummySourceReason),
          matchedExpression: THIS,
          matchingList: [
            {
              range: Range.DUMMY,
              tag: SourceId('Foo'),
              tagOrder: 0,
              dataVariable: [SourceId('bar'), SourceIntType(DummySourceReason)],
              expression: THIS,
            },
            {
              range: Range.DUMMY,
              tag: SourceId('Bar'),
              tagOrder: 1,
              expression: THIS,
            },
            {
              range: Range.DUMMY,
              tag: SourceId('Baz'),
              tagOrder: 2,
              expression: THIS,
            },
          ],
        }),
        `let _t0: int = (_this: __DUMMY___Dummy)[0];
let _t2: bool = (_t0: int) == 0;
if (_t2: bool) {
  let bar: int = (_this: __DUMMY___Dummy)[1];
} else {
  let _t1: bool = (_t0: int) == 1;
  if (_t1: bool) {
  } else {
  }
}
return 0;`
      );
    });

    it('3/n', () => {
      expectCorrectlyLowered(
        SourceExpressionMatch({
          type: DUMMY_IDENTIFIER_TYPE,
          matchedExpression: THIS,
          matchingList: [
            {
              range: Range.DUMMY,
              tag: SourceId('Foo'),
              tagOrder: 0,
              expression: THIS,
            },
            {
              range: Range.DUMMY,
              tag: SourceId('Bar'),
              tagOrder: 1,
              dataVariable: [SourceId('bar'), DUMMY_IDENTIFIER_TYPE],
              expression: SourceExpressionVariable({ type: DUMMY_IDENTIFIER_TYPE, name: 'bar' }),
            },
            {
              range: Range.DUMMY,
              tag: SourceId('Baz'),
              tagOrder: 2,
              expression: THIS,
            },
          ],
        }),
        `let _t0: int = (_this: __DUMMY___Dummy)[0];
let _t3: bool = (_t0: int) == 0;
let _t4: __DUMMY___Dummy;
if (_t3: bool) {
  _t4 = (_this: __DUMMY___Dummy);
} else {
  let _t1: bool = (_t0: int) == 1;
  let _t2: __DUMMY___Dummy;
  if (_t1: bool) {
    let bar: int = (_this: __DUMMY___Dummy)[1];
    _t2 = (bar: int);
  } else {
    _t2 = (_this: __DUMMY___Dummy);
  }
  _t4 = (_t2: __DUMMY___Dummy);
}
return (_t4: __DUMMY___Dummy);`
      );
    });
  });

  describe('StatementBlockExpression lowering works', () => {
    it('All syntax forms', () => {
      expectCorrectlyLowered(
        SourceExpressionStatementBlock({
          type: SourceUnitType(DummySourceReason),
          block: {
            range: Range.DUMMY,
            statements: [
              {
                range: Range.DUMMY,
                pattern: {
                  range: Range.DUMMY,
                  type: 'TuplePattern',
                  destructedNames: [
                    { name: SourceId('ignored'), type: SourceIntType(DummySourceReason) },
                    { type: SourceIntType(DummySourceReason) },
                  ],
                },
                typeAnnotation: SourceTupleType(DummySourceReason, [
                  SourceIntType(DummySourceReason),
                  SourceIntType(DummySourceReason),
                ]),
                assignedExpression: SourceExpressionTupleConstructor({
                  range: Range.DUMMY,
                  type: SourceTupleType(DummySourceReason, [
                    SourceIntType(DummySourceReason),
                    SourceIntType(DummySourceReason),
                  ]),
                  associatedComments: [],
                  expressions: [SourceExpressionInt(1), SourceExpressionInt(2)],
                }),
                associatedComments: [],
              },
              {
                range: Range.DUMMY,
                pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
                typeAnnotation: SourceUnitType(DummySourceReason),
                assignedExpression: SourceExpressionStatementBlock({
                  type: SourceUnitType(DummySourceReason),
                  block: {
                    range: Range.DUMMY,
                    statements: [
                      {
                        range: Range.DUMMY,
                        pattern: {
                          range: Range.DUMMY,
                          type: 'TuplePattern',
                          destructedNames: [
                            { name: SourceId('a'), type: SourceIntType(DummySourceReason) },
                            { type: SourceIntType(DummySourceReason) },
                          ],
                        },
                        typeAnnotation: SourceTupleType(DummySourceReason, [
                          SourceIntType(DummySourceReason),
                          SourceIntType(DummySourceReason),
                        ]),
                        assignedExpression: {
                          ...THIS,
                          type: SourceTupleType(DummySourceReason, [
                            SourceIntType(DummySourceReason),
                            SourceIntType(DummySourceReason),
                          ]),
                        },
                        associatedComments: [],
                      },
                      {
                        range: Range.DUMMY,
                        pattern: {
                          range: Range.DUMMY,
                          type: 'ObjectPattern',
                          destructedNames: [
                            {
                              range: Range.DUMMY,
                              fieldName: SourceId('a'),
                              type: SourceIntType(DummySourceReason),
                              fieldOrder: 0,
                            },
                            {
                              range: Range.DUMMY,
                              fieldName: SourceId('b'),
                              type: SourceIntType(DummySourceReason),
                              fieldOrder: 1,
                              alias: SourceId('c'),
                            },
                          ],
                        },
                        typeAnnotation: DUMMY_IDENTIFIER_TYPE,
                        assignedExpression: THIS,
                        associatedComments: [],
                      },
                      {
                        range: Range.DUMMY,
                        pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
                        typeAnnotation: DUMMY_IDENTIFIER_TYPE,
                        assignedExpression: THIS,
                        associatedComments: [],
                      },
                    ],
                    expression: SourceExpressionVariable({
                      type: SourceUnitType(DummySourceReason),
                      name: 'a',
                    }),
                  },
                }),
                associatedComments: [],
              },
            ],
          },
        }),
        `object type $SyntheticIDType0 = [int, int]
let _t0: $SyntheticIDType0 = [1, 2];
let ignored: int = (_t0: $SyntheticIDType0)[0];
let a__depth_1__block_0: int = (_this: __DUMMY___Dummy)[0];
let a__depth_1__block_0: int = (_this: __DUMMY___Dummy)[0];
let c__depth_1__block_0: int = (_this: __DUMMY___Dummy)[1];
return 0;`
      );
    });

    it('Copy propagation', () => {
      expectCorrectlyLowered(
        SourceExpressionStatementBlock({
          type: SourceUnitType(DummySourceReason),
          block: {
            range: Range.DUMMY,
            statements: [
              {
                range: Range.DUMMY,
                pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
                typeAnnotation: SourceUnitType(DummySourceReason),
                assignedExpression: SourceExpressionString('foo'),
                associatedComments: [],
              },
              {
                range: Range.DUMMY,
                pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
                typeAnnotation: SourceUnitType(DummySourceReason),
                assignedExpression: SourceExpressionVariable({
                  type: SourceStringType(DummySourceReason),
                  name: 'a',
                }),
                associatedComments: [],
              },
            ],
            expression: SourceExpressionVariable({
              type: SourceStringType(DummySourceReason),
              name: 'b',
            }),
          },
        }),
        "const GLOBAL_STRING_0 = 'foo';\n\n\nreturn GLOBAL_STRING_0;"
      );
    });

    it('Shadowing', () => {
      expectCorrectlyLowered(
        SourceExpressionStatementBlock({
          type: SourceStringType(DummySourceReason),
          block: {
            range: Range.DUMMY,
            statements: [
              {
                range: Range.DUMMY,
                typeAnnotation: SourceStringType(DummySourceReason),
                pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
                assignedExpression: SourceExpressionStatementBlock({
                  type: SourceUnitType(DummySourceReason),
                  block: {
                    range: Range.DUMMY,
                    statements: [
                      {
                        range: Range.DUMMY,
                        typeAnnotation: SourceIntType(DummySourceReason),
                        pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
                        assignedExpression: THIS,
                        associatedComments: [],
                      },
                    ],
                    expression: SourceExpressionVariable({
                      type: SourceStringType(DummySourceReason),
                      name: 'a',
                    }),
                  },
                }),
                associatedComments: [],
              },
            ],
            expression: SourceExpressionVariable({
              type: SourceStringType(DummySourceReason),
              name: 'a',
            }),
          },
        }),
        'return (_this: __DUMMY___Dummy);'
      );
    });
  });
});
