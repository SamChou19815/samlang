import {
  HighIRSources,
  debugPrintHighIRSources,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_FUNCTION_TYPE,
  HIR_ZERO,
  HIR_TRUE,
  HIR_INT,
  HIR_VARIABLE,
  HIR_NAME,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_STRUCT_INITIALIZATION,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_CLOSURE_INITIALIZATION,
} from 'samlang-core-ast/hir-nodes';

import performGenericsSpecializationOnHighIRSources from '../hir-generics-specialization';

const expectSpecialized = (sources: HighIRSources, expected: string) =>
  expect(debugPrintHighIRSources(performGenericsSpecializationOnHighIRSources(sources))).toBe(
    expected.trim()
  );

describe('hir-generics-specialization', () => {
  it('Empty source works.', () => {
    expectSpecialized(
      {
        globalVariables: [],
        closureTypes: [],
        typeDefinitions: [],
        mainFunctionNames: [],
        functions: [],
      },
      ''
    );
  });

  it('Dead code elimination real smoke test.', () => {
    const type = HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE);
    const returnValue = HIR_ZERO;
    expectSpecialized(
      {
        globalVariables: [],
        closureTypes: [],
        typeDefinitions: [],
        mainFunctionNames: ['main'],
        functions: [
          { name: 'main', parameters: [], typeParameters: [], type, body: [], returnValue },
          { name: 'main2', parameters: [], typeParameters: [], type, body: [], returnValue },
        ],
      },
      `
function main(): int {
  return 0;
}

sources.mains = [main]
`
    );
  });

  it('Calling builtin function is accepted.', () => {
    const type = HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE);
    const returnValue = HIR_ZERO;
    expectSpecialized(
      {
        globalVariables: [{ name: 'G1', content: '' }],
        closureTypes: [],
        typeDefinitions: [],
        mainFunctionNames: ['main'],
        functions: [
          {
            name: 'main',
            parameters: [],
            typeParameters: [],
            type,
            body: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME(
                  '__builtins_println',
                  HIR_FUNCTION_TYPE([HIR_STRING_TYPE], HIR_INT_TYPE)
                ),
                functionArguments: [HIR_NAME('G1', HIR_STRING_TYPE)],
                returnType: HIR_INT_TYPE,
              }),
            ],
            returnValue,
          },
        ],
      },
      `const G1 = '';

function main(): int {
  __builtins_println(G1);
  return 0;
}

sources.mains = [main]
`
    );
  });

  it('Generics specialization comprehensive test.', () => {
    const typeA = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A');
    const typeB = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B');
    const typeJ = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('J');
    const typeIA = HIR_IDENTIFIER_TYPE('I', [typeA, HIR_STRING_TYPE]);
    const typeIB = HIR_IDENTIFIER_TYPE('I', [HIR_INT_TYPE, typeB]);
    const typeI = HIR_IDENTIFIER_TYPE('I', [HIR_INT_TYPE, HIR_STRING_TYPE]);
    const G1 = HIR_NAME('G1', HIR_STRING_TYPE);
    expectSpecialized(
      {
        globalVariables: [
          { name: 'G1', content: '' },
          { name: 'G2', content: '' },
        ],
        closureTypes: [
          {
            identifier: 'CC',
            typeParameters: ['A', 'B'],
            functionType: HIR_FUNCTION_TYPE([typeA], typeB),
          },
        ],
        typeDefinitions: [
          {
            identifier: 'I',
            type: 'variant',
            typeParameters: ['A', 'B'],
            mappings: [
              HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'),
              HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B'),
            ],
          },
          { identifier: 'J', type: 'object', typeParameters: [], mappings: [HIR_INT_TYPE] },
        ],
        mainFunctionNames: ['main'],
        functions: [
          {
            name: 'creatorIA',
            parameters: ['a'],
            typeParameters: ['A'],
            type: HIR_FUNCTION_TYPE([typeA], typeIA),
            body: [
              HIR_STRUCT_INITIALIZATION({
                structVariableName: 'v',
                type: typeIA,
                expressionList: [HIR_INT(0), HIR_VARIABLE('a', typeA)],
              }),
            ],
            returnValue: HIR_VARIABLE('v', typeIA),
          },
          {
            name: 'creatorIB',
            parameters: ['b'],
            typeParameters: ['B'],
            type: HIR_FUNCTION_TYPE([typeB], typeIB),
            body: [
              HIR_STRUCT_INITIALIZATION({
                structVariableName: 'v',
                type: typeIB,
                expressionList: [HIR_INT(1), HIR_VARIABLE('b', typeB)],
              }),
            ],
            returnValue: HIR_VARIABLE('v', typeIB),
          },
          {
            name: 'main',
            parameters: [],
            typeParameters: [],
            type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
            body: [
              HIR_IF_ELSE({
                booleanExpression: HIR_TRUE,
                s1: [
                  HIR_FUNCTION_CALL({
                    functionExpression: HIR_NAME(
                      'creatorIA',
                      HIR_FUNCTION_TYPE([HIR_INT_TYPE], typeI)
                    ),
                    functionArguments: [HIR_ZERO],
                    returnType: typeI,
                    returnCollector: 'a',
                  }),
                  HIR_FUNCTION_CALL({
                    functionExpression: HIR_NAME(
                      'creatorIA',
                      HIR_FUNCTION_TYPE(
                        [HIR_STRING_TYPE],
                        HIR_IDENTIFIER_TYPE('I', [HIR_STRING_TYPE, HIR_STRING_TYPE])
                      )
                    ),
                    functionArguments: [G1],
                    returnType: typeI,
                    returnCollector: 'a2',
                  }),
                  HIR_FUNCTION_CALL({
                    functionExpression: HIR_NAME(
                      'creatorIB',
                      HIR_FUNCTION_TYPE([HIR_STRING_TYPE], typeI)
                    ),
                    functionArguments: [G1],
                    returnType: typeI,
                    returnCollector: 'b',
                  }),
                  HIR_INDEX_ACCESS({
                    name: 'v1',
                    type: HIR_INT_TYPE,
                    index: 0,
                    pointerExpression: HIR_VARIABLE('a', typeI),
                  }),
                ],
                s2: [
                  HIR_FUNCTION_CALL({
                    functionExpression: HIR_NAME('main', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
                    functionArguments: [],
                    returnType: HIR_INT_TYPE,
                  }),
                  HIR_BINARY({ name: 'v1', operator: '+', e1: HIR_ZERO, e2: HIR_ZERO }),
                  HIR_STRUCT_INITIALIZATION({
                    structVariableName: 'j',
                    type: typeJ,
                    expressionList: [HIR_INT(0)],
                  }),
                  HIR_INDEX_ACCESS({
                    name: 'v2',
                    type: HIR_INT_TYPE,
                    pointerExpression: HIR_VARIABLE('j', typeJ),
                    index: 0,
                  }),
                  HIR_CLOSURE_INITIALIZATION({
                    closureVariableName: 'c1',
                    closureType: HIR_IDENTIFIER_TYPE('CC', [HIR_STRING_TYPE, HIR_STRING_TYPE]),
                    functionName: 'creatorIA',
                    functionType: HIR_FUNCTION_TYPE(
                      [HIR_STRING_TYPE],
                      HIR_IDENTIFIER_TYPE('I', [HIR_STRING_TYPE, HIR_STRING_TYPE])
                    ),
                    context: G1,
                  }),
                  HIR_CLOSURE_INITIALIZATION({
                    closureVariableName: 'c2',
                    closureType: HIR_IDENTIFIER_TYPE('CC', [HIR_INT_TYPE, HIR_STRING_TYPE]),
                    functionName: 'creatorIA',
                    functionType: HIR_FUNCTION_TYPE(
                      [HIR_STRING_TYPE],
                      HIR_IDENTIFIER_TYPE('I', [HIR_STRING_TYPE, HIR_STRING_TYPE])
                    ),
                    context: G1,
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
      `
const G1 = '';

closure type CC_string_string = (string) -> string
closure type CC_int_string = (int) -> string
variant type I_int_string = [int, string]
variant type I_string_string = [string, string]
object type J = [int]
function creatorIA_int(a: int): I_int_string {
  let v: I_int_string = [0, (a: int)];
  return (v: I_int_string);
}

function creatorIA_string(a: string): I_string_string {
  let v: I_string_string = [0, (a: string)];
  return (v: I_string_string);
}

function creatorIB_string(b: string): I_int_string {
  let v: I_int_string = [1, (b: string)];
  return (v: I_int_string);
}

function main(): int {
  let finalV: int;
  if 1 {
    let a: I_int_string = creatorIA_int(0);
    let a2: I_int_string = creatorIA_string(G1);
    let b: I_int_string = creatorIB_string(G1);
    let v1: int = (a: I_int_string)[0];
    finalV = (v1: int);
  } else {
    main();
    let v1: int = 0 + 0;
    let j: J = [0];
    let v2: int = (j: J)[0];
    let c1: CC_string_string = Closure {
      fun: (creatorIA_string: (string) -> I_string_string),
      context: G1,
    };
    let c2: CC_int_string = Closure {
      fun: (creatorIA_string: (string) -> I_string_string),
      context: G1,
    };
    finalV = (v2: int);
  }
  return 0;
}

sources.mains = [main]
      `
    );
  });

  it('Generics specialization rewrite no-arg function/typedef test.', () => {
    const typeIConcrete = HIR_IDENTIFIER_TYPE('I', [HIR_INT_TYPE, HIR_INT_TYPE]);
    const typeJ = HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('J');
    expectSpecialized(
      {
        globalVariables: [],
        closureTypes: [],
        typeDefinitions: [
          {
            identifier: 'I',
            type: 'variant',
            typeParameters: ['A', 'B'],
            mappings: [
              HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('A'),
              HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS('B'),
            ],
          },
          { identifier: 'J', type: 'object', typeParameters: [], mappings: [typeIConcrete] },
        ],
        mainFunctionNames: ['main'],
        functions: [
          {
            name: 'creatorJ',
            parameters: [],
            typeParameters: [],
            type: HIR_FUNCTION_TYPE([], typeJ),
            body: [
              HIR_STRUCT_INITIALIZATION({
                structVariableName: 'v1',
                type: typeIConcrete,
                expressionList: [],
              }),
              HIR_STRUCT_INITIALIZATION({
                structVariableName: 'v2',
                type: typeJ,
                expressionList: [HIR_ZERO, HIR_ZERO],
              }),
            ],
            returnValue: HIR_VARIABLE('v2', typeJ),
          },
          {
            name: 'main',
            parameters: [],
            typeParameters: [],
            type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
            body: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('creatorJ', HIR_FUNCTION_TYPE([], typeJ)),
                functionArguments: [],
                returnType: typeJ,
              }),
            ],
            returnValue: HIR_ZERO,
          },
        ],
      },
      `object type J = [I_int_int]
variant type I_int_int = [int, int]
function creatorJ(): J {
  let v1: I_int_int = [];
  let v2: J = [0, 0];
  return (v2: J);
}

function main(): int {
  creatorJ();
  return 0;
}

sources.mains = [main]`
    );
  });
});
