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
import { debugPrintHighIRModule } from 'samlang-core-ast/hir-toplevel';
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
  precedingComments: [],
});

it('compileSamlangSourcesToHighIRSources integration test', () => {
  const sourceModule: SamlangModule = {
    imports: [],
    classes: [
      {
        range: Range.DUMMY,
        documentText: null,
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
            documentText: null,
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
              precedingComments: [],
              functionExpression: EXPRESSION_CLASS_MEMBER({
                range: Range.DUMMY,
                type: functionType([], intType),
                precedingComments: [],
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
        documentText: null,
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
            documentText: null,
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
            documentText: null,
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
              precedingComments: [],
              functionExpression: EXPRESSION_CLASS_MEMBER({
                range: Range.DUMMY,
                type: functionType([], intType),
                precedingComments: [],
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
            documentText: null,
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
              precedingComments: [],
              boolExpression: EXPRESSION_BINARY({
                range: Range.DUMMY,
                type: boolType,
                precedingComments: [],
                operator: EQ,
                e1: EXPRESSION_VARIABLE({
                  range: Range.DUMMY,
                  type: intType,
                  precedingComments: [],
                  name: 'n',
                }),
                e2: EXPRESSION_INT(Range.DUMMY, [], 0),
              }),
              e1: EXPRESSION_INT(Range.DUMMY, [], 1),
              e2: EXPRESSION_FUNCTION_CALL({
                range: Range.DUMMY,
                type: intType,
                precedingComments: [],
                functionExpression: EXPRESSION_CLASS_MEMBER({
                  range: Range.DUMMY,
                  type: functionType([intType, intType], intType),
                  precedingComments: [],
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
                    precedingComments: [],
                    operator: MINUS,
                    e1: EXPRESSION_VARIABLE({
                      range: Range.DUMMY,
                      type: intType,
                      precedingComments: [],
                      name: 'n',
                    }),
                    e2: EXPRESSION_INT(Range.DUMMY, [], 1),
                  }),
                  EXPRESSION_BINARY({
                    range: Range.DUMMY,
                    type: intType,
                    precedingComments: [],
                    operator: MUL,
                    e1: EXPRESSION_VARIABLE({
                      range: Range.DUMMY,
                      type: intType,
                      precedingComments: [],
                      name: 'n',
                    }),
                    e2: EXPRESSION_VARIABLE({
                      range: Range.DUMMY,
                      type: intType,
                      precedingComments: [],
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
        documentText: null,
        name: 'Class2',
        nameRange: Range.DUMMY,
        typeParameters: [],
        typeDefinition: { range: Range.DUMMY, type: 'variant', names: [], mappings: {} },
        members: [],
      },
      {
        range: Range.DUMMY,
        documentText: null,
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

  const actualCompiledModule = compileSamlangSourcesToHighIRSources(
    mapOf([ModuleReference.ROOT, sourceModule])
  ).forceGet(ModuleReference.ROOT);

  expect(debugPrintHighIRModule(actualCompiledModule)).toEqual(
    `
function _compiled_program_main(): int {
  while (true) {
  }
  return 0;
}
`.trimLeft()
  );
});
