/**
 * Reference to a samlang module.
 * This class, instead of a filename string, should be used to point to a module during type checking
 * and code generation.
 */
export default class ModuleReference {
  /**
   * The root module that can never be referenced in the source code.
   * It can be used as a starting point for cyclic dependency analysis,
   * since it cannot be named according to the syntax so no module can depend on it.
   */
  static readonly ROOT: ModuleReference = new ModuleReference([]);

  constructor(public readonly parts: readonly string[]) {}

  readonly toString = (): string => this.parts.join('.');

  readonly toFilename = (): string => `${this.parts.join('/')}.sam`;
}
