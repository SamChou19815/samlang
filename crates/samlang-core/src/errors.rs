use crate::{
  ast::{Description, Location, Reason},
  common::{Heap, ModuleReference, PStr},
};
use itertools::Itertools;
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorPrinterStyle {
  Text,
  Terminal,
  IDE,
}

mod printer {
  use crate::{
    ast::Location,
    common::{Heap, ModuleReference},
  };
  use itertools::Itertools;
  use std::collections::HashMap;

  fn find_code_frame_lines<'a>(
    location: &Location,
    sources: &'a HashMap<ModuleReference, String>,
  ) -> Option<Vec<&'a str>> {
    if location.start.0 < 0
      || location.start.1 < 0
      || location.end.0 < 0
      || location.end.1 < 0
      || location.start.0 > location.end.0
    {
      return None;
    }
    let relevant_code = sources.get(&location.module_reference)?;
    let num_of_lines = (location.end.0 - location.start.0 + 1) as usize;
    let relevant_lines =
      relevant_code.split('\n').skip(location.start.0 as usize).take(num_of_lines).collect_vec();
    if relevant_lines.len() == num_of_lines {
      Some(relevant_lines)
    } else {
      None
    }
  }

  /// Print reference lines if the reference can be found in the source
  /// Ref ids and location will be printed, except for ref_id=0
  /// Returns whether we are able to find the reference.
  fn print_reference_lines(
    heap: &Heap,
    location: &Location,
    sources: &HashMap<ModuleReference, String>,
    ref_id: u32,
    collector: &mut String,
  ) -> bool {
    let Some(relevant_lines) = find_code_frame_lines(location, sources) else {
      return false;
    };
    debug_assert!(!relevant_lines.is_empty());
    let left_pad = "  ";
    if ref_id > 0 {
      let ref_loc_line = format!("[{}] {}", ref_id, location.pretty_print(heap));
      collector.push_str(left_pad);
      collector.push_str(&ref_loc_line);
      collector.push('\n');
      collector.push_str(left_pad);
      for _ in 0..ref_loc_line.len() {
        collector.push('-');
      }
      collector.push('\n');
    }
    if relevant_lines.len() == 1 {
      collector.push_str(left_pad);
      let line_num_str = (location.start.0 + 1).to_string();
      // Print code frame
      collector.push_str(&line_num_str);
      collector.push_str("| ");
      collector.push_str(relevant_lines[0]);
      collector.push('\n');
      // Print ^^^^
      collector.push_str(left_pad);
      for _ in 0..(line_num_str.len() + 2 + location.start.1 as usize) {
        collector.push(' ');
      }
      for _ in location.start.1..location.end.1 {
        collector.push('^');
      }
      collector.push('\n');
      collector.push('\n');
    } else {
      let line_num_and_lines = relevant_lines
        .into_iter()
        .enumerate()
        .map(|(i, l)| ((i + 1 + location.start.0 as usize).to_string(), l))
        .collect_vec();
      let max_line_num = line_num_and_lines.iter().map(|(s, _)| s.len()).max().unwrap();
      // Print vvvv
      collector.push_str(left_pad);
      for _ in 0..(max_line_num + 2 + location.start.1 as usize) {
        collector.push(' ');
      }
      for _ in (location.start.1 as usize)..(line_num_and_lines[0].1.len()) {
        collector.push('v');
      }
      collector.push('\n');
      // Print code frame
      for (line_num, line) in &line_num_and_lines {
        collector.push_str(left_pad);
        for _ in line_num.len()..max_line_num {
          collector.push(' ');
        }
        collector.push_str(line_num);
        collector.push_str("| ");
        collector.push_str(line);
        collector.push('\n');
      }
      // Print ^^^^
      collector.push_str(left_pad);
      for _ in 0..(max_line_num + 2) {
        collector.push(' ');
      }
      for _ in 0..(location.end.1 as usize) {
        collector.push('^');
      }
      collector.push('\n');
      collector.push('\n');
    }
    true
  }

  pub(super) struct ErrorPrinterState<'a> {
    pub(super) style: super::ErrorPrinterStyle,
    pub(super) sources: &'a HashMap<ModuleReference, String>,
    main_collector: String,
    frame_collector: String,
    ref_id: u32,
  }

  impl<'a> ErrorPrinterState<'a> {
    pub(super) fn new(
      style: super::ErrorPrinterStyle,
      sources: &'a HashMap<ModuleReference, String>,
    ) -> ErrorPrinterState<'a> {
      ErrorPrinterState {
        style,
        sources,
        main_collector: String::new(),
        frame_collector: String::new(),
        ref_id: 0,
      }
    }

    pub(super) fn push(&mut self, c: char) {
      self.main_collector.push(c);
    }

    pub(super) fn push_str(&mut self, str: &str) {
      self.main_collector.push_str(str);
    }

    pub(super) fn print_optional_ref(&mut self, heap: &Heap, location: &Location) {
      if print_reference_lines(heap, location, self.sources, self.ref_id, &mut self.frame_collector)
      {
        if self.ref_id > 0 {
          self.main_collector.push_str(" [");
          self.main_collector.push_str(&self.ref_id.to_string());
          self.main_collector.push(']');
        } else if self.style == super::ErrorPrinterStyle::IDE {
          // In IDE state, the first code frame should be dropped,
          // since it's right at the location of diagnostics.
          self.frame_collector.clear();
        }
        self.ref_id += 1;
      }
    }

    pub(super) fn flush_frames(&mut self) {
      if self.style == super::ErrorPrinterStyle::IDE {
        self.main_collector.push_str("```\n");
        self.main_collector += self.frame_collector.trim_end();
        self.main_collector.push_str("\n```\n");
      } else {
        self.main_collector += &self.frame_collector;
      }
      self.frame_collector = String::new();
      self.ref_id = 0;
    }

    pub(super) fn consume(self) -> String {
      debug_assert!(self.frame_collector.is_empty());
      self.main_collector
    }
  }

  #[cfg(test)]
  mod tests {
    use super::*;
    use crate::ast::Position;
    use pretty_assertions::assert_eq;

    fn get_frame(
      heap: &Heap,
      source: &'static str,
      module_reference: ModuleReference,
      range: (i32, i32, i32, i32),
      ref_id: u32,
    ) -> String {
      let mut collector = String::new();
      let printed = print_reference_lines(
        heap,
        &Location {
          module_reference,
          start: Position(range.0, range.1),
          end: Position(range.2, range.3),
        },
        &HashMap::from([(ModuleReference::dummy(), source.to_string())]),
        ref_id,
        &mut collector,
      );
      if printed {
        assert!(!collector.is_empty());
      } else {
        assert!(collector.is_empty());
      }
      collector
    }

    #[test]
    fn test_no_print() {
      let heap = &Heap::new();

      // No source
      assert_eq!("", get_frame(heap, "", ModuleReference::root(), (0, 0, 0, 0), 0));
      // No source
      assert_eq!("", get_frame(&Heap::new(), "", ModuleReference::dummy(), (-1, -1, -1, -1), 0));
      // Bad location
      assert_eq!("", get_frame(heap, "", ModuleReference::dummy(), (10, 10, 1, 1), 0));
      // Source too short
      assert_eq!("", get_frame(heap, "", ModuleReference::dummy(), (0, 0, 1, 0), 0));
    }

    #[test]
    fn test_simple_no_ref_id() {
      let heap = &Heap::new();

      assert_eq!(
        r#"
  1| abcdefghijklmn
          ^^^^^
"#
        .trim(),
        get_frame(heap, "abcdefghijklmn", ModuleReference::dummy(), (0, 5, 0, 10), 0).trim()
      );
    }

    #[test]
    fn test_simple_with_ref_id() {
      let heap = &Heap::new();

      assert_eq!(
        r#"
  [1] DUMMY.sam:1:6-1:11
  ----------------------
  1| abcdefghijklmn
          ^^^^^
  "#
        .trim(),
        get_frame(heap, "abcdefghijklmn", ModuleReference::dummy(), (0, 5, 0, 10), 1).trim()
      );
    }

    #[test]
    fn multiline_stress_test() {
      let heap = &Heap::new();

      assert_eq!(
        r#"
  [1] DUMMY.sam:9:4-13:3
  ----------------------
         vvv
   9| Line 8
  10| Line 9
  11| Line 10
  12| Line 11
  13| Line 12
      ^^
  "#
        .trim(),
        get_frame(
          heap,
          r#"Line 0
Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
Line 12
Line 13
"#,
          ModuleReference::dummy(),
          (8, 3, 12, 2),
          1
        )
        .trim()
      );
    }

    #[test]
    fn integration_test_text() {
      let sources = HashMap::from([(ModuleReference::dummy(), "Hello sam hi!".to_string())]);
      let mut state = ErrorPrinterState::new(super::super::ErrorPrinterStyle::Text, &sources);
      let heap = &Heap::new();

      state.push_str("hiy");
      state.push('a');
      state.print_optional_ref(heap, &Location::from_pos(0, 6, 0, 9));
      state.push_str(" ouch");
      state.print_optional_ref(heap, &Location::from_pos(1, 6, 0, 9));
      state.print_optional_ref(heap, &Location::from_pos(0, 10, 0, 12));
      state.push_str(".\n\n");
      state.flush_frames();

      assert_eq!(
        r#"
hiya ouch [1].

  1| Hello sam hi!
           ^^^

  [1] DUMMY.sam:1:11-1:13
  -----------------------
  1| Hello sam hi!
               ^^
"#
        .trim(),
        state.consume().trim()
      );
    }

    #[test]
    fn integration_test_ide() {
      let sources = HashMap::from([(ModuleReference::dummy(), "Hello sam hi!".to_string())]);
      let mut state = ErrorPrinterState::new(super::super::ErrorPrinterStyle::IDE, &sources);
      let heap = &Heap::new();

      state.push_str("hiya");
      state.print_optional_ref(heap, &Location::from_pos(0, 6, 0, 9));
      state.push_str(" ouch");
      state.print_optional_ref(heap, &Location::from_pos(1, 6, 0, 9));
      state.print_optional_ref(heap, &Location::from_pos(0, 10, 0, 12));
      state.push_str(".\n\n");
      state.flush_frames();

      assert_eq!(
        r#"
hiya ouch [1].

```
  [1] DUMMY.sam:1:11-1:13
  -----------------------
  1| Hello sam hi!
               ^^
```
"#
        .trim(),
        state.consume().trim()
      );
    }
  }
}

pub(crate) struct TypeIncompatibilityNode {
  pub(crate) lower_reason: Reason,
  pub(crate) lower_description: Description,
  pub(crate) upper_reason: Reason,
  pub(crate) upper_description: Description,
}

pub(crate) enum IncompatibilityNode {
  Type(Box<TypeIncompatibilityNode>),
  FunctionParametersArity(u32, u32),
  TypeArgumentsArity(u32, u32),
}

impl IncompatibilityNode {
  fn pretty_print(&self, heap: &Heap, collector: &mut String) {
    match self {
      IncompatibilityNode::Type(t) => {
        collector.push('`');
        collector.push_str(&t.lower_description.pretty_print(heap));
        collector.push_str("` (");
        collector.push_str(&t.lower_reason.use_loc.pretty_print(heap));
        collector.push_str(") is incompatible with `");
        collector.push_str(&t.upper_description.pretty_print(heap));
        collector.push_str("` (");
        collector.push_str(&t.upper_reason.use_loc.pretty_print(heap));
        collector.push_str(").\n");
      }
      IncompatibilityNode::FunctionParametersArity(l, u) => {
        collector.push_str("Function parameter arity of ");
        collector.push_str(&l.to_string());
        collector.push_str(" is incompatible with function parameter arity of ");
        collector.push_str(&u.to_string());
        collector.push_str(".\n");
      }
      IncompatibilityNode::TypeArgumentsArity(l, u) => {
        collector.push_str("Type argument arity of ");
        collector.push_str(&l.to_string());
        collector.push_str(" is incompatible with type argument arity of ");
        collector.push_str(&u.to_string());
        collector.push_str(".\n");
      }
    }
  }
}

pub(crate) struct StackableError {
  rev_stack: Vec<IncompatibilityNode>,
}

impl StackableError {
  pub(crate) fn new() -> StackableError {
    StackableError { rev_stack: Vec::with_capacity(2) }
  }

  pub(crate) fn is_empty(&self) -> bool {
    self.rev_stack.is_empty()
  }

  pub(crate) fn add_type_error(&mut self, node: TypeIncompatibilityNode) {
    self.rev_stack.push(IncompatibilityNode::Type(Box::new(node)));
  }

  pub(crate) fn add_fn_param_arity_error(&mut self, lower: usize, upper: usize) {
    self.rev_stack.push(IncompatibilityNode::FunctionParametersArity(lower as u32, upper as u32));
  }

  pub(crate) fn add_type_args_arity_error(&mut self, lower: usize, upper: usize) {
    self.rev_stack.push(IncompatibilityNode::TypeArgumentsArity(lower as u32, upper as u32));
  }

  pub(crate) fn pretty_print(&self, heap: &Heap, collector: &mut String) {
    for (i, e) in self.rev_stack.iter().rev().enumerate() {
      if i >= 1 {
        for _ in 0..(i - 1) {
          collector.push_str("  ");
        }
        collector.push_str("- ");
      }
      e.pretty_print(heap, collector);
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum ErrorDetail {
  CannotResolveClass { module_reference: ModuleReference, name: PStr },
  CannotResolveModule { module_reference: ModuleReference },
  CannotResolveName { name: PStr },
  CyclicTypeDefinition { type_: String },
  IllegalFunctionInInterface,
  IncompatibleType { expected: String, actual: String, subtype: bool },
  InvalidArity { kind: &'static str, expected: usize, actual: usize },
  InvalidSyntax(String),
  MemberMissing { parent: String, member: PStr },
  MissingDefinitions { missing_definitions: Vec<PStr> },
  MissingExport { module_reference: ModuleReference, name: PStr },
  NameAlreadyBound { name: PStr, old_loc: Location },
  NonExhausiveMatch { missing_tags: Vec<PStr> },
  TypeParameterNameMismatch { expected: String },
  Underconstrained,
}

impl ErrorDetail {
  fn pretty_print(&self, heap: &Heap, _style: ErrorPrinterStyle) -> String {
    match self {
      ErrorDetail::CannotResolveClass { module_reference: _, name } => {
        format!("Class `{}` is not resolved.", name.as_str(heap))
      }
      ErrorDetail::CannotResolveModule { module_reference } => {
        format!("Module `{}` is not resolved.", module_reference.pretty_print(heap))
      }
      ErrorDetail::CannotResolveName { name } => {
        format!("Name `{}` is not resolved.", name.as_str(heap))
      }
      ErrorDetail::CyclicTypeDefinition { type_ } => {
        format!("Type `{type_}` has a cyclic definition.")
      }
      ErrorDetail::IllegalFunctionInInterface => {
        "Function declarations are not allowed in interfaces.".to_string()
      }
      ErrorDetail::IncompatibleType { expected, actual, subtype: false } => {
        format!("Expected: `{expected}`, actual: `{actual}`.")
      }
      ErrorDetail::IncompatibleType { expected, actual, subtype: true } => {
        format!("Expected: subtype of `{expected}`, actual: `{actual}`.")
      }
      ErrorDetail::InvalidArity { kind, expected, actual } => {
        format!("Incorrect {kind} size. Expected: {expected}, actual: {actual}.")
      }
      ErrorDetail::InvalidSyntax(reason) => reason.to_string(),
      ErrorDetail::MemberMissing { parent, member } => {
        format!("Cannot find member `{}` on `{}`.", member.as_str(heap), parent)
      }
      ErrorDetail::MissingDefinitions { missing_definitions } => format!(
        "Missing definitions for [{}].",
        missing_definitions.iter().map(|p| p.as_str(heap).to_string()).sorted().join(", ")
      ),
      ErrorDetail::MissingExport { module_reference, name } => format!(
        "There is no `{}` export in `{}`.",
        name.as_str(heap),
        module_reference.pretty_print(heap)
      ),
      ErrorDetail::NameAlreadyBound { name, old_loc } => format!(
        "Name `{}` collides with a previously defined name at {}.",
        name.as_str(heap),
        old_loc.pretty_print(heap)
      ),
      ErrorDetail::NonExhausiveMatch { missing_tags } => format!(
        "The following tags are not considered in the match: [{}].",
        missing_tags.iter().map(|p| p.as_str(heap).to_string()).sorted().join(", "),
      ),
      ErrorDetail::TypeParameterNameMismatch { expected } => {
        format!("Type parameter name mismatch. Expected exact match of `{expected}`.")
      }
      ErrorDetail::Underconstrained => {
        "There is not enough context information to decide the type of this expression.".to_string()
      }
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct CompileTimeError {
  pub location: Location,
  pub(crate) detail: ErrorDetail,
}

impl CompileTimeError {
  pub(crate) fn is_syntax_error(&self) -> bool {
    matches!(&self.detail, ErrorDetail::InvalidSyntax(_))
  }

  fn pretty_print_error_loc_lines(&self, heap: &Heap, printer: &mut printer::ErrorPrinterState) {
    let loc_string = self.location.pretty_print(heap);
    let full_err_line = "Error ------------------------------------------------------";
    if loc_string.len() > full_err_line.len() - 10 {
      printer.push_str(full_err_line);
      printer.push('\n');
      printer.push_str(&loc_string);
      printer.push('\n');
    } else {
      printer.push_str(
        &full_err_line.chars().take(full_err_line.len() - loc_string.len() - 1).collect::<String>(),
      );
      printer.push(' ');
      printer.push_str(&loc_string);
      printer.push('\n');
    }
    printer.push('\n');
  }

  pub fn format_error_message_for_ide(&self, heap: &Heap) -> String {
    self.detail.pretty_print(heap, ErrorPrinterStyle::IDE)
  }
}

pub(crate) struct ErrorSet {
  errors: BTreeSet<CompileTimeError>,
}

impl ErrorSet {
  pub(crate) fn new() -> ErrorSet {
    ErrorSet { errors: BTreeSet::new() }
  }

  pub(crate) fn from_grouped(
    grouped_errors: &HashMap<ModuleReference, Vec<CompileTimeError>>,
  ) -> ErrorSet {
    let mut errors = BTreeSet::new();
    for e in grouped_errors.values().flatten() {
      errors.insert(e.clone());
    }
    ErrorSet { errors }
  }

  pub(crate) fn has_errors(&self) -> bool {
    !self.errors.is_empty()
  }

  pub(crate) fn errors(&self) -> Vec<&CompileTimeError> {
    self.errors.iter().collect()
  }

  fn error_messages(
    &self,
    heap: &Heap,
    style: ErrorPrinterStyle,
    sources: &HashMap<ModuleReference, String>,
  ) -> String {
    if self.errors.is_empty() {
      return "".to_string();
    }
    let mut printer = printer::ErrorPrinterState::new(style, sources);
    for e in &self.errors {
      e.pretty_print_error_loc_lines(heap, &mut printer);
      printer.print_optional_ref(heap, &e.location);
      printer.push_str(&e.detail.pretty_print(heap, style));
      printer.push_str("\n\n");
      printer.flush_frames();
      printer.push('\n');
    }
    if self.errors.len() > 1 {
      printer.push_str("Found ");
      printer.push_str(&self.errors.len().to_string());
      printer.push_str(" errors.");
    } else {
      printer.push_str("Found 1 error.");
    }
    printer.consume()
  }

  pub(crate) fn pretty_print_error_messages(
    &self,
    heap: &Heap,
    sources: &HashMap<ModuleReference, String>,
  ) -> String {
    self.error_messages(heap, ErrorPrinterStyle::Text, sources)
  }

  #[cfg(test)]
  pub(crate) fn pretty_print_error_messages_no_frame(&self, heap: &Heap) -> String {
    self.pretty_print_error_messages(heap, &HashMap::new())
  }

  fn report_error(&mut self, location: Location, detail: ErrorDetail) {
    self.errors.insert(CompileTimeError { location, detail });
  }

  pub(crate) fn report_cannot_resolve_module_error(
    &mut self,
    loc: Location,
    module_reference: ModuleReference,
  ) {
    self.report_error(loc, ErrorDetail::CannotResolveModule { module_reference })
  }

  pub(crate) fn report_cannot_resolve_class_error(
    &mut self,
    loc: Location,
    module_reference: ModuleReference,
    name: PStr,
  ) {
    self.report_error(loc, ErrorDetail::CannotResolveClass { module_reference, name })
  }

  pub(crate) fn report_cannot_resolve_name_error(&mut self, loc: Location, name: PStr) {
    self.report_error(loc, ErrorDetail::CannotResolveName { name })
  }

  pub(crate) fn report_cyclic_type_definition_error(&mut self, type_loc: Location, type_: String) {
    self.report_error(type_loc, ErrorDetail::CyclicTypeDefinition { type_ });
  }

  pub(crate) fn report_illegal_function_in_interface(&mut self, loc: Location) {
    self.report_error(loc, ErrorDetail::IllegalFunctionInInterface);
  }

  pub(crate) fn report_incompatible_type_error(
    &mut self,
    loc: Location,
    expected: String,
    actual: String,
  ) {
    self.report_error(loc, ErrorDetail::IncompatibleType { expected, actual, subtype: false })
  }

  pub(crate) fn report_incompatible_subtype_error(
    &mut self,
    loc: Location,
    expected: String,
    actual: String,
  ) {
    self.report_error(loc, ErrorDetail::IncompatibleType { expected, actual, subtype: true })
  }

  pub(crate) fn report_invalid_arity_error(
    &mut self,
    loc: Location,
    kind: &'static str,
    expected_size: usize,
    actual_size: usize,
  ) {
    self.report_error(
      loc,
      ErrorDetail::InvalidArity { kind, expected: expected_size, actual: actual_size },
    )
  }

  pub(crate) fn report_invalid_syntax_error(&mut self, loc: Location, reason: String) {
    self.report_error(loc, ErrorDetail::InvalidSyntax(reason))
  }

  pub(crate) fn report_member_missing_error(
    &mut self,
    loc: Location,
    parent: String,
    member: PStr,
  ) {
    self.report_error(loc, ErrorDetail::MemberMissing { parent, member })
  }

  pub(crate) fn report_missing_definition_error(
    &mut self,
    loc: Location,
    missing_definitions: Vec<PStr>,
  ) {
    self.report_error(loc, ErrorDetail::MissingDefinitions { missing_definitions })
  }

  pub(crate) fn report_missing_export_error(
    &mut self,
    loc: Location,
    module_reference: ModuleReference,
    name: PStr,
  ) {
    self.report_error(loc, ErrorDetail::MissingExport { module_reference, name })
  }

  pub(crate) fn report_name_already_bound_error(
    &mut self,
    new_loc: Location,
    name: PStr,
    old_loc: Location,
  ) {
    self.report_error(new_loc, ErrorDetail::NameAlreadyBound { name, old_loc })
  }

  pub(crate) fn report_non_exhausive_match_error(
    &mut self,
    loc: Location,
    missing_tags: Vec<PStr>,
  ) {
    self.report_error(loc, ErrorDetail::NonExhausiveMatch { missing_tags })
  }

  pub(crate) fn report_type_parameter_mismatch_error(&mut self, loc: Location, expected: String) {
    self.report_error(loc, ErrorDetail::TypeParameterNameMismatch { expected })
  }
  pub(crate) fn report_underconstrained_error(&mut self, loc: Location) {
    self.report_error(loc, ErrorDetail::Underconstrained)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    checker::type_::{test_type_builder, ISourceType},
    common::{well_known_pstrs, Heap},
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    assert!(!format!("{:?}", ErrorPrinterStyle::IDE).is_empty());
    assert!(ErrorPrinterStyle::Terminal.clone() != ErrorPrinterStyle::Text);
    assert!(!format!(
      "{:?}",
      CompileTimeError { location: Location::dummy(), detail: ErrorDetail::Underconstrained }
    )
    .is_empty());
    assert_eq!(
      Some(std::cmp::Ordering::Equal),
      CompileTimeError { location: Location::dummy(), detail: ErrorDetail::Underconstrained }
        .partial_cmp(&CompileTimeError {
          location: Location::dummy(),
          detail: ErrorDetail::Underconstrained
        })
    );
    assert!(
      CompileTimeError { location: Location::dummy(), detail: ErrorDetail::Underconstrained }
        == CompileTimeError { location: Location::dummy(), detail: ErrorDetail::Underconstrained }
    );
  }

  #[test]
  fn error_stack_tests() {
    let heap = Heap::new();
    let mut stack = StackableError::new();

    stack.add_fn_param_arity_error(1, 2);
    stack.add_type_args_arity_error(1, 2);
    stack.add_type_error(TypeIncompatibilityNode {
      lower_reason: Reason::dummy(),
      lower_description: Description::BoolType,
      upper_reason: Reason::dummy(),
      upper_description: Description::IntType,
    });
    assert!(!stack.is_empty());

    let mut collector = String::new();
    stack.pretty_print(&heap, &mut collector);
    assert_eq!(
      r#"
`bool` (DUMMY.sam:0:0-0:0) is incompatible with `int` (DUMMY.sam:0:0-0:0).
- Type argument arity of 1 is incompatible with type argument arity of 2.
  - Function parameter arity of 1 is incompatible with function parameter arity of 2."#
        .trim(),
      collector.trim()
    );
  }

  #[test]
  fn error_message_tests() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let builder = test_type_builder::create();

    assert_eq!("", error_set.pretty_print_error_messages_no_frame(&heap));

    error_set.report_cannot_resolve_module_error(Location::dummy(), ModuleReference::dummy());
    assert_eq!(
      r#"Error ------------------------------------ DUMMY.sam:0:0-0:0

Module `DUMMY` is not resolved.


Found 1 error.
"#
      .trim(),
      error_set.pretty_print_error_messages_no_frame(&heap)
    );
    assert_eq!(
      "Module `DUMMY` is not resolved.",
      error_set.errors()[0].format_error_message_for_ide(&heap)
    );

    error_set.report_cannot_resolve_name_error(
      Location {
        module_reference: heap.alloc_module_reference_from_string_vec(vec![
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Very".to_string(),
          "Long".to_string(),
        ]),
        ..Location::dummy()
      },
      heap.alloc_str_for_test("global"),
    );
    assert_eq!(
      r#"
Error ------------------------------------ DUMMY.sam:0:0-0:0

Module `DUMMY` is not resolved.


Error ------------------------------------------------------
Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Long.sam:0:0-0:0

Name `global` is not resolved.


Found 2 errors."#
        .trim(),
      error_set.pretty_print_error_messages_no_frame(&heap)
    );

    error_set.report_cannot_resolve_class_error(
      Location::dummy(),
      ModuleReference::dummy(),
      heap.alloc_str_for_test("global"),
    );
    error_set.report_cyclic_type_definition_error(
      builder.int_type().get_reason().use_loc,
      builder.int_type().pretty_print(&heap),
    );
    error_set.report_incompatible_type_error(
      Location::dummy(),
      builder.int_type().pretty_print(&heap),
      builder.bool_type().pretty_print(&heap),
    );
    error_set.report_invalid_arity_error(Location::dummy(), "pair", 1, 2);
    error_set.report_incompatible_subtype_error(
      Location::dummy(),
      builder.int_type().pretty_print(&heap),
      builder.bool_type().pretty_print(&heap),
    );
    error_set.report_invalid_syntax_error(Location::dummy(), "bad code".to_string());
    error_set.report_member_missing_error(
      Location::dummy(),
      "Foo".to_string(),
      heap.alloc_str_for_test("bar"),
    );
    error_set.report_missing_definition_error(
      Location::dummy(),
      vec![heap.alloc_str_for_test("foo"), heap.alloc_str_for_test("bar")],
    );
    error_set.report_missing_export_error(
      Location::dummy(),
      ModuleReference::dummy(),
      heap.alloc_str_for_test("bar"),
    );
    error_set.report_name_already_bound_error(
      Location::dummy(),
      well_known_pstrs::LOWER_A,
      Location::dummy(),
    );
    error_set.report_non_exhausive_match_error(
      Location::dummy(),
      vec![well_known_pstrs::UPPER_A, well_known_pstrs::UPPER_B],
    );
    error_set.report_type_parameter_mismatch_error(Location::dummy(), "".to_string());
    error_set.report_underconstrained_error(Location::dummy());

    let expected_errors = r#"
Error ------------------------------------ DUMMY.sam:0:0-0:0

Class `global` is not resolved.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Module `DUMMY` is not resolved.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Type `int` has a cyclic definition.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Expected: `int`, actual: `bool`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Expected: subtype of `int`, actual: `bool`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Incorrect pair size. Expected: 1, actual: 2.


Error ------------------------------------ DUMMY.sam:0:0-0:0

bad code


Error ------------------------------------ DUMMY.sam:0:0-0:0

Cannot find member `bar` on `Foo`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Missing definitions for [bar, foo].


Error ------------------------------------ DUMMY.sam:0:0-0:0

There is no `bar` export in `DUMMY`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Name `a` collides with a previously defined name at DUMMY.sam:0:0-0:0.


Error ------------------------------------ DUMMY.sam:0:0-0:0

The following tags are not considered in the match: [A, B].


Error ------------------------------------ DUMMY.sam:0:0-0:0

Type parameter name mismatch. Expected exact match of ``.


Error ------------------------------------ DUMMY.sam:0:0-0:0

There is not enough context information to decide the type of this expression.


Error ------------------------------------------------------
Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Long.sam:0:0-0:0

Name `global` is not resolved.


Found 15 errors.
"#;
    assert_eq!(
      expected_errors.trim(),
      error_set.pretty_print_error_messages_no_frame(&heap).trim()
    );
    assert!(error_set.has_errors());
  }
}
