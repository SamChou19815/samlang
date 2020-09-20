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
  identifierTypeIsWellDefined: (name: string, typeArgumentLength: number) =>
    name === 'Good' && typeArgumentLength === 1,
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
  expectToBeGood(identifierType('Good', [unitType]));
  expectToBeGood(identifierType('Good', [boolType]));
  expectToBeGood(identifierType('Good', [intType]));
  expectToBeGood(identifierType('Good', [stringType]));
});

it('bad types are told to be bad', () => {
  expectToHaveBadIdentifier(identifierType('Good', [unitType, unitType]), 'Good');
  expectToHaveBadIdentifier(identifierType('Good', [boolType, unitType]), 'Good');
  expectToHaveBadIdentifier(identifierType('Good', [intType, unitType]), 'Good');
  expectToHaveBadIdentifier(identifierType('Good', [stringType, unitType]), 'Good');

  expectToHaveBadIdentifier(identifierType('Bad', [unitType, unitType]), 'Bad');
  expectToHaveBadIdentifier(identifierType('Bad', [boolType, unitType]), 'Bad');
  expectToHaveBadIdentifier(identifierType('Bad', [intType, unitType]), 'Bad');
  expectToHaveBadIdentifier(identifierType('Bad', [stringType, unitType]), 'Bad');

  expectToHaveBadIdentifier(
    identifierType('Good', [identifierType('Good', [unitType, unitType])]),
    'Good'
  );
  expectToHaveBadIdentifier(
    identifierType('Good', [identifierType('Good', [boolType, unitType])]),
    'Good'
  );
  expectToHaveBadIdentifier(
    identifierType('Good', [identifierType('Good', [intType, unitType])]),
    'Good'
  );
  expectToHaveBadIdentifier(
    identifierType('Good', [identifierType('Good', [stringType, unitType])]),
    'Good'
  );

  expectToHaveBadIdentifier(
    identifierType('Good', [identifierType('Bad', [unitType, unitType])]),
    'Bad'
  );
  expectToHaveBadIdentifier(
    identifierType('Good', [identifierType('Bad', [boolType, unitType])]),
    'Bad'
  );
  expectToHaveBadIdentifier(
    identifierType('Good', [identifierType('Bad', [intType, unitType])]),
    'Bad'
  );
  expectToHaveBadIdentifier(
    identifierType('Good', [identifierType('Bad', [stringType, unitType])]),
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
      identifierType('Good', [identifierType('Bad', [boolType, unitType])]),
      identifierTypeValidatorForTesting,
      moduleErrorCollector,
      Range.DUMMY
    )
  ).toBe(false);
  expect(globalErrorCollector.getErrors().length).toBe(1);
});
