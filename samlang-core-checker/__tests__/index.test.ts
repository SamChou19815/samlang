import { Range, ModuleReference, functionType, intType } from 'samlang-core-ast/common-nodes';
import { EXPRESSION_INT } from 'samlang-core-ast/samlang-expressions';
import { createGlobalErrorCollector } from 'samlang-core-errors';
import { parseSamlangModuleFromText } from 'samlang-core-parser';
import { mapOf, hashMapOf } from 'samlang-core-utils';

import {
  DependencyTracker,
  typeCheckSources,
  typeCheckSourcesIncrementally,
  typeCheckSingleModuleSource,
  collectModuleReferenceFromSamlangModule,
} from '..';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from '../global-typing-context-builder';

it('collectModuleReferenceFromSamlangModule works', () => {
  expect(
    collectModuleReferenceFromSamlangModule({
      imports: [
        {
          range: Range.DUMMY,
          importedMembers: [],
          importedModule: new ModuleReference(['A']),
          importedModuleRange: Range.DUMMY,
        },
      ],
      classes: [
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: 'aa',
          nameRange: Range.DUMMY,
          typeParameters: [],
          typeDefinition: {
            type: 'object',
            names: [''],
            range: Range.DUMMY,
            mappings: { d: { isPublic: true, type: intType } },
          },
          members: [
            {
              associatedComments: [],
              name: '',
              range: Range.DUMMY,
              nameRange: Range.DUMMY,
              isMethod: true,
              isPublic: true,
              typeParameters: [],
              parameters: [],
              type: functionType([], intType),
              body: EXPRESSION_INT(Range.DUMMY, [], 3),
            },
          ],
        },
      ],
    })
      .toArray()
      .map((it) => it.toString())
      .sort((a, b) => a.localeCompare(b))
  ).toEqual(['A']);
});

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

it('typeCheckSources integration smoke test (passing case)', () => {
  const sourceA = `class A { function a(): int = 42 }`;
  const sourceB = `import { A } from A
  class B(val value: int) {
    function of(): B = { value: A.a() }
    method intValue(): int = this.value
  }`;
  const sourceC = `import { B } from B
  class C(Int(int), B(B)) {
    function ofInt(value: int): C = Int(value)
    function ofB(b: B): C = B(b)
    method intValue(): int = match (this) { | Int v -> v  | B b -> b.intValue()  }
  }`;
  const sourceD = `import { A } from A
  import { B } from B
  import { C } from C

  class IdentifyChecker { function equals(c1: C, c2: C): bool = c1.intValue() == c2.intValue() }
  class Main { function main(): bool =  IdentifyChecker.equals(C.ofInt(A.a()), C.ofB(B.of())) }`;

  const moduleReferenceA = new ModuleReference(['A']);
  const moduleReferenceB = new ModuleReference(['B']);
  const moduleReferenceC = new ModuleReference(['C']);
  const moduleReferenceD = new ModuleReference(['D']);

  const errorCollector = createGlobalErrorCollector();

  const sources = hashMapOf(
    [
      moduleReferenceA,
      parseSamlangModuleFromText(
        sourceA,
        moduleReferenceA,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceA)
      ),
    ],
    [
      moduleReferenceB,
      parseSamlangModuleFromText(
        sourceB,
        moduleReferenceB,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceB)
      ),
    ],
    [
      moduleReferenceC,
      parseSamlangModuleFromText(
        sourceC,
        moduleReferenceC,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceC)
      ),
    ],
    [
      moduleReferenceD,
      parseSamlangModuleFromText(
        sourceD,
        moduleReferenceD,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceD)
      ),
    ]
  );

  const [, globalTypingContext] = typeCheckSources(
    sources,
    DEFAULT_BUILTIN_TYPING_CONTEXT,
    errorCollector
  );
  expect(errorCollector.getErrors().map((e) => e.toString())).toEqual([]);

  sources.delete(moduleReferenceC);
  typeCheckSourcesIncrementally(
    sources,
    globalTypingContext,
    [moduleReferenceC, moduleReferenceD],
    errorCollector
  );
  expect(
    errorCollector
      .getErrors()
      .map((e) => e.toString())
      .sort()
  ).toEqual([
    'D.sam:3:3-3:22: [UnresolvedName]: Name `C` is not resolved.',
    'D.sam:5:27-5:95: [NotWellDefinedIdentifier]: `C` is not well defined.',
    'D.sam:5:47-5:48: [NotWellDefinedIdentifier]: `C` is not well defined.',
    'D.sam:5:54-5:55: [NotWellDefinedIdentifier]: `C` is not well defined.',
    "D.sam:5:65-5:67: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
    "D.sam:5:82-5:84: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
    'D.sam:6:64-6:71: [UnresolvedName]: Name `C.ofInt` is not resolved.',
    'D.sam:6:80-6:85: [UnresolvedName]: Name `C.ofB` is not resolved.',
  ]);
});

it('typeCheckSources smoke test (failing case)', () => {
  const sourceA = `class A { function a(): int = 42 function a(): int = 42 }`;
  const sourceB = `import { A } from A
  class B<A, A>(val value: int) {
    function of(): B<int, bool> = { value: A.a() }
    method intValue(): int = this.value
  }`;
  const sourceC = `import { B } from B
  class C(Int(int), Int(bool), B(B)) {
    function ofInt(value: int): C = Int(value)
    function <T, F, T>ofB(b: B): C = B(b)
    method intValue(): int = match (this) { | Int v -> v  | B b -> b.intValue()  }
  }`;
  const sourceD = `import { A } from A
  import { B } from B
  import { C } from C

  class IdentifyChecker { function equals(c1: C, c1: C): bool = c1.intValue() == c1.intValue() }
  class Main { function main(): bool = true }`;

  const moduleReferenceA = new ModuleReference(['A']);
  const moduleReferenceB = new ModuleReference(['B']);
  const moduleReferenceC = new ModuleReference(['C']);
  const moduleReferenceD = new ModuleReference(['D']);

  const errorCollector = createGlobalErrorCollector();

  const sources = mapOf(
    [
      moduleReferenceA,
      parseSamlangModuleFromText(
        sourceA,
        moduleReferenceA,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceA)
      ),
    ],
    [
      moduleReferenceB,
      parseSamlangModuleFromText(
        sourceB,
        moduleReferenceB,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceB)
      ),
    ],
    [
      moduleReferenceC,
      parseSamlangModuleFromText(
        sourceC,
        moduleReferenceC,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceC)
      ),
    ],
    [
      moduleReferenceD,
      parseSamlangModuleFromText(
        sourceD,
        moduleReferenceD,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceD)
      ),
    ]
  );

  typeCheckSources(sources, DEFAULT_BUILTIN_TYPING_CONTEXT, errorCollector);
  expect(
    errorCollector
      .getErrors()
      .map((e) => e.toString())
      .sort()
  ).toEqual([
    'A.sam:1:43-1:44: [Collision]: Name `a` collides with a previously defined name.',
    'B.sam:2:10-2:32: [Collision]: Name `A` collides with a previously defined name.',
    'C.sam:2:10-2:37: [NotWellDefinedIdentifier]: `B` is not well defined.',
    'C.sam:3:41-3:46: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    'C.sam:4:30-4:31: [NotWellDefinedIdentifier]: `B` is not well defined.',
    'C.sam:4:5-4:42: [Collision]: Name `T` collides with a previously defined name.',
    'C.sam:4:5-4:42: [NotWellDefinedIdentifier]: `B` is not well defined.',
    'C.sam:5:56-5:57: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    'C.sam:5:68-5:78: [UnresolvedName]: Name `intValue` is not resolved.',
    'D.sam:5:50-5:52: [Collision]: Name `c1` collides with a previously defined name.',
  ]);
});

it('typeCheckSources identifier resolution test.', () => {
  // Test https://github.com/SamChou19815/samlang/issues/167 is resolved.
  const sourceA = `
  class SameName(val a: int) {
    function create(): SameName = { a: 0 }
  }`;
  const sourceB = `import { SameName } from A
  class Producer {
    function produce(): SameName = SameName.create()
  }`;
  const sourceC = `import { Producer } from B

  class SameName(val b: int) {
    // Here, Producer.produce() produces a SameName class from module a, so the field a should exist.
    function create(): SameName = { b: Producer.produce().a }
  }`;

  const moduleReferenceA = new ModuleReference(['A']);
  const moduleReferenceB = new ModuleReference(['B']);
  const moduleReferenceC = new ModuleReference(['C']);

  const errorCollector = createGlobalErrorCollector();

  const sources = mapOf(
    [
      moduleReferenceA,
      parseSamlangModuleFromText(
        sourceA,
        moduleReferenceA,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceA)
      ),
    ],
    [
      moduleReferenceB,
      parseSamlangModuleFromText(
        sourceB,
        moduleReferenceB,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceB)
      ),
    ],
    [
      moduleReferenceC,
      parseSamlangModuleFromText(
        sourceC,
        moduleReferenceC,
        new Set(),
        errorCollector.getModuleErrorCollector(moduleReferenceC)
      ),
    ]
  );

  typeCheckSources(sources, DEFAULT_BUILTIN_TYPING_CONTEXT, errorCollector);
  expect(errorCollector.getErrors().map((e) => e.toString())).toEqual([]);
});

it('typeCheckSingleModuleSource smoke test', () => {
  const errorCollector = createGlobalErrorCollector();
  const checkedModule = typeCheckSingleModuleSource(
    parseSamlangModuleFromText(
      'class Main {}',
      new ModuleReference(['Test']),
      new Set(),
      errorCollector.getModuleErrorCollector(new ModuleReference(['Test']))
    ),
    DEFAULT_BUILTIN_TYPING_CONTEXT,
    errorCollector
  );

  expect(errorCollector.getErrors()).toEqual([]);
  expect(checkedModule.imports).toEqual([]);
  expect(checkedModule.classes.length).toBe(1);
  expect(checkedModule.classes[0]?.name).toBe('Main');
  expect(checkedModule.classes[0]?.members).toEqual([]);
});
