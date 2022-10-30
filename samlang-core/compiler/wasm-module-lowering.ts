import { ENCODED_FUNCTION_NAME_MALLOC } from "../ast/common-names";
import type {
  MidIRExpression,
  MidIRFunction,
  MidIRSources,
  MidIRStatement,
} from "../ast/mir-nodes";
import {
  WasmBinary,
  WasmConst,
  WasmDirectCall,
  WasmDrop,
  WasmFunctionTypeString,
  WasmIfElse,
  WasmIndirectCall,
  WasmJump,
  WasmLoad,
  WasmLocalGet,
  WasmLocalSet,
  WasmLoop,
  WasmStore,
  WebAssemblyFunction,
  WebAssemblyGlobalData,
  WebAssemblyInlineInstruction,
  WebAssemblyInstruction,
  WebAssemblyModule,
} from "../ast/wasm-nodes";
import { checkNotNull } from "../utils";

class WasmResourceAllocator {
  private nextLabelId = 0;

  allocateLabelWithAnnotation(annotation: string): string {
    const temp = this.nextLabelId;
    this.nextLabelId += 1;
    return `l${temp}_${annotation}`;
  }
}

type LoopContext = { readonly breakCollector?: string; readonly exitLabel: string };

class WasmFunctionLoweringManager {
  private readonly allocator = new WasmResourceAllocator();
  private currentLoopContext: LoopContext | null = null;
  private localVariables = new Set<string>();

  private constructor(
    private readonly globalVariablesToPointerMapping: ReadonlyMap<string, number>,
    private readonly functionIndexMapping: ReadonlyMap<string, number>,
  ) {}

  private GET(n: string): WebAssemblyInlineInstruction {
    this.localVariables.add(n);
    return WasmLocalGet(n);
  }

  private SET(n: string, v: WebAssemblyInlineInstruction): WebAssemblyInstruction {
    this.localVariables.add(n);
    return WasmLocalSet(n, v);
  }

  static lowerMidIRFunction(
    globalVariablesToPointerMapping: ReadonlyMap<string, number>,
    functionIndexMapping: ReadonlyMap<string, number>,
    midIRFunction: MidIRFunction,
  ): WebAssemblyFunction {
    const instance = new WasmFunctionLoweringManager(
      globalVariablesToPointerMapping,
      functionIndexMapping,
    );
    const instructions = midIRFunction.body.flatMap((it) => instance.lowerMidIRStatement(it));
    instructions.push(instance.lowerMidIRExpression(midIRFunction.returnValue));
    midIRFunction.parameters.forEach((it) => instance.localVariables.delete(it));
    return {
      name: midIRFunction.name,
      parameters: midIRFunction.parameters,
      localVariables: Array.from(instance.localVariables),
      instructions,
    };
  }

  private lowerMidIRStatement(s: MidIRStatement): WebAssemblyInstruction[] {
    switch (s.__type__) {
      case "MidIRIndexAccessStatement":
        return [
          this.SET(s.name, WasmLoad(this.lowerMidIRExpression(s.pointerExpression), s.index)),
        ];
      case "MidIRIndexAssignStatement":
        return [
          WasmStore(
            this.lowerMidIRExpression(s.pointerExpression),
            s.index,
            this.lowerMidIRExpression(s.assignedExpression),
          ),
        ];
      case "MidIRBinaryStatement":
        return [
          this.SET(
            s.name,
            WasmBinary(
              this.lowerMidIRExpression(s.e1),
              s.operator,
              this.lowerMidIRExpression(s.e2),
            ),
          ),
        ];
      case "MidIRFunctionCallStatement": {
        const argumentInstructions = s.functionArguments.map((it) => this.lowerMidIRExpression(it));
        const functionCall =
          s.functionExpression.__type__ === "MidIRNameExpression"
            ? WasmDirectCall(s.functionExpression.name, argumentInstructions)
            : WasmIndirectCall(
                this.lowerMidIRExpression(s.functionExpression),
                WasmFunctionTypeString(s.functionArguments.length),
                argumentInstructions,
              );
        return [
          s.returnCollector == null
            ? WasmDrop(functionCall)
            : this.SET(s.returnCollector, functionCall),
        ];
      }
      case "MidIRIfElseStatement": {
        const condition = this.lowerMidIRExpression(s.booleanExpression);
        const s1 = [
          ...s.s1.flatMap((it) => this.lowerMidIRStatement(it)),
          ...s.finalAssignments.map((it) =>
            this.SET(it.name, this.lowerMidIRExpression(it.branch1Value)),
          ),
        ];
        const s2 = [
          ...s.s2.flatMap((it) => this.lowerMidIRStatement(it)),
          ...s.finalAssignments.map((it) =>
            this.SET(it.name, this.lowerMidIRExpression(it.branch2Value)),
          ),
        ];
        if (s1.length === 0) {
          if (s2.length === 0) return [];
          return [WasmIfElse(WasmBinary(condition, "^", WasmConst(1)), s2, [])];
        }
        return [WasmIfElse(condition, s1, s2)];
      }
      case "MidIRSingleIfStatement": {
        let condition = this.lowerMidIRExpression(s.booleanExpression);
        if (s.invertCondition) {
          condition = WasmBinary(condition, "^", WasmConst(1));
        }
        return [
          WasmIfElse(
            condition,
            s.statements.flatMap((it) => this.lowerMidIRStatement(it)),
            [],
          ),
        ];
      }
      case "MidIRBreakStatement": {
        const { breakCollector, exitLabel } = checkNotNull(this.currentLoopContext);
        if (breakCollector == null) return [WasmJump(exitLabel)];
        return [
          this.SET(breakCollector, this.lowerMidIRExpression(s.breakValue)),
          WasmJump(exitLabel),
        ];
      }
      case "MidIRWhileStatement": {
        const savedCurrentLoopContext = this.currentLoopContext;
        const continueLabel = this.allocator.allocateLabelWithAnnotation("loop_continue");
        const exitLabel = this.allocator.allocateLabelWithAnnotation("loop_exit");
        this.currentLoopContext = { breakCollector: s.breakCollector?.name, exitLabel };
        const instructions = [
          ...s.loopVariables.map((it) =>
            this.SET(it.name, this.lowerMidIRExpression(it.initialValue)),
          ),
          WasmLoop({
            continueLabel,
            exitLabel,
            instructions: [
              ...s.statements.flatMap((it) => this.lowerMidIRStatement(it)),
              ...s.loopVariables.map((it) =>
                this.SET(it.name, this.lowerMidIRExpression(it.loopValue)),
              ),
              WasmJump(continueLabel),
            ],
          }),
        ];
        this.currentLoopContext = savedCurrentLoopContext;
        return instructions;
      }
      case "MidIRCastStatement":
        return [this.SET(s.name, this.lowerMidIRExpression(s.assignedExpression))];
      case "MidIRStructInitializationStatement": {
        const instructions: WebAssemblyInstruction[] = [
          this.SET(
            s.structVariableName,
            WasmDirectCall(ENCODED_FUNCTION_NAME_MALLOC, [WasmConst(s.expressionList.length * 4)]),
          ),
        ];
        s.expressionList.forEach((e, i) => {
          instructions.push(
            WasmStore(this.GET(s.structVariableName), i, this.lowerMidIRExpression(e)),
          );
        });
        return instructions;
      }
    }
  }

  private lowerMidIRExpression(e: MidIRExpression): WebAssemblyInlineInstruction {
    switch (e.__type__) {
      case "MidIRIntLiteralExpression":
        return WasmConst(e.value);
      case "MidIRNameExpression":
        return WasmConst(
          checkNotNull(
            (e.type.__type__ === "FunctionType"
              ? this.functionIndexMapping
              : this.globalVariablesToPointerMapping
            ).get(e.name),
          ),
        );
      case "MidIRVariableExpression":
        return this.GET(e.name);
    }
  }
}

export default function lowerMidIRSourcesToWasmModule(
  midIRSources: MidIRSources,
): WebAssemblyModule {
  let dataStart = 4096;
  const globalVariablesToPointerMapping = new Map<string, number>();
  const globalVariables = midIRSources.globalVariables.map(({ name, content }) => {
    const ints = Array.from(content).map((it) => it.charCodeAt(0));
    ints.unshift(0, content.length);
    const globalVariable: WebAssemblyGlobalData = { constantPointer: dataStart, ints };
    globalVariablesToPointerMapping.set(name, dataStart);
    dataStart += (content.length + 2) * 4;
    return globalVariable;
  });
  const functionIndexMapping = new Map(
    midIRSources.functions.map(({ name }, index) => [name, index]),
  );

  return {
    functionTypeParameterCounts: Array.from(
      new Set(midIRSources.functions.map((it) => it.parameters.length)),
    ),
    globalVariables,
    exportedFunctions: midIRSources.mainFunctionNames,
    functions: midIRSources.functions.map((it) =>
      WasmFunctionLoweringManager.lowerMidIRFunction(
        globalVariablesToPointerMapping,
        functionIndexMapping,
        it,
      ),
    ),
  };
}
