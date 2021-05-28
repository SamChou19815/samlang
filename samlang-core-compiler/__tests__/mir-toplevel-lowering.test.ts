import compileSamlangSourcesToMidIRSources from '../mir-toplevel-lowering';

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
import { debugPrintMidIRModule } from 'samlang-core-ast/mir-toplevel';
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
  type: identifierType(ModuleReference.DUMMY, 'Dummy'),
  associatedComments: [],
});

it('compileSamlangSourcesToMidIRSources integration test', () => {
  const sourceModule: SamlangModule = {
    imports: [],
    classes: [
      {
        range: Range.DUMMY,
        associatedComments: [],
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
            associatedComments: [],
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
              associatedComments: [],
              functionExpression: EXPRESSION_CLASS_MEMBER({
                range: Range.DUMMY,
                type: functionType([], intType),
                associatedComments: [],
                typeArguments: [],
                moduleReference: ModuleReference.DUMMY,
                className: 'Class1',
                classNameRange: Range.DUMMY,
                memberPrecedingComments: [],
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
        associatedComments: [],
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
            associatedComments: [],
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
            associatedComments: [],
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
              associatedComments: [],
              functionExpression: EXPRESSION_CLASS_MEMBER({
                range: Range.DUMMY,
                type: functionType([], intType),
                associatedComments: [],
                typeArguments: [],
                moduleReference: ModuleReference.DUMMY,
                className: 'Class1',
                classNameRange: Range.DUMMY,
                memberPrecedingComments: [],
                memberName: 'infiniteLoop',
                memberNameRange: Range.DUMMY,
              }),
              functionArguments: [],
            }),
          },
          {
            associatedComments: [],
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
              associatedComments: [],
              boolExpression: EXPRESSION_BINARY({
                range: Range.DUMMY,
                type: boolType,
                associatedComments: [],
                operatorPrecedingComments: [],
                operator: EQ,
                e1: EXPRESSION_VARIABLE({
                  range: Range.DUMMY,
                  type: intType,
                  associatedComments: [],
                  name: 'n',
                }),
                e2: EXPRESSION_INT(Range.DUMMY, [], 0),
              }),
              e1: EXPRESSION_INT(Range.DUMMY, [], 1),
              e2: EXPRESSION_FUNCTION_CALL({
                range: Range.DUMMY,
                type: intType,
                associatedComments: [],
                functionExpression: EXPRESSION_CLASS_MEMBER({
                  range: Range.DUMMY,
                  type: functionType([intType, intType], intType),
                  associatedComments: [],
                  typeArguments: [],
                  moduleReference: ModuleReference.DUMMY,
                  className: 'Class1',
                  classNameRange: Range.DUMMY,
                  memberPrecedingComments: [],
                  memberName: 'factorial',
                  memberNameRange: Range.DUMMY,
                }),
                functionArguments: [
                  EXPRESSION_BINARY({
                    range: Range.DUMMY,
                    type: intType,
                    associatedComments: [],
                    operatorPrecedingComments: [],
                    operator: MINUS,
                    e1: EXPRESSION_VARIABLE({
                      range: Range.DUMMY,
                      type: intType,
                      associatedComments: [],
                      name: 'n',
                    }),
                    e2: EXPRESSION_INT(Range.DUMMY, [], 1),
                  }),
                  EXPRESSION_BINARY({
                    range: Range.DUMMY,
                    type: intType,
                    associatedComments: [],
                    operatorPrecedingComments: [],
                    operator: MUL,
                    e1: EXPRESSION_VARIABLE({
                      range: Range.DUMMY,
                      type: intType,
                      associatedComments: [],
                      name: 'n',
                    }),
                    e2: EXPRESSION_VARIABLE({
                      range: Range.DUMMY,
                      type: intType,
                      associatedComments: [],
                      name: 'acc',
                    }),
                  }),
                ],
              }),
            }),
          },
        ],
      },
      {
        range: Range.DUMMY,
        associatedComments: [],
        name: 'Class2',
        nameRange: Range.DUMMY,
        typeParameters: [],
        typeDefinition: { range: Range.DUMMY, type: 'variant', names: [], mappings: {} },
        members: [],
      },
      {
        range: Range.DUMMY,
        associatedComments: [],
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
                    identifierType(ModuleReference.DUMMY, 'A', [intType]),
                    identifierType(ModuleReference.DUMMY, 'T'),
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

  const actualCompiledModule = compileSamlangSourcesToMidIRSources(
    mapOf([ModuleReference.DUMMY, sourceModule]),
    {}
  ).forceGet(ModuleReference.DUMMY);

  expect(debugPrintMidIRModule(actualCompiledModule)).toEqual(
    `
function _compiled_program_main(): int {
  while (true) {
  }
  return 0;
}
`.trimLeft()
  );
});
