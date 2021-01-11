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
  MidIRFunction,
  MidIRCompilationUnit,
  MidIRExpression,
} from 'samlang-core-ast/mir-nodes';
import { Long, assertNotNull, checkNotNull } from 'samlang-core-utils';

export class StackFrame {
  private variables = new Map<string, Long>();

  private _returnValue: Long | null = null;

  get returnValue(): Long | null {
    return this._returnValue;
  }

  setReturnValue(value: Long): void {
    this._returnValue = value;
  }

  getLocalValue(name: string): Long {
    return this.variables.get(name) ?? Long.ZERO;
  }

  setLocalValue(name: string, value: Long): void {
    this.variables.set(name, value);
  }
}

export type GeneralIREnvironment = {
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

type MidIRInterpreterMutableGlobalEnvironment = {
  // A collection of all available functions.
  readonly functions: ReadonlyMap<string, MidIRFunction>;
} & GeneralIREnvironment;

export const handleBuiltInFunctionCall = (
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

export const computeBinary = (operator: IROperator, value1: Long, value2: Long): Long => {
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
      return longOfBool(value1.lessThan(value2));
    case '<=':
      return longOfBool(value1.lessThanOrEqual(value2));
    case '>':
      return longOfBool(value1.greaterThan(value2));
    case '>=':
      return longOfBool(value1.greaterThanOrEqual(value2));
    case '==':
      return longOfBool(value1.equals(value2));
    case '!=':
      return longOfBool(value1.notEquals(value2));
  }
};

const interpretMidIRExpression = (
  environment: MidIRInterpreterMutableGlobalEnvironment,
  stackFrame: StackFrame,
  expression: MidIRExpression
): Long => {
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
      return stackFrame.getLocalValue(expression.name);
    case 'MidIRImmutableMemoryExpression': {
      const value = environment.heap.get(
        interpretMidIRExpression(environment, stackFrame, expression.indexExpression).toString()
      );
      // istanbul ignore next
      if (value == null) throw new Error();
      return value;
    }
    case 'MidIRBinaryExpression': {
      const value1 = interpretMidIRExpression(environment, stackFrame, expression.e1);
      const value2 = interpretMidIRExpression(environment, stackFrame, expression.e2);
      return computeBinary(expression.operator, value1, value2);
    }
  }
};

const interpretMidIRFunction = (
  environment: MidIRInterpreterMutableGlobalEnvironment,
  midIRFunction: MidIRFunction,
  functionArguments: readonly Long[]
): Long => {
  // istanbul ignore next
  if (functionArguments.length !== midIRFunction.argumentNames.length) throw new Error();
  const stackFrame = new StackFrame();
  midIRFunction.argumentNames.forEach((argumentName, index) => {
    stackFrame.setLocalValue(argumentName, checkNotNull(functionArguments[index]));
  });

  let programCounter = 0;
  const labelMapping = new Map<string, number>();
  midIRFunction.mainBodyStatements.forEach((statement, index) => {
    if (statement.__type__ === 'MidIRLabelStatement') {
      labelMapping.set(statement.name, index);
    }
  });

  let returnedValue: Long | null = null;
  while (returnedValue == null) {
    const statementToInterpret = midIRFunction.mainBodyStatements[programCounter];
    assertNotNull(statementToInterpret);

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
          ).toString(),
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
          ).notEquals(Long.ZERO)
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
          interpretMidIRExpression(environment, stackFrame, statementToInterpret.returnedExpression)
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
          const result = handleBuiltInFunctionCall(
            environment,
            functionName,
            functionArgumentValues
          );
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
          const nullableName = environment.functionsGlobals.get(functionAddress.toString());
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
  const globalVariables = new Map<string, Long>();
  const strings = new Map<string, string>();
  let heapPointer = Long.fromInt(10000);
  compilationUnit.globalVariables.forEach(({ name, content }) => {
    const location = heapPointer;
    globalVariables.set(name, location);
    strings.set(location.toString(), content);
    heapPointer = heapPointer.add(Long.fromInt(8));
  });
  const functionsGlobals = new Map<string, string>();
  compilationUnit.functions.forEach(({ functionName }) => {
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

const interpretMidIRCompilationUnit = (compilationUnit: MidIRCompilationUnit): string => {
  const environment = setupMidIRCompilationUnitIntepretationEnvironment(compilationUnit);
  const mainFunction = environment.functions.get(ENCODED_COMPILED_PROGRAM_MAIN);
  // istanbul ignore next
  if (mainFunction == null) throw new Error('Missing new function!');
  interpretMidIRFunction(environment, mainFunction, []);
  return environment.printed;
};

export default interpretMidIRCompilationUnit;
