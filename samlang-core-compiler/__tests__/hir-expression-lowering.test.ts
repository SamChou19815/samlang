import lowerSamlangExpression from '../hir-expression-lowering';
import HighIRStringManager from '../hir-string-manager';

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
import { HIR_RETURN, debugPrintHighIRStatement } from 'samlang-core-ast/hir-expressions';
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
  EXPRESSION_PANIC,
  EXPRESSION_BUILTIN_FUNCTION_CALL,
  EXPRESSION_FUNCTION_CALL,
  EXPRESSION_BINARY,
  EXPRESSION_LAMBDA,
  EXPRESSION_IF_ELSE,
  EXPRESSION_MATCH,
  EXPRESSION_STATEMENT_BLOCK,
} from 'samlang-core-ast/samlang-expressions';

const DUMMY_IDENTIFIER_TYPE = identifierType(ModuleReference.ROOT, 'Dummy');
const THIS = EXPRESSION_THIS({ range: Range.DUMMY, type: DUMMY_IDENTIFIER_TYPE });

const expectCorrectlyLowered = (
  samlangExpression: SamlangExpression,
  expectedString: string
): void => {
  const stringManager = new HighIRStringManager();
  const { statements, expression, syntheticFunctions } = lowerSamlangExpression(
    ModuleReference.ROOT,
    'ENCODED_FUNCTION_NAME',
    { _Foo: [HIR_INT_TYPE, HIR_INT_TYPE], _Dummy: [HIR_INT_TYPE, HIR_INT_TYPE] },
    {
      _module_ModuleModule_class_ImportedClass_function_bar: HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('_Dummy'), HIR_IDENTIFIER_TYPE('_Dummy')],
        HIR_INT_TYPE
      ),
      _module__class_Dummy_function_fooBar: HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('_Dummy'), HIR_IDENTIFIER_TYPE('_Dummy')],
        HIR_INT_TYPE
      ),
      _module__class_C_function_m1: HIR_FUNCTION_TYPE(
        [HIR_IDENTIFIER_TYPE('_Dummy')],
        HIR_INT_TYPE
      ),
      _module__class_C_function_m2: HIR_FUNCTION_TYPE(
        [HIR_INT_TYPE],
        HIR_IDENTIFIER_TYPE('_Dummy')
      ),
    },
    new Set(),
    stringManager,
    samlangExpression
  );
  const syntheticModule: HighIRModule = {
    globalVariables: stringManager.globalVariables,
    typeDefinitions: [],
    functions: syntheticFunctions,
  };
  const syntheticStatements = [...statements, HIR_RETURN(expression)];
  expect(
    `${debugPrintHighIRModule(syntheticModule)}${syntheticStatements
      .map((it) => debugPrintHighIRStatement(it))
      .join('\n')}`
  ).toBe(expectedString);
};

it('Literal lowering works.', () => {
  expectCorrectlyLowered(EXPRESSION_FALSE(Range.DUMMY), 'return 0;');
  expectCorrectlyLowered(EXPRESSION_TRUE(Range.DUMMY), 'return 1;');
  expectCorrectlyLowered(EXPRESSION_INT(Range.DUMMY, 0), 'return 0;');
  expectCorrectlyLowered(
    EXPRESSION_STRING(Range.DUMMY, 'foo'),
    "const GLOBAL_STRING_0 = 'foo';\nreturn GLOBAL_STRING_0;"
  );
});

it('This lowering works.', () => {
  expectCorrectlyLowered(THIS, 'return (_this: _Dummy);');
});

it('Variable lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_VARIABLE({ range: Range.DUMMY, type: unitType, name: 'foo' }),
    'return (foo: int);'
  );
});

it('ClassMember lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_CLASS_MEMBER({
      range: Range.DUMMY,
      type: unitType,
      typeArguments: [],
      moduleReference: ModuleReference.ROOT,
      className: 'A',
      classNameRange: Range.DUMMY,
      memberName: 'b',
      memberNameRange: Range.DUMMY,
    }),
    `let _t1: any = 0;
let _t0: (any, any) = [_module__class_A_function_b, (_t1: any)];
return (_t0: (any, any));`
  );
});

it('Lowering to StructConstructor works (1/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([DUMMY_IDENTIFIER_TYPE]),
      expressions: [THIS],
    }),
    `let _t0: (_Dummy) = [(_this: _Dummy)];
return (_t0: (_Dummy));`
  );
});

it('Lowering to StructConstructor works (2/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'Foo'),
      fieldDeclarations: [
        { range: Range.DUMMY, type: DUMMY_IDENTIFIER_TYPE, name: 'foo', expression: THIS },
        { range: Range.DUMMY, type: DUMMY_IDENTIFIER_TYPE, name: 'bar' },
      ],
    }),
    `let _t0: int = (_this: _Dummy);
let _t1: int = (bar: _Dummy);
let _t2: _Foo = [(_t0: int), (_t1: int)];
return (_t2: _Foo);`
  );
});

it('Lowering to StructConstructor works (3/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'Foo'),
      tag: 'Foo',
      tagOrder: 1,
      data: THIS,
    }),
    `let _t1: any = (_this: _Dummy);
let _t0: _Foo = [1, (_t1: any)];
return (_t0: _Foo);`
  );
});

it('FieldAccess lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FIELD_ACCESS({
      range: Range.DUMMY,
      type: unitType,
      expression: THIS,
      fieldName: 'foo',
      fieldOrder: 0,
    }),
    'let _t0: int = (_this: _Dummy)[0];\nreturn (_t0: int);'
  );
});

it('MethodAccess lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], unitType),
      expression: THIS,
      methodName: 'foo',
    }),
    `let _t0: (any, any) = [_module__class_Dummy_function_foo, (_this: _Dummy)];
return (_t0: (any, any));`
  );
});

it('Unary lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: unitType,
      operator: '!',
      expression: THIS,
    }),
    'let _t0: bool = (_this: _Dummy) ^ 1;\nreturn (_t0: bool);'
  );

  expectCorrectlyLowered(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: unitType,
      operator: '-',
      expression: THIS,
    }),
    'let _t0: int = 0 - (_this: _Dummy);\nreturn (_t0: int);'
  );
});

it('FunctionCall family lowering works 1/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: stringType,
      functionName: 'intToString',
      argumentExpression: THIS,
    }),
    'let _t0: string = _builtin_intToString((_this: _Dummy));\nreturn (_t0: string);'
  );
});

it('FunctionCall family lowering works 2/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionName: 'stringToInt',
      argumentExpression: THIS,
    }),
    'let _t0: int = _builtin_stringToInt((_this: _Dummy));\nreturn (_t0: int);'
  );
});

it('FunctionCall family lowering works 3/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: unitType,
      functionName: 'println',
      argumentExpression: THIS,
    }),
    '_builtin_println((_this: _Dummy));\nreturn 0;'
  );
});

it('FunctionCall family lowering works 4/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionExpression: EXPRESSION_CLASS_MEMBER({
        range: Range.DUMMY,
        type: functionType([DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE], intType),
        typeArguments: [],
        moduleReference: new ModuleReference(['ModuleModule']),
        className: 'ImportedClass',
        classNameRange: Range.DUMMY,
        memberName: 'bar',
        memberNameRange: Range.DUMMY,
      }),
      functionArguments: [THIS, THIS],
    }),
    `let _t0: int = _module_ModuleModule_class_ImportedClass_function_bar((_this: _Dummy), (_this: _Dummy));
return (_t0: int);`
  );
});

it('FunctionCall family lowering works 5/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionExpression: EXPRESSION_METHOD_ACCESS({
        range: Range.DUMMY,
        type: functionType([DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE], intType),
        expression: THIS,
        methodName: 'fooBar',
      }),
      functionArguments: [THIS, THIS],
    }),
    `let _t0: int = _module__class_Dummy_function_fooBar((_this: _Dummy), (_this: _Dummy), (_this: _Dummy));
return (_t0: int);`
  );
});

it('FunctionCall family lowering works 6/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionExpression: EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        name: 'closure',
        type: functionType([DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE], intType),
      }),
      functionArguments: [THIS, THIS],
    }),
    `let _t1: any = (closure: (any, any))[0];
let _t2: any = (closure: (any, any))[1];
let _t6: int = (_t2: any);
let _t5: bool = (_t6: int) == 0;
let _t0: int;
if (_t5: bool) {
  let _t7: (_Dummy, _Dummy) -> int = (_t1: any);
  let _t3: int = (_t7: (_Dummy, _Dummy) -> int)((_this: _Dummy), (_this: _Dummy));
  _t0 = (_t3: int);
} else {
  let _t8: (any, _Dummy, _Dummy) -> int = (_t1: any);
  let _t4: int = (_t8: (any, _Dummy, _Dummy) -> int)((_t2: any), (_this: _Dummy), (_this: _Dummy));
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
      functionExpression: EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        name: 'closure',
        type: functionType([DUMMY_IDENTIFIER_TYPE, DUMMY_IDENTIFIER_TYPE], unitType),
      }),
      functionArguments: [THIS, THIS],
    }),
    `let _t1: any = (closure: (any, any))[0];
let _t2: any = (closure: (any, any))[1];
let _t6: int = (_t2: any);
let _t5: bool = (_t6: int) == 0;
if (_t5: bool) {
  let _t7: (_Dummy, _Dummy) -> int = (_t1: any);
  (_t7: (_Dummy, _Dummy) -> int)((_this: _Dummy), (_this: _Dummy));
} else {
  let _t8: (any, _Dummy, _Dummy) -> int = (_t1: any);
  (_t8: (any, _Dummy, _Dummy) -> int)((_t2: any), (_this: _Dummy), (_this: _Dummy));
}
return 0;`
  );
});

it('FunctionCall family lowering works 8/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: unitType,
      functionExpression: EXPRESSION_CLASS_MEMBER({
        range: Range.DUMMY,
        type: functionType([DUMMY_IDENTIFIER_TYPE], unitType),
        typeArguments: [],
        moduleReference: new ModuleReference(['']),
        className: 'C',
        classNameRange: Range.DUMMY,
        memberName: 'm1',
        memberNameRange: Range.DUMMY,
      }),
      functionArguments: [EXPRESSION_INT(Range.DUMMY, 0)],
    }),
    `let _t1: _Dummy = 0;
_module__class_C_function_m1((_t1: _Dummy));
return 0;`
  );
});

it('FunctionCall family lowering works 9/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionExpression: EXPRESSION_CLASS_MEMBER({
        range: Range.DUMMY,
        type: functionType([intType], DUMMY_IDENTIFIER_TYPE),
        typeArguments: [],
        moduleReference: new ModuleReference(['']),
        className: 'C',
        classNameRange: Range.DUMMY,
        memberName: 'm2',
        memberNameRange: Range.DUMMY,
      }),
      functionArguments: [EXPRESSION_INT(Range.DUMMY, 0)],
    }),
    `let _t0: _Dummy = _module__class_C_function_m2(0);
let _t1: int = (_t0: _Dummy);
return (_t1: int);`
  );
});

it('FunctionCall family lowering works 10/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionExpression: EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        name: 'closure',
        type: functionType([DUMMY_IDENTIFIER_TYPE], DUMMY_IDENTIFIER_TYPE),
      }),
      functionArguments: [EXPRESSION_INT(Range.DUMMY, 0)],
    }),
    `let _t1: _Dummy = 0;
let _t2: any = (closure: (any, any))[0];
let _t3: any = (closure: (any, any))[1];
let _t7: int = (_t3: any);
let _t6: bool = (_t7: int) == 0;
let _t0: _Dummy;
if (_t6: bool) {
  let _t8: (_Dummy) -> _Dummy = (_t2: any);
  let _t4: _Dummy = (_t8: (_Dummy) -> _Dummy)((_t1: _Dummy));
  _t0 = (_t4: _Dummy);
} else {
  let _t9: (any, _Dummy) -> _Dummy = (_t2: any);
  let _t5: _Dummy = (_t9: (any, _Dummy) -> _Dummy)((_t3: any), (_t1: _Dummy));
  _t0 = (_t5: _Dummy);
}
let _t10: int = (_t0: _Dummy);
return (_t10: int);`
  );
});

it('Normal binary lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BINARY({ range: Range.DUMMY, type: intType, operator: PLUS, e1: THIS, e2: THIS }),
    'let _t0: int = (_this: _Dummy) + (_this: _Dummy);\nreturn (_t0: int);'
  );
});

it('String concat binary lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: stringType,
      operator: CONCAT,
      e1: THIS,
      e2: THIS,
    }),
    `let _t0: string = _builtin_stringConcat((_this: _Dummy), (_this: _Dummy));
return (_t0: string);`
  );
});

it('Short circuiting binary lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: AND,
      e1: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: boolType, name: 'foo' }),
      e2: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: boolType, name: 'bar' }),
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
      operator: AND,
      e1: EXPRESSION_TRUE(Range.DUMMY),
      e2: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: boolType, name: 'foo' }),
    }),
    'return (foo: bool);'
  );

  expectCorrectlyLowered(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: AND,
      e1: EXPRESSION_FALSE(Range.DUMMY),
      e2: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: boolType, name: 'foo' }),
    }),
    'return 0;'
  );

  expectCorrectlyLowered(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: OR,
      e1: EXPRESSION_TRUE(Range.DUMMY),
      e2: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: boolType, name: 'foo' }),
    }),
    'return 1;'
  );

  expectCorrectlyLowered(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: OR,
      e1: EXPRESSION_FALSE(Range.DUMMY),
      e2: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: boolType, name: 'foo' }),
    }),
    'return (foo: bool);'
  );

  expectCorrectlyLowered(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: OR,
      e1: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: boolType, name: 'foo' }),
      e2: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: boolType, name: 'bar' }),
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
      parameters: [['a', unitType]],
      captured: { a: unitType },
      body: THIS,
    }),
    `function _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: (int), a: int): int {
  let a: int = (_context: (int))[0];
  return (_this: _Dummy);
}
let _t1: (int) = [(a: int)];
let _t2: any = _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0;
let _t3: any = (_t1: (int));
let _t0: (any, any) = [(_t2: any), (_t3: any)];
return (_t0: (any, any));`
  );
});

it('Lambda lowering works (2/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], intType),
      parameters: [['a', unitType]],
      captured: { a: unitType },
      body: THIS,
    }),
    `function _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: (int), a: int): int {
  let a: int = (_context: (int))[0];
  return (_this: _Dummy);
}
let _t1: (int) = [(a: int)];
let _t2: any = _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0;
let _t3: any = (_t1: (int));
let _t0: (any, any) = [(_t2: any), (_t3: any)];
return (_t0: (any, any));`
  );
});

it('Lambda lowering works (3/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], DUMMY_IDENTIFIER_TYPE),
      parameters: [['a', unitType]],
      captured: { a: unitType },
      body: THIS,
    }),
    `function _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: (int), a: int): _Dummy {
  let a: int = (_context: (int))[0];
  return (_this: _Dummy);
}
let _t1: (int) = [(a: int)];
let _t2: any = _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0;
let _t3: any = (_t1: (int));
let _t0: (any, any) = [(_t2: any), (_t3: any)];
return (_t0: (any, any));`
  );
});

it('Lambda lowering works (4/n).', () => {
  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], DUMMY_IDENTIFIER_TYPE),
      parameters: [['a', unitType]],
      captured: {},
      body: THIS,
    }),
    `function _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: (), a: int): _Dummy {
  return (_this: _Dummy);
}
let _t1: any = _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0;
let _t2: any = 1;
let _t0: (any, any) = [(_t1: any), (_t2: any)];
return (_t0: (any, any));`
  );
});

it('Panic lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
    `_builtin_throw((_this: _Dummy));\nreturn 0;`
  );
});

it('IfElse lowering works 1/2.', () => {
  expectCorrectlyLowered(
    EXPRESSION_IF_ELSE({
      range: Range.DUMMY,
      type: DUMMY_IDENTIFIER_TYPE,
      boolExpression: THIS,
      e1: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
      e2: THIS,
    }),
    `let _t0: _Dummy;
if (_this: _Dummy) {
  _builtin_throw((_this: _Dummy));
  _t0 = 0;
} else {
  _t0 = (_this: _Dummy);
}
return (_t0: _Dummy);`
  );
});

it('IfElse lowering works 2/2.', () => {
  expectCorrectlyLowered(
    EXPRESSION_IF_ELSE({
      range: Range.DUMMY,
      type: unitType,
      boolExpression: THIS,
      e1: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
      e2: THIS,
    }),
    `if (_this: _Dummy) {
  _builtin_throw((_this: _Dummy));
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
      matchedExpression: THIS,
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'Foo',
          tagOrder: 0,
          dataVariable: ['bar', stringType],
          expression: THIS,
        },
        {
          range: Range.DUMMY,
          tag: 'Bar',
          tagOrder: 1,
          expression: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
        },
      ],
    }),
    `let _t0: int = (_this: _Dummy)[0];
let _t1: _Dummy;
switch (_t0) {
  case 0: {
    let _t2: any = (_this: _Dummy)[1];
    _t1 = (_this: _Dummy);
  }
  case 1: {
    _builtin_throw((_this: _Dummy));
    _t1 = 0;
  }
}
return (_t1: _Dummy);`
  );
});

it('Match lowering works 2/3.', () => {
  expectCorrectlyLowered(
    EXPRESSION_MATCH({
      range: Range.DUMMY,
      type: unitType,
      matchedExpression: THIS,
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'Foo',
          tagOrder: 0,
          dataVariable: ['bar', stringType],
          expression: THIS,
        },
        {
          range: Range.DUMMY,
          tag: 'Bar',
          tagOrder: 1,
          expression: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
        },
        {
          range: Range.DUMMY,
          tag: 'Baz',
          tagOrder: 2,
          expression: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
        },
      ],
    }),
    `let _t0: int = (_this: _Dummy)[0];
switch (_t0) {
  case 0: {
    let _t2: any = (_this: _Dummy)[1];
  }
  case 1: {
    _builtin_throw((_this: _Dummy));
  }
  case 2: {
    _builtin_throw((_this: _Dummy));
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
          dataVariable: ['bar', DUMMY_IDENTIFIER_TYPE],
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            name: 'bar',
            type: DUMMY_IDENTIFIER_TYPE,
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
    `let _t0: int = (_this: _Dummy)[0];
let _t1: _Dummy;
switch (_t0) {
  case 0: {
    _t1 = (_this: _Dummy);
  }
  case 1: {
    let _t2: any = (_this: _Dummy)[1];
    let bar: _Dummy = (_t2: any);
    _t1 = (bar: _Dummy);
  }
  case 2: {
    _t1 = (_this: _Dummy);
  }
}
return (_t1: _Dummy);`
  );
});

it('StatementBlockExpression lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: unitType,
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
                  },
                  {
                    range: Range.DUMMY,
                    pattern: {
                      range: Range.DUMMY,
                      type: 'ObjectPattern',
                      destructedNames: [
                        { range: Range.DUMMY, fieldName: 'a', type: intType, fieldOrder: 0 },
                        {
                          range: Range.DUMMY,
                          fieldName: 'b',
                          type: intType,
                          fieldOrder: 1,
                          alias: 'c',
                        },
                      ],
                    },
                    typeAnnotation: DUMMY_IDENTIFIER_TYPE,
                    assignedExpression: THIS,
                  },
                  {
                    range: Range.DUMMY,
                    pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
                    typeAnnotation: DUMMY_IDENTIFIER_TYPE,
                    assignedExpression: THIS,
                  },
                ],
                expression: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: unitType, name: 'a' }),
              },
            }),
          },
        ],
      },
    }),
    `let a__depth_1__block_0: int = (_this: (int, int))[0];
let a__depth_1__block_0: int = (_this: _Dummy)[0];
let c__depth_1__block_0: int = (_this: _Dummy)[1];
return 0;`
  );
});

it('shadowing statement block lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: stringType,
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
              block: {
                range: Range.DUMMY,
                statements: [
                  {
                    range: Range.DUMMY,
                    typeAnnotation: intType,
                    pattern: { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
                    assignedExpression: EXPRESSION_BUILTIN_FUNCTION_CALL({
                      range: Range.DUMMY,
                      type: stringType,
                      functionName: 'intToString',
                      argumentExpression: THIS,
                    }),
                  },
                ],
                expression: EXPRESSION_VARIABLE({
                  range: Range.DUMMY,
                  type: stringType,
                  name: 'a',
                }),
              },
            }),
          },
        ],
        expression: EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: stringType,
          name: 'a',
        }),
      },
    }),
    `let _t0: string = _builtin_intToString((_this: _Dummy));
return (_t0: string);`
  );
});
