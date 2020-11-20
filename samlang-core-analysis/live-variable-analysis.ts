import ControlFlowGraph from './control-flow-graph';
import { DataflowAnalysisGraphOperator, runBackwardDataflowAnalysis } from './dataflow-analysis';

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
  RBP,
} from 'samlang-core-ast/asm-arguments';
import type { AssemblyInstruction } from 'samlang-core-ast/asm-instructions';
import { checkNotNull, setEquals } from 'samlang-core-utils';

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
      if (assemblyArgument.multipleOf != null) {
        uses.add(assemblyArgument.multipleOf.baseRegister.id);
      }
      return uses;
  }
};

type MutableUsesAndDefs = { readonly uses: Set<string>; readonly defs: Set<string> };
type UsesAndDefs = { readonly uses: ReadonlySet<string>; readonly defs: ReadonlySet<string> };

const collectDefAndUsesFromAssemblyInstruction = (
  instruction: AssemblyInstruction,
  hasReturn: boolean
): MutableUsesAndDefs => {
  const uses = new Set<string>();

  switch (instruction.__type__) {
    case 'AssemblyMoveFromLong':
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
    case 'AssemblyPopRBP':
      uses.add(RSP.id);
      return { defs: new Set([RSP.id, RBP.id]), uses };
    case 'AssemblyLabel':
    case 'AssemblyComment':
      return { defs: new Set(), uses };
  }
};

export type LiveVariableAnalysisResult = {
  readonly useAndDefs: readonly UsesAndDefs[];
  readonly out: readonly ReadonlySet<string>[];
};

const analyzeLiveVariablesAtTheEndOfEachInstruction = (
  instructions: readonly AssemblyInstruction[],
  hasReturn: boolean
): LiveVariableAnalysisResult => {
  const useAndDefs = instructions.map((it) =>
    collectDefAndUsesFromAssemblyInstruction(it, hasReturn)
  );
  // istanbul ignore next
  if (instructions.length > 0) {
    // last instruction is the epilogue label. It can be seen as the exit node.
    const useSetOfLastInstruction = checkNotNull(useAndDefs[instructions.length - 1]).uses;
    // we also want to use rax if they are return values.
    if (hasReturn) {
      useSetOfLastInstruction.add(RAX.id);
    }
  }

  const operator: DataflowAnalysisGraphOperator<AssemblyInstruction, Set<string>> = {
    graphConstructor: ControlFlowGraph.fromAssemblyInstructions,
    edgeInitializer: () => new Set(),
    joinEdges: (parentInEdges) => {
      const newOutEdge = new Set<string>();
      parentInEdges.forEach((edge) => edge.forEach((v) => newOutEdge.add(v)));
      return newOutEdge;
    },
    computeNewEdge: (newOutEdge, _, nodeID) => {
      const { uses, defs } = checkNotNull(useAndDefs[nodeID]);
      const newInEdge = new Set(uses);
      newOutEdge.forEach((outVariable) => {
        if (!defs.has(outVariable)) {
          newInEdge.add(outVariable);
        }
      });
      return newInEdge;
    },
    edgeDataEquals: setEquals,
  };

  return {
    useAndDefs,
    out: runBackwardDataflowAnalysis(instructions, operator).outEdges,
  };
};

export default analyzeLiveVariablesAtTheEndOfEachInstruction;
