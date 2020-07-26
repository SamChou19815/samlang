import { MidIRStatement, MidIRExpression } from '../ast/mir';
import { mapEquals } from '../util/collections';
import { assertNotNull } from '../util/type-assertions';
import ControlFlowGraph from './control-flow-graph';

type KnownConstant = { readonly __type__: 'known'; readonly value: bigint };
type UnknownConstant = { readonly __type__: 'unknown' };
type ConstantStatus = KnownConstant | UnknownConstant;

const constantStatusEquals = (status1: ConstantStatus, status2: ConstantStatus): boolean => {
  switch (status1.__type__) {
    case 'unknown':
      return status2.__type__ === 'unknown';
    case 'known':
      return status2.__type__ === 'known' && status1.value === status2.value;
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
          return s1.value === s2.value ? s1 : { __type__: 'unknown' };
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
            value: known1.value + known2.value,
          }));
        case '-':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value - known2.value,
          }));
        case '*':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value * known2.value,
          }));
        case '/':
          return constantStatusMap(status1, status2, (known1, known2) => {
            if (known2.value === BigInt(0)) return { __type__: 'unknown' };
            return { __type__: 'known', value: known1.value / known2.value };
          });
        case '%':
          return constantStatusMap(status1, status2, (known1, known2) => {
            if (known2.value === BigInt(0)) return { __type__: 'unknown' };
            return { __type__: 'known', value: known1.value % known2.value };
          });
        case '^':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            // eslint-disable-next-line no-bitwise
            value: known1.value ^ known2.value,
          }));
        case '<':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value < known2.value ? BigInt(1) : BigInt(0),
          }));
        case '<=':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value <= known2.value ? BigInt(1) : BigInt(0),
          }));
        case '>':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value > known2.value ? BigInt(1) : BigInt(0),
          }));
        case '>=':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value >= known2.value ? BigInt(1) : BigInt(0),
          }));
        case '==':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value === known2.value ? BigInt(1) : BigInt(0),
          }));
        case '!=':
          return constantStatusMap(status1, status2, (known1, known2) => ({
            __type__: 'known',
            value: known1.value !== known2.value ? BigInt(1) : BigInt(0),
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

const analyzePropagatedConstants = (
  statements: readonly MidIRStatement[]
): readonly ReadonlyMap<string, bigint>[] => {
  const graph = ControlFlowGraph.fromMidIRStatements(statements);
  const len = statements.length;
  const inData = new Array<Map<string, ConstantStatus>>(len);
  const outData = new Array<Map<string, ConstantStatus>>(len);
  const nodes = new Array<number>(len);
  for (let i = 0; i < len; i += 1) {
    inData[i] = new Map();
    outData[i] = new Map();
    nodes[i] = i;
  }

  while (nodes.length > 0) {
    const nodeId = nodes.shift();
    assertNotNull(nodeId);
    const newInMap = new Map<string, ConstantStatus>();
    graph.getParentIds(nodeId).forEach((parentId) => {
      outData[parentId].forEach((status, variable) => {
        const existingStatus = newInMap.get(variable);
        if (existingStatus == null) {
          newInMap.set(variable, status);
        } else {
          newInMap.set(variable, constantStatusMeet(status, existingStatus));
        }
      });
    });
    inData[nodeId] = newInMap;

    const oldOutMap = outData[nodeId];
    const newOutMap = new Map(newInMap);
    const update = propagatedConstantsOnStatement(newInMap, statements[nodeId]);
    if (update != null) {
      newOutMap.set(update[0], update[1]);
    }
    outData[nodeId] = newOutMap;
    if (!mapEquals(oldOutMap, newOutMap, constantStatusEquals)) {
      nodes.push(...graph.getChildrenIds(nodeId));
    }
  }

  const propagatedConstants = new Array<Map<string, bigint>>(len);
  for (let i = 0; i < len; i += 1) {
    const map = new Map<string, bigint>();
    Array.from(inData[i].entries()).forEach(([variable, status]) => {
      if (status.__type__ === 'known') {
        map.set(variable, status.value);
      }
    });
    propagatedConstants[i] = map;
  }
  return propagatedConstants;
};

export default analyzePropagatedConstants;
