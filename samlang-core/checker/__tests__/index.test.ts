import {
  collectModuleReferenceFromSamlangModule,
  DependencyTracker,
  typeCheckSingleModuleSource,
  typeCheckSourceHandles,
  typeCheckSources,
  typeCheckSourcesIncrementally,
} from '..';
import {
  Location,
  ModuleReference,
  ModuleReferenceCollections,
  moduleReferenceToString,
} from '../../ast/common-nodes';
import { AstBuilder, SourceExpressionInt, SourceId } from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { parseSamlangModuleFromText } from '../../parser';

describe('samlang-core/checker', () => {
  it('collectModuleReferenceFromSamlangModule works', () => {
    expect(
      collectModuleReferenceFromSamlangModule({
        imports: [
          {
            location: Location.DUMMY,
            importedMembers: [],
            importedModule: ModuleReference(['A']),
            importedModuleLocation: Location.DUMMY,
          },
        ],
        classes: [
          {
            location: Location.DUMMY,
            associatedComments: [],
            name: SourceId('aa'),
            typeParameters: [],
            typeDefinition: {
              type: 'object',
              names: [SourceId('')],
              location: Location.DUMMY,
              mappings: { d: { isPublic: true, type: AstBuilder.IntType } },
            },
            members: [
              {
                associatedComments: [],
                name: SourceId(''),
                location: Location.DUMMY,
                isMethod: true,
                isPublic: true,
                typeParameters: [],
                parameters: [],
                type: AstBuilder.FunType([], AstBuilder.IntType),
                body: SourceExpressionInt(3),
              },
            ],
          },
        ],
        interfaces: [],
      })
        .toArray()
        .map(moduleReferenceToString)
        .sort((a, b) => a.localeCompare(b)),
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
        parseSamlangModuleFromText(sourceA, moduleReferenceA, errorCollector.getErrorReporter()),
      ],
      [
        moduleReferenceB,
        parseSamlangModuleFromText(sourceB, moduleReferenceB, errorCollector.getErrorReporter()),
      ],
      [
        moduleReferenceC,
        parseSamlangModuleFromText(sourceC, moduleReferenceC, errorCollector.getErrorReporter()),
      ],
      [
        moduleReferenceD,
        parseSamlangModuleFromText(sourceD, moduleReferenceD, errorCollector.getErrorReporter()),
      ],
    );

    typeCheckSources(sources, errorCollector);
    expect(errorCollector.getErrors().map((e) => e.toString())).toEqual([]);

    sources.delete(moduleReferenceC);
    typeCheckSourcesIncrementally(sources, [moduleReferenceC, moduleReferenceD], errorCollector);
    expect(
      errorCollector
        .getErrors()
        .map((e) => e.toString())
        .sort(),
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
  }
  interface Bar {}
  class Foo : Bar {}`;

    const moduleReferenceA = ModuleReference(['A']);
    const moduleReferenceB = ModuleReference(['B']);
    const moduleReferenceC = ModuleReference(['C']);
    const moduleReferenceD = ModuleReference(['D']);

    const errorCollector = createGlobalErrorCollector();

    const sources = ModuleReferenceCollections.mapOf(
      [
        moduleReferenceA,
        parseSamlangModuleFromText(sourceA, moduleReferenceA, errorCollector.getErrorReporter()),
      ],
      [
        moduleReferenceB,
        parseSamlangModuleFromText(sourceB, moduleReferenceB, errorCollector.getErrorReporter()),
      ],
      [
        moduleReferenceC,
        parseSamlangModuleFromText(sourceC, moduleReferenceC, errorCollector.getErrorReporter()),
      ],
      [
        moduleReferenceD,
        parseSamlangModuleFromText(sourceD, moduleReferenceD, errorCollector.getErrorReporter()),
      ],
    );

    typeCheckSources(sources, errorCollector);
    expect(
      errorCollector
        .getErrors()
        .map((e) => e.toString())
        .sort(),
    ).toEqual([
      'A.sam:1:43-1:44: [Collision]: Name `a` collides with a previously defined name.',
      'B.sam:2:11-2:12: [Collision]: Name `A` collides with a previously defined name.',
      'B.sam:2:14-2:15: [Collision]: Name `A` collides with a previously defined name.',
      'B.sam:3:35-3:48: [UnexpectedType]: Expected: `B<int, bool>`, actual: `B<int, int>`.',
      'C.sam:2:21-2:24: [Collision]: Name `Int` collides with a previously defined name.',
      'C.sam:3:43-3:48: [UnexpectedType]: Expected: `bool`, actual: `int`.',
      'C.sam:4:21-4:22: [Collision]: Name `T` collides with a previously defined name.',
      'C.sam:5:56-5:57: [UnexpectedType]: Expected: `int`, actual: `bool`.',
      'C.sam:5:56-5:57: [UnexpectedType]: Expected: `int`, actual: `bool`.',
      'C.sam:5:70-5:82: [UnexpectedType]: Expected: `bool`, actual: `int`.',
      'D.sam:5:50-5:52: [Collision]: Name `c1` collides with a previously defined name.',
    ]);
  });

  it('typeCheckSources interface conformance tests', () => {
    const source = `
interface Foo {}
class A : Foo {} // OK
interface Bar {
  function a(): unit
  method b(): string
}
class B : Bar {} // Error
class C : Bar {
  function a(): string = "" // error
  method b(): unit = {} // error
}
class D : Bar {
  function b(): string = "" // error
  method a(): unit = {} // error
}
interface Base<TA, TB> {
  method <TC> m1(a: TA, b: TB): TC
}
interface Baz1<TA, TB> : Base<int, TB> {
  function <TA, TB, TC> f1(a: TA, b: TB): TC
}
interface Baz2<TA, TB> : Baz1<TA, int> {
  method <TC> m2(a: TA, b: TB): TC
}
class E : Baz2<string, bool> { // all good
  method <TC> m1(a: int, b: int): TC = Builtins.panic("")
  function <TA, TB, TC> f1(a: TA, b: TB): TC = Builtins.panic("")
  method <TC> m2(a: string, b: bool): TC = Builtins.panic("")
}
class F : Baz2<string, bool> {
  method <TC> m1(a: string, b: string): TC = Builtins.panic("") // error
  function <TA, TB, TC> f1(a: string, b: string): TC = Builtins.panic("") // error
  method <TC> m2(a: string, b: string): TC = Builtins.panic("") // error
}
class G : Baz2<string, bool> { // same as E, but different tparams, OK
  method <TD> m1(a: int, b: int): TD = Builtins.panic("")
  function <TA1, TB1, TD> f1(a: TA1, b: TB1): TD = Builtins.panic("")
  method <TD> m2(a: string, b: bool): TD = Builtins.panic("")
  method <TE: Foo> unrelated(): unit = {}
}
class Z<T: Foo> : DumDum {} // error
interface Cyclic1 : Cyclic2 {} // error: cyclic
interface Cyclic2 : Cyclic3 {} // error: cyclic
interface Cyclic3 : Cyclic1 {} // error: cyclic
interface Cyclic4 : Cyclic4 {} // error: cyclic
    `;

    const moduleReference = ModuleReference(['A']);
    const errorCollector = createGlobalErrorCollector();
    const sources = ModuleReferenceCollections.mapOf([
      moduleReference,
      parseSamlangModuleFromText(source, moduleReference, errorCollector.getErrorReporter()),
    ]);

    typeCheckSources(sources, errorCollector);
    expect(
      errorCollector
        .getErrors()
        .map((e) => e.toString())
        .sort(),
    ).toEqual([
      'A.sam:10:3-10:28: [UnexpectedType]: Expected: `() -> unit`, actual: `() -> string`.',
      'A.sam:11:3-11:24: [UnexpectedType]: Expected: `() -> string`, actual: `() -> unit`.',
      'A.sam:14:3-14:28: [UnexpectedTypeKind]: Expected kind: `method`, actual: `function`.',
      'A.sam:15:3-15:24: [UnexpectedTypeKind]: Expected kind: `function`, actual: `method`.',
      'A.sam:32:3-32:64: [UnexpectedType]: Expected: `(int, int) -> _T0`, actual: `(string, string) -> _T0`.',
      'A.sam:33:3-33:74: [UnexpectedType]: Expected: `(_T0, _T1) -> _T2`, actual: `(string, string) -> _T2`.',
      'A.sam:34:3-34:64: [UnexpectedType]: Expected: `(string, bool) -> _T0`, actual: `(string, string) -> _T0`.',
      'A.sam:42:19-42:25: [UnresolvedName]: Name `DumDum` is not resolved.',
      'A.sam:43:21-43:28: [CyclicTypeDefinition]: Type `Cyclic2` has a cyclic definition.',
      'A.sam:44:21-44:28: [CyclicTypeDefinition]: Type `Cyclic3` has a cyclic definition.',
      'A.sam:45:21-45:28: [CyclicTypeDefinition]: Type `Cyclic1` has a cyclic definition.',
      'A.sam:46:21-46:28: [CyclicTypeDefinition]: Type `Cyclic4` has a cyclic definition.',
      'A.sam:8:1-8:17: [MissingDefinitions]: Missing definitions for [a, b].',
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
        parseSamlangModuleFromText(sourceA, moduleReferenceA, errorCollector.getErrorReporter()),
      ],
      [
        moduleReferenceB,
        parseSamlangModuleFromText(sourceB, moduleReferenceB, errorCollector.getErrorReporter()),
      ],
      [
        moduleReferenceC,
        parseSamlangModuleFromText(sourceC, moduleReferenceC, errorCollector.getErrorReporter()),
      ],
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
        errorCollector.getErrorReporter(),
      ),
      errorCollector,
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
