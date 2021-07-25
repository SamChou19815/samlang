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
import { debugPrintHighIRSources } from 'samlang-core-ast/hir-nodes';
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

import compileSamlangSourcesToHighIRSources, {
  compileSamlangSourcesToHighIRSourcesWithGenericsPreserved,
} from '../hir-toplevel-lowering';

const THIS = EXPRESSION_THIS({
  range: Range.DUMMY,
  type: identifierType(ModuleReference.DUMMY, 'Dummy'),
  associatedComments: [],
});

describe('mir-toplevel-lowering', () => {
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
          typeDefinition: { range: Range.DUMMY, type: 'object', names: [], mappings: {} },
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

    const sources = mapOf(
      [ModuleReference.DUMMY, sourceModule],
      [new ModuleReference(['Foo']), { imports: [], classes: [] }]
    );

    expect(
      debugPrintHighIRSources(compileSamlangSourcesToHighIRSourcesWithGenericsPreserved(sources))
    ).toBe(
      `closure type $SyntheticIDType1<T> = ($SyntheticIDType0<T>) -> int
object type __DUMMY___Main = []
object type __DUMMY___Class1 = [int]
variant type __DUMMY___Class2 = []
object type __DUMMY___Class3<T> = [$SyntheticIDType1<T>]
object type $SyntheticIDType0<T> = [__DUMMY___A<int>, T]
function ___DUMMY___Main_main_with_context(_context: int): int {
  let _ret: int = ___DUMMY___Main_main();
  return (_ret: int);
}

function ___DUMMY___Class1_infiniteLoop_with_context(_context: int): int {
  let _ret: int = ___DUMMY___Class1_infiniteLoop();
  return (_ret: int);
}

function ___DUMMY___Class1_factorial_with_context(_context: int, n: int, acc: int): int {
  let _ret: int = ___DUMMY___Class1_factorial((n: int), (acc: int));
  return (_ret: int);
}

function ___DUMMY___Main_main(): int {
  ___DUMMY___Class1_infiniteLoop();
  return 0;
}

function ___DUMMY___Class1_foo(_this: __DUMMY___Class1, a: int): int {
  return (_this: __DUMMY___Class1);
}

function ___DUMMY___Class1_infiniteLoop(): int {
  ___DUMMY___Class1_infiniteLoop();
  return 0;
}

function ___DUMMY___Class1_factorial(n: int, acc: int): int {
  let _t0: bool = (n: int) == 0;
  let _t4: int;
  if (_t0: bool) {
    _t4 = 1;
  } else {
    let _t2: int = (n: int) - 1;
    let _t3: int = (n: int) * (acc: int);
    let _t1: int = ___DUMMY___Class1_factorial((_t2: int), (_t3: int));
    _t4 = (_t1: int);
  }
  return (_t4: int);
}

sources.mains = [___DUMMY___Main_main]`
    );

    expect(`\n${debugPrintHighIRSources(compileSamlangSourcesToHighIRSources(sources))}`).toBe(`
function ___DUMMY___Class1_infiniteLoop(): int {
  ___DUMMY___Class1_infiniteLoop();
  return 0;
}

function ___DUMMY___Main_main(): int {
  ___DUMMY___Class1_infiniteLoop();
  return 0;
}

sources.mains = [___DUMMY___Main_main]`);
  });
});
