import DependencyTracker from '../dependency-tracker';

import { ModuleReference } from 'samlang-core-ast/common-nodes';

it('can track and update dependencies', () => {
  const tracker = new DependencyTracker();
  const moduleA = new ModuleReference(['A']);
  const moduleB = new ModuleReference(['B']);
  const moduleC = new ModuleReference(['C']);
  const moduleD = new ModuleReference(['D']);
  const moduleE = new ModuleReference(['E']);

  // Wave 1
  tracker.update(moduleA, [moduleB, moduleC]);
  tracker.update(moduleD, [moduleB, moduleC]);
  tracker.update(moduleE, [moduleB, moduleC]);
  tracker.update(moduleA, [moduleB, moduleC]);
  tracker.update(moduleD, [moduleB, moduleC]);
  tracker.update(moduleE, [moduleB, moduleC]);
  expect(tracker.getForwardDependencies(moduleA).toArray()).toEqual([moduleB, moduleC]);
  expect(tracker.getForwardDependencies(moduleB).toArray()).toEqual([]);
  expect(tracker.getForwardDependencies(moduleC).toArray()).toEqual([]);
  expect(tracker.getForwardDependencies(moduleD).toArray()).toEqual([moduleB, moduleC]);
  expect(tracker.getForwardDependencies(moduleE).toArray()).toEqual([moduleB, moduleC]);
  expect(tracker.getReverseDependencies(moduleA).toArray()).toEqual([]);
  expect(tracker.getReverseDependencies(moduleB).toArray()).toEqual([moduleA, moduleD, moduleE]);
  expect(tracker.getReverseDependencies(moduleC).toArray()).toEqual([moduleA, moduleD, moduleE]);
  expect(tracker.getReverseDependencies(moduleD).toArray()).toEqual([]);
  expect(tracker.getReverseDependencies(moduleE).toArray()).toEqual([]);

  // Wave 2
  tracker.update(moduleA, [moduleD, moduleE]);
  expect(tracker.getForwardDependencies(moduleA).toArray()).toEqual([moduleD, moduleE]);
  expect(tracker.getForwardDependencies(moduleB).toArray()).toEqual([]);
  expect(tracker.getForwardDependencies(moduleC).toArray()).toEqual([]);
  expect(tracker.getForwardDependencies(moduleD).toArray()).toEqual([moduleB, moduleC]);
  expect(tracker.getForwardDependencies(moduleE).toArray()).toEqual([moduleB, moduleC]);
  expect(tracker.getReverseDependencies(moduleA).toArray()).toEqual([]);
  expect(tracker.getReverseDependencies(moduleB).toArray()).toEqual([moduleD, moduleE]);
  expect(tracker.getReverseDependencies(moduleC).toArray()).toEqual([moduleD, moduleE]);
  expect(tracker.getReverseDependencies(moduleD).toArray()).toEqual([moduleA]);
  expect(tracker.getReverseDependencies(moduleE).toArray()).toEqual([moduleA]);

  // Wave 3
  tracker.update(moduleA);
  expect(tracker.getForwardDependencies(moduleA).toArray()).toEqual([]);
  expect(tracker.getForwardDependencies(moduleB).toArray()).toEqual([]);
  expect(tracker.getForwardDependencies(moduleC).toArray()).toEqual([]);
  expect(tracker.getForwardDependencies(moduleD).toArray()).toEqual([moduleB, moduleC]);
  expect(tracker.getForwardDependencies(moduleE).toArray()).toEqual([moduleB, moduleC]);
  expect(tracker.getReverseDependencies(moduleA).toArray()).toEqual([]);
  expect(tracker.getReverseDependencies(moduleB).toArray()).toEqual([moduleD, moduleE]);
  expect(tracker.getReverseDependencies(moduleC).toArray()).toEqual([moduleD, moduleE]);
  expect(tracker.getReverseDependencies(moduleD).toArray()).toEqual([]);
  expect(tracker.getReverseDependencies(moduleE).toArray()).toEqual([]);
});
