import { Location, ModuleReference } from '../../ast/common-nodes';
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
  AstBuilder,
  SamlangExpression,
  SourceExpressionBinary,
  SourceExpressionClassMember,
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
  SourceExpressionUnary,
  SourceExpressionVariable,
  SourceId,
} from '../../ast/samlang-nodes';
import lowerSamlangExpression from '../hir-expression-lowering';
import HighIRStringManager from '../hir-string-manager';
import { HighIRTypeSynthesizer, SamlangTypeLoweringManager } from '../hir-type-conversion';

const DUMMY_IDENTIFIER_TYPE = AstBuilder.IdType('Dummy');
const THIS = SourceExpressionThis({ type: DUMMY_IDENTIFIER_TYPE });

function expectCorrectlyLowered(
  samlangExpression: SamlangExpression,
  expectedString: string,
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
    /* typeDefinitionMapping */ new Map([
      [
        '__DUMMY___Foo',
        {
          identifier: '__DUMMY___Foo',
          type: 'object',
          typeParameters: [],
          names: [],
          mappings: [HIR_INT_TYPE, HIR_INT_TYPE],
        },
      ],
      [
        '__DUMMY___Dummy',
        {
          identifier: '__DUMMY___Dummy',
          type: 'object',
          typeParameters: [],
          names: [],
          mappings: [HIR_INT_TYPE, HIR_INT_TYPE],
        },
      ],
    ]),
    /* typeLoweringManager */ typeLoweringManager,
    /* stringManager */ stringManager,
    /* expression */ samlangExpression,
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
return ${debugPrintHighIRExpression(expression)};`.trim(),
  ).toBe(expectedString);
}

describe('hir-expression-lowering', () => {
  it('Literal lowering works.', () => {
    expectCorrectlyLowered(AstBuilder.FALSE, 'return 0;');
    expectCorrectlyLowered(AstBuilder.TRUE, 'return 1;');
    expectCorrectlyLowered(AstBuilder.ZERO, 'return 0;');
    expectCorrectlyLowered(
      SourceExpressionString('foo'),
      "const GLOBAL_STRING_0 = 'foo';\n\n\nreturn GLOBAL_STRING_0;",
    );
  });

  it('This lowering works.', () => {
    expectCorrectlyLowered(THIS, 'return (_this: __DUMMY___Dummy);');
  });

  it('Variable lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionVariable({ type: AstBuilder.UnitType, name: 'foo' }),
      'return (foo: int);',
    );
  });

  it('ClassMember lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionClassMember({
        type: AstBuilder.FunType([AstBuilder.IntType], AstBuilder.IntType),
        typeArguments: [],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('A'),
        memberName: SourceId('b'),
      }),
      `closure type $SyntheticIDType0 = (int) -> int
let _t0: $SyntheticIDType0 = Closure { fun: (___DUMMY___A_b_with_context: (int, int) -> int), context: 0 };
return (_t0: $SyntheticIDType0);`,
    );
  });

  it('FieldAccess lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionFieldAccess({
        type: AstBuilder.UnitType,
        expression: THIS,
        fieldName: SourceId('foo'),
        fieldOrder: 0,
      }),
      'let _t0: int = (_this: __DUMMY___Dummy)[0];\nreturn (_t0: int);',
    );
  });

  it('MethodAccess lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionMethodAccess({
        type: AstBuilder.FunType([AstBuilder.IntType], AstBuilder.IntType),
        expression: THIS,
        methodName: SourceId('foo'),
      }),
      `closure type $SyntheticIDType0 = (int) -> int
let _t0: $SyntheticIDType0 = Closure { fun: (___DUMMY___Dummy_foo: (__DUMMY___Dummy, int) -> int), context: (_this: __DUMMY___Dummy) };
return (_t0: $SyntheticIDType0);`,
    );
  });

  it('Unary lowering works.', () => {
    expectCorrectlyLowered(
      SourceExpressionUnary({
        type: AstBuilder.UnitType,
        operator: '!',
        expression: THIS,
      }),
      'let _t0: bool = (_this: __DUMMY___Dummy) ^ 1;\nreturn (_t0: bool);',
    );

    expectCorrectlyLowered(
      SourceExpressionUnary({
        type: AstBuilder.UnitType,
        operator: '-',
        expression: THIS,
      }),
      'let _t0: int = 0 - (_this: __DUMMY___Dummy);\nreturn (_t0: int);',
    );
  });

  describe('FunctionCall family lowering works', () => {
    it('1/n: class member call with return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: AstBuilder.IntType,
          functionExpression: SourceExpressionClassMember({
            type: AstBuilder.FunType(
              [DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE],
              AstBuilder.IntType,
            ),
            typeArguments: [],
            moduleReference: ModuleReference(['ModuleModule']),
            className: SourceId('ImportedClass'),
            memberName: SourceId('bar'),
          }),
          functionArguments: [THIS, THIS],
        }),
        `let _t0: int = _ModuleModule_ImportedClass_bar((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t0: int);`,
      );
    });

    it('2/n class member call without return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: AstBuilder.UnitType,
          functionExpression: SourceExpressionClassMember({
            type: AstBuilder.FunType([AstBuilder.IntType], AstBuilder.UnitType),
            typeArguments: [],
            moduleReference: ModuleReference.DUMMY,
            className: SourceId('C'),
            memberName: SourceId('m1'),
          }),
          functionArguments: [SourceExpressionInt(0)],
        }),
        `___DUMMY___C_m1(0);
return 0;`,
      );
    });

    it('3/n class member call with return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: DUMMY_IDENTIFIER_TYPE,
          functionExpression: SourceExpressionClassMember({
            type: AstBuilder.FunType([AstBuilder.IntType], DUMMY_IDENTIFIER_TYPE),
            typeArguments: [],
            moduleReference: ModuleReference.DUMMY,
            className: SourceId('C'),
            memberName: SourceId('m2'),
          }),
          functionArguments: [SourceExpressionInt(0)],
        }),
        `let _t0: __DUMMY___Dummy = ___DUMMY___C_m2(0);
return (_t0: __DUMMY___Dummy);`,
      );
    });

    it('4/n method call with return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: AstBuilder.IntType,
          functionExpression: SourceExpressionMethodAccess({
            type: AstBuilder.FunType(
              [DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE],
              AstBuilder.IntType,
            ),
            expression: THIS,
            methodName: SourceId('fooBar'),
          }),
          functionArguments: [THIS, THIS],
        }),
        `let _t0: int = ___DUMMY___Dummy_fooBar((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t0: int);`,
      );
    });

    it('5/n closure call with return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: AstBuilder.IntType,
          functionExpression: SourceExpressionVariable({
            type: AstBuilder.FunType([AstBuilder.BoolType], AstBuilder.IntType),
            name: 'closure',
          }),
          functionArguments: [AstBuilder.TRUE],
        }),
        `let _t0: int = (closure: Closure)(1);
return (_t0: int);`,
      );
    });

    it('6/n closure call without return', () => {
      expectCorrectlyLowered(
        SourceExpressionFunctionCall({
          type: AstBuilder.UnitType,
          functionExpression: SourceExpressionVariable({
            type: AstBuilder.FunType([AstBuilder.BoolType], AstBuilder.UnitType),
            name: 'closure_unit_return',
          }),
          functionArguments: [AstBuilder.TRUE],
        }),
        `(closure_unit_return: Closure)(1);
return 0;`,
      );
    });
  });

  describe('Binary lowering works.', () => {
    it('Normal +', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.IntType,
          operatorPrecedingComments: [],
          operator: PLUS,
          e1: THIS,
          e2: THIS,
        }),
        'let _t0: int = (_this: __DUMMY___Dummy) + (_this: __DUMMY___Dummy);\nreturn (_t0: int);',
      );
    });

    it('Normal *', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.IntType,
          operatorPrecedingComments: [],
          operator: MUL,
          e1: THIS,
          e2: THIS,
        }),
        'let _t0: int = (_this: __DUMMY___Dummy) * (_this: __DUMMY___Dummy);\nreturn (_t0: int);',
      );
    });

    it('Short circuiting &&', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.BoolType,
          operatorPrecedingComments: [],
          operator: AND,
          e1: SourceExpressionVariable({ type: AstBuilder.BoolType, name: 'foo' }),
          e2: SourceExpressionVariable({ type: AstBuilder.BoolType, name: 'bar' }),
        }),
        `let _t0: bool;
if (foo: int) {
  _t0 = (bar: bool);
} else {
  _t0 = 0;
}
return (_t0: bool);`,
      );

      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.BoolType,
          operatorPrecedingComments: [],
          operator: AND,
          e1: AstBuilder.TRUE,
          e2: SourceExpressionVariable({ type: AstBuilder.IntType, name: 'foo' }),
        }),
        'return (foo: int);',
      );

      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.BoolType,
          operatorPrecedingComments: [],
          operator: AND,
          e1: AstBuilder.FALSE,
          e2: SourceExpressionVariable({ type: AstBuilder.IntType, name: 'foo' }),
        }),
        'return 0;',
      );
    });

    it('Short circuiting ||', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.BoolType,
          operator: OR,
          operatorPrecedingComments: [],
          e1: AstBuilder.TRUE,
          e2: SourceExpressionInt(65536),
        }),
        'return 1;',
      );

      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.BoolType,
          operatorPrecedingComments: [],
          operator: OR,
          e1: AstBuilder.FALSE,
          e2: SourceExpressionInt(65536),
        }),
        'return 65536;',
      );

      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.BoolType,
          operatorPrecedingComments: [],
          operator: OR,
          e1: SourceExpressionVariable({ type: AstBuilder.BoolType, name: 'foo' }),
          e2: SourceExpressionVariable({ type: AstBuilder.BoolType, name: 'bar' }),
        }),
        `let _t0: bool;
if (foo: int) {
  _t0 = 1;
} else {
  _t0 = (bar: bool);
}
return (_t0: bool);`,
      );
    });

    it('Normal string concat', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.StringType,
          operatorPrecedingComments: [],
          operator: CONCAT,
          e1: THIS,
          e2: THIS,
        }),
        `let _t0: string = _builtin_stringConcat((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t0: string);`,
      );
    });

    it('Optimizing string concat', () => {
      expectCorrectlyLowered(
        SourceExpressionBinary({
          type: AstBuilder.StringType,
          operatorPrecedingComments: [],
          operator: CONCAT,
          e1: SourceExpressionString('hello '),
          e2: SourceExpressionString('world'),
        }),
        "const GLOBAL_STRING_0 = 'hello world';\n\n\nreturn GLOBAL_STRING_0;",
      );
    });
  });

  describe('Lambda lowering works', () => {
    it('1/n', () => {
      expectCorrectlyLowered(
        SourceExpressionLambda({
          type: AstBuilder.FunType([AstBuilder.UnitType], AstBuilder.UnitType),
          parameters: [{ name: SourceId('a'), typeAnnotation: AstBuilder.UnitType }],
          captured: new Map([['captured_a', AstBuilder.UnitType]]),
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
return (_t0: $SyntheticIDType1);`,
      );
    });

    it('2/n', () => {
      expectCorrectlyLowered(
        SourceExpressionLambda({
          type: AstBuilder.FunType([AstBuilder.UnitType], AstBuilder.IntType),
          parameters: [{ name: SourceId('a'), typeAnnotation: AstBuilder.UnitType }],
          captured: new Map([['captured_a', AstBuilder.UnitType]]),
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
return (_t0: $SyntheticIDType1);`,
      );
    });

    it('3/n', () => {
      expectCorrectlyLowered(
        SourceExpressionLambda({
          type: AstBuilder.FunType([AstBuilder.UnitType], DUMMY_IDENTIFIER_TYPE),
          parameters: [{ name: SourceId('a'), typeAnnotation: AstBuilder.UnitType }],
          captured: new Map([['captured_a', AstBuilder.UnitType]]),
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
return (_t0: $SyntheticIDType1);`,
      );
    });

    it('4/n', () => {
      expectCorrectlyLowered(
        SourceExpressionLambda({
          type: AstBuilder.FunType([AstBuilder.UnitType], DUMMY_IDENTIFIER_TYPE),
          parameters: [{ name: SourceId('a'), typeAnnotation: AstBuilder.UnitType }],
          captured: new Map(),
          body: THIS,
        }),
        `closure type $SyntheticIDType0 = (int) -> __DUMMY___Dummy
function ___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0(_context: int, a: int): __DUMMY___Dummy {
  return (_this: __DUMMY___Dummy);
}

let _t0: $SyntheticIDType0 = Closure { fun: (___DUMMY___ENCODED_FUNCTION_NAME__Synthetic_0: (int, int) -> __DUMMY___Dummy), context: 0 };
return (_t0: $SyntheticIDType0);`,
      );
    });
  });

  it('IfElse lowering works', () => {
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
return (_t0: __DUMMY___Dummy);`,
    );
  });

  describe('Match lowering works', () => {
    it('1/n', () => {
      expectCorrectlyLowered(
        SourceExpressionMatch({
          type: DUMMY_IDENTIFIER_TYPE,
          matchedExpression: THIS,
          matchingList: [
            {
              location: Location.DUMMY,
              tag: SourceId('Foo'),
              tagOrder: 0,
              dataVariable: [SourceId('bar'), AstBuilder.IntType],
              expression: THIS,
            },
            {
              location: Location.DUMMY,
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
return (_t2: __DUMMY___Dummy);`,
      );
    });

    it('2/n', () => {
      expectCorrectlyLowered(
        SourceExpressionMatch({
          type: DUMMY_IDENTIFIER_TYPE,
          matchedExpression: THIS,
          matchingList: [
            {
              location: Location.DUMMY,
              tag: SourceId('Foo'),
              tagOrder: 0,
              expression: THIS,
            },
            {
              location: Location.DUMMY,
              tag: SourceId('Bar'),
              tagOrder: 1,
              dataVariable: [SourceId('bar'), DUMMY_IDENTIFIER_TYPE],
              expression: SourceExpressionVariable({ type: DUMMY_IDENTIFIER_TYPE, name: 'bar' }),
            },
            {
              location: Location.DUMMY,
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
return (_t4: __DUMMY___Dummy);`,
      );
    });
  });

  describe('StatementBlockExpression lowering works', () => {
    it('All syntax forms', () => {
      expectCorrectlyLowered(
        SourceExpressionStatementBlock({
          type: AstBuilder.UnitType,
          block: {
            location: Location.DUMMY,
            statements: [
              {
                location: Location.DUMMY,
                pattern: { location: Location.DUMMY, type: 'VariablePattern', name: 'a' },
                typeAnnotation: AstBuilder.UnitType,
                assignedExpression: SourceExpressionStatementBlock({
                  type: AstBuilder.UnitType,
                  block: {
                    location: Location.DUMMY,
                    statements: [
                      {
                        location: Location.DUMMY,
                        pattern: {
                          location: Location.DUMMY,
                          type: 'ObjectPattern',
                          destructedNames: [
                            {
                              location: Location.DUMMY,
                              fieldName: SourceId('a'),
                              type: AstBuilder.IntType,
                              fieldOrder: 0,
                            },
                            {
                              location: Location.DUMMY,
                              fieldName: SourceId('b'),
                              type: AstBuilder.IntType,
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
                        location: Location.DUMMY,
                        pattern: { location: Location.DUMMY, type: 'WildCardPattern' },
                        typeAnnotation: DUMMY_IDENTIFIER_TYPE,
                        assignedExpression: THIS,
                        associatedComments: [],
                      },
                    ],
                    expression: SourceExpressionVariable({
                      type: AstBuilder.UnitType,
                      name: 'a',
                    }),
                  },
                }),
                associatedComments: [],
              },
            ],
          },
        }),
        `let a__depth_1__block_0: int = (_this: __DUMMY___Dummy)[0];
let c__depth_1__block_0: int = (_this: __DUMMY___Dummy)[1];
return 0;`,
      );
    });

    it('Copy propagation', () => {
      expectCorrectlyLowered(
        SourceExpressionStatementBlock({
          type: AstBuilder.UnitType,
          block: {
            location: Location.DUMMY,
            statements: [
              {
                location: Location.DUMMY,
                pattern: { location: Location.DUMMY, type: 'VariablePattern', name: 'a' },
                typeAnnotation: AstBuilder.UnitType,
                assignedExpression: SourceExpressionString('foo'),
                associatedComments: [],
              },
              {
                location: Location.DUMMY,
                pattern: { location: Location.DUMMY, type: 'VariablePattern', name: 'b' },
                typeAnnotation: AstBuilder.UnitType,
                assignedExpression: SourceExpressionVariable({
                  type: AstBuilder.StringType,
                  name: 'a',
                }),
                associatedComments: [],
              },
            ],
            expression: SourceExpressionVariable({
              type: AstBuilder.StringType,
              name: 'b',
            }),
          },
        }),
        "const GLOBAL_STRING_0 = 'foo';\n\n\nreturn GLOBAL_STRING_0;",
      );
    });

    it('Shadowing', () => {
      expectCorrectlyLowered(
        SourceExpressionStatementBlock({
          type: AstBuilder.StringType,
          block: {
            location: Location.DUMMY,
            statements: [
              {
                location: Location.DUMMY,
                typeAnnotation: AstBuilder.StringType,
                pattern: { location: Location.DUMMY, type: 'VariablePattern', name: 'a' },
                assignedExpression: SourceExpressionStatementBlock({
                  type: AstBuilder.UnitType,
                  block: {
                    location: Location.DUMMY,
                    statements: [
                      {
                        location: Location.DUMMY,
                        typeAnnotation: AstBuilder.IntType,
                        pattern: { location: Location.DUMMY, type: 'VariablePattern', name: 'a' },
                        assignedExpression: THIS,
                        associatedComments: [],
                      },
                    ],
                    expression: SourceExpressionVariable({
                      type: AstBuilder.StringType,
                      name: 'a',
                    }),
                  },
                }),
                associatedComments: [],
              },
            ],
            expression: SourceExpressionVariable({
              type: AstBuilder.StringType,
              name: 'a',
            }),
          },
        }),
        'return (_this: __DUMMY___Dummy);',
      );
    });
  });
});
