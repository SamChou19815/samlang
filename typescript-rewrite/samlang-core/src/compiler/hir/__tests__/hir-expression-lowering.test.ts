import { PLUS } from '../../../ast/common/binary-operators';
import Range from '../../../ast/common/range';
import {
  unitType,
  identifierType,
  tupleType,
  intType,
  functionType,
  stringType,
} from '../../../ast/common/types';
import {
  HIR_VARIABLE,
  HIR_FALSE,
  HIR_CLASS_MEMBER,
  HIR_STRUCT_CONSTRUCTOR,
  HIR_INT,
  HIR_INDEX_ACCESS,
  HIR_METHOD_ACCESS,
  HIR_UNARY,
  HIR_BUILTIN_FUNCTION_CALL,
  HIR_FUNCTION_CALL,
  HIR_METHOD_CALL,
  HIR_CLOSURE_CALL,
  HIR_BINARY,
  HIR_LAMBDA,
  HIR_THROW,
  HIR_MATCH,
  HIR_IF_ELSE,
  HIR_LET,
  HIR_EXPRESSION_AS_STATEMENT,
  HIR_RETURN,
} from '../../../ast/hir/hir-expressions';
import {
  SamlangExpression,
  EXPRESSION_FALSE,
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
} from '../../../ast/lang/samlang-expressions';
import lowerSamlangExpression from '../hir-expression-lowering';

const DUMMY_IDENTIFIER_TYPE = identifierType('Dummy');
const THIS = EXPRESSION_THIS({ range: Range.DUMMY, type: DUMMY_IDENTIFIER_TYPE });
const IR_THIS = HIR_VARIABLE('this');

const expectCorrectlyLowered = (
  samlangExpression: SamlangExpression,
  { statements = [], expression = HIR_FALSE }: Partial<ReturnType<typeof lowerSamlangExpression>>
): void => expect(lowerSamlangExpression(samlangExpression)).toEqual({ statements, expression });

it('Literal lowering works.', () => {
  expectCorrectlyLowered(EXPRESSION_FALSE(Range.DUMMY), { expression: HIR_FALSE });
});

it('This lowering works.', () => {
  expectCorrectlyLowered(THIS, { expression: IR_THIS });
});

it('Variable lowering works.', () => {
  expectCorrectlyLowered(EXPRESSION_VARIABLE({ range: Range.DUMMY, type: unitType, name: 'foo' }), {
    expression: HIR_VARIABLE('foo'),
  });
});

it('ClassMember lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_CLASS_MEMBER({
      range: Range.DUMMY,
      type: unitType,
      typeArguments: [],
      className: 'A',
      classNameRange: Range.DUMMY,
      memberName: 'b',
      memberNameRange: Range.DUMMY,
    }),
    { expression: HIR_CLASS_MEMBER({ className: 'A', memberName: 'b' }) }
  );
});

it('Lowering to StructConstructor works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_TUPLE_CONSTRUCTOR({ range: Range.DUMMY, type: tupleType([]), expressions: [THIS] }),
    { expression: HIR_STRUCT_CONSTRUCTOR([IR_THIS]) }
  );

  expectCorrectlyLowered(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType('Foo'),
      fieldDeclarations: [
        { range: Range.DUMMY, type: unitType, name: 'foo', expression: THIS },
        { range: Range.DUMMY, type: unitType, name: 'bar' },
      ],
    }),
    { expression: HIR_STRUCT_CONSTRUCTOR([IR_THIS, HIR_VARIABLE('bar')]) }
  );

  expectCorrectlyLowered(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType('Foo'),
      tag: 'Foo',
      tagOrder: 1,
      data: THIS,
    }),
    { expression: HIR_STRUCT_CONSTRUCTOR([HIR_INT(BigInt(1)), IR_THIS]) }
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
    { expression: HIR_INDEX_ACCESS({ expression: IR_THIS, index: 0 }) }
  );
});

it('MethodAccess lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: unitType,
      expression: THIS,
      methodName: 'foo',
    }),
    {
      expression: HIR_METHOD_ACCESS({
        expression: IR_THIS,
        className: DUMMY_IDENTIFIER_TYPE.identifier,
        methodName: 'foo',
      }),
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
      statements: [HIR_THROW(IR_THIS)],
      expression: HIR_UNARY({ operator: '!', expression: HIR_FALSE }),
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
      statements: [HIR_THROW(IR_THIS)],
      expression: HIR_UNARY({ operator: '-', expression: HIR_FALSE }),
    }
  );
});

it('FunctionCall family lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: stringType,
      functionName: 'intToString',
      argumentExpression: THIS,
    }),
    {
      expression: HIR_BUILTIN_FUNCTION_CALL({
        functionName: 'intToString',
        functionArgument: IR_THIS,
      }),
    }
  );
  expectCorrectlyLowered(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionName: 'stringToInt',
      argumentExpression: THIS,
    }),
    {
      expression: HIR_BUILTIN_FUNCTION_CALL({
        functionName: 'stringToInt',
        functionArgument: IR_THIS,
      }),
    }
  );
  expectCorrectlyLowered(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: unitType,
      functionName: 'println',
      argumentExpression: THIS,
    }),
    {
      statements: [
        HIR_EXPRESSION_AS_STATEMENT(
          HIR_BUILTIN_FUNCTION_CALL({
            functionName: 'println',
            functionArgument: IR_THIS,
          })
        ),
      ],
      expression: HIR_FALSE,
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionExpression: EXPRESSION_CLASS_MEMBER({
        range: Range.DUMMY,
        type: intType,
        typeArguments: [],
        className: 'Foo',
        classNameRange: Range.DUMMY,
        memberName: 'bar',
        memberNameRange: Range.DUMMY,
      }),
      functionArguments: [THIS, THIS],
    }),
    {
      expression: HIR_FUNCTION_CALL({
        className: 'Foo',
        functionName: 'bar',
        functionArguments: [IR_THIS, IR_THIS],
      }),
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionExpression: EXPRESSION_METHOD_ACCESS({
        range: Range.DUMMY,
        type: intType,
        expression: THIS,
        methodName: 'fooBar',
      }),
      functionArguments: [THIS, THIS],
    }),
    {
      expression: HIR_METHOD_CALL({
        objectExpression: IR_THIS,
        className: DUMMY_IDENTIFIER_TYPE.identifier,
        methodName: 'fooBar',
        methodArguments: [IR_THIS, IR_THIS],
      }),
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionExpression: THIS,
      functionArguments: [THIS, THIS],
    }),
    {
      expression: HIR_CLOSURE_CALL({
        functionExpression: IR_THIS,
        closureArguments: [IR_THIS, IR_THIS],
      }),
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: unitType,
      functionExpression: THIS,
      functionArguments: [THIS, THIS],
    }),
    {
      statements: [
        HIR_EXPRESSION_AS_STATEMENT(
          HIR_CLOSURE_CALL({
            functionExpression: IR_THIS,
            closureArguments: [IR_THIS, IR_THIS],
          })
        ),
      ],
      expression: HIR_FALSE,
    }
  );
});

it('Binary lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_BINARY({ range: Range.DUMMY, type: unitType, operator: PLUS, e1: THIS, e2: THIS }),
    { expression: HIR_BINARY({ operator: PLUS, e1: IR_THIS, e2: IR_THIS }) }
  );
});

it('Lambda lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], unitType),
      parameters: [['a', unitType]],
      captured: { a: unitType },
      body: THIS,
    }),
    {
      expression: HIR_LAMBDA({
        hasReturn: false,
        parameters: ['a'],
        captured: ['a'],
        body: [],
      }),
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], intType),
      parameters: [['a', unitType]],
      captured: { a: unitType },
      body: THIS,
    }),
    {
      expression: HIR_LAMBDA({
        hasReturn: true,
        parameters: ['a'],
        captured: ['a'],
        body: [HIR_RETURN(IR_THIS)],
      }),
    }
  );

  expectCorrectlyLowered(
    EXPRESSION_LAMBDA({
      range: Range.DUMMY,
      type: functionType([], DUMMY_IDENTIFIER_TYPE),
      parameters: [['a', unitType]],
      captured: { a: unitType },
      body: THIS,
    }),
    {
      expression: HIR_LAMBDA({
        hasReturn: true,
        parameters: ['a'],
        captured: ['a'],
        body: [HIR_RETURN(IR_THIS)],
      }),
    }
  );
});

it('Panic lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
    { statements: [HIR_THROW(IR_THIS)] }
  );
});

it('IfElse lowering works.', () => {
  expectCorrectlyLowered(
    EXPRESSION_IF_ELSE({
      range: Range.DUMMY,
      type: unitType,
      boolExpression: THIS,
      e1: EXPRESSION_PANIC({ range: Range.DUMMY, type: unitType, expression: THIS }),
      e2: THIS,
    }),
    {
      statements: [
        HIR_LET({ name: '_LOWERING_0', assignedExpression: HIR_FALSE }),
        HIR_IF_ELSE({
          booleanExpression: IR_THIS,
          s1: [HIR_THROW(IR_THIS), HIR_LET({ name: '_LOWERING_0', assignedExpression: HIR_FALSE })],
          s2: [HIR_LET({ name: '_LOWERING_0', assignedExpression: IR_THIS })],
        }),
      ],
      expression: HIR_VARIABLE('_LOWERING_0'),
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
        { range: Range.DUMMY, tag: 'Foo', tagOrder: 0, dataVariable: 'bar', expression: THIS },
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
        HIR_LET({ name: '_LOWERING_0', assignedExpression: IR_THIS }),
        HIR_MATCH({
          variableForMatchedExpression: '_LOWERING_0',
          assignedTemporaryVariable: '_LOWERING_1',
          matchingList: [
            { tagOrder: 0, dataVariable: 'bar', statements: [], finalExpression: IR_THIS },
            { tagOrder: 1, statements: [HIR_THROW(IR_THIS)], finalExpression: HIR_FALSE },
          ],
        }),
      ],
      expression: HIR_VARIABLE('_LOWERING_1'),
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
                    typeAnnotation: unitType,
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
                    typeAnnotation: unitType,
                    assignedExpression: THIS,
                  },
                  {
                    range: Range.DUMMY,
                    pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
                    typeAnnotation: unitType,
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
        HIR_LET({ name: '_LOWERING_0', assignedExpression: IR_THIS }),
        HIR_LET({
          name: 'a',
          assignedExpression: HIR_INDEX_ACCESS({
            expression: HIR_VARIABLE('_LOWERING_0'),
            index: 0,
          }),
        }),
        HIR_LET({ name: '_LOWERING_1', assignedExpression: IR_THIS }),
        HIR_LET({
          name: 'a',
          assignedExpression: HIR_INDEX_ACCESS({
            expression: HIR_VARIABLE('_LOWERING_1'),
            index: 0,
          }),
        }),
        HIR_LET({
          name: 'c',
          assignedExpression: HIR_INDEX_ACCESS({
            expression: HIR_VARIABLE('_LOWERING_1'),
            index: 1,
          }),
        }),
        HIR_EXPRESSION_AS_STATEMENT(IR_THIS),
        HIR_LET({ name: 'a', assignedExpression: HIR_VARIABLE('a') }),
      ],
    }
  );
});
