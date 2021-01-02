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
import {
  HIR_NAME,
  HIR_VARIABLE,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_STRING,
  HIR_INDEX_ACCESS,
  HIR_FUNCTION_CALL,
  HIR_BINARY,
  HIR_IF_ELSE,
  HIR_LET,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import {
  HIR_INT_TYPE,
  HIR_ANY_TYPE,
  HIR_VOID_TYPE,
  HIR_STRUCT_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_STRING_TYPE,
  HIR_CLOSURE_TYPE,
  HIR_IDENTIFIER_TYPE,
} from 'samlang-core-ast/hir-types';
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
const IR_DUMMY_IDENTIFIER_TYPE = HIR_IDENTIFIER_TYPE('_Dummy');
const THIS = EXPRESSION_THIS({ range: Range.DUMMY, type: DUMMY_IDENTIFIER_TYPE });
const IR_THIS = HIR_VARIABLE('_this', IR_DUMMY_IDENTIFIER_TYPE);

const expectCorrectlyLowered = (
  samlangExpression: SamlangExpression,
  {
    syntheticFunctions = [],
    statements = [],
    expression = HIR_ZERO,
  }: Partial<ReturnType<typeof lowerSamlangExpression>>
): void => {
  expect(
    lowerSamlangExpression(
      ModuleReference.ROOT,
      'ENCODED_FUNCTION_NAME',
      new Set(),
      samlangExpression
    )
  ).toEqual({
    statements,
    expression,
    syntheticFunctions,
  });
};

it('Literal lowering works.', () => {
  expectCorrectlyLowered(EXPRESSION_FALSE(Range.DUMMY), { expression: HIR_ZERO });
  expectCorrectlyLowered(EXPRESSION_TRUE(Range.DUMMY), { expression: HIR_ONE });
  expectCorrectlyLowered(EXPRESSION_INT(Range.DUMMY, 0), { expression: HIR_ZERO });
  expectCorrectlyLowered(EXPRESSION_STRING(Range.DUMMY, 'foo'), { expression: HIR_STRING('foo') });
});

it('This lowering works.', () => {
  expectCorrectlyLowered(THIS, { expression: IR_THIS });
});

it('Variable lowering works.', () => {
  expectCorrectlyLowered(EXPRESSION_VARIABLE({ range: Range.DUMMY, type: unitType, name: 'foo' }), {
    expression: HIR_VARIABLE('foo', HIR_VOID_TYPE),
  });
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
    {
      statements: [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t0',
          type: HIR_CLOSURE_TYPE,
          expressionList: [HIR_NAME('_module__class_A_function_b', HIR_VOID_TYPE), HIR_ZERO],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_CLOSURE_TYPE),
    }
  );
});

it('Lowering to StructConstructor works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([DUMMY_IDENTIFIER_TYPE]),
      expressions: [THIS],
    }),
    {
      statements: [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t0',
          type: HIR_STRUCT_TYPE([IR_DUMMY_IDENTIFIER_TYPE]),
          expressionList: [IR_THIS],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_STRUCT_TYPE([IR_DUMMY_IDENTIFIER_TYPE])),
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'Foo'),
      fieldDeclarations: [
        { range: Range.DUMMY, type: unitType, name: 'foo', expression: THIS },
        { range: Range.DUMMY, type: unitType, name: 'bar' },
      ],
    }),
    {
      statements: [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t0',
          type: HIR_IDENTIFIER_TYPE('_Foo'),
          expressionList: [IR_THIS, HIR_VARIABLE('bar', HIR_VOID_TYPE)],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_IDENTIFIER_TYPE('_Foo')),
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'Foo'),
      tag: 'Foo',
      tagOrder: 1,
      data: THIS,
    }),
    {
      statements: [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t0',
          type: HIR_IDENTIFIER_TYPE('_Foo'),
          expressionList: [HIR_ONE, IR_THIS],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_IDENTIFIER_TYPE('_Foo')),
    }
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
    { expression: HIR_INDEX_ACCESS({ type: HIR_VOID_TYPE, expression: IR_THIS, index: 0 }) }
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
    {
      statements: [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t0',
          type: HIR_CLOSURE_TYPE,
          expressionList: [
            HIR_NAME('_module__class_Dummy_function_foo', HIR_FUNCTION_TYPE([], HIR_VOID_TYPE)),
            IR_THIS,
          ],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_CLOSURE_TYPE),
    }
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
    {
      statements: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_builtin_throw',
            HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_VOID_TYPE)
          ),
          functionArguments: [IR_THIS],
          returnCollector: '_t0',
        }),
      ],
      expression: HIR_BINARY({
        operator: '^',
        e1: HIR_ZERO,
        e2: HIR_ONE,
      }),
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: unitType,
      operator: '-',
      expression: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
    }),
    {
      statements: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_builtin_throw',
            HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_VOID_TYPE)
          ),
          functionArguments: [IR_THIS],
          returnCollector: '_t0',
        }),
      ],
      expression: HIR_BINARY({
        operator: '-',
        e1: HIR_ZERO,
        e2: HIR_ZERO,
      }),
    }
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
    {
      statements: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_builtin_intToString',
            HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_STRING_TYPE)
          ),
          functionArguments: [IR_THIS],
          returnCollector: '_t0',
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_STRING_TYPE),
    }
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
    {
      statements: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_builtin_stringToInt',
            HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_INT_TYPE)
          ),
          functionArguments: [IR_THIS],
          returnCollector: '_t0',
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_INT_TYPE),
    }
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
    {
      statements: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_builtin_println',
            HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_VOID_TYPE)
          ),
          functionArguments: [IR_THIS],
          returnCollector: '_t0',
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_VOID_TYPE),
    }
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
    {
      statements: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_module_ModuleModule_class_ImportedClass_function_bar',
            HIR_FUNCTION_TYPE([IR_DUMMY_IDENTIFIER_TYPE, IR_DUMMY_IDENTIFIER_TYPE], HIR_INT_TYPE)
          ),
          functionArguments: [IR_THIS, IR_THIS],
          returnCollector: '_t0',
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_INT_TYPE),
    }
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
    {
      statements: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_module__class_Dummy_function_fooBar',
            HIR_FUNCTION_TYPE(
              [IR_DUMMY_IDENTIFIER_TYPE, IR_DUMMY_IDENTIFIER_TYPE, IR_DUMMY_IDENTIFIER_TYPE],
              HIR_INT_TYPE
            )
          ),
          functionArguments: [IR_THIS, IR_THIS, IR_THIS],
          returnCollector: '_t0',
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_INT_TYPE),
    }
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
    {
      statements: [
        HIR_LET({ name: '_t1', type: HIR_CLOSURE_TYPE, assignedExpression: IR_THIS }),
        HIR_LET({
          name: '_t2',
          type: HIR_ANY_TYPE,
          assignedExpression: HIR_INDEX_ACCESS({
            type: HIR_ANY_TYPE,
            expression: HIR_VARIABLE('_t1', HIR_CLOSURE_TYPE),
            index: 1,
          }),
        }),
        HIR_IF_ELSE({
          booleanExpression: HIR_BINARY({
            operator: '==',
            e1: HIR_VARIABLE('_t2', HIR_ANY_TYPE),
            e2: HIR_ZERO,
          }),
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_INDEX_ACCESS({
                type: HIR_ANY_TYPE,
                expression: HIR_VARIABLE('_t1', HIR_CLOSURE_TYPE),
                index: 0,
              }),
              functionArguments: [IR_THIS, IR_THIS],
              returnCollector: '_t0',
            }),
          ],
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_INDEX_ACCESS({
                type: HIR_ANY_TYPE,
                expression: HIR_VARIABLE('_t1', HIR_CLOSURE_TYPE),
                index: 0,
              }),
              functionArguments: [HIR_VARIABLE('_t2', HIR_ANY_TYPE), IR_THIS, IR_THIS],
              returnCollector: '_t0',
            }),
          ],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_INT_TYPE),
    }
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
    {
      statements: [
        HIR_LET({ name: '_t1', type: HIR_CLOSURE_TYPE, assignedExpression: IR_THIS }),
        HIR_LET({
          name: '_t2',
          type: HIR_ANY_TYPE,
          assignedExpression: HIR_INDEX_ACCESS({
            type: HIR_ANY_TYPE,
            expression: HIR_VARIABLE('_t1', HIR_CLOSURE_TYPE),
            index: 1,
          }),
        }),
        HIR_IF_ELSE({
          booleanExpression: HIR_BINARY({
            operator: '==',
            e1: HIR_VARIABLE('_t2', HIR_ANY_TYPE),
            e2: HIR_ZERO,
          }),
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_INDEX_ACCESS({
                type: HIR_ANY_TYPE,
                expression: HIR_VARIABLE('_t1', HIR_CLOSURE_TYPE),
                index: 0,
              }),
              functionArguments: [IR_THIS, IR_THIS],
              returnCollector: '_t0',
            }),
          ],
          s2: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_INDEX_ACCESS({
                type: HIR_ANY_TYPE,
                expression: HIR_VARIABLE('_t1', HIR_CLOSURE_TYPE),
                index: 0,
              }),
              functionArguments: [HIR_VARIABLE('_t2', HIR_ANY_TYPE), IR_THIS, IR_THIS],
              returnCollector: '_t0',
            }),
          ],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_VOID_TYPE),
    }
  );
});

it('Normal binary lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BINARY({ range: Range.DUMMY, type: intType, operator: PLUS, e1: THIS, e2: THIS }),
    { expression: HIR_BINARY({ operator: '+', e1: IR_THIS, e2: IR_THIS }) }
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
    {
      statements: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_builtin_stringConcat',
            HIR_FUNCTION_TYPE([HIR_STRING_TYPE, HIR_STRING_TYPE], HIR_STRING_TYPE)
          ),
          functionArguments: [IR_THIS, IR_THIS],
          returnCollector: '_t0',
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_STRING_TYPE),
    }
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
    {
      statements: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [
            HIR_LET({
              name: '_t0',
              type: HIR_INT_TYPE,
              assignedExpression: HIR_VARIABLE('foo', HIR_INT_TYPE),
            }),
          ],
          s2: [HIR_LET({ name: '_t0', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_INT_TYPE),
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: OR,
      e1: EXPRESSION_TRUE(Range.DUMMY),
      e2: EXPRESSION_FALSE(Range.DUMMY),
    }),
    {
      statements: [
        HIR_IF_ELSE({
          booleanExpression: HIR_ONE,
          s1: [HIR_LET({ name: '_t0', type: HIR_INT_TYPE, assignedExpression: HIR_ONE })],
          s2: [HIR_LET({ name: '_t0', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_INT_TYPE),
    }
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
    {
      syntheticFunctions: [
        {
          name: '_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0',
          parameters: ['_context', 'a'],
          hasReturn: false,
          type: HIR_FUNCTION_TYPE([HIR_STRUCT_TYPE([HIR_VOID_TYPE]), HIR_VOID_TYPE], HIR_VOID_TYPE),
          body: [
            HIR_LET({
              name: 'a',
              type: HIR_VOID_TYPE,
              assignedExpression: HIR_INDEX_ACCESS({
                type: HIR_VOID_TYPE,
                expression: HIR_VARIABLE('_context', HIR_STRUCT_TYPE([HIR_VOID_TYPE])),
                index: 0,
              }),
            }),
          ],
        },
      ],
      statements: [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t1',
          type: HIR_STRUCT_TYPE([HIR_VOID_TYPE]),
          expressionList: [HIR_VARIABLE('a', HIR_VOID_TYPE)],
        }),
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t0',
          type: HIR_CLOSURE_TYPE,
          expressionList: [
            HIR_NAME(
              '_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0',
              HIR_FUNCTION_TYPE([HIR_STRUCT_TYPE([HIR_VOID_TYPE]), HIR_VOID_TYPE], HIR_VOID_TYPE)
            ),
            HIR_VARIABLE('_t1', HIR_STRUCT_TYPE([HIR_VOID_TYPE])),
          ],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_CLOSURE_TYPE),
    }
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
    {
      syntheticFunctions: [
        {
          name: '_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0',
          parameters: ['_context', 'a'],
          hasReturn: true,
          type: HIR_FUNCTION_TYPE([HIR_STRUCT_TYPE([HIR_VOID_TYPE]), HIR_VOID_TYPE], HIR_INT_TYPE),
          body: [
            HIR_LET({
              name: 'a',
              type: HIR_VOID_TYPE,
              assignedExpression: HIR_INDEX_ACCESS({
                type: HIR_VOID_TYPE,
                expression: HIR_VARIABLE('_context', HIR_STRUCT_TYPE([HIR_VOID_TYPE])),
                index: 0,
              }),
            }),
            HIR_RETURN(IR_THIS),
          ],
        },
      ],
      statements: [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t1',
          type: HIR_STRUCT_TYPE([HIR_VOID_TYPE]),
          expressionList: [HIR_VARIABLE('a', HIR_VOID_TYPE)],
        }),
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t0',
          type: HIR_CLOSURE_TYPE,
          expressionList: [
            HIR_NAME(
              '_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0',
              HIR_FUNCTION_TYPE([HIR_STRUCT_TYPE([HIR_VOID_TYPE]), HIR_VOID_TYPE], HIR_INT_TYPE)
            ),
            HIR_VARIABLE('_t1', HIR_STRUCT_TYPE([HIR_VOID_TYPE])),
          ],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_CLOSURE_TYPE),
    }
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
    {
      syntheticFunctions: [
        {
          name: '_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0',
          parameters: ['_context', 'a'],
          hasReturn: true,
          type: HIR_FUNCTION_TYPE(
            [HIR_STRUCT_TYPE([HIR_VOID_TYPE]), HIR_VOID_TYPE],
            IR_DUMMY_IDENTIFIER_TYPE
          ),
          body: [
            HIR_LET({
              name: 'a',
              type: HIR_VOID_TYPE,
              assignedExpression: HIR_INDEX_ACCESS({
                type: HIR_VOID_TYPE,
                expression: HIR_VARIABLE('_context', HIR_STRUCT_TYPE([HIR_VOID_TYPE])),
                index: 0,
              }),
            }),
            HIR_RETURN(IR_THIS),
          ],
        },
      ],
      statements: [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t1',
          type: HIR_STRUCT_TYPE([HIR_VOID_TYPE]),
          expressionList: [HIR_VARIABLE('a', HIR_VOID_TYPE)],
        }),
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t0',
          type: HIR_CLOSURE_TYPE,
          expressionList: [
            HIR_NAME(
              '_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0',
              HIR_FUNCTION_TYPE(
                [HIR_STRUCT_TYPE([HIR_VOID_TYPE]), HIR_VOID_TYPE],
                IR_DUMMY_IDENTIFIER_TYPE
              )
            ),
            HIR_VARIABLE('_t1', HIR_STRUCT_TYPE([HIR_VOID_TYPE])),
          ],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_CLOSURE_TYPE),
    }
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
    {
      syntheticFunctions: [
        {
          name: '_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0',
          parameters: ['_context', 'a'],
          hasReturn: true,
          type: HIR_FUNCTION_TYPE([HIR_STRUCT_TYPE([]), HIR_VOID_TYPE], IR_DUMMY_IDENTIFIER_TYPE),
          body: [HIR_RETURN(IR_THIS)],
        },
      ],
      statements: [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: '_t0',
          type: HIR_CLOSURE_TYPE,
          expressionList: [
            HIR_NAME(
              '_module__class_ENCODED_FUNCTION_NAME_function__SYNTHETIC_0',
              HIR_FUNCTION_TYPE([HIR_STRUCT_TYPE([]), HIR_VOID_TYPE], IR_DUMMY_IDENTIFIER_TYPE)
            ),
            HIR_ONE,
          ],
        }),
      ],
      expression: HIR_VARIABLE('_t0', HIR_CLOSURE_TYPE),
    }
  );
});

it('Panic lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
    {
      statements: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            '_builtin_throw',
            HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_VOID_TYPE)
          ),
          functionArguments: [IR_THIS],
          returnCollector: '_t0',
        }),
      ],
    }
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
    {
      statements: [
        HIR_IF_ELSE({
          booleanExpression: IR_THIS,
          s1: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME(
                '_builtin_throw',
                HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_VOID_TYPE)
              ),
              functionArguments: [IR_THIS],
              returnCollector: '_t0',
            }),
            HIR_LET({ name: '_t1', type: IR_DUMMY_IDENTIFIER_TYPE, assignedExpression: HIR_ZERO }),
          ],
          s2: [
            HIR_LET({ name: '_t1', type: IR_DUMMY_IDENTIFIER_TYPE, assignedExpression: IR_THIS }),
          ],
        }),
      ],
      expression: HIR_VARIABLE('_t1', IR_DUMMY_IDENTIFIER_TYPE),
    }
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
    {
      statements: [
        HIR_LET({ name: '_t0', type: IR_DUMMY_IDENTIFIER_TYPE, assignedExpression: IR_THIS }),
        HIR_LET({
          name: '_t1',
          type: HIR_INT_TYPE,
          assignedExpression: HIR_INDEX_ACCESS({
            type: HIR_INT_TYPE,
            expression: HIR_VARIABLE('_t0', IR_DUMMY_IDENTIFIER_TYPE),
            index: 0,
          }),
        }),
        HIR_IF_ELSE({
          booleanExpression: HIR_BINARY({
            operator: '==',
            e1: HIR_VARIABLE('_t1', HIR_INT_TYPE),
            e2: HIR_ZERO,
          }),
          s1: [
            HIR_LET({
              name: 'bar',
              type: HIR_STRING_TYPE,
              assignedExpression: HIR_INDEX_ACCESS({
                type: HIR_ANY_TYPE,
                expression: HIR_VARIABLE('_t0', IR_DUMMY_IDENTIFIER_TYPE),
                index: 1,
              }),
            }),
            HIR_LET({
              name: '_t2',
              type: IR_DUMMY_IDENTIFIER_TYPE,
              assignedExpression: IR_THIS,
            }),
          ],
          s2: [
            HIR_IF_ELSE({
              booleanExpression: HIR_BINARY({
                operator: '==',
                e1: HIR_VARIABLE('_t1', HIR_INT_TYPE),
                e2: HIR_ONE,
              }),
              s1: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME(
                    '_builtin_throw',
                    HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_VOID_TYPE)
                  ),
                  functionArguments: [IR_THIS],
                  returnCollector: '_t3',
                }),
                HIR_LET({
                  name: '_t2',
                  type: IR_DUMMY_IDENTIFIER_TYPE,
                  assignedExpression: HIR_ZERO,
                }),
              ],
              s2: [],
            }),
          ],
        }),
      ],
      expression: HIR_VARIABLE('_t2', IR_DUMMY_IDENTIFIER_TYPE),
    }
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
    {
      statements: [
        HIR_LET({ name: '_t0', type: IR_DUMMY_IDENTIFIER_TYPE, assignedExpression: IR_THIS }),
        HIR_LET({
          name: 'a__depth_1__block_0',
          type: HIR_ANY_TYPE,
          assignedExpression: HIR_INDEX_ACCESS({
            type: HIR_ANY_TYPE,
            expression: HIR_VARIABLE('_t0', IR_DUMMY_IDENTIFIER_TYPE),
            index: 0,
          }),
        }),
        HIR_LET({ name: '_t1', type: IR_DUMMY_IDENTIFIER_TYPE, assignedExpression: IR_THIS }),
        HIR_LET({
          name: 'a__depth_1__block_0',
          type: HIR_ANY_TYPE,
          assignedExpression: HIR_INDEX_ACCESS({
            type: HIR_ANY_TYPE,
            expression: HIR_VARIABLE('_t1', IR_DUMMY_IDENTIFIER_TYPE),
            index: 0,
          }),
        }),
        HIR_LET({
          name: 'c__depth_1__block_0',
          type: HIR_ANY_TYPE,
          assignedExpression: HIR_INDEX_ACCESS({
            type: HIR_ANY_TYPE,
            expression: HIR_VARIABLE('_t1', IR_DUMMY_IDENTIFIER_TYPE),
            index: 1,
          }),
        }),
        HIR_LET({ name: '_t2', type: IR_DUMMY_IDENTIFIER_TYPE, assignedExpression: IR_THIS }),
        HIR_LET({
          name: 'a',
          type: HIR_VOID_TYPE,
          assignedExpression: HIR_VARIABLE('a__depth_1__block_0', HIR_VOID_TYPE),
        }),
      ],
    }
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
    {
      statements: [
        HIR_LET({ name: 'a__depth_1__block_0', type: HIR_INT_TYPE, assignedExpression: HIR_ONE }),
        HIR_LET({ name: 'a', type: HIR_VOID_TYPE, assignedExpression: HIR_ZERO }),
      ],
    }
  );
});
