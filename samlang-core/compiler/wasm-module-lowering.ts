import { ENCODED_FUNCTION_NAME_MALLOC } from '../ast/common-names';
import type {
  MidIRExpression,
  MidIRStatement,
  MidIRFunction,
  MidIRSources,
} from '../ast/mir-nodes';
import {
  WebAssemblyInlineInstruction,
  WebAssemblyInstruction,
  WebAssemblyFunction,
  WebAssemblyGlobalData,
  WebAssemblyModule,
  WasmConst,
  WasmDrop,
  WasmLocalGet,
  WasmLocalSet,
  WasmBinary,
  WasmLoad,
  WasmStore,
  WasmDirectCall,
  WasmIndirectCall,
  WasmIfElse,
  WasmJump,
  WasmLoop,
  WasmFunctionTypeString,
} from '../ast/wasm-nodes';
import { checkNotNull } from '../utils';

class WasmResourceAllocator {
  private nextTempId = 0;
  private nextLabelId = 0;

  allocateTemp(purpose: string): string {
    const tempID = this.nextTempId;
    this.nextTempId += 1;
    return `_temp_${tempID}_${purpose}`;
  }

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
    private readonly globalVariablesToPointerMapping: Readonly<Record<string, number>>,
    private readonly functionIndexMapping: Readonly<Record<string, number>>
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
    globalVariablesToPointerMapping: Readonly<Record<string, number>>,
    functionIndexMapping: Readonly<Record<string, number>>,
    midIRFunction: MidIRFunction
  ): WebAssemblyFunction {
    const instance = new WasmFunctionLoweringManager(
      globalVariablesToPointerMapping,
      functionIndexMapping
    );
    const instructions = midIRFunction.body.flatMap((it) => instance.lowerMidIRStatement(it));
    instructions.push(instance.lowerMidIRExpression(midIRFunction.returnValue));
    return {
      name: midIRFunction.name,
      parameters: midIRFunction.parameters,
      localVariables: Array.from(instance.localVariables),
      instructions,
    };
  }

  private lowerMidIRStatement(s: MidIRStatement): WebAssemblyInstruction[] {
    switch (s.__type__) {
      case 'MidIRIndexAccessStatement':
        return [
          this.SET(s.name, WasmLoad(this.lowerMidIRExpression(s.pointerExpression), s.index)),
        ];
      case 'MidIRIndexAssignStatement':
        return [
          WasmStore(
            this.lowerMidIRExpression(s.pointerExpression),
            s.index,
            this.lowerMidIRExpression(s.assignedExpression)
          ),
        ];
      case 'MidIRBinaryStatement':
        return [
          this.SET(
            s.name,
            WasmBinary(this.lowerMidIRExpression(s.e1), s.operator, this.lowerMidIRExpression(s.e2))
          ),
        ];
      case 'MidIRFunctionCallStatement': {
        const argumentInstructions = s.functionArguments.map((it) => this.lowerMidIRExpression(it));
        const functionCall =
          s.functionExpression.__type__ === 'MidIRNameExpression'
            ? WasmDirectCall(s.functionExpression.name, argumentInstructions)
            : WasmIndirectCall(
                this.lowerMidIRExpression(s.functionExpression),
                WasmFunctionTypeString(s.functionArguments.length),
                argumentInstructions
              );
        return [
          s.returnCollector == null
            ? WasmDrop(functionCall)
            : this.SET(s.returnCollector, functionCall),
        ];
      }
      case 'MidIRIfElseStatement':
        return [
          WasmIfElse(
            this.lowerMidIRExpression(s.booleanExpression),
            [
              ...s.s1.flatMap((it) => this.lowerMidIRStatement(it)),
              ...s.finalAssignments.map((it) =>
                this.SET(it.name, this.lowerMidIRExpression(it.branch1Value))
              ),
            ],
            [
              ...s.s2.flatMap((it) => this.lowerMidIRStatement(it)),
              ...s.finalAssignments.map((it) =>
                this.SET(it.name, this.lowerMidIRExpression(it.branch2Value))
              ),
            ]
          ),
        ];
      case 'MidIRSingleIfStatement': {
        const condition = this.lowerMidIRExpression(s.booleanExpression);
        const block = s.statements.flatMap((it) => this.lowerMidIRStatement(it));
        return [
          s.invertCondition ? WasmIfElse(condition, [], block) : WasmIfElse(condition, block, []),
        ];
      }
      case 'MidIRBreakStatement': {
        const { breakCollector, exitLabel } = checkNotNull(this.currentLoopContext);
        if (breakCollector == null) return [WasmJump(exitLabel)];
        return [
          this.SET(breakCollector, this.lowerMidIRExpression(s.breakValue)),
          WasmJump(exitLabel),
        ];
      }
      case 'MidIRWhileStatement': {
        const savedCurrentLoopContext = this.currentLoopContext;
        const continueLabel = this.allocator.allocateLabelWithAnnotation('loop_continue');
        const exitLabel = this.allocator.allocateLabelWithAnnotation('loop_exit');
        this.currentLoopContext = { breakCollector: s.breakCollector?.name, exitLabel };
        const instructions = [
          ...s.loopVariables.flatMap((it) => [
            this.SET(it.name, this.lowerMidIRExpression(it.initialValue)),
          ]),
          WasmLoop({
            continueLabel,
            exitLabel,
            instructions: [
              ...s.statements.flatMap((it) => this.lowerMidIRStatement(it)),
              ...s.loopVariables.map((it) =>
                this.SET(it.name, this.lowerMidIRExpression(it.loopValue))
              ),
              WasmJump(continueLabel),
            ],
          }),
        ];
        this.currentLoopContext = savedCurrentLoopContext;
        return instructions;
      }
      case 'MidIRCastStatement':
        return [this.SET(s.name, this.lowerMidIRExpression(s.assignedExpression))];
      case 'MidIRStructInitializationStatement': {
        const rawPointerTemp = this.allocator.allocateTemp('struct_ptr_raw');
        const instructions: WebAssemblyInstruction[] = [
          this.SET(
            rawPointerTemp,
            WasmDirectCall(ENCODED_FUNCTION_NAME_MALLOC, [WasmConst(s.expressionList.length * 4)])
          ),
        ];
        s.expressionList.forEach((e, i) => {
          instructions.push(WasmStore(this.GET(rawPointerTemp), i, this.lowerMidIRExpression(e)));
        });
        return instructions;
      }
    }
  }

  private lowerMidIRExpression(e: MidIRExpression): WebAssemblyInlineInstruction {
    switch (e.__type__) {
      case 'MidIRIntLiteralExpression':
        return WasmConst(e.value);
      case 'MidIRNameExpression':
        return WasmConst(
          checkNotNull(
            (e.type.__type__ === 'FunctionType'
              ? this.functionIndexMapping
              : this.globalVariablesToPointerMapping)[e.name]
          )
        );
      case 'MidIRVariableExpression':
        return this.GET(e.name);
    }
  }
}

export default function lowerMidIRSourcesToWasmModule(
  midIRSources: MidIRSources
): WebAssemblyModule {
  let dataStart = 1024;
  const globalVariablesToPointerMapping: Record<string, number> = {};
  const globalVariables = midIRSources.globalVariables.map(({ name, content }) => {
    const size = content.length + 2;
    const ints = Array.from(content).map((it) => it.charCodeAt(0));
    ints.unshift(0, size);
    const globalVariable: WebAssemblyGlobalData = { constantPointer: dataStart, ints };
    globalVariablesToPointerMapping[name] = dataStart;
    dataStart += size * 4;
    return globalVariable;
  });
  const functionIndexMapping = Object.fromEntries(
    midIRSources.functions.map(({ name }, index) => [name, index])
  );

  return {
    functionTypeParameterCounts: Array.from(
      new Set(midIRSources.functions.map((it) => it.parameters.length))
    ),
    globalVariables,
    exportedFunctions: midIRSources.mainFunctionNames,
    functions: midIRSources.functions.map((it) =>
      WasmFunctionLoweringManager.lowerMidIRFunction(
        globalVariablesToPointerMapping,
        functionIndexMapping,
        it
      )
    ),
  };
}
