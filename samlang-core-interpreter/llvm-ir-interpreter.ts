/* eslint-disable no-param-reassign */

import {
  ENCODED_FUNCTION_NAME_MALLOC,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_FREE,
} from 'samlang-core-ast/common-names';
import type { IROperator } from 'samlang-core-ast/common-operators';
import type {
  LLVMSources,
  LLVMFunction,
  LLVMValue,
  LLVMLabelInstruction,
} from 'samlang-core-ast/llvm-nodes';
import { checkNotNull, zip, assert } from 'samlang-core-utils';

import PanicException from './panic-exception';

class StackFrame {
  private variables = new Map<string, number>();

  private _returnValue: number | null = null;

  get returnValue(): number | null {
    return this._returnValue;
  }

  setReturnValue(value: number): void {
    this._returnValue = value;
  }

  getLocalValue(name: string): number {
    return this.variables.get(name) ?? 0;
  }

  setLocalValue(name: string, value: number): void {
    this.variables.set(name, value);
  }
}

type GeneralIREnvironment = {
  // Global variable name to fake address mapping.
  readonly globalVariables: ReadonlyMap<string, number>;
  // Fake function address to function name mapping.
  readonly functionsGlobals: ReadonlyMap<number, string>;
  // Strings generated at compile time and runtime.
  readonly strings: Map<string, string>;
  // Address to value mapping of heap.
  readonly heap: Map<string, number>;
  heapPointer: number;
  // A collection of already printed stuff.
  printed: string;
};

function handleBuiltInFunctionCall(
  environment: GeneralIREnvironment,
  functionName: string,
  functionArgumentValues: readonly number[]
): number | null {
  switch (functionName) {
    case ENCODED_FUNCTION_NAME_MALLOC: {
      const start = environment.heapPointer;
      environment.heapPointer = environment.heapPointer + checkNotNull(functionArgumentValues[0]);
      return start;
    }
    case ENCODED_FUNCTION_NAME_THROW: {
      const string = checkNotNull(
        environment.strings.get(checkNotNull(functionArgumentValues[0]).toString()),
        'Bad string!'
      );
      throw new PanicException(string);
    }
    case ENCODED_FUNCTION_NAME_STRING_TO_INT: {
      const string = checkNotNull(
        environment.strings.get(checkNotNull(functionArgumentValues[0]).toString()),
        'Bad string!'
      );
      const result = parseInt(string, 10);
      if (isNaN(result)) throw new PanicException(`Bad string: ${string}`);
      return result;
    }
    case ENCODED_FUNCTION_NAME_INT_TO_STRING: {
      const string = String(functionArgumentValues[0]);
      const location = environment.heapPointer;
      environment.heapPointer = environment.heapPointer + 4;
      environment.strings.set(location.toString(), string);
      return location;
    }
    case ENCODED_FUNCTION_NAME_STRING_CONCAT: {
      const string1 = environment.strings.get(checkNotNull(functionArgumentValues[0]).toString());
      const string2 = environment.strings.get(checkNotNull(functionArgumentValues[1]).toString());
      assert(string1 != null && string2 != null, 'Bad string');
      const location = environment.heapPointer;
      environment.heapPointer = environment.heapPointer + 4;
      environment.strings.set(location.toString(), string1 + string2);
      return location;
    }
    case ENCODED_FUNCTION_NAME_PRINTLN: {
      const string = checkNotNull(
        environment.strings.get(checkNotNull(functionArgumentValues[0]).toString()),
        'Bad string!'
      );
      environment.printed += `${string}\n`;
      return 0;
    }
    case ENCODED_FUNCTION_NAME_FREE:
      return 0;
    default:
      return null;
  }
}

const longOfBool = (b: boolean) => (b ? 1 : 0);

function computeBinary(operator: IROperator, value1: number, value2: number): number {
  switch (operator) {
    case '+':
      return value1 + value2;
    case '-':
      return value1 - value2;
    case '*':
      return value1 * value2;
    case '/': {
      if (value2 === 0) throw new PanicException('Division by zero!');
      const result = value1 / value2;
      return result >= 0 ? Math.floor(result) : Math.ceil(result);
    }
    case '%':
      if (value2 === 0) throw new PanicException('Mod by zero!');
      return value1 % value2;
    case '^':
      return value1 ^ value2;
    case '<':
      return longOfBool(value1 < value2);
    case '<=':
      return longOfBool(value1 <= value2);
    case '>':
      return longOfBool(value1 > value2);
    case '>=':
      return longOfBool(value1 >= value2);
    case '==':
      return longOfBool(value1 === value2);
    case '!=':
      return longOfBool(value1 !== value2);
  }
}

type LLVMInterpreterMutableGlobalEnvironment = {
  // A collection of all available functions.
  readonly functions: ReadonlyMap<string, LLVMFunction>;
} & GeneralIREnvironment;

function interpretLLVMValue(
  environment: LLVMInterpreterMutableGlobalEnvironment,
  stackFrame: StackFrame,
  expression: LLVMValue
): number {
  switch (expression.__type__) {
    case 'LLVMLiteral':
      return expression.value;
    case 'LLVMName': {
      const value = checkNotNull(
        environment.globalVariables.get(expression.name),
        `Referencing undefined global ${expression.name}.`
      );
      return value;
    }
    case 'LLVMVariable':
      return stackFrame.getLocalValue(expression.name);
  }
}

function interpretLLVMFunction(
  environment: LLVMInterpreterMutableGlobalEnvironment,
  llvmFunction: LLVMFunction,
  functionArguments: readonly number[]
): number {
  assert(functionArguments.length === llvmFunction.parameters.length);
  const stackFrame = new StackFrame();
  zip(llvmFunction.parameters, functionArguments).forEach(([{ parameterName }, argument]) => {
    stackFrame.setLocalValue(parameterName, argument);
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

  let returnedValue: number | null = null;
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
        const pointer =
          interpretLLVMValue(environment, stackFrame, instructionToInterpret.sourceValue) +
          instructionToInterpret.offset * 4;
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
        const target = checkNotNull(
          labelMapping.get(instructionToInterpret.branch),
          `Bad label ${instructionToInterpret.branch}!`
        );
        programCounter = target;
        break;
      }

      case 'LLVMConditionalJumpInstruction': {
        const condition = interpretLLVMValue(
          environment,
          stackFrame,
          instructionToInterpret.condition
        );
        const labelToJump = condition !== 0 ? instructionToInterpret.b1 : instructionToInterpret.b2;
        const target = checkNotNull(labelMapping.get(labelToJump), `Bad label ${labelToJump}!`);
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
          functionName = checkNotNull(
            environment.functionsGlobals.get(functionAddress),
            `Undefined function at ${functionAddress}!`
          );
        }

        const functionToCall = checkNotNull(
          environment.functions.get(functionName),
          `Missing function ${functionName}`
        );
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
}

export function setupLLVMInterpretationEnvironment(
  llvmSources: LLVMSources
): LLVMInterpreterMutableGlobalEnvironment {
  const functions = new Map(llvmSources.functions.map((it) => [it.name, it]));
  const globalVariables = new Map<string, number>();
  const strings = new Map<string, string>();
  let heapPointer = 10000;
  llvmSources.globalVariables.forEach(({ name, content }) => {
    const location = heapPointer;
    globalVariables.set(name, location);
    strings.set(location.toString(), content);
    heapPointer = heapPointer + 4;
  });
  const functionsGlobals = new Map<number, string>();
  llvmSources.functions.forEach(({ name: functionName }) => {
    const location = heapPointer;
    globalVariables.set(functionName, location);
    functionsGlobals.set(location, functionName);
    heapPointer = heapPointer + 4;
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
}

export function interpretLLVMSources(
  environment: LLVMInterpreterMutableGlobalEnvironment,
  mainFunctionName: string
): string {
  const mainFunction = checkNotNull(
    environment.functions.get(mainFunctionName),
    `Missing new function ${mainFunctionName}!`
  );
  interpretLLVMFunction(environment, mainFunction, []);
  return environment.printed;
}
