#![cfg_attr(test, allow(clippy::redundant_clone, clippy::clone_on_copy))]

mod loc;
pub use loc::{Location, Position};
mod reason;
pub use reason::{Description, Reason};

pub mod hir;
mod hir_tests;
pub mod lir;
mod lir_tests;
pub mod mir;
mod mir_tests;
pub mod source;
mod source_tests;
pub mod wasm;
