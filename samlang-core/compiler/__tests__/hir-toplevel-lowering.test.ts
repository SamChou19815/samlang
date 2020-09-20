import compileSamlangSourcesToHighIRSources from '../hir-toplevel-lowering';

import {
  boolType,
  intType,
  identifierType,
  functionType,
  unitType,
  Range,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';
import { MUL, MINUS, EQ } from 'samlang-core-ast/common-operators';
import {
  HIR_VARIABLE,
  HIR_WHILE_TRUE,
  HIR_FUNCTION_CALL,
  HIR_NAME,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import {
  EXPRESSION_INT,
  EXPRESSION_VARIABLE,
  EXPRESSION_THIS,
  EXPRESSION_FUNCTION_CALL,
  EXPRESSION_BINARY,
  EXPRESSION_IF_ELSE,
  EXPRESSION_CLASS_MEMBER,
} from 'samlang-core-ast/samlang-expressions';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import { mapOf } from 'samlang-core-utils';

const THIS = EXPRESSION_THIS({ range: Range.DUMMY, type: identifierType('Dummy') });

it('compileSamlangSourcesToHighIRSources integration test', () => {
  const sourceModule: SamlangModule = {
    imports: [],
    classes: [
      {
        range: Range.DUMMY,
        name: 'Main',
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
            isMethod: false,
            nameRange: Range.DUMMY,
            name: 'main',
            typeParameters: [],
            parameters: [],
            type: functionType([], unitType),
            body: EXPRESSION_FUNCTION_CALL({
              range: Range.DUMMY,
              type: unitType,
              functionExpression: EXPRESSION_CLASS_MEMBER({
                range: Range.DUMMY,
                type: functionType([], intType),
                typeArguments: [],
                className: 'Class1',
                classNameRange: Range.DUMMY,
                memberName: 'infiniteLoop',
                memberNameRange: Range.DUMMY,
              }),
              functionArguments: [],
            }),
          },
        ],
      },
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
            name: 'infiniteLoop',
            typeParameters: [],
            parameters: [],
            type: functionType([], unitType),
            body: EXPRESSION_FUNCTION_CALL({
              range: Range.DUMMY,
              type: unitType,
              functionExpression: EXPRESSION_CLASS_MEMBER({
                range: Range.DUMMY,
                type: functionType([], intType),
                typeArguments: [],
                className: 'Class1',
                classNameRange: Range.DUMMY,
                memberName: 'infiniteLoop',
                memberNameRange: Range.DUMMY,
              }),
              functionArguments: [],
            }),
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
        name: '_module__class_Main_function_main',
        parameters: [],
        hasReturn: false,
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_module__class_Class1_function_infiniteLoop'),
            functionArguments: [],
            returnCollector: '_t0',
          }),
        ],
      },
      {
        name: '_module__class_Class1_function_infiniteLoop',
        parameters: [],
        hasReturn: false,
        body: [HIR_WHILE_TRUE([])],
      },
      {
        name: '_compiled_program_main',
        parameters: [],
        hasReturn: false,
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_module__class_Main_function_main'),
            functionArguments: [],
          }),
        ],
      },
    ],
  };

  const actualCompiledModule = compileSamlangSourcesToHighIRSources(
    mapOf([ModuleReference.ROOT, sourceModule])
  ).get(ModuleReference.ROOT);

  const serialize = (json: unknown): string =>
    JSON.stringify(json, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 4);

  expect(serialize(actualCompiledModule)).toEqual(serialize(expectedCompiledModule));
});
