# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

samlang is a statically-typed programming language with type inference, first-class functions, pattern matching, and WebAssembly code generation. The repository contains both the Rust-based compiler toolchain and web-based playground.

## Common Commands

### Rust Development (Compiler/LSP)

```bash
# Build all crates
cargo build
# Run all tests with nextest
cargo t
# Run tests with coverage (requires 100% coverage)
cargo tc
# Run tests and generate HTML coverage report
cargo th
# Format code
cargo f
# Lint with clippy
cargo lint
# Run end-to-end tests
cargo e2e
# Compile samlang code (requires sconfig.json)
cargo run --package samlang-cli
# Format samlang source files
cargo run --package samlang-cli -- format
# Start language server
cargo run --package samlang-cli -- lsp
```

### Website Development

```bash
# Install dependencies (uses pnpm)
pnpm install

# Run development server with turbo
pnpm webdev

# Build static site
pnpm ssg
```

### WASM Runtime

```bash
# Build WebAssembly runtime library
make
```

## Project Configuration

- **sconfig.json**: Project configuration for samlang compiler
  - `entryPoints`: Array of module paths to compile (e.g., `["tests.AllTests"]`)
  - `ignores`: Directories to exclude from compilation
  - `__dangerously_allow_libdef_shadowing__`: Allow overriding std library (normally false)

## Architecture Overview

### Compilation Pipeline

The compiler follows a multi-stage IR lowering approach:

1. **Source** → Parse samlang source files (.sam)
2. **HIR** (High-level IR) → Direct lowering from source, generics preserved
3. **MIR** (Mid-level IR) → Generics specialized, enum representations optimized, primary optimization target
4. **LIR** (Low-level IR) → Types abstracted away, GC-specific instructions introduced
5. **WASM** → Final WebAssembly code generation

The pipeline can also emit TypeScript code as an alternative backend.

### Crate Structure

The Rust workspace is organized into focused crates:

- **samlang-ast**: All IR definitions (source, hir, mir, lir, wasm)
- **samlang-parser**: Lexing and parsing samlang source to AST
- **samlang-checker**: Type checking, SSA analysis, global signature building
- **samlang-compiler**: IR lowering stages and code generation orchestration
- **samlang-optimization**: MIR optimizations (CSE, constant propagation, loop optimizations, inlining)
- **samlang-printer**: Pretty-printing ASTs back to source
- **samlang-services**: LSP features (diagnostics, hover, completion, rename, etc.)
- **samlang-cli**: Main CLI entry point for format/compile/lsp commands
- **samlang-heap**: String interning and module reference management
- **samlang-errors**: Error collection and reporting
- **samlang-configuration**: Loading and managing sconfig.json
- **samlang-collections**: Shared data structures
- **samlang-profiling**: Performance measurement utilities
- **samlang-wasm**: WebAssembly-specific functionality

### Key Concepts

**Module References**: All module names are interned in the `Heap` as `ModuleReference` values. File paths map to module references (e.g., `tests/AllTests.sam` → `tests.AllTests`).

**Heap Management**: The `samlang_heap::Heap` manages string interning and allocation. Module references, identifiers, and strings are stored here to avoid duplication.

**LSP Architecture**: The language server (`samlang-services`) maintains a `ServerState` containing the heap, parsed sources, and type-checked modules. It supports:

- Diagnostics publishing
- Hover for type queries
- Go-to-definition
- Autocompletion
- Rename refactoring
- Code actions (quick fixes)
- Document formatting
- Folding ranges

**Standard Library**: The `std/` directory contains built-in samlang modules (boxed, list, map, set, option, result, tuples, interfaces) that are automatically included unless shadowing is explicitly enabled.

### Optimization Passes

MIR optimizations include:

- Conditional constant propagation
- Common subexpression elimination
- Local value numbering
- Loop optimizations (induction variable elimination, invariant code motion, strength reduction)
- Function inlining
- Dead code elimination
- Unused name elimination

### Testing

- **tests/**: End-to-end samlang test files (.sam)
- Test coverage must be 100% for all crates except samlang-cli and samlang-wasm
- The `cargo e2e` command runs: format check → compile → verify TypeScript output → verify WASM output
- Coverage reports ignore CLI and WASM crates via `--ignore-filename-regex`
