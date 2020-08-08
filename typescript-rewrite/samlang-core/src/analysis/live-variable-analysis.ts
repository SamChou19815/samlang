import {
  AssemblyArgument,
  RDI,
  RSI,
  RAX,
  RCX,
  RDX,
  R8,
  R9,
  R10,
  R11,
  RSP,
} from '../ast/asm/asm-arguments';
import type { AssemblyInstruction } from '../ast/asm/asm-instructions';
import { setEquals } from '../util/collections';
import ControlFlowGraph from './control-flow-graph';
import { DataflowAnalysisGraphOperator, runBackwardDataflowAnalysis } from './dataflow-analysis';

const collectUsesFromAssemblyArgument = (
  uses: Set<string>,
  assemblyArgument: AssemblyArgument
): Set<string> => {
  switch (assemblyArgument.__type__) {
    case 'AssemblyConst':
      return uses;
    case 'AssemblyRegister':
      return uses.add(assemblyArgument.id);
    case 'AssemblyMemory':
      if (assemblyArgument.baseRegister != null) uses.add(assemblyArgument.baseRegister.id);
      if (assemblyArgument.multipleOf != null)
        uses.add(assemblyArgument.multipleOf.baseRegister.id);
      return uses;
  }
};

const collectDefAndUsesFromAssemblyInstruction = (
  instruction: AssemblyInstruction,
  hasReturn: boolean
): { readonly uses: ReadonlySet<string>; readonly defs: ReadonlySet<string> } => {
  const uses = new Set<string>();

  switch (instruction.__type__) {
    case 'AssemblyMoveFromLong':
      if (instruction.destination.__type__ === 'AssemblyMemory') {
        collectUsesFromAssemblyArgument(uses, instruction.destination);
        return { defs: new Set(), uses };
      }
      return { defs: new Set([instruction.destination.id]), uses };
    case 'AssemblyMoveToMemory':
      collectUsesFromAssemblyArgument(uses, instruction.destination);
      collectUsesFromAssemblyArgument(uses, instruction.source);
      return { defs: new Set(), uses };
    case 'AssemblyMoveToRegister':
    case 'AssemblyLoadEffectiveAddress':
      collectUsesFromAssemblyArgument(uses, instruction.source);
      return { defs: new Set([instruction.destination.id]), uses };
    case 'AssemblyCompareMemory':
    case 'AssemblyCompareConstOrRegister':
      collectUsesFromAssemblyArgument(uses, instruction.minuend);
      collectUsesFromAssemblyArgument(uses, instruction.subtrahend);
      return { defs: new Set(), uses };
    case 'AssemblySetOnFlag':
      return { defs: new Set([instruction.register.id]), uses };
    case 'AssemblyJump':
      return { defs: new Set(), uses };
    case 'AssemblyCall':
      collectUsesFromAssemblyArgument(uses, instruction.address);
      // Use all registers that can be potentially used to pass arguments.
      uses.add(RDI.id);
      uses.add(RSI.id);
      uses.add(RDX.id);
      uses.add(RCX.id);
      uses.add(R8.id);
      uses.add(R9.id);
      // Destroy all caller-saved registers
      return {
        defs: new Set([RAX.id, RCX.id, RDX.id, RSI.id, RDI.id, R8.id, R9.id, R10.id, R11.id]),
        uses,
      };
    case 'AssemblyReturn':
      if (hasReturn) {
        uses.add(RAX.id);
      }
      return { defs: new Set(), uses };
    case 'AssemblyArithmeticBinaryMemoryDestination':
      collectUsesFromAssemblyArgument(uses, instruction.destination);
      collectUsesFromAssemblyArgument(uses, instruction.source);
      return { defs: new Set(), uses };
    case 'AssemblyArithmeticBinaryRegisterDestination':
    case 'AssemblyIMulTwoArgs':
      collectUsesFromAssemblyArgument(uses, instruction.destination);
      collectUsesFromAssemblyArgument(uses, instruction.source);
      return { defs: new Set([instruction.destination.id]), uses };
    case 'AssemblyIMulThreeArgs':
      collectUsesFromAssemblyArgument(uses, instruction.source);
      return { defs: new Set([instruction.destination.id]), uses };
    case 'AssemblyCqo':
      uses.add(RAX.id);
      return { defs: new Set([RDX.id]), uses };
    case 'AssemblyIDiv':
      collectUsesFromAssemblyArgument(uses, instruction.divisor);
      uses.add(RAX.id);
      uses.add(RDX.id);
      return { defs: new Set([RAX.id, RDX.id]), uses };
    case 'AssemblyNeg':
    case 'AssemblyShiftLeft':
      collectUsesFromAssemblyArgument(uses, instruction.destination);
      if (instruction.destination.__type__ === 'AssemblyRegister') {
        return { defs: new Set([instruction.destination.id]), uses };
      }
      return { defs: new Set(), uses };
    case 'AssemblyPush':
      collectUsesFromAssemblyArgument(uses, instruction.pushArgument);
      uses.add(RSP.id);
      return { defs: new Set([RSP.id]), uses };
    case 'AssemblyPop':
      uses.add(RSP.id);
      // istanbul ignore next
      if (instruction.popArgument.__type__ === 'AssemblyRegister') {
        return { defs: new Set([instruction.popArgument.id]), uses };
      }
      // TODO: remove once pop is always pop rbp.
      // istanbul ignore next
      collectUsesFromAssemblyArgument(uses, instruction.popArgument);
      // istanbul ignore next
      return { defs: new Set([]), uses };
    case 'AssemblyLabel':
    case 'AssemblyComment':
      return { defs: new Set(), uses };
  }
};

const analyzeLiveVariablesAtTheEndOfEachInstruction = (
  instructions: readonly AssemblyInstruction[],
  hasReturn: boolean
): readonly ReadonlySet<string>[] => {
  const operator: DataflowAnalysisGraphOperator<AssemblyInstruction, Set<string>> = {
    graphConstructor: ControlFlowGraph.fromAssemblyInstructions,
    edgeInitializer: () => new Set(),
    joinEdges: (parentInEdges) => {
      const newOutEdge = new Set<string>();
      parentInEdges.forEach((edge) => edge.forEach((v) => newOutEdge.add(v)));
      return newOutEdge;
    },
    computeNewEdge: (newOutEdge, instruction) => {
      const newInEdge = new Set(newOutEdge);
      const { uses, defs } = collectDefAndUsesFromAssemblyInstruction(instruction, hasReturn);
      defs.forEach((oneDef) => newInEdge.delete(oneDef));
      uses.forEach((oneUse) => newInEdge.add(oneUse));
      return newInEdge;
    },
    edgeDataEquals: setEquals,
  };

  return runBackwardDataflowAnalysis(instructions, operator).outEdges;
};

export default analyzeLiveVariablesAtTheEndOfEachInstruction;
