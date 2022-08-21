import {
  Location,
  ModuleReference,
  ModuleReferenceCollections,
  moduleReferenceToString,
} from '../../ast/common-nodes';
import { MUL } from '../../ast/common-operators';
import {
  AstBuilder,
  SamlangExpression,
  SourceExpressionBinary,
  SourceExpressionClassMember,
  SourceExpressionFieldAccess,
  SourceExpressionFunctionCall,
  SourceExpressionIfElse,
  SourceExpressionInt,
  SourceExpressionLambda,
  SourceExpressionMatch,
  SourceExpressionMethodAccess,
  SourceExpressionStatementBlock,
  SourceExpressionThis,
  SourceExpressionUnary,
  SourceExpressionVariable,
  SourceId,
} from '../../ast/samlang-nodes';
import { collectModuleReferenceFromExpression } from '../module-references-collector';

function assertFoundAllModuleReferencesFromExpression(
  expression: SamlangExpression,
  expected: readonly string[],
): void {
  const collector = ModuleReferenceCollections.hashSetOf();
  collectModuleReferenceFromExpression(expression, collector);
  expect(
    collector
      .toArray()
      .map(moduleReferenceToString)
      .sort((a, b) => a.localeCompare(b)),
  ).toEqual(expected);
}

const intOf = (n: number) => SourceExpressionInt(n);

describe('module-references-collector', () => {
  it('collectModuleReferenceFromExpression works 1/n', () => {
    assertFoundAllModuleReferencesFromExpression(AstBuilder.TRUE, []);
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionVariable({ type: AstBuilder.UnitType, name: 'v' }),
      [],
    );
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionThis({ type: AstBuilder.UnitType }),
      [],
    );
  });

  it('collectModuleReferenceFromExpression works 2/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionClassMember({
        type: AstBuilder.FunType([], AstBuilder.UnitType),
        typeArguments: [AstBuilder.BoolType],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Foo'),
        memberName: SourceId('bar'),
      }),
      ['__DUMMY__'],
    );
  });

  it('collectModuleReferenceFromExpression works 3/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionFieldAccess({
        type: AstBuilder.FunType([], AstBuilder.IntType),
        expression: SourceExpressionThis({
          type: AstBuilder.IdType('Foo'),
        }),
        fieldName: SourceId('bar'),
        fieldOrder: 1,
      }),
      ['__DUMMY__'],
    );

    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionMethodAccess({
        type: AstBuilder.FunType([], AstBuilder.IntType),
        expression: SourceExpressionThis({
          type: AstBuilder.IdType('Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      ['__DUMMY__'],
    );

    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionUnary({
        type: AstBuilder.BoolType,
        operator: '!',
        expression: AstBuilder.TRUE,
      }),
      [],
    );
  });

  it('collectModuleReferenceFromExpression works 4/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionBinary({
        type: AstBuilder.IntType,
        operatorPrecedingComments: [],
        operator: MUL,
        e1: intOf(1),
        e2: intOf(1),
      }),
      [],
    );
  });

  it('collectModuleReferenceFromExpression works 5/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionMatch({
        type: AstBuilder.IntType,
        matchedExpression: SourceExpressionThis({
          type: AstBuilder.IdType('A'),
        }),
        matchingList: [
          {
            location: Location.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: AstBuilder.IntType,
              name: '',
            }),
          },
        ],
      }),
      ['__DUMMY__'],
    );
  });

  it('collectModuleReferenceFromExpression works 6/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionStatementBlock({
        type: AstBuilder.UnitType,
        block: {
          location: Location.DUMMY,
          statements: [
            {
              location: Location.DUMMY,
              pattern: { location: Location.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: AstBuilder.IntType,
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
        },
      }),
      [],
    );

    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionStatementBlock({
        type: AstBuilder.IntType,
        block: {
          location: Location.DUMMY,
          statements: [
            {
              location: Location.DUMMY,
              pattern: { location: Location.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: AstBuilder.IntType,
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
          expression: intOf(1),
        },
      }),
      [],
    );
  });

  it('collectModuleReferenceFromExpression works 7/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionIfElse({
        type: AstBuilder.BoolType,
        boolExpression: AstBuilder.TRUE,
        e1: AstBuilder.TRUE,
        e2: SourceExpressionFunctionCall({
          type: AstBuilder.BoolType,
          functionExpression: SourceExpressionLambda({
            type: AstBuilder.FunType([AstBuilder.IntType], AstBuilder.BoolType),
            parameters: [
              { name: SourceId('a'), typeAnnotation: null },
              { name: SourceId('b'), typeAnnotation: AstBuilder.IntType },
            ],
            captured: new Map([['a', AstBuilder.IntType]]),
            body: AstBuilder.TRUE,
          }),
          functionArguments: [SourceExpressionVariable({ type: AstBuilder.IntType, name: 'v' })],
        }),
      }),
      [],
    );
  });
});
