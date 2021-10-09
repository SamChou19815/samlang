import {
  ENCODED_COMPILED_PROGRAM_MAIN,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_FREE,
} from '../../ast/common-names';
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
} from '../../ast/hir-nodes';
import { prettyPrintMidIRSourcesAsTSSources } from '../../ast/mir-nodes';
import lowerHighIRSourcesToMidIRSources from '../mir-sources-lowering';

type SimplifiedSources = Omit<HighIRSources, 'globalVariables' | 'mainFunctionNames'>;

const assertLowered = (sources: SimplifiedSources, expected: string) =>
  expect(
    prettyPrintMidIRSourcesAsTSSources(
      lowerHighIRSourcesToMidIRSources({
        ...sources,
        globalVariables: [],
        mainFunctionNames: [ENCODED_COMPILED_PROGRAM_MAIN],
      })
    )
  ).toBe(expected);

describe('mir-sources-lowering', () => {
  it('lowerHighIRSourcesToMidIRSources smoke test', () => {
    assertLowered(
      { closureTypes: [], typeDefinitions: [], functions: [] },
      `type Str = [number, string];
const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const ${ENCODED_FUNCTION_NAME_PRINTLN} = ([, line]: Str): number => { console.log(line); return 0; };
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = ([, v]: Str): number => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v: number): Str => [1, String(v)];
const ${ENCODED_FUNCTION_NAME_THROW} = ([, v]: Str): number => { throw Error(v); };
const ${ENCODED_FUNCTION_NAME_FREE} = (v: unknown): number => 0;
`
    );
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
          name: 'cc',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
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
              breakCollector: { name: '_', type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('_') },
            }),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: 'main',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
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
          returnValue: HIR_ZERO,
        },
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
                  functionExpression: HIR_NAME('cc', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                  functionArguments: [HIR_ZERO],
                  returnType: HIR_INT_TYPE,
                }),
              ],
              s2: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_VARIABLE('cc', closureType),
                  functionArguments: [HIR_ZERO],
                  returnType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('CC'),
                }),
                HIR_CLOSURE_INITIALIZATION({
                  closureVariableName: 'c3',
                  closureType,
                  functionName: 'aaa',
                  functionType: HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_INT_TYPE),
                  context: HIR_VARIABLE('G1', HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('CC')),
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
      `type Str = [number, string];
const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const ${ENCODED_FUNCTION_NAME_PRINTLN} = ([, line]: Str): number => { console.log(line); return 0; };
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = ([, v]: Str): number => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v: number): Str => [1, String(v)];
const ${ENCODED_FUNCTION_NAME_THROW} = ([, v]: Str): number => { throw Error(v); };
const ${ENCODED_FUNCTION_NAME_FREE} = (v: unknown): number => 0;
type CC = [number, (t0: any) => number, (t0: any, t1: number) => number, any];
type Object = [number, number, number];
type Variant = [number, number, any];
function cc(): number {
  let _mid_t0: (t0: any, t1: number) => number = cc[2];
  let _mid_t1: any = cc[3];
  _mid_t0(_mid_t1, 0);
  let v1: number = a[1];
  let v2: number = b[1];
  let _mid_t2: any = b[2];
  let v3 = _mid_t2 as number;
  let v4: Str = b[2];
  while (true) {
    if (0) {
    }
  }
  let _: number = 0;
  let _: _;
  while (true) {
    if (!0) {
      _ = 0;
      break;
    }
    _ = 0;
  }
  __decRef__(_);
  return 0;
}
function main(): number {
  let v1: number = 0 + 0;
  let _mid_t0: number = obj[0];
  let _mid_t1: number = _mid_t0 + 1;
  obj[0] = _mid_t1;
  let O: Object = [1, 0, obj];
  let _mid_t2 = 0 as any;
  let v1: Variant = [1, 0, _mid_t2];
  let _mid_t3: number = G1[0];
  let _mid_t5: boolean = _mid_t3 > 0;
  if (_mid_t5) {
    let _mid_t4: number = _mid_t3 + 1;
    G1[0] = _mid_t4;
  }
  let v2: Variant = [1, 0, G1];
  let _mid_t6: number = G1[0];
  let _mid_t8: boolean = _mid_t6 > 0;
  if (_mid_t8) {
    let _mid_t7: number = _mid_t6 + 1;
    G1[0] = _mid_t7;
  }
  let c1: CC = [1, __decRef_string, aaa, G1];
  let _mid_t9 = bbb as (t0: any) => number;
  let _mid_t10 = 0 as any;
  let c2: CC = [1, __decRef_nothing, _mid_t9, _mid_t10];
  __decRef_Object(O);
  __decRef_Variant(v1);
  __decRef_Variant(v2);
  __decRef_CC(c1);
  __decRef_CC(c2);
  return 0;
}
function _compiled_program_main(): number {
  let finalV: number;
  if (true) {
    main(0);
    cc(0);
    finalV = v1;
  } else {
    let _mid_t1: (t0: any, t1: number) => number = cc[2];
    let _mid_t2: any = cc[3];
    let _mid_t0: CC = _mid_t1(_mid_t2, 0);
    let _mid_t3: number = G1[0];
    let _mid_t4: number = _mid_t3 + 1;
    G1[0] = _mid_t4;
    let _mid_t5 = G1 as any;
    let _mid_t6 = __decRef_CC as (t0: any) => number;
    let c3: CC = [1, _mid_t6, aaa, _mid_t5];
    __decRef_CC(_mid_t0);
    __decRef_CC(c3);
    finalV = v2;
  }
  return 0;
}
function __decRef_Object(o: Object): number {
  let currentRefCount: number = o[0];
  let decrementedRefCount: number = currentRefCount + -1;
  o[0] = decrementedRefCount;
  let dead: boolean = currentRefCount <= 1;
  if (dead) {
    let pointer_casted = o as any;
    _builtin_free(pointer_casted);
  }
  return 0;
}
function __decRef_Variant(o: Variant): number {
  let currentRefCount: number = o[0];
  let decrementedRefCount: number = currentRefCount + -1;
  o[0] = decrementedRefCount;
  let dead: boolean = currentRefCount <= 1;
  if (dead) {
    let pointer_casted = o as any;
    _builtin_free(pointer_casted);
  }
  return 0;
}
function __decRef_CC(o: CC): number {
  let currentRefCount: number = o[0];
  let decrementedRefCount: number = currentRefCount + -1;
  o[0] = decrementedRefCount;
  let dead: boolean = currentRefCount <= 1;
  if (dead) {
    let destructor: (t0: any) => number = o[1];
    let context: any = o[3];
    destructor(context);
    let pointer_casted = o as any;
    _builtin_free(pointer_casted);
  }
  return 0;
}
function __decRef_string(o: Str): number {
  let currentRefCount: number = o[0];
  let performGC: boolean = currentRefCount > 0;
  if (performGC) {
    let decrementedRefCount: number = currentRefCount + -1;
    o[0] = decrementedRefCount;
    let dead: boolean = currentRefCount <= 1;
    if (dead) {
      _builtin_free(o);
    }
  }
  return 0;
}
function __decRef_nothing(o: any): number {
  return 0;
}
`
    );
  });
});
