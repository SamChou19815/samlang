import { ENCODED_COMPILED_PROGRAM_MAIN } from 'samlang-core-ast/common-names';
import {
  HighIRSources,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_FUNCTION_TYPE,
  HIR_ZERO,
  HIR_TRUE,
  HIR_VARIABLE,
  HIR_NAME,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_STRUCT_INITIALIZATION,
  HIR_IF_ELSE,
  HIR_SINGLE_IF,
  HIR_BREAK,
  HIR_WHILE,
  HIR_INDEX_ACCESS,
  HIR_CLOSURE_INITIALIZATION,
} from 'samlang-core-ast/hir-nodes';
import { debugPrintMidIRSources } from 'samlang-core-ast/mir-nodes';

import lowerHighIRSourcesToMidIRSources from '../mir-sources-lowering';

type SimplifiedSources = Omit<HighIRSources, 'globalVariables' | 'mainFunctionNames'>;

const assertLowered = (sources: SimplifiedSources, expected: string) =>
  expect(
    debugPrintMidIRSources(
      lowerHighIRSourcesToMidIRSources({
        ...sources,
        globalVariables: [],
        mainFunctionNames: [ENCODED_COMPILED_PROGRAM_MAIN],
      })
    )
  ).toBe(expected);

describe('mir-sources-lowering', () => {
  it('lowerHighIRSourcesToMidIRSources smoke test', () => {
    assertLowered({ closureTypes: [], typeDefinitions: [], functions: [] }, '');
  });

  const commonComprehensiveSources = ((): SimplifiedSources => {
    const closureType = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('CC');
    const objType = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Object');
    const variantType = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Variant');
    return {
      closureTypes: [
        {
          identifier: 'CC',
          typeParameters: [],
          functionType: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
        },
      ],
      typeDefinitions: [
        {
          identifier: 'Object',
          type: 'object',
          typeParameters: [],
          mappings: [HIR_INT_TYPE, HIR_INT_TYPE],
        },
        {
          identifier: 'Variant',
          type: 'variant',
          typeParameters: [],
          mappings: [HIR_INT_TYPE, HIR_INT_TYPE],
        },
        {
          identifier: 'Object2',
          type: 'object',
          typeParameters: [],
          mappings: [HIR_STRING_TYPE, HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Foo')],
        },
        {
          identifier: 'Variant2',
          type: 'variant',
          typeParameters: [],
          mappings: [HIR_STRING_TYPE],
        },
        {
          identifier: 'Variant3',
          type: 'variant',
          typeParameters: [],
          mappings: [HIR_STRING_TYPE, HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Foo')],
        },
      ],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_IF_ELSE({
              booleanExpression: HIR_TRUE,
              s1: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME('main', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                  functionArguments: [HIR_ZERO],
                  returnType: HIR_INT_TYPE,
                }),
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_VARIABLE('cc', closureType),
                  functionArguments: [HIR_ZERO],
                  returnType: HIR_INT_TYPE,
                }),
                HIR_INDEX_ACCESS({
                  name: 'v1',
                  type: HIR_INT_TYPE,
                  index: 0,
                  pointerExpression: HIR_VARIABLE('a', objType),
                }),
                HIR_INDEX_ACCESS({
                  name: 'v2',
                  type: HIR_INT_TYPE,
                  index: 0,
                  pointerExpression: HIR_VARIABLE('b', variantType),
                }),
                HIR_INDEX_ACCESS({
                  name: 'v3',
                  type: HIR_INT_TYPE,
                  index: 1,
                  pointerExpression: HIR_VARIABLE('b', variantType),
                }),
                HIR_INDEX_ACCESS({
                  name: 'v4',
                  type: HIR_STRING_TYPE,
                  index: 1,
                  pointerExpression: HIR_VARIABLE('b', variantType),
                }),
                HIR_WHILE({
                  loopVariables: [],
                  statements: [
                    HIR_SINGLE_IF({
                      booleanExpression: HIR_ZERO,
                      invertCondition: false,
                      statements: [],
                    }),
                  ],
                }),
                HIR_WHILE({
                  loopVariables: [
                    { name: '_', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
                  ],
                  statements: [
                    HIR_SINGLE_IF({
                      booleanExpression: HIR_ZERO,
                      invertCondition: true,
                      statements: [HIR_BREAK(HIR_ZERO)],
                    }),
                  ],
                  breakCollector: { name: '_', type: HIR_INT_TYPE },
                }),
              ],
              s2: [
                HIR_BINARY({ name: 'v1', operator: '+', e1: HIR_ZERO, e2: HIR_ZERO }),
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: 'O',
                  type: objType,
                  expressionList: [
                    HIR_ZERO,
                    HIR_VARIABLE('obj', HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Obj')),
                  ],
                }),
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: 'v1',
                  type: variantType,
                  expressionList: [HIR_ZERO, HIR_ZERO],
                }),
                HIR_STRUCT_INITIALIZATION({
                  structVariableName: 'v2',
                  type: variantType,
                  expressionList: [HIR_ZERO, HIR_NAME('G1', HIR_STRING_TYPE)],
                }),
                HIR_CLOSURE_INITIALIZATION({
                  closureVariableName: 'c1',
                  closureType,
                  functionName: 'aaa',
                  functionType: HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_INT_TYPE),
                  context: HIR_NAME('G1', HIR_STRING_TYPE),
                }),
                HIR_CLOSURE_INITIALIZATION({
                  closureVariableName: 'c2',
                  closureType,
                  functionName: 'bbb',
                  functionType: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
                  context: HIR_ZERO,
                }),
              ],
              finalAssignments: [
                {
                  name: 'finalV',
                  type: HIR_INT_TYPE,
                  branch1Value: HIR_VARIABLE('v1', HIR_INT_TYPE),
                  branch2Value: HIR_VARIABLE('v2', HIR_INT_TYPE),
                },
              ],
            }),
          ],
          returnValue: HIR_ZERO,
        },
      ],
    };
  })();

  it('lowerHighIRSourcesToMidIRSources comprehensive test with reference counting', () => {
    assertLowered(
      commonComprehensiveSources,
      `type CC = (int, (any, int) -> int, any);

type Object = (int, int, int);

type Variant = (int, int, any);

type Object2 = (int, string, Foo);

type Variant2 = (int, int, any);

type Variant3 = (int, int, any);

function _compiled_program_main(): int {
  let finalV: int;
  if 1 {
    let _mid_t0: int = main(0);
    let _mid_t1: (any, int) -> int = (cc: CC)[1];
    let _mid_t2: any = (cc: CC)[2];
    let _mid_t3: int = (_mid_t1: (any, int) -> int)((_mid_t2: any), 0);
    let v1: int = (a: Object)[1];
    let v2: int = (b: Variant)[1];
    let _mid_t4: any = (b: Variant)[2];
    let v3: int = (_mid_t4: any);
    let v4: string = (b: Variant)[2];
    while (true) {
      if 0 {
      }
    }
    let _: int = 0;
    let _: int;
    while (true) {
      if !0 {
        _ = 0;
        break;
      }
      _ = 0;
    }
    finalV = (v1: int);
  } else {
    let v1: int = 0 + 0;
    (obj: Obj)[0] += 1;
    let O: Object = [1, 0, (obj: Obj)];
    let _mid_t5: any = 0;
    let v1: Variant = [1, 0, (_mid_t5: any)];
    let v2: Variant = [1, 0, G1];
    let c1: CC = [1, aaa, G1];
    let _mid_t6: (any) -> int = bbb;
    let _mid_t7: any = 0;
    let c2: CC = [1, (_mid_t6: (any) -> int), (_mid_t7: any)];
    finalV = (v2: int);
  }
  return 0;
}

function __decRef_Object(o: Object): int {
  (o: Object)[0] -= 1;
  let currentRefCount: int = (o: Object)[0];
  let dead: bool = (currentRefCount: int) <= 0;
  if (dead: bool) {
    let pointer_casted: any = (o: Object);
    __free((pointer_casted: any));
  }
  return 0;
}

function __decRef_Variant(o: Variant): int {
  (o: Variant)[0] -= 1;
  let currentRefCount: int = (o: Variant)[0];
  let dead: bool = (currentRefCount: int) <= 0;
  if (dead: bool) {
    let pointer_casted: any = (o: Variant);
    __free((pointer_casted: any));
  }
  return 0;
}

function __decRef_Object2(o: Object2): int {
  (o: Object2)[0] -= 1;
  let currentRefCount: int = (o: Object2)[0];
  let dead: bool = (currentRefCount: int) <= 0;
  if (dead: bool) {
    let pointer_casted: any = (o: Object2);
    __free((pointer_casted: any));
    let v1: Foo = (o: Object2)[2];
    __decRef_Foo((v1: Foo));
  }
  return 0;
}

function __decRef_Variant2(o: Variant2): int {
  (o: Variant2)[0] -= 1;
  let currentRefCount: int = (o: Variant2)[0];
  let dead: bool = (currentRefCount: int) <= 0;
  if (dead: bool) {
    let pointer_casted: any = (o: Variant2);
    __free((pointer_casted: any));
  }
  return 0;
}

function __decRef_Variant3(o: Variant3): int {
  (o: Variant3)[0] -= 1;
  let currentRefCount: int = (o: Variant3)[0];
  let dead: bool = (currentRefCount: int) <= 0;
  if (dead: bool) {
    let pointer_casted: any = (o: Variant3);
    __free((pointer_casted: any));
    let tag: int = (o: Variant3)[1];
    let tagComparison1: bool = (tag: int) == 2;
    if (tagComparison1: bool) {
      let _mid_t8: any = (o: Variant3)[2];
      let v1: Foo = (_mid_t8: any);
      __decRef_Foo((v1: Foo));
    }
  }
  return 0;
}
`
    );
  });
});
