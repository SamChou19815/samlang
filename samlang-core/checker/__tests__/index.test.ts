import {
  collectModuleReferenceFromSamlangModule,
  DependencyTracker,
  typeCheckSingleModuleSource,
  typeCheckSourceHandles,
  typeCheckSources,
  typeCheckSourcesIncrementally,
} from '..';
import {
  DummySourceReason,
  ModuleReference,
  ModuleReferenceCollections,
  moduleReferenceToString,
  Range,
} from '../../ast/common-nodes';
import {
  SourceExpressionInt,
  SourceFunctionType,
  SourceId,
  SourceIntType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { parseSamlangModuleFromText } from '../../parser';

describe('samlang-core/checker', () => {
  it('collectModuleReferenceFromSamlangModule works', () => {
    expect(
      collectModuleReferenceFromSamlangModule({
        imports: [
          {
            range: Range.DUMMY,
            importedMembers: [],
            importedModule: ModuleReference(['A']),
            importedModuleRange: Range.DUMMY,
          },
        ],
        classes: [
          {
            range: Range.DUMMY,
            associatedComments: [],
            name: SourceId('aa'),
            typeParameters: [],
            typeDefinition: {
              type: 'object',
              names: [SourceId('')],
              range: Range.DUMMY,
              mappings: { d: { isPublic: true, type: SourceIntType(DummySourceReason) } },
            },
            members: [
              {
                associatedComments: [],
                name: SourceId(''),
                range: Range.DUMMY,
                isMethod: true,
                isPublic: true,
                typeParameters: [],
                parameters: [],
                type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                body: SourceExpressionInt(3),
              },
            ],
          },
        ],
        interfaces: [],
      })
        .toArray()
        .map(moduleReferenceToString)
        .sort((a, b) => a.localeCompare(b))
    ).toEqual(['A']);
  });

  it('can track and update dependencies', () => {
    const tracker = new DependencyTracker();
    const moduleA = ModuleReference(['A']);
    const moduleB = ModuleReference(['B']);
    const moduleC = ModuleReference(['C']);
    const moduleD = ModuleReference(['D']);
    const moduleE = ModuleReference(['E']);

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
    function of(): B = B.init(A.a())
    method intValue(): int = this.value
  }`;
    const sourceC = `import { B } from B
  class C(Int(int), Boo(B)) {
    function ofInt(value: int): C = C.Int(value)
    function ofB(b: B): C = C.Boo(b)
    method intValue(): int = match (this) { | Int v -> v  | Boo b -> b.intValue()  }
  }`;
    const sourceD = `import { A } from A
  import { B } from B
  import { C } from C

  class IdentifyChecker { function equals(c1: C, c2: C): bool = c1.intValue() == c2.intValue() }
  class Main { function main(): bool = IdentifyChecker.equals(C.ofInt(A.a()), C.ofB(B.of())) }`;

    const moduleReferenceA = ModuleReference(['A']);
    const moduleReferenceB = ModuleReference(['B']);
    const moduleReferenceC = ModuleReference(['C']);
    const moduleReferenceD = ModuleReference(['D']);

    const errorCollector = createGlobalErrorCollector();

    const sources = ModuleReferenceCollections.hashMapOf(
      [
        moduleReferenceA,
        parseSamlangModuleFromText(
          sourceA,
          moduleReferenceA,
          errorCollector.getModuleErrorCollector(moduleReferenceA)
        ),
      ],
      [
        moduleReferenceB,
        parseSamlangModuleFromText(
          sourceB,
          moduleReferenceB,
          errorCollector.getModuleErrorCollector(moduleReferenceB)
        ),
      ],
      [
        moduleReferenceC,
        parseSamlangModuleFromText(
          sourceC,
          moduleReferenceC,
          errorCollector.getModuleErrorCollector(moduleReferenceC)
        ),
      ],
      [
        moduleReferenceD,
        parseSamlangModuleFromText(
          sourceD,
          moduleReferenceD,
          errorCollector.getModuleErrorCollector(moduleReferenceD)
        ),
      ]
    );

    const [, globalTypingContext] = typeCheckSources(sources, errorCollector);
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
      "D.sam:5:65-5:67: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
      "D.sam:5:82-5:84: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
      'D.sam:6:63-6:70: [UnresolvedName]: Name `C.ofInt` is not resolved.',
      'D.sam:6:79-6:84: [UnresolvedName]: Name `C.ofB` is not resolved.',
    ]);
  });

  it('typeCheckSources smoke test (failing case)', () => {
    const sourceA = `class A { function a(): int = 42 function a(): int = 42 }`;
    const sourceB = `import { A } from A
  class B<A, A>(val value: int) {
    function of(): B<int, bool> = B.init(A.a())
    method intValue(): int = this.value
  }`;
    const sourceC = `import { B } from B
  class C(Int(int), Int(bool), Boo(B)) {
    function ofInt(value: int): C = C.Int(value)
    function <T, F, T>ofB(b: B): C = C.Boo(b)
    method intValue(): int = match (this) { | Int v -> v  | Boo b -> b.intValue()  }
  }`;
    const sourceD = `import { A } from A
  import { B } from B
  import { C } from C

  class IdentifyChecker { function equals(c1: C, c1: C): bool = c1.intValue() == c1.intValue() }
  class Main { function main(): bool = true }
  class Useless {
    function main(): unit = {
      val _ = (foo: Useless) -> {};
    }
  }`;

    const moduleReferenceA = ModuleReference(['A']);
    const moduleReferenceB = ModuleReference(['B']);
    const moduleReferenceC = ModuleReference(['C']);
    const moduleReferenceD = ModuleReference(['D']);

    const errorCollector = createGlobalErrorCollector();

    const sources = ModuleReferenceCollections.mapOf(
      [
        moduleReferenceA,
        parseSamlangModuleFromText(
          sourceA,
          moduleReferenceA,
          errorCollector.getModuleErrorCollector(moduleReferenceA)
        ),
      ],
      [
        moduleReferenceB,
        parseSamlangModuleFromText(
          sourceB,
          moduleReferenceB,
          errorCollector.getModuleErrorCollector(moduleReferenceB)
        ),
      ],
      [
        moduleReferenceC,
        parseSamlangModuleFromText(
          sourceC,
          moduleReferenceC,
          errorCollector.getModuleErrorCollector(moduleReferenceC)
        ),
      ],
      [
        moduleReferenceD,
        parseSamlangModuleFromText(
          sourceD,
          moduleReferenceD,
          errorCollector.getModuleErrorCollector(moduleReferenceD)
        ),
      ]
    );

    typeCheckSources(sources, errorCollector);
    expect(
      errorCollector
        .getErrors()
        .map((e) => e.toString())
        .sort()
    ).toEqual([
      'A.sam:1:43-1:44: [Collision]: Name `a` collides with a previously defined name.',
      'B.sam:2:11-2:12: [Collision]: Name `A` collides with a previously defined name.',
      'B.sam:2:14-2:15: [Collision]: Name `A` collides with a previously defined name.',
      'B.sam:3:35-3:41: [UnexpectedType]: Expected: `(__UNDECIDED__) -> B<int, bool>`, actual: `(int) -> B<__UNDECIDED__, __UNDECIDED__>`.',
      'C.sam:2:21-2:24: [Collision]: Name `Int` collides with a previously defined name.',
      'C.sam:3:43-3:48: [UnexpectedType]: Expected: `bool`, actual: `int`.',
      'C.sam:4:21-4:22: [Collision]: Name `T` collides with a previously defined name.',
      'C.sam:5:56-5:57: [UnexpectedType]: Expected: `int`, actual: `bool`.',
      'C.sam:5:72-5:80: [UnresolvedName]: Name `intValue` is not resolved.',
      'D.sam:5:50-5:52: [Collision]: Name `c1` collides with a previously defined name.',
    ]);
  });

  it('typeCheckSources identifier resolution test.', () => {
    // Test https://github.com/SamChou19815/samlang/issues/167 is resolved.
    const sourceA = `
  class SameName(val a: int) {
    function create(): SameName = SameName.init(0)
  }`;
    const sourceB = `import { SameName } from A
  class Producer {
    function produce(): SameName = SameName.create()
  }`;
    const sourceC = `import { Producer } from B

  class SameName(val b: int) {
    // Here, Producer.produce() produces a SameName class from module a, so the field a should exist.
    function create(): SameName = SameName.init(Producer.produce().a)
  }`;

    const moduleReferenceA = ModuleReference(['A']);
    const moduleReferenceB = ModuleReference(['B']);
    const moduleReferenceC = ModuleReference(['C']);

    const errorCollector = createGlobalErrorCollector();

    const sources = ModuleReferenceCollections.mapOf(
      [
        moduleReferenceA,
        parseSamlangModuleFromText(
          sourceA,
          moduleReferenceA,
          errorCollector.getModuleErrorCollector(moduleReferenceA)
        ),
      ],
      [
        moduleReferenceB,
        parseSamlangModuleFromText(
          sourceB,
          moduleReferenceB,
          errorCollector.getModuleErrorCollector(moduleReferenceB)
        ),
      ],
      [
        moduleReferenceC,
        parseSamlangModuleFromText(
          sourceC,
          moduleReferenceC,
          errorCollector.getModuleErrorCollector(moduleReferenceC)
        ),
      ]
    );

    typeCheckSources(sources, errorCollector);
    expect(errorCollector.getErrors().map((e) => e.toString())).toEqual([]);
  });

  it('typeCheckSingleModuleSource smoke test', () => {
    const errorCollector = createGlobalErrorCollector();
    const checkedModule = typeCheckSingleModuleSource(
      parseSamlangModuleFromText(
        'class Main {}',
        ModuleReference(['Test']),
        errorCollector.getModuleErrorCollector(ModuleReference(['Test']))
      ),
      errorCollector
    );

    expect(errorCollector.getErrors()).toEqual([]);
    expect(checkedModule.imports).toEqual([]);
    expect(checkedModule.classes.length).toBe(1);
    expect(checkedModule.classes[0]?.name.name).toBe('Main');
    expect(checkedModule.classes[0]?.members).toEqual([]);
  });

  it('typeCheckSourceHandles test', () => {
    const moduleReference = ModuleReference(['Test']);
    const sourceCode = `
  interface UnusedInterface<T> { function main(): unit }
  class Main {
    function main(): unit = Builtins.println("Hello "::"World!")
  }
  `;

    const { compileTimeErrors } = typeCheckSourceHandles([[moduleReference, sourceCode]]);
    expect(compileTimeErrors.map((it) => it.toString())).toEqual([]);
  });
});
