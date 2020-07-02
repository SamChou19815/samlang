/** An lazily allocated union find data structure. */
export default class UnionFind {
  private readonly parent: Map<number, number> = new Map();

  private readonly treeSize: Map<number, number> = new Map();

  getParent(index: number): number {
    const currentParent = this.parent.get(index);
    if (currentParent == null) {
      this.parent.set(index, index);
      this.treeSize.set(index, 1);
      return index;
    }
    return currentParent;
  }

  getTreeSize(index: number): number {
    const currentTreeSize = this.treeSize.get(index);
    if (currentTreeSize == null) {
      this.parent.set(index, index);
      this.treeSize.set(index, 1);
      return 1;
    }
    return currentTreeSize;
  }

  isLinked(i: number, j: number): boolean {
    return this.findRoot(i) === this.findRoot(j);
  }

  findRoot(index: number): number {
    const currentParent = this.getParent(index);
    if (currentParent === index) {
      return currentParent;
    }
    const parentOfParent = this.findRoot(currentParent);
    this.parent.set(index, parentOfParent);
    return parentOfParent;
  }

  link(i: number, j: number): number {
    let iRoot = this.findRoot(i);
    let jRoot = this.findRoot(j);
    if (iRoot === jRoot) {
      return iRoot;
    }
    if (this.getTreeSize(iRoot) < this.getTreeSize(jRoot)) {
      const temp = iRoot;
      iRoot = jRoot;
      jRoot = temp;
    }
    this.parent.set(jRoot, iRoot);
    this.treeSize.set(iRoot, this.getTreeSize(iRoot) + this.getTreeSize(jRoot));
    return iRoot;
  }
}
