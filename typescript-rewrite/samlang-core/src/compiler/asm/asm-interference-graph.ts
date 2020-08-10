import { PRE_COLORED_REGISTERS } from './asm-register-allocation-utils';

/**
 * The interference graph for the non-trivial register allocation.
 *
 * Construct an empty interference graph from a set of all registers.
 * After this construction. It's guaranteed that an access to a legal vertex
 * will always succeed.
 */
export default class AssemblyInterferenceGraph {
  /** The adjacentSet representation. */
  private readonly adjacentSet: Map<string, Set<string>> = new Map();

  /** The adjacentList representation. */
  private readonly adjacentList: Map<string, Set<string>> = new Map();

  /** All the degrees information for the graph. */
  private readonly degrees: Map<string, number> = new Map();

  /**
   * @param u the u variable node. It must be a valid vertex in the graph.
   * @param v the v variable node. It must be a valid vertex in the graph.
   * @returns whether the graph contains edge (u, v).
   */
  contains(u: string, v: string): boolean {
    const uSet = this.adjacentSet.get(u);
    if (uSet == null) return false;
    return uSet.has(v);
  }

  /**
   * @param variable the variable of interest.
   * @returns the adjacent set of the variable, excluding the pre-colored nodes.
   */
  getAdjacentList = (variable: string): ReadonlySet<string> =>
    this.adjacentList.get(variable) ?? new Set();

  degree = (variable: string): number => this.degrees.get(variable) ?? 0;

  addEdge(u: string, v: string): void {
    if (u === v) {
      return;
    }
    let existingSetOfU: Set<string>;
    const existingSetOfUNullable = this.adjacentSet.get(u);
    if (existingSetOfUNullable == null) {
      existingSetOfU = new Set();
      this.adjacentSet.set(u, existingSetOfU);
    } else {
      existingSetOfU = existingSetOfUNullable;
    }
    if (existingSetOfU.has(v)) {
      // already there. Do nothing
      return;
    }
    // add to adjacent set
    existingSetOfU.add(v);
    const adjacentSetOfV = this.adjacentSet.get(v);
    if (adjacentSetOfV == null) {
      this.adjacentSet.set(v, new Set([u]));
    } else {
      adjacentSetOfV.add(u);
    }
    if (!PRE_COLORED_REGISTERS.has(u)) {
      const adjacentListOfU = this.adjacentList.get(u);
      if (adjacentListOfU == null) {
        this.adjacentList.set(u, new Set([v]));
      } else {
        adjacentListOfU.add(v);
      }
      this.degrees.set(u, this.degree(u) + 1);
    }
    if (!PRE_COLORED_REGISTERS.has(v)) {
      const adjacentListOfV = this.adjacentList.get(v);
      if (adjacentListOfV == null) {
        this.adjacentList.set(v, new Set([u]));
      } else {
        adjacentListOfV.add(u);
      }
      this.degrees.set(v, this.degree(v) + 1);
    }
  }

  /**
   * Decrease the degree of variable by 1.
   * It leaves the graph structure intact.
   *
   * @param variable the variable to decrement degree.
   * @returns the old degree.
   */
  decrementDegree(variable: string): number {
    const oldDegree = this.degrees.get(variable);
    if (oldDegree == null) return 0;
    this.degrees.set(variable, oldDegree - 1);
    return oldDegree;
  }

  /** Clear the graph. */
  clear(): void {
    this.adjacentSet.clear();
    this.adjacentList.clear();
    this.degrees.clear();
  }
}
