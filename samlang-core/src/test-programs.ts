export type SamlangProgramCheckerTestSource = {
  readonly testName: string;
  readonly sourceCode: string;
};

export const samlangProgramCheckerTestSources: readonly SamlangProgramCheckerTestSource[] = [
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
private class Foo(val bar: int) {
  function create(): Foo = { bar: 42 }
}
private class Jar(Bar(int), Baz(bool)) {}

class Main {
  function main(): unit = println(intToString(Foo.create().bar))
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

export type WellTypedSamlangProgramTestCase = {
  readonly testCaseName: string;
  readonly expectedStandardOut: string;
  readonly sourceCode: string;
};

export const runnableSamlangProgramTestCases: readonly WellTypedSamlangProgramTestCase[] = [
  {
    testCaseName: 'and-or-inside-if',
    expectedStandardOut: 'one\n',
    sourceCode: `
class Main {
  function main(): unit = {
    val i = 1;
    val j = 2;
    if (i < j && i > 0 && j > 0) then {
      val a = 3;
      val b = 4;
      if (a > b || a + b > 0 && true) then println("one") else println("two")
    } else {
      val a = 3;
      val b = 4;
      if (a == 2 || b == 4) then {
        println("three")
      } else {
        println("four")
      }
    }
  }
}
`,
  },
  {
    testCaseName: 'block-in-if-else',
    expectedStandardOut: '',
    sourceCode: `
class Main {
  function main(): unit =
    if (true) then {
      val _ = Main.main2();
      val _ = Main.main3();
      val _ = 3;
      {}
    } else {
      {}
    }

  function main2(): int =
    if (true) then {
      val _ = 3;
      3
    } else {
      2
    }

  function main3(): unit =
    if (true) then {
      val _ = 3;
    } else {
      // Do nothing...
    }
}
`,
  },
  {
    testCaseName: 'builtins',
    expectedStandardOut: '42!\n',
    sourceCode: `
class Main {
  function main(): unit = {
    val value = intToString(stringToInt("42"))::"!";
    val _ = println(value);
  }
}
`,
  },
  {
    testCaseName: 'cf-test-1',
    expectedStandardOut: '361200\n',
    sourceCode: `
class Main {
  function testI(acc: int, i: int): int =
    if (i >= 30 + 100/100 - 2000*2000/(10*10*10*4000)) then
      acc
    else
      Main.testI(Main.testJ(acc, 0), i + 1)

  function testJ(acc: int, j: int): int =
    if (j >= 10 + 100 * 99 * 98 * 97 * 0) then
      acc
    else
      // +1204
      Main.testJ(acc + 34 * 34 + 4 + 1 + 1231 / 28, j + 1)

  // 1204 * 30 * 10 = 361200
  function main(): unit = println(intToString(Main.testI(0, 0)))
}
`,
  },
  {
    testCaseName: 'cf-test-2',
    expectedStandardOut: '7000\n',
    sourceCode: `
class Main {
  function test(acc: int, i: int): int =
    if (i >= 10*10*2) then
      acc
    else {
      // 35
      val increase = (1+2*3-4/5%10000000/12334) + (1+2*3-4/5%10000000/12334) +
                     (1+2*3-4/5%10000000/12334) + (1+2*3-4/5%10000000/12334) +
                     (1+2*3-4/5%10000000/12334);
      Main.test(acc + increase, i + 1)
    }

  // 35 * 200 = 7000
  function main(): unit = println(intToString(Main.test(0, 0)))
}
`,
  },
  {
    testCaseName: 'cf-test-3',
    expectedStandardOut: '1400\n',
    sourceCode: `
class Main {
  function test(acc: int, i: int): int =
    if (i >= 10*10*2) then
      acc
    else {
      // +7
      Main.test(acc + 1 + 2 * 3 - 4 / 5 % 10000000 / 1234, i + 1)
    }

  // 200 * 7 = 1400
  function main(): unit = println(intToString(Main.test(0, 0)))
}
`,
  },
  {
    testCaseName: 'concat-string',
    expectedStandardOut: 'Hello World!\n',
    sourceCode: `
class Main {
  function main(): unit = println("Hello "::"World!")
}
`,
  },
  {
    testCaseName: 'correct-op',
    expectedStandardOut: 'OK\n',
    sourceCode: `
class Main {
  function crash(a: string, b: string): unit = {
    val _ = println("different:");
    val _ = println("a:");
    val _ = println(a);
    val _ = println("b:");
    val _ = println(b);
    val _ = panic("crash!");
  }

  function checkInt(a: int, b: int): unit =
    if (a == b) then {} else Main.crash(intToString(a), intToString(b))

  function boolToString(b: bool): string =
    if (b) then "true" else "false"

  function checkBool(a: bool, b: bool): unit =
    if (a == b) then {} else Main.crash(Main.boolToString(a), Main.boolToString(b))

  function checkAll(): unit = {
    val _ = Main.checkInt(42, 21 * 2);
    val _ = Main.checkInt(42, 84 / 2);
    val _ = Main.checkInt(42, 91 % 49);
    val _ = Main.checkInt(42, 20 + 22);
    val _ = Main.checkInt(42, 50 - 8);

    val _ = Main.checkBool(false, false);
    val _ = Main.checkBool(true, true);

    val _ = Main.checkBool(false, false && false);
    val _ = Main.checkBool(false, true && false);
    val _ = Main.checkBool(false, false && true);
    val _ = Main.checkBool(true, true && true);
    val _ = Main.checkBool(false, false || false);
    val _ = Main.checkBool(true, true || false);
    val _ = Main.checkBool(true, false || true);
    val _ = Main.checkBool(true, true || true);

    val _ = Main.checkBool(true, 42 < 50);
    val _ = Main.checkBool(false, 42 > 42);
    val _ = Main.checkBool(false, 42 > 50);
    val _ = Main.checkBool(true, 42 <= 42);
    val _ = Main.checkBool(true, 42 <= 43);
    val _ = Main.checkBool(false, 42 <= 41);
    val _ = Main.checkBool(true, 50 > 42);
    val _ = Main.checkBool(false, 42 < 42);
    val _ = Main.checkBool(false, 50 < 42);
    val _ = Main.checkBool(true, 42 >= 42);
    val _ = Main.checkBool(true, 43 >= 42);
    val _ = Main.checkBool(false, 41 >= 42);

    val _ = Main.checkBool(true, 1 == 1);
    val _ = Main.checkBool(false, 1 == 2);
    val _ = Main.checkBool(false, 1 != 1);
    val _ = Main.checkBool(true, 1 != 2);
    val _ = Main.checkBool(true, true == true);
    val _ = Main.checkBool(false, true == false);
    val _ = Main.checkBool(false, true != true);
    val _ = Main.checkBool(true, true != false);

    val c = 21;
    val _ = Main.checkInt(-42, -(c * 2)); // prevent constant folding!
    val _ = Main.checkBool(true, !false);
    val _ = Main.checkBool(false, !true);
  }

  function main(): unit = {
    val _ = Main.checkAll();
    println("OK")
  }
}
`,
  },
  {
    testCaseName: 'cse-test-1',
    expectedStandardOut: '30\n12\n15\n',
    sourceCode: `
class Main {
  function printInt(i: int): unit = println(intToString(i))

  function test(a: int, b: int): unit = {
    val _ = Main.printInt((a * b + a) + (a * b + a));
    val _ = Main.printInt(a * b);
    val _ = Main.printInt(a * b + a);
  }

  function main(): unit = Main.test(3, 4)
}
`,
  },
  {
    testCaseName: 'cse-test-2',
    expectedStandardOut: 'OK\n',
    sourceCode: `
class Main {
  function printInt(i: int): unit = println(intToString(i))

  function check(actual: int, expected: int): unit =
    if (actual != expected) then
      panic("actual: "::intToString(actual)::", expected "::intToString(expected))
    else {}

  function test(first: bool, a: int, b: int, aTimesB: int): unit = {
    val t = if (first) then a * b else a * b;
    val _ = Main.check(a * b, aTimesB);
  }

  function main(): unit = {
    val _ = Main.test(true, 3, 4, 12);
    val _ = Main.test(false, 3, 4, 12);
    println("OK")
  }
}
`,
  },
  {
    testCaseName: 'cse-test-3',
    expectedStandardOut: '2181\n',
    sourceCode: `
class Main {
  function log(x: int, b: int): int =
    if (x <= 0) then 0
    else if (x <= b) then 1
    else if (x <= b * b) then 2
    else if (x <= b * b * b) then 3
    else if (x <= b * b * b * b) then 4
    else if (x <= b * b * b * b * b) then 5
    else if (x <= b * b * b * b * b * b) then 6
    else if (x <= b * b * b * b * b * b * b) then 7
    else if (x <= b * b * b * b * b * b * b * b) then 8
    else if (x <= b * b * b * b * b * b * b * b * b) then 9
    else if (x <= b * b * b * b * b * b * b * b * b * b) then 10
    else 10 + Main.log(x / (b * b * b * b * b * b * b * b * b * b), b)

  function plusLog2(acc: int, i: int): int = acc + Main.log(i, 2)

  function test(acc: int, i: int): int =
    if (i >= 300) then
      acc
    else
      Main.test(acc + Main.log(i, 2), i + 1)

  function main(): unit = println(intToString(Main.test(0, 0)))
}
`,
  },
  {
    testCaseName: 'cse-test-4',
    expectedStandardOut: '2700\n',
    sourceCode: `
class Main {
  function test(totalPicograms: int, i: int): int = {
    val maxLong = 9223372036854775807;
    if (i >= 300) then
      totalPicograms
    else {
      val megagrams = maxLong - i;
      val kilograms = megagrams / 1000;
      val grams = (megagrams / 1000) / 1000;
      val milligrams = ((megagrams / 1000) / 1000) / 1000;
      val micrograms = (((megagrams / 1000) / 1000) / 1000) / 1000;
      val nanograms = ((((megagrams / 1000) / 1000) / 1000) / 1000) / 1000;
      val picograms = (((((megagrams / 1000) / 1000) / 1000) / 1000) / 1000) / 1000;
      Main.test(totalPicograms + picograms, i + 1)
    }
  }

  function main(): unit = println(intToString(Main.test(0, 0)))
}`,
  },
  {
    testCaseName: 'cse-test-5',
    expectedStandardOut: '150\n',
    sourceCode: `
class Main {
  function test(totalOddNumbers: int, i: int): int = {
    if (i >= 300) then
      totalOddNumbers
    else {
      val iMod64 = i % 64;
      val iMod32 = (i % 64) % 32;
      val iMod16 = ((i % 64) % 32) % 16;
      val iMod8 = (((i % 64) % 32) % 16) % 8;
      val iMod4 = ((((i % 64) % 32) % 16) % 8) % 4;
      val iMod2 = (((((i % 64) % 32) % 16) % 8) % 4) % 2;
      Main.test(totalOddNumbers + iMod2, i + 1)
    }
  }

  function main(): unit = println(intToString(Main.test(0, 0)))
}
`,
  },
  {
    testCaseName: 'cse-test-6',
    expectedStandardOut: 'OK\n',
    sourceCode: `
class Main {
  function printInt(i: int): unit = println(intToString(i))

  function check(actual: int, expected: int): unit =
    if (actual != expected) then
      panic("actual: "::intToString(actual)::", expected "::intToString(expected))
    else {}

  function test(first: bool, a: int, b: int, aTimesB: int): unit = {
    val _ = if (first) then {
      val _ = a * b;
    } else {};
    val _ = Main.check(a * b, aTimesB);
  }

  function main(): unit = {
    val _ = Main.test(true, 3, 4, 12);
    val _ = Main.test(false, 3, 4, 12);
    println("OK")
  }
}
`,
  },
  {
    testCaseName: 'different-classes-demo',
    expectedStandardOut: 'OK\n',
    sourceCode: `
class Math {
  function plus(a: int, b: int): int = a + b
  function cosine(angleInDegree: int): int = panic("Not supported!")
}

class Student(val name: string, val age: int) {
  method getName(): string = this.name
  method getAge(): int = this.age
  function dummyStudent(): Student = { name: "RANDOM_BABY", age: 0 }
}

class PrimitiveType(
  U(bool),
  I(int),
  S(string),
  B(bool),
) {
  // some random functions
  function getUnit(): PrimitiveType = U(false)
  function getInteger(): PrimitiveType = I(42)
  function getString(): PrimitiveType = S("Answer to life, universe, and everything.")
  function getBool(): PrimitiveType = B(false)

  // pattern matching!
  method isTruthy(): bool =
    match (this) {
      | U _ -> false
      | I i -> i != 0
      | S s -> s != ""
      | B b -> b
    }
}

class FunctionExample {
  function <T> getIdentityFunction(): (T) -> T = (x) -> x
}

class Box<T>(val content: T) {
  function <T> init(content: T): Box<T> = { content } // object short hand syntax
  method getContent(): T = {
    val { content } = this; content
  }
}

class Option<T>(None(unit), Some(T)) {
  function <T> getNone(): Option<T> = None({})
  function <T> getSome(d: T): Option<T> = Some(d)
  method forceValue(): T =
    match (this) {
      | None _ -> panic("Ah")
      | Some v -> v
    }
  method <R> map(f: (T) -> R): Option<R> =
    match (this) {
      | None _ -> None({})
      | Some d -> Some(f(d))
    }
}

class Main {

  private function assertTrue(condition: bool, message: string): unit =
    if (condition) then {} else panic(message)

  private function assertFalse(condition: bool, message: string): unit =
    if (!condition) then {} else panic(message)

  private function assertEquals(e1: int, e2: int, message: string): unit =
    if (e1 == e2) then {} else panic(intToString(e1)::" "::intToString(e2)::" "::message)

  private function consistencyTest(): unit = {
    val _ = Main.assertEquals(Option.getSome(3).map((i) -> i + 1).forceValue(), 4, "Ah1");
    val _ = Main.assertEquals(Box.init(42).getContent(), 42, "Ah2");
    val _ = Main.assertEquals(FunctionExample.getIdentityFunction()(42), 42, "Ah3");
    val _ = Main.assertEquals(Student.dummyStudent().getAge(), 0, "Ah4");
    val _ = Main.assertEquals(Math.plus(2, 2), 4, "Ah5");
    val _ = Main.assertFalse(PrimitiveType.getUnit().isTruthy(), "Ah6");
    val _ = Main.assertTrue(PrimitiveType.getInteger().isTruthy(), "Ah7");
    val _ = Main.assertTrue(PrimitiveType.getString().isTruthy(), "Ah8");
    val _ = Main.assertFalse(PrimitiveType.getBool().isTruthy(), "Ah9");
  }

  function main(): unit = {
    val _ = Main.consistencyTest();
    println("OK")
  }
}
`,
  },
  {
    testCaseName: 'different-expressions-demo',
    expectedStandardOut: '42\n',
    sourceCode: `
class Foo(val a: int) {
  function bar(): int = 3
}

class Option<T>(None(unit), Some(T)) {
  function matchExample(opt: Option<int>): int =
    match (opt) {
      | None _ -> 42
      | Some a -> a
    }
}

class Obj(private val d: int, val e: int) {
  function valExample(): int = {
    val a: int = 1;
    val b = 2;
    val [_, c] = ["dd", 3]; // c = 3
    val { e as d } = { d: 5, e: 4 }; // d = 4
    val _ = 42;
    // 1 + 2 * 3 / 4 = 1 + 6/4 = 1 + 1 = 2
    a + b * c / d
  }
}

class Main {
  function identity(a: int): int = a

  function random(): int = {
    val a = 42; // very random
    a
  }

  function oof(): int = 14

  function div(a: int, b: int): int =
    if b == 0 then (
      panic("Division by zero is illegal!")
    ) else (
      a / b
    )

  function nestedVal(): int = {
    val a = {
      val b = 4;
      val c = {
        val c = b;
        b
      }; // c = 4
      c
    }; // 4
    val [e, b, _] = [1, "bool", true];
    a + 1 // 5
  }

  function main(): unit = println(intToString(Main.identity(
    Foo.bar() * Main.oof() * Obj.valExample() / Main.div(4, 2) + Main.nestedVal() - 5
  )))
}
`,
  },
  {
    testCaseName: 'empty',
    expectedStandardOut: '',
    sourceCode: `
class Main {
  function main(): unit = {}
}
`,
  },
  {
    testCaseName: 'evaluation-order',
    expectedStandardOut: `0
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
`,
    sourceCode: `
// This program uses function calls that contain printing statement to detect evaluation order.

class Main {
  // return a random number, print order
  function intIdentity(order: int): int = {
    val _ = println(intToString(order));
    2
  }

  // return a random bool, print order
  function boolIdentity(item: bool, order: int): bool = {
    val _ = println(intToString(order));
    item
  }

  // return the string back, print str
  function stringIdentity(str: string): string = {
    val _ = println("surprise!");
    str
  }

  function binaryExpressionTest(): unit = {
    val _ = Main.intIdentity(0) + Main.intIdentity(1);
    val _ = Main.intIdentity(2) - Main.intIdentity(3);
    val _ = Main.intIdentity(4) * Main.intIdentity(5);
    val _ = Main.intIdentity(6) / Main.intIdentity(7);
    val _ = Main.intIdentity(8) % Main.intIdentity(9);
    val _ = Main.intIdentity(10) < Main.intIdentity(11);
    val _ = Main.intIdentity(12) <= Main.intIdentity(13);
    val _ = Main.intIdentity(14) > Main.intIdentity(15);
    val _ = Main.intIdentity(16) >= Main.intIdentity(17);
    val _ = Main.intIdentity(18) == Main.intIdentity(19);
    val _ = Main.intIdentity(20) != Main.intIdentity(21);
    val _ = Main.boolIdentity(false, 22) || Main.boolIdentity(false, 23);
    val _ = Main.boolIdentity(true, 24) && Main.boolIdentity(true, 25);
  }

  function main(): unit = Main.binaryExpressionTest()
}
`,
  },
  {
    testCaseName: 'function-call-never-ignored',
    expectedStandardOut: 'hi\n',
    sourceCode: `
class Main {
  function hi(): int = {
    val _ = println("hi");
    5
  }

  function main(): unit = {
    val _ = Main.hi();
  }
}
`,
  },
  {
    testCaseName: 'generic-object-test',
    expectedStandardOut: '2\n42\n',
    sourceCode: `
class GenericObject<T1, T2>(val v1: T1, val v2: T2) {
  function main(): unit = {
    val f = (v2) -> (
      if (v2 + 1 == 3) then
        { v1: 3, v2 }
      else
        { v1: 3, v2: 42 }
    );
    val _ = println(intToString(f(2).v2)); // print 2
    val _ = println(intToString(f(3).v2)); // print 42
  }
}

class Main {
  function main(): unit = GenericObject.main()
}
`,
  },
  {
    testCaseName: 'if-else-consistency',
    expectedStandardOut: '3\n3\nOK\n',
    sourceCode: `
class Main {
  function main(): unit = {
    val a = if (true) then
      (if (false) then 10000 else 3)
    else
      4
    ;
    val b = if (false) then 4 else if (true) then 3 else 20000;
    val _ = println(intToString(a));
    val _ = println(intToString(b));
    if (a != b) then panic("Not OK") else println("OK")
  }
}
`,
  },
  {
    testCaseName: 'if-else-unreachable-1',
    expectedStandardOut: 'success\n',
    sourceCode: `
class Main {
  function main(): unit = {
    val i = 2;
    val j = 3;
    if (i > j) then
      println("shouldn't reach here")
    else if (j < i) then
      println("shouldn't reach here")
    else if (i < 0) then
      println("shouldn't reach here")
    else
      println("success")
  }
}
`,
  },
  {
    testCaseName: 'if-else-unreachable-2',
    expectedStandardOut: 'success\n',
    sourceCode: `
class Main {
  function main(): unit = {
    val i = 3;
    val j = 2;
    if (i > j) then
      println("success")
    else if (j < i) then
      println("shouldn't reach here")
    else if (i < 0) then
      println("shouldn't reach here")
    else
      println("shouldn't reach here")
  }
}
`,
  },
  {
    testCaseName: 'map-but-ignore',
    expectedStandardOut: '',
    sourceCode: `
class Option<T>(None(unit), Some(T)) {
  method <R> mapButIgnore(f: (T) -> R): unit = {
    val _ = match (this) {
      // Resolved to Option<UNDECIDED>
      | None _ -> None({})
      // Resolved to Option<R>
      // If the merge process does not go deeper,
      // we will complain that Option<UNDECIDED> != Option<R>,
      // which is bad!
      | Some d -> Some(f(d))
    };
  }

  function main(): unit = {
    val none = None({});
    val _ = Some(none.mapButIgnore((it) -> it)).mapButIgnore((it) -> it);
  }
}

class Main {
  function main(): unit = Option.main()
}
`,
  },
  {
    testCaseName: 'math-functions',
    expectedStandardOut: '24\n55\n',
    sourceCode: `
class Main {
  function factorial(n: int): int =
    if (n == 0) then 1 else Main.factorial(n - 1) * n

  function fib(n: int): int =
    if (n == 0) then 0 else if (n == 1) then 1 else Main.fib(n - 2) + Main.fib(n - 1)

  function uselessRecursion(n: int): unit = if (n == 0) then {} else Main.uselessRecursion(n - 1)

  function main(): unit = {
    val _ = println(intToString(Main.factorial(4)));
    val _ = println(intToString(Main.fib(10)));
    val _ = Main.uselessRecursion(20);
  }
}
`,
  },
  {
    testCaseName: 'mutually-recursive',
    expectedStandardOut: 'OK\n',
    sourceCode: `
class Main {
  function isEven(n: int): bool = if n == 0 then true else Main.isOdd(n-1)
  function isOdd(n: int): bool = if n == 0 then false else Main.isEven(n-1)

  function main(): unit =
    if (!(Main.isEven(3)) && Main.isOdd(3)) then println("OK") else println("BAD")
}
`,
  },
  {
    testCaseName: 'optional-semicolon',
    expectedStandardOut: '-7\n',
    sourceCode: `
class Main(val a: int, val b: bool) {
  function main(): unit = {
    val _ = 3
    val a = 2;
    val c = a - 3;
    val d = c * 7
    val b = true;
    val [_, e] = [a, c]
    val _ = { a: e, b }
    val finalValue = a + c + d + (if (b) then 0 else panic("")) + e; // 2 + (-1) + (-7) + (-1) = -7
    println(intToString(finalValue))
  }
}
`,
  },
  {
    testCaseName: 'reordering-test',
    expectedStandardOut: 'OK\n',
    sourceCode: `
class Main {
  function assertEqual(a: int, b: int): unit = if (a != b) then panic("") else {}

  function main(): unit = {
    val v0 = if (true) then {
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      65536
    } else 42;
    val v1 = if (false) then 42 else {
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      65536
    };
    val v2 = if (!true) then 42 else {
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      65536
    };
    val v3 = if (!false) then {
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      val _ = 0;
      65536
    } else 42;
    val _ = Main.assertEqual(v0, v1);
    val _ = Main.assertEqual(v2, v3);
    val _ = Main.assertEqual(v0, v2);
    println("OK")
  }
}
`,
  },
  {
    testCaseName: 'short-circuit-and-or',
    expectedStandardOut: `0
1
false
0
1
true
0
false
0
false
0
true
0
true
0
1
false
0
1
true
0
1
0
1
0
0
0
0
0
1
0
1
`,
    sourceCode: `
class Main {
  function printAndReturn(b: bool, i: int): bool = {
    val _ = println(intToString(i));
    b
  }

  function printlnBool(b: bool): unit = if (b) then println("true") else println("false")

  function testAndShortCircuitInExpression(): unit = {
    val b1 = Main.printAndReturn(true, 0) && Main.printAndReturn(false, 1); // [0] [1]
    val _ = Main.printlnBool(b1); // false
    val b2 = Main.printAndReturn(true, 0) && Main.printAndReturn(true, 1); // [0] [1]
    val _ = Main.printlnBool(b2); // true
    val b3 = Main.printAndReturn(false, 0) && Main.printAndReturn(false, 1); // [0]
    val _ = Main.printlnBool(b3); // false
    val b4 = Main.printAndReturn(false, 0) && Main.printAndReturn(true, 1); // [0]
    val _ = Main.printlnBool(b4); // false
  }

  function testOrShortCircuitInExpression(): unit = {
    val b1 = Main.printAndReturn(true, 0) || Main.printAndReturn(false, 1); // [0]
    val _ = Main.printlnBool(b1); // true
    val b2 = Main.printAndReturn(true, 0) || Main.printAndReturn(true, 1); // [0]
    val _ = Main.printlnBool(b2); // true
    val b3 = Main.printAndReturn(false, 0) || Main.printAndReturn(false, 1); // [0] [1]
    val _ = Main.printlnBool(b3); // false
    val b4 = Main.printAndReturn(false, 0) || Main.printAndReturn(true, 1); // [0] [1]
    val _ = Main.printlnBool(b4); // true
  }

  function testAndShortCircuitInIf(): unit = {
    // [0] [1]
    val _ = if (Main.printAndReturn(true, 0) && Main.printAndReturn(false, 1)) then panic("Ah") else {};
    // [0] [1]
    val _ = if (Main.printAndReturn(true, 0) && Main.printAndReturn(true, 1)) then {} else panic("Ah");
    // [0]
    val _ = if (Main.printAndReturn(false, 0) && Main.printAndReturn(false, 1)) then panic("Ah") else {};
    // [0]
    val _ = if (Main.printAndReturn(false, 0) && Main.printAndReturn(true, 1)) then panic("Ah") else {};
  }

  function testOrShortCircuitInIf(): unit = {
    // [0]
    val _ = if (Main.printAndReturn(true, 0) || Main.printAndReturn(false, 1)) then {} else panic("Ah");
    // [0]
    val _ = if (Main.printAndReturn(true, 0) || Main.printAndReturn(true, 1)) then {} else panic("Ah");
    // [0] [1]
    val _ = if (Main.printAndReturn(false, 0) || Main.printAndReturn(false, 1)) then panic("Ah") else {};
    // [0] [1]
    val _ = if (Main.printAndReturn(false, 0) || Main.printAndReturn(true, 1)) then {} else panic("Ah");
  }

  function main(): unit = {
    val _ = Main.testAndShortCircuitInExpression();
    val _ = Main.testOrShortCircuitInExpression();
    val _ = Main.testAndShortCircuitInIf();
    val _ = Main.testOrShortCircuitInIf();
  }
}
`,
  },
  {
    testCaseName: 'string-global-constant',
    expectedStandardOut: 'OK\n',
    sourceCode: `
class Main {
  function main(): unit = {
    val a1 = "a";
    val a2 = "a";
    if a1 == a2 then
      println("OK")
    else {
      println("BAD")
    }
  }
}
`,
  },
  {
    testCaseName: 'too-much-interference',
    expectedStandardOut: '0\n',
    sourceCode: `
class Main {
  function main(): unit = {
    // without constant propagation, this program will spill a lot!
    val v0 = 0;
    val v1 = 0;
    val v2 = 0;
    val v3 = 0;
    val v4 = 0;
    val v5 = 0;
    val v6 = 0;
    val v7 = 0;
    val v8 = 0;
    val v9 = 0;
    val v10 = 0;
    val v11 = 0;
    val v12 = 0;
    val v13 = 0;
    val v14 = 0;
    val v15 = 0;
    val v16 = 0;
    val v17 = 0;
    val v18 = 0;
    val v19 = 0;
    val v20 = 0;
    val v21 = 0;
    val v22 = 0;
    val v23 = 0;
    val v24 = 0;
    val v25 = 0;
    val v26 = 0;
    val v27 = 0;
    val v28 = 0;
    val v29 = 0;
    val v30 = 0;
    val v31 = 0;
    val v32 = 0;
    val v33 = 0;
    val v34 = 0;
    val v35 = 0;
    val v36 = 0;
    val v37 = 0;
    val v38 = 0;
    val v39 = 0;
    val v40 = 0;
    val v41 = 0;
    val v42 = 0;
    val v43 = 0;
    val v44 = 0;
    val v45 = 0;
    val v46 = 0;
    val v47 = 0;
    val v48 = 0;
    val v49 = 0;
    val result =
    v0 + v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8 + v9 +
    v10 + v11 + v12 + v13 + v14 + v15 + v16 + v17 + v18 + v19 +
    v20 + v21 + v22 + v23 + v24 + v25 + v26 + v27 + v28 + v29 +
    v30 + v31 + v32 + v33 + v34 + v35 + v36 + v37 + v38 + v39 +
    v40 + v41 + v42 + v43 + v44 + v45 + v46 + v47 + v48 + v49
    ;
    println(intToString(result))
  }
}
`,
  },
  {
    testCaseName: 'various-syntax-forms',
    expectedStandardOut: '84\n',
    sourceCode: `
class Clazz(val t: int) {
    function of(): Clazz = { t: 42 }

    method thisTest(): int = {
      val i: int = this.t;
      val { t as j } = this;
      i + j
    }
}

class Option<T>(Some(T), None(bool)) {
  function <T> none(): Option<T> = None(true)
  method toSome(t: T): Option<T> = Some(t)
  method isNone(): bool = match (this) {
    | None _ -> true
    | Some _ -> false
  }
  method <R> map(f: (T) -> R): Option<R> =
    match (this) {
      | None _ -> None(true)
      | Some t -> Some(f(t))
    }
}

class List<T>(Nil(bool), Cons([T * List<T>])) {
  function <T> of(t: T): List<T> =
    Cons([t, Nil(true)])
  method cons(t: T): List<T> =
    Cons([t, this])
}

class Main {
  function literalsAndSimpleExpressions(): unit = {
    val _ = 42;
    val _ = -65536;
    val _ = true;
    val _ = false;
    val _ = !true;
    val _ = !false;
    val _ = "aaa";
    val _ = {};
  }

  function variables(a: int, b: string): unit = {
    val c = 3 + a;
    val d = b == b;
    val e = c % c;
  }

  function methodAndFunctionReference(): int =
    Clazz.of().thisTest()

  function panicTest(reason: string): Clazz = panic(reason)

  function functionsTest(): unit = {
    val _ = Main.literalsAndSimpleExpressions();
    val _ = Main.variables(3, "hi");
    val _ = Main.methodAndFunctionReference();
    val _ = Main.panicTest("Ah!").thisTest();
    val _ = Main.binaryExpressions();
    val _ = Main.lambdaTest(3);
    Main.functionsTest()
  }

  function binaryExpressions(): unit = {
    val a: int = 1 * 2 + 3 / 4 % 5 - 6;
    val b: bool = a < a && 1 > 3 || 2 <= 4 && 5 >= 6;
    val c: bool = a == 2;
    val d: bool = Main.panicTest("ha") != Clazz.of();
    val e: bool = List.of(3) == List.of(a * 3);
  }

  function lambdaTest(a: int): string = {
    val b: Option<string> = Option.none().toSome(3).map(Main.lambdaTest);
    val c: Option<string> = Option.none().toSome(3).map((x) -> "empty");
    "hello world"
  }

  function main(): unit = {
    val _ = Main.literalsAndSimpleExpressions();
    val _ = Main.variables(3, "sss");
    val v = Main.methodAndFunctionReference(); // 42 + 42 == 84
    println(intToString(v))
  }
}
`,
  },
];
