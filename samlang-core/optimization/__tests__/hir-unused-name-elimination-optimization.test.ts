import { ENCODED_COMPILED_PROGRAM_MAIN } from "../../ast/common-names";
import {
  HIR_BINARY,
  HIR_BREAK,
  HIR_CLOSURE_INITIALIZATION,
  HIR_FUNCTION_CALL,
  HIR_FUNCTION_NAME,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_INT_TYPE,
  HIR_SINGLE_IF,
  HIR_STRING_NAME,
  HIR_STRUCT_INITIALIZATION,
  HIR_WHILE,
  HIR_ZERO,
} from "../../ast/hir-nodes";
import optimizeHighIRSourcesByEliminatingUnusedOnes from "../hir-unused-name-elimination-optimization";

describe("hir-unused-name-elimination-optimization", () => {
  it("optimizeHighIRSourcesByEliminatingUnusedOnes test", () => {
    const optimized = optimizeHighIRSourcesByEliminatingUnusedOnes({
      globalVariables: [
        { name: "bar", content: "fff" },
        { name: "fsdfsdf", content: "" },
      ],
      typeDefinitions: [
        {
          identifier: "Foo",
          type: "object",
          typeParameters: [],
          names: [],
          mappings: [HIR_INT_TYPE],
        },
        {
          identifier: "Baz",
          type: "object",
          typeParameters: [],
          names: [],
          mappings: [HIR_INT_TYPE],
        },
      ],
      closureTypes: [
        {
          identifier: "Bar",
          typeParameters: [],
          functionType: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        },
      ],
      mainFunctionNames: [ENCODED_COMPILED_PROGRAM_MAIN],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME("foo", HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: "foo",
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_STRUCT_INITIALIZATION({
              structVariableName: "",
              type: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS("Foo"),
              expressionList: [HIR_STRING_NAME("bar")],
            }),
            HIR_INDEX_ACCESS({
              name: "d",
              type: HIR_INT_TYPE,
              pointerExpression: HIR_STRING_NAME("bar"),
              index: 0,
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME("baz", HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [HIR_STRING_NAME("haha")],
              returnType: HIR_INT_TYPE,
            }),
            HIR_IF_ELSE({
              booleanExpression: HIR_ZERO,
              s1: [
                HIR_BINARY({
                  name: "",
                  operator: "+",
                  e1: HIR_STRING_NAME("foo"),
                  e2: HIR_STRING_NAME("bar"),
                }),
              ],
              s2: [
                HIR_BINARY({
                  name: "",
                  operator: "+",
                  e1: HIR_STRING_NAME("foo"),
                  e2: HIR_STRING_NAME("bar"),
                }),
              ],
              finalAssignments: [
                {
                  name: "fff",
                  type: HIR_INT_TYPE,
                  branch1Value: HIR_ZERO,
                  branch2Value: HIR_ZERO,
                },
              ],
            }),
            HIR_SINGLE_IF({
              booleanExpression: HIR_ZERO,
              invertCondition: false,
              statements: [HIR_BREAK(HIR_ZERO)],
            }),
            HIR_WHILE({
              loopVariables: [
                { name: "f", type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
              ],
              statements: [
                HIR_BINARY({
                  name: "",
                  operator: "+",
                  e1: HIR_STRING_NAME("foo"),
                  e2: HIR_STRING_NAME("bar"),
                }),
              ],
            }),
            HIR_WHILE({
              loopVariables: [
                { name: "f", type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
              ],
              statements: [],
              breakCollector: { name: "d", type: HIR_INT_TYPE },
            }),
          ],
          returnValue: HIR_STRING_NAME("bar"),
        },
        {
          name: "bar",
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_FUNCTION_NAME("foo", HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [],
              returnType: HIR_INT_TYPE,
            }),
            HIR_CLOSURE_INITIALIZATION({
              closureVariableName: "_",
              closureType: HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS(""),
              functionName: HIR_FUNCTION_NAME("", HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              context: HIR_ZERO,
            }),
          ],
          returnValue: HIR_ZERO,
        },
        {
          name: "baz",
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
          body: [],
          returnValue: HIR_ZERO,
        },
      ],
    });

    expect(optimized.globalVariables.map((it) => it.name)).toEqual(["bar"]);
    expect(optimized.typeDefinitions.map((it) => it.identifier)).toEqual(["Foo"]);
    expect(optimized.functions.map((it) => it.name).sort((a, b) => a.localeCompare(b))).toEqual([
      ENCODED_COMPILED_PROGRAM_MAIN,
      "bar",
      "baz",
      "foo",
    ]);
  });
});
