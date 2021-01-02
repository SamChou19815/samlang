import compileSamlangSourcesToHighIRSources from '../hir-toplevel-lowering';

import {
  unitType,
  boolType,
  intType,
  identifierType,
  functionType,
  Range,
  ModuleReference,
  tupleType,
} from 'samlang-core-ast/common-nodes';
import { MUL, MINUS, EQ } from 'samlang-core-ast/common-operators';
import { HIR_WHILE_TRUE, HIR_FUNCTION_CALL, HIR_NAME } from 'samlang-core-ast/hir-expressions';
import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import {
  HIR_INT_TYPE,
  HIR_ANY_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_STRUCT_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_VOID_TYPE,
} from 'samlang-core-ast/hir-types';
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

const THIS = EXPRESSION_THIS({
  range: Range.DUMMY,
  type: identifierType(ModuleReference.ROOT, 'Dummy'),
});

it('compileSamlangSourcesToHighIRSources integration test', () => {
  const sourceModule: SamlangModule = {
    imports: [],
    classes: [
      {
        range: Range.DUMMY,
        name: 'Main',
        nameRange: Range.DUMMY,
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
                moduleReference: ModuleReference.ROOT,
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
        typeParameters: [],
        typeDefinition: {
          range: Range.DUMMY,
          type: 'object',
          names: ['a'],
          mappings: { a: { isPublic: true, type: intType } },
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
                moduleReference: ModuleReference.ROOT,
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
                e2: EXPRESSION_INT(Range.DUMMY, 0),
              }),
              e1: EXPRESSION_INT(Range.DUMMY, 1),
              e2: EXPRESSION_FUNCTION_CALL({
                range: Range.DUMMY,
                type: intType,
                functionExpression: EXPRESSION_CLASS_MEMBER({
                  range: Range.DUMMY,
                  type: functionType([intType, intType], intType),
                  typeArguments: [],
                  moduleReference: ModuleReference.ROOT,
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
                    e2: EXPRESSION_INT(Range.DUMMY, 1),
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
      {
        range: Range.DUMMY,
        name: 'Class2',
        nameRange: Range.DUMMY,
        typeParameters: [],
        typeDefinition: { range: Range.DUMMY, type: 'variant', names: [], mappings: {} },
        members: [],
      },
      {
        range: Range.DUMMY,
        name: 'Class3',
        nameRange: Range.DUMMY,
        typeParameters: ['T'],
        typeDefinition: {
          range: Range.DUMMY,
          type: 'object',
          names: ['a'],
          mappings: {
            a: {
              isPublic: true,
              type: functionType(
                [
                  tupleType([
                    identifierType(ModuleReference.ROOT, 'A', [intType]),
                    identifierType(ModuleReference.ROOT, 'T'),
                  ]),
                ],
                intType
              ),
            },
          },
        },
        members: [],
      },
    ],
  };

  const expectedCompiledModule: HighIRModule = {
    typeDefinitions: [
      {
        identifier: '_Class1',
        mappings: [HIR_INT_TYPE],
      },
      {
        identifier: '_Class2',
        mappings: [HIR_INT_TYPE, HIR_ANY_TYPE],
      },
      {
        identifier: '_Class3',
        mappings: [
          HIR_FUNCTION_TYPE(
            [HIR_STRUCT_TYPE([HIR_IDENTIFIER_TYPE('_A'), HIR_ANY_TYPE])],
            HIR_INT_TYPE
          ),
        ],
      },
    ],
    functions: [
      {
        name: '_module__class_Main_function_main',
        parameters: [],
        hasReturn: false,
        type: HIR_FUNCTION_TYPE([], HIR_VOID_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              '_module__class_Class1_function_infiniteLoop',
              HIR_FUNCTION_TYPE([], HIR_INT_TYPE)
            ),
            functionArguments: [],
            returnCollector: '_t0',
          }),
        ],
      },
      {
        name: '_module__class_Class1_function_infiniteLoop',
        parameters: [],
        hasReturn: false,
        type: HIR_FUNCTION_TYPE([], HIR_VOID_TYPE),
        body: [HIR_WHILE_TRUE([])],
      },
      {
        name: '_compiled_program_main',
        parameters: [],
        hasReturn: false,
        type: HIR_FUNCTION_TYPE([], HIR_VOID_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              '_module__class_Main_function_main',
              HIR_FUNCTION_TYPE([], HIR_VOID_TYPE)
            ),
            functionArguments: [],
          }),
        ],
      },
    ],
  };

  const actualCompiledModule = compileSamlangSourcesToHighIRSources(
    mapOf([ModuleReference.ROOT, sourceModule])
  ).get(ModuleReference.ROOT);

  expect(actualCompiledModule).toEqual(expectedCompiledModule);
});
