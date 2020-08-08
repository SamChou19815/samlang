import AssemblyInterferenceGraph from '../asm-interference-graph';

it('InterferenceGraph all non machine registers test', () => {
  const graph = new AssemblyInterferenceGraph();

  graph.addEdge('a', 'a');
  expect(graph.contains('a', 'a')).toBeFalsy();
  expect(graph.degree('a')).toBe(0);
  expect(Array.from(graph.getAdjacentList('a'))).toEqual([]);

  graph.addEdge('a', 'b');
  expect(graph.contains('a', 'b')).toBeTruthy();
  expect(graph.contains('b', 'a')).toBeTruthy();
  expect(graph.degree('a')).toBe(1);
  expect(graph.degree('b')).toBe(1);
  expect(Array.from(graph.getAdjacentList('a'))).toEqual(['b']);
  expect(Array.from(graph.getAdjacentList('b'))).toEqual(['a']);

  graph.addEdge('a', 'b');
  expect(graph.contains('a', 'b')).toBeTruthy();
  expect(graph.contains('b', 'a')).toBeTruthy();
  expect(graph.degree('a')).toBe(1);
  expect(graph.degree('b')).toBe(1);
  expect(Array.from(graph.getAdjacentList('a'))).toEqual(['b']);
  expect(Array.from(graph.getAdjacentList('b'))).toEqual(['a']);

  graph.addEdge('a', 'c');
  expect(graph.contains('a', 'b')).toBeTruthy();
  expect(graph.contains('b', 'a')).toBeTruthy();
  expect(graph.contains('a', 'c')).toBeTruthy();
  expect(graph.contains('c', 'a')).toBeTruthy();
  expect(graph.degree('a')).toBe(2);
  expect(graph.degree('b')).toBe(1);
  expect(graph.degree('c')).toBe(1);
  expect(Array.from(graph.getAdjacentList('a'))).toEqual(['b', 'c']);
  expect(Array.from(graph.getAdjacentList('b'))).toEqual(['a']);
  expect(Array.from(graph.getAdjacentList('c'))).toEqual(['a']);

  expect(graph.decrementDegree('d')).toBe(0);
  expect(graph.decrementDegree('a')).toBe(2);
  expect(graph.degree('a')).toBe(1);
  expect(graph.contains('a', 'b')).toBeTruthy();
  expect(graph.contains('b', 'a')).toBeTruthy();
  expect(Array.from(graph.getAdjacentList('a'))).toEqual(['b', 'c']);

  graph.clear();
  expect(graph.contains('a', 'a')).toBeFalsy();
  expect(graph.degree('a')).toBe(0);
  expect(Array.from(graph.getAdjacentList('a'))).toEqual([]);
});

it('InterferenceGraph with machine registers test 1', () => {
  const graph = new AssemblyInterferenceGraph();

  graph.addEdge('a', 'b');
  graph.addEdge('c', 'a');
  expect(graph.contains('a', 'b')).toBeTruthy();
  expect(graph.contains('b', 'a')).toBeTruthy();
  expect(graph.contains('a', 'c')).toBeTruthy();
  expect(graph.contains('c', 'a')).toBeTruthy();
  expect(graph.degree('a')).toBe(2);
  expect(graph.degree('b')).toBe(1);
  expect(graph.degree('c')).toBe(1);
  expect(Array.from(graph.getAdjacentList('a'))).toEqual(['b', 'c']);
  expect(Array.from(graph.getAdjacentList('b'))).toEqual(['a']);
  expect(Array.from(graph.getAdjacentList('c'))).toEqual(['a']);

  graph.addEdge('a', 'rax');
  expect(graph.contains('a', 'rax')).toBeTruthy();
  expect(graph.contains('rax', 'a')).toBeTruthy();
  expect(graph.degree('a')).toBe(3);
  expect(graph.degree('rax')).toBe(0);
  expect(Array.from(graph.getAdjacentList('a'))).toEqual(['b', 'c', 'rax']);
  expect(Array.from(graph.getAdjacentList('rax'))).toEqual([]);
});

it('InterferenceGraph with machine registers test 2', () => {
  const graph = new AssemblyInterferenceGraph();

  graph.addEdge('a', 'b');
  graph.addEdge('c', 'a');
  expect(graph.contains('a', 'b')).toBeTruthy();
  expect(graph.contains('b', 'a')).toBeTruthy();
  expect(graph.contains('a', 'c')).toBeTruthy();
  expect(graph.contains('c', 'a')).toBeTruthy();
  expect(graph.degree('a')).toBe(2);
  expect(graph.degree('b')).toBe(1);
  expect(graph.degree('c')).toBe(1);
  expect(Array.from(graph.getAdjacentList('a'))).toEqual(['b', 'c']);
  expect(Array.from(graph.getAdjacentList('b'))).toEqual(['a']);
  expect(Array.from(graph.getAdjacentList('c'))).toEqual(['a']);

  graph.addEdge('rax', 'a');
  expect(graph.contains('a', 'rax')).toBeTruthy();
  expect(graph.contains('rax', 'a')).toBeTruthy();
  expect(graph.degree('a')).toBe(3);
  expect(graph.degree('rax')).toBe(0);
  expect(Array.from(graph.getAdjacentList('a'))).toEqual(['b', 'c', 'rax']);
  expect(Array.from(graph.getAdjacentList('rax'))).toEqual([]);
});
