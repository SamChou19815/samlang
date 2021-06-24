import {
  unitType,
  identifierType,
  tupleType,
  intType,
  functionType,
  stringType,
  Range,
  ModuleReference,
  boolType,
} from 'samlang-core-ast/common-nodes';
import { PLUS, MUL, AND, OR, CONCAT } from 'samlang-core-ast/common-operators';
import {
  debugPrintHighIRExpression,
  debugPrintHighIRStatement,
  debugPrintHighIRModule,
  HighIRModule,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_INT_TYPE,
  HIR_BOOL_TYPE,
} from 'samlang-core-ast/hir-nodes';
import {
  SamlangExpression,
  EXPRESSION_FALSE,
  EXPRESSION_TRUE,
  EXPRESSION_INT,
  EXPRESSION_STRING,
  EXPRESSION_THIS,
  EXPRESSION_VARIABLE,
  EXPRESSION_CLASS_MEMBER,
  EXPRESSION_TUPLE_CONSTRUCTOR,
  EXPRESSION_OBJECT_CONSTRUCTOR,
  EXPRESSION_VARIANT_CONSTRUCTOR,
  EXPRESSION_FIELD_ACCESS,
  EXPRESSION_METHOD_ACCESS,
  EXPRESSION_UNARY,
  EXPRESSION_FUNCTION_CALL,
  EXPRESSION_BINARY,
  EXPRESSION_LAMBDA,
  EXPRESSION_IF_ELSE,
  EXPRESSION_MATCH,
  EXPRESSION_STATEMENT_BLOCK,
} from 'samlang-core-ast/samlang-expressions';

import lowerSamlangExpression from '../hir-expression-lowering';
import HighIRStringManager from '../hir-string-manager';
import { HighIRTypeSynthesizer, SamlangTypeLoweringManager } from '../hir-type-conversion';

const DUMMY_IDENTIFIER_TYPE = identifierType(ModuleReference.DUMMY, 'Dummy');
const THIS = EXPRESSION_THIS({
  range: Range.DUMMY,
  type: DUMMY_IDENTIFIER_TYPE,
  associatedComments: [],
});

const expectCorrectlyLowered = (
  samlangExpression: SamlangExpression,
  expectedString: string
): void => {
  const typeSynthesizer = new HighIRTypeSynthesizer();
  const typeLoweringManager = new SamlangTypeLoweringManager(new Set(), typeSynthesizer);
  const stringManager = new HighIRStringManager();
  const { statements, expression, syntheticFunctions } = lowerSamlangExpression(
    /* moduleReference */ ModuleReference.DUMMY,
    /* encodedFunctionName */ 'ENCODED_FUNCTION_NAME',
    [
      ['foo', HIR_INT_TYPE],
      ['bar', HIR_BOOL_TYPE],
      ['closure', HIR_IDENTIFIER_TYPE('TestClosure', [HIR_BOOL_TYPE])],
      ['closure_unit_return', HIR_IDENTIFIER_TYPE('TestClosure', [HIR_INT_TYPE])],
      ['captured_a', HIR_INT_TYPE],
    ],
    /* typeDefinitionMapping */ {
      __DUMMY___Foo: {
        identifier: '__DUMMY___Foo',
        type: 'object',
        typeParameters: [],
        mappings: [HIR_INT_TYPE, HIR_INT_TYPE],
      },
      __DUMMY___Dummy: {
        identifier: '__DUMMY___Dummy',
        type: 'object',
        typeParameters: [],
        mappings: [HIR_INT_TYPE, HIR_INT_TYPE],
      },
      TestClosure: {
        identifier: 'TestClosure',
        type: 'object',
        typeParameters: ['_Context'],
        mappings: [HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_BOOL_TYPE], HIR_INT_TYPE), HIR_INT_TYPE],
      },
    },
    /* functionTypeMapping */ {
      _module_ModuleModule_class_ImportedClass_function_bar: HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('__DUMMY___Dummy', []), HIR_IDENTIFIER_TYPE('__DUMMY___Dummy', [])],
        HIR_INT_TYPE
      ),
      _module___DUMMY___class_Dummy_function_foo: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
      _module___DUMMY___class_Dummy_function_fooBar: HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('__DUMMY___Dummy', []), HIR_IDENTIFIER_TYPE('__DUMMY___Dummy', [])],
        HIR_INT_TYPE
      ),
      _module___DUMMY___class_A_function_b: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
      _module___DUMMY___class_C_function_m1: HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('__DUMMY___Dummy', [])],
        HIR_INT_TYPE
      ),
      _module___DUMMY___class_C_function_m2: HIR_FUNCTION_TYPE(
        [HIR_INT_TYPE],
        HIR_IDENTIFIER_TYPE('__DUMMY___Dummy', [])
      ),
    },
    /* thisType */ HIR_IDENTIFIER_TYPE('__DUMMY___Dummy', []),
    /* typeLoweringManager */ typeLoweringManager,
    /* typeSynthesizer */ typeSynthesizer,
    /* stringManager */ stringManager,
    /* expression */ samlangExpression
  );
  const syntheticModule: HighIRModule = {
    globalVariables: stringManager.globalVariables,
    typeDefinitions: typeSynthesizer.synthesized,
    functions: syntheticFunctions,
  };
  expect(
    `${debugPrintHighIRModule(syntheticModule)}
${statements.map((it) => debugPrintHighIRStatement(it)).join('\n')}
return ${debugPrintHighIRExpression(expression)};`.trim()
  ).toBe(expectedString);
};

describe('hir-expression-lowering', () => {
  it('Literal lowering works.', () => {
    expectCorrectlyLowered(EXPRESSION_FALSE(Range.DUMMY, []), 'return 0;');
    expectCorrectlyLowered(EXPRESSION_TRUE(Range.DUMMY, []), 'return 1;');
    expectCorrectlyLowered(EXPRESSION_INT(Range.DUMMY, [], 0), 'return 0;');
    expectCorrectlyLowered(
      EXPRESSION_STRING(Range.DUMMY, [], 'foo'),
      "const GLOBAL_STRING_0 = 'foo';\n\n\nreturn GLOBAL_STRING_0;"
    );
  });

  it('This lowering works.', () => {
    expectCorrectlyLowered(THIS, 'return (_this: __DUMMY___Dummy);');
  });

  it('Variable lowering works.', () => {
    expectCorrectlyLowered(
      EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        type: unitType,
        name: 'foo',
        associatedComments: [],
      }),
      'return (foo: int);'
    );
  });

  it('ClassMember lowering works.', () => {
    expectCorrectlyLowered(
      EXPRESSION_CLASS_MEMBER({
        range: Range.DUMMY,
        type: unitType,
        associatedComments: [],
        typeArguments: [],
        moduleReference: ModuleReference.DUMMY,
        className: 'A',
        classNameRange: Range.DUMMY,
        memberPrecedingComments: [],
        memberName: 'b',
        memberNameRange: Range.DUMMY,
      }),
      `object type _SYNTHETIC_ID_TYPE_0 = [(int, int) -> int, int]
let _t0: _SYNTHETIC_ID_TYPE_0 = [_module___DUMMY___class_A_function_b_with_context, 0];
return (_t0: _SYNTHETIC_ID_TYPE_0);`
    );
  });

  describe('Lowering to StructConstructor works', () => {
    it('1/n.', () => {
      expectCorrectlyLowered(
        EXPRESSION_TUPLE_CONSTRUCTOR({
          range: Range.DUMMY,
          type: tupleType([DUMMY_IDENTIFIER_TYPE]),
          associatedComments: [],
          expressions: [THIS],
        }),
        `object type _SYNTHETIC_ID_TYPE_0 = [__DUMMY___Dummy]
let _t0: _SYNTHETIC_ID_TYPE_0 = [(_this: __DUMMY___Dummy)];
return (_t0: _SYNTHETIC_ID_TYPE_0);`
      );
    });

    it('2/n', () => {
      expectCorrectlyLowered(
        EXPRESSION_OBJECT_CONSTRUCTOR({
          range: Range.DUMMY,
          type: identifierType(ModuleReference.DUMMY, 'Foo'),
          associatedComments: [],
          fieldDeclarations: [
            {
              range: Range.DUMMY,
              associatedComments: [],
              type: DUMMY_IDENTIFIER_TYPE,
              name: 'foo',
              nameRange: Range.DUMMY,
              expression: THIS,
            },
            {
              range: Range.DUMMY,
              associatedComments: [],
              type: boolType,
              name: 'bar',
              nameRange: Range.DUMMY,
            },
          ],
        }),
        `let _t0: __DUMMY___Foo = [(_this: __DUMMY___Dummy), (bar: bool)];
return (_t0: __DUMMY___Foo);`
      );
    });

    it('3/n', () => {
      expectCorrectlyLowered(
        EXPRESSION_VARIANT_CONSTRUCTOR({
          range: Range.DUMMY,
          type: identifierType(ModuleReference.DUMMY, 'Foo'),
          associatedComments: [],
          tag: 'Foo',
          tagOrder: 1,
          data: THIS,
        }),
        `let _t0: __DUMMY___Foo = [1, (_this: __DUMMY___Dummy)];
return (_t0: __DUMMY___Foo);`
      );
    });
  });

  it('FieldAccess lowering works.', () => {
    expectCorrectlyLowered(
      EXPRESSION_FIELD_ACCESS({
        range: Range.DUMMY,
        type: unitType,
        associatedComments: [],
        expression: THIS,
        fieldPrecedingComments: [],
        fieldName: 'foo',
        fieldOrder: 0,
      }),
      'let _t0: int = (_this: __DUMMY___Dummy)[0];\nreturn (_t0: int);'
    );
  });

  it('MethodAccess lowering works.', () => {
    expectCorrectlyLowered(
      EXPRESSION_METHOD_ACCESS({
        range: Range.DUMMY,
        type: unitType,
        associatedComments: [],
        expression: THIS,
        methodPrecedingComments: [],
        methodName: 'foo',
      }),
      `object type _SYNTHETIC_ID_TYPE_0 = [(__DUMMY___Dummy, int) -> int, __DUMMY___Dummy]
let _t0: _SYNTHETIC_ID_TYPE_0 = [_module___DUMMY___class_Dummy_function_foo, (_this: __DUMMY___Dummy)];
return (_t0: _SYNTHETIC_ID_TYPE_0);`
    );
  });

  it('Unary lowering works.', () => {
    expectCorrectlyLowered(
      EXPRESSION_UNARY({
        range: Range.DUMMY,
        type: unitType,
        associatedComments: [],
        operator: '!',
        expression: THIS,
      }),
      'let _t0: bool = (_this: __DUMMY___Dummy) ^ 1;\nreturn (_t0: bool);'
    );

    expectCorrectlyLowered(
      EXPRESSION_UNARY({
        range: Range.DUMMY,
        type: unitType,
        associatedComments: [],
        operator: '-',
        expression: THIS,
      }),
      'let _t0: int = 0 - (_this: __DUMMY___Dummy);\nreturn (_t0: int);'
    );
  });

  describe('FunctionCall family lowering works', () => {
    it('1/n: class member call with return', () => {
      expectCorrectlyLowered(
        EXPRESSION_FUNCTION_CALL({
          range: Range.DUMMY,
          type: intType,
          associatedComments: [],
          functionExpression: EXPRESSION_CLASS_MEMBER({
            range: Range.DUMMY,
            type: functionType([DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE], intType),
            associatedComments: [],
            typeArguments: [],
            moduleReference: new ModuleReference(['ModuleModule']),
            className: 'ImportedClass',
            classNameRange: Range.DUMMY,
            memberPrecedingComments: [],
            memberName: 'bar',
            memberNameRange: Range.DUMMY,
          }),
          functionArguments: [THIS, THIS],
        }),
        `let _t0: int = _module_ModuleModule_class_ImportedClass_function_bar((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t0: int);`
      );
    });

    it('2/n class member call without return', () => {
      expectCorrectlyLowered(
        EXPRESSION_FUNCTION_CALL({
          range: Range.DUMMY,
          type: unitType,
          associatedComments: [],
          functionExpression: EXPRESSION_CLASS_MEMBER({
            range: Range.DUMMY,
            type: functionType([intType], unitType),
            associatedComments: [],
            typeArguments: [],
            moduleReference: ModuleReference.DUMMY,
            className: 'C',
            classNameRange: Range.DUMMY,
            memberPrecedingComments: [],
            memberName: 'm1',
            memberNameRange: Range.DUMMY,
          }),
          functionArguments: [EXPRESSION_INT(Range.DUMMY, [], 0)],
        }),
        `_module___DUMMY___class_C_function_m1(0);
return 0;`
      );
    });

    it('3/n class member call with return', () => {
      expectCorrectlyLowered(
        EXPRESSION_FUNCTION_CALL({
          range: Range.DUMMY,
          type: DUMMY_IDENTIFIER_TYPE,
          associatedComments: [],
          functionExpression: EXPRESSION_CLASS_MEMBER({
            range: Range.DUMMY,
            type: functionType([intType], DUMMY_IDENTIFIER_TYPE),
            associatedComments: [],
            typeArguments: [],
            moduleReference: ModuleReference.DUMMY,
            className: 'C',
            classNameRange: Range.DUMMY,
            memberPrecedingComments: [],
            memberName: 'm2',
            memberNameRange: Range.DUMMY,
          }),
          functionArguments: [EXPRESSION_INT(Range.DUMMY, [], 0)],
        }),
        `let _t0: __DUMMY___Dummy = _module___DUMMY___class_C_function_m2(0);
return (_t0: __DUMMY___Dummy);`
      );
    });

    it('4/n method call with return', () => {
      expectCorrectlyLowered(
        EXPRESSION_FUNCTION_CALL({
          range: Range.DUMMY,
          type: intType,
          associatedComments: [],
          functionExpression: EXPRESSION_METHOD_ACCESS({
            range: Range.DUMMY,
            type: functionType([DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE], intType),
            associatedComments: [],
            expression: THIS,
            methodPrecedingComments: [],
            methodName: 'fooBar',
          }),
          functionArguments: [THIS, THIS],
        }),
        `let _t0: int = _module___DUMMY___class_Dummy_function_fooBar((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t0: int);`
      );
    });

    it('5/n closure call with return', () => {
      expectCorrectlyLowered(
        EXPRESSION_FUNCTION_CALL({
          range: Range.DUMMY,
          type: intType,
          associatedComments: [],
          functionExpression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            name: 'closure',
            type: functionType([boolType], intType),
            associatedComments: [],
          }),
          functionArguments: [EXPRESSION_TRUE(Range.DUMMY, [])],
        }),
        `let _t1: (int, bool) -> int = (closure: TestClosure<bool>)[0];
let _t2: int = (closure: TestClosure<bool>)[1];
let _t0: int = (_t1: (int, bool) -> int)((_t2: int), 1);
return (_t0: int);`
      );
    });

    it('6/n closure call without return', () => {
      expectCorrectlyLowered(
        EXPRESSION_FUNCTION_CALL({
          range: Range.DUMMY,
          type: unitType,
          associatedComments: [],
          functionExpression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            name: 'closure_unit_return',
            type: functionType([boolType], unitType),
            associatedComments: [],
          }),
          functionArguments: [EXPRESSION_TRUE(Range.DUMMY, [])],
        }),
        `let _t1: (int, bool) -> int = (closure_unit_return: TestClosure<int>)[0];
let _t2: int = (closure_unit_return: TestClosure<int>)[1];
(_t1: (int, bool) -> int)((_t2: int), 1);
return 0;`
      );
    });
  });

  describe('Binary lowering works.', () => {
    it('Normal +', () => {
      expectCorrectlyLowered(
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: intType,
          associatedComments: [],
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
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: intType,
          associatedComments: [],
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
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: boolType,
          associatedComments: [],
          operatorPrecedingComments: [],
          operator: AND,
          e1: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: boolType,
            name: 'foo',
            associatedComments: [],
          }),
          e2: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: boolType,
            name: 'bar',
            associatedComments: [],
          }),
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
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: boolType,
          associatedComments: [],
          operatorPrecedingComments: [],
          operator: AND,
          e1: EXPRESSION_TRUE(Range.DUMMY, []),
          e2: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: intType,
            name: 'foo',
            associatedComments: [],
          }),
        }),
        'return (foo: int);'
      );

      expectCorrectlyLowered(
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: boolType,
          associatedComments: [],
          operatorPrecedingComments: [],
          operator: AND,
          e1: EXPRESSION_FALSE(Range.DUMMY, []),
          e2: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: intType,
            name: 'foo',
            associatedComments: [],
          }),
        }),
        'return 0;'
      );
    });

    it('Short circuiting ||', () => {
      expectCorrectlyLowered(
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: boolType,
          operator: OR,
          associatedComments: [],
          operatorPrecedingComments: [],
          e1: EXPRESSION_TRUE(Range.DUMMY, []),
          e2: EXPRESSION_INT(Range.DUMMY, [], 65536),
        }),
        'return 1;'
      );

      expectCorrectlyLowered(
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: boolType,
          associatedComments: [],
          operatorPrecedingComments: [],
          operator: OR,
          e1: EXPRESSION_FALSE(Range.DUMMY, []),
          e2: EXPRESSION_INT(Range.DUMMY, [], 65536),
        }),
        'return 65536;'
      );

      expectCorrectlyLowered(
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: boolType,
          associatedComments: [],
          operatorPrecedingComments: [],
          operator: OR,
          e1: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: boolType,
            name: 'foo',
            associatedComments: [],
          }),
          e2: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: boolType,
            name: 'bar',
            associatedComments: [],
          }),
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
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: stringType,
          associatedComments: [],
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
        EXPRESSION_BINARY({
          range: Range.DUMMY,
          type: stringType,
          associatedComments: [],
          operatorPrecedingComments: [],
          operator: CONCAT,
          e1: EXPRESSION_STRING(Range.DUMMY, [], 'hello '),
          e2: EXPRESSION_STRING(Range.DUMMY, [], 'world'),
        }),
        "const GLOBAL_STRING_0 = 'hello world';\n\n\nreturn GLOBAL_STRING_0;"
      );
    });
  });

  describe('Lambda lowering works', () => {
    it('1/n', () => {
      expectCorrectlyLowered(
        EXPRESSION_LAMBDA({
          range: Range.DUMMY,
          type: functionType([], unitType),
          associatedComments: [],
          parameters: [['a', Range.DUMMY, unitType]],
          captured: { captured_a: unitType },
          body: THIS,
        }),
        `object type _SYNTHETIC_ID_TYPE_0 = [int]
object type _SYNTHETIC_ID_TYPE_1 = [(_SYNTHETIC_ID_TYPE_0, int) -> int, _SYNTHETIC_ID_TYPE_0]
function _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__Synthetic_0(_context: _SYNTHETIC_ID_TYPE_0, a: int): int {
  let captured_a: int = (_context: _SYNTHETIC_ID_TYPE_0)[0];
  return (_this: __DUMMY___Dummy);
}

let _t1: _SYNTHETIC_ID_TYPE_0 = [(captured_a: int)];
let _t0: _SYNTHETIC_ID_TYPE_1 = [_module___DUMMY___class_ENCODED_FUNCTION_NAME_function__Synthetic_0, (_t1: _SYNTHETIC_ID_TYPE_0)];
return (_t0: _SYNTHETIC_ID_TYPE_1);`
      );
    });

    it('2/n', () => {
      expectCorrectlyLowered(
        EXPRESSION_LAMBDA({
          range: Range.DUMMY,
          type: functionType([], intType),
          associatedComments: [],
          parameters: [['a', Range.DUMMY, unitType]],
          captured: { captured_a: unitType },
          body: THIS,
        }),
        `object type _SYNTHETIC_ID_TYPE_0 = [int]
object type _SYNTHETIC_ID_TYPE_1 = [(_SYNTHETIC_ID_TYPE_0, int) -> int, _SYNTHETIC_ID_TYPE_0]
function _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__Synthetic_0(_context: _SYNTHETIC_ID_TYPE_0, a: int): int {
  let captured_a: int = (_context: _SYNTHETIC_ID_TYPE_0)[0];
  return (_this: __DUMMY___Dummy);
}

let _t1: _SYNTHETIC_ID_TYPE_0 = [(captured_a: int)];
let _t0: _SYNTHETIC_ID_TYPE_1 = [_module___DUMMY___class_ENCODED_FUNCTION_NAME_function__Synthetic_0, (_t1: _SYNTHETIC_ID_TYPE_0)];
return (_t0: _SYNTHETIC_ID_TYPE_1);`
      );
    });

    it('3/n', () => {
      expectCorrectlyLowered(
        EXPRESSION_LAMBDA({
          range: Range.DUMMY,
          type: functionType([], DUMMY_IDENTIFIER_TYPE),
          associatedComments: [],
          parameters: [['a', Range.DUMMY, unitType]],
          captured: { captured_a: unitType },
          body: THIS,
        }),
        `object type _SYNTHETIC_ID_TYPE_0 = [int]
object type _SYNTHETIC_ID_TYPE_1 = [(_SYNTHETIC_ID_TYPE_0, int) -> __DUMMY___Dummy, _SYNTHETIC_ID_TYPE_0]
function _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__Synthetic_0(_context: _SYNTHETIC_ID_TYPE_0, a: int): __DUMMY___Dummy {
  let captured_a: int = (_context: _SYNTHETIC_ID_TYPE_0)[0];
  return (_this: __DUMMY___Dummy);
}

let _t1: _SYNTHETIC_ID_TYPE_0 = [(captured_a: int)];
let _t0: _SYNTHETIC_ID_TYPE_1 = [_module___DUMMY___class_ENCODED_FUNCTION_NAME_function__Synthetic_0, (_t1: _SYNTHETIC_ID_TYPE_0)];
return (_t0: _SYNTHETIC_ID_TYPE_1);`
      );
    });

    it('4/n', () => {
      expectCorrectlyLowered(
        EXPRESSION_LAMBDA({
          range: Range.DUMMY,
          type: functionType([], DUMMY_IDENTIFIER_TYPE),
          associatedComments: [],
          parameters: [['a', Range.DUMMY, unitType]],
          captured: {},
          body: THIS,
        }),
        `object type _SYNTHETIC_ID_TYPE_0 = [(int, int) -> __DUMMY___Dummy, int]
function _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__Synthetic_0(_context: int, a: int): __DUMMY___Dummy {
  return (_this: __DUMMY___Dummy);
}

let _t0: _SYNTHETIC_ID_TYPE_0 = [_module___DUMMY___class_ENCODED_FUNCTION_NAME_function__Synthetic_0, 0];
return (_t0: _SYNTHETIC_ID_TYPE_0);`
      );
    });
  });

  describe('IfElse lowering works', () => {
    it('1/n', () => {
      expectCorrectlyLowered(
        EXPRESSION_IF_ELSE({
          range: Range.DUMMY,
          type: DUMMY_IDENTIFIER_TYPE,
          associatedComments: [],
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
        EXPRESSION_IF_ELSE({
          range: Range.DUMMY,
          type: unitType,
          associatedComments: [],
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
        EXPRESSION_MATCH({
          range: Range.DUMMY,
          type: DUMMY_IDENTIFIER_TYPE,
          associatedComments: [],
          matchedExpression: THIS,
          matchingList: [
            {
              range: Range.DUMMY,
              tag: 'Foo',
              tagOrder: 0,
              dataVariable: ['bar', Range.DUMMY, intType],
              expression: THIS,
            },
            {
              range: Range.DUMMY,
              tag: 'Bar',
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
        EXPRESSION_MATCH({
          range: Range.DUMMY,
          type: unitType,
          associatedComments: [],
          matchedExpression: THIS,
          matchingList: [
            {
              range: Range.DUMMY,
              tag: 'Foo',
              tagOrder: 0,
              dataVariable: ['bar', Range.DUMMY, intType],
              expression: THIS,
            },
            {
              range: Range.DUMMY,
              tag: 'Bar',
              tagOrder: 1,
              expression: THIS,
            },
            {
              range: Range.DUMMY,
              tag: 'Baz',
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
        EXPRESSION_MATCH({
          range: Range.DUMMY,
          type: DUMMY_IDENTIFIER_TYPE,
          associatedComments: [],
          matchedExpression: THIS,
          matchingList: [
            {
              range: Range.DUMMY,
              tag: 'Foo',
              tagOrder: 0,
              expression: THIS,
            },
            {
              range: Range.DUMMY,
              tag: 'Bar',
              tagOrder: 1,
              dataVariable: ['bar', Range.DUMMY, DUMMY_IDENTIFIER_TYPE],
              expression: EXPRESSION_VARIABLE({
                range: Range.DUMMY,
                name: 'bar',
                type: DUMMY_IDENTIFIER_TYPE,
                associatedComments: [],
              }),
            },
            {
              range: Range.DUMMY,
              tag: 'Baz',
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
        EXPRESSION_STATEMENT_BLOCK({
          range: Range.DUMMY,
          type: unitType,
          associatedComments: [],
          block: {
            range: Range.DUMMY,
            statements: [
              {
                range: Range.DUMMY,
                pattern: {
                  range: Range.DUMMY,
                  type: 'TuplePattern',
                  destructedNames: [
                    { name: 'ignored', type: intType, range: Range.DUMMY },
                    { type: intType, range: Range.DUMMY },
                  ],
                },
                typeAnnotation: tupleType([intType, intType]),
                assignedExpression: EXPRESSION_TUPLE_CONSTRUCTOR({
                  range: Range.DUMMY,
                  type: tupleType([intType, intType]),
                  associatedComments: [],
                  expressions: [
                    EXPRESSION_INT(Range.DUMMY, [], 1),
                    EXPRESSION_INT(Range.DUMMY, [], 2),
                  ],
                }),
                associatedComments: [],
              },
              {
                range: Range.DUMMY,
                pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
                typeAnnotation: unitType,
                assignedExpression: EXPRESSION_STATEMENT_BLOCK({
                  range: Range.DUMMY,
                  type: unitType,
                  associatedComments: [],
                  block: {
                    range: Range.DUMMY,
                    statements: [
                      {
                        range: Range.DUMMY,
                        pattern: {
                          range: Range.DUMMY,
                          type: 'TuplePattern',
                          destructedNames: [
                            { name: 'a', type: intType, range: Range.DUMMY },
                            { type: intType, range: Range.DUMMY },
                          ],
                        },
                        typeAnnotation: tupleType([intType, intType]),
                        assignedExpression: { ...THIS, type: tupleType([intType, intType]) },
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
                              fieldName: 'a',
                              fieldNameRange: Range.DUMMY,
                              type: intType,
                              fieldOrder: 0,
                            },
                            {
                              range: Range.DUMMY,
                              fieldName: 'b',
                              fieldNameRange: Range.DUMMY,
                              type: intType,
                              fieldOrder: 1,
                              alias: ['c', Range.DUMMY],
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
                    expression: EXPRESSION_VARIABLE({
                      range: Range.DUMMY,
                      type: unitType,
                      associatedComments: [],
                      name: 'a',
                    }),
                  },
                }),
                associatedComments: [],
              },
            ],
          },
        }),
        `object type _SYNTHETIC_ID_TYPE_0 = [int, int]
let _t0: _SYNTHETIC_ID_TYPE_0 = [1, 2];
let ignored: int = (_t0: _SYNTHETIC_ID_TYPE_0)[0];
let a__depth_1__block_0: int = (_this: __DUMMY___Dummy)[0];
let a__depth_1__block_0: int = (_this: __DUMMY___Dummy)[0];
let c__depth_1__block_0: int = (_this: __DUMMY___Dummy)[1];
return 0;`
      );
    });

    it('Copy propagation', () => {
      expectCorrectlyLowered(
        EXPRESSION_STATEMENT_BLOCK({
          range: Range.DUMMY,
          type: unitType,
          associatedComments: [],
          block: {
            range: Range.DUMMY,
            statements: [
              {
                range: Range.DUMMY,
                pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
                typeAnnotation: unitType,
                assignedExpression: EXPRESSION_STRING(Range.DUMMY, [], 'foo'),
                associatedComments: [],
              },
              {
                range: Range.DUMMY,
                pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
                typeAnnotation: unitType,
                assignedExpression: EXPRESSION_VARIABLE({
                  range: Range.DUMMY,
                  type: stringType,
                  associatedComments: [],
                  name: 'a',
                }),
                associatedComments: [],
              },
            ],
            expression: EXPRESSION_VARIABLE({
              range: Range.DUMMY,
              type: stringType,
              associatedComments: [],
              name: 'b',
            }),
          },
        }),
        "const GLOBAL_STRING_0 = 'foo';\n\n\nreturn GLOBAL_STRING_0;"
      );
    });

    it('Shadowing', () => {
      expectCorrectlyLowered(
        EXPRESSION_STATEMENT_BLOCK({
          range: Range.DUMMY,
          type: stringType,
          associatedComments: [],
          block: {
            range: Range.DUMMY,
            statements: [
              {
                range: Range.DUMMY,
                typeAnnotation: stringType,
                pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
                assignedExpression: EXPRESSION_STATEMENT_BLOCK({
                  range: Range.DUMMY,
                  type: unitType,
                  associatedComments: [],
                  block: {
                    range: Range.DUMMY,
                    statements: [
                      {
                        range: Range.DUMMY,
                        typeAnnotation: intType,
                        pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
                        assignedExpression: THIS,
                        associatedComments: [],
                      },
                    ],
                    expression: EXPRESSION_VARIABLE({
                      range: Range.DUMMY,
                      type: stringType,
                      associatedComments: [],
                      name: 'a',
                    }),
                  },
                }),
                associatedComments: [],
              },
            ],
            expression: EXPRESSION_VARIABLE({
              range: Range.DUMMY,
              type: stringType,
              associatedComments: [],
              name: 'a',
            }),
          },
        }),
        'return (_this: __DUMMY___Dummy);'
      );
    });
  });
});
