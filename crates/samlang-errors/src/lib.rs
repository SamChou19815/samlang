#![cfg_attr(test, allow(clippy::redundant_clone, clippy::clone_on_copy))]
use itertools::Itertools;
use samlang_ast::{Description, Location, Reason};
use samlang_heap::{Heap, ModuleReference, PStr};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorPrinterStyle {
  Text,
  Terminal,
  IDE,
}

/// An intermediate representation of errors that already contain some materialized strings
enum PrintableError<'a> {
  Size(usize),
  PStr(&'a PStr),
  TextRef(&'a str),
  Description(&'a Description),
  LocationReference(&'a Location),
  ModuleReference(&'a ModuleReference),
}

impl<'a> PrintableError<'a> {
  fn get_loc_reference_opt(&self) -> Option<Location> {
    match self {
      PrintableError::LocationReference(l) => Some(**l),
      _ => None,
    }
  }
}

#[cfg(test)]
mod printable_error_test {
  #[test]
  fn boilterplate() {
    assert!(super::PrintableError::Size(0).get_loc_reference_opt().is_none());
    assert!(super::PrintableError::LocationReference(&super::Location::dummy())
      .get_loc_reference_opt()
      .is_some());
  }
}

struct PrintableStream<'a> {
  collector: Vec<PrintableError<'a>>,
}

impl<'a> PrintableStream<'a> {
  fn new() -> PrintableStream<'a> {
    PrintableStream { collector: vec![] }
  }

  fn push_size(&mut self, size: usize) {
    self.collector.push(PrintableError::Size(size))
  }

  fn push_pstr(&mut self, p_str: &'a PStr) {
    self.collector.push(PrintableError::PStr(p_str))
  }

  fn push_text(&mut self, text: &'a str) {
    self.collector.push(PrintableError::TextRef(text))
  }

  fn push_description(&mut self, description: &'a Description) {
    self.collector.push(PrintableError::Description(description))
  }

  fn push_location(&mut self, loc: &'a Location) {
    self.collector.push(PrintableError::LocationReference(loc))
  }

  fn push_mod_ref(&mut self, module_reference: &'a ModuleReference) {
    self.collector.push(PrintableError::ModuleReference(module_reference))
  }
}

mod printer {
  use itertools::Itertools;
  use samlang_ast::Location;
  use samlang_heap::{Heap, ModuleReference};
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
      // In IDE state, the code frame should be dropped,
      // since it's right at the location of diagnostics.
      if self.style == super::ErrorPrinterStyle::IDE {
        self.main_collector.push('[');
        self.main_collector.push_str(&self.ref_id.to_string());
        self.main_collector.push(']');
        self.ref_id += 1;
      } else if print_reference_lines(
        heap,
        location,
        self.sources,
        self.ref_id,
        &mut self.frame_collector,
      ) {
        if self.ref_id > 0 {
          self.main_collector.push('[');
          self.main_collector.push_str(&self.ref_id.to_string());
          self.main_collector.push(']');
        }
        self.ref_id += 1;
      }
    }

    pub(super) fn print_error_detail<'b>(
      &mut self,
      heap: &'b Heap,
      error_detail: &'b super::ErrorDetail,
    ) -> Vec<super::PrintableError<'b>> {
      use super::{PrintableError, PrintableStream};
      let mut printable_stream = PrintableStream::new();
      error_detail.push_to_printable_stream(&mut printable_stream);
      for printable in &printable_stream.collector {
        match printable {
          PrintableError::Size(s) => self.push_str(&s.to_string()),
          PrintableError::PStr(p) => self.push_str(p.as_str(heap)),
          PrintableError::TextRef(s) => self.push_str(s),
          PrintableError::Description(d) => self.push_str(&d.pretty_print(heap)),
          PrintableError::LocationReference(loc) => self.print_optional_ref(heap, loc),
          PrintableError::ModuleReference(mod_ref) => self.push_str(&mod_ref.pretty_print(heap)),
        }
      }
      printable_stream.collector
    }

    pub(super) fn flush_frames(&mut self) {
      self.main_collector += &self.frame_collector;
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
    use pretty_assertions::assert_eq;
    use samlang_ast::Position;

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
        &HashMap::from([(ModuleReference::DUMMY, source.to_string())]),
        ref_id,
        &mut collector,
      );
      assert_eq!(printed, !collector.is_empty());
      collector
    }

    #[test]
    fn test_no_print() {
      let heap = &Heap::new();

      // No source
      assert_eq!("", get_frame(heap, "", ModuleReference::ROOT, (0, 0, 0, 0), 0));
      // No source
      assert_eq!("", get_frame(&Heap::new(), "", ModuleReference::DUMMY, (-1, -1, -1, -1), 0));
      // Bad location
      assert_eq!("", get_frame(heap, "", ModuleReference::DUMMY, (10, 10, 1, 1), 0));
      // Source too short
      assert_eq!("", get_frame(heap, "", ModuleReference::DUMMY, (0, 0, 1, 0), 0));
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
        get_frame(heap, "abcdefghijklmn", ModuleReference::DUMMY, (0, 5, 0, 10), 0).trim()
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
        get_frame(heap, "abcdefghijklmn", ModuleReference::DUMMY, (0, 5, 0, 10), 1).trim()
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
          ModuleReference::DUMMY,
          (8, 3, 12, 2),
          1
        )
        .trim()
      );
    }

    #[test]
    fn integration_test_text() {
      let sources = HashMap::from([(
        ModuleReference::DUMMY,
        r#"Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!
Hello sam hi!"#
          .to_string(),
      )]);
      let mut state = ErrorPrinterState::new(super::super::ErrorPrinterStyle::Text, &sources);
      let heap = &Heap::new();

      state.push_str("hiy");
      state.push('a');
      state.print_optional_ref(heap, &Location::from_pos(0, 6, 0, 9));
      state.push_str(" ouch ");
      state.print_optional_ref(heap, &Location::from_pos(1, 6, 0, 9));
      state.print_optional_ref(heap, &Location::from_pos(0, 10, 0, 12));
      state.print_optional_ref(heap, &Location::from_pos(0, 10, 10, 12));
      state.push_str(".\n\n");
      state.flush_frames();

      assert_eq!(
        r#"
hiya ouch [1][2].

  1| Hello sam hi!
           ^^^

  [1] DUMMY.sam:1:11-1:13
  -----------------------
  1| Hello sam hi!
               ^^

  [2] DUMMY.sam:1:11-11:13
  ------------------------
                vvv
   1| Hello sam hi!
   2| Hello sam hi!
   3| Hello sam hi!
   4| Hello sam hi!
   5| Hello sam hi!
   6| Hello sam hi!
   7| Hello sam hi!
   8| Hello sam hi!
   9| Hello sam hi!
  10| Hello sam hi!
  11| Hello sam hi!
      ^^^^^^^^^^^^
"#
        .trim(),
        state.consume().trim()
      );
    }

    #[test]
    fn integration_test_ide() {
      let sources = HashMap::from([(ModuleReference::DUMMY, "Hello sam hi!".to_string())]);
      let mut state = ErrorPrinterState::new(super::super::ErrorPrinterStyle::IDE, &sources);
      let heap = &Heap::new();

      state.push_str("hiya");
      state.print_optional_ref(heap, &Location::from_pos(0, 6, 0, 9));
      state.push_str(" ouch ");
      state.print_optional_ref(heap, &Location::from_pos(1, 6, 0, 9));
      state.print_optional_ref(heap, &Location::from_pos(0, 10, 0, 12));
      state.push_str(".\n\n");
      state.flush_frames();

      assert_eq!("hiya[0] ouch [1][2].".trim(), state.consume().trim());
    }
  }
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
struct TypeIncompatibilityNode {
  lower_reason: Reason,
  lower_description: Description,
  upper_reason: Reason,
  upper_description: Description,
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum IncompatibilityNode {
  Type(Box<TypeIncompatibilityNode>),
  FunctionParametersArity(usize, usize),
  TypeArgumentsArity(usize, usize),
  TypeParametersArity(usize, usize),
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct StackableError {
  rev_stack: Vec<IncompatibilityNode>,
}

impl Default for StackableError {
  fn default() -> Self {
    StackableError { rev_stack: Vec::with_capacity(2) }
  }
}

impl StackableError {
  pub fn new() -> StackableError {
    StackableError::default()
  }

  pub fn is_empty(&self) -> bool {
    self.rev_stack.is_empty()
  }

  pub fn add_type_incompatibility_error(
    &mut self,
    lower_reason: Reason,
    lower_description: Description,
    upper_reason: Reason,
    upper_description: Description,
  ) {
    self.rev_stack.push(IncompatibilityNode::Type(Box::new(TypeIncompatibilityNode {
      lower_reason,
      lower_description,
      upper_reason,
      upper_description,
    })));
  }

  pub fn add_fn_param_arity_error(&mut self, lower: usize, upper: usize) {
    self.rev_stack.push(IncompatibilityNode::FunctionParametersArity(lower, upper));
  }

  pub fn add_type_args_arity_error(&mut self, lower: usize, upper: usize) {
    self.rev_stack.push(IncompatibilityNode::TypeArgumentsArity(lower, upper));
  }

  pub fn add_type_params_arity_error(&mut self, lower: usize, upper: usize) {
    self.rev_stack.push(IncompatibilityNode::TypeParametersArity(lower, upper));
  }
}

#[cfg(test)]
mod stackable_error_tests {
  use super::{Description, Reason};
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    let mut stacked = super::StackableError::new();
    stacked.add_type_args_arity_error(0, 0);
    stacked.add_fn_param_arity_error(0, 0);
    stacked.add_type_args_arity_error(0, 0);
    stacked.add_type_params_arity_error(0, 0);
    stacked.add_type_incompatibility_error(
      Reason::dummy(),
      Description::AnyType,
      Reason::dummy(),
      Description::AnyType,
    );

    format!("{:?}", stacked);
    assert!(stacked <= stacked);
    assert!(stacked == stacked);
    assert_eq!(stacked.cmp(&stacked), std::cmp::Ordering::Equal);
  }
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum ErrorDetail {
  CannotResolveClass { module_reference: ModuleReference, name: PStr },
  CannotResolveMember { parent: Description, member: PStr },
  CannotResolveModule { module_reference: ModuleReference },
  CannotResolveName { name: PStr },
  CyclicTypeDefinition { type_: Description },
  ElementMissing { parent: Description, index: usize },
  IllegalFunctionInInterface,
  IncompatibleSubType { lower: Description, upper: Description },
  IncompatibleTypeKind { lower: Description, upper: Description },
  InvalidSyntax(String),
  MissingClassMemberDefinitions { missing_definitions: Vec<PStr> },
  MissingExport { module_reference: ModuleReference, name: PStr },
  NameAlreadyBound { name: PStr, old_loc: Location },
  NonExhaustiveStructBinding { missing_bindings: Vec<PStr> },
  NonExhaustiveTupleBinding { expected_count: usize, actual_count: usize },
  NonExhaustiveMatch { counter_example: Description },
  NotAnEnum { description: Description },
  NotAStruct { description: Description },
  Stacked(StackableError),
  TypeParameterNameMismatch { expected: Vec<Description> },
  Underconstrained,
  UselessPattern { only_pattern: bool },
}

impl ErrorDetail {
  fn push_to_printable_stream<'a>(&'a self, printable_stream: &mut PrintableStream<'a>) {
    match self {
      ErrorDetail::CannotResolveClass { module_reference: _, name } => {
        printable_stream.push_text("Cannot resolve class `");
        printable_stream.push_pstr(name);
        printable_stream.push_text("`.");
      }
      ErrorDetail::CannotResolveMember { parent, member } => {
        printable_stream.push_text("Cannot resolve member `");
        printable_stream.push_pstr(member);
        printable_stream.push_text("` on `");
        printable_stream.push_description(parent);
        printable_stream.push_text("`.");
      }
      ErrorDetail::CannotResolveModule { module_reference } => {
        printable_stream.push_text("Cannot resolve module `");
        printable_stream.push_mod_ref(module_reference);
        printable_stream.push_text("`.");
      }
      ErrorDetail::CannotResolveName { name } => {
        printable_stream.push_text("Cannot resolve name `");
        printable_stream.push_pstr(name);
        printable_stream.push_text("`.");
      }
      ErrorDetail::CyclicTypeDefinition { type_ } => {
        printable_stream.push_text("Type `");
        printable_stream.push_description(type_);
        printable_stream.push_text("` has a cyclic definition.");
      }
      ErrorDetail::ElementMissing { parent, index } => {
        printable_stream.push_text("Cannot access member of `");
        printable_stream.push_description(parent);
        printable_stream.push_text("` at index ");
        printable_stream.push_size(*index);
        printable_stream.push_text(".");
      }
      ErrorDetail::IllegalFunctionInInterface => {
        printable_stream.push_text("Function declarations are not allowed in interfaces.");
      }
      ErrorDetail::IncompatibleTypeKind { lower, upper } => {
        printable_stream.push_text("`");
        printable_stream.push_description(lower);
        printable_stream.push_text("` ");
        printable_stream.push_text("is incompatible with `");
        printable_stream.push_description(upper);
        printable_stream.push_text("`.");
      }
      ErrorDetail::IncompatibleSubType { lower, upper } => {
        printable_stream.push_text("`");
        printable_stream.push_description(lower);
        printable_stream.push_text("` ");
        printable_stream.push_text("is not a subtype of `");
        printable_stream.push_description(upper);
        printable_stream.push_text("`.");
      }
      ErrorDetail::InvalidSyntax(reason) => {
        printable_stream.push_text(reason);
      }
      ErrorDetail::MissingClassMemberDefinitions { missing_definitions } => {
        printable_stream.push_text("The following members must be implemented for the class:");
        for tag in missing_definitions {
          printable_stream.push_text("\n- `");
          printable_stream.push_pstr(tag);
          printable_stream.push_text("`");
        }
      }
      ErrorDetail::MissingExport { module_reference, name } => {
        printable_stream.push_text("There is no `");
        printable_stream.push_pstr(name);
        printable_stream.push_text("` export in `");
        printable_stream.push_mod_ref(module_reference);
        printable_stream.push_text("`.");
      }
      ErrorDetail::NameAlreadyBound { name, old_loc } => {
        printable_stream.push_text("Name `");
        printable_stream.push_pstr(name);
        printable_stream.push_text("` collides with a previously defined name at ");
        printable_stream.push_location(old_loc);
        printable_stream.push_text(".");
      }
      ErrorDetail::NonExhaustiveStructBinding { missing_bindings } => {
        printable_stream.push_text(
          "The pattern does not bind all fields. The following names have not been mentioned:",
        );
        for tag in missing_bindings {
          printable_stream.push_text("\n- `");
          printable_stream.push_pstr(tag);
          printable_stream.push_text("`");
        }
      }
      ErrorDetail::NonExhaustiveTupleBinding { expected_count, actual_count } => {
        printable_stream
          .push_text("The pattern does not bind all fields. Expected number of elements: ");
        printable_stream.push_size(*expected_count);
        printable_stream.push_text(", actual number of elements: ");
        printable_stream.push_size(*actual_count);
        printable_stream.push_text(".");
      }
      ErrorDetail::NonExhaustiveMatch { counter_example } => {
        printable_stream.push_text(
          "This pattern-matching is not exhaustive.\nHere is an example of a non-matching value: `",
        );
        printable_stream.push_description(counter_example);
        printable_stream.push_text("`.");
      }
      ErrorDetail::NotAnEnum { description } => {
        printable_stream.push_text("`");
        printable_stream.push_description(description);
        printable_stream.push_text("` is not an instance of an enum class.");
      }
      ErrorDetail::NotAStruct { description } => {
        printable_stream.push_text("`");
        printable_stream.push_description(description);
        printable_stream.push_text("` is not an instance of a struct class.");
      }
      ErrorDetail::Stacked(s) => {
        for (i, e) in s.rev_stack.iter().rev().enumerate() {
          if i >= 1 {
            printable_stream.push_text("\n");
            for _ in 0..(i - 1) {
              printable_stream.push_text("  ");
            }
            printable_stream.push_text("- ");
          }
          let print_ref = i + 1 == s.rev_stack.len();
          match e {
            IncompatibilityNode::Type(t) => {
              printable_stream.push_text("`");
              printable_stream.push_description(&t.lower_description);
              printable_stream.push_text("` ");
              if print_ref {
                printable_stream.push_location(&t.lower_reason.use_loc);
                printable_stream.push_text(" ");
              }
              printable_stream.push_text("is incompatible with `");
              printable_stream.push_description(&t.upper_description);
              if print_ref {
                printable_stream.push_text("` ");
                printable_stream.push_location(&t.upper_reason.use_loc);
                printable_stream.push_text(".");
              } else {
                printable_stream.push_text("`.");
              }
            }
            IncompatibilityNode::FunctionParametersArity(l, u) => {
              printable_stream.push_text("Function parameter arity of ");
              printable_stream.push_size(*l);
              printable_stream.push_text(" is incompatible with function parameter arity of ");
              printable_stream.push_size(*u);
              printable_stream.push_text(".");
            }
            IncompatibilityNode::TypeArgumentsArity(l, u) => {
              printable_stream.push_text("Type argument arity of ");
              printable_stream.push_size(*l);
              printable_stream.push_text(" is incompatible with type argument arity of ");
              printable_stream.push_size(*u);
              printable_stream.push_text(".");
            }
            IncompatibilityNode::TypeParametersArity(l, u) => {
              printable_stream.push_text("Type parameter arity of ");
              printable_stream.push_size(*l);
              printable_stream.push_text(" is incompatible with type parameter arity of ");
              printable_stream.push_size(*u);
              printable_stream.push_text(".");
            }
          }
        }
      }
      ErrorDetail::TypeParameterNameMismatch { expected } => {
        let mut iter = expected.iter();
        if let Some(first) = iter.next() {
          printable_stream.push_text("Type parameter name mismatch. Expected exact match of `<");
          printable_stream.push_description(first);
          for d in iter {
            printable_stream.push_text(", ");
            printable_stream.push_description(d);
          }
          printable_stream.push_text(">`.");
        } else {
          printable_stream
            .push_text("Type parameter name mismatch. Expected empty type parameters.");
        }
      }
      ErrorDetail::Underconstrained => {
        printable_stream.push_text(
          "There is not enough context information to decide the type of this expression.",
        );
      }
      ErrorDetail::UselessPattern { only_pattern: true } => {
        printable_stream.push_text("The pattern is irrefutable.");
      }
      ErrorDetail::UselessPattern { only_pattern: false } => {
        printable_stream.push_text("The pattern is already covered by previous cases.");
      }
    }
  }
}

#[derive(Debug, PartialEq, Eq)]
pub struct ErrorInIDEFormat {
  pub location: Location,
  pub ide_error: String,
  pub full_error: String,
  pub reference_locs: Vec<Location>,
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct CompileTimeError {
  pub location: Location,
  pub detail: ErrorDetail,
}

impl CompileTimeError {
  pub fn is_syntax_error(&self) -> bool {
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

  pub fn to_ide_format(
    &self,
    heap: &Heap,
    sources: &HashMap<ModuleReference, String>,
  ) -> ErrorInIDEFormat {
    let mut ide_printer = printer::ErrorPrinterState::new(ErrorPrinterStyle::IDE, sources);
    let printable_error_segments = ide_printer.print_error_detail(heap, &self.detail);
    let ide_error = ide_printer.consume();
    let reference_locs =
      printable_error_segments.into_iter().filter_map(|s| s.get_loc_reference_opt()).collect_vec();

    let mut full_error_printer =
      printer::ErrorPrinterState::new(ErrorPrinterStyle::Terminal, sources);
    ErrorSet::print_one_error_message(heap, &mut full_error_printer, self);
    let full_error = full_error_printer.consume();
    ErrorInIDEFormat { location: self.location, ide_error, full_error, reference_locs }
  }
}

#[derive(Default)]
pub struct ErrorSet {
  errors: BTreeSet<CompileTimeError>,
}

impl ErrorSet {
  pub fn new() -> ErrorSet {
    ErrorSet::default()
  }

  pub fn group_errors(self) -> HashMap<ModuleReference, Vec<CompileTimeError>> {
    let grouped = self.errors.into_iter().group_by(|e| e.location.module_reference);
    grouped.into_iter().map(|(k, v)| (k, v.collect_vec())).collect::<HashMap<_, _>>()
  }

  pub fn has_errors(&self) -> bool {
    !self.errors.is_empty()
  }

  pub fn errors(&self) -> Vec<&CompileTimeError> {
    self.errors.iter().collect()
  }

  fn print_one_error_message(
    heap: &Heap,
    printer: &mut printer::ErrorPrinterState,
    e: &CompileTimeError,
  ) {
    e.pretty_print_error_loc_lines(heap, printer);
    printer.print_optional_ref(heap, &e.location);
    printer.print_error_detail(heap, &e.detail);
    printer.push_str("\n\n");
    printer.flush_frames();
    printer.push('\n');
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
      Self::print_one_error_message(heap, &mut printer, e);
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

  pub fn pretty_print_error_messages(
    &self,
    heap: &Heap,
    sources: &HashMap<ModuleReference, String>,
  ) -> String {
    self.error_messages(heap, ErrorPrinterStyle::Text, sources)
  }

  pub fn pretty_print_from_grouped_error_messages_for_tests(
    heap: &Heap,
    sources: &HashMap<ModuleReference, String>,
    grouped_errors: &HashMap<ModuleReference, Vec<CompileTimeError>>,
  ) -> String {
    let mut printer = printer::ErrorPrinterState::new(ErrorPrinterStyle::Text, sources);
    for e in grouped_errors.values().sorted().flatten() {
      Self::print_one_error_message(heap, &mut printer, e);
    }
    printer.consume()
  }

  pub fn pretty_print_error_messages_no_frame_for_test(&self, heap: &Heap) -> String {
    self.pretty_print_error_messages(heap, &HashMap::new())
  }

  fn report_error(&mut self, location: Location, detail: ErrorDetail) {
    self.errors.insert(CompileTimeError { location, detail });
  }

  pub fn report_cannot_resolve_member_error(
    &mut self,
    loc: Location,
    parent: Description,
    member: PStr,
  ) {
    self.report_error(loc, ErrorDetail::CannotResolveMember { parent, member })
  }

  pub fn report_cannot_resolve_module_error(
    &mut self,
    loc: Location,
    module_reference: ModuleReference,
  ) {
    self.report_error(loc, ErrorDetail::CannotResolveModule { module_reference })
  }

  pub fn report_cannot_resolve_class_error(
    &mut self,
    loc: Location,
    module_reference: ModuleReference,
    name: PStr,
  ) {
    self.report_error(loc, ErrorDetail::CannotResolveClass { module_reference, name })
  }

  pub fn report_cannot_resolve_name_error(&mut self, loc: Location, name: PStr) {
    self.report_error(loc, ErrorDetail::CannotResolveName { name })
  }

  pub fn report_cyclic_type_definition_error(&mut self, type_loc: Location, type_: Description) {
    self.report_error(type_loc, ErrorDetail::CyclicTypeDefinition { type_ });
  }

  pub fn report_element_missing_error(&mut self, loc: Location, parent: Description, index: usize) {
    self.report_error(loc, ErrorDetail::ElementMissing { parent, index })
  }

  pub fn report_illegal_function_in_interface(&mut self, loc: Location) {
    self.report_error(loc, ErrorDetail::IllegalFunctionInInterface);
  }

  pub fn report_incompatible_subtype_error(
    &mut self,
    loc: Location,
    lower: Description,
    upper: Description,
  ) {
    self.report_error(loc, ErrorDetail::IncompatibleSubType { lower, upper })
  }

  pub fn report_incompatible_type_kind_error(
    &mut self,
    loc: Location,
    lower: Description,
    upper: Description,
  ) {
    self.report_error(loc, ErrorDetail::IncompatibleTypeKind { lower, upper })
  }

  pub fn report_invalid_syntax_error(&mut self, loc: Location, reason: String) {
    self.report_error(loc, ErrorDetail::InvalidSyntax(reason))
  }

  pub fn report_missing_class_member_definition_error(
    &mut self,
    loc: Location,
    missing_definitions: Vec<PStr>,
  ) {
    self.report_error(loc, ErrorDetail::MissingClassMemberDefinitions { missing_definitions })
  }

  pub fn report_missing_export_error(
    &mut self,
    loc: Location,
    module_reference: ModuleReference,
    name: PStr,
  ) {
    self.report_error(loc, ErrorDetail::MissingExport { module_reference, name })
  }

  pub fn report_name_already_bound_error(
    &mut self,
    new_loc: Location,
    name: PStr,
    old_loc: Location,
  ) {
    self.report_error(new_loc, ErrorDetail::NameAlreadyBound { name, old_loc })
  }

  pub fn report_non_exhaustive_struct_binding_error(
    &mut self,
    loc: Location,
    missing_bindings: Vec<PStr>,
  ) {
    self.report_error(loc, ErrorDetail::NonExhaustiveStructBinding { missing_bindings })
  }

  pub fn report_non_exhaustive_tuple_binding_error(
    &mut self,
    loc: Location,
    expected_count: usize,
    actual_count: usize,
  ) {
    self.report_error(loc, ErrorDetail::NonExhaustiveTupleBinding { expected_count, actual_count })
  }

  pub fn report_non_exhaustive_match_error(&mut self, loc: Location, counter_example: Description) {
    self.report_error(loc, ErrorDetail::NonExhaustiveMatch { counter_example })
  }

  pub fn report_not_an_enum_error(&mut self, loc: Location, description: Description) {
    self.report_error(loc, ErrorDetail::NotAnEnum { description })
  }

  pub fn report_not_a_struct_error(&mut self, loc: Location, description: Description) {
    self.report_error(loc, ErrorDetail::NotAStruct { description })
  }

  pub fn report_stackable_error(&mut self, loc: Location, stackable: StackableError) {
    self.report_error(loc, ErrorDetail::Stacked(stackable))
  }

  pub fn report_type_parameter_mismatch_error(
    &mut self,
    loc: Location,
    expected: Vec<Description>,
  ) {
    self.report_error(loc, ErrorDetail::TypeParameterNameMismatch { expected })
  }

  pub fn report_underconstrained_error(&mut self, loc: Location) {
    self.report_error(loc, ErrorDetail::Underconstrained)
  }

  pub fn report_useless_pattern_error(&mut self, loc: Location, only_pattern: bool) {
    self.report_error(loc, ErrorDetail::UselessPattern { only_pattern })
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, PStr};

  #[test]
  fn boilterplate() {
    format!("{:?}", ErrorPrinterStyle::IDE);
    format!(
      "{:?}",
      ErrorInIDEFormat {
        location: Location::dummy(),
        ide_error: "ide".to_string(),
        full_error: "full".to_string(),
        reference_locs: vec![]
      }
    );
    assert!(ErrorPrinterStyle::Terminal.clone() != ErrorPrinterStyle::Text);
    format!(
      "{:?}",
      CompileTimeError { location: Location::dummy(), detail: ErrorDetail::Underconstrained }
    );
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
    let mut stack = StackableError::new();

    stack.add_fn_param_arity_error(1, 2);
    stack.add_type_args_arity_error(1, 2);
    stack.add_type_incompatibility_error(
      Reason::dummy(),
      Description::BoolType,
      Reason::dummy(),
      Description::IntType,
    );
    assert_eq!(false, stack.is_empty());
  }

  #[test]
  fn error_message_tests() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();

    assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(&heap));

    error_set.report_cannot_resolve_module_error(Location::dummy(), ModuleReference::DUMMY);
    assert_eq!(
      r#"Error ------------------------------------ DUMMY.sam:0:0-0:0

Cannot resolve module `DUMMY`.


Found 1 error.
"#
      .trim(),
      error_set.pretty_print_error_messages_no_frame_for_test(&heap)
    );
    assert_eq!(
      ErrorInIDEFormat {
        location: Location::dummy(),
        ide_error: "Cannot resolve module `DUMMY`.".to_string(),
        full_error: r#"Error ------------------------------------ DUMMY.sam:0:0-0:0

Cannot resolve module `DUMMY`.


"#
        .to_string(),
        reference_locs: vec![]
      },
      error_set.errors()[0].to_ide_format(&heap, &HashMap::new())
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

Cannot resolve module `DUMMY`.


Error ------------------------------------------------------
Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Long.sam:0:0-0:0

Cannot resolve name `global`.


Found 2 errors."#
        .trim(),
      error_set.pretty_print_error_messages_no_frame_for_test(&heap)
    );

    error_set.report_cannot_resolve_class_error(
      Location::dummy(),
      ModuleReference::DUMMY,
      heap.alloc_str_for_test("global"),
    );
    error_set.report_cyclic_type_definition_error(Location::dummy(), Description::IntType);
    error_set.report_element_missing_error(Location::dummy(), Description::GeneralNominalType, 1);
    error_set.report_incompatible_type_kind_error(
      Location::dummy(),
      Description::GeneralClassType,
      Description::GeneralInterfaceType,
    );
    error_set.report_incompatible_subtype_error(
      Location::dummy(),
      Description::IntType,
      Description::BoolType,
    );
    error_set.report_invalid_syntax_error(Location::dummy(), "bad code".to_string());
    error_set.report_illegal_function_in_interface(Location::dummy());
    error_set.report_cannot_resolve_member_error(
      Location::dummy(),
      Description::NominalType { name: heap.alloc_str_for_test("Foo"), type_args: vec![] },
      heap.alloc_str_for_test("bar"),
    );
    error_set.report_missing_class_member_definition_error(
      Location::dummy(),
      vec![heap.alloc_str_for_test("foo"), heap.alloc_str_for_test("bar")],
    );
    error_set.report_missing_export_error(
      Location::dummy(),
      ModuleReference::DUMMY,
      heap.alloc_str_for_test("bar"),
    );
    error_set.report_name_already_bound_error(Location::dummy(), PStr::LOWER_A, Location::dummy());
    error_set.report_non_exhaustive_struct_binding_error(
      Location::dummy(),
      vec![PStr::UPPER_A, PStr::UPPER_B],
    );
    error_set.report_non_exhaustive_tuple_binding_error(Location::dummy(), 7, 4);
    error_set.report_non_exhaustive_match_error(Location::dummy(), Description::IntType);
    error_set.report_not_an_enum_error(Location::dummy(), Description::IntType);
    error_set.report_not_a_struct_error(Location::dummy(), Description::IntType);
    error_set.report_stackable_error(Location::dummy(), {
      let mut stacked = StackableError::new();
      stacked.add_type_incompatibility_error(
        Reason::dummy(),
        Description::AnyType,
        Reason::dummy(),
        Description::AnyType,
      );
      stacked.add_type_args_arity_error(0, 0);
      stacked.add_fn_param_arity_error(0, 0);
      stacked.add_type_incompatibility_error(
        Reason::dummy(),
        Description::AnyType,
        Reason::dummy(),
        Description::AnyType,
      );
      stacked.add_type_params_arity_error(1, 2);
      stacked
    });
    error_set.report_type_parameter_mismatch_error(Location::dummy(), vec![]);
    error_set.report_type_parameter_mismatch_error(Location::dummy(), vec![Description::IntType]);
    error_set.report_type_parameter_mismatch_error(
      Location::dummy(),
      vec![Description::IntType, Description::IntType],
    );
    error_set.report_underconstrained_error(Location::dummy());
    error_set.report_useless_pattern_error(Location::dummy(), false);
    error_set.report_useless_pattern_error(Location::dummy(), true);

    let expected_errors = r#"
Error ------------------------------------ DUMMY.sam:0:0-0:0

Cannot resolve class `global`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Cannot resolve member `bar` on `Foo`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Cannot resolve module `DUMMY`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Type `int` has a cyclic definition.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Cannot access member of `nominal type` at index 1.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Function declarations are not allowed in interfaces.


Error ------------------------------------ DUMMY.sam:0:0-0:0

`int` is not a subtype of `bool`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

`class type` is incompatible with `interface type`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

bad code


Error ------------------------------------ DUMMY.sam:0:0-0:0

The following members must be implemented for the class:
- `foo`
- `bar`


Error ------------------------------------ DUMMY.sam:0:0-0:0

There is no `bar` export in `DUMMY`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Name `a` collides with a previously defined name at .


Error ------------------------------------ DUMMY.sam:0:0-0:0

The pattern does not bind all fields. The following names have not been mentioned:
- `A`
- `B`


Error ------------------------------------ DUMMY.sam:0:0-0:0

The pattern does not bind all fields. Expected number of elements: 7, actual number of elements: 4.


Error ------------------------------------ DUMMY.sam:0:0-0:0

This pattern-matching is not exhaustive.
Here is an example of a non-matching value: `int`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

`int` is not an instance of an enum class.


Error ------------------------------------ DUMMY.sam:0:0-0:0

`int` is not an instance of a struct class.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Type parameter arity of 1 is incompatible with type parameter arity of 2.
- `any` is incompatible with `any`.
  - Function parameter arity of 0 is incompatible with function parameter arity of 0.
    - Type argument arity of 0 is incompatible with type argument arity of 0.
      - `any`  is incompatible with `any` .


Error ------------------------------------ DUMMY.sam:0:0-0:0

Type parameter name mismatch. Expected empty type parameters.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Type parameter name mismatch. Expected exact match of `<int>`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

Type parameter name mismatch. Expected exact match of `<int, int>`.


Error ------------------------------------ DUMMY.sam:0:0-0:0

There is not enough context information to decide the type of this expression.


Error ------------------------------------ DUMMY.sam:0:0-0:0

The pattern is already covered by previous cases.


Error ------------------------------------ DUMMY.sam:0:0-0:0

The pattern is irrefutable.


Error ------------------------------------------------------
Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Very/Long.sam:0:0-0:0

Cannot resolve name `global`.


Found 25 errors.
"#;
    assert_eq!(
      expected_errors.trim(),
      error_set.pretty_print_error_messages_no_frame_for_test(&heap).trim()
    );
    assert!(error_set.has_errors());
    assert_eq!(2, error_set.group_errors().len());
  }
}
