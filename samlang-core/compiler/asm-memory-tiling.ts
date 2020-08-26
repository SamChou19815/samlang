import {
  AssemblyMemoryMultipleOf,
  RIP,
  ASM_CONST,
  ASM_NAME,
  ASM_REG,
  ASM_MEM_CONST,
  ASM_MEM_REG,
  ASM_MEM_MUL,
  ASM_MEM_REG_WITH_CONST,
  ASM_MEM_REG_WITH_MUL,
  ASM_MEM_MUL_WITH_CONST,
  ASM_MEM,
} from '../ast/asm-arguments';
import { AssemblyInstruction, ASM_COMMENT } from '../ast/asm-instructions';
import { MidIRExpression, MidIRBinaryExpression } from '../ast/mir-nodes';
import { bigIntIsWithin32BitIntegerRange } from '../util/int-util';
import { assertNotNull } from '../util/type-assertions';
import {
  AssemblyMemoryTilingResult,
  AssemblyTilingServiceBasic,
  createAssemblyMemoryTilingResult,
} from './asm-tiling-results';

const getTilingResultWithLowerCost = (
  result1: AssemblyMemoryTilingResult | null,
  result2: AssemblyMemoryTilingResult
): AssemblyMemoryTilingResult => {
  if (result1 == null) return result2;
  return result1.cost <= result2.cost ? result1 : result2;
};

const getConstantValue = (expression: MidIRExpression): number | null =>
  expression.__type__ === 'MidIRConstantExpression' &&
  bigIntIsWithin32BitIntegerRange(expression.value)
    ? Number(expression.value)
    : null;

const getMultipleOfConstant = (expression: MidIRExpression): 1 | 2 | 4 | 8 | null => {
  const value = getConstantValue(expression);
  if (value == null) return null;
  switch (value) {
    case 1:
    case 2:
    case 4:
    case 8:
      return value;
    default:
      return null;
  }
};

type MultipleOfTilingResult = {
  readonly item: AssemblyMemoryMultipleOf;
  readonly instructions: readonly AssemblyInstruction[];
};

const tryTileMultipleOf = (
  expression: MidIRExpression,
  service: AssemblyTilingServiceBasic
): MultipleOfTilingResult | null => {
  if (expression.__type__ === 'MidIRTemporaryExpression') {
    return {
      item: { baseRegister: ASM_REG(expression.temporaryID), multipliedConstant: 1 },
      instructions: [],
    };
  }
  if (expression.__type__ !== 'MidIRBinaryExpression') return null;
  const { operator, e1, e2 } = expression;
  const e2Constant = getMultipleOfConstant(e2);
  if (operator !== '*' || e2Constant == null) return null;
  const e1TilingResult = service.tileExpression(e1);
  return {
    item: { baseRegister: e1TilingResult.assemblyArgument, multipliedConstant: e2Constant },
    instructions: e1TilingResult.instructions,
  };
};

const tryTileRegisterWithDisplacement = (
  { operator, e1, e2 }: MidIRBinaryExpression,
  service: AssemblyTilingServiceBasic
): AssemblyMemoryTilingResult | null => {
  if (operator === '+') {
    const e2Constant = getConstantValue(e2);
    if (e2Constant == null) return null;
    const e1TilingResult = service.tileExpression(e1);
    return createAssemblyMemoryTilingResult(
      e1TilingResult.instructions,
      ASM_MEM_REG_WITH_CONST(e1TilingResult.assemblyArgument, ASM_CONST(e2Constant))
    );
  }
  return null;
};

const tryTileRegisterWithMultipleOf = (
  { operator, e1, e2 }: MidIRBinaryExpression,
  service: AssemblyTilingServiceBasic
): AssemblyMemoryTilingResult | null => {
  if (operator !== '+') return null;
  const multipleOfE2 = tryTileMultipleOf(e2, service);
  let result: AssemblyMemoryTilingResult | null = null;
  if (multipleOfE2 != null) {
    const e1TilingResult = service.tileExpression(e1);
    result = createAssemblyMemoryTilingResult(
      [...multipleOfE2.instructions, ...e1TilingResult.instructions],
      ASM_MEM_REG_WITH_MUL(e1TilingResult.assemblyArgument, multipleOfE2.item)
    );
  }
  const multipleOfE1 = tryTileMultipleOf(e1, service);
  // istanbul ignore next
  if (multipleOfE1 == null) return result;
  const e2TilingResult = service.tileExpression(e2);
  const anotherResult = createAssemblyMemoryTilingResult(
    [...multipleOfE1.instructions, ...e2TilingResult.instructions],
    ASM_MEM_REG_WITH_MUL(e2TilingResult.assemblyArgument, multipleOfE1.item)
  );
  return getTilingResultWithLowerCost(result, anotherResult);
};

const tryTileMultipleOfWithDisplacement = (
  { operator, e1, e2 }: MidIRBinaryExpression,
  service: AssemblyTilingServiceBasic
): AssemblyMemoryTilingResult | null => {
  if (operator !== '+') return null;
  const multipleOfE1 = tryTileMultipleOf(e1, service);
  const e2Constant = getConstantValue(e2);
  if (multipleOfE1 != null && e2Constant != null) {
    return createAssemblyMemoryTilingResult(
      multipleOfE1.instructions,
      ASM_MEM_MUL_WITH_CONST(multipleOfE1.item, ASM_CONST(e2Constant))
    );
  }
  return null;
};

const tryTileCompleteMemory = (
  expression: MidIRBinaryExpression,
  service: AssemblyTilingServiceBasic
): AssemblyMemoryTilingResult | null => {
  const { operator, e1, e2 } = expression;
  if (operator !== '+') return null;
  // case 1: one side is constant
  const e2Constant = getConstantValue(e2);
  if (e2Constant != null && e1.__type__ === 'MidIRBinaryExpression') {
    const e1TilingResult = tryTileRegisterWithMultipleOf(e1, service);
    if (e1TilingResult == null) return null;
    return createAssemblyMemoryTilingResult(
      e1TilingResult.instructions,
      ASM_MEM(
        e1TilingResult.assemblyArgument.baseRegister,
        e1TilingResult.assemblyArgument.multipleOf,
        ASM_CONST(e2Constant)
      )
    );
  }
  // case 2: one side is multiple of
  let potentialOpWithMultipleOf: MidIRBinaryExpression | null = null;
  let potentialMultipleOf = tryTileMultipleOf(e1, service);
  if (potentialMultipleOf != null && e2.__type__ === 'MidIRBinaryExpression') {
    potentialOpWithMultipleOf = e2;
  } else {
    potentialMultipleOf = tryTileMultipleOf(e2, service);
    if (potentialMultipleOf != null && e1.__type__ === 'MidIRBinaryExpression') {
      potentialOpWithMultipleOf = e1;
    }
  }
  let result: AssemblyMemoryTilingResult | null = null;
  if (potentialOpWithMultipleOf != null) {
    assertNotNull(potentialMultipleOf);
    const registerWithDisplacement = tryTileRegisterWithDisplacement(
      potentialOpWithMultipleOf,
      service
    );
    if (registerWithDisplacement != null) {
      result = createAssemblyMemoryTilingResult(
        [...potentialMultipleOf.instructions, ...registerWithDisplacement.instructions],
        ASM_MEM(
          registerWithDisplacement.assemblyArgument.baseRegister,
          potentialMultipleOf.item,
          registerWithDisplacement.assemblyArgument.displacementConstant
        )
      );
    }
  }
  // case 3: one side is reg (i.e. other side is multipleOf + constant)
  let potentialRegister: MidIRExpression;
  let potentialMultipleOfWithDisplacement: AssemblyMemoryTilingResult | null = null;
  if (e1.__type__ === 'MidIRBinaryExpression') {
    potentialMultipleOfWithDisplacement = tryTileMultipleOfWithDisplacement(e1, service);
    if (potentialMultipleOfWithDisplacement != null) {
      potentialRegister = e2;
    } else {
      return result;
    }
  } else if (e2.__type__ === 'MidIRBinaryExpression') {
    potentialMultipleOfWithDisplacement = tryTileMultipleOfWithDisplacement(e2, service);
    if (potentialMultipleOfWithDisplacement != null) {
      potentialRegister = e1;
    } else {
      return result;
    }
  } else {
    return result;
  }
  assertNotNull(potentialMultipleOfWithDisplacement);
  const potentialRegisterTilingResult = service.tileExpression(potentialRegister);
  return getTilingResultWithLowerCost(
    result,
    createAssemblyMemoryTilingResult(
      [
        ...potentialMultipleOfWithDisplacement.instructions,
        ...potentialRegisterTilingResult.instructions,
      ],
      ASM_MEM(
        potentialRegisterTilingResult.assemblyArgument,
        potentialMultipleOfWithDisplacement.assemblyArgument.multipleOf,
        potentialMultipleOfWithDisplacement.assemblyArgument.displacementConstant
      )
    )
  );
};

const getAssemblyMemoryTilingForMidIRExpression = (
  expression: MidIRExpression,
  service: AssemblyTilingServiceBasic
): AssemblyMemoryTilingResult | null => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression': {
      // good case 1: only displacement
      const value = expression.value;
      if (!bigIntIsWithin32BitIntegerRange(value)) return null;
      return createAssemblyMemoryTilingResult([], ASM_MEM_CONST(ASM_CONST(Number(value))));
    }
    case 'MidIRNameExpression':
      // special case: force name with rip
      return createAssemblyMemoryTilingResult(
        [ASM_COMMENT(`force named address with rip: ${expression.name}`)],
        ASM_MEM_REG_WITH_CONST(RIP, ASM_NAME(expression.name))
      );
    case 'MidIRTemporaryExpression':
      // good case 2: only base reg
      return createAssemblyMemoryTilingResult([], ASM_MEM_REG(ASM_REG(expression.temporaryID)));
    case 'MidIRImmutableMemoryExpression':
      return null;
    case 'MidIRBinaryExpression': {
      // good case 3: all three components!
      let result = tryTileCompleteMemory(expression, service);
      // good case 4: only multiple of
      const potentialMultipleOf = tryTileMultipleOf(expression, service);
      if (potentialMultipleOf != null) {
        result = getTilingResultWithLowerCost(
          result,
          createAssemblyMemoryTilingResult(
            potentialMultipleOf.instructions,
            ASM_MEM_MUL(potentialMultipleOf.item)
          )
        );
      }
      // good case 5: base reg with displacement
      const resultForRegWithDisplacement = tryTileRegisterWithDisplacement(expression, service);
      if (resultForRegWithDisplacement != null) {
        result = getTilingResultWithLowerCost(result, resultForRegWithDisplacement);
      }
      // good case 6: base reg with multiple of
      const resultForRegWithMultipleOf = tryTileRegisterWithMultipleOf(expression, service);
      if (resultForRegWithMultipleOf != null) {
        result = getTilingResultWithLowerCost(result, resultForRegWithMultipleOf);
      }
      // good case 7: multiple of with displacement
      const resultForMultipleOfWithDisplacement = tryTileMultipleOfWithDisplacement(
        expression,
        service
      );
      if (resultForMultipleOfWithDisplacement != null) {
        result = getTilingResultWithLowerCost(result, resultForMultipleOfWithDisplacement);
      }
      return result;
      // All 2^3 - 1 = 7 cases covered!
    }
  }
};

export default getAssemblyMemoryTilingForMidIRExpression;
