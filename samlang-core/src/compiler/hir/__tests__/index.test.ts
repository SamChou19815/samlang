import compileSamlangSourcesToHighIRSources from '..';
import { MUL, MINUS, EQ } from '../../../ast/common/binary-operators';
import ModuleReference from '../../../ast/common/module-reference';
import Range from '../../../ast/common/range';
import { boolType, intType, identifierType, functionType } from '../../../ast/common/types';
import {
  HIR_VARIABLE,
  HIR_RETURN,
  HIR_IF_ELSE,
  HIR_BINARY,
  HIR_ZERO,
  HIR_LET,
  HIR_ONE,
  HIR_FUNCTION_CALL,
  HIR_NAME,
} from '../../../ast/hir/hir-expressions';
import type { HighIRModule } from '../../../ast/hir/hir-toplevel';
import {
  EXPRESSION_INT,
  EXPRESSION_VARIABLE,
  EXPRESSION_THIS,
  EXPRESSION_FUNCTION_CALL,
  EXPRESSION_BINARY,
  EXPRESSION_IF_ELSE,
  EXPRESSION_CLASS_MEMBER,
} from '../../../ast/lang/samlang-expressions';
import type { SamlangModule } from '../../../ast/lang/samlang-toplevel';
import { mapOf } from '../../../util/collections';

const THIS = EXPRESSION_THIS({ range: Range.DUMMY, type: identifierType('Dummy') });
const IR_THIS = HIR_VARIABLE('this');

it('HIR compiler integration test', () => {
  const sourceModule: SamlangModule = {
    imports: [],
    classes: [
      {
        range: Range.DUMMY,
        name: 'Class1',
        nameRange: Range.DUMMY,
        isPublic: false,
        typeParameters: [],
        typeDefinition: {
          range: Range.DUMMY,
          type: 'object',
          names: [],
          mappings: {},
        },
        members: [
          {
            range: Range.DUMMY,
            isPublic: true,
            isMethod: true,
            nameRange: Range.DUMMY,
            name: 'foo',
            typeParameters: [],
            parameters: [
              { name: 'a', nameRange: Range.DUMMY, type: intType, typeRange: Range.DUMMY },
            ],
            type: functionType([intType], intType),
            body: THIS,
          },
          {
            range: Range.DUMMY,
            isPublic: true,
            isMethod: false,
            nameRange: Range.DUMMY,
            name: 'factorial',
            typeParameters: [],
            parameters: [
              { name: 'n', nameRange: Range.DUMMY, type: intType, typeRange: Range.DUMMY },
              { name: 'acc', nameRange: Range.DUMMY, type: intType, typeRange: Range.DUMMY },
            ],
            type: functionType([intType, intType], intType),
            body: EXPRESSION_IF_ELSE({
              range: Range.DUMMY,
              type: intType,
              boolExpression: EXPRESSION_BINARY({
                range: Range.DUMMY,
                type: boolType,
                operator: EQ,
                e1: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: 'n' }),
                e2: EXPRESSION_INT(Range.DUMMY, BigInt(0)),
              }),
              e1: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
              e2: EXPRESSION_FUNCTION_CALL({
                range: Range.DUMMY,
                type: intType,
                functionExpression: EXPRESSION_CLASS_MEMBER({
                  range: Range.DUMMY,
                  type: functionType([intType, intType], intType),
                  typeArguments: [],
                  className: 'Class1',
                  classNameRange: Range.DUMMY,
                  memberName: 'factorial',
                  memberNameRange: Range.DUMMY,
                }),
                functionArguments: [
                  EXPRESSION_BINARY({
                    range: Range.DUMMY,
                    type: intType,
                    operator: MINUS,
                    e1: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: 'n' }),
                    e2: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
                  }),
                  EXPRESSION_BINARY({
                    range: Range.DUMMY,
                    type: intType,
                    operator: MUL,
                    e1: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: 'n' }),
                    e2: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: 'acc' }),
                  }),
                ],
              }),
            }),
          },
        ],
      },
    ],
  };

  const expectedCompiledModule: HighIRModule = {
    functions: [
      {
        name: '_module__class_Class1_function_foo',
        hasReturn: true,
        parameters: ['this', 'a'],
        body: [HIR_RETURN(IR_THIS)],
      },
      {
        name: '_module__class_Class1_function_factorial',
        hasReturn: true,
        parameters: ['n', 'acc'],
        body: [
          HIR_IF_ELSE({
            booleanExpression: HIR_BINARY({ operator: '==', e1: HIR_VARIABLE('n'), e2: HIR_ZERO }),
            s1: [HIR_LET({ name: '_t1', assignedExpression: HIR_ONE })],
            s2: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('_module__class_Class1_function_factorial'),
                functionArguments: [
                  HIR_BINARY({ operator: '-', e1: HIR_VARIABLE('n'), e2: HIR_ONE }),
                  HIR_BINARY({ operator: '*', e1: HIR_VARIABLE('n'), e2: HIR_VARIABLE('acc') }),
                ],
                returnCollector: '_t0',
              }),
              HIR_LET({ name: '_t1', assignedExpression: HIR_VARIABLE('_t0') }),
            ],
          }),
          HIR_RETURN(HIR_VARIABLE('_t1')),
        ],
      },
    ],
  };

  expect(
    compileSamlangSourcesToHighIRSources(mapOf([ModuleReference.ROOT, sourceModule])).get(
      ModuleReference.ROOT
    )
  ).toEqual(expectedCompiledModule);
});
