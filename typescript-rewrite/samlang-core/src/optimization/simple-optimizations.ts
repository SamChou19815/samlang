import ControlFlowGraph from '../analysis/control-flow-graph';
import analyzeUsedFunctionNames from '../analysis/used-name-analysis';
import { MidIRCompilationUnit, MidIRStatement, MIR_JUMP, MIR_CJUMP_FALLTHROUGH } from '../ast/mir';
import { isNotNull } from '../util/type-assertions';

const pipe = <E>(element: E, ...functions: readonly ((element: E) => E)[]): E =>
  functions.reduce((accumulator, f) => f(accumulator), element);

const withoutUnreachableCode = <I>(
  instructions: readonly I[],
  controlFlowGraphConstructor: (instructions: readonly I[]) => ControlFlowGraph<I>
): readonly I[] => {
  const reachableSet = new Set<number>();
  controlFlowGraphConstructor(instructions).dfs((node) => reachableSet.add(node.id));
  return instructions.filter((_, index) => reachableSet.has(index));
};

const withoutUnreachableIRCode = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] =>
  withoutUnreachableCode(statements, ControlFlowGraph.fromMidIRStatements);

const coalesceConsecutiveLabelsForIr = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  // If label A is immediately followed by label B, then A -> B should be in the mapping.
  const nextEquivalentLabelMap = new Map<string, string>();
  statements.forEach((statement, index) => {
    if (index >= statements.length - 1) return;
    if (statement.__type__ !== 'MidIRLabelStatement') return;
    const nextStatement = statements[index + 1];
    if (nextStatement.__type__ !== 'MidIRLabelStatement') return;
    nextEquivalentLabelMap.set(statement.name, nextStatement.name);
  });
  if (nextEquivalentLabelMap.size === 0) {
    return statements;
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

/**
 * Perform these optimizations and return an optimized sequence of mid IR statements.
 *
 * - unreachable code elimination
 * - jump to immediate label elimination
 * - unused label elimination
 *
 * @returns a list of all optimized statements.
 */
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

export const optimizeIRWithUnusedNameElimination = (
  compilationUnit: MidIRCompilationUnit
): MidIRCompilationUnit => {
  const usedNames = analyzeUsedFunctionNames(compilationUnit);
  return {
    globalVariables: compilationUnit.globalVariables.filter((it) => usedNames.has(it.name)),
    functions: compilationUnit.functions.filter((it) => usedNames.has(it.functionName)),
  };
};
