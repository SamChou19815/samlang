import {
  DummySourceReason,
  ModuleReference,
  ModuleReferenceCollections,
  Range,
} from '../../ast/common-nodes';
import { EQ, MINUS, MUL } from '../../ast/common-operators';
import { debugPrintHighIRSources } from '../../ast/hir-nodes';
import {
  SamlangModule,
  SourceBoolType,
  SourceExpressionBinary,
  SourceExpressionClassMember,
  SourceExpressionFunctionCall,
  SourceExpressionIfElse,
  SourceExpressionInt,
  SourceExpressionThis,
  SourceExpressionVariable,
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceTupleType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import compileSamlangSourcesToHighIRSources, {
  compileSamlangSourcesToHighIRSourcesWithGenericsPreserved,
} from '../hir-toplevel-lowering';

const THIS = SourceExpressionThis({
  type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Dummy'),
});

describe('mir-toplevel-lowering', () => {
  it('compileSamlangSourcesToHighIRSourcesWithGenericsPreserved integration test', () => {
    const sourceModule: SamlangModule = {
      imports: [],
      classes: [
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: SourceId('Main'),
          typeParameters: [],
          typeDefinition: { range: Range.DUMMY, type: 'object', names: [], mappings: {} },
          members: [
            {
              associatedComments: [],
              range: Range.DUMMY,
              isPublic: true,
              isMethod: false,
              name: SourceId('main'),
              typeParameters: [],
              parameters: [],
              type: SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason)),
              body: SourceExpressionFunctionCall({
                type: SourceUnitType(DummySourceReason),
                functionExpression: SourceExpressionClassMember({
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                  typeArguments: [],
                  moduleReference: ModuleReference.DUMMY,
                  className: SourceId('Class1'),
                  memberName: SourceId('infiniteLoop'),
                }),
                functionArguments: [],
              }),
            },
          ],
        },
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: SourceId('Class1'),
          typeParameters: [],
          typeDefinition: {
            range: Range.DUMMY,
            type: 'object',
            names: [SourceId('a')],
            mappings: { a: { isPublic: true, type: SourceIntType(DummySourceReason) } },
          },
          members: [
            {
              associatedComments: [],
              range: Range.DUMMY,
              isPublic: true,
              isMethod: true,
              name: SourceId('foo'),
              typeParameters: [],
              parameters: [
                {
                  name: 'a',
                  nameRange: Range.DUMMY,
                  type: SourceIntType(DummySourceReason),
                  typeRange: Range.DUMMY,
                },
              ],
              type: SourceFunctionType(
                DummySourceReason,
                [SourceIntType(DummySourceReason)],
                SourceIntType(DummySourceReason)
              ),
              body: THIS,
            },
            {
              associatedComments: [],
              range: Range.DUMMY,
              isPublic: true,
              isMethod: false,
              name: SourceId('infiniteLoop'),
              typeParameters: [],
              parameters: [],
              type: SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason)),
              body: SourceExpressionFunctionCall({
                type: SourceUnitType(DummySourceReason),
                functionExpression: SourceExpressionClassMember({
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                  typeArguments: [],
                  moduleReference: ModuleReference.DUMMY,
                  className: SourceId('Class1'),
                  memberName: SourceId('infiniteLoop'),
                }),
                functionArguments: [],
              }),
            },
            {
              associatedComments: [],
              range: Range.DUMMY,
              isPublic: true,
              isMethod: false,
              name: SourceId('factorial'),
              typeParameters: [],
              parameters: [
                {
                  name: 'n',
                  nameRange: Range.DUMMY,
                  type: SourceIntType(DummySourceReason),
                  typeRange: Range.DUMMY,
                },
                {
                  name: 'acc',
                  nameRange: Range.DUMMY,
                  type: SourceIntType(DummySourceReason),
                  typeRange: Range.DUMMY,
                },
              ],
              type: SourceFunctionType(
                DummySourceReason,
                [SourceIntType(DummySourceReason), SourceIntType(DummySourceReason)],
                SourceIntType(DummySourceReason)
              ),
              body: SourceExpressionIfElse({
                type: SourceIntType(DummySourceReason),
                boolExpression: SourceExpressionBinary({
                  type: SourceBoolType(DummySourceReason),
                  operatorPrecedingComments: [],
                  operator: EQ,
                  e1: SourceExpressionVariable({
                    type: SourceIntType(DummySourceReason),
                    name: 'n',
                  }),
                  e2: SourceExpressionInt(0),
                }),
                e1: SourceExpressionInt(1),
                e2: SourceExpressionFunctionCall({
                  type: SourceIntType(DummySourceReason),
                  functionExpression: SourceExpressionClassMember({
                    type: SourceFunctionType(
                      DummySourceReason,
                      [SourceIntType(DummySourceReason), SourceIntType(DummySourceReason)],
                      SourceIntType(DummySourceReason)
                    ),
                    typeArguments: [],
                    moduleReference: ModuleReference.DUMMY,
                    className: SourceId('Class1'),
                    memberName: SourceId('factorial'),
                  }),
                  functionArguments: [
                    SourceExpressionBinary({
                      type: SourceIntType(DummySourceReason),
                      operatorPrecedingComments: [],
                      operator: MINUS,
                      e1: SourceExpressionVariable({
                        type: SourceIntType(DummySourceReason),
                        name: 'n',
                      }),
                      e2: SourceExpressionInt(1),
                    }),
                    SourceExpressionBinary({
                      type: SourceIntType(DummySourceReason),
                      operatorPrecedingComments: [],
                      operator: MUL,
                      e1: SourceExpressionVariable({
                        type: SourceIntType(DummySourceReason),
                        name: 'n',
                      }),
                      e2: SourceExpressionVariable({
                        type: SourceIntType(DummySourceReason),
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
          name: SourceId('Class2'),
          typeParameters: [],
          typeDefinition: { range: Range.DUMMY, type: 'variant', names: [], mappings: {} },
          members: [],
        },
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: SourceId('Class3'),
          typeParameters: [SourceId('T')],
          typeDefinition: {
            range: Range.DUMMY,
            type: 'object',
            names: [SourceId('a')],
            mappings: {
              a: {
                isPublic: true,
                type: SourceFunctionType(
                  DummySourceReason,
                  [
                    SourceTupleType(DummySourceReason, [
                      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A', [
                        SourceIntType(DummySourceReason),
                      ]),
                      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'T'),
                    ]),
                  ],
                  SourceIntType(DummySourceReason)
                ),
              },
            },
          },
          members: [],
        },
      ],
      interfaces: [],
    };

    const sources = ModuleReferenceCollections.mapOf(
      [ModuleReference.DUMMY, sourceModule],
      [ModuleReference(['Foo']), { imports: [], classes: [], interfaces: [] }]
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
