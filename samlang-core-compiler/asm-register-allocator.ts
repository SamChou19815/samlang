import assemblyInstructionColoringRewrite from './asm-coloring-program-rewriter';
import type AssemblyFunctionAbstractRegisterAllocator from './asm-function-abstract-register-allocator';
import AssemblyInterferenceGraph from './asm-interference-graph';
import {
  rewriteAssemblyInstructionsWithCalleeSavedRegistersMoves,
  AVAILABLE_REGISTERS_NUMBER,
  AVAILABLE_REGISTERS,
  PRE_COLORED_REGISTERS,
  CALLEE_SAVED_REGISTERS,
  reorganizeSpilledVariableMappingsToRemoveUnusedCalleeSavedRegisterMappings,
} from './asm-register-allocation-utils';
import collectAssemblyRegistersFromAssemblyInstructions from './asm-register-collector';
import AssemblySpillingProgramWriter from './asm-spilling-program-rewriter';

import analyzeLiveVariablesAtTheEndOfEachInstruction, {
  LiveVariableAnalysisResult,
} from 'samlang-core-analysis/live-variable-analysis';
import type { AssemblyMemory } from 'samlang-core-ast/asm-arguments';
import type { AssemblyInstruction } from 'samlang-core-ast/asm-instructions';
import {
  Hashable,
  HashSet,
  hashSetOf,
  ReadonlyHashSet,
  assertNotNull,
  checkNotNull,
} from 'samlang-core-utils';

const K = AVAILABLE_REGISTERS_NUMBER;

const union = (...sets: readonly ReadonlySet<string>[]): ReadonlySet<string> => {
  const s = new Set<string>();
  sets.forEach((it) => it.forEach((i) => s.add(i)));
  return s;
};

/** The data class that represents a move between a register to another register. */
class RegMove implements Hashable {
  constructor(public readonly dest: string, public readonly src: string) {}

  uniqueHash(): string {
    return `{ dest: ${this.dest}, src: ${this.src} }`;
  }
}

export default class AssemblyRegisterAllocator {
  /*
   * ================================================================================
   * Part 1: Basic working context
   * --------------------------------------------------------------------------------
   * It contains all the necessary original raw information we need to solve the
   * register allocation problem.
   * ================================================================================
   */

  /** The assembly instructions to perform register allocation. */
  private instructions: readonly AssemblyInstruction[];

  /** A the mappings for all spilled vars. */
  private readonly spilledVariableMappings: Map<string, AssemblyMemory> = new Map();

  /** The generated new instructions. */
  readonly realInstructions: readonly AssemblyInstruction[];

  /*
   * ================================================================================
   * Part 2: Variable work lists, sets, and stacks
   * --------------------------------------------------------------------------------
   * The following lists and sets are always mutually disjoint and every variable is
   * always in exactly one of the sets or lists.
   * ================================================================================
   */

  /** Temporary registers, not pre-colored and not yet processed. */
  private readonly initial: Set<string>;

  /** List of low-degree non-move-related variables. */
  private readonly simplifyWorkList: Set<string> = new Set();

  /** List of low-degree move-related variables. */
  private readonly freezeWorkList: Set<string> = new Set();

  /** High-degree variables. */
  private readonly spillWorkList: Set<string> = new Set();

  /**
   * Variables marked for spilling during this round; initially empty.
   */
  private readonly spilledVars: Set<string> = new Set();

  /**
   * Registers that have been coalesced; when u <- v is coalesced, v is added to
   * this set and u put back on some work list (or vice versa).
   */
  private readonly coalescedVars: Set<string> = new Set();

  /**
   * Variables successfully colored.
   */
  private readonly coloredVars: Set<string> = new Set();

  /** Stack containing temporaries removed from the graph. */
  private readonly selectStack: string[] = [];

  /*
   * ================================================================================
   * Part 3: Move sets
   * --------------------------------------------------------------------------------
   * There are five sets of move instructions, and every move is in exactly one of
   * these sets (after build through the end of main).
   * ================================================================================
   */

  /** Moves that have been coalesced. */
  private readonly coalescedMoves: HashSet<RegMove> = hashSetOf();

  /** Moves whose source and target interfere. */
  private readonly constrainedMoves: HashSet<RegMove> = hashSetOf();

  /** Moves that will no longer be considered for coalescing. */
  private readonly frozenMoves: HashSet<RegMove> = hashSetOf();

  /** Moves enabled for possible coalescing. */
  private readonly workListMoves: HashSet<RegMove> = hashSetOf();

  /** Moves not yet ready for coalescing. */
  private readonly activeMoves: HashSet<RegMove> = hashSetOf();

  /*
   * ================================================================================
   * Part 4: Other data structures
   * --------------------------------------------------------------------------------
   * There are some data structures that represent graph, aliasing, and the current
   * coloring status.
   * ================================================================================
   */

  /** The interference graph. */
  private readonly interferenceGraph: AssemblyInterferenceGraph = new AssemblyInterferenceGraph();

  /** A mapping from a node to the list of moves it is associated with. */
  private readonly moveMap: Map<string, HashSet<RegMove>> = new Map();

  /** When a move (u, v) has been coalesced, and v put in coalescedVars, then alias(v) = u. */
  private readonly alias: Map<string, string> = new Map();

  /**
   * The color chosen by the algorithm for a node; for pre-colored nodes this is
   * initialized to the given color.
   */
  private readonly colors: Map<string, string> = new Map();

  readonly numberOfTemporariesOnStack: number;

  constructor(
    private readonly allocator: AssemblyFunctionAbstractRegisterAllocator,
    private readonly checkInvaraint: boolean,
    tiledInstructions: readonly AssemblyInstruction[]
  ) {
    this.instructions = rewriteAssemblyInstructionsWithCalleeSavedRegistersMoves(tiledInstructions);
    const initialNonMachineRegisters = collectAssemblyRegistersFromAssemblyInstructions(
      this.instructions
    );
    this.initial = new Set(initialNonMachineRegisters);
    // initialize color for pre-colored regs
    PRE_COLORED_REGISTERS.forEach((preColoredRegister) => {
      this.colors.set(preColoredRegister, preColoredRegister);
    });
    // run the allocator
    this.main();
    // post-processing
    const unusedCalleeSavedRegisters = new Set(CALLEE_SAVED_REGISTERS);
    Array.from(this.colors.entries())
      .filter(([key]) => !PRE_COLORED_REGISTERS.has(key))
      .forEach(([, value]) => unusedCalleeSavedRegisters.delete(value));
    const newSpilledVariableMemoryMapping = reorganizeSpilledVariableMappingsToRemoveUnusedCalleeSavedRegisterMappings(
      this.spilledVariableMappings,
      unusedCalleeSavedRegisters
    );
    this.numberOfTemporariesOnStack = newSpilledVariableMemoryMapping.size;
    this.realInstructions = assemblyInstructionColoringRewrite(
      this.colors,
      newSpilledVariableMemoryMapping,
      unusedCalleeSavedRegisters,
      this.instructions
    );
    // sanity check to ensure we get rid of all non-machine registers!
    // istanbul ignore next
    if (collectAssemblyRegistersFromAssemblyInstructions(this.realInstructions).size > 0) {
      // istanbul ignore next
      throw new Error('Still contains non-machine register!');
    }
  }

  /** The main function to run for register allocation. */
  private main() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const liveVariableAnalysisResult = analyzeLiveVariablesAtTheEndOfEachInstruction(
        this.instructions
      );
      this.build(liveVariableAnalysisResult);
      const useCount = AssemblyRegisterAllocator.buildUseCount(liveVariableAnalysisResult);
      this.makeWorkList();
      if (this.checkInvaraint) this.checkInvariant();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (this.simplifyWorkList.size > 0) {
          this.simplify();
        } else if (this.workListMoves.size > 0) {
          this.coalesce();
        } else if (this.freezeWorkList.size > 0) {
          this.freeze();
        } else if (this.spillWorkList.size > 0) {
          this.selectSpill(useCount);
        } else {
          break;
        }
        if (this.checkInvaraint) this.checkInvariant();
      }
      this.assignColors();
      // done!
      if (this.spilledVars.size === 0) break;
      this.rewriteProgram();
    }
  }

  /** Check the invariants listed in the book. Used for debugging. */
  private checkInvariant(): void {
    // degree invariant
    const workListUnion = union(this.simplifyWorkList, this.freezeWorkList, this.spillWorkList);
    workListUnion.forEach((u) => {
      const degree = this.interferenceGraph.degree(u);
      let c = 0;
      const uAdjacentSet = this.adjacentSet(u);
      uAdjacentSet.forEach((v) => {
        // istanbul ignore next
        if (PRE_COLORED_REGISTERS.has(v) || workListUnion.has(v)) {
          c += 1;
        }
      });
      // istanbul ignore next
      if (degree !== c) {
        // istanbul ignore next
        throw new Error(
          `degree invariant is broken. degree = ${degree}, cardinality = ${c}, variable = ${u}`
        );
      }
    });
    // simplifyWorkList invariant
    this.simplifyWorkList.forEach((u) => {
      const degree = this.interferenceGraph.degree(u);
      if (degree >= K) {
        // selected for spilling
        return;
      }
      const moveList = this.moveMap.get(u);
      if (moveList != null) {
        moveList.forEach((v) => {
          // istanbul ignore next
          if (this.activeMoves.has(v) || this.workListMoves.has(v)) {
            // istanbul ignore next
            throw new Error('simplifyWorkList invariant is broken.');
          }
        });
      }
    });
    // freeWorkList invariant
    this.freezeWorkList.forEach((u) => {
      const degree = this.interferenceGraph.degree(u);
      // istanbul ignore next
      if (degree >= K) {
        // istanbul ignore next
        throw new Error('freezeWorkList invariant is broken. degree = $degree, variable = $u');
      }
      const moveList = this.moveMap.get(u);
      let intersectionIsEmpty = true;
      // istanbul ignore next
      if (moveList != null) {
        moveList.forEach((v) => {
          if (this.activeMoves.has(v) || this.workListMoves.has(v)) {
            intersectionIsEmpty = false;
          }
        });
      }
      // istanbul ignore next
      if (intersectionIsEmpty) {
        // istanbul ignore next
        throw new Error('freezeWorkList invariant is broken.');
      }
    });
    // spillWorkList invariant
    this.spillWorkList.forEach((u) => {
      const degree = this.interferenceGraph.degree(u);
      // istanbul ignore next
      if (degree < K) {
        // istanbul ignore next
        throw new Error(`spillWorkList invariant is broken. degree = ${degree}, variable = ${u}`);
      }
    });
  }

  private build({ out: liveMap, useAndDefs }: LiveVariableAnalysisResult): void {
    for (let i = this.instructions.length - 1; i >= 0; i -= 1) {
      const instruction = checkNotNull(this.instructions[i]);
      const liveSet = new Set(liveMap[i]);
      const { uses: useSet, defs: defSet } = checkNotNull(useAndDefs[i]);
      // if isMoveInstruction(instruction) then
      if (instruction.__type__ === 'AssemblyMoveToRegister') {
        const {
          destination: { id: dest },
          source,
        } = instruction;
        if (source.__type__ === 'AssemblyRegister') {
          const src = source.id;
          const move = new RegMove(dest, src);
          // live := live / use(I)
          useSet.forEach((it) => liveSet.delete(it));
          // moveList[n] := moveList[n] union {I}
          const destMoveMapValue = this.moveMap.get(dest);
          if (destMoveMapValue == null) {
            this.moveMap.set(dest, hashSetOf(move));
          } else {
            destMoveMapValue.add(move);
          }
          const srcMoveMapValue = this.moveMap.get(src);
          if (srcMoveMapValue == null) {
            this.moveMap.set(src, hashSetOf(move));
          } else {
            srcMoveMapValue.add(move);
          }
          // workListMoves := workListMoves union {I}
          this.workListMoves.add(move);
        }
      }
      defSet.forEach((it) => liveSet.add(it));
      defSet.forEach((definedVariable) => {
        liveSet.forEach((liveVariable) => {
          this.interferenceGraph.addEdge(liveVariable, definedVariable);
        });
      });
      // omitted final line in the book because we operate on instruction level
    }
  }

  private static buildUseCount(
    liveVariableAnalysisResult: LiveVariableAnalysisResult
  ): ReadonlyMap<string, number> {
    const useCount = new Map<string, number>();
    liveVariableAnalysisResult.useAndDefs.forEach(({ uses, defs }) => {
      uses.forEach((name) => {
        useCount.set(name, (useCount.get(name) ?? 0) + 1);
      });
      defs.forEach((name) => {
        useCount.set(name, (useCount.get(name) ?? 0) + 1);
      });
    });
    return useCount;
  }

  private makeWorkList(): void {
    this.initial.forEach((variable) => {
      if (this.interferenceGraph.degree(variable) >= K) {
        this.spillWorkList.add(variable);
      } else if (this.moveRelated(variable)) {
        this.freezeWorkList.add(variable);
      } else {
        this.simplifyWorkList.add(variable);
      }
    });
    this.initial.clear();
  }

  private adjacentSet(variable: string): Set<string> {
    const adjacentList = this.interferenceGraph.getAdjacentList(variable);
    // resultSet = adjList[n] - (selectStack union coalescedNodes)
    const resultSet = new Set<string>();
    adjacentList.forEach((v) => {
      if (this.selectStack.includes(v) || this.coalescedVars.has(v)) {
        return;
      }
      resultSet.add(v);
    });
    return resultSet;
  }

  private nodeMoves(variable: string): ReadonlyHashSet<RegMove> {
    const moveList = this.moveMap.get(variable);
    if (moveList == null) return hashSetOf();
    const resultSet = hashSetOf<RegMove>();
    // resultSet = moveList[n] intersect (activeMoves union workListMoves)
    moveList.forEach((move) => {
      if (this.activeMoves.has(move) || this.workListMoves.has(move)) {
        resultSet.add(move);
      }
    });
    return resultSet;
  }

  private moveRelated(variable: string): boolean {
    const moveList = this.moveMap.get(variable);
    if (moveList == null) return false;
    return moveList
      .toArray()
      .some((move) => this.activeMoves.has(move) || this.workListMoves.has(move));
  }

  private simplify(): void {
    const variableToSimplify: string | undefined = this.simplifyWorkList.values().next().value;
    assertNotNull(variableToSimplify);
    this.simplifyWorkList.delete(variableToSimplify);
    this.selectStack.unshift(variableToSimplify);
    this.adjacentSet(variableToSimplify).forEach((variable) => this.decrementDegree(variable));
  }

  private decrementDegree(variable: string): void {
    const oldDegree = this.interferenceGraph.decrementDegree(variable);
    if (oldDegree === K) {
      const enableMoveSet = this.adjacentSet(variable);
      enableMoveSet.add(variable);
      this.enableMoves(Array.from(enableMoveSet));
      this.spillWorkList.delete(variable);
      if (this.moveRelated(variable)) {
        this.freezeWorkList.add(variable);
      } else {
        this.simplifyWorkList.add(variable);
      }
    }
  }

  private enableMoves(variables: readonly string[]): void {
    variables.forEach((variable) => {
      this.nodeMoves(variable).forEach((move) => {
        if (this.activeMoves.has(move)) {
          this.activeMoves.delete(move);
          this.workListMoves.add(move);
        }
      });
    });
  }

  private addToWorkList(variable: string): void {
    if (
      !PRE_COLORED_REGISTERS.has(variable) &&
      !this.moveRelated(variable) &&
      this.interferenceGraph.degree(variable) < K
    ) {
      this.freezeWorkList.delete(variable);
      this.simplifyWorkList.add(variable);
    }
  }

  private ok(t: string, r: string): boolean {
    return (
      this.interferenceGraph.degree(t) < K ||
      PRE_COLORED_REGISTERS.has(t) ||
      this.interferenceGraph.contains(t, r)
    );
  }

  private conservative(variables: ReadonlySet<string>): boolean {
    let k = 0;
    variables.forEach((variable) => {
      if (this.interferenceGraph.degree(variable) >= K) {
        k += 1;
      }
    });
    return k < K;
  }

  private coalesce(): void {
    // pick an arbitrary move from workListMoves
    const move = this.workListMoves.toArray()[0];
    assertNotNull(move);
    const x = this.getAlias(move.dest);
    const y = this.getAlias(move.src);
    let u: string;
    let v: string;
    if (PRE_COLORED_REGISTERS.has(y)) {
      u = y;
      v = x;
    } else {
      u = x;
      v = y;
    }
    // workListMoves := workListMoves - {m}
    this.workListMoves.delete(move);
    if (u === v) {
      this.coalescedMoves.add(move);
      this.addToWorkList(u);
    } else if (PRE_COLORED_REGISTERS.has(v) || this.interferenceGraph.contains(u, v)) {
      this.constrainedMoves.add(move);
      this.addToWorkList(u);
      this.addToWorkList(v);
    } else {
      let condition =
        PRE_COLORED_REGISTERS.has(u) && Array.from(this.adjacentSet(v)).every((t) => this.ok(t, u));
      if (!condition) {
        condition =
          !PRE_COLORED_REGISTERS.has(u) &&
          this.conservative(union(this.adjacentSet(u), this.adjacentSet(v)));
      }
      if (condition) {
        this.coalescedMoves.add(move);
        this.combine(u, v);
        this.addToWorkList(u);
      } else {
        this.activeMoves.add(move);
      }
    }
  }

  private combine(u: string, v: string): void {
    if (this.freezeWorkList.has(v)) {
      this.freezeWorkList.delete(v);
    } else {
      this.spillWorkList.delete(v);
    }
    // coalescedNodes := coalescedNodes union {v}
    this.coalescedVars.add(v);
    // alias[v] := u
    this.alias.set(v, u);
    // moveList[u] := moveList[u] union moveList[v]
    const moveListU = this.moveMap.get(u);
    // istanbul ignore next
    const moveListV = this.moveMap.get(v) ?? hashSetOf();
    // istanbul ignore next
    if (moveListU == null) {
      // istanbul ignore next
      const set = hashSetOf<RegMove>();
      // istanbul ignore next
      moveListV.forEach((it) => set.add(it));
      // istanbul ignore next
      this.moveMap.set(u, set);
    } else {
      moveListV.forEach((it) => moveListU.add(it));
    }
    this.enableMoves([v]);
    this.adjacentSet(v).forEach((t) => {
      this.interferenceGraph.addEdge(t, u);
      this.decrementDegree(t);
    });
    if (this.interferenceGraph.degree(u) >= K && this.freezeWorkList.has(u)) {
      this.freezeWorkList.delete(u);
      this.spillWorkList.add(u);
    }
  }

  /**
   * @param variable variable to obtain the deepest alias.
   * @returns the deepest alias of the given variable.
   */
  private getAlias(variable: string): string {
    // already performed tail recursion optimization by hand
    let v = variable;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!this.coalescedVars.has(v)) {
        return v;
      }
      const newV = this.alias.get(v);
      assertNotNull(newV);
      v = newV;
    }
  }

  private freeze() {
    // let u = one of freezeWorkList; freezeWorkList.remove(u)
    const variable: string | undefined = this.freezeWorkList.values().next().value;
    assertNotNull(variable);
    this.freezeWorkList.delete(variable);
    this.simplifyWorkList.add(variable);
    this.freezeMoves(variable);
  }

  private freezeMoves(u: string): void {
    const uAlias = this.getAlias(u);
    this.nodeMoves(u).forEach((move) => {
      const x = move.dest;
      const y = move.src;
      const yAlias = this.getAlias(y);
      const v = yAlias === uAlias ? this.getAlias(x) : yAlias;
      this.activeMoves.delete(move);
      this.frozenMoves.add(move);
      // istanbul ignore next
      if (this.freezeWorkList.has(v) && this.nodeMoves(v).size === 0) {
        // istanbul ignore next
        this.freezeWorkList.delete(v);
        // istanbul ignore next
        this.simplifyWorkList.add(v);
      }
    });
  }

  private selectSpill(useCount: ReadonlyMap<string, number>): void {
    let lowestScore = Number.MAX_SAFE_INTEGER;
    let bestVariableToSpill: string | null = null;
    this.spillWorkList.forEach((variable) => {
      // istanbul ignore next
      const uses = useCount.get(variable) ?? 0;
      const degree = this.interferenceGraph.degree(variable);
      // istanbul ignore next
      const score = degree <= 0 ? Number.MAX_SAFE_INTEGER : (1.0 * uses) / degree;
      if (score < lowestScore) {
        bestVariableToSpill = variable;
        lowestScore = score;
      }
    });
    const immutableBestVariableToSpill = bestVariableToSpill as string | null;
    assertNotNull(immutableBestVariableToSpill);
    this.spillWorkList.delete(immutableBestVariableToSpill);
    this.simplifyWorkList.add(immutableBestVariableToSpill);
    this.freezeMoves(immutableBestVariableToSpill);
  }

  private assignColors() {
    while (this.selectStack.length > 0) {
      const variable = this.selectStack.shift();
      assertNotNull(variable);
      const okRegs = new Set(AVAILABLE_REGISTERS);
      const adjacentVars = this.interferenceGraph.getAdjacentList(variable);
      adjacentVars.forEach((conflictingVariable) => {
        const alias = this.getAlias(conflictingVariable);
        if (this.coloredVars.has(alias) || PRE_COLORED_REGISTERS.has(alias)) {
          const a = this.colors.get(alias);
          // istanbul ignore next
          if (a != null) okRegs.delete(a);
        }
      });
      const color: string | undefined = okRegs.values().next().value;
      if (color == null) {
        this.spilledVars.add(variable);
      } else {
        okRegs.delete(color);
        this.coloredVars.add(variable);
        this.colors.set(variable, color);
      }
    }
    this.coalescedVars.forEach((variable) => {
      const varAlias = this.getAlias(variable);
      const colorOfAlias = this.colors.get(varAlias);
      // istanbul ignore next
      if (colorOfAlias != null) {
        this.colors.set(variable, colorOfAlias);
      }
    });
  }

  private rewriteProgram(): void {
    const rewriter = new AssemblySpillingProgramWriter(
      this.allocator,
      this.instructions,
      this.spilledVars,
      this.spilledVariableMappings.size
    );
    this.instructions = rewriter.getNewInstructions();
    this.interferenceGraph.clear();
    rewriter.spilledVariableMappings.forEach((memory, name) =>
      this.spilledVariableMappings.set(name, memory)
    );
    this.initial.clear();
    this.coloredVars.forEach((it) => this.initial.add(it));
    this.coalescedVars.forEach((it) => this.initial.add(it));
    // istanbul ignore next
    rewriter.getNewTemps().forEach((it) => this.initial.add(it));
    // cleanup vars in this round
    this.spilledVars.clear();
    this.coloredVars.clear();
    this.coalescedVars.clear();
    // also cleanup assigned old colors
    this.colors.clear();
    PRE_COLORED_REGISTERS.forEach((preColoredRegister) => {
      this.colors.set(preColoredRegister, preColoredRegister);
    });
    // cleanup moves in this round
    this.coalescedMoves.clear();
    this.constrainedMoves.clear();
    this.frozenMoves.clear();
    this.workListMoves.clear();
    this.activeMoves.clear();
  }
}
