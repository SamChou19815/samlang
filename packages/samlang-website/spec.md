# samlang Language Specification

This is the spec document for samlang based on the latest trunk. It might not match the currently released version of the language, but it should reflect the latest status well.

## 1. Introduction

samlang is a statically-typed programming language with bidirectional type inference and functional programming features. The language emphasizes type safety through its strong type system while providing developer ergonomics via automatic type deduction.

### Key Features

- **Static Typing with Type Inference**: Types are checked at compile time, but type annotations are optional when the compiler can infer them. The language uses bidirectional type inference to deduce types automatically.
- **First-Class Functions**: Functions are values that can be passed as arguments, returned from other functions, and stored in data structures. Lambda expressions are supported with syntax `(arg1, arg2: type) -> body`.
- **Pattern Matching**: A powerful pattern matching construct enables deconstructing and matching against algebraic data types, tuples, and other structured values. The `match` expression provides exhaustive and non-overlapping pattern matching.
- **Algebraic Data Types**: Classes can define sum types (variants) using syntax `class Option<T>(None, Some(T))`. Each variant can carry associated data.
- **Generics**: Type parameters enable writing generic code that works with multiple types. Type constraints can specify bounds on type parameters.
- **Object-Oriented Features**: Classes with fields (declared with `val`), methods, and static functions support both functional and object-oriented programming styles. Classes can implement interfaces and extend other interfaces.
- **Modules**: The codebase is organized into modules that can import and export declarations. Module names are dot-separated (e.g., `std.option`).
- **Compilation Targets**: samlang compiles to WebAssembly for browser execution and TypeScript for Node.js environments.

The language is designed to provide a concise, expressive syntax while maintaining strong type safety and good performance characteristics.

---

## 2. Lexical Structure

A samlang program is a sequence of tokens formed from Unicode characters. Whitespace (spaces, tabs, newlines) is ignored except to separate tokens.

### 2.1 Identifiers

Identifiers in samlang are case-sensitive and follow two patterns:

- **UpperId** (uppercase identifier): Starts with an uppercase letter `[A-Z]`, followed by zero or more alphanumeric characters `[A-Za-z0-9]`. Used for class names, variant constructors, and type names.
  - Examples: `Option`, `List`, `Result`, `MyClass`, `ABC123`

- **LowerId** (lowercase identifier): Starts with a lowercase letter `[a-z]`, followed by zero or more alphanumeric characters `[A-Za-z0-9]`. Used for function names, method names, variable names, and field names.
  - Examples: `main`, `map`, `foldLeft`, `fooBar`, `abc123`

### 2.2 Literals

**Integer Literals**: Decimal integers matching pattern `0` or `[1-9][0-9]*`. Integers are 32-bit signed values ranging from `-2147483648` to `2147483647`. The special case `-2147483648` is recognized as the minimum 32-bit integer value.

- Examples: `0`, `42`, `2147483647`, `-2147483648`

**Boolean Literals**: The reserved words `true` and `false`.

**String Literals**: Double-quoted character sequences. Strings can contain escape sequences preceded by a backslash:

- `\t` - horizontal tab
- `\v` - vertical tab
- `\0` - null character
- `\b` - backspace
- `\f` - form feed
- `\n` - newline
- `\"` - double quote character
- `\\` - backslash character (to escape the backslash itself)

- Example: `"Hello, World!\n\tTabbed"`

**Unit Literal**: The keyword `unit` represents the unit type and its sole value.

### 2.3 Comments

Three forms of comments are supported:

1. **Line Comment**: Starts with `//` and continues to the end of the line.
   - Example: `// This is a comment`

2. **Block Comment**: Starts with `/*` and ends with `*/`. Can span multiple lines.
   - Example:
     ```
     /* This is a
        multi-line
           comment */
     ```

3. **Doc Comment**: Starts with `/**` and ends with `*/`. Used for documentation.
   - Example:
     ```
     /**
      * This is a documentation comment
      * that spans multiple lines
      */
     ```

### 2.4 Keywords

The following keywords are reserved and cannot be used as identifiers:

**Import and Module Keywords:**

- `import`, `from`

**Declaration Keywords:**

- `class`, `interface`, `val`, `function`, `method`, `as`

**Visibility Modifiers:**

- `private`, `protected`, `internal`, `public`

**Control Flow Keywords:**

- `if`, `then`, `else`, `match`, `return`

**Type Keywords:**

- `int`, `Str`, `bool`, `unit`

**Literal Keywords:**

- `true`, `false`, `this`

**Forbidden Keywords:** These are reserved but not used in the language. Using them as identifiers will result in an error:

- `self`, `const`, `var`, `type`, `constructor`, `destructor`, `extends`, `implements`, `exports`, `assert`

### 2.5 Operators and Punctuation

**Parentheses and Braces:**

- `(` `)` - Parentheses
- `{` `}` - Braces

**Separators:**

- `_` - Underscore (used for wildcard patterns)
- `;` - Semicolon
- `:` - Colon
- `::` - Double colon
- `,` - Comma
- `.` - Dot
- `|` - Bar (used in match expressions)

**Arrow:**

- `->` - Arrow (used in lambda expressions and match branches)

**Assignment Operator:**

- `=` - Assign

**Unary Operators:**

- `!` - Logical not
- `-` - Arithmetic negation

**Binary Operators:**

Arithmetic operators:

- `*` - Multiply
- `/` - Divide
- `%` - Modulo
- `+` - Plus
- `-` - Minus

Comparison operators:

- `<` - Less than
- `<=` - Less than or equal
- `>` - Greater than
- `>=` - Greater than or equal
- `==` - Equal
- `!=` - Not equal

Logical operators:

- `&&` - Logical and
- `||` - Logical or

**Ellipsis:**

- `...` - Dot dot dot

### 2.6 Tokenization Rules

Tokens are minimal lexical units. The lexer processes source text sequentially, recognizing the longest possible token at each position. Comments and whitespace are ignored during tokenization and do not affect the syntactic structure of the program.

---

## 3. Module System

### 3.1 File-to-Module Mapping

Each `.sam` source file corresponds to exactly one module. The module name is derived from the file path by replacing directory separators with dots and removing the `.sam` extension.

```
tests/AllTests.sam       → tests.AllTests
std/option.sam          → std.option
std/tuples.sam          → std.tuples
```

Module references are interned in the compiler's heap to enable efficient comparison and avoid string duplication.

### 3.2 Imports

Modules declare explicit imports to use names from other modules:

```samlang
import { Option, TryUnwrap } from std.option;
import { Pair, Triple } from std.tuples;
import { ForTests } from tests.StdLib;
```

The import syntax is:

```samlang
import { Name1, Name2, Name3 } from module.path
```

Imports must be at the top of a file and can import classes, interfaces, and their members (functions, methods, and variants of enum classes).

### 3.3 Standard Library

The `std/` directory contains standard library modules which are automatically included in compilation:

- `std.option` - Optional values (`Option<T>`)
- `std.result` - Error handling (`Result<T, E>`)
- `std.list` - Linked lists (`List<T>`)
- `std.map` - Ordered maps (`Map<K: Comparable<K>, V>`)
- `std.set` - Ordered sets (`Set<V: Comparable<V>>`)
- `std.tuples` - Tuple types (`Pair<E0, E1>`, `Triple<E0, E1, E2>`, etc.)
- `std.interfaces` - Common interfaces (`Comparable<T>`, `TryUnwrap<T>`)
- `std.boxed` - Boxed primitives (`Int`, `Bool`)

Standard library modules can be shadowed by user-defined modules only when `__dangerously_allow_libdef_shadowing__` is enabled in `sconfig.json`.

### 3.4 Visibility

The `private` keyword restricts members to the containing module. A private class, interface, or member cannot be accessed from outside its defining module.

```samlang
private class NodeEnumerationHelper<K: Comparable<K>, V>(
  End,
  More(K, V, NodeEnumerationHelper<K, V>)
) {
  // Implementation hidden from other modules
}

class PublicClass {
  private function helper(): unit = { /* module-private */ }
  function publicFunction(): unit = { /* visible to all */ }
}
```

Private classes are commonly used as implementation details within a module (e.g., helper enum types for tree traversal).

---

## 4. Top-Level Declarations

### 4.1 Classes

Classes are the primary top-level declaration in samlang. There are three kinds of classes based on their type definitions.

#### 4.1.1 Struct Classes (Product Types)

Struct classes define product types with named fields using the `val` keyword. An `init` constructor is automatically generated.

```samlang
class Student(val name: Str, val age: int) {
  method getName(): Str = this.name
  method getAge(): int = this.age
}
```

Usage:

```samlang
let s = Student.init("Alice", 21)
let n = s.getName()
```

Fields in struct classes may be omitted from the constructor:

```samlang
class Clazz(val t: Pair<Triple<int, int, bool>, Str>) {
  function of(): Clazz = Clazz.init(((42, 2, false), "")
}
```

#### 4.1.2 Enum Classes (Sum Types)

Enum classes define sum types with variants. Variants are listed in parentheses and automatically generate variant constructors.

```samlang
class Color(Red, Green, Blue, Custom(int, int, int)) {
  method toRGB(): Triple<int, int, int> =
    match this {
      Red -> Triple.init(255, 0, 0),
      Green -> Triple.init(0, 255, 0),
      Blue -> Triple.init(0, 0, 255),
      Custom(r, g, b) -> Triple.init(r, g, b),
    }
}

class Option<T>(None, Some(T)) {
  method <R> map(f: (T) -> R): Option<R> =
    match this {
      None -> Option.None(),
      Some(v) -> Option.Some(f(v)),
    }
}
```

Usage:

```samlang
let red = Color.Red()
let custom = Color.Custom(128, 64, 32)
let some = Option.Some(42)
let none = Option.None<int>()
```

Variants with associated data specify types in parentheses. A variant without data (like `None`) uses `unit` internally.

#### 4.1.3 Plain Classes

Plain classes have no type definition—only braces containing static functions and methods.

```samlang
class Math {
  function plus(a: int, b: int): int = a + b
}

class FunctionExample {
  function <T> getIdentityFunction(): (T) -> T = (x: T) -> x
}
```

### 4.2 Interfaces

Interfaces define method signatures without implementations. They are used to specify contracts that classes must fulfill.

```samlang
interface Comparable<T> {
  method compare(other: T): int
}

interface TryUnwrap<T> {
  method tryUnwrap(): Option<T>
}

interface GeneralTuple<E0, E1> {
  method first(): E0
  method second(): E1
}
```

Interface members cannot have bodies—they consist only of method declarations.

### 4.3 Type Parameters

Classes and interfaces can be generic with type parameters declared in angle brackets.

```samlang
class List<T>(Nil, Cons(T, List<T>)) {
  method <R> map(f: (T) -> R): List<R> = ...
}

class Box<T>(val content: T) {
  method getContent(): T = this.content
}
```

Type parameters can have interface bounds using a colon:

```samlang
class Set<V: Comparable<V>>(Empty, Leaf(V), Node(...)) { ... }
class Map<K: Comparable<K>, V>(Empty, Leaf(K, V), Node(...)) { ... }
```

### 4.4 Supertype Declarations

Classes can declare that they implement one or more interfaces using a colon-separated list after the class name or type definition.

```samlang
class Int(val value: int) : Comparable<Int> {
  method compare(other: Int): int = this.value - other.value
}

class Option<T>(None, Some(T)) : TryUnwrap<T> {
  method tryUnwrap(): Option<T> = this
}

class Pair<E0, E1>(val e0: E0, val e1: E1) : GeneralTuple<E0, E1> {
  method first(): E0 = this.e0
  method second(): E1 = this.e1
}

class BoxedInt(val i: int) : Comparable<BoxedInt>, Useless {
  method compare(other: BoxedInt): int = this.i - other.i
}
```

Interfaces can extend other interfaces (the colon after an interface name means "extends").

### 4.5 Members

Classes contain two kinds of members: functions (static) and methods (instance).

#### Functions

Static functions are defined with the `function` keyword:

```samlang
class Math {
  function plus(a: int, b: int): int = a + b
}
```

Called as:

```samlang
Math.plus(2, 2)
```

Generic functions declare type parameters before the function name:

```samlang
class Option<T>(None, Some(T)) {
  function <T> getSome(d: T): Option<T> = Option.Some(d)
}
```

#### Methods

Methods are defined with the `method` keyword and operate on `this`:

```samlang
class Student(val name: Str, val age: int) {
  method getName(): Str = this.name
}
```

Called on an instance:

```samlang
let s = Student.init("Bob", 30)
s.getName()
```

Methods can also be generic:

```samlang
class Option<T>(None, Some(T)) {
  method <R> map(f: (T) -> R): Option<R> = ...
}
```

#### Fields

Fields are declared with `val` in struct classes and are accessed via `this.fieldName` or via pattern matching. Fields are immutable—there is no `mut` or equivalent keyword.

```samlang
class Person(val name: Str, val age: int) {
  method getInfo(): Str = this.name
}
```

Access via pattern:

```samlang
let Person { name, age } = Person.init("Alice", 25)
```

### 4.6 Visibility on Members

Individual members can be marked `private` to restrict them to the containing module:

```samlang
class DifferentModulesDemo {
  private function assertTrue(condition: bool, message: Str): unit =
    if condition { } else { Process.panic(message) }

  function run(): unit = ...
}

class List<T>(Nil, Cons(T, List<T>)) {
  private method reverseWithAccumulator(acc: List<T>): List<T> =
    match this {
      Nil -> acc,
      Cons(v, rest) -> rest.reverseWithAccumulator(List.Cons(v, acc)),
    }
}
```

Private members can only be accessed from within the same module file.

---

## 5. Type System

samlang uses a static type system with bidirectional type inference. Every expression has a statically known type, and the compiler checks type compatibility at compile time. There are no implicit type conversions, no runtime type checks (except pattern matching on enum variants), and no null values.

### 5.1 Primitive Types

samlang has three primitive types:

| Type   | Description                                             | Literal examples    |
| ------ | ------------------------------------------------------- | ------------------- |
| `int`  | 32-bit signed integer (-2,147,483,648 to 2,147,483,647) | `0`, `42`, `-65536` |
| `bool` | Boolean value                                           | `true`, `false`     |
| `unit` | Unit type with a single value                           | `{ }` (empty block) |

The `unit` type is the return type of functions that perform side effects without producing a meaningful value. Its only value is written as `{ }` (an empty block expression).

### 5.2 Nominal Types

All non-primitive, non-function types in samlang are **nominal types** -- they are identified by their declared class or interface name, not by their structure. A nominal type is written as an upper-case identifier optionally followed by type arguments in angle brackets.

```
NominalType ::= UpperId
              | UpperId '<' Type (',' Type)* '>'
```

Examples:

```samlang
Str                    // built-in string type
Option<int>            // generic type with one argument
Map<Str, List<int>>    // nested generic type arguments
Pair<int, bool>        // tuple-backed pair type
```

Two nominal types are considered the same type if and only if they have the same module reference, the same class/interface name, and structurally identical type arguments. There is no structural type equivalence.

### 5.3 Function Types

Function types describe the signature of callable values (lambdas, function references, method references). A function type lists parameter types and return type.

```
FunctionType ::= '(' [Type (',' Type)*] ')' '->' Type
```

Examples:

```samlang
() -> unit              // no parameters, returns unit
(int) -> int            // one int parameter, returns int
(T, T) -> bool          // two parameters of type T, returns bool
(int, Str) -> Option<int>  // two parameters, returns Option<int>
((T) -> R) -> R         // higher-order: takes a function, returns R
```

Function types are structurally compared: two function types are the same if they have the same number of parameter types, each corresponding parameter type is the same, and the return types are the same.

### 5.4 Generic Type Variables

Type variables introduced by type parameter declarations (see Section 4.3) may appear as types within their scope. A generic type variable is written as a bare upper-case identifier.

```samlang
class Container<T>(val value: T) {
  method <R> transform(f: (T) -> R): R = f(this.value)
}
```

In this example, `T` is a generic type variable from the class-level type parameters, and `R` is a generic type variable from the method-level type parameters. Both may appear as types in the method signature and body.

Generic type variables are resolved by name within the enclosing scope. A generic type `T` is the same as another generic type `T` if and only if they have the same name (within the same scope).

### 5.5 Tuples

Tuples are anonymous product types created with parenthesized, comma-separated expressions. Under the hood, tuples are desugared to named struct types from the standard library:

| Tuple size | Mapped type                         |
| ---------- | ----------------------------------- |
| 2          | `std.tuples.Pair<E0, E1>`           |
| 3          | `std.tuples.Triple<E0, E1, E2>`     |
| 4          | `std.tuples.Tuple4<E0, E1, E2, E3>` |
| ...        | ...                                 |
| 16         | `std.tuples.Tuple16<E0, ..., E15>`  |

Tuple construction:

```samlang
let pair = (42, "hello");        // Pair<int, Str>
let triple = (1, true, "world"); // Triple<int, bool, Str>
```

Tuple fields are accessed by name: `e0`, `e1`, `e2`, etc., corresponding to the positional order. Tuple types can also be destructured using tuple patterns:

```samlang
let (x, y) = pair;
let (a, _, c) = triple;
```

The minimum tuple size is 2 and the maximum is 16.

### 5.6 Bounded Polymorphism

Type parameters may declare upper bounds to constrain the types that may be substituted for them. A bound is specified as `: BoundType` after the type parameter name, where `BoundType` must be a nominal type (class or interface, optionally with type arguments).

```samlang
class List<T: Comparable<T>>(Nil, Cons(T, List<T>)) {
  method sort(): List<T> = ...
}
```

When the compiler resolves a type argument for a bounded type parameter, it checks that the argument either:

1. Is the same type as the bound, or
2. Is a subtype of the bound (implements the bound interface, directly or transitively).

If the type argument does not satisfy the bound, the compiler reports an error.

Bounds may reference other type parameters from the same declaration:

```samlang
interface IBase<A, B> {
  method <C: A> m1(a: A, b: B): C
}
```

### 5.7 Type Inference

samlang employs **bidirectional type inference**, which combines two modes:

1. **Synthesis mode** -- the type of an expression is determined bottom-up from the expression itself. Literals, variable references, field accesses, and binary operators synthesize their types directly.
2. **Checking mode** -- a type is propagated top-down as a "hint" to an expression. This is used when the expected type is known from context, such as a return type annotation of a function or parameter types of a lambda.

Type inference works as follows:

- All function and method parameters must have explicit type annotations.
- Return types of functions and methods must have explicit type annotations.
- Local variable types are inferred from the right-hand side of `let` bindings.
- Lambda parameter types may be omitted when a type hint is available from context (e.g., passing a lambda to a function with a known function-type parameter).
- Type arguments to generic functions and constructors are inferred from argument types and return type context.

```samlang
// Type arguments inferred from context
let none = Option.None<int>();           // explicit type argument required (no context)
let some = Option.Some(42);             // T inferred as int from argument
let mapped = some.map((x) -> x + 1);   // R inferred as int from lambda return

// Lambda parameter types inferred from context
list.map((x) -> x + 1)      // x : T inferred from list's element type
list.fold((acc, v) -> acc + v, 0) // acc : int, v : T inferred from fold's signature
```

Type arguments can also be explicitly provided when inference is insufficient or ambiguous:

```samlang
let none = Option.None<int>();
let result = Result.Ok<int, Str>(42);
```

#### 5.7.1 Constraint Solving

When a generic function or method is called, the compiler solves for type arguments by unifying concrete argument types with the generic parameter types. The solver:

1. Collects constraints by matching each concrete argument type against the corresponding generic parameter type.
2. If a return type hint is available, it also constrains the return type.
3. Resolves each type variable to a concrete type. If a variable remains unsolved, it is assigned a placeholder type.
4. Substitutes the solved types back into the generic function type and verifies that the result is compatible with the concrete argument types.

### 5.8 Subtyping

samlang has a limited subtyping relation based exclusively on interface implementation. There is no structural subtyping -- two distinct classes with identical fields and methods are not interchangeable.

The subtyping rules are:

1. **Reflexivity**: Every type is a subtype of itself.
2. **Interface implementation**: A class `C` that implements interface `I` (directly or transitively through extended interfaces) is a subtype of `I`.
3. **Interface extension**: An interface `I1` that extends interface `I2` is a subtype of `I2`.
4. **Bounded type variables**: A generic type variable `T : Bound` is a subtype of `Bound`.

Subtyping is used in the following contexts:

- Checking type argument bounds: when a type parameter `T : Bound` is instantiated with a concrete type, the concrete type must be a subtype of `Bound`.
- No implicit widening or coercion occurs during assignment or argument passing. The assignability check requires exact type match (structural equality), not subtype compatibility, for all types other than bound checking.

#### 5.8.1 Invariant Generics

Generic type arguments are **invariant**. Given a class `Container<T>`, `Container<Cat>` is **not** a subtype of `Container<Animal>` even if `Cat` is a subtype of `Animal`. This applies uniformly to all generic types.

### 5.9 Type Compatibility (Assignability)

Two types are compatible (assignable) if and only if they are structurally identical according to these rules:

- `int` is compatible with `int`, `bool` with `bool`, `unit` with `unit`.
- A nominal type `C<T1, ..., Tn>` is compatible with `C<U1, ..., Un>` if and only if they refer to the same class/interface in the same module and each `Ti` is compatible with `Ui`.
- A function type `(A1, ..., An) -> R1` is compatible with `(B1, ..., Bn) -> R2` if and only if they have the same number of parameters, each `Ai` is compatible with `Bi`, and `R1` is compatible with `R2`.
- A generic type variable `T` is compatible with generic type variable `U` if and only if they have the same name.

Incompatible types produce a compile-time error with a detailed mismatch trace.

### 5.10 The `Str` Type

`Str` is a built-in nominal type representing strings. It is not a primitive type -- it is a class type defined in the root module with special compiler support. `Str` has the following built-in members:

- `Str.fromInt(i: int): Str` -- converts an integer to its string representation (static function)
- `.toInt(): int` -- parses a string as an integer (instance method)

The `::` operator concatenates two `Str` values:

```samlang
let greeting = "Hello" :: " " :: "world";
```

String literals produce values of type `Str`. See Section 2 for string literal syntax.

### 5.11 The `Process` Type

`Process` is a built-in class type providing interaction with the runtime environment:

- `Process.println(s: Str): unit` -- prints a string to standard output followed by a newline
- `Process.panic<T>(s: Str): T` -- terminates the program with an error message; the return type is polymorphic, allowing `panic` to be used in any expression context

`Process` has no constructors and cannot be instantiated. It is an uninhabited type (empty enum) that serves purely as a namespace for its static functions.

### 5.12 Type Errors

The type checker reports errors in the following situations:

- Type mismatch: an expression's type does not match the expected type (with a detailed trace showing where the mismatch occurs within nested types)
- Unresolved class: a referenced class name does not exist in the current scope
- Arity mismatch: wrong number of type arguments or function parameters
- Missing member: a class claims to implement an interface but lacks required methods
- Private access violation: accessing a private member from outside its defining module
- Cyclic type definitions: supertype chains that form a cycle
- Bound violation: a type argument does not satisfy its type parameter's bound
- Illegal function in interface: interfaces may only contain method declarations, not function declarations
- Incompatible member visibility: an interface-required method is declared `private`

---

## 6. Expressions

Expressions are the building blocks of samlang programs. Every expression produces a value and has a statically determined type.

```
Expression ::= Literal
           | LocalId
           | ClassId
           | Tuple
           | FieldAccess
           | MethodAccess
           | UnaryExpression
           | CallExpression
           | BinaryExpression
           | IfElseExpression
           | MatchExpression
           | LambdaExpression
           | BlockExpression
```

### 6.1 Literals

Literal expressions represent constant values.

```
IntLiteral      ::= '-'? ('0' | [1-9][0-9]*)
BoolLiteral     ::= 'true' | 'false'
StringLiteral   ::= '"' (character | escape)* '"'
UnitLiteral     ::= '{' '}'
```

- **Integer literals** produce values of type `int`. The lexer recognizes negative integers as a single token (e.g., `-42` is a single literal token, not a unary minus applied to `42`).
- **Boolean literals** `true` and `false` produce values of type `bool`.
- **String literals** produce values of type `Str`. See Section 2 for escape sequences.
- **The unit literal** `{ }` produces the single value of type `unit`.

### 6.2 Variable References

A variable reference produces a value bound to that variable in the nearest enclosing `let` binding or parameter.

```
Variable ::= lowerId
```

Referencing an undefined variable produces a compile-time error.

### 6.3 The `this` Reference

The keyword `this` is a special expression that is only valid within a method body. It refers to the instance on which the method was invoked.

```
This ::= 'this'
```

Using `this` outside of a method (i.e., in a static function or top-level expression context) produces a compile-time error.

### 6.4 Class References

A class name used as an expression produces a value representing the class itself. Class references are used for static function calls.

```
ClassReference ::= UpperId
```

Example: `MathUtils.max(1, 2)` calls the static function `max` on the class `MathUtils`.

### 6.5 Tuple Construction

A tuple is an ordered collection of values. Tuple construction uses parenthesized, comma-separated expressions.

```
Tuple ::= '(' Expression (',' Expression)+ ')'
```

The minimum tuple size is 2; a parenthesized single expression is not a tuple (it's just a parenthesized expression). The maximum tuple size is 16.

```samlang
let pair = (1, 2);         // type: Pair<int, int>
let triple = (1, "x", true); // type: Triple<int, Str, bool>
```

See Section 5.5 for the mapping of tuple sizes to underlying struct types.

### 6.6 Field Access

Field access retrieves a field from a value of a nominal type (class) or tuple type.

```
FieldAccess ::= Expression '.' lowerId
```

For struct classes, fields are accessed by their declared names. For tuples, fields are named `e0`, `e1`, `e2`, ..., `e15` based on their position.

```samlang
let point = Point.init(10, 20);
let x = point.x;      // field access on struct

let pair = (1, 2);
let first = pair.e0;  // field access on tuple
```

Accessing a non-existent field produces a compile-time error.

### 6.7 Function and Method Calls

Function calls invoke a callable value with arguments. There are several forms of calls.

#### 6.7.1 Static Function Calls

A static function is called on a class reference.

```
StaticCall ::= UpperId '.' lowerId '(' [ArgumentList] ')'
```

```samlang
let p = Point.init(3, 4);
```

#### 6.7.2 Method Calls

An instance method is called on an object expression using dot notation.

```
MethodCall ::= Expression '.' lowerId '(' [ArgumentList] ')'
```

```samlang
let p = Point.init(3, 4);
let d = p.distanceSquared();
```

Method calls may include explicit type arguments:

```samlang
instance.method<T1, T2>(args)
```

#### 6.7.3 Direct Function Calls

A callable expression (variable, function reference, or lambda) is invoked directly.

```
DirectCall ::= Expression '(' [ArgumentList] ')'
```

```samlang
let add = (x: int, y: int) -> x + y;
add(1, 2);                  // 3
```

#### 6.7.4 Type Arguments

Generic function calls may include explicit type arguments:

```samlang
Option.None<int>()
Result.Ok<int, Str>(42)
List.Cons(1, List.Nil<int>())
```

Type arguments can often be inferred from context:

```samlang
let some = Option.Some(42);     // T inferred as int
```

#### 6.7.5 Call Semantics and Evaluation Order

Arguments are evaluated left-to-right before the callee is invoked. The callee is evaluated only after all arguments.

```samlang
f(a(), b(), c())               // a() evaluated first, then b(), then c()
```

### 6.8 Unary Operators

Unary operators have higher precedence than binary operators and bind to the immediately following expression:

| Operator | Meaning             | Example |
| -------- | ------------------- | ------- |
| `!`      | Logical negation    | `!flag` |
| `-`      | Arithmetic negation | `-42`   |

The operand must have the expected type; otherwise, a type error is reported.

### 6.9 Binary Operators

Binary operators combine two operand expressions. They are left-associative with standard precedence rules.

```
BinaryExpression ::= Expression BinaryOperator Expression
BinaryOperator  ::= '*' | '/' | '%' | '+' | '-' | '::' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||'
```

#### Arithmetic Operators

| Operator | Operand types | Result type | Description      |
| -------- | ------------- | ----------- | ---------------- |
| `*`      | `int`, `int`  | `int`       | Multiplication   |
| `/`      | `int`, `int`  | `int`       | Integer division |
| `%`      | `int`, `int`  | `int`       | Remainder (mod)  |
| `+`      | `int`, `int`  | `int`       | Addition         |
| `-`      | `int`, `int`  | `int`       | Subtraction      |

```samlang
1 * 2 + 3 / 4 % 5 - 6    // parsed as (((1 * 2) + ((3 / 4) % 5)) - 6)
```

Division by zero results in runtime behavior defined by the target platform (typically a panic or trap).

#### Comparison Operators

| Operator | Operand types | Result type | Description           |
| -------- | ------------- | ----------- | --------------------- |
| `<`      | `int`, `int`  | `bool`      | Less than             |
| `<=`     | `int`, `int`  | `bool`      | Less than or equal    |
| `>`      | `int`, `int`  | `bool`      | Greater than          |
| `>=`     | `int`, `int`  | `bool`      | Greater than or equal |
| `==`     | `T`, `T`      | `bool`      | Equality              |
| `!=`     | `T`, `T`      | `bool`      | Inequality            |

Equality operators are structural: two values are equal if they have the same structure and all components are recursively equal. Nominal type values are equal if they are the same variant (for enums) with equal associated data.

```samlang
Option.Some(42) == Option.Some(42)    // true
Option.Some(42) == Option.None()        // false
```

#### Logical Operators

| Operator | Operand types  | Result type | Description    |
| -------- | -------------- | ----------- | -------------- | ------ | ---------- |
| `&&`     | `bool`, `bool` | `bool`      | Logical AND    |
| `        |                | `           | `bool`, `bool` | `bool` | Logical OR |

Logical operators short-circuit: the right operand is evaluated only if necessary.

```samlang
true && false        // false (both evaluated)
false && panic()     // false (panic() NOT evaluated)
true || panic()      // true (panic() NOT evaluated)
```

#### String Concatenation

| Operator | Operand types | Result type | Description          |
| -------- | ------------- | ----------- | -------------------- |
| `::`     | `Str`, `Str`  | `Str`       | String concatenation |

```samlang
"Hello" :: " " :: "world"    // "Hello world"
```

### 6.10 If-Else Expressions

If-else expressions conditionally evaluate one of two branches based on a boolean condition.

```
IfElseExpression ::=
  'if' Condition Expression 'else' Expression
```

Condition ::= Expression | PatternGuard
PatternGuard ::= 'let' Pattern '=' Expression

````

#### 6.10.1 Simple If-Else

The condition must evaluate to `bool`. Both branches must have compatible types.

```samlang
if x > 0 {
  x
} else {
  -x
}
````

Single-line form:

```samlang
if a > b { a } else { b }
```

#### 6.10.2 If-Let (Guard Pattern)

An if-let expression uses a pattern to destructure and test a value. If the pattern matches, the first branch executes with the pattern bindings in scope. If it doesn't match, the else branch executes.

```samlang
if let Some(x) = option {
  x + 1
} else {
  -1
}
```

The pattern is checked for exhaustiveness; a pattern that always matches (e.g., a variable binding) produces a warning.

#### 6.10.3 Chained If-Else

If-else expressions can be chained by nesting `else if`:

```samlang
if x < 0 {
  "negative"
} else if x == 0 {
  "zero"
} else {
  "positive"
}
```

### 6.11 Match Expressions

Match expressions provide exhaustive pattern matching on a value.

```
MatchExpression ::=
  'match' Expression '{' [VariantPatternToExpression (',' VariantPatternToExpression)* [',']] '}'
```

```
samlang
match option {
  None -> -1,
  Some(x) -> x
}
```

Match expressions must be **exhaustive**: all possible values of the matched type must be covered by some pattern. The compiler reports an error if a non-exhaustive match is detected, showing a counterexample.

### 6.12 Lambda Expressions

Lambda expressions create anonymous function values.

```
LambdaExpression ::=
  '(' [ParameterList] ')' '->' Expression
```

```
ParameterList ::= OptionallyAnnotatedId (',' OptionallyAnnotatedId)*
OptionallyAnnotatedId ::= lowerId [':' Type]
```

Examples:

```samlang
(x) -> x + 1                    // lambda taking one parameter
(x, y) -> x + y                // lambda taking two parameters
(x: int, y: int) -> x + y       // lambda with explicit parameter types
() -> 42                         // lambda taking no parameters
```

Lambda parameters may omit type annotations when the surrounding context provides a type hint. If no hint is available, parameter types must be explicitly annotated.

```samlang
// Type hint from context
let f: (int) -> int = (x) -> x + 1;   // x : int inferred from hint

// No type hint available -- explicit annotation required
let add = (x: int, y: int) -> x + y;
```

Lambdas capture variables from their enclosing scope. Captured variables are read-only within the lambda body.

```samlang
function makeAdder(n: int): (int) -> int = (x) -> x + n
```

### 6.13 Block Expressions

Blocks are sequences of declarations followed by an optional final expression. The block's value is the value of the final expression, or `unit` if there is no final expression.

```
BlockExpression ::=
  '{' [DeclarationStatement (';' DeclarationStatement)* [';' [Expression]]] '}'
```

```
samlang
{
  let x = 42;
  let y = x + 1;
  y * 2        // result of block
}
```

Blocks introduce a new scope for local variables. Variables declared in a block are only accessible within that block.

```samlang
{
  let x = 42;
  let y = 2;
  { }            // block evaluates to unit
}
```

```samlang
{
  let x = 1;
  {
    let y = x + 1;    // x is accessible
  }
}
// y is not accessible here
```

#### 6.13.1 SSA and Variable Rebinding

samlang uses Static Single Assignment (SSA) semantics. Each `let` binding creates a new variable binding, even if the same identifier is reused. References are resolved to their defining binding site.

```samlang
let x = 1;
let x = x + 1;    // This creates a new binding for x
                    // The right-hand x refers to the first binding
                    // The left-hand x is a new binding
```

This ensures that each variable is assigned exactly once (within its binding scope), enabling optimizations and simplifying reasoning about code.

### 6.14 Expression Precedence

For reference, the complete precedence table (highest to lowest):

| Level | Expression forms                                      |
| ----- | ----------------------------------------------------- |
| 12    | Lambda `->`                                           |
| 11    | Match `match`                                         |
| 10    | If-else `if ... else`                                 |
| 4-9   | Binary operators (see Section 6.9)                    |
| 2     | Unary operators `!`, `-`                              |
| 1     | Field/method access `.`, call `()`, block `{}`        |
| 0     | Literals, variables, class references, tuples `(...)` |

Parentheses can be used to override default precedence:

```samlang
x * y + z        // parsed as (x * y) + z
x * (y + z)      // x * (y + z)

x.f(y)            // method call
(x.f(y)) + z       // (x.f(y)) + z

(x.f)(y)          // call result of x.f with y
```

### 6.15 Evaluation Order

Expression evaluation follows these rules:

1. Literals, variables, and class references evaluate immediately.
2. Function calls: arguments are evaluated left-to-right, then the callee is evaluated and invoked.
3. Binary operators: left operand evaluated first, then right operand, then operator applied.
4. Logical `&&` and `||` short-circuit (right operand may not be evaluated).
5. Block expressions: statements are executed in order; final expression is evaluated last.
6. If-else and match: condition/matched expression evaluated first, then only the selected branch is evaluated.

---

## 7. Statements

samlang has exactly one statement form: the `let` binding statement.

### 7.1 Let Bindings

A `let` binding introduces a new variable in the current scope.

```
LetStatement ::= 'let' Pattern [':' Type] '=' Expression ';'
```

The pattern on the left-hand side may be a variable name, a tuple pattern, a struct pattern, a variant pattern, or a wildcard (`_`). The expression on the right-hand side is evaluated, and if the pattern matches, its bindings are introduced into the scope.

The optional type annotation allows specifying the expected type of the binding. If present, the right-hand side must produce a value compatible with that type.

```samlang
// Simple variable binding
let x = 42;

// Tuple pattern
let (a, b) = pair;

// Struct pattern
let { name, github } = developer;

// Variant pattern
let Some(value) = option;

// Wildcard pattern (discards value)
let _ = computeResult();
```

```samlang
let count: int = 10;
```

All bindings are immutable. Once bound, a variable cannot be reassigned.

---

## 8. Patterns

Patterns are used in `let` bindings, `if let` expressions, and `match` expressions to destructure values. Patterns are matched against values from left to right in the order they appear.

### 8.1 Wildcard Pattern

The wildcard pattern `_` matches any value and binds no variables.

```
WildcardPattern ::= '_'
```

```samlang
match value {
  _ -> "anything",
}
```

### 8.2 Variable Pattern

A variable pattern matches any value and binds that value to a variable.

```
VariablePattern ::= lowerId
```

```samlang
let x = value;
```

### 8.3 Literal Patterns

Literal patterns match against specific constant values.

```
LiteralPattern ::= IntLiteral | BoolLiteral
```

```samlang
match x {
  0 -> "zero",
  1 -> "one",
  _ -> "other",
}
```

String literals cannot be used as patterns.

### 8.4 Tuple Patterns

Tuple patterns match tuple values by position.

```
TuplePattern ::= '(' Pattern (',' Pattern)+ ')'
```

```samlang
let (x, y) = pair;

match triple {
  (0, 0, 0) -> "origin",
  (x, y, 0) -> "on XY plane",
  _ -> "elsewhere",
}
```

### 8.5 Struct Patterns

Struct patterns match values of struct class types by field name.

```
StructPattern ::= '{' FieldPattern (',' FieldPattern)* '}'
FieldPattern ::= lowerId | lowerId 'as' lowerId
```

A field pattern can be just a field name (which binds the field value to a variable of the same name) or `field as binding` (which binds the field value to a different variable).

```samlang
let { name, github } = developer;
let point = Point.init(10, 20);
let { x as pX, y as pY } = point;
```

Fields are matched by name, not position. Omitted fields are not matched (they remain inaccessible in the pattern scope).

### 8.6 Variant Patterns

Variant patterns match enum values by variant name and optionally destructure the associated data.

```
VariantPattern ::= UpperId ['(' Pattern (',' Pattern)* ')']
```

```samlang
match option {
  Option.None() -> "nothing",
  Option.Some(value) -> "found: " :: Str.fromInt(value),
}
```

### 8.7 Nested Patterns

Patterns can be nested within each other.

```samlang
match result {
  Ok(Some(x)) -> x,
  Ok(None) -> 0,
  Error(_) -> -1,
}
```

### 8.8 Pattern Matching Semantics

Pattern matching is evaluated as follows:

1. For a variable pattern, match succeeds and the variable is bound to the value.
2. For a literal pattern, match succeeds if the value equals the literal.
3. For a tuple pattern, match succeeds if the value is a tuple of the same size and each subpattern matches the corresponding element.
4. For a struct pattern, match succeeds if the value is an instance of the specified struct class and each field pattern matches the corresponding field.
5. For a variant pattern, match succeeds if the value is an instance of the enum class, is of the specified variant, and each subpattern matches the corresponding data field.
6. For a wildcard pattern, match always succeeds with no bindings.

Pattern matching in `match` expressions is checked for exhaustiveness. The compiler ensures that for every possible value of the matched expression, at least one pattern will match.

### 8.9 Or-Patterns

samlang does not support or-patterns (e.g., `A(x) | B(x)`). Multiple variant patterns must be written as separate match arms.

### 8.10 As-Patterns

The `as` keyword is used to rename bindings in struct patterns, but there is no general as-pattern for aliasing an entire matched value.

---

## 9. Operator Precedence Table

The following table lists all operators and constructs in order from tightest binding (evaluated first) to loosest binding (evaluated last). Operators at the same precedence level are left-associative unless otherwise noted.

| Level | Construct                                                  | Description              | Associativity |
| ----- | ---------------------------------------------------------- | ------------------------ | ------------- | ---------- | ---- |
| 0     | Literals, identifiers, `this`, tuple construction          | Atoms                    | N/A           |
| 1     | `.` field access, `expr(...)` function call, `{...}` block | Postfix                  | Left          |
| 2     | `-expr`, `!expr`                                           | Unary operators (prefix) | N/A           |
| 3     | N/A                                                        | (reserved)               | N/A           |
| 4     | `*`, `/`, `%`                                              | Multiplicative           | Left          |
| 5     | `+`, `-`, `::`                                             | Additive, string concat  | Left          |
| 6     | `<`, `<=`, `>`, `>=`, `==`, `!=`                           | Comparison               | Left          |
| 7     | `&&`                                                       | Logical AND              | Left          |
| 8     | `                                                          |                          | `             | Logical OR | Left |
| 9     | N/A                                                        | (reserved)               | N/A           |
| 10    | `if`...`else`, `if let`...`else`                           | Conditional              | N/A           |
| 11    | `match`                                                    | Pattern matching         | N/A           |
| 12    | `(params) -> expr`                                         | Lambda                   | N/A           |

**Notes:**

- Parentheses can be used to override precedence: `(a + b) * c`
- The `->` arrow appears in function types and lambda expressions, not as an infix operator
- The `:` (colon) and `=` (equals) appear in type annotations and bindings, not as expression operators
- Match arms (`->`) are separated by commas and parsed as part of the `match` construct

---

## 10. Built-in Types and Functions

samlang provides several built-in types and functions that are available without explicit import.

### 10.1 The `Str` Type

The `Str` type represents immutable string values.

**Static Methods:**

- `Str.fromInt(i: int): Str` — Convert an integer to its string representation.

**Instance Methods:**

- `.toInt(): int` — Parse a string as an integer. Behavior on invalid input is implementation-defined.

**String Concatenation:**

Strings can be concatenated using the `::` operator:

```samlang
let greeting = "Hello" :: " " :: "World"  // Results in "Hello World"
```

### 10.2 Process Functions

The `Process` module provides runtime interactions.

**Functions:**

- `Process.println(s: Str): unit` — Print a string followed by a newline to standard output.
- `Process.panic<T>(s: Str): T` — Terminate the program with an error message. This function never returns; the generic type parameter `T` allows it to be used in any expression context.

### 10.3 Auto-generated Constructors

For user-defined classes, the compiler automatically generates constructors:

**Struct Classes:**

For a class with only fields (no variants), a constructor `ClassName.init(...)` is automatically generated:

```samlang
class Person(val name: Str, val age: int) {

let p = Person.init("Alice", 30)
```

**Enum Classes:**

For a class with variants, constructors are generated for each variant:

```samlang
class Color(Red, Green, Blue, Custom(Str)) {

let red = Color.Red()
let custom = Color.Custom("#ff0000")
```

---

## 11. Standard Library

The standard library is located in the `std/` directory and provides commonly used data structures and utilities. All modules must be explicitly imported using `import { ... } from std.moduleName`.

### 11.1 std.interfaces

Provides interface definitions for type-based operations.

**Comparable Interface:**

```samlang
interface Comparable<T> {
  method compare(other: T): int
}
```

The `compare` method returns:

- A negative integer if `this < other`
- Zero if `this == other`
- A positive integer if `this > other`

**TryUnwrap Interface:**

```samlang
interface TryUnwrap<T> {
  method tryUnwrap(): Option<T>
}
```

### 11.2 std.boxed

Boxed wrappers for primitive types that implement `Comparable`.

**Int Class:**

```samlang
class Int(val value: int) : Comparable<Int>
```

- `method compare(other: Int): int` — Compare two boxed integers by their values.
- `method toString(): Str` — Convert to string representation.

**Bool Class:**

```samlang
class Bool(val value: bool) : Comparable<Bool>
```

- `method intValue(): int` — Convert `true` to `1`, `false` to `0`.
- `method compare(other: Bool): int` — Compare two boxed booleans by their integer values.
- `method toString(): Str` — Convert to `"true"` or `"false"`.

### 11.3 std.option

Represents optional values, similar to `Option` in Rust or `Maybe` in Haskell.

```samlang
class Option<T>(None, Some(T))
```

**Static Methods:**

- `both<A, B>(optionA: Option<A>, optionB: Option<B>): Option<Pair<A, B>>` — Combine two options; succeeds only if both are `Some`.
- `none<T>(): Option<T>` — Create an `Option` representing "none" with the specified type parameter.

**Instance Methods:**

- `isSome(): bool` — Returns `true` if this is `Some`, `false` if `None`.
- `isNone(): bool` — Returns `true` if this is `None`, `false` if `Some`.
- `map<R>(f: (T) -> R): Option<R>` — Apply a function to the contained value if present.
- `filter(f: (T) -> bool): Option<T>` — Keep the value only if the predicate returns `true`.
- `valueMap<R>(default: R, f: (T) -> R): R` — Apply a function if present, otherwise return the default.
- `iter(f: (T) -> unit): unit` — Call a function on the contained value if present; otherwise do nothing.
- `bind<R>(f: (T) -> Option<R>): Option<R>` — Chain operations that may fail; also known as `flatMap`.
- `expect(msg: Str): T` — Extract the contained value, or panic with a message if `None`.
- `unwrap(): T` — Extract the contained value, or panic if `None`.

- `tryUnwrap(): Option<T>` — Returns `this`.

### 11.4 std.result

Represents results that may fail, with separate success and error types.

```samlang
class Result<T, E>(Ok(T), Error(E))
```

**Static Methods:**

- `fromOption<T, E>(option: Option<T>, error: E): Result<T, E>` — Convert an `Option` to a `Result`, using the provided error value for `None`.

**Instance Methods:**

- `ignore(): Result<unit, E>` — Discard the success value, keeping the error type.
- `isOk(): bool` — Returns `true` if this is `Ok`, `false` if `Error`.
- `isError(): bool` — Returns `true` if this is `Error`, `false` if `Ok`.
- `ok(): Option<T>` — Convert to an `Option`, discarding the error value.
- `iter(f: (T) -> unit): unit` — Call a function on the contained value if `Ok`; otherwise do nothing.
- `iterError(f: (E) -> unit): unit` — Call a function on the contained error if `Error`; otherwise do nothing.
- `map<R>(f: (T) -> R): Result<R, E>` — Apply a function to the success value if present.
- `mapError<R>(f: (E) -> R): Result<T, R>` — Apply a function to the error value if present.
- `expect(msg: Str): T` — Extract the contained value, or panic with a message if `Error`.
- `unwrap(msg: Str): T` — Extract the contained value, or panic with a message if `Error`.
- `tryUnwrap(): Option<T>` — Returns the `ok()` value.

### 11.5 std.list

Immutable singly-linked list providing functional operations.

```samlang
class List<T>(Nil, Cons(T, List<T>))
```

**Static Methods:**

- `nil<T>(): List<T>` — Create an empty list.
- `of<T>(t: T): List<T>` — Create a single-element list.
- `flatten<T>(l: List<List<T>>): List<T>` — Flatten a list of lists into a single list.

**Instance Methods:**

- `cons(t: T): List<T>` — Prepend an element to the list.
- `length(): int` — Return the number of elements.
- `isEmpty(): bool` — Return `true` if empty, `false` otherwise.
- `first(): Option<T>` — Return the first element, or `None` if empty.
- `rest(): Option<List<T>>` — Return the tail of the list, or `None` if empty.
- `filter(f: (T) -> bool): List<T>` — Keep only the elements satisfying the predicate.
- `map<R>(f: (T) -> R): List<R>` — Apply a function to each element.
- `filterMap<R>(f: (T) -> Option<R>): List<R>` — Apply a function that may return `None`, filtering out those cases.
- `iter(f: (T) -> unit): unit` — Call a function on each element.
- `contains(element: T, equal: (T, T) -> bool): bool` — Check if an element is in the list using the provided equality function.
- `forAll(f: (T) -> bool): bool` — Return `true` if all elements satisfy the predicate.
- `exists(f: (T) -> bool): bool` — Return `true` if any element satisfies the predicate.
- `find(f: (T) -> bool): Option<T>` — Return the first element satisfying the predicate.
- `findMap<R>(f: (T) -> Option<R>): Option<R>` — Find and transform the first element where the function returns `Some`.
- `append(other: List<T>): List<T>` — Concatenate another list to the end.
- `reverseAndAppend(other: List<T>): List<T>` — Reverse this list and append another list.
- `fold<A>(f: (A, T) -> A, init: A): A` — Left-fold: combine elements using a binary function.
- `foldRight<A>(f: (T, A) -> A, init: A): A` — Right-fold: combine elements from right to left.
- `bind<R>(f: (T) -> Option<R>): Option<R>` — Chain operations returning lists; also known as `flatMap`.
- `reverse(): List<T>` — Return a reversed copy of the list.

### 11.6 std.map

Immutable balanced binary search tree map with ordered keys.

```samlang
class Map<K: Comparable<K>, V>(Empty, Leaf(K, V), Node(int, K, V, Map<K, V>, Map<K, V>))
```

**Static Methods:**

- `empty<K: Comparable<K>, V>(): Map<K, V>` — Create an empty map.
- `singleton<K: Comparable<K>, V>(key: K, value: V): Map<K, V>` — Create a single-entry map.
- `fromList<V: Comparable<V>>(list: List<Pair<K, V>>): Map<K, V>` — Create a map from a list of key-value pairs.

**Instance Methods:**

- `isEmpty(): bool` — Return `true` if empty.
- `get(key: K): Option<V>` — Look up a value by key.
- `containsKey(key: K): bool` — Check if a key exists.
- `insert(key: K, value: V): Map<K, V>` — Insert or update a key-value pair.
- `split(key: K): Triple<Map<K, V>, Option<V>, Map<K, V>>` — Split the map into three parts: elements before key, value at key, and elements after.
- `merge<V2, V3>(other: Map<K, V2>, f: (K, Option<V>, Option<V2>) -> Option<V3>): Map<K, V3>` — Merge two maps using a combining function.
- `update(key: K, f: (Option<V>) -> Option<V>): Map<K, V>` — Update a value using a function that receives the current value as an option.
- `customizedUnion(other: Map<K, V>, f: (K, V, V) -> Option<V>): Map<K, V>` — Union with a custom conflict resolution function.
- `union(other: Map<K, V>): Map<K, V>` — Union of two maps (prefers values from `this` on conflict).
- `remove(key: K): Map<K, V>` — Remove a key if present.
- `compare(other: Map<K, V>, f: (V, V) -> int): int` — Compare maps using a value comparison function.
- `equal(other: Map<K, V>, f: (V, V) -> bool): bool` — Check equality using a value comparison function.
- `iter(f: (K, V) -> unit): unit` — Iterate over key-value pairs in order.
- `fold<A>(acc: A, f: (K, V) -> A): A` — Fold over key-value pairs in order.
- `forAll(f: (K, V) -> bool): bool` — Return `true` if all key-value pairs satisfy the predicate.
- `exists(f: (K, V) -> bool): bool` — Return `true` if any key-value pair satisfies the predicate.
- `filter(f: (K, V) -> bool): Map<K, V>` — Keep only the key-value pairs satisfying the predicate.
- `partition(f: (K, V) -> bool): Pair<Map<K, V>, Map<K, V>>` — Split into two maps based on a predicate.
- `size(): int` — Return the number of entries.
- `entries(): List<Pair<K, V>>` — Return key-value pairs as a list.
- `min(): Option<Pair<K, V>>` — Return the minimum key-value pair.
- `max(): Option<Pair<K, V>>` — Return the maximum key-value pair.
- `minKey(): Option<K>` — Return the minimum key.
- `maxKey(): Option<K>` — Return the maximum key.
- `keys(): List<K>` — Return all keys in order.
- `map<V2>(f: (K, V) -> V2): Map<K, V2>` — Transform values using a function.

### 11.7 std.set

Immutable balanced binary search tree set with ordered elements.

```samlang
class Set<V: Comparable<V>>(Empty, Leaf(V), Node(int, V, Set<V>, Set<V>))
```

**Static Methods:**

- `empty<V: Comparable<V>>(): Set<V>` — Create an empty set.
- `singleton<V: Comparable<V>>(value: V): Set<V>` — Create a single-element set.
- `fromList<V: Comparable<V>>(list: List<V>): Set<V>` — Create a set from a list.

**Instance Methods:**

- `isEmpty(): bool` — Return `true` if empty.
- `contains(value: V): bool` — Check if an element exists.
- `insert(value: V): Set<V>` — Insert an element.
- `split(value: V): Triple<Set<V>, bool, Set<V>>` — Split into three parts: elements before value, whether value exists, and elements after.
- `union(other: Set<V>): Set<V>` — Union of two sets.
- `intersection(other: Set<V>): Set<V>` — Intersection of two sets.
- `disjoint(other: Set<V>): bool` — Return `true` if sets have no common elements.
- `diff(other: Set<V>): Set<V>` — Elements in `this` but not in `other`.
- `subset(other: Set<V>): bool` — Return `true` if `this` is a subset of `other`.
- `remove(value: V): Set<V>` — Remove an element if present.
- `compare(other: Set<V>, f: (V, V) -> int): int` — Compare sets using an element comparison function.
- `equal(other: Set<V>, f: (V, V) -> bool`: bool` — Check equality using an element comparison function.
- `iter(f: (V) -> unit`: unit — Iterate over elements in order.
- `fold<A>(acc: A, f: (V) -> A): A` — Fold over elements in order.
- `forAll(f: (V) -> bool): bool` — Return `true` if all elements satisfy the predicate.
- `exists(f: (V) -> bool`: bool — — Return `true` if any element satisfies the predicate.
- `filter(f: (V) -> bool`: Set<V>` — Keep only the elements satisfying the predicate.
- `partition(f: (V) -> bool`: Pair<Set<V>, Set<V>>` — Split into two sets based on a predicate.
- `size(): int` — Return the number of elements.
- `min(): Option<V>` — Return the minimum element.
- `max(): Option<V>` — Return the maximum element.
- `elements(): List<V>` — Return all elements in order.
- `map(f: (V) -> V): Set<V>` — Transform elements using a function.

### 11.8 std.tuples

Tuple types for grouping values together.

**GeneralTuple Interface:**

```samlang
interface GeneralTuple<E0, E1> {
  method first(): E0
  method second(): E1
}
```

**Tuple Classes:**

All tuple classes from `Pair` through `Tuple16` implement `GeneralTuple<E0, E1>`:

- `Pair<E0, E1>(val e0: E0, val e1: E1)` — 2-element tuple. Also creatable using `(e0, e1)` syntax.
- `Triple<E0, E1, E2>(val e0: E0, val e1: E1, val e2: E2)` — 3-element tuple.
- `Tuple4<E0, E1, E2, E3>(val e0: E0, val e1: E1, val e2: E2, val e3: E3)` — 4-element tuple.
- `Tuple5<E0, E1, E2, E3, E4>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4)` — 5-element tuple.
- `Tuple6<E0, E1, E2, E3, E4, E5>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5)` — 6-element tuple.
- `Tuple7<E0, E1, E2, E3, E4, E5, E6>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6)` — 7-element tuple.
- `Tuple8<E0, E1, E2, E3, E4, E5, E6, E7>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6, val e7: E7)` — 8-element tuple.
- `Tuple9<E0, E1, E2, E3, E4, E5, E6, E7, E8>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6, val e7: E7, val e8: E8)` — 9-element tuple.
- `Tuple10<E0, E1, E2, E3, E4, E5, E6, E7, E8, E9>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6, val e7: E7, val e8: E8, val e9: E9)` — 10-element tuple.
- `Tuple11<E0, E1, E2, E3, E4, E5, E6, E7, E8, E9, E10>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6, val e7: E7, val e8: E7, val e9: E8, val e10: E10)` — 11-element tuple.
- `Tuple12<E0, E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6, val e7: E7, val e8: E7, val e8: E8, val e9: E8, val e10: E8, val e11: E11)` — 12-element tuple.
- `Tuple13<E0, E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6, val e7: E7, val e8: E7, val e8: E7, val e9: E7, val e9: E7, val e10: E7, val e11: E7, val e12: E12)` — 13-element tuple.
- `Tuple14<E0, E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6, val e7: E7, val e8: E7, val e9: E7, val e10: E7, val e11: E7, val e12: E7, val e13: E13)` — 14-element tuple.
- `Tuple15<E0, E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6, val e7: E7, val e8: E7, val e9: E7, val e10: E7, val e11: E7, val e12: E7, val e13: E7, val e14: E14)` — 15-element tuple.
- `Tuple16<E0, E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15>(val e0: E0, val e1: E1, val e2: E2, val e3: E3, val e4: E4, val e5: E5, val e6: E6, val e7: E7, val e8: E7, val e9: E7, val e10: E7, val e11: E7, val e12: E7, val e13: E7, val e14: E14, val e15: E15)` — 16-element tuple.

All tuple classes provide:

- `method first(): E0` — Access the first element.
- `method second(): E1` — Access the second element.
- Direct field access for each element (e.g., `e0`, `e1`, `e2`, etc.).

---

## 12. Compilation Pipeline

The samlang compiler transforms source code through a series of intermediate representations (IRs) before producing final output. The compilation pipeline supports two backends: WebAssembly and TypeScript.

### 12.1 Overview

```
Source (.sam) → HIR → MIR → LIR → WASM
                                   → TypeScript
```

#### IR Stages

1. **Source**: Parse samlang source files into a typed AST
2. **HIR (High-Level IR)**: Direct lowering from typed AST, preserves generics
3. **MIR (Mid-Level IR)**: Generics specialized, enum representations optimized
4. **LIR (Low-Level IR)**: Types abstracted, GC-specific instructions
5. **WASM/TS**: Final code generation

### 12.2 Source to HIR

The High-Level IR is a direct lowering from the typed AST. Generics are preserved in their polymorphic form; specialization happens later in the pipeline.

#### HIR AST Design

The HIR AST in `samlang-ast/src/hir.rs` represents the structure of a samlang program at a high level. The key HIR node types are:

- **Modules**: Each source file becomes a `Module` node containing top-level declarations
- **Classes**: With fields (`val`), methods, static functions, type parameters, and super-types
- **Interfaces**: Method signatures with type parameters and super-types
- **Functions**: Bodies with local variables, SSA-style bindings, and a return expression
- **Methods**: Bodies with a `self_` parameter as the receiver and SSA-style bindings

#### Source → HIR Transformations

Key transformations performed when lowering from Source AST to HIR:

1. **Method → Static Function**: Instance methods are converted to static functions with an explicit `_this` parameter as the first parameter. The receiver is passed as the first argument.

   ```samlang
   // Source
   class Point(val x: int, val y: int) {
     method distanceSquared(): int = ...
   }

   // HIR
   class Point(val x: int, val y: int) {
     function distanceSquared(this: Point, x: int): int = ...
   }
   ```

2. **Struct Constructors**: Lowered to `StructInit` statements that allocate and initialize struct fields. For a struct with `val` fields `f1, f2, ..., fn`, the constructor becomes:

   ```samlang
   StructInit(Point, x, y) { ... }
   ```

3. **Enum Constructors**: Lowered to `EnumInit` statements that create enum values with appropriate variant tag and data fields. For an enum with variants `V1(T1), ..., Vn(Tn)`, each variant `Vi(Ti)` becomes:

   ```samlang
   EnumInit(Vi, args...) { ... }
   ```

4. **Pattern Matching**: `match` expressions are lowered to nested `ConditionalDestructure` statements that test variant tags and extract data fields. The condition expression uses tag comparison (e.g., `this.tag == Variant1`).

5. **Lambdas**: Anonymous functions are converted to named synthetic functions and wrapped in `ClosureInit` values. Each lambda `(x) -> body` becomes:

   ```samlang
   ClosureInit(fn, [captured_vars...], context) { ... }
   ```

   The lambda body is extracted as a static function and the captured environment is stored in the closure struct.

6. **Method References**: References to instance methods become closures capturing the receiver. For `this.method(args)`, the transformation creates:

   ```samlang
   ClosureInit(method, [this, captured_vars...], context) { ... }
   ```

7. **Tuple Types**: Synthesized as named struct types (`Pair`, `Triple`, etc.) from the standard library. Tuple construction `(e0, e1, e2)` becomes a `StructInit` for the appropriate tuple class.

8. **String Literals**: Converted to global string constants referenced by name. Each unique string literal is assigned a name like `_Str_42` and referenced globally.

9. **Control Flow**: SSA-style control flow using `IfElse` with `final_assignments` (phi nodes) to merge values from different branches. This enables efficient SSA-based optimizations.

#### SSA in HIR

HIR uses Static Single Assignment (SSA) semantics. Each variable binding creates a new variable binding, even if the same identifier is reused. References are resolved to their defining binding site.

- Every local variable is assigned exactly once within its scope
- Phi nodes merge values from different branches: `let x = if cond { a } else { b }` produces a phi node `x = phi(a, b)`
- This representation enables optimizations like dead code elimination and variable renaming

### 12.3 HIR to MIR

The Mid-Level IR applies several transformations to prepare code for optimization.

#### 12.3.1 Generic Specialization

A demand-driven monomorphization process specializes generic types from entry points:

1. **Demand Collection**: Starting from entry points, the compiler walks the call graph.
2. **Type Instantiation**: When a generic type is encountered with concrete type arguments, a specialized version is created. For example, `List<int>` becomes a concrete type `List__int` in MIR.
3. **Name Mangling**: Specialized type names incorporate the type arguments. For example, `Foo<int>` becomes `Foo__int`.
4. **Caching**: Specialized versions are cached to avoid re-computation across the call graph.
5. **Incremental Specialization**: The process repeats until no new specializations are needed.

This transformation enables downstream optimizations to work on concrete types without carrying generic overhead.

#### 12.3.2 Enum Representation Optimization

Each enum variant is classified into one of three representation strategies to optimize memory and performance:

| Strategy    | When Used                         | Description                                                                       |
| ----------- | --------------------------------- | --------------------------------------------------------------------------------- |
| **Int31**   | 0 data fields                     | Stored directly as a raw `ref.i31` value. No heap allocation required.            |
| **Unboxed** | 1 data field (primitive)          | Uses an identity cast. The value is stored without a wrapper struct.              |
| **Boxed**   | Multiple data fields or 1 complex | Default strategy - uses a heap-allocated struct with a tag field and data fields. |

The compiler analyzes enum patterns and usage across the codebase to select the optimal representation for each variant:

- Variants that are only pattern-matched (data never accessed) → **Int31**
- Variants with a single primitive field that's always accessed directly → **Unboxed**
- Variants with multiple fields or complex structures → **Boxed**

This optimization significantly reduces memory allocation and improves performance for common enum patterns.

#### 12.3.3 Type Deduplication

Structurally identical specialized types are merged to reduce code size. If two specializations produce the same field types, they share a single type definition.

For example:

- If `List<int>` and `List__int` are both created, they merge into a single type
- This reduces code duplication while maintaining type safety

#### 12.3.4 Constant Parameter Elimination

Parameters that are always passed the same constant value are inlined at each call site, reducing parameter passing overhead.

```samlang
// Before: calls to foo(5, 5) allocate space for both arguments
foo(5, 5);  // After inlining: no call overhead
```

### 12.4 MIR Optimization Passes

The MIR optimizer runs four rounds of per-function optimization combined with function inlining and global dead code elimination. Each round consists of the following passes:

#### 12.4.1 Conditional Constant Propagation (CCP)

Folds constant expressions, performs algebraic simplification, and eliminates dead branches:

- **Simple constant folding**: `1 + 2` → `3`
- **Algebraic simplification**: `(x + 1) - 1` → `x`
- **Strength reduction**: `x * 2` → `x + x`
- **Dead branch elimination**: `if true { a } else { b }` → `a`

The pass tracks which variables are constant across the function and propagates this knowledge to eliminate redundant computations.

#### 12.4.2 Loop Optimizations

- **Loop invariant code motion (LICM)**: Moves expressions that are invariant within a loop outside of the loop.
- **Induction variable analysis**: Identifies basic, general, and derived induction variables in loops.
- **Loop algebraic optimization**: Eliminates loops with known trip counts.
- **Induction variable elimination**: Replaces complex induction variables with simpler ones.
- **Strength reduction**: Converts multiplicative recurrences to additive recurrences.

These transformations improve performance by reducing loop overhead and enabling better register allocation.

#### 12.4.3 Common Subexpression Elimination (CSE)

Eliminates redundant computations by identifying structurally identical expressions:

- Uses structural equality on `BoundValue`s
- Normalizes commutative operators (e.g., `a + b` and `b + a` are considered equivalent)
- Hoists common subexpressions from `if-else` branches when safe

This pass operates at the expression level and identifies duplicated computations that can be replaced with a single computed value.

#### 12.4.4 Local Value Numbering (LVN)

Performs scoped deduplication within basic blocks, identifying repeated computations at a finer granularity than CSE:

- More precise tracking within local scopes
- Works together with CSE for comprehensive optimization
- Differentiates temporaries that can be shared from local-only computations

#### 12.4.5 Dead Code Elimination (DCE)

Performs backward liveness analysis to eliminate unused bindings and unreachable code:

- **Unused bindings**: Local variables that are never referenced
- **Unreachable code**: Code that can never be executed
- **Dead functions**: Functions that are never called from entry points

This pass reduces code size and eliminates unnecessary computations.

#### 12.4.6 Cross-Function Passes

Between optimization rounds, the compiler performs:

- **Function inlining**: Cost-based inlining with a threshold of 20 for function eligibility and 1000 for inline sites. Inlined functions are substituted with fresh variable names.
- **Unused name elimination**: Global reachability analysis from entry points removes unreachable functions, types, strings, and closure types.

### 12.5 MIR to LIR

The Low-Level IR introduces type erasure and backend-specific instructions.

#### 12.5.1 Type Erasure

Introduces `AnyPointer` for enums with `Int31` variants to enable uniform handling:

```samlang
// MIR: enum E<A, B> { V1(A), ..., Vn(An) }
// LIR: enum E<A, B> { V1(AnyPointer), ..., Vn(AnyPointer) }
```

This allows all variants to be stored uniformly and handled with simple pointer comparisons rather than variant-specific logic.

#### 12.5.2 Closure Expansion

`ClosureInit` is lowered to `StructInit` creating a two-element struct `[fn_ptr, context]`:

```samlang
// MIR
ClosureInit(fn, captured_vars..., context)

// LIR
StructInit(Closure, fn_ptr, context) {
  fn_ptr = ...;    // Function pointer
  context = ...;  // Captured environment
}
```

Each closure struct contains:

- A function pointer to the lambda's code
- The captured environment as a struct with fields for each captured variable

#### 12.5.3 Indirect Call Expansion

Closure calls are expanded to extract the function pointer and context from the closure struct, followed by a `call_indirect` instruction:

```samlang
// Before expansion
let result = closure(arg)

// After expansion
StructInit fn_ptr = ...;  // closure struct
context = ...;
let fn_result = call_indirect(fn_ptr, context, arg)  // Indirect call
```

This enables the implementation of first-class functions with proper closure semantics.

#### 12.5.4 Subtype Hierarchies for Enums

For enum types, a parent type is created with an extensible tag field to enable uniform dispatch:

```samlang
// MIR: enum E<T> has variants V1, ..., Vn
// LIR creates parent type
enum Parent<T> {
  tag: int,
}
```

Pattern matching uses `ref.test` to check the tag and `ref.cast` to obtain the parent type, then dispatches through the parent's vtable.

#### 12.5.5 Closure Function Signatures

The first parameter of all closure functions is forced to `AnyPointer` to represent the captured context:

```samlang
// All closure functions have this signature
fn closure(ctx: AnyPointer, args...): T
```

This uniform signature enables the same closure type to be used regardless of which enum variant it contains.

### 12.6 LIR to WebAssembly

The WebAssembly backend uses the WasmGC proposal:

#### Memory Management

- **GC-managed structures**: All heap objects are GC-managed structs/arrays
- **No custom allocators**: The garbage collector handles all memory allocation
- **Automatic deallocation**: Memory is reclaimed automatically by the GC when no longer referenced

#### Data Type Representations

- **Strings**: Represented as `(array (mut i8))` GC arrays. String literals are stored in passive data segments for efficient reuse.
- **Closures**: Implemented using `call_indirect` with a function table. Function references are stored as `i32` table indices.
- **Enum variants**: Implemented as GC subtype structs. Pattern matching uses:
  - `ref.test` to check the variant tag
  - `ref.cast` to obtain the typed data fields

#### Integer Variants (Int31)

- Stored using `ref.i31` and accessed via `i31.get_s` instruction
- Most memory-efficient for enums with 0 or 1 data fields
- Enables simple pointer-based comparison

#### Whole-Program Compilation

- **Single `.wasm` module**: All reachable functions are compiled into one WebAssembly module
- **Entry points**: Any `Main` class with a `main()` method is exported
- **Runtime imports**: The Wasm module imports:
  - `Process.println` → `Process$println`
  - `Process.panic` → `Process$panic`
- **String operations**: Helper functions provided for `Str` operations:
  - `Str.fromInt` → `Str$fromInt`
  - `Str.concat` → `Str$concat`

#### Type Mappings

The LIR integer type maps to Wasm types:

| LIR Type     | WASM Type | Description      |
| ------------ | --------- | ---------------- |
| `Int32`      | `i32`     | 32-bit integer   |
| `Int31`      | `i31`     | Enum variant tag |
| `AnyPointer` | `i32`     | Function pointer |

### 12.7 LIR to TypeScript

The TypeScript backend uses the same LIR but emits TypeScript syntax:

#### Structs

Converted to tuple types for compatibility with JavaScript:

```samlang
// LIR: struct Point { x: int, y: int }
// TypeScript
type _Point = [number, _Str] = [0, "Point"];
```

#### Type Mappings

- `Int32`/`Int31` → `number`
- `AnyPointer` → `any`
- `Id(name)` → Type alias for class/interface names

#### Division

Integer division uses `Math.floor(a / b)` for semantics matching WebAssembly's truncating division.

#### Comparisons

Coerced via `Number(a op b)` to produce `0` or `1` for boolean results.

#### Module Structure

Each entry module gets its own `.ts` file with a trailing `_Module_Main$main()` call.

#### Runtime Helpers

The TypeScript prolog provides runtime functions:

- `__Process$println` → Standard output
- `__Process$panic` → Error handling
- `__Str$concat` → String concatenation

---

## 13. Limits and Constraints

### 13.1 Struct Limits

Struct definitions may contain at most 16 fields. This limit applies to the total number of field declarations within a single struct type definition.

### 13.2 Tuple Limits

Tuple types and tuple literals may contain at most 16 elements. This limit applies to both type declarations and value expressions.

### 13.3 Integer Range

Integer values must be within the signed 32-bit range:

- Minimum value: -2147483648
- Maximum value: 2147483647

Integer literals outside this range result in a compilation error. Integer arithmetic operations that overflow are not guaranteed to wrap or trap; behavior is implementation-defined.

### 13.4 String Limits

String literals cannot span multiple lines. Multi-line strings must be constructed through string concatenation or other runtime operations.

### 13.6 Identifier Length

Identifiers may be of arbitrary length, subject to memory constraints of the compilation environment.

### 13.7 Recursion Depth

The language does not enforce a maximum recursion depth. Programs with deep recursion may exhaust runtime stack resources; tail-call optimization is not guaranteed.

### 13.8 Module Nesting

There is no enforced limit on module nesting depth, as modules are identified by dot-separated qualified names.

### 13.9 Type Parameter Limits

Type parameters may be applied to any number of types. There is no explicit limit on the number of type parameters a generic definition may declare.

---

## 14. Intentional Omissions

### 14.1 No Mutable Variables or Assignment

Samlang does not provide mutable variable declarations or assignment operators. All bindings are immutable. State changes are achieved through function calls that return new values rather than in-place modifications.

### 14.2 No Loops

There are no looping constructs (no `while`, `for`, `do`, or `loop` keywords). Iteration is performed through recursion or through higher-order functions provided by the standard library (e.g., `List.map`, `List.fold`).

### 14.3 No Null/Nullable Types

Samlang does not have a null value or nullable type constructors. Optional values are represented using the `Option` type from the standard library, with variants `Option::Some(value)` and `Option::None()`.

### 14.4 No Exceptions

There are no exception types, throw statements, or try-catch blocks. Error handling is performed using the `Result` type from the standard library, with variants `Result::Ok(value)` and `Result::Error(error)`. Runtime panics are triggered through `Process.panic(message)`.

### 14.5 No Class Inheritance

There is no class-based inheritance. Types can implement any number of interfaces, and interfaces can extend other interfaces. Code reuse is achieved through composition and higher-order functions.

### 14.6 No Method or Function Overloading

Functions and methods cannot be overloaded. Each function name within a scope must refer to a single function definition. Polymorphism is achieved through generics and pattern matching.

### 14.7 No Implicit Conversions

Samlang does not perform implicit type conversions between distinct types, including numeric types. All conversions must be explicit through constructor functions or conversion utilities provided by the standard library.

### 14.8 No Global Variables or Top-Level Expressions

All state must be encapsulated within functions. There are no global variable declarations, and top-level expressions are not permitted. Module-level definitions are limited to type declarations and function definitions.

### 14.9 No Array/List Literal Syntax

There is no syntax for array or list literals. Lists are constructed using the `List` module functions, such as `List.empty()`, `List.singleton(value)`, and `List.cons(head, tail)`.

### 14.10 No Switch Statements

Pattern matching serves as the primary branching mechanism. There is no separate switch statement syntax. All multi-way branching is expressed through `match` expressions.

### 14.11 No Bitwise Operators

The language does not provide bitwise operators (`&`, `|`, `^`, `~`, `<<`, `>>`). Bit-level operations are not part of the core language.

### 14.12 No Floating-Point Types

Samlang does not provide floating-point number types. Only signed 32-bit integers are provided as the numeric primitive type.

### 14.13 No Union Types

There is no union type syntax (`string | int`). Discriminated unions are expressed through enums with variants.

### 14.14 No Intersect Types

There is no intersect type syntax. Types cannot be combined through intersection.
