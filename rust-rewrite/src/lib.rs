#![allow(dead_code, clippy::upper_case_acronyms, clippy::or_fun_call, clippy::expect_fun_call)]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

mod ast;
mod checker;
mod common;
mod compiler;
mod errors;
mod integration_tests;
mod interpreter;
mod optimization;
mod parser;
mod printer;
