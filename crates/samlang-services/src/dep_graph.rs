use itertools::Itertools;
use samlang_ast::source::Module;
use samlang_heap::ModuleReference;
use std::collections::{HashMap, HashSet};

pub(super) struct DependencyGraph {
  forward: HashMap<ModuleReference, HashSet<ModuleReference>>,
  reverse: HashMap<ModuleReference, HashSet<ModuleReference>>,
}

fn transitive_set(
  graph: &HashMap<ModuleReference, HashSet<ModuleReference>>,
  initial: HashSet<ModuleReference>,
) -> HashSet<ModuleReference> {
  let mut stack = initial.into_iter().collect_vec();
  let mut result = HashSet::new();
  while let Some(mod_ref) = stack.pop() {
    if result.insert(mod_ref) {
      if let Some(edges) = graph.get(&mod_ref) {
        for e in edges {
          stack.push(*e);
        }
      }
    }
  }
  result
}

impl DependencyGraph {
  pub(super) fn new(sources: &HashMap<ModuleReference, Module<()>>) -> DependencyGraph {
    let mut graph = DependencyGraph { forward: HashMap::new(), reverse: HashMap::new() };
    for (mod_ref, module) in sources {
      let mut forward_set = HashSet::new();
      for import in &module.imports {
        forward_set.insert(import.imported_module);
        if let Some(existing) = graph.reverse.get_mut(&import.imported_module) {
          existing.insert(*mod_ref);
        } else {
          graph.reverse.insert(import.imported_module, HashSet::from([*mod_ref]));
        }
      }
      graph.forward.insert(*mod_ref, forward_set);
    }
    graph
  }

  pub(super) fn affected_set(
    &self,
    dirty_set: HashSet<ModuleReference>,
  ) -> HashSet<ModuleReference> {
    transitive_set(&self.forward, transitive_set(&self.reverse, dirty_set))
  }
}

// TODO: incremental rebuild of dependency graph

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;
  use samlang_heap::Heap;
  use samlang_parser::parse_source_module_from_text;
  use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

  #[test]
  fn full_build_and_query_tests() {
    let source_a = "";
    let source_b = "import { A } from A";
    let source_c = "import { B } from B";
    let source_d = r#"
    import { A } from A
    import { B } from B
    import { C } from C"#;
    let heap = &mut Heap::new();
    let error_set = &mut samlang_errors::ErrorSet::new();
    let mod_ref_a = heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]);
    let mod_ref_b = heap.alloc_module_reference_from_string_vec(vec!["B".to_string()]);
    let mod_ref_c = heap.alloc_module_reference_from_string_vec(vec!["C".to_string()]);
    let mod_ref_d = heap.alloc_module_reference_from_string_vec(vec!["D".to_string()]);
    let sources = HashMap::from([
      (mod_ref_a, parse_source_module_from_text(source_a, mod_ref_a, heap, error_set)),
      (mod_ref_b, parse_source_module_from_text(source_b, mod_ref_b, heap, error_set)),
      (mod_ref_c, parse_source_module_from_text(source_c, mod_ref_c, heap, error_set)),
      (mod_ref_d, parse_source_module_from_text(source_d, mod_ref_d, heap, error_set)),
    ]);
    let graph = super::DependencyGraph::new(&sources);

    assert_eq!(
      "{ModuleReference(3), ModuleReference(4), ModuleReference(5), ModuleReference(6)}",
      format!(
        "{:?}",
        graph.affected_set(HashSet::from([mod_ref_a])).into_iter().collect::<BTreeSet<_>>()
      )
    );
    assert_eq!(
      "{ModuleReference(3), ModuleReference(4), ModuleReference(5), ModuleReference(6)}",
      format!(
        "{:?}",
        graph.affected_set(HashSet::from([mod_ref_b])).into_iter().collect::<BTreeSet<_>>()
      )
    );
    assert_eq!(
      "{ModuleReference(3), ModuleReference(4), ModuleReference(5), ModuleReference(6)}",
      format!(
        "{:?}",
        graph.affected_set(HashSet::from([mod_ref_c])).into_iter().collect::<BTreeSet<_>>()
      )
    );
    assert_eq!(
      "{ModuleReference(3), ModuleReference(4), ModuleReference(5), ModuleReference(6)}",
      format!(
        "{:?}",
        graph.affected_set(HashSet::from([mod_ref_d])).into_iter().collect::<BTreeSet<_>>()
      )
    );

    let forward = graph
      .forward
      .into_iter()
      .map(|(mod_ref, set)| (mod_ref, set.into_iter().collect::<BTreeSet<_>>()))
      .collect::<BTreeMap<_, _>>();
    let reverse = graph
      .reverse
      .into_iter()
      .map(|(mod_ref, set)| (mod_ref, set.into_iter().collect::<BTreeSet<_>>()))
      .collect::<BTreeMap<_, _>>();

    assert_eq!("ModuleReference(3)", format!("{mod_ref_a:?}"));
    assert_eq!("ModuleReference(4)", format!("{mod_ref_b:?}"));
    assert_eq!("ModuleReference(5)", format!("{mod_ref_c:?}"));
    assert_eq!("ModuleReference(6)", format!("{mod_ref_d:?}"));
    assert_eq!(
      "{ModuleReference(3): {}, ModuleReference(4): {ModuleReference(3)}, ModuleReference(5): {ModuleReference(4)}, ModuleReference(6): {ModuleReference(3), ModuleReference(4), ModuleReference(5)}}",
      format!("{forward:?}")
    );
    assert_eq!(
      "{ModuleReference(3): {ModuleReference(4), ModuleReference(6)}, ModuleReference(4): {ModuleReference(5), ModuleReference(6)}, ModuleReference(5): {ModuleReference(6)}}",
      format!("{reverse:?}")
    );
  }
}
