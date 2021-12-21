import {
  boolType,
  functionType,
  identifierType,
  intType,
  ModuleReference,
  Range,
  tupleType,
  unitType,
} from '../../ast/common-nodes';
import { EQ, MINUS, MUL } from '../../ast/common-operators';
import { debugPrintHighIRSources } from '../../ast/hir-nodes';
import {
  SamlangModule,
  SourceExpressionBinary,
  SourceExpressionClassMember,
  SourceExpressionFunctionCall,
  SourceExpressionIfElse,
  SourceExpressionInt,
  SourceExpressionThis,
  SourceExpressionVariable,
} from '../../ast/samlang-nodes';
import { mapOf } from '../../utils';
import compileSamlangSourcesToHighIRSources, {
  compileSamlangSourcesToHighIRSourcesWithGenericsPreserved,
} from '../hir-toplevel-lowering';

const THIS = SourceExpressionThis({ type: identifierType(ModuleReference.DUMMY, 'Dummy') });

describe('mir-toplevel-lowering', () => {
  it('compileSamlangSourcesToHighIRSourcesWithGenericsPreserved integration test', () => {
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
              body: SourceExpressionFunctionCall({
                type: unitType,
                functionExpression: SourceExpressionClassMember({
                  type: functionType([], intType),
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
              body: SourceExpressionFunctionCall({
                type: unitType,
                functionExpression: SourceExpressionClassMember({
                  type: functionType([], intType),
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
              body: SourceExpressionIfElse({
                type: intType,
                boolExpression: SourceExpressionBinary({
                  type: boolType,
                  operatorPrecedingComments: [],
                  operator: EQ,
                  e1: SourceExpressionVariable({ type: intType, name: 'n' }),
                  e2: SourceExpressionInt(0),
                }),
                e1: SourceExpressionInt(1),
                e2: SourceExpressionFunctionCall({
                  type: intType,
                  functionExpression: SourceExpressionClassMember({
                    type: functionType([intType, intType], intType),
                    typeArguments: [],
                    moduleReference: ModuleReference.DUMMY,
                    className: 'Class1',
                    classNameRange: Range.DUMMY,
                    memberPrecedingComments: [],
                    memberName: 'factorial',
                    memberNameRange: Range.DUMMY,
                  }),
                  functionArguments: [
                    SourceExpressionBinary({
                      type: intType,
                      operatorPrecedingComments: [],
                      operator: MINUS,
                      e1: SourceExpressionVariable({ type: intType, name: 'n' }),
                      e2: SourceExpressionInt(1),
                    }),
                    SourceExpressionBinary({
                      type: intType,
                      operatorPrecedingComments: [],
                      operator: MUL,
                      e1: SourceExpressionVariable({ type: intType, name: 'n' }),
                      e2: SourceExpressionVariable({ type: intType, name: 'acc' }),
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

function ___DUMMY___Main_init(): __DUMMY___Main {
  let _struct: __DUMMY___Main = [];
  return (_struct: __DUMMY___Main);
}

function ___DUMMY___Main_init_with_context(_context: int): __DUMMY___Main {
  let _ret: __DUMMY___Main = ___DUMMY___Main_init();
  return (_ret: __DUMMY___Main);
}

function ___DUMMY___Main_main(): int {
  ___DUMMY___Class1_infiniteLoop();
  return 0;
}

function ___DUMMY___Class1_init(_f0: int): __DUMMY___Class1 {
  let _struct: __DUMMY___Class1 = [(_f0: int)];
  return (_struct: __DUMMY___Class1);
}

function ___DUMMY___Class1_init_with_context(_context: int, _f0: int): __DUMMY___Class1 {
  let _ret: __DUMMY___Class1 = ___DUMMY___Class1_init((_f0: int));
  return (_ret: __DUMMY___Class1);
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
    let _t2: int = (n: int) + -1;
    let _t3: int = (n: int) * (acc: int);
    let _t1: int = ___DUMMY___Class1_factorial((_t2: int), (_t3: int));
    _t4 = (_t1: int);
  }
  return (_t4: int);
}

function ___DUMMY___Class3_init<T>(_f0: $SyntheticIDType1<T>): __DUMMY___Class3<T> {
  let _struct: __DUMMY___Class3<T> = [(_f0: $SyntheticIDType1<T>)];
  return (_struct: __DUMMY___Class3<T>);
}

function ___DUMMY___Class3_init_with_context<T>(_context: int, _f0: $SyntheticIDType1<T>): __DUMMY___Class3<T> {
  let _ret: __DUMMY___Class3<T> = ___DUMMY___Class3_init((_f0: $SyntheticIDType1<T>));
  return (_ret: __DUMMY___Class3<T>);
}

sources.mains = [___DUMMY___Main_main]`
    );

    expect(`\n${debugPrintHighIRSources(compileSamlangSourcesToHighIRSources(sources))}`).toBe(`
function ___DUMMY___Class1_infiniteLoop(): int {
  while (true) {
  }
  return 0;
}

function ___DUMMY___Main_main(): int {
  ___DUMMY___Class1_infiniteLoop();
  return 0;
}

sources.mains = [___DUMMY___Main_main]`);
  });
});
