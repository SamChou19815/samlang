export const HELLO_WORLD_STRING: string = `class HelloWorld {
  function getString(): Str =
    "Hello World"
}`;

export const FOURTY_TWO: string = `class Math {
  function answerToLife(): int =
    2 * 21
}`;

export const PATTERN_MATCHING: string = `import {Pair} from std.tuples;

class Opt<T>(
  None, Some(T)
) {
  function <T> some(v: T): Opt<T> =
    Opt.Some(v)

  method either(other: Opt<T>): Opt<T> =
    match (this, other) {
      (Some(v), _) -> Opt.Some(v),
      (_, Some(v)) -> Opt.Some(v),
      (None, None) -> Opt.None(),
    }
}`;

export const TYPE_INFERENCE: string = `class TypeInference {
  function <A, B, C> pipe(
    a: A, f1: (A)->B, f2: (B)->C
  ): C = f2(f1(a))

  function main(): unit = {
    // n: int
    // s: string
    let _ = TypeInference.pipe(
      1,
      (n) -> Str.fromInt(n),
      (s) -> s.toInt()
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
    Process.println("Hello World!")
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
  method getGlobalMessage(): Str
}

/** A module can define interfaces. */
interface MessageProducer {
  method produce(): Str
}

/** A module can also define interfaces. */
class HelloWorld(
  val message: Str,
): MessageProducer {
  method produce(): Str = this.message
}

/** Interfaces and classes can be mixed in any order. */
interface RandomInterface {}

/**
 * If there is a class named \`Main\`, then the entire module
 * defines an entry point that can be called in WASM later.
 */
class Main {
  function main(): Str =
    HelloWorld.init("hi").produce()
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
    let _: int = 1; // 32-bit integers
    let _: bool = true; // true and false
    let _: Str = "";
    // When we return nothing at the end of the block,
    // it has type unit.
  }

  // We can build on primitive types to form complex types.
  // e.g. This function returns a function type.
  function functionTypes(): (bool) -> Str =
    AllAboutPrimitiveTypes.boolToString

  // We can convert between different primitive types.
  function boolToString(b: bool): Str =
    if b {"true"} else {"false"}

  // Some builtin functions also exist:
  // - Builtins.StrToInt
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
  private val name: Str,
  // The above private field won't be visible outside of the class,
  // but the following field will be.
  val age: int
) {
  /**
   * In samlang, methods cannot be overridden.
   * They are a special kind of functions,
   * with an implicit this parameter.
   */
  method getName(): Str = this.name
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
class Type(U(unit), I(int), S(Str), B(bool)) {
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
      U(_) -> false,
      I(i) -> i != 0,
      S(s) -> s != "",
      B(b) -> b,
    }
}



/**
 * An interface defines a set of functions and methods that
 * must be implemented by classes that claim to implement it.
 */
interface IA { method f1(): int }

interface IB {
  method f1(): int
  method m2(): bool
}

/** An interface can extends multiple interfaces. */
interface IC : IA, IB {
  // f1 exists in both A and B. Since their signatures are the same, it's OK.
  method f3(): Str
}

/** A class can implement multiple interfaces. */
class D : IA, IC {
  method f1(): int = 3
  method m2(): bool = true
  method f3(): Str = "samlang"
}



/** The generics feature is supported in classes. */
class FunctionExample {
  function <T> getIdentityFunction(): (T) -> T = (x) -> x
}

/** The generics feature is supported in interfaces. */
interface IAmAGenericInterface<T> {}

class Box<T>(val content: T) {
  method getContent(): T = {
    let { content } = this; content
  }
}

class Option<T>(None, Some(T)) {
  function <T> getNone(): Option<T> = Option.None()
  function <T> getSome(d: T): Option<T> = Option.Some(d)

  method <R> map(f: (T) -> R): Option<R> =
    match (this) {
      None -> Option.None(),
      Some(d) -> Option.Some(f(d)),
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
}`;

export const ALL_EXPRESSIONS: string = `import {Pair, Triple, Tuple4} from std.tuples;
import {Option} from std.option;

/**
* The expressions are listed in decreasing precedence order, so you know where to add parentheses.
*/
class Expressions(val v: int) {
  /** samlang supports a limited set of literals. */
  function literals(): unit = {
    let validLiteral1 = 42;
    let validLiteral2 = true;
    let validLiteral3 = false;
    let validLiteral4 = "aaa";
    // Invalid ones: 3.14, 'c'
  }

  /** \`this\` can only be used in methods. */
  method thisExpression(): Expressions = this

  /** You can refer to local variables by name. */
  function variables(a: int): int = {
    let b = 42;
    a + b
  }

  /** You can create complex tuples. */
  function tuples(a: int): Tuple4<int, Pair<int, int>, Triple<int, int, int>, int> = {
    let b = 42;
    (a, (a, b), (a, b, 7), b)
  }

  /**
   * The function below returns a block expression. It shows various usages of val statement.
   *
   * You can choose to type-annotate the pattern (variable, object, or wildcard), destruct on object,
   * and ignore the output by using wildcard.
   */
  function blocks(): int = {
    let a: int = 1;
    let b = 2;
    let { a as c } = Box.init(b);
    let _ = 42;
    a + b * c
  }

  /** Blocks can be nested */
  function nestedBlocks(): int = {
    let a = {
      let b = 4;
      let c = {
        let d = b;
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
    let _ = Box.init(1).a;
    let _ = Expressions.init(1).oneMethod;
  }

  /** There are two kinds of unary expressions */
  function unary(): unit = {
    let b: bool = !true; // Not
    let n: int = -42; // Negation
  }

  /** You can call a function as you would expect. */
  function functionCall(): unit = {
    let box = Box.init(1);
    // Functions don't have to be named.
    ((n: int) -> {})(3)
  }

  /** Supported binary expressions are listed in decreasing precedence order. */
  function binary(
    a: int, b: int,
    s1: Str, s2: Str,
  ): unit = {
    // Both s1 and s2 must be strings
    let _: Str = s1 :: s2; // string concat
    // Both a and b must be ints
    let _: int = a * b;
    let _: int = a / b;
    let _: int = a % b;
    let _: int = a + b;
    let _: int = a - b;
    let _: bool = a < b;
    let _: bool = a > b;
    let _: bool = a <= b;
    let _: bool = a >= b;
    // a and b must have the same type
    let c: bool = a == b;
    let d: bool = a != b;
    // Both c and d must be bool
    let _: bool = c && d;
    let _: bool = c || d;
  }

  /** In samlang, we do not have ternary expression, because if-else blocks are expressions. */
  function conditionals(): Str =
    if 1 == 2 {
      "Hello"
    } else if true {
      "World"
    } else {
      Process.panic("Logic is broken")
    }

  /**
   * You can use deeply-nested match expressions to pattern match on variants.
   * Pattern matching must be exhaustive.
   */
  function patternMatchingOptMax(
    opt1: Option<int>,
    opt2: Option<int>,
  ): Option<int> =
    match (opt1, opt2) {
      // Commenting the following line to get an error
      (Some(v1), Some(v2)) -> {
        if v1 > v2 {
          Option.Some(v1)
        } else {
          Option.Some(v2)
        }
      },
      (Some(v), None) -> Option.Some(v),
      (None, Some(v)) -> Option.Some(v),
      (None, None) -> Option.None(),
    }

  /** You can easily define an anonymous function as a lambda. */
  function lambdas(): int = {
    // Here is a simple example.
    let _ = () -> 0;
    // Here is an identity function.
    let _ = (x: int) -> x;
    // Parameters can omit annotations, but they must be
    // contextually-typed.
    let _: (int) -> int = (x) -> x;
    let f: (int, bool) -> int = (x: int, b) -> x;
    f(1, false)
  }
}

class Box(val a: int) {}
`;
