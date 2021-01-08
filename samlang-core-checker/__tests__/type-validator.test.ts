import {
  IdentifierTypeValidator,
  // eslint-disable-next-line camelcase
  findInvalidTypeIdentifier_EXPOSED_FOR_TESTING,
  validateType,
} from '../type-validator';

import {
  IdentifierType,
  unitType,
  boolType,
  intType,
  stringType,
  identifierType,
  tupleType,
  functionType,
  Range,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';
import { createGlobalErrorCollector } from 'samlang-core-errors';

const identifierTypeValidatorForTesting: IdentifierTypeValidator = {
  identifierTypeIsWellDefined: (
    _moduleReference: ModuleReference,
    name: string,
    typeArgumentLength: number
  ) => name === 'Good' && typeArgumentLength === 1,
};

const withEmbeddedType = (embeddedType: IdentifierType): string | null =>
  findInvalidTypeIdentifier_EXPOSED_FOR_TESTING(
    functionType(
      [tupleType([intType, boolType, unitType, stringType, { type: 'UndecidedType', index: 0 }])],
      functionType([], tupleType([boolType, embeddedType]))
    ),
    identifierTypeValidatorForTesting
  );

const expectToBeGood = (embeddedType: IdentifierType): void =>
  expect(withEmbeddedType(embeddedType)).toBeNull();

const expectToHaveBadIdentifier = (embeddedType: IdentifierType, badIdentifier: string): void =>
  expect(withEmbeddedType(embeddedType)).toBe(badIdentifier);

it('good types are told to be good', () => {
  expectToBeGood(identifierType(ModuleReference.ROOT, 'Good', [unitType]));
  expectToBeGood(identifierType(ModuleReference.ROOT, 'Good', [boolType]));
  expectToBeGood(identifierType(ModuleReference.ROOT, 'Good', [intType]));
  expectToBeGood(identifierType(ModuleReference.ROOT, 'Good', [stringType]));
});

it('bad types are told to be bad', () => {
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [unitType, unitType]),
    'Good'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [boolType, unitType]),
    'Good'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [intType, unitType]),
    'Good'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [stringType, unitType]),
    'Good'
  );

  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Bad', [unitType, unitType]),
    'Bad'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Bad', [boolType, unitType]),
    'Bad'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Bad', [intType, unitType]),
    'Bad'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Bad', [stringType, unitType]),
    'Bad'
  );

  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [
      identifierType(ModuleReference.ROOT, 'Good', [unitType, unitType]),
    ]),
    'Good'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [
      identifierType(ModuleReference.ROOT, 'Good', [boolType, unitType]),
    ]),
    'Good'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [
      identifierType(ModuleReference.ROOT, 'Good', [intType, unitType]),
    ]),
    'Good'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [
      identifierType(ModuleReference.ROOT, 'Good', [stringType, unitType]),
    ]),
    'Good'
  );

  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [
      identifierType(ModuleReference.ROOT, 'Bad', [unitType, unitType]),
    ]),
    'Bad'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [
      identifierType(ModuleReference.ROOT, 'Bad', [boolType, unitType]),
    ]),
    'Bad'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [
      identifierType(ModuleReference.ROOT, 'Bad', [intType, unitType]),
    ]),
    'Bad'
  );
  expectToHaveBadIdentifier(
    identifierType(ModuleReference.ROOT, 'Good', [
      identifierType(ModuleReference.ROOT, 'Bad', [stringType, unitType]),
    ]),
    'Bad'
  );
});

it('validateType integration test', () => {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.ROOT);

  expect(
    validateType(intType, identifierTypeValidatorForTesting, moduleErrorCollector, Range.DUMMY)
  ).toBe(true);
  expect(globalErrorCollector.getErrors()).toEqual([]);

  expect(
    validateType(
      identifierType(ModuleReference.ROOT, 'Good', [
        identifierType(ModuleReference.ROOT, 'Bad', [boolType, unitType]),
      ]),
      identifierTypeValidatorForTesting,
      moduleErrorCollector,
      Range.DUMMY
    )
  ).toBe(false);
  expect(globalErrorCollector.getErrors().length).toBe(1);
});
