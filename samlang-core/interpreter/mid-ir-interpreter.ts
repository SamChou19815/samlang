/* eslint-disable no-param-reassign */

import {
  ENCODED_FUNCTION_NAME_MALLOC,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_COMPILED_PROGRAM_MAIN,
} from '../ast/common-names';
import type { MidIRExpression, MidIRFunction, MidIRCompilationUnit } from '../ast/mir-nodes';
import PanicException from './panic-exception';

class StackFrame {
  private variables = new Map<string, bigint>();

  private _returnValue: bigint | null = null;

  get returnValue(): bigint | null {
    return this._returnValue;
  }

  setReturnValue(value: bigint): void {
    this._returnValue = value;
  }

  getLocalValue(name: string): bigint {
    return this.variables.get(name) ?? BigInt(0);
  }

  setLocalValue(name: string, value: bigint) {
    this.variables.set(name, value);
  }
}

type MidIRInterpreterMutableGlobalEnvironment = {
  // A collection of all available functions.
  readonly functions: ReadonlyMap<string, MidIRFunction>;
  // Global variable name to fake address mapping.
  readonly globalVariables: ReadonlyMap<string, bigint>;
  // Fake function address to function name mapping.
  readonly functionsGlobals: ReadonlyMap<bigint, string>;
  // Strings generated at compile time and runtime.
  readonly strings: Map<bigint, string>;
  // Address to value mapping of heap.
  readonly heap: Map<bigint, bigint>;
  heapPointer: bigint;
  // A collection of already printed stuff.
  printed: string;
};

const interpretMidIRExpression = (
  environment: MidIRInterpreterMutableGlobalEnvironment,
  stackFrame: StackFrame,
  expression: MidIRExpression
): bigint => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
      return expression.value;
    case 'MidIRNameExpression': {
      const value = environment.globalVariables.get(expression.name);
      // istanbul ignore next
      if (value == null) throw new Error(`Referencing undefined global ${expression.name}.`);
      return value;
    }
    case 'MidIRTemporaryExpression':
      return stackFrame.getLocalValue(expression.temporaryID);
    case 'MidIRImmutableMemoryExpression': {
      const value = environment.heap.get(
        interpretMidIRExpression(environment, stackFrame, expression.indexExpression)
      );
      // istanbul ignore next
      if (value == null) throw new Error();
      return value;
    }
    case 'MidIRBinaryExpression': {
      const value1 = interpretMidIRExpression(environment, stackFrame, expression.e1);
      const value2 = interpretMidIRExpression(environment, stackFrame, expression.e2);
      switch (expression.operator) {
        case '+':
          return value1 + value2;
        case '-':
          return value1 - value2;
        case '*':
          return value1 * value2;
        case '/':
          if (value2 === BigInt(0)) throw new PanicException('Division by zero!');
          return value1 / value2;
        case '%':
          if (value2 === BigInt(0)) throw new PanicException('Mod by zero!');
          return value1 % value2;
        case '^':
          // eslint-disable-next-line no-bitwise
          return value1 ^ value2;
        case '<':
          return BigInt(value1 < value2);
        case '<=':
          return BigInt(value1 <= value2);
        case '>':
          return BigInt(value1 > value2);
        case '>=':
          return BigInt(value1 >= value2);
        case '==':
          return BigInt(value1 === value2);
        case '!=':
          return BigInt(value1 !== value2);
      }
    }
  }
};

const interpretMidIRFunction = (
  environment: MidIRInterpreterMutableGlobalEnvironment,
  midIRFunction: MidIRFunction,
  functionArguments: readonly bigint[]
): bigint => {
  // istanbul ignore next
  if (functionArguments.length !== midIRFunction.argumentNames.length) throw new Error();
  const stackFrame = new StackFrame();
  midIRFunction.argumentNames.forEach((argumentName, index) => {
    stackFrame.setLocalValue(argumentName, functionArguments[index]);
  });

  let programCounter = 0;
  const labelMapping = new Map<string, number>();
  midIRFunction.mainBodyStatements.forEach((statement, index) => {
    if (statement.__type__ === 'MidIRLabelStatement') {
      labelMapping.set(statement.name, index);
    }
  });

  let returnedValue: bigint | null = null;
  while (returnedValue == null) {
    const statementToInterpret = midIRFunction.mainBodyStatements[programCounter];

    switch (statementToInterpret.__type__) {
      case 'MidIRMoveTempStatement':
        stackFrame.setLocalValue(
          statementToInterpret.temporaryID,
          interpretMidIRExpression(environment, stackFrame, statementToInterpret.source)
        );
        programCounter += 1;
        break;

      case 'MidIRMoveMemStatement':
        environment.heap.set(
          interpretMidIRExpression(
            environment,
            stackFrame,
            statementToInterpret.memoryIndexExpression
          ),
          interpretMidIRExpression(environment, stackFrame, statementToInterpret.source)
        );
        programCounter += 1;
        break;

      case 'MidIRJumpStatement': {
        const target = labelMapping.get(statementToInterpret.label);
        // istanbul ignore next
        if (target == null) throw new Error(`Bad label ${statementToInterpret.label}!`);
        programCounter = target;
        break;
      }

      case 'MidIRLabelStatement':
        programCounter += 1;
        break;

      case 'MidIRConditionalJumpFallThrough':
        if (
          interpretMidIRExpression(
            environment,
            stackFrame,
            statementToInterpret.conditionExpression
          ) !== BigInt(0)
        ) {
          const target = labelMapping.get(statementToInterpret.label1);
          // istanbul ignore next
          if (target == null) throw new Error(`Bad label ${statementToInterpret.label1}!`);
          programCounter = target;
        } else {
          programCounter += 1;
        }
        break;

      case 'MidIRReturnStatement':
        stackFrame.setReturnValue(
          statementToInterpret.returnedExpression != null
            ? interpretMidIRExpression(
                environment,
                stackFrame,
                statementToInterpret.returnedExpression
              )
            : BigInt(0)
        );
        break;

      case 'MidIRCallFunctionStatement': {
        const functionArgumentValues = statementToInterpret.functionArguments.map((it) =>
          interpretMidIRExpression(environment, stackFrame, it)
        );
        const functionExpression = statementToInterpret.functionExpression;
        let functionName: string;
        if (functionExpression.__type__ === 'MidIRNameExpression') {
          functionName = functionExpression.name;
          let result: bigint | null;
          switch (functionName) {
            case ENCODED_FUNCTION_NAME_MALLOC: {
              const start = environment.heapPointer;
              environment.heapPointer += functionArgumentValues[0];
              result = start;
              break;
            }
            case ENCODED_FUNCTION_NAME_THROW: {
              const string = environment.strings.get(functionArgumentValues[0]);
              // istanbul ignore next
              if (string == null) throw new Error('Bad string!');
              throw new PanicException(string);
            }
            case ENCODED_FUNCTION_NAME_STRING_TO_INT: {
              const string = environment.strings.get(functionArgumentValues[0]);
              // istanbul ignore next
              if (string == null) throw new Error('Bad string!');
              try {
                result = BigInt(string);
                break;
              } catch {
                throw new PanicException(`Bad string: ${string}`);
              }
            }
            case ENCODED_FUNCTION_NAME_INT_TO_STRING: {
              const string = String(functionArgumentValues[0]);
              const location = environment.heapPointer;
              environment.heapPointer += BigInt(8);
              environment.strings.set(location, string);
              result = location;
              break;
            }
            case ENCODED_FUNCTION_NAME_STRING_CONCAT: {
              const string1 = environment.strings.get(functionArgumentValues[0]);
              const string2 = environment.strings.get(functionArgumentValues[1]);
              // istanbul ignore next
              if (string1 == null || string2 == null) throw new Error('Bad string');
              const location = environment.heapPointer;
              environment.heapPointer += BigInt(8);
              environment.strings.set(location, string1 + string2);
              result = location;
              break;
            }
            case ENCODED_FUNCTION_NAME_PRINTLN: {
              const string = environment.strings.get(functionArgumentValues[0]);
              // istanbul ignore next
              if (string == null) throw new Error('Bad string!');
              environment.printed += `${string}\n`;
              result = BigInt(0);
              break;
            }
            default:
              result = null;
          }
          if (result != null) {
            if (statementToInterpret.returnCollectorTemporaryID != null) {
              stackFrame.setLocalValue(statementToInterpret.returnCollectorTemporaryID, result);
            }
            programCounter += 1;
            break;
          }
        } else {
          const functionAddress = interpretMidIRExpression(
            environment,
            stackFrame,
            functionExpression
          );
          const nullableName = environment.functionsGlobals.get(functionAddress);
          // istanbul ignore next
          if (nullableName == null) throw new Error(`Undefined function at ${functionAddress}!`);
          functionName = nullableName;
        }

        const functionToCall = environment.functions.get(functionName);
        // istanbul ignore next
        if (functionToCall == null) throw new Error(`Missing function ${functionName}`);
        const result = interpretMidIRFunction(environment, functionToCall, functionArgumentValues);
        if (statementToInterpret.returnCollectorTemporaryID != null) {
          stackFrame.setLocalValue(statementToInterpret.returnCollectorTemporaryID, result);
        }
        programCounter += 1;
        break;
      }
    }

    returnedValue = stackFrame.returnValue;
  }

  return returnedValue;
};

const setupMidIRCompilationUnitIntepretationEnvironment = (
  compilationUnit: MidIRCompilationUnit
): MidIRInterpreterMutableGlobalEnvironment => {
  const functions = new Map(compilationUnit.functions.map((it) => [it.functionName, it]));
  const globalVariables = new Map<string, bigint>();
  const strings = new Map<bigint, string>();
  let heapPointer = BigInt(10000);
  compilationUnit.globalVariables.forEach(({ name, content }) => {
    const location = heapPointer;
    globalVariables.set(name, location);
    strings.set(location + BigInt(8), content);
    heapPointer += BigInt(8);
  });
  const functionsGlobals = new Map<bigint, string>();
  compilationUnit.functions.forEach(({ functionName }) => {
    const location = heapPointer;
    globalVariables.set(functionName, location);
    functionsGlobals.set(location, functionName);
    heapPointer += BigInt(8);
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

const interpretMidIRCompilationUnit = (compilationUnit: MidIRCompilationUnit): string => {
  const environment = setupMidIRCompilationUnitIntepretationEnvironment(compilationUnit);
  const mainFunction = environment.functions.get(ENCODED_COMPILED_PROGRAM_MAIN);
  // istanbul ignore next
  if (mainFunction == null) throw new Error('Missing new function!');
  interpretMidIRFunction(environment, mainFunction, []);
  return environment.printed;
};

export default interpretMidIRCompilationUnit;
