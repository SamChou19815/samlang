import { ENCODED_FUNCTION_NAME_MALLOC } from '../ast/common-names';
import type {
  MidIRExpression,
  MidIRStatement,
  MidIRFunction,
  MidIRSources,
} from '../ast/mir-nodes';
import {
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

  private GET(n: string): WebAssemblyInstruction {
    this.localVariables.add(n);
    return WasmLocalGet(n);
  }

  private SET(n: string): WebAssemblyInstruction {
    this.localVariables.add(n);
    return WasmLocalSet(n);
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
          this.lowerMidIRExpression(s.pointerExpression),
          WasmLoad(s.index),
          this.SET(s.name),
        ];
      case 'MidIRIndexAssignStatement':
        return [
          this.lowerMidIRExpression(s.pointerExpression),
          this.lowerMidIRExpression(s.assignedExpression),
          WasmStore(s.index),
        ];
      case 'MidIRBinaryStatement':
        return [
          this.lowerMidIRExpression(s.e1),
          this.lowerMidIRExpression(s.e2),
          WasmBinary(s.operator),
          this.SET(s.name),
        ];
      case 'MidIRFunctionCallStatement': {
        const instructions = s.functionArguments.map((it) => this.lowerMidIRExpression(it));
        if (s.functionExpression.__type__ === 'MidIRNameExpression') {
          instructions.push(WasmDirectCall(s.functionExpression.name));
        } else {
          instructions.push(
            this.lowerMidIRExpression(s.functionExpression),
            WasmIndirectCall(WasmFunctionTypeString(s.functionArguments.length))
          );
        }
        instructions.push(s.returnCollector == null ? WasmDrop : this.SET(s.returnCollector));
        return instructions;
      }
      case 'MidIRIfElseStatement':
        return [
          this.lowerMidIRExpression(s.booleanExpression),
          WasmIfElse(
            [
              ...s.s1.flatMap((it) => this.lowerMidIRStatement(it)),
              ...s.finalAssignments.flatMap((it) => [
                this.lowerMidIRExpression(it.branch1Value),
                this.SET(it.name),
              ]),
            ],
            [
              ...s.s2.flatMap((it) => this.lowerMidIRStatement(it)),
              ...s.finalAssignments.flatMap((it) => [
                this.lowerMidIRExpression(it.branch2Value),
                this.SET(it.name),
              ]),
            ]
          ),
        ];
      case 'MidIRSingleIfStatement': {
        const block = s.statements.flatMap((it) => this.lowerMidIRStatement(it));
        return [
          this.lowerMidIRExpression(s.booleanExpression),
          s.invertCondition ? WasmIfElse([], block) : WasmIfElse(block, []),
        ];
      }
      case 'MidIRBreakStatement': {
        const { breakCollector, exitLabel } = checkNotNull(this.currentLoopContext);
        if (breakCollector == null) return [WasmJump(exitLabel)];
        return [
          this.lowerMidIRExpression(s.breakValue),
          this.SET(breakCollector),
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
            this.lowerMidIRExpression(it.initialValue),
            this.SET(it.name),
          ]),
          WasmLoop({
            continueLabel,
            exitLabel,
            instructions: [
              ...s.statements.flatMap((it) => this.lowerMidIRStatement(it)),
              ...s.loopVariables.flatMap((it) => [
                this.lowerMidIRExpression(it.loopValue),
                this.SET(it.name),
              ]),
              WasmJump(continueLabel),
            ],
          }),
        ];
        this.currentLoopContext = savedCurrentLoopContext;
        return instructions;
      }
      case 'MidIRCastStatement':
        return [this.lowerMidIRExpression(s.assignedExpression), this.SET(s.name)];
      case 'MidIRStructInitializationStatement': {
        const rawPointerTemp = this.allocator.allocateTemp('struct_ptr_raw');
        const instructions: WebAssemblyInstruction[] = [
          WasmConst(s.expressionList.length * 4),
          WasmDirectCall(ENCODED_FUNCTION_NAME_MALLOC),
          this.SET(rawPointerTemp),
        ];
        s.expressionList.forEach((e, i) => {
          instructions.push(this.GET(rawPointerTemp), this.lowerMidIRExpression(e), WasmStore(i));
        });
        return instructions;
      }
    }
  }

  private lowerMidIRExpression(e: MidIRExpression): WebAssemblyInstruction {
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
