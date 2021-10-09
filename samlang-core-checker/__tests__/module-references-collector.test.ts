import {
  unitType,
  boolType,
  intType,
  identifierType,
  tupleType,
  functionType,
  Range,
  ModuleReference,
} from 'samlang-core/ast/common-nodes';
import { MUL } from 'samlang-core/ast/common-operators';
import {
  SamlangExpression,
  SourceExpressionTrue,
  SourceExpressionInt,
  SourceExpressionThis,
  SourceExpressionVariable,
  SourceExpressionClassMember,
  SourceExpressionTupleConstructor,
  SourceExpressionObjectConstructor,
  SourceExpressionVariantConstructor,
  SourceExpressionFieldAccess,
  SourceExpressionMethodAccess,
  SourceExpressionUnary,
  SourceExpressionFunctionCall,
  SourceExpressionBinary,
  SourceExpressionIfElse,
  SourceExpressionMatch,
  SourceExpressionLambda,
  SourceExpressionStatementBlock,
} from 'samlang-core/ast/samlang-nodes';
import { hashSetOf } from 'samlang-core/utils';

import { collectModuleReferenceFromExpression } from '../module-references-collector';

function assertFoundAllModuleReferencesFromExpression(
  expression: SamlangExpression,
  expected: readonly string[]
): void {
  const collector = hashSetOf<ModuleReference>();
  collectModuleReferenceFromExpression(expression, collector);
  expect(
    collector
      .toArray()
      .map((it) => it.toString())
      .sort((a, b) => a.localeCompare(b))
  ).toEqual(expected);
}

const TRUE = SourceExpressionTrue();
const intOf = (n: number) => SourceExpressionInt(n);

describe('module-references-collector', () => {
  it('collectModuleReferenceFromExpression works 1/n', () => {
    assertFoundAllModuleReferencesFromExpression(TRUE, []);
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionVariable({ type: unitType, name: 'v' }),
      []
    );
    assertFoundAllModuleReferencesFromExpression(SourceExpressionThis({ type: unitType }), []);
  });

  it('collectModuleReferenceFromExpression works 2/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionClassMember({
        type: functionType([], unitType),
        typeArguments: [boolType],
        moduleReference: ModuleReference.DUMMY,
        className: 'Foo',
        classNameRange: Range.DUMMY,
        memberPrecedingComments: [],
        memberName: 'bar',
        memberNameRange: Range.DUMMY,
      }),
      ['__DUMMY__']
    );
  });

  it('collectModuleReferenceFromExpression works 3/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionTupleConstructor({
        type: tupleType([
          intType,
          identifierType(ModuleReference.DUMMY, 'f', [
            functionType([intType], tupleType([boolType])),
          ]),
        ]),
        expressions: [intOf(1), TRUE],
      }),
      ['__DUMMY__']
    );
  });

  it('collectModuleReferenceFromExpression works 4/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionObjectConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [intType, boolType]),
        fieldDeclarations: [
          {
            range: Range.DUMMY,
            associatedComments: [],
            name: 'a',
            nameRange: Range.DUMMY,
            type: intType,
          },
          {
            range: Range.DUMMY,
            associatedComments: [],
            name: 'b',
            nameRange: Range.DUMMY,
            type: boolType,
            expression: TRUE,
          },
        ],
      }),
      ['__DUMMY__']
    );
  });

  it('collectModuleReferenceFromExpression works 5/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionVariantConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [intType, boolType]),
        tag: 'Foo',
        tagOrder: 0,
        data: intOf(1),
      }),
      ['__DUMMY__']
    );
  });

  it('collectModuleReferenceFromExpression works 6/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionFieldAccess({
        type: functionType([], intType),
        expression: SourceExpressionThis({ type: identifierType(ModuleReference.DUMMY, 'Foo') }),
        fieldPrecedingComments: [],
        fieldName: 'bar',
        fieldOrder: 1,
      }),
      ['__DUMMY__']
    );

    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionMethodAccess({
        type: functionType([], intType),
        expression: SourceExpressionThis({ type: identifierType(ModuleReference.DUMMY, 'Foo') }),
        methodPrecedingComments: [],
        methodName: 'bar',
      }),
      ['__DUMMY__']
    );

    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionUnary({ type: boolType, operator: '!', expression: TRUE }),
      []
    );
  });

  it('collectModuleReferenceFromExpression works 8/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionBinary({
        type: intType,
        operatorPrecedingComments: [],
        operator: MUL,
        e1: intOf(1),
        e2: intOf(1),
      }),
      []
    );
  });

  it('collectModuleReferenceFromExpression works 9/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionMatch({
        type: intType,
        matchedExpression: SourceExpressionThis({
          type: identifierType(ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: 'A',
            tagOrder: 1,
            expression: SourceExpressionVariable({ type: intType, name: '' }),
          },
        ],
      }),
      ['__DUMMY__']
    );
  });

  it('collectModuleReferenceFromExpression works 10/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionStatementBlock({
        type: unitType,
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: intType,
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
        },
      }),
      []
    );

    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionStatementBlock({
        type: intType,
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: intType,
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
          expression: intOf(1),
        },
      }),
      []
    );
  });

  it('collectModuleReferenceFromExpression works 11/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionIfElse({
        type: boolType,
        boolExpression: TRUE,
        e1: TRUE,
        e2: SourceExpressionFunctionCall({
          type: boolType,
          functionExpression: SourceExpressionLambda({
            type: functionType([intType], boolType),
            parameters: [['a', Range.DUMMY, intType]],
            captured: { a: intType },
            body: TRUE,
          }),
          functionArguments: [SourceExpressionVariable({ type: intType, name: 'v' })],
        }),
      }),
      []
    );
  });
});
