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
import { assertNotNull, mapOf } from 'samlang-core-utils';

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

  const actualCompiledModule = compileSamlangSourcesToHighIRSources(
    mapOf([ModuleReference.ROOT, sourceModule])
  ).get(ModuleReference.ROOT);
  assertNotNull(actualCompiledModule);

  expect(debugPrintHighIRModule(actualCompiledModule)).toEqual(`type _Class1 = (int);

type _Class2 = (int, any);

type _Class3 = (((_A, any)) -> int);

function _module__class_Main_function_main(): void {
  let _t0: void = _module__class_Class1_function_infiniteLoop();
}

function _module__class_Class1_function_infiniteLoop(): void {
  // phi()
  while true {
  }
}

function _compiled_program_main(): void {
  _module__class_Main_function_main();
}
`);
});
