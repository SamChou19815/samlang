# samlang

## Project Overview

The repository contains both a Rust-based compiler toolchain and web-based playground.

## Common Commands

### Rust Development (Compiler/LSP)

```bash
# Build all crates
cargo build
# Run all tests with nextest
cargo t
# Run tests with coverage (requires 100% coverage)
cargo tc
# Run tests and generate HTML coverage report (has detailed coverage report to debug)
cargo th
# Format code
cargo f
# Lint with clippy
cargo lint
# Run e2e tests
cargo e2e
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

### Testing

- **tests/**: End-to-end samlang test files (.sam)
- Test coverage must be 100% for all crates except samlang-cli and samlang-wasm
- The `cargo e2e` command runs: format check → compile → verify TypeScript output → verify WASM output
- Coverage reports ignore CLI and WASM crates via `--ignore-filename-regex`

## Language Specification

The full language specification is available in [`packages/samlang-website/spec.md`](spec.md).
