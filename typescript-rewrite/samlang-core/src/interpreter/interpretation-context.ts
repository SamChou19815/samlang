import { mapEquals } from '../util/collections';
import { FunctionValue, Value, isSameValue } from './value';

/**
 * Context for interpretation. It stores the previously computed values and references.
 * @param classes the class definitions that can be used as reference.
 * @param localValues the local values computed inside a function.
 */
export type InterpretationContext = {
  readonly classes: Map<string, ClassValue>;
  readonly localValues: Map<string, Value>;
};

/**
 * The context for one class.
 *
 * @param functions all the defined static functions inside the class definition.
 * @param methods all the defined instance methods inside the class definition.
 */
export type ClassValue = {
  readonly functions: Map<string, FunctionValue>;
  readonly methods: Map<string, FunctionValue>;
};

/**
 * An empty interpretation context. Used for initial setup for interpreter.
 */
export const EMPTY: InterpretationContext = {
  classes: new Map(),
  localValues: new Map(),
};

export const isSameClassValue = (c1: ClassValue, c2: ClassValue): boolean => {
  return (
    mapEquals(c1.functions, c2.functions, isSameValue) &&
    mapEquals(c1.methods, c2.methods, isSameValue)
  );
};

export const isSameContext = (c1: InterpretationContext, c2: InterpretationContext): boolean => {
  return (
    mapEquals(c1.classes, c2.classes, isSameClassValue) &&
    mapEquals(c1.localValues, c2.localValues, isSameValue)
  );
};
