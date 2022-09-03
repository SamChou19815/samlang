import { typeCheckSingleModuleSource, typeCheckSourceHandles, typeCheckSources } from '..';
import { ModuleReference, ModuleReferenceCollections } from '../../ast/common-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { parseSamlangModuleFromText } from '../../parser';

describe('samlang-core/checker', () => {
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
      'C.sam:2:36-2:37: [ArityMismatchError]: Incorrect type arguments size. Expected: 2, actual: 0.',
      'C.sam:3:43-3:48: [UnexpectedType]: Expected: `bool`, actual: `int`.',
      'C.sam:4:21-4:22: [Collision]: Name `T` collides with a previously defined name.',
      'C.sam:4:30-4:31: [ArityMismatchError]: Incorrect type arguments size. Expected: 2, actual: 0.',
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
interface G : Baz2<string, bool> {
  method <TD> m1(a: int, b: int): TD // tparam name mismatch
  function <TA: TA, TB, TC> f1(a: TA, b: TB): TC // has bound mismatch
  method <TE: Foo> unrelated(): unit
}
interface H : G {
  method <TE> unrelated(): unit
}
interface J : G {
  method unrelated(): unit
}
interface K : G {
  method <TE: Bar> unrelated(): unit
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
      'A.sam:32:3-32:64: [UnexpectedType]: Expected: `(int, int) -> TC`, actual: `(string, string) -> TC`.',
      'A.sam:33:3-33:74: [UnexpectedType]: Expected: `(TA, TB) -> TC`, actual: `(string, string) -> TC`.',
      'A.sam:34:3-34:64: [UnexpectedType]: Expected: `(string, bool) -> TC`, actual: `(string, string) -> TC`.',
      'A.sam:37:11-37:13: [TypeParameterNameMismatch]: Type parameter name mismatch. Expected `TC`, actual: TD.',
      'A.sam:38:17-38:19: [UnexpectedTypeKind]: Expected kind: `unbounded type parameter`, actual: `bounded type parameter`.',
      'A.sam:38:17-38:19: [UnresolvedName]: Name `TA` is not resolved.',
      'A.sam:42:3-42:9: [UnexpectedTypeKind]: Expected kind: `bounded type parameter`, actual: `unbounded type parameter`.',
      'A.sam:45:3-45:9: [ArityMismatchError]: Incorrect type parameters size. Expected: 1, actual: 0.',
      'A.sam:48:3-48:9: [UnexpectedType]: Expected: `Foo`, actual: `Bar`.',
      'A.sam:50:19-50:25: [UnresolvedName]: Name `DumDum` is not resolved.',
      'A.sam:51:21-51:28: [CyclicTypeDefinition]: Type `Cyclic2` has a cyclic definition.',
      'A.sam:52:21-52:28: [CyclicTypeDefinition]: Type `Cyclic3` has a cyclic definition.',
      'A.sam:53:21-53:28: [CyclicTypeDefinition]: Type `Cyclic1` has a cyclic definition.',
      'A.sam:54:21-54:28: [CyclicTypeDefinition]: Type `Cyclic4` has a cyclic definition.',
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
