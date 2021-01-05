import lowerSamlangExpression from '../hir-expression-lowering';

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
  const { statements, expression, syntheticFunctions } = lowerSamlangExpression(
    ModuleReference.ROOT,
    'ENCODED_FUNCTION_NAME',
    new Set(),
    samlangExpression
  );
  const syntheticModule: HighIRModule = { typeDefinitions: [], functions: syntheticFunctions };
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
  expectCorrectlyLowered(EXPRESSION_STRING(Range.DUMMY, 'foo'), "return 'foo';");
});

it('This lowering works.', () => {
  expectCorrectlyLowered(THIS, 'return (_this: _Dummy);');
});

it('Variable lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_VARIABLE({ range: Range.DUMMY, type: unitType, name: 'foo' }),
    'return (foo: void);'
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
    `let _t0: _builtin_Closure = [_module__class_A_function_b, 0];
return (_t0: _builtin_Closure);`
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
        { range: Range.DUMMY, type: unitType, name: 'foo', expression: THIS },
        { range: Range.DUMMY, type: unitType, name: 'bar' },
      ],
    }),
    `let _t0: _Foo = [(_this: _Dummy), (bar: void)];
return (_t0: _Foo);`
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
    `let _t0: _Foo = [1, (_this: _Dummy)];
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
    'return ((_this: _Dummy)[0]: void);'
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
    `let _t0: _builtin_Closure = [_module__class_Dummy_function_foo, (_this: _Dummy)];
return (_t0: _builtin_Closure);`
  );
});

it('Unary lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: unitType,
      operator: '!',
      expression: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
    }),
    '_builtin_throw((_this: _Dummy));\nreturn (0 ^ 1);'
  );

  expectCorrectlyLowered(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: unitType,
      operator: '-',
      expression: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
    }),
    '_builtin_throw((_this: _Dummy));\nreturn (0 - 0);'
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
      functionExpression: THIS,
      functionArguments: [THIS, THIS],
    }),
    `let _t1: _builtin_Closure = (_this: _Dummy);
let _t2: any = ((_t1: _builtin_Closure)[1]: any);
if ((_t2: any) == 0) {
  let _t0: int = ((_t1: _builtin_Closure)[0]: any)((_this: _Dummy), (_this: _Dummy));
} else {
  let _t0: int = ((_t1: _builtin_Closure)[0]: any)((_t2: any), (_this: _Dummy), (_this: _Dummy));
}
// phi(_t0)
return (_t0: int);`
  );
});

it('FunctionCall family lowering works 7/n.', () => {
  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: unitType,
      functionExpression: THIS,
      functionArguments: [THIS, THIS],
    }),
    `let _t1: _builtin_Closure = (_this: _Dummy);
let _t2: any = ((_t1: _builtin_Closure)[1]: any);
if ((_t2: any) == 0) {
  let _t0: void = ((_t1: _builtin_Closure)[0]: any)((_this: _Dummy), (_this: _Dummy));
} else {
  let _t0: void = ((_t1: _builtin_Closure)[0]: any)((_t2: any), (_this: _Dummy), (_this: _Dummy));
}
// phi(_t0)
return (_t0: void);`
  );
});

it('Normal binary lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BINARY({ range: Range.DUMMY, type: intType, operator: PLUS, e1: THIS, e2: THIS }),
    'return ((_this: _Dummy) + (_this: _Dummy));'
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
      e1: EXPRESSION_TRUE(Range.DUMMY),
      e2: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: boolType, name: 'foo' }),
    }),
    `if 1 {
  let _t0: int = (foo: int);
} else {
  let _t0: int = 0;
}
// phi(_t0)
return (_t0: int);`
  );

  expectCorrectlyLowered(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: OR,
      e1: EXPRESSION_TRUE(Range.DUMMY),
      e2: EXPRESSION_FALSE(Range.DUMMY),
    }),
    `if 1 {
  let _t0: int = 1;
} else {
  let _t0: int = 0;
}
// phi(_t0)
return (_t0: int);`
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
    `function _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: (void), a: void): void {
  let a: void = ((_context: (void))[0]: void);
}
let _t1: (void) = [(a: void)];
let _t0: _builtin_Closure = [_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0, (_t1: (void))];
return (_t0: _builtin_Closure);`
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
    `function _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: (void), a: void): int {
  let a: void = ((_context: (void))[0]: void);
  return (_this: _Dummy);
}
let _t1: (void) = [(a: void)];
let _t0: _builtin_Closure = [_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0, (_t1: (void))];
return (_t0: _builtin_Closure);`
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
    `function _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: (void), a: void): _Dummy {
  let a: void = ((_context: (void))[0]: void);
  return (_this: _Dummy);
}
let _t1: (void) = [(a: void)];
let _t0: _builtin_Closure = [_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0, (_t1: (void))];
return (_t0: _builtin_Closure);`
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
    `function _module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0(_context: (), a: void): _Dummy {
  return (_this: _Dummy);
}
let _t0: _builtin_Closure = [_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0, 1];
return (_t0: _builtin_Closure);`
  );
});

it('Panic lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
    `_builtin_throw((_this: _Dummy));\nreturn 0;`
  );
});

it('IfElse lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_IF_ELSE({
      range: Range.DUMMY,
      type: DUMMY_IDENTIFIER_TYPE,
      boolExpression: THIS,
      e1: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
      e2: THIS,
    }),
    `if (_this: _Dummy) {
  _builtin_throw((_this: _Dummy));
  let _t0: _Dummy = 0;
} else {
  let _t0: _Dummy = (_this: _Dummy);
}
// phi(_t0)
return (_t0: _Dummy);`
  );
});

it('Match lowering works.', () => {
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
    `let _t0: _Dummy = (_this: _Dummy);
let _t1: int = ((_t0: _Dummy)[0]: int);
if ((_t1: int) == 0) {
  let bar: string = ((_t0: _Dummy)[1]: any);
  let _t2: _Dummy = (_this: _Dummy);
} else {
  if ((_t1: int) == 1) {
    _builtin_throw((_this: _Dummy));
    let _t2: _Dummy = 0;
  } else {
    _builtin_throw('Unreachable branch in match!');
  }
  // phi(_t2)
}
// phi(_t2)
return (_t2: _Dummy);`
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
                        ['a', Range.DUMMY],
                        [null, Range.DUMMY],
                      ],
                    },
                    typeAnnotation: DUMMY_IDENTIFIER_TYPE,
                    assignedExpression: THIS,
                  },
                  {
                    range: Range.DUMMY,
                    pattern: {
                      range: Range.DUMMY,
                      type: 'ObjectPattern',
                      destructedNames: [
                        { range: Range.DUMMY, fieldName: 'a', fieldOrder: 0 },
                        { range: Range.DUMMY, fieldName: 'b', fieldOrder: 1, alias: 'c' },
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
    `let _t0: _Dummy = (_this: _Dummy);
let a__depth_1__block_0: any = ((_t0: _Dummy)[0]: any);
let _t1: _Dummy = (_this: _Dummy);
let a__depth_1__block_0: any = ((_t1: _Dummy)[0]: any);
let c__depth_1__block_0: any = ((_t1: _Dummy)[1]: any);
let a: void = (a__depth_1__block_0: void);
return 0;`
  );
});

it('shadowing statement block lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: unitType,
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            typeAnnotation: unitType,
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
                    assignedExpression: EXPRESSION_INT(Range.DUMMY, 1),
                  },
                ],
              },
            }),
          },
        ],
      },
    }),
    `let a__depth_1__block_0: int = 1;
let a: void = 0;
return 0;`
  );
});
