import { FunctionValue, Value } from "./value";

/**
 * Context for interpretation. It stores the previously computed values and references.
 * @param classes the class definitions that can be used as reference.
 * @param localValues the local values computed inside a function.
 */
export type InterpretationContext = {
  readonly classes: Map<string, ClassValue>;
  readonly localValues: Map<string, Value>;
}

/**
 * The context for one class.
 *
 * @param functions all the defined static functions inside the class definition.
 * @param methods all the defined instance methods inside the class definition.
 */
export type ClassValue = {
  readonly functions: Map<string, FunctionValue>;
  readonly methods: Map<string, FunctionValue>;
}

/**
 * An empty interpretation context. Used for initial setup for interpreter.
 */
export const EMPTY: InterpretationContext = {
  classes: new Map(),
  localValues: new Map(),
}


