import ControlFlowGraph from 'samlang-core-analysis/control-flow-graph';
import type { AssemblyInstruction } from 'samlang-core-ast/asm-instructions';
import { MidIRStatement, MIR_JUMP, MIR_CJUMP_FALLTHROUGH } from 'samlang-core-ast/mir-nodes';
import { assertNotNull, checkNotNull, isNotNull } from 'samlang-core-utils';

const pipe = <E>(element: E, ...functions: readonly ((e: E) => E)[]): E =>
  functions.reduce((accumulator, f) => f(accumulator), element);

const withoutUnreachableCode = <I>(
  instructions: readonly I[],
  controlFlowGraphConstructor: (instructionList: readonly I[]) => ControlFlowGraph<I>
): readonly I[] => {
  const reachableSet = new Set<number>();
  controlFlowGraphConstructor(instructions).dfs((node) => reachableSet.add(node.id));
  return instructions.filter((_, index) => reachableSet.has(index));
};

const withoutUnreachableIRCode = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] =>
  withoutUnreachableCode(statements, ControlFlowGraph.fromMidIRStatements);

const getCoalesceConsecutiveLabelsReplacementMap = <I>(
  instructions: readonly I[],
  getLabel: (instruction: I) => string | null
): ReadonlyMap<string, string> | null => {
  // If label A is immediately followed by label B, then A -> B should be in the mapping.
  const nextEquivalentLabelMap = new Map<string, string>();
  instructions.forEach((instruction, index) => {
    if (index >= instructions.length - 1) return;
    const label = getLabel(instruction);
    if (label == null) return;
    const nextLabel = getLabel(checkNotNull(instructions[index + 1]));
    if (nextLabel == null) return;
    nextEquivalentLabelMap.set(label, nextLabel);
  });
  if (nextEquivalentLabelMap.size === 0) {
    return null;
  }

  // It might be the case that we find something like l1 -> l2, l2 -> l3.
  // This pass standardized the map into l1 -> l3, l2 -> l3.
  const optimizedNextEquivalentLabelMap = new Map<string, string>();
  nextEquivalentLabelMap.forEach((target, source) => {
    let finalTarget: string = target;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const nextTarget = nextEquivalentLabelMap.get(finalTarget);
      if (nextTarget == null) break;
      finalTarget = nextTarget;
    }
    optimizedNextEquivalentLabelMap.set(source, finalTarget);
  });

  return optimizedNextEquivalentLabelMap;
};

const coalesceConsecutiveLabelsForIr = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  const optimizedNextEquivalentLabelMap = getCoalesceConsecutiveLabelsReplacementMap(
    statements,
    (statement) => (statement.__type__ === 'MidIRLabelStatement' ? statement.name : null)
  );
  if (optimizedNextEquivalentLabelMap == null) return statements;

  return statements
    .map((statement) => {
      switch (statement.__type__) {
        case 'MidIRLabelStatement':
          return optimizedNextEquivalentLabelMap.has(statement.name) ? null : statement;
        case 'MidIRJumpStatement': {
          const optimizedLabel = optimizedNextEquivalentLabelMap.get(statement.label);
          return optimizedLabel == null ? statement : MIR_JUMP(optimizedLabel);
        }
        case 'MidIRConditionalJumpFallThrough': {
          const optimizedLabel = optimizedNextEquivalentLabelMap.get(statement.label1);
          return optimizedLabel == null
            ? statement
            : MIR_CJUMP_FALLTHROUGH(statement.conditionExpression, optimizedLabel);
        }
        default:
          return statement;
      }
    })
    .filter(isNotNull);
};

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
        return optimizedLabel == null ? statement : MIR_JUMP(optimizedLabel);
      }
      case 'MidIRConditionalJumpFallThrough': {
        const optimizedLabel = optimizedJumpLabelMap.get(statement.label1);
        return optimizedLabel == null
          ? statement
          : MIR_CJUMP_FALLTHROUGH(statement.conditionExpression, optimizedLabel);
      }
      default:
        return statement;
    }
  });
};

const withoutImmediateJumpInIr = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] =>
  statements
    .map((statement, index) => {
      if (index >= statements.length - 1) return statement;
      const nextStatement = statements[index + 1];
      assertNotNull(nextStatement);
      if (nextStatement.__type__ !== 'MidIRLabelStatement') return statement;
      const nextLabel = nextStatement.name;
      if (statement.__type__ === 'MidIRJumpStatement') {
        if (statement.label === nextLabel) {
          // This is the case where we have JUMP A, LABEL A, we can omit the jump.
          return null;
        }
      }
      if (statement.__type__ === 'MidIRConditionalJumpFallThrough') {
        if (statement.label1 === nextLabel) {
          // This is the case where we have CJUMP(..., labelA); LABEL labelA.
          // It seems to the case when the true label is the same as false label.
          // Although unlikely, we can still optimize it away in case it happens.
          return null;
        }
      }
      return statement;
    })
    .filter(isNotNull);

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

export const optimizeIrWithSimpleOptimization = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] =>
  pipe(
    statements,
    coalesceConsecutiveLabelsForIr,
    withoutConsecutiveJumpsInIr,
    withoutUnreachableIRCode,
    withoutConsecutiveJumpsInIr,
    withoutImmediateJumpInIr,
    withoutUnusedLabelInIr
  );

const withoutUnreachableAssemblyCode = (
  instructions: readonly AssemblyInstruction[]
): readonly AssemblyInstruction[] =>
  withoutUnreachableCode(instructions, ControlFlowGraph.fromAssemblyInstructions);

const coalesceConsecutiveLabelsForAsm = (
  instructions: readonly AssemblyInstruction[]
): readonly AssemblyInstruction[] => {
  const optimizedNextEquivalentLabelMap = getCoalesceConsecutiveLabelsReplacementMap(
    instructions,
    (instruction) => (instruction.__type__ === 'AssemblyLabel' ? instruction.label : null)
  );
  if (optimizedNextEquivalentLabelMap == null) return instructions;

  return instructions
    .map((instruction) => {
      switch (instruction.__type__) {
        case 'AssemblyJump': {
          const optimizedLabel = optimizedNextEquivalentLabelMap.get(instruction.label);
          return optimizedLabel == null ? instruction : { ...instruction, label: optimizedLabel };
        }
        case 'AssemblyLabel':
          return optimizedNextEquivalentLabelMap.has(instruction.label) ? null : instruction;
        default:
          return instruction;
      }
    })
    .filter(isNotNull);
};

const withoutImmediateJumpInAsm = (
  instructions: readonly AssemblyInstruction[]
): readonly AssemblyInstruction[] =>
  instructions.filter((instruction, index) => {
    if (index < instructions.length - 1 && instruction.__type__ === 'AssemblyJump') {
      const { label } = instruction;
      const nextInstruction = instructions[index + 1];
      assertNotNull(nextInstruction);
      if (nextInstruction.__type__ === 'AssemblyLabel' && nextInstruction.label === label) {
        return false;
      }
    }
    return true;
  });

const withoutUnusedLabelInAsm = (
  instructions: readonly AssemblyInstruction[]
): readonly AssemblyInstruction[] => {
  const usedLabels = new Set<string>();
  instructions.forEach((instruction) => {
    if (instruction.__type__ === 'AssemblyJump') {
      usedLabels.add(instruction.label);
    }
  });
  return instructions.filter(
    (instruction) => instruction.__type__ !== 'AssemblyLabel' || usedLabels.has(instruction.label)
  );
};

export const optimizeAssemblyWithSimpleOptimization = (
  instructions: readonly AssemblyInstruction[],
  removeComments: boolean
): readonly AssemblyInstruction[] => {
  const instructionsWithoutComments = removeComments
    ? instructions.filter((it) => it.__type__ !== 'AssemblyComment')
    : instructions;
  if (instructionsWithoutComments.length === 0) return instructionsWithoutComments;
  return pipe(
    instructionsWithoutComments,
    coalesceConsecutiveLabelsForAsm,
    withoutUnreachableAssemblyCode,
    withoutImmediateJumpInAsm,
    withoutUnusedLabelInAsm
  );
};
