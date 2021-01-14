/* eslint-disable no-param-reassign */

import PanicException from './panic-exception';

import {
  ENCODED_FUNCTION_NAME_MALLOC,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_COMPILED_PROGRAM_MAIN,
} from 'samlang-core-ast/common-names';
import type { IROperator } from 'samlang-core-ast/common-operators';
import type {
  LLVMModule,
  LLVMFunction,
  LLVMValue,
  LLVMLabelInstruction,
} from 'samlang-core-ast/llvm-nodes';
import { Long, checkNotNull } from 'samlang-core-utils';

class StackFrame {
  private variables = new Map<string, Long>();

  private _returnValue: Long | null = null;

  get returnValue(): Long | null {
    return this._returnValue;
  }

  setReturnValue(value: Long): void {
    this._returnValue = value;
  }

  getLocalValue(name: string): Long {
    // istanbul ignore next
    return this.variables.get(name) ?? Long.ZERO;
  }

  setLocalValue(name: string, value: Long): void {
    this.variables.set(name, value);
  }
}

type GeneralIREnvironment = {
  // Global variable name to fake address mapping.
  readonly globalVariables: ReadonlyMap<string, Long>;
  // Fake function address to function name mapping.
  readonly functionsGlobals: ReadonlyMap<string, string>;
  // Strings generated at compile time and runtime.
  readonly strings: Map<string, string>;
  // Address to value mapping of heap.
  readonly heap: Map<string, Long>;
  heapPointer: Long;
  // A collection of already printed stuff.
  printed: string;
};

const handleBuiltInFunctionCall = (
  environment: GeneralIREnvironment,
  functionName: string,
  functionArgumentValues: readonly Long[]
): Long | null => {
  switch (functionName) {
    case ENCODED_FUNCTION_NAME_MALLOC: {
      const start = environment.heapPointer;
      environment.heapPointer = environment.heapPointer.add(
        checkNotNull(functionArgumentValues[0])
      );
      return start;
    }
    case ENCODED_FUNCTION_NAME_THROW: {
      const string = environment.strings.get(checkNotNull(functionArgumentValues[0]).toString());
      // istanbul ignore next
      if (string == null) throw new Error('Bad string!');
      throw new PanicException(string);
    }
    case ENCODED_FUNCTION_NAME_STRING_TO_INT: {
      const string = environment.strings.get(checkNotNull(functionArgumentValues[0]).toString());
      // istanbul ignore next
      if (string == null) throw new Error('Bad string!');
      try {
        BigInt(string);
        return Long.fromString(string);
      } catch {
        throw new PanicException(`Bad string: ${string}`);
      }
    }
    case ENCODED_FUNCTION_NAME_INT_TO_STRING: {
      const string = String(functionArgumentValues[0]);
      const location = environment.heapPointer;
      environment.heapPointer = environment.heapPointer.add(8);
      environment.strings.set(location.toString(), string);
      return location;
    }
    case ENCODED_FUNCTION_NAME_STRING_CONCAT: {
      const string1 = environment.strings.get(checkNotNull(functionArgumentValues[0]).toString());
      const string2 = environment.strings.get(checkNotNull(functionArgumentValues[1]).toString());
      // istanbul ignore next
      if (string1 == null || string2 == null) throw new Error('Bad string');
      const location = environment.heapPointer;
      environment.heapPointer = environment.heapPointer.add(8);
      environment.strings.set(location.toString(), string1 + string2);
      return location;
    }
    case ENCODED_FUNCTION_NAME_PRINTLN: {
      const string = environment.strings.get(checkNotNull(functionArgumentValues[0]).toString());
      // istanbul ignore next
      if (string == null) throw new Error('Bad string!');
      environment.printed += `${string}\n`;
      return Long.ZERO;
    }
    default:
      return null;
  }
};

const longOfBool = (b: boolean) => (b ? Long.ONE : Long.ZERO);

const computeBinary = (operator: IROperator, value1: Long, value2: Long): Long => {
  // istanbul ignore next
  switch (operator) {
    case '+':
      return value1.add(value2);
    case '-':
      return value1.subtract(value2);
    case '*':
      return value1.multiply(value2);
    case '/':
      if (value2.equals(Long.ZERO)) throw new PanicException('Division by zero!');
      return value1.divide(value2);
    case '%':
      if (value2.equals(Long.ZERO)) throw new PanicException('Mod by zero!');
      return value1.mod(value2);
    case '^':
      return value1.xor(value2);
    case '<':
      // istanbul ignore next
      return longOfBool(value1.lessThan(value2));
    case '<=':
      return longOfBool(value1.lessThanOrEqual(value2));
    case '>':
      // istanbul ignore next
      return longOfBool(value1.greaterThan(value2));
    case '>=':
      return longOfBool(value1.greaterThanOrEqual(value2));
    case '==':
      return longOfBool(value1.equals(value2));
    case '!=':
      return longOfBool(value1.notEquals(value2));
  }
};

type LLVMInterpreterMutableGlobalEnvironment = {
  // A collection of all available functions.
  readonly functions: ReadonlyMap<string, LLVMFunction>;
} & GeneralIREnvironment;

const interpretLLVMValue = (
  environment: LLVMInterpreterMutableGlobalEnvironment,
  stackFrame: StackFrame,
  expression: LLVMValue
): Long => {
  switch (expression.__type__) {
    case 'LLVMLiteral':
      return expression.value;
    case 'LLVMName': {
      const value = environment.globalVariables.get(expression.name);
      // istanbul ignore next
      if (value == null) throw new Error(`Referencing undefined global ${expression.name}.`);
      return value;
    }
    case 'LLVMVariable':
      return stackFrame.getLocalValue(expression.name);
  }
};

const interpretLLVMFunction = (
  environment: LLVMInterpreterMutableGlobalEnvironment,
  llvmFunction: LLVMFunction,
  functionArguments: readonly Long[]
): Long => {
  // istanbul ignore next
  if (functionArguments.length !== llvmFunction.parameters.length) throw new Error();
  const stackFrame = new StackFrame();
  llvmFunction.parameters.forEach(({ parameterName }, index) => {
    stackFrame.setLocalValue(parameterName, checkNotNull(functionArguments[index]));
  });

  let programCounter = 0;
  let lastFromLabel = (llvmFunction.body[0] as LLVMLabelInstruction).name;
  let currentLabel = lastFromLabel;
  const labelMapping = new Map<string, number>();
  llvmFunction.body.forEach((instruction, index) => {
    if (instruction.__type__ === 'LLVMLabelInstruction') {
      labelMapping.set(instruction.name, index);
    }
  });

  let returnedValue: Long | null = null;
  while (returnedValue == null) {
    const instructionToInterpret = checkNotNull(llvmFunction.body[programCounter]);

    switch (instructionToInterpret.__type__) {
      case 'LLVMCastInstruction':
        stackFrame.setLocalValue(
          instructionToInterpret.resultVariable,
          interpretLLVMValue(environment, stackFrame, instructionToInterpret.sourceValue)
        );
        programCounter += 1;
        break;

      case 'LLVMGetElementPointerInstruction': {
        const pointer = interpretLLVMValue(
          environment,
          stackFrame,
          instructionToInterpret.sourceValue
        ).add(instructionToInterpret.offset * 8);
        stackFrame.setLocalValue(instructionToInterpret.resultVariable, pointer);
        programCounter += 1;
        break;
      }

      case 'LLVMBinaryInstruction':
        stackFrame.setLocalValue(
          instructionToInterpret.resultVariable,
          computeBinary(
            instructionToInterpret.operator,
            interpretLLVMValue(environment, stackFrame, instructionToInterpret.v1),
            interpretLLVMValue(environment, stackFrame, instructionToInterpret.v2)
          )
        );
        programCounter += 1;
        break;

      case 'LLVMLoadInstruction':
        stackFrame.setLocalValue(
          instructionToInterpret.resultVariable,
          checkNotNull(
            environment.heap.get(
              stackFrame.getLocalValue(instructionToInterpret.sourceVariable).toString()
            )
          )
        );
        programCounter += 1;
        break;

      case 'LLVMStoreInstruction':
        environment.heap.set(
          stackFrame.getLocalValue(instructionToInterpret.targetVariable).toString(),
          interpretLLVMValue(environment, stackFrame, instructionToInterpret.sourceValue)
        );
        programCounter += 1;
        break;

      case 'LLVMPhiInstruction':
        stackFrame.setLocalValue(
          instructionToInterpret.resultVariable,
          interpretLLVMValue(
            environment,
            stackFrame,
            checkNotNull(
              instructionToInterpret.valueBranchTuples?.find((it) => it.branch === lastFromLabel)
            ).value
          )
        );
        programCounter += 1;
        break;

      case 'LLVMLabelInstruction':
        lastFromLabel = currentLabel;
        currentLabel = instructionToInterpret.name;
        programCounter += 1;
        break;

      case 'LLVMJumpInstruction': {
        const target = labelMapping.get(instructionToInterpret.branch);
        // istanbul ignore next
        if (target == null) throw new Error(`Bad label ${instructionToInterpret.branch}!`);
        programCounter = target;
        break;
      }

      case 'LLVMConditionalJumpInstruction': {
        const condition = interpretLLVMValue(
          environment,
          stackFrame,
          instructionToInterpret.condition
        );
        const labelToJump = condition.notEquals(Long.ZERO)
          ? instructionToInterpret.b1
          : instructionToInterpret.b2;
        const target = labelMapping.get(labelToJump);
        // istanbul ignore next
        if (target == null) throw new Error(`Bad label ${labelToJump}!`);
        programCounter = target;
        break;
      }

      case 'LLVMSwitchInstruction': {
        const caseNumber = interpretLLVMValue(
          environment,
          stackFrame,
          instructionToInterpret.condition
        ).toInt();
        const labelToJump =
          instructionToInterpret.otherBranchNameWithValues.find((it) => it.value === caseNumber)
            ?.branch ?? instructionToInterpret.defaultBranchName;
        const target = labelMapping.get(labelToJump);
        // istanbul ignore next
        if (target == null) throw new Error(`Bad label ${labelToJump}!`);
        programCounter = target;
        break;
      }

      case 'LLVMReturnInstruction':
        stackFrame.setReturnValue(
          interpretLLVMValue(environment, stackFrame, instructionToInterpret.value)
        );
        break;

      case 'LLVMFunctionCallInstruction': {
        const functionArgumentValues = instructionToInterpret.functionArguments.map((it) =>
          interpretLLVMValue(environment, stackFrame, it.value)
        );
        const functionExpression = instructionToInterpret.functionName;
        let functionName: string;
        if (functionExpression.__type__ === 'LLVMName') {
          functionName = functionExpression.name;
          const result = handleBuiltInFunctionCall(
            environment,
            functionName,
            functionArgumentValues
          );
          if (result != null) {
            if (instructionToInterpret.resultVariable != null) {
              stackFrame.setLocalValue(instructionToInterpret.resultVariable, result);
            }
            programCounter += 1;
            break;
          }
        } else {
          const functionAddress = interpretLLVMValue(environment, stackFrame, functionExpression);
          const nullableName = environment.functionsGlobals.get(functionAddress.toString());
          // istanbul ignore next
          if (nullableName == null) throw new Error(`Undefined function at ${functionAddress}!`);
          functionName = nullableName;
        }

        const functionToCall = environment.functions.get(functionName);
        // istanbul ignore next
        if (functionToCall == null) throw new Error(`Missing function ${functionName}`);
        const result = interpretLLVMFunction(environment, functionToCall, functionArgumentValues);
        if (instructionToInterpret.resultVariable != null) {
          stackFrame.setLocalValue(instructionToInterpret.resultVariable, result);
        }
        programCounter += 1;
        break;
      }
    }

    returnedValue = stackFrame.returnValue;
  }

  return returnedValue;
};

const setupLLVMInterpretationEnvironment = (
  llvmModule: LLVMModule
): LLVMInterpreterMutableGlobalEnvironment => {
  const functions = new Map(llvmModule.functions.map((it) => [it.name, it]));
  const globalVariables = new Map<string, Long>();
  const strings = new Map<string, string>();
  let heapPointer = Long.fromInt(10000);
  llvmModule.globalVariables.forEach(({ name, content }) => {
    const location = heapPointer;
    globalVariables.set(name, location);
    strings.set(location.toString(), content);
    heapPointer = heapPointer.add(Long.fromInt(8));
  });
  const functionsGlobals = new Map<string, string>();
  llvmModule.functions.forEach(({ name: functionName }) => {
    const location = heapPointer;
    globalVariables.set(functionName, location);
    functionsGlobals.set(location.toString(), functionName);
    heapPointer = heapPointer.add(Long.fromInt(8));
  });
  return {
    functions,
    globalVariables,
    strings,
    functionsGlobals,
    heap: new Map(),
    heapPointer,
    printed: '',
  };
};

const interpretLLVMModule = (llvmModule: LLVMModule): string => {
  const environment = setupLLVMInterpretationEnvironment(llvmModule);
  const mainFunction = environment.functions.get(ENCODED_COMPILED_PROGRAM_MAIN);
  // istanbul ignore next
  if (mainFunction == null) throw new Error('Missing new function!');
  interpretLLVMFunction(environment, mainFunction, []);
  return environment.printed;
};

export default interpretLLVMModule;
