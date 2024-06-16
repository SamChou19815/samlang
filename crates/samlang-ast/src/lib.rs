mod loc;
pub use loc::{Location, Position};
mod reason;
pub use reason::{Description, Reason};

/// HIR is the result of direct lowering from source.
/// Generics are still preserved.
pub mod hir;
mod hir_tests;
/// LIR is the first IR where we start to lose track of accurate types.
/// In this stage, we start to have GC specific instructions.
pub mod lir;
mod lir_tests;
/// MIR is the result of generics specialization.
/// Within generics specialization, some representations of enum types are also optimized.
/// Most of the optimizations run on MIR.
pub mod mir;
mod mir_tests;
/// The full-fidelity representation of the source code.
/// All of the LSP logic runs on source AST.
pub mod source;
mod source_tests;
/// The final stage AST that closely models parts of WASM that are relevant to samlang.
/// For now, this is the only supported backend.
pub mod wasm;
