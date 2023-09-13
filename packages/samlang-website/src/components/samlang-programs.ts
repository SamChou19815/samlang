export const HELLO_WORLD_STRING: string = `class HelloWorld {
  function getString(): string =
    "Hello World"
}`;

export const FOURTY_TWO: string = `class Math {
  function answerToLife(): int =
    2 * 21
}`;

export const PATTERN_MATCHING: string = `class Opt<T>(
  None(unit), Some(T)
) {
  method isEmpty(): bool =
    match (this) {
      | None _ -> true
      | Some _ -> false
    }

  method <R> map(f: (T) -> R): Opt<R> =
    match (this) {
      | None _ -> Opt.None({})
      | Some v -> Opt.Some(f(v))
    }
}`;

export const TYPE_INFERENCE: string = `class TypeInference {
  function <A, B, C> pipe(
    a: A, f1: (A)->B, f2: (B)->C
  ): C = f2(f1(a))

  function main(): unit = {
    // n: int
    // s: string
    val _ = TypeInference.pipe(
      1,
      (n) -> Builtins.intToString(n),
      (s) -> Builtins.stringToInt(s)
    );
  }
}`;

export const PRINT_HELLO_WORLD: string = `/**
 * This is a hello-world example.
 *
 * The WASM interpreter result and compiler output will be shown on the bottom in this example.
 *
 * You can load other example programs to learn the language by clicking the buttons above.
 *
 * All examples can be edited and inspected by builtin IDE features.
 */
class Main {
  /** This main function serves as an entry point. */
  function main(): unit =
    Builtins.println("Hello World!")
}
`;

export const MODULES: string = `// This is an example module.
// Each .sam source file defines a module.
// A module contains a list of imports, classes, and interfaces.

// You can use another module by imports.
// import { ClassA, ClassB } from Foo.Bar.Module
// import { ClassC, ClassD } from Baz.Foo.Module

/** A module can define interfaces. */
interface GlobalMessageProducer {
  function getGlobalMessage(): string
}

/** A module can also define interfaces. */
class HelloWorld(
  val message: string,
): GlobalMessageProducer {
  private method getMessage(): string = {
    val { message } = this;
    message
  }

  function getGlobalMessage(): string = {
    val hw = HelloWorld.init("Hello World");
    hw.getMessage()
  }
}

/** Interfaces and classes can be mixed in any order. */
interface RandomInterface {}

/**
 * If there is a class named \`Main\`, then the entire module
 * defines an entry point that can be called in WASM later.
 */
class Main {
  function main(): string =
    HelloWorld.getGlobalMessage()
}
`;

export const ALL_TYPES: string = `/**
 * This is a utility class.
 *
 * Utility classes serve as collections of functions.
 * e.g. Some math functions can be inside a utility class.
 */
class AllAboutPrimitiveTypes {

  // This helper function introduces you to some primitive types
  function values(): unit = {
    val _: int = 1; // 32-bit integers
    val _: bool = true; // true and false
    val _: string = "";
    // When we return nothing at the end of the block,
    // it has type unit.
  }

  // We can build on primitive types to form complex types.
  // e.g. This function returns a function type.
  function functionTypes(): (bool) -> string =
    AllAboutPrimitiveTypes.boolToString

  // We can convert between different primitive types.
  function boolToString(b: bool): string =
    if b then "true" else "false"

  // Some builtin functions also exist:
  // - Builtins.stringToInt
  // - Builtins.intToString
  // - Builtins.panic
  // - Builtins.println
}



/**
 * Now we introduce a new kind of class: object classes.
 *
 * Object classes allow you to define new data types, and a set of associated functions and methods.
 */
class Student(
  // In the constructor of the object class,
  // you can define its fields.
  private val name: string,
  // The above private field won't be visible outside of the class,
  // but the following field will be.
  val age: int
) {
  /**
   * In samlang, methods cannot be overridden.
   * They are a special kind of functions,
   * with an implicit this parameter.
   */
  method getName(): string = this.name
  private method getAge(): int = this.age

  /**
   * An object class can be instantiated by
   * \`ClassName.init(...)\`
   */
  function dummyStudent(): Student = Student.init("Immortal", 65535)
}

/**
 * An object class defines a product type; a variant class defines a sum type.
 *
 * With variant classes, you can define a type that can be either A or B or C.
 * Here is an example:
 */
class Type(U(unit), I(int), S(string), B(bool)) {
  /**
   * You can construct a variant by \`VariantClass.VariantName()\`
   */
  function getUnit(): Type = Type.U({})
  function getInteger(): Type = Type.I(42)
  function getString(): Type = Type.S("samlang")
  function getBool(): Type = Type.B(false)

  /**
   * Each variant carries some data with a specific type.
   *
   * To perform a case-analysis on different possibilities, you can use the \`match\` expression
   * to pattern match on the expression.
   */
  method isTruthy(): bool =
    match (this) {
      | U _ -> false
      | I i -> i != 0
      | S s -> s != ""
      | B b -> b
    }
}



/**
 * An interface defines a set of functions and methods that
 * must be implemented by classes that claim to implement it.
 */
interface IA { function f1(): int }

interface IB {
  function f1(): int
  method m2(): bool
}

/** An interface can extends multiple interfaces. */
interface IC : IA, IB {
  // f1 exists in both A and B. Since their signatures are the same, it's OK.
  function f3(): string
}

/** A class can implement multiple interfaces. */
class D : IA, IC {
  function f1(): int = 3
  method m2(): bool = true
  function f3(): string = "samlang"
}



/** The generics feature is supported in classes. */
class FunctionExample {
  function <T> getIdentityFunction(): (T) -> T = (x) -> x
}

/** The generics feature is supported in interfaces. */
interface IAmAGenericInterface<T> {}

class Box<T>(val content: T) {
  method getContent(): T = {
    val { content } = this; content
  }
}

class Option<T>(None(unit), Some(T)) {
  function <T> getNone(): Option<T> = Option.None({})
  function <T> getSome(d: T): Option<T> = Option.Some(d)

  method <R> map(f: (T) -> R): Option<R> =
    match (this) {
      | None _ -> Option.None({})
      | Some d -> Option.Some(f(d))
    }
}



/**
 * Generics can have bounds!
 *
 * The compiler will ensure that type arguments are subtypes of the declared bounds.
 *
 * Note that samlang does not support subtyping in general. Most places the samlang compiler still
 * requires that the expected type and the actual type are exactly the same.
 */
class TwoItemCompare {
  function <Com: Comparable<Com>> compare(
    v1: Com,
    v2: Com,
  ): int = v1.compare(v2)
}
interface Comparable<T> {
  method compare(other: T): int
}
class BoxedInt(val i: int): Comparable<BoxedInt> {
  method compare(other: BoxedInt): int =
    this.i - other.i
}
`;

export const ALL_EXPRESSIONS: string = `/**
* The expressions are listed in decreasing precedence order, so you know where to add parentheses.
*/
class Expressions {
  /** samlang supports a limited set of literals. */
  function literals(): unit = {
    val validLiteral1 = 42;
    val validLiteral2 = true;
    val validLiteral3 = false;
    val validLiteral4 = "aaa";
    // Invalid ones: 3.14, 'c'
  }

  /** \`this\` can only be used in methods. */
  method thisExpression(): Expressions = this

  /** You can refer to local variables by name. */
  function variables(a: int): int = {
    val b = 42;
    a + b
  }

  /**
   * The function below returns a block expression. It shows various usages of val statement.
   *
   * You can choose to type-annotate the pattern (variable, object, or wildcard), destruct on object,
   * and ignore the output by using wildcard.
   */
  function blocks(): int = {
    val a: int = 1;
    val b = 2;
    val { a as c } = Box.init(b);
    val _ = 42;
    a + b * c
  }

  /** Blocks can be nested */
  function nestedBlocks(): int = {
    val a = {
      val b = 4;
      val c = {
        val d = b;
        b
      };
      b
    };
    a + 1
  }

  /**
   * You can refer to a class function by \`ClassName.functionName\`.
   *
   * An object class will implicitly define a constructor function \`init\`.
   *
   * A variant class will implicit define all of their variants' constructors by tag names.
   */
  function classFunction(): () -> unit =
    Expressions.dot

  method oneMethod(): int = 42

  /** Fields and methods can be accessed by dot syntax. */
  function dot(): unit = {
    val _ = Box.init(1).a;
    val _ = Expressions.init().oneMethod;
  }

  /** There are two kinds of unary expressions */
  function unary(): unit = {
    val b: bool = !true; // Not
    val n: int = -42; // Negation
  }

  /** You can call a function as you would expect. */
  function functionCall(): unit = {
    val box = Box.init(1);
    // Functions don't have to be named.
    ((n: int) -> {})(3)
  }

  /** Supported binary expressions are listed in decreasing precedence order. */
  function binary(
    a: int, b: int,
    s1: string, s2: string,
  ): unit = {
    // Both s1 and s2 must be strings
    val _: string = s1 :: s2; // string concat
    // Both a and b must be ints
    val _: int = a * b;
    val _: int = a / b;
    val _: int = a % b;
    val _: int = a + b;
    val _: int = a - b;
    val _: bool = a < b;
    val _: bool = a > b;
    val _: bool = a <= b;
    val _: bool = a >= b;
    // a and b must have the same type
    val c: bool = a == b;
    val d: bool = a != b;
    // Both c and d must be bool
    val _: bool = c && d;
    val _: bool = c || d;
  }

  /** In samlang, we do not have ternary expression, because if-else blocks are expressions. */
  function conditionals(): string =
    if 1 == 2 then
      "Hello"
    else if true then
      "World"
    else {
      Builtins.panic("Logic is broken")
    }

  /**
   * You can use match expressions to pattern match on variants. Pattern matching must be exhaustive.
   */
  function patternMatching(opt: Option<int>): int =
    match (opt) {
      // Commenting the following line to get an error
      | None _ -> 42
      | Some a -> a
    }

  /** You can easily define an anonymous function as a lambda. */
  function lambdas(): int = {
    // Here is a simple example.
    val _ = () -> 0;
    // Here is an identity function.
    val _ = (x: int) -> x;
    // Parameters can omit annotations, but they must be
    // contextually-typed.
    val _: (int) -> int = (x) -> x;
    val f: (int, bool) -> int = (x: int, b) -> x;
    f(1, false)
  }
}

class Box(val a: int) {}
class Option<T>(None(unit), Some(T)) {}
`;
