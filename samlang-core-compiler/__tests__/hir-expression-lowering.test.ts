import lowerSamlangExpression from '../hir-expression-lowering';
import HighIRStringManager from '../hir-string-manager';
import HighIRTypeSynthesizer from '../hir-type-synthesizer';

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
import { PLUS, AND, OR, CONCAT } from 'samlang-core-ast/common-operators';
import {
  debugPrintHighIRExpression,
  debugPrintHighIRStatement,
} from 'samlang-core-ast/hir-expressions';
import { debugPrintHighIRModule, HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { HIR_FUNCTION_TYPE, HIR_IDENTIFIER_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
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
  const stringManager = new HighIRStringManager();
  const { statements, expression, syntheticFunctions } = lowerSamlangExpression(
    ModuleReference.DUMMY,
    'ENCODED_FUNCTION_NAME',
    { __DUMMY___Foo: [HIR_INT_TYPE, HIR_INT_TYPE], __DUMMY___Dummy: [HIR_INT_TYPE, HIR_INT_TYPE] },
    {
      _module_ModuleModule_class_ImportedClass_function_bar: HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('__DUMMY___Dummy'), HIR_IDENTIFIER_TYPE('__DUMMY___Dummy')],
        HIR_INT_TYPE
      ),
      _module___DUMMY___class_Dummy_function_fooBar: HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('__DUMMY___Dummy'), HIR_IDENTIFIER_TYPE('__DUMMY___Dummy')],
        HIR_INT_TYPE
      ),
      _module___DUMMY___class_C_function_m1: HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('__DUMMY___Dummy')],
        HIR_INT_TYPE
      ),
      _module___DUMMY___class_C_function_m2: HIR_FUNCTION_TYPE(
        [HIR_INT_TYPE],
        HIR_IDENTIFIER_TYPE('__DUMMY___Dummy')
      ),
    },
    new Set(),
    typeSynthesizer,
    stringManager,
    samlangExpression
  );
  const syntheticModule: HighIRModule = {
    globalVariables: stringManager.globalVariables,
    typeDefinitions: [],
    functions: syntheticFunctions,
  };
  expect(
    `${debugPrintHighIRModule(syntheticModule)}${statements
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')}\nreturn ${debugPrintHighIRExpression(expression)};`.trim()
  ).toBe(expectedString);
};

it('Literal lowering works.', () => {
  expectCorrectlyLowered(EXPRESSION_FALSE(Range.DUMMY, []), 'return 0;');
  expectCorrectlyLowered(EXPRESSION_TRUE(Range.DUMMY, []), 'return 1;');
  expectCorrectlyLowered(EXPRESSION_INT(Range.DUMMY, [], 0), 'return 0;');
  expectCorrectlyLowered(
    EXPRESSION_STRING(Range.DUMMY, [], 'foo'),
    "const GLOBAL_STRING_0 = 'foo';\n\nreturn GLOBAL_STRING_0;"
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
    `let _t1: any = 0;
let _t0: (any, any) = [_module___DUMMY___class_A_function_b, (_t1: any)];
return (_t0: (any, any));`
  );
});

it('Lowering to StructConstructor works (1/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([DUMMY_IDENTIFIER_TYPE]),
      associatedComments: [],
      expressions: [THIS],
    }),
    `let _t0: _SYNTHETIC_ID_TYPE_0 = [(_this: __DUMMY___Dummy)];
return (_t0: _SYNTHETIC_ID_TYPE_0);`
  );
});

it('Lowering to StructConstructor works (2/n).', () => {
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
          type: DUMMY_IDENTIFIER_TYPE,
          name: 'bar',
          nameRange: Range.DUMMY,
        },
      ],
    }),
    `let _t0: int = (_this: __DUMMY___Dummy);
let _t1: int = (bar: __DUMMY___Dummy);
let _t2: __DUMMY___Foo = [(_t0: int), (_t1: int)];
return (_t2: __DUMMY___Foo);`
  );
});

it('Lowering to StructConstructor works (3/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.DUMMY, 'Foo'),
      associatedComments: [],
      tag: 'Foo',
      tagOrder: 1,
      data: THIS,
    }),
    `let _t1: any = (_this: __DUMMY___Dummy);
let _t0: __DUMMY___Foo = [1, (_t1: any)];
return (_t0: __DUMMY___Foo);`
  );
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
      type: functionType([], unitType),
      associatedComments: [],
      expression: THIS,
      methodPrecedingComments: [],
      methodName: 'foo',
    }),
    `let _t0: (any, any) = [_module___DUMMY___class_Dummy_function_foo, (_this: __DUMMY___Dummy)];
return (_t0: (any, any));`
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

it('FunctionCall family lowering works 4/n.', () => {
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

it('FunctionCall family lowering works 5/n.', () => {
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

it('FunctionCall family lowering works 6/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      associatedComments: [],
      functionExpression: EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        name: 'closure',
        type: functionType([DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE], intType),
        associatedComments: [],
      }),
      functionArguments: [THIS, THIS],
    }),
    `let _t1: any = (closure: (any, any))[0];
let _t2: any = (closure: (any, any))[1];
let _t6: int = (_t2: any);
let _t5: bool = (_t6: int) == 0;
let _t0: int;
if (_t5: bool) {
  let _t7: (__DUMMY___Dummy, __DUMMY___Dummy) -> int = (_t1: any);
  let _t3: int = (_t7: (__DUMMY___Dummy, __DUMMY___Dummy) -> int)((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
  _t0 = (_t3: int);
} else {
  let _t8: (any, __DUMMY___Dummy, __DUMMY___Dummy) -> int = (_t1: any);
  let _t4: int = (_t8: (any, __DUMMY___Dummy, __DUMMY___Dummy) -> int)((_t2: any), (_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
  _t0 = (_t4: int);
}
return (_t0: int);`
  );
});

it('FunctionCall family lowering works 7/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: unitType,
      associatedComments: [],
      functionExpression: EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        name: 'closure',
        type: functionType([DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE], unitType),
        associatedComments: [],
      }),
      functionArguments: [THIS, THIS],
    }),
    `let _t1: any = (closure: (any, any))[0];
let _t2: any = (closure: (any, any))[1];
let _t6: int = (_t2: any);
let _t5: bool = (_t6: int) == 0;
if (_t5: bool) {
  let _t7: (__DUMMY___Dummy, __DUMMY___Dummy) -> int = (_t1: any);
  (_t7: (__DUMMY___Dummy, __DUMMY___Dummy) -> int)((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
} else {
  let _t8: (any, __DUMMY___Dummy, __DUMMY___Dummy) -> int = (_t1: any);
  (_t8: (any, __DUMMY___Dummy, __DUMMY___Dummy) -> int)((_t2: any), (_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
}
return 0;`
  );
});

it('FunctionCall family lowering works 8/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: unitType,
      associatedComments: [],
      functionExpression: EXPRESSION_CLASS_MEMBER({
        range: Range.DUMMY,
        type: functionType([DUMMY_IDENTIFIER_TYPE], unitType),
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
    `let _t1: __DUMMY___Dummy = 0;
_module___DUMMY___class_C_function_m1((_t1: __DUMMY___Dummy));
return 0;`
  );
});

it('FunctionCall family lowering works 9/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
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
let _t1: int = (_t0: __DUMMY___Dummy);
return (_t1: int);`
  );
});

it('FunctionCall family lowering works 10/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      associatedComments: [],
      functionExpression: EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        name: 'closure',
        type: functionType([DUMMY_IDENTIFIER_TYPE], DUMMY_IDENTIFIER_TYPE),
        associatedComments: [],
      }),
      functionArguments: [EXPRESSION_INT(Range.DUMMY, [], 0)],
    }),
    `let _t1: __DUMMY___Dummy = 0;
let _t2: any = (closure: (any, any))[0];
let _t3: any = (closure: (any, any))[1];
let _t7: int = (_t3: any);
let _t6: bool = (_t7: int) == 0;
let _t0: __DUMMY___Dummy;
if (_t6: bool) {
  let _t8: (__DUMMY___Dummy) -> __DUMMY___Dummy = (_t2: any);
  let _t4: __DUMMY___Dummy = (_t8: (__DUMMY___Dummy) -> __DUMMY___Dummy)((_t1: __DUMMY___Dummy));
  _t0 = (_t4: __DUMMY___Dummy);
} else {
  let _t9: (any, __DUMMY___Dummy) -> __DUMMY___Dummy = (_t2: any);
  let _t5: __DUMMY___Dummy = (_t9: (any, __DUMMY___Dummy) -> __DUMMY___Dummy)((_t3: any), (_t1: __DUMMY___Dummy));
  _t0 = (_t5: __DUMMY___Dummy);
}
let _t10: int = (_t0: __DUMMY___Dummy);
return (_t10: int);`
  );
});

it('Normal binary lowering works.', () => {
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

it('String concat binary lowering works.', () => {
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

it('Short circuiting binary lowering works.', () => {
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
if (foo: bool) {
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
        type: boolType,
        name: 'foo',
        associatedComments: [],
      }),
    }),
    'return (foo: bool);'
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
        type: boolType,
        name: 'foo',
        associatedComments: [],
      }),
    }),
    'return 0;'
  );

  expectCorrectlyLowered(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: OR,
      associatedComments: [],
      operatorPrecedingComments: [],
      e1: EXPRESSION_TRUE(Range.DUMMY, []),
      e2: EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        type: boolType,
        name: 'foo',
        associatedComments: [],
      }),
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
      e2: EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        type: boolType,
        name: 'foo',
        associatedComments: [],
      }),
    }),
    'return (foo: bool);'
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
if (foo: bool) {
  _t0 = 1;
} else {
  _t0 = (bar: bool);
}
return (_t0: bool);`
  );
});

it('Lambda lowering works (1/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], unitType),
      associatedComments: [],
      parameters: [['a', Range.DUMMY, unitType]],
      captured: { a: unitType },
      body: THIS,
    }),
    `function _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: _SYNTHETIC_ID_TYPE_0, a: int): int {
  let a: int = (_context: _SYNTHETIC_ID_TYPE_0)[0];
  return (_this: __DUMMY___Dummy);
}
let _t1: _SYNTHETIC_ID_TYPE_0 = [(a: int)];
let _t2: any = _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0;
let _t3: any = (_t1: _SYNTHETIC_ID_TYPE_0);
let _t0: (any, any) = [(_t2: any), (_t3: any)];
return (_t0: (any, any));`
  );
});

it('Lambda lowering works (2/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], intType),
      associatedComments: [],
      parameters: [['a', Range.DUMMY, unitType]],
      captured: { a: unitType },
      body: THIS,
    }),
    `function _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: _SYNTHETIC_ID_TYPE_0, a: int): int {
  let a: int = (_context: _SYNTHETIC_ID_TYPE_0)[0];
  return (_this: __DUMMY___Dummy);
}
let _t1: _SYNTHETIC_ID_TYPE_0 = [(a: int)];
let _t2: any = _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0;
let _t3: any = (_t1: _SYNTHETIC_ID_TYPE_0);
let _t0: (any, any) = [(_t2: any), (_t3: any)];
return (_t0: (any, any));`
  );
});

it('Lambda lowering works (3/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], DUMMY_IDENTIFIER_TYPE),
      associatedComments: [],
      parameters: [['a', Range.DUMMY, unitType]],
      captured: { a: unitType },
      body: THIS,
    }),
    `function _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: _SYNTHETIC_ID_TYPE_0, a: int): __DUMMY___Dummy {
  let a: int = (_context: _SYNTHETIC_ID_TYPE_0)[0];
  return (_this: __DUMMY___Dummy);
}
let _t1: _SYNTHETIC_ID_TYPE_0 = [(a: int)];
let _t2: any = _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0;
let _t3: any = (_t1: _SYNTHETIC_ID_TYPE_0);
let _t0: (any, any) = [(_t2: any), (_t3: any)];
return (_t0: (any, any));`
  );
});

it('Lambda lowering works (4/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], DUMMY_IDENTIFIER_TYPE),
      associatedComments: [],
      parameters: [['a', Range.DUMMY, unitType]],
      captured: {},
      body: THIS,
    }),
    `function _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: _SYNTHETIC_ID_TYPE_0, a: int): __DUMMY___Dummy {
  return (_this: __DUMMY___Dummy);
}
let _t1: any = _module___DUMMY___class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0;
let _t2: any = 1;
let _t0: (any, any) = [(_t1: any), (_t2: any)];
return (_t0: (any, any));`
  );
});

it('IfElse lowering works 1/2.', () => {
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

it('IfElse lowering works 2/2.', () => {
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

it('Match lowering works 1/3.', () => {
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
          dataVariable: ['bar', Range.DUMMY, stringType],
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
let _t2: bool = (_t0: int) == 0;
let _t3: __DUMMY___Dummy;
if (_t2: bool) {
  let _t1: any = (_this: __DUMMY___Dummy)[1];
  _t3 = (_this: __DUMMY___Dummy);
} else {
  _t3 = (_this: __DUMMY___Dummy);
}
return (_t3: __DUMMY___Dummy);`
  );
});

it('Match lowering works 2/3.', () => {
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
          dataVariable: ['bar', Range.DUMMY, stringType],
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
let _t3: bool = (_t0: int) == 0;
if (_t3: bool) {
  let _t1: any = (_this: __DUMMY___Dummy)[1];
} else {
  let _t2: bool = (_t0: int) == 1;
  if (_t2: bool) {
  } else {
  }
}
return 0;`
  );
});

it('Match lowering works 3/3.', () => {
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
let _t4: bool = (_t0: int) == 0;
let _t5: __DUMMY___Dummy;
if (_t4: bool) {
  _t5 = (_this: __DUMMY___Dummy);
} else {
  let _t2: bool = (_t0: int) == 1;
  let _t3: __DUMMY___Dummy;
  if (_t2: bool) {
    let _t1: any = (_this: __DUMMY___Dummy)[1];
    let bar: __DUMMY___Dummy = (_t1: any);
    _t3 = (bar: __DUMMY___Dummy);
  } else {
    _t3 = (_this: __DUMMY___Dummy);
  }
  _t5 = (_t3: __DUMMY___Dummy);
}
return (_t5: __DUMMY___Dummy);`
  );
});

it('StatementBlockExpression lowering works.', () => {
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
    `let a__depth_1__block_0: int = (_this: _SYNTHETIC_ID_TYPE_0)[0];
let a__depth_1__block_0: int = (_this: __DUMMY___Dummy)[0];
let c__depth_1__block_0: int = (_this: __DUMMY___Dummy)[1];
return 0;`
  );
});

it('shadowing statement block lowering works.', () => {
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
    `return (_this: __DUMMY___Dummy);`
  );
});
