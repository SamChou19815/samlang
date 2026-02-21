# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

samlang is a statically-typed programming language with bidirectional type inference and functional programming features. The repository contains both a Rust-based compiler toolchain and web-based playground.

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
2. **HIR** (High-Level IR) → Direct lowering from source, generics preserved
3. **MIR** (Mid-Level IR) → Generics specialized, enum representations optimized
4. **LIR** (Low-Level IR) → Types abstracted, GC-specific instructions
5. **Output** → WebAssembly or TypeScript

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

**LSP Architecture**: The language server (`samlang-services`) maintains a `ServerState` containing heap, parsed sources, and type-checked modules.

**Optimization Passes**: MIR optimizations include conditional constant propagation (CCP), loop optimizations (induction variable analysis), common subexpression elimination (CSE), local value numbering (LVN), dead code elimination (DCE), and function inlining.

### Testing

- **tests/**: End-to-end samlang test files (.sam)
- Test coverage must be 100% for all crates except samlang-cli and samlang-wasm
- The `cargo e2e` command runs: format check → compile → verify TypeScript output → verify WASM output
- Coverage reports ignore CLI and WASM crates via `--ignore-filename-regex`

## Language Specification

The full language specification is available in [`packages/samlang-website/spec.md`](spec.md). This document describes:

- Complete language syntax and semantics
- Type system rules and type inference
- Built-in types and standard library methods
- Compilation pipeline details (HIR/MIR/LIR design, optimization passes)
- Language constraints and intentional omissions

## For Claude Code (claude.ai/code)

When working with samlang, refer to [`spec.md`](spec.md) for:

- Complete language syntax and semantics
- Type system rules and type inference
- Built-in types and standard library methods
- Compilation pipeline details
- Language constraints and intentional omissions

The website spec file is formatted for documentation rendering with syntax highlighting. It may have different examples than the compiler-focused spec file.

## Important Notes

- The website spec is for documentation rendering and may use different conventions than the source spec
- Language changes should be reflected in both spec.md and the website spec
- When updating language syntax, ensure website examples are consistent
