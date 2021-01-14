import ControlFlowGraph from 'samlang-core-analysis/control-flow-graph';
import type { LLVMInstruction } from 'samlang-core-ast/llvm-nodes';

const withoutUnreachableCode = <I>(
  instructions: readonly I[],
  controlFlowGraphConstructor: (instructionList: readonly I[]) => ControlFlowGraph<I>
): readonly I[] => {
  const reachableSet = new Set<number>();
  controlFlowGraphConstructor(instructions).dfs((node) => reachableSet.add(node.id));
  return instructions.filter((_, index) => reachableSet.has(index));
};

// eslint-disable-next-line import/prefer-default-export
export const withoutUnreachableLLVMCode = (
  instructions: readonly LLVMInstruction[]
): readonly LLVMInstruction[] =>
  withoutUnreachableCode(instructions, ControlFlowGraph.fromLLVMInstructions);

/*
const withoutConsecutiveJumpsInIr = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  // If a LABEL A is followed by JUMP B, then A -> B will be in the map.
  const singleJumpLabelMap = new Map<string, string>();
  statements.forEach((statement, index) => {
    if (index >= statements.length - 1) return;
    if (statement.__type__ !== 'MidIRLabelStatement') return;
    const nextStatement = statements[index + 1];
    assertNotNull(nextStatement);
    if (nextStatement.__type__ !== 'MidIRJumpStatement') return;
    singleJumpLabelMap.set(statement.name, nextStatement.label);
  });

  // It might be the case that we find something like l1 -> l2, l2 -> l3.
  // This pass standardized the map into l1 -> l3, l2 -> l3.
  const optimizedJumpLabelMap = new Map<string, string>();
  singleJumpLabelMap.forEach((target, source) => {
    let finalTarget: string = target;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const nextTarget = singleJumpLabelMap.get(finalTarget);
      // nextTarget === finalTarget is used to prevent infinite loop caused self jump:
      // e.g.
      //   label A;
      //   jump A;
      if (nextTarget == null || nextTarget === finalTarget) break;
      finalTarget = nextTarget;
    }
    optimizedJumpLabelMap.set(source, finalTarget);
  });

  return statements.map((statement) => {
    switch (statement.__type__) {
      case 'MidIRJumpStatement': {
        const optimizedLabel = optimizedJumpLabelMap.get(statement.label);
        return optimizedLabel == null ? statement : { ...statement, label: optimizedLabel };
      }
      case 'MidIRConditionalJumpFallThrough': {
        const optimizedLabel = optimizedJumpLabelMap.get(statement.label1);
        return optimizedLabel == null
          ? statement
          : { ...statement, label1: optimizedLabel };
      }
      default:
        return statement;
    }
  });
};

const withoutUnusedLabelInIr = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  const usedLabels = new Set<string>();
  statements.forEach((statement) => {
    switch (statement.__type__) {
      case 'MidIRJumpStatement':
        usedLabels.add(statement.label);
        break;
      case 'MidIRConditionalJumpFallThrough':
        usedLabels.add(statement.label1);
        break;
    }
  });
  return statements.filter(
    (statement) => statement.__type__ !== 'MidIRLabelStatement' || usedLabels.has(statement.name)
  );
};

const optimizeIrWithSimpleOptimization = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] =>
  pipe(
    statements,
    withoutConsecutiveJumpsInIr,
    withoutUnusedLabelInIr
  );

export default optimizeIrWithSimpleOptimization;
*/
