import ModuleReference from '../ast/common/module-reference';
import { checkSources } from '../services/source-processor';

type SamlangProgramCheckerTestSource = {
  readonly testName: string;
  readonly sourceCode: string;
};

const samlangProgramCheckerTestSources: readonly SamlangProgramCheckerTestSource[] = [
  {
    testName: 'access-private-member',
    sourceCode: `
class A {
  private function b(): int = 3
}

class C(val v: bool) {
  function init(): C = { v: true }
}

class Main {
  function main(): unit = {
    val _ = A.b();
    val _ = C.init();
  }
}
`,
  },
  {
    testName: 'add-panic-to-class',
    sourceCode: `
class A(val a: int) {
  function init(): A = { a: 42 }
}

class Main {
  function main1(): int = panic("Ah") + A.init()
  function main2(): int = A.init() + panic("Ah")
  private function main(): int = Main.main1() + Main.main2()
}
`,
  },
  {
    testName: 'add-with-class',
    sourceCode: `
class A(val a: int) {
  function init(): A = { a: 42 }
}

class Main {
  function main(): int = 3 + A.init()
}
`,
  },
  {
    testName: 'allowed-cyclic-classes',
    sourceCode: `
class A {
  function a(): int = B.b()
}

class B {
  function b(): int = A.a()
}

class Main {
  function main(): unit = {}
}
`,
  },
  {
    testName: 'complete-trash',
    sourceCode: `This is a bad source.`,
  },
  {
    testName: 'forty-two',
    sourceCode: `
class Main {
  function main(): int = 42
}
`,
  },
  {
    testName: 'hello-world',
    sourceCode: `
class Main {
  function main(): string = "Hello World!"
}
`,
  },
  {
    testName: 'illegal-binary-operations',
    sourceCode: `
class Box<T>(val value: T) {
  function <T> empty(): Box<T> = { value: panic("PANIC") }
  function <T> of(value: T): Box<T> = { value }
}

class AnotherBox<T>(val value: T) {
  function <T> empty(): AnotherBox<T> = { value: panic("PANIC") }
}

class Main {
  function test01(): int = 42 + Box.empty()
  function test02(): int = Box.empty() + 42
  function test03(): bool = 42 == Box.empty()
  function test04(): bool = Box.empty() == 42
  function test05(): bool = Box.empty() || false
  function test06(): bool = false || Box.empty()
  function test07(): int = 42 * false
  function test08(): int = false + false
  function test09(): bool = Box.of(true) == Box.of(false)
  function test10(): bool = Box.of(true) == Box.of(42)
  function test11(): bool = Box.of(true) == Box.empty()
  function test12(): bool = Box.empty() == Box.of(42)
  function test13(): bool = Box.empty() == AnotherBox.empty()
  function test14(): bool =
    // Deeply nested type inconsistencies
    Box.of(Box.of(Box.of(42))) == Box.of(Box.of(Box.of(false)))
}
`,
  },
  {
    testName: 'illegal-private-field-access',
    sourceCode: `
class Fields(val a: int, private val b: bool) {
  function get(): Fields = {
    val f = { a: 3, b: true };
    val {a, b} = f;
    val _ = f.a;
    val _ = f.b;
    f
  }
}

class Main {
  function main(): unit = {
    val f = Fields.get();
    val {a, b} = f;
    val _ = f.a;
    val _ = f.b;
  }
}
`,
  },
  {
    testName: 'illegal-shadow',
    sourceCode: `
class A {}
class A {}

class ConflictingFunctions {
  function test(): unit = ConflictingFunctions.test()
  function test(): unit = ConflictingFunctions.test()
}

class ConflictingMethods(val a: int) {
  method test(): int = 42
  method test(): int = 42
}

class ConflictingMethodsAndFunctions(val a: int) {
  method test(): int = 42
  function test(): unit = ConflictingMethodsAndFunctions.test()
}

class FunctionParametersConflict {
  function test(test: int, test: int): unit = {}
}

class Main {
  function main(): unit = {
    val a = 42;
    val a = 42;
  }
}
`,
  },
  {
    testName: 'insufficient-type-info',
    sourceCode: `
class NotEnoughTypeInfo {
  function <T> randomFunction(): T = panic("I can be any type!")
  function main(): unit = {
    val _ = NotEnoughTypeInfo.randomFunction();
  }
}
class Main {
  function main(): unit = NotEnoughTypeInfo.main()
}
`,
  },
  {
    testName: 'insufficient-type-info-none',
    sourceCode: `
class Option<T>(Some(T), None(bool)) {
  function <T> none(): Option<T> = None(true)
  method toSome(t: T): Option<T> = Some(t)
}
class Main {
  function main(): unit = {
    val a = Option.none();
  }
}
`,
  },
  {
    testName: 'invalid-property-declaration-syntax',
    sourceCode: `
class Main(a: int, val b: int) {
  function main(): int = 42
}
`,
  },
  {
    testName: 'lots-of-fields-and-methods',
    sourceCode: `
class SamObject<T>(val sam: T, val good: bool, val linesOfCode: int) {
  function <T> create(sam: T): SamObject<T> = { sam, good: true, linesOfCode: 100000 }
  method getSam(): T = this.sam
  method isGood(): bool = true
  method getLinesOfCode(): int = 0 + this.linesOfCode
  method withDifferentLOC(linesOfCode: int): SamObject<T> =
    { sam: this.sam, good: this.good, linesOfCode }
}

class Main {
  function main(): unit = {
    val sam = SamObject.create("sam zhou").withDifferentLOC(100001);
    val s = sam.getSam();
    val linesOfCode = if (sam.isGood()) then sam.getLinesOfCode() else 0;
  }
}
`,
  },
  {
    testName: 'min-int',
    sourceCode: `
class Main {
  function main(): int = -9223372036854775808
}
`,
  },
  {
    testName: 'multiple-type-errors',
    sourceCode: `
class Main {
  function main(): int = 233333 + "foo" + "bar" + 42
}
`,
  },
  {
    testName: 'overengineered-helloworld',
    sourceCode: `
class HelloWorld(val message: string) {
  private method getMessage(): string = {
    val { message } = this;
    message
  }

  function getGlobalMessage(): string = {
    val hw = { message: "Hello World!" };
    hw.getMessage()
  }
}

class Main {
  function main(): string = HelloWorld.getGlobalMessage()
}
`,
  },
  {
    testName: 'overengineered-helloworld-2',
    sourceCode: `
class NewYear2019<T>(val message: T) {
  function init(): NewYear2019<string> = { message: "Hello World!" }
  method getMessage(): T = {
    val { message as msg } = this; msg
  }
}

class Main {
  function main(): string = NewYear2019.init().getMessage()
}
`,
  },
  {
    testName: 'overflow-int',
    sourceCode: `
class Main {
  function main(): int = 999999999999999999999999999999
}
`,
  },
  {
    testName: 'polymorphic-option',
    sourceCode: `
class Option<T>(Some(T), None(bool)) {
  function <T> none(): Option<T> = None(true)
  method toSome(t: T): Option<T> = Some(t)
}

class Main {
  function main(): Option<string> = Option.none().toSome("hi")
  function main2(): Option<string> = {
    val a = Option.none();
    a.toSome("hi")
  }

  function main3(): Option<string> = {
    val a: Option<string> = Option.none();
    a.toSome("hi")
  }
}
`,
  },
  {
    testName: 'private-classes',
    sourceCode: `
private class Util {}
private class Foo(val bar: int) {}
private class Jar(Bar(int), Baz(bool)) {}

class Main {
  function main(): unit = {}
}
`,
  },
  {
    testName: 'sam-in-samlang-list',
    sourceCode: `
class List<T>(Nil(unit), Cons([T * List<T>])) {
  function <T> of(t: T): List<T> =
    Cons([t, Nil({})])
  method cons(t: T): List<T> =
    Cons([t, this])
}
class Developer(
  val name: string, val github: string,
  val projects: List<string>,
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...")
    val github = "SamChou19815"
    { name: "Sam Zhou", github, projects: l }
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
`,
  },
  {
    testName: 'simple-mismatch',
    sourceCode: `
class Main {
  // should be type bool!
  function main(): int = true
}
`,
  },
  {
    testName: 'simple-type-inference',
    sourceCode: `
/**
 * From Cornell CS4110's Type Checking Lecture.
 * This version is NOT annotated.
 */
class Main {
  function main(): unit = {
    val _ = (a, b, c) -> if a(b + 1) then b else c;
  }
}
`,
  },
  {
    testName: 'simple-type-inference-annotated',
    sourceCode: `
/**
 * From Cornell CS4110's Type Checking Lecture.
 * This version is fully annotated.
 */
class Main {
  function main(): unit = {
    val _: ((int) -> bool, int, int) -> int = (a, b, c) -> if a(b + 1) then b else c;
  }
}
`,
  },
  {
    testName: 'undefined-type',
    sourceCode: `
class Main {
  function main(): HelloWorld = 1
}
`,
  },
  {
    testName: 'undefined-variable',
    sourceCode: `
class Main {
  function main(): string = helloWorld
}
`,
  },
];

const expectedErrors: readonly string[] = [
  'access-private-member.sam:12:13-12:16: [UnresolvedName]: Name `A.b` is not resolved.',
  'add-panic-to-class.sam:7:41-7:47: [UnexpectedType]: Expected: `() -> int`, actual: `() -> A`.',
  'add-panic-to-class.sam:8:27-8:33: [UnexpectedType]: Expected: `() -> int`, actual: `() -> A`.',
  'add-with-class.sam:7:30-7:36: [UnexpectedType]: Expected: `() -> int`, actual: `() -> A`.',
  "complete-trash.sam:1:1-1:1: [SyntaxError]: mismatched input 'This' expecting {<EOF>, 'import', 'class', 'private', 'interface'}",
  'illegal-binary-operations.sam:12:33-12:42: [UnexpectedType]: Expected: `() -> int`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:13:28-13:37: [UnexpectedType]: Expected: `() -> int`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:14:35-14:44: [UnexpectedType]: Expected: `() -> int`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:15:44-15:46: [UnexpectedType]: Expected: `Box<__UNDECIDED__>`, actual: `int`.',
  'illegal-binary-operations.sam:16:29-16:38: [UnexpectedType]: Expected: `() -> bool`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:17:38-17:47: [UnexpectedType]: Expected: `() -> bool`, actual: `() -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:18:33-18:38: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  'illegal-binary-operations.sam:19:28-19:33: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  'illegal-binary-operations.sam:19:36-19:41: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  'illegal-binary-operations.sam:21:45-21:51: [UnexpectedType]: Expected: `(int) -> Box<bool>`, actual: `(__UNDECIDED__) -> Box<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:24:44-24:60: [UnexpectedType]: Expected: `() -> Box<__UNDECIDED__>`, actual: `() -> AnotherBox<__UNDECIDED__>`.',
  'illegal-binary-operations.sam:27:35-27:41: [UnexpectedType]: Expected: `(Box<Box<bool>>) -> Box<Box<Box<int>>>`, actual: `(__UNDECIDED__) -> Box<__UNDECIDED__>`.',
  'illegal-private-field-access.sam:15:13-15:14: [UnresolvedName]: Name `b` is not resolved.',
  'illegal-private-field-access.sam:17:13-17:16: [UnresolvedName]: Name `b` is not resolved.',
  'illegal-shadow.sam:12:10-12:14: [Collision]: Name `test` collides with a previously defined name.',
  'illegal-shadow.sam:17:12-17:16: [Collision]: Name `test` collides with a previously defined name.',
  'illegal-shadow.sam:21:28-21:32: [Collision]: Name `test` collides with a previously defined name.',
  'illegal-shadow.sam:27:9-27:10: [Collision]: Name `a` collides with a previously defined name.',
  'illegal-shadow.sam:3:7-3:8: [Collision]: Name `A` collides with a previously defined name.',
  'illegal-shadow.sam:7:12-7:16: [Collision]: Name `test` collides with a previously defined name.',
  "invalid-property-declaration-syntax.sam:2:12-2:12: [SyntaxError]: mismatched input 'a' expecting {'val', 'private', UpperId}",
  'multiple-type-errors.sam:3:35-3:40: [UnexpectedType]: Expected: `int`, actual: `string`.',
  'multiple-type-errors.sam:3:43-3:48: [UnexpectedType]: Expected: `int`, actual: `string`.',
  'overflow-int.sam:3:26-3:56: [SyntaxError]: Not a 64-bit integer.',
  'simple-mismatch.sam:4:26-4:30: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  'undefined-type.sam:3:3-3:34: [NotWellDefinedIdentifier]: `HelloWorld` is not well defined.',
  'undefined-type.sam:3:33-3:34: [UnexpectedType]: Expected: `HelloWorld`, actual: `int`.',
  'undefined-variable.sam:3:29-3:39: [UnresolvedName]: Name `helloWorld` is not resolved.',
];

it('samlang type checker integration test', () => {
  const { compileTimeErrors } = checkSources(
    samlangProgramCheckerTestSources.map((it) => [
      new ModuleReference([it.testName]),
      it.sourceCode,
    ])
  );

  const actualErrors = compileTimeErrors
    .map((it) => it.toString())
    .sort((a, b) => a.localeCompare(b));

  expect(actualErrors).toEqual(expectedErrors);
});
