import type { ModuleReference } from '../ast/common-nodes';

import {
  HashMap,
  HashSet,
  ReadonlyHashSet,
  hashMapOf,
  setOf,
  hashSetOf,
  assertNotNull,
} from 'samlang-core-utils';

/**
 * A centralized place to manage up-to-date dependency relationship.
 * It is particularly useful for incremental type checking.
 */
export default class DependencyTracker {
  /** [module] => what this module depends on */
  private readonly forwardDependency: HashMap<
    ModuleReference,
    ReadonlyHashSet<ModuleReference>
  > = hashMapOf();

  /** [module] => other modules depends on this module */
  private readonly reverseDependency: HashMap<
    ModuleReference,
    HashSet<ModuleReference>
  > = hashMapOf();

  getForwardDependencies(moduleReference: ModuleReference): ReadonlyHashSet<ModuleReference> {
    return this.forwardDependency.get(moduleReference) ?? setOf();
  }

  getReverseDependencies(moduleReference: ModuleReference): ReadonlyHashSet<ModuleReference> {
    return this.reverseDependency.get(moduleReference) ?? setOf();
  }

  /**
   * Update dependency tracker with `moduleReference` and `importedModules`.
   * If `importedModules` is null, it means that we want to remove `moduleReference` from system.
   */
  update(moduleReference: ModuleReference, importedModules?: readonly ModuleReference[]): void {
    const oldImportedModules = this.forwardDependency.get(moduleReference);
    if (oldImportedModules != null) {
      oldImportedModules.forEach((oldImportedModule) => {
        const reverseDependencySet = this.reverseDependency.get(oldImportedModule);
        // If things are consistent:
        //   then if B is A's forward dependency, then A must be B's reverse dependency.
        assertNotNull(reverseDependencySet);
        reverseDependencySet.delete(moduleReference);
      });
    }
    if (importedModules == null) {
      this.forwardDependency.delete(moduleReference);
      return;
    }
    this.forwardDependency.set(moduleReference, setOf(...importedModules));
    importedModules.forEach((newImportedModule) => {
      const reverseDependencies = this.reverseDependency.get(newImportedModule);
      if (reverseDependencies == null) {
        this.reverseDependency.set(newImportedModule, hashSetOf(moduleReference));
      } else {
        reverseDependencies?.add(moduleReference);
      }
    });
  }
}
