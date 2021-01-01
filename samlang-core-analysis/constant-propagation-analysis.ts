import ControlFlowGraph from './control-flow-graph';
import { DataflowAnalysisGraphOperator, runForwardDataflowAnalysis } from './dataflow-analysis';

import type { MidIRStatement, MidIRExpression } from 'samlang-core-ast/mir-nodes';
import { Long, checkNotNull, mapEquals } from 'samlang-core-utils';

type KnownConstant = { readonly __type__: 'known'; readonly value: Long };
type UnknownConstant = { readonly __type__: 'unknown' };
type ConstantStatus = KnownConstant | UnknownConstant;

const constantStatusEquals = (status1: ConstantStatus, status2: ConstantStatus): boolean => {
  switch (status1.__type__) {
    case 'unknown':
      return status2.__type__ === 'unknown';
    case 'known':
      return status2.__type__ === 'known' && status1.value.equals(status2.value);
  }
};

const constantStatusMap = (
  status1: ConstantStatus,
  status2: ConstantStatus,
  f: (known1: KnownConstant, known2: KnownConstant) => ConstantStatus
): ConstantStatus => {
  switch (status1.__type__) {
    case 'unknown':
      return { __type__: 'unknown' };
    case 'known':
      switch (status2.__type__) {
        case 'known':
          return f(status1, status2);
        case 'unknown':
          return { __type__: 'unknown' };
      }
  }
};

const constantStatusMeet = (s1: ConstantStatus, s2: ConstantStatus): ConstantStatus => {
  switch (s1.__type__) {
    case 'unknown':
      return { __type__: 'unknown' };
    case 'known':
      switch (s2.__type__) {
        case 'unknown':
          return { __type__: 'unknown' };
        case 'known':
          return s1.value.equals(s2.value) ? s1 : { __type__: 'unknown' };
      }
  }
};

const propagatedConstantsOnExpression = (
  inData: ReadonlyMap<string, ConstantStatus>,
  expression: MidIRExpression
): ConstantStatus => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
      return { __type__: 'known', value: expression.value };
    case 'MidIRNameExpression':
    case 'MidIRImmutableMemoryExpression':
      return { __type__: 'unknown' };
    case 'MidIRTemporaryExpression':
      return inData.get(expression.temporaryID) ?? { __type__: 'unknown' };
    case 'MidIRBinaryExpression': {
      const status1 = propagatedConstantsOnExpression(inData, expression.e1);
      const status2 = propagatedConstantsOnExpression(inData, expression.e2);
      switch (expression.operator) {
        case '+':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.add(known2.value),
          }));
        case '-':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.subtract(known2.value),
          }));
        case '*':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.multiply(known2.value),
          }));
        case '/':
          return constantStatusMap(status1, status2, (known1, known2) => {
            if (known2.value.equals(Long.ZERO)) return { __type__: 'unknown' };
            return { __type__: 'known', value: known1.value.divide(known2.value) };
          });
        case '%':
          return constantStatusMap(status1, status2, (known1, known2) => {
            if (known2.value.equals(Long.ZERO)) return { __type__: 'unknown' };
            return { __type__: 'known', value: known1.value.mod(known2.value) };
          });
        case '^':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.xor(known2.value),
          }));
        case '<':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.lessThan(known2.value) ? Long.ONE : Long.ZERO,
          }));
        case '<=':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.lessThanOrEqual(known2.value) ? Long.ONE : Long.ZERO,
          }));
        case '>':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.greaterThan(known2.value) ? Long.ONE : Long.ZERO,
          }));
        case '>=':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.greaterThanOrEqual(known2.value) ? Long.ONE : Long.ZERO,
          }));
        case '==':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.equals(known2.value) ? Long.ONE : Long.ZERO,
          }));
        case '!=':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value.notEquals(known2.value) ? Long.ONE : Long.ZERO,
          }));
      }
    }
  }
};

const propagatedConstantsOnStatement = (
  inData: ReadonlyMap<string, ConstantStatus>,
  statement: MidIRStatement
): readonly [string, ConstantStatus] | null => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return [statement.temporaryID, propagatedConstantsOnExpression(inData, statement.source)];
    case 'MidIRCallFunctionStatement':
      return statement.returnCollectorTemporaryID == null
        ? null
        : [statement.returnCollectorTemporaryID, { __type__: 'unknown' }];
    default:
      return null;
  }
};

const operator: DataflowAnalysisGraphOperator<MidIRStatement, Map<string, ConstantStatus>> = {
  graphConstructor: ControlFlowGraph.fromMidIRStatements,
  edgeInitializer: () => new Map(),
  joinEdges: (parentOutEdges, nodeID) => {
    if (nodeID === 0) return new Map();
    const newInEdge = new Map<string, ConstantStatus>();
    parentOutEdges.forEach((parentOutEdge) => {
      parentOutEdge.forEach((status, variable) => {
        const existingStatus = newInEdge.get(variable);
        if (existingStatus == null) {
          newInEdge.set(variable, status);
        } else {
          newInEdge.set(variable, constantStatusMeet(status, existingStatus));
        }
      });
    });
    return newInEdge;
  },
  computeNewEdge: (newInEdge, statement) => {
    const newOutEdge = new Map(newInEdge);
    const update = propagatedConstantsOnStatement(newInEdge, statement);
    if (update != null) {
      newOutEdge.set(update[0], update[1]);
    }
    return newOutEdge;
  },
  edgeDataEquals: (a, b) => mapEquals(a, b, constantStatusEquals),
};

const analyzePropagatedConstants = (
  statements: readonly MidIRStatement[]
): readonly ReadonlyMap<string, Long>[] => {
  const { inEdges } = runForwardDataflowAnalysis(statements, operator);

  const propagatedConstants = new Array<Map<string, Long>>(statements.length);
  for (let i = 0; i < statements.length; i += 1) {
    const map = new Map<string, Long>();
    Array.from(checkNotNull(inEdges[i]).entries()).forEach(([variable, status]) => {
      if (status.__type__ === 'known') {
        map.set(variable, status.value);
      }
    });
    propagatedConstants[i] = map;
  }
  return propagatedConstants;
};

export default analyzePropagatedConstants;
