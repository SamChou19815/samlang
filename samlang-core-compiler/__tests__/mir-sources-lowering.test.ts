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
  HIR_INDEX_ACCESS,
  HIR_CLOSURE_INITIALIZATION,
} from 'samlang-core-ast/hir-nodes';
import { debugPrintMidIRSources } from 'samlang-core-ast/mir-nodes';

import lowerHighIRSourcesToMidIRSources from '../mir-sources-lowering';

const assertLowered = (
  sources: Omit<HighIRSources, 'globalVariables' | 'mainFunctionNames'>,
  expected: string
) =>
  expect(
    debugPrintMidIRSources(
      lowerHighIRSourcesToMidIRSources(
        { ...sources, globalVariables: [], mainFunctionNames: [ENCODED_COMPILED_PROGRAM_MAIN] },
        /* referenceCounting */ false
      )
    )
  ).toBe(expected);

describe('mir-sources-lowering', () => {
  it('lowerHighIRSourcesToMidIRSources smoke test', () => {
    assertLowered({ closureTypes: [], typeDefinitions: [], functions: [] }, '');
  });

  it('lowerHighIRSourcesToMidIRSources comprehensive test', () => {
    const closureType = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('CC');
    const objType = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Object');
    const variantType = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('Variant');
    assertLowered(
      {
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
                ],
                s2: [
                  HIR_BINARY({ name: 'v1', operator: '+', e1: HIR_ZERO, e2: HIR_ZERO }),
                  HIR_STRUCT_INITIALIZATION({
                    structVariableName: 'O',
                    type: objType,
                    expressionList: [HIR_ZERO],
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
      },
      `type CC = ((any, int) -> int, any);

type Object = (int, int);

type Variant = (int, any);

function _compiled_program_main(): int {
  let finalV: int;
  if 1 {
    main(0);
    let _mid_t0: (any, int) -> int = (cc: CC)[0];
    let _mid_t1: any = (cc: CC)[1];
    (_mid_t0: (any, int) -> int)((_mid_t1: any), 0);
    let v1: int = (a: Object)[0];
    let v2: int = (b: Variant)[0];
    let _mid_t2: any = (b: Variant)[1];
    let v3: int = (_mid_t2: any);
    let v4: string = (b: Variant)[1];
    finalV = (v1: int);
  } else {
    let v1: int = 0 + 0;
    let O: Object = [0];
    let _mid_t3: any = 0;
    let v1: Variant = [0, (_mid_t3: any)];
    let v2: Variant = [0, G1];
    let c1: CC = [aaa, G1];
    let _mid_t4: (any) -> int = bbb;
    let _mid_t5: any = 0;
    let c2: CC = [(_mid_t4: (any) -> int), (_mid_t5: any)];
    finalV = (v2: int);
  }
  return 0;
}
`
    );
  });
});
