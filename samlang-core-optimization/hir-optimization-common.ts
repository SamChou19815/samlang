import type {
  HighIRStatement,
  HighIRIfElseStatement,
  HighIRSwitchStatement,
} from 'samlang-core-ast/hir-expressions';

export const ifElseOrNull = (ifElse: HighIRIfElseStatement): readonly HighIRStatement[] => {
  if (ifElse.s1.length === 0 && ifElse.s2.length === 0 && ifElse.finalAssignment == null) {
    return [];
  }
  return [ifElse];
};

export const switchOrNull = (
  switchStatement: HighIRSwitchStatement
): readonly HighIRStatement[] => {
  if (
    switchStatement.cases.every((it) => it.statements.length === 0) &&
    switchStatement.finalAssignment == null
  ) {
    return [];
  }
  return [switchStatement];
};
