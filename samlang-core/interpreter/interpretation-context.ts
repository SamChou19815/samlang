import { FunctionValue, Value } from './value';

/**
 * Context for interpretation. It stores the previously computed values and references.
 * @param classes the class definitions that can be used as reference.
 * @param localValues the local values computed inside a function.
 */
export type InterpretationContext = {
  readonly classes: Readonly<Record<string, ClassValue | undefined>>;
  readonly localValues: Readonly<Record<string, Value | undefined>>;
};

/**
 * The context for one class.
 *
 * @param functions all the defined static functions inside the class definition.
 * @param methods all the defined instance methods inside the class definition.
 */
export type ClassValue = {
  readonly functions: Readonly<Record<string, FunctionValue | undefined>>;
  readonly methods: Readonly<Record<string, FunctionValue | undefined>>;
};

/**
 * An empty interpretation context. Used for initial setup for interpreter.
 */
export const EMPTY: InterpretationContext = {
  classes: {},
  localValues: {},
};
