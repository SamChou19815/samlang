import {
  DummySourceReason,
  Location,
  ModuleReference,
  ModuleReferenceCollections,
  moduleReferenceToString,
} from '../../ast/common-nodes';
import { MUL } from '../../ast/common-operators';
import {
  SamlangExpression,
  SourceBoolType,
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
  SourceExpressionTrue,
  SourceExpressionUnary,
  SourceExpressionVariable,
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceUnitType,
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

const TRUE = SourceExpressionTrue();
const intOf = (n: number) => SourceExpressionInt(n);

describe('module-references-collector', () => {
  it('collectModuleReferenceFromExpression works 1/n', () => {
    assertFoundAllModuleReferencesFromExpression(TRUE, []);
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionVariable({ type: SourceUnitType(DummySourceReason), name: 'v' }),
      [],
    );
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionThis({ type: SourceUnitType(DummySourceReason) }),
      [],
    );
  });

  it('collectModuleReferenceFromExpression works 2/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionClassMember({
        type: SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason)),
        typeArguments: [SourceBoolType(DummySourceReason)],
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
        type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo'),
        }),
        fieldName: SourceId('bar'),
        fieldOrder: 1,
      }),
      ['__DUMMY__'],
    );

    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionMethodAccess({
        type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      ['__DUMMY__'],
    );

    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionUnary({
        type: SourceBoolType(DummySourceReason),
        operator: '!',
        expression: TRUE,
      }),
      [],
    );
  });

  it('collectModuleReferenceFromExpression works 4/n', () => {
    assertFoundAllModuleReferencesFromExpression(
      SourceExpressionBinary({
        type: SourceIntType(DummySourceReason),
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
        type: SourceIntType(DummySourceReason),
        matchedExpression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            location: Location.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: SourceIntType(DummySourceReason),
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
        type: SourceUnitType(DummySourceReason),
        block: {
          location: Location.DUMMY,
          statements: [
            {
              location: Location.DUMMY,
              pattern: { location: Location.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType(DummySourceReason),
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
        type: SourceIntType(DummySourceReason),
        block: {
          location: Location.DUMMY,
          statements: [
            {
              location: Location.DUMMY,
              pattern: { location: Location.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType(DummySourceReason),
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
        type: SourceBoolType(DummySourceReason),
        boolExpression: TRUE,
        e1: TRUE,
        e2: SourceExpressionFunctionCall({
          type: SourceBoolType(DummySourceReason),
          functionExpression: SourceExpressionLambda({
            type: SourceFunctionType(
              DummySourceReason,
              [SourceIntType(DummySourceReason)],
              SourceBoolType(DummySourceReason),
            ),
            parameters: [
              { name: SourceId('a'), typeAnnotation: null },
              { name: SourceId('b'), typeAnnotation: SourceIntType(DummySourceReason) },
            ],
            captured: { a: SourceIntType(DummySourceReason) },
            body: TRUE,
          }),
          functionArguments: [
            SourceExpressionVariable({ type: SourceIntType(DummySourceReason), name: 'v' }),
          ],
        }),
      }),
      [],
    );
  });
});
