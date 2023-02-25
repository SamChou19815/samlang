/// The public LSP services
pub mod api;
mod api_tests;
/// A service to maintain up-to-date dependency graph
mod dep_graph;
/// A service to perform garbage collection on heaps
mod gc;
/// A service to perform global search for find references
mod global_searcher;
/// A service to find the smallest cover of a meaningful AST node
mod location_cover;
/// A service to power go-to-definition requests
mod variable_definition;
