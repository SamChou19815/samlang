pub(crate) mod common_names;

mod loc;
pub(crate) use loc::{Location, ModuleReference, Position};
mod reason;
pub(crate) use reason::Reason;

pub(crate) mod hir;
mod hir_tests;
pub(crate) mod mir;
mod mir_tests;
pub(crate) mod source;
mod source_tests;
pub mod wasm;
mod wasm_tests;
