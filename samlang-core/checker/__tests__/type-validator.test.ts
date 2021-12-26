import { ModuleReference, Range } from '../../ast/common-nodes';
import {
  SamlangIdentifierType,
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import {
  findInvalidTypeIdentifier_EXPOSED_FOR_TESTING,
  IdentifierTypeValidator,
  validateType,
} from '../type-validator';

const identifierTypeValidatorForTesting: IdentifierTypeValidator = {
  identifierTypeIsWellDefined: (
    _moduleReference: ModuleReference,
    name: string,
    typeArgumentLength: number
  ) => name === 'Good' && typeArgumentLength === 1,
};

const withEmbeddedType = (embeddedType: SamlangIdentifierType): string | null =>
  findInvalidTypeIdentifier_EXPOSED_FOR_TESTING(
    SourceFunctionType(
      [
        SourceTupleType([
          SourceIntType,
          SourceBoolType,
          SourceUnitType,
          SourceStringType,
          { type: 'UndecidedType', index: 0 },
        ]),
      ],
      SourceFunctionType([], SourceTupleType([SourceBoolType, embeddedType]))
    ),
    identifierTypeValidatorForTesting
  );

const expectToBeGood = (embeddedType: SamlangIdentifierType): void =>
  expect(withEmbeddedType(embeddedType)).toBeNull();

const expectToHaveBadIdentifier = (
  embeddedType: SamlangIdentifierType,
  badIdentifier: string
): void => expect(withEmbeddedType(embeddedType)).toBe(badIdentifier);

describe('type-invalidator', () => {
  it('good types are told to be good', () => {
    expectToBeGood(SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceUnitType]));
    expectToBeGood(SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceBoolType]));
    expectToBeGood(SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceIntType]));
    expectToBeGood(SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceStringType]));
  });

  it('bad types are told to be bad', () => {
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceUnitType, SourceUnitType]),
      'Good'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceBoolType, SourceUnitType]),
      'Good'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceIntType, SourceUnitType]),
      'Good'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceStringType, SourceUnitType]),
      'Good'
    );

    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Bad', [SourceUnitType, SourceUnitType]),
      'Bad'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Bad', [SourceBoolType, SourceUnitType]),
      'Bad'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Bad', [SourceIntType, SourceUnitType]),
      'Bad'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Bad', [SourceStringType, SourceUnitType]),
      'Bad'
    );

    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [
        SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceUnitType, SourceUnitType]),
      ]),
      'Good'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [
        SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceBoolType, SourceUnitType]),
      ]),
      'Good'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [
        SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceIntType, SourceUnitType]),
      ]),
      'Good'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [
        SourceIdentifierType(ModuleReference.DUMMY, 'Good', [SourceStringType, SourceUnitType]),
      ]),
      'Good'
    );

    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [
        SourceIdentifierType(ModuleReference.DUMMY, 'Bad', [SourceUnitType, SourceUnitType]),
      ]),
      'Bad'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [
        SourceIdentifierType(ModuleReference.DUMMY, 'Bad', [SourceBoolType, SourceUnitType]),
      ]),
      'Bad'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [
        SourceIdentifierType(ModuleReference.DUMMY, 'Bad', [SourceIntType, SourceUnitType]),
      ]),
      'Bad'
    );
    expectToHaveBadIdentifier(
      SourceIdentifierType(ModuleReference.DUMMY, 'Good', [
        SourceIdentifierType(ModuleReference.DUMMY, 'Bad', [SourceStringType, SourceUnitType]),
      ]),
      'Bad'
    );
  });

  it('validateType integration test', () => {
    const globalErrorCollector = createGlobalErrorCollector();
    const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(
      ModuleReference.DUMMY
    );

    expect(
      validateType(
        SourceIntType,
        identifierTypeValidatorForTesting,
        moduleErrorCollector,
        Range.DUMMY
      )
    ).toBe(true);
    expect(globalErrorCollector.getErrors()).toEqual([]);

    expect(
      validateType(
        SourceIdentifierType(ModuleReference.DUMMY, 'Good', [
          SourceIdentifierType(ModuleReference.DUMMY, 'Bad', [SourceBoolType, SourceUnitType]),
        ]),
        identifierTypeValidatorForTesting,
        moduleErrorCollector,
        Range.DUMMY
      )
    ).toBe(false);
    expect(globalErrorCollector.getErrors().length).toBe(1);
  });
});
