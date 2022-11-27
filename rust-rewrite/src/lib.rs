#![allow(dead_code)]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

mod ast;
mod checker;
mod common;
mod compiler;
mod errors;
mod integration_tests;
mod interpreter;
mod parser;
