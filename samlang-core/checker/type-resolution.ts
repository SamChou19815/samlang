import type { SamlangType, SamlangUndecidedType } from '../ast/samlang-nodes';
import { assert, checkNotNull, UnionFind } from '../utils';
import typeResolver from './type-resolver';

/** A provider of type resolution to previously undecided types. */
export interface ReadOnlyTypeResolution {
  /**
   * Given an undecided type, try to find the partially resolved type (which may still contain nested undecided
   * types) and return it. If it's not found in the resolution, return the original undecided type.
   */
  getPartiallyResolvedType(undecidedType: SamlangUndecidedType): SamlangType;

  /** Fully resolve an potentially [unresolvedType]. */
  resolveType(unresolvedType: SamlangType): SamlangType;
}

export default class TypeResolution implements ReadOnlyTypeResolution {
  /** The union find used to manage the potential complex aliasing relation between different undecided types. */
  private readonly indexAliasingUnionFind = new UnionFind();

  /**
   * A collection of known mappings between the undecided type index and the resolved types.
   * In particular:
   * - the key of the map is almost the root index in the above union find.
   * - the value of the map always represents the best knowledge of the type. i.e. we try to resolve as many undecided
   *   type as possible.
   */
  private readonly knownResolutions: Map<number, SamlangType> = new Map();

  /**
   * Refresh all the known mappings to ensure it represents the best knowledge we have.
   * Need to be called after each update in the knownResolutions or aliasing relation.
   */
  private refreshKnownMappings() {
    const keyCorrectMappings = Array.from(this.knownResolutions.entries()).map(
      ([key, currentValue]) =>
        [this.indexAliasingUnionFind.findRoot(key), this.resolveType(currentValue)] as const
    );
    this.knownResolutions.clear();
    keyCorrectMappings.forEach(([key, value]) => {
      this.knownResolutions.set(key, value);
    });
  }

  getPartiallyResolvedType = (undecidedType: SamlangUndecidedType): SamlangType => {
    const rootIndex = this.indexAliasingUnionFind.findRoot(undecidedType.index);
    return this.knownResolutions.get(rootIndex) ?? { type: 'UndecidedType', index: rootIndex };
  };

  resolveType = (unresolvedType: SamlangType): SamlangType =>
    typeResolver(unresolvedType, this.getPartiallyResolvedType);

  /**
   * Establish an aliasing relation between [undecidedType1] and [undecidedType2].
   *
   * It will either return the known type that both share or an error indicating there is an inconsistency.
   */
  establishAliasing(
    undecidedType1: SamlangUndecidedType,
    undecidedType2: SamlangUndecidedType,
    meet: (t1: SamlangType, t2: SamlangType) => SamlangType
  ): SamlangType {
    const t1 = this.getPartiallyResolvedType(undecidedType1);
    const t2 = this.getPartiallyResolvedType(undecidedType2);
    if (t1.type !== 'UndecidedType' && t2.type !== 'UndecidedType') {
      return meet(t1, t2);
    }
    const commonRoot = this.indexAliasingUnionFind.link(undecidedType1.index, undecidedType2.index);
    this.refreshKnownMappings();
    return this.knownResolutions.get(commonRoot) ?? undecidedType1;
  }

  /**
   * Try to add the resolution decision for a (potentially) currently undecided type.
   *
   * It will either return an error indicating there is an inconsistency of knowledge or
   * the best knowledge of the known type.
   */
  addTypeResolution(undecidedTypeIndex: number, decidedType: SamlangType): SamlangType {
    assert(decidedType.type !== 'UndecidedType', 'Use establishAliasing() instead!');

    const rootOfUndecidedTypeIndex = this.indexAliasingUnionFind.findRoot(undecidedTypeIndex);
    const resolvedDecidedType = this.resolveType(decidedType);
    const existingMapping = this.knownResolutions.get(rootOfUndecidedTypeIndex);
    if (existingMapping == null) {
      // If the mapping is entirely new, we can confidently use it.
      this.knownResolutions.set(rootOfUndecidedTypeIndex, resolvedDecidedType);
      // We need to refresh because we have more information.
      this.refreshKnownMappings();
      // Return the best knowledge we have.
      const resolved = checkNotNull(this.knownResolutions.get(rootOfUndecidedTypeIndex));
      return resolved;
    }
    return existingMapping;
  }
}
