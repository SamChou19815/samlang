use itertools::Itertools;
use std::{ops::Deref, rc::Rc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Str(Rc<str>);

impl Deref for Str {
  type Target = str;

  fn deref(&self) -> &Self::Target {
    &self.0
  }
}

#[cfg(test)]
mod rc_string_tests {
  fn rcs(s: &'static str) -> super::Str {
    super::Str(super::Rc::from(s))
  }

  #[test]
  fn tests() {
    assert!(rcs("foo").cmp(&rcs("zuck")).is_lt());
    assert!(rcs("foo").partial_cmp(&rcs("zuck")).is_some());
    assert!(rcs("foo") == rcs("foo"));
    assert_eq!(rcs("zuck"), rcs("zuck"));
    assert_eq!(Some('h'), rcs("hiya").chars().next());
  }
}

/// This document type is a little clumsy at the stage of pretty printing.
/// However, it is very useful for doing optimization on whether to start a new line.
///
/// Quote:
/// > "... we introduce a new representation for documents, with one constructor corresponding to each
/// > operator that builds a document."
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Document {
  Nil,
  Concat(Rc<Document>, Rc<Document>),
  Nest(usize, Rc<Document>),
  Text(&'static str),
  NonStaticText(Str),
  Line,
  /// Extension to prettier's document.
  /// It behaves exactly like `LINE`, except that it is flattened to nil instead of a space.
  LineFlattenToNil,
  /// Extension to prettier's document.
  /// It behaves like `LINE`, except that it must always be a line.
  LineHard,
  /// Correspond to the `DOC :<|> DOC` node in the prettier paper.
  /// It represents two different ways to print the document, where `doc1` is preferred over `doc2`.
  /// In general, `doc1` is the flattened version of `doc2`.
  Union(Rc<Document>, Rc<Document>),
}

impl Document {
  pub(super) fn non_static_str(s: String) -> Self {
    Self::NonStaticText(Str(Rc::from(s)))
  }

  /// Replace all LINE with TEXT(' '). Correspond to the `flatten` function in the prettier paper.
  pub(super) fn flatten(&self) -> Option<Self> {
    match self {
      Self::Nil => Some(Self::Nil),
      Self::Concat(d1, d2) => {
        if let (Some(d1), Some(d2)) = (d1.flatten(), d2.flatten()) {
          Some(Self::Concat(Rc::new(d1), Rc::new(d2)))
        } else {
          None
        }
      }
      Self::Nest(indentation, d) => d.flatten().map(|d| Self::Nest(*indentation, Rc::new(d))),
      Self::Text(s) => Some(Self::Text(s)),
      Self::NonStaticText(s) => Some(Self::NonStaticText(s.clone())),
      Self::Line => Some(Self::Text(" ")),
      Self::LineFlattenToNil => Some(Self::Nil),
      Self::LineHard => None,
      Self::Union(d, _) => d.flatten(),
    }
  }

  pub(super) fn concat(mut docs: Vec<Self>) -> Self {
    if let Some(last) = docs.pop() {
      let mut base = last;
      while !docs.is_empty() {
        base = Self::Concat(Rc::new(docs.pop().unwrap()), Rc::new(base));
      }
      base
    } else {
      Self::Nil
    }
  }

  pub(super) fn group(doc: Self) -> Self {
    if let Some(flattened) = doc.flatten() {
      Self::Union(Rc::new(flattened), Rc::new(doc))
    } else {
      doc
    }
  }

  pub(super) fn bracket_flexible(
    left: &'static str,
    separator: Self,
    doc: Self,
    right: &'static str,
  ) -> Self {
    Self::group(Self::concat(vec![
      Self::Text(left),
      Self::Nest(2, Rc::new(Self::Concat(Rc::new(separator.clone()), Rc::new(doc)))),
      separator,
      Self::Text(right),
    ]))
  }

  pub(super) fn no_space_bracket(left: &'static str, doc: Self, right: &'static str) -> Self {
    Self::bracket_flexible(left, Self::LineFlattenToNil, doc, right)
  }

  pub(super) fn spaced_bracket(left: &'static str, doc: Document, right: &'static str) -> Self {
    Self::bracket_flexible(left, Self::Line, doc, right)
  }

  pub(super) fn line_comment(text: &str) -> Self {
    let mut multiline_docs = vec![Self::Text("// ")];
    for word in text.split(' ') {
      multiline_docs.push(Self::Union(
        Rc::new(Self::Concat(
          Rc::new(Self::non_static_str(word.to_string())),
          Rc::new(Self::Text(" ")),
        )),
        Rc::new(Self::concat(vec![
          Self::non_static_str(word.to_string()),
          Self::LineHard,
          Self::Text("// "),
        ])),
      ));
    }
    Self::Union(
      Rc::new(Self::Concat(
        Rc::new(Self::Text("// ")),
        Rc::new(Self::non_static_str(text.to_string())),
      )),
      Rc::new(Self::concat(multiline_docs)),
    )
  }

  pub(super) fn multiline_comment(starter: &'static str, text: &str) -> Self {
    let mut multiline_docs = vec![Self::Text(starter), Self::LineHard, Self::Text(" * ")];
    for word in text.split(' ') {
      multiline_docs.push(Self::Union(
        Rc::new(Self::Concat(
          Rc::new(Self::non_static_str(word.to_string())),
          Rc::new(Self::Text(" ")),
        )),
        Rc::new(Self::concat(vec![
          Self::non_static_str(word.to_string()),
          Self::LineHard,
          Self::Text(" * "),
        ])),
      ));
    }
    multiline_docs.push(Self::LineHard);
    multiline_docs.push(Self::Text(" */"));
    Self::Union(
      Rc::new(Self::concat(vec![
        Self::Text(starter),
        Self::Text(" "),
        Self::non_static_str(text.to_string()),
        Self::Text(" */"),
      ])),
      Rc::new(Self::concat(multiline_docs)),
    )
  }
}

/// The representation of a document that is most useful for pretty-printing.
/// Each variant can be translated easily into a printable form without extra state.
enum IntermediateDocumentTokenForPrinting {
  Text(&'static str),
  NonStaticText(Str),
  Line { indentation: usize, hard: bool },
}

enum DocumentList {
  Nil,
  Cons(usize, Rc<Document>, Rc<DocumentList>),
}

fn generate_best_doc(
  collector: &mut Vec<IntermediateDocumentTokenForPrinting>,
  available_width: usize,
  mut consumed: usize,
  mut enforce_consumed: bool,
  mut list: Rc<DocumentList>,
) -> bool {
  loop {
    if enforce_consumed && consumed > available_width {
      return false;
    }
    let (indentation, document, rest) = if let DocumentList::Cons(i, d, r) = list.as_ref() {
      (i, d, r)
    } else {
      return true;
    };
    match document.as_ref() {
      Document::Nil => list = rest.clone(),
      Document::Concat(d1, d2) => {
        list = Rc::new(DocumentList::Cons(
          *indentation,
          d1.clone(),
          Rc::new(DocumentList::Cons(*indentation, d2.clone(), rest.clone())),
        ));
      }
      Document::Nest(i, d) => {
        list = Rc::new(DocumentList::Cons(indentation + i, d.clone(), rest.clone()))
      }
      Document::Text(s) => {
        collector.push(IntermediateDocumentTokenForPrinting::Text(s));
        consumed += s.len();
        list = rest.clone();
      }
      Document::NonStaticText(s) => {
        collector.push(IntermediateDocumentTokenForPrinting::NonStaticText(s.clone()));
        consumed += s.len();
        list = rest.clone();
      }
      Document::Line | Document::LineFlattenToNil | Document::LineHard => {
        collector.push(IntermediateDocumentTokenForPrinting::Line {
          indentation: *indentation,
          hard: document.as_ref().eq(&Document::LineHard),
        });
        consumed = *indentation;
        enforce_consumed = false;
        list = rest.clone();
      }
      Document::Union(d1, d2) => {
        let prev_length = collector.len();
        if generate_best_doc(
          collector,
          available_width,
          consumed,
          true,
          Rc::new(DocumentList::Cons(*indentation, d1.clone(), rest.clone())),
        ) {
          return true;
        } else {
          collector.truncate(prev_length);
          list = Rc::new(DocumentList::Cons(*indentation, d2.clone(), rest.clone()));
        }
      }
    }
  }
}

/// This function implements the prettier algorithm described in:
/// https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf
pub(super) fn pretty_print(available_width: usize, document: Document) -> String {
  let mut collector = Vec::new();
  generate_best_doc(
    &mut collector,
    available_width,
    0,
    false,
    Rc::new(DocumentList::Cons(0, Rc::new(document), Rc::new(DocumentList::Nil))),
  );

  let mut string_builder = String::new();
  let mut prev_hard_line = false;
  for token in collector {
    match token {
      IntermediateDocumentTokenForPrinting::Text(s) => {
        string_builder.push_str(s);
        prev_hard_line = false;
      }
      IntermediateDocumentTokenForPrinting::NonStaticText(s) => {
        string_builder.push_str(&s);
        prev_hard_line = false;
      }
      IntermediateDocumentTokenForPrinting::Line { indentation, hard } => {
        if !hard && prev_hard_line {
          // If we already printed a hard line before and we are getting a soft line,
          // undo the hardline first.
          string_builder.truncate(string_builder.trim_end().len());
        }
        string_builder.push('\n');
        prev_hard_line = hard;
        for _ in 0..indentation {
          string_builder.push(' ');
        }
      }
    }
  }

  let concat = string_builder.split('\n').map(|line| line.trim_end()).join("\n");
  let post_processed = concat.trim_end();
  if post_processed.is_empty() { post_processed.to_string() } else { format!("{post_processed}\n") }
}

#[cfg(test)]
mod tests {
  use super::{Document, pretty_print};
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use std::rc::Rc;

  #[test]
  fn boilterplate() {
    assert_eq!(Document::Nil, Document::Nil);
    assert_eq!(Document::Text("a").clone(), Document::Text("a"));
    assert!(Document::Line.eq(&Document::Line));
  }

  #[test]
  fn concat_tests() {
    assert_eq!(Document::Nil, Document::concat(Vec::new()));
    assert_eq!(Document::Text("a"), Document::concat(vec![Document::Text("a")]));
    assert_eq!(
      Document::Concat(Rc::new(Document::Text("a")), Rc::new(Document::Text("b"))),
      Document::concat(vec![Document::Text("a"), Document::Text("b")])
    );
  }

  fn assert_printed(available_width: usize, document: Document, expected: &str) {
    assert_eq!(expected, pretty_print(available_width, document));
  }

  #[test]
  fn comment_tests() {
    assert_printed(
      20,
      Document::multiline_comment("/**", "this is a test haha foo bar oh noooooo"),
      r#"/**
 * this is a test
 * haha foo bar oh
 * noooooo
 */
"#,
    );

    assert_printed(
      20,
      Document::line_comment("this is a test haha foo bar oh noooooo"),
      r#"// this is a test
// haha foo bar oh
// noooooo
"#,
    );

    assert_printed(20, Document::multiline_comment("/**", "test test"), "/** test test */\n");
    assert_printed(20, Document::line_comment("test test"), "// test test\n");

    assert_printed(
      1,
      Document::multiline_comment("/**", "this is a test haha foo bar oh noooooo"),
      r#"/**
 * this
 * is
 * a
 * test
 * haha
 * foo
 * bar
 * oh
 * noooooo
 *
 */
"#,
    );
    assert_printed(
      1,
      Document::line_comment("this is a test haha foo bar oh noooooo"),
      r#"// this
// is
// a
// test
// haha
// foo
// bar
// oh
// noooooo
//
"#,
    );
  }

  #[test]
  fn hard_line_test() {
    // With a hardline, it forces the entire group to be unable to flatten.
    assert_printed(
      100,
      Document::group(Document::concat(vec![
        Document::Text("a"),
        Document::Line,
        Document::Nest(
          2,
          Rc::new(Document::concat(vec![
            Document::Text("c"),
            Document::LineHard,
            Document::Text("d"),
          ])),
        ),
        Document::Line,
        Document::Text("b"),
      ])),
      r#"a
c
  d
b
"#,
    );
  }

  #[test]
  fn spaced_bracket_test() {
    assert_printed(100, Document::spaced_bracket("[", Document::Text("a"), "]"), "[ a ]\n");
  }

  struct Tree {
    name: &'static str,
    children: Vec<Rc<Tree>>,
  }

  fn show_tree(tree: &Tree, nil_line: bool) -> Document {
    Document::Concat(
      Rc::new(Document::Text(tree.name)),
      Rc::new(show_bracket(tree.children.clone(), nil_line)),
    )
  }

  fn show_bracket(trees: Vec<Rc<Tree>>, nil_line: bool) -> Document {
    if trees.is_empty() {
      Document::Nil
    } else {
      Document::concat(vec![Document::no_space_bracket("[", show_trees(trees, nil_line), "]")])
    }
  }

  fn show_trees(trees: Vec<Rc<Tree>>, nil_line: bool) -> Document {
    let mut tree_iter = trees.into_iter();
    let first_doc = show_tree(&tree_iter.next().unwrap(), nil_line);
    let rest = tree_iter.collect_vec();
    if rest.is_empty() {
      first_doc
    } else {
      Document::concat(vec![
        first_doc,
        Document::Text(","),
        if nil_line { Document::LineFlattenToNil } else { Document::Line },
        show_trees(rest, nil_line),
      ])
    }
  }

  // Example from the prettier paper
  #[test]
  fn tree_test() {
    let tree = Tree {
      name: "aaa",
      children: vec![
        Rc::new(Tree {
          name: "bbbbb",
          children: vec![
            Rc::new(Tree { name: "ccc", children: Vec::new() }),
            Rc::new(Tree { name: "dd", children: Vec::new() }),
          ],
        }),
        Rc::new(Tree { name: "eee", children: Vec::new() }),
        Rc::new(Tree {
          name: "ffff",
          children: vec![
            Rc::new(Tree { name: "gg", children: Vec::new() }),
            Rc::new(Tree { name: "hhh", children: Vec::new() }),
            Rc::new(Tree { name: "ii", children: Vec::new() }),
          ],
        }),
      ],
    };

    assert_printed(
      20,
      show_tree(&tree, false),
      r#"aaa[
  bbbbb[ccc, dd],
  eee,
  ffff[gg, hhh, ii]
]
"#,
    );
    assert_printed(
      20,
      show_tree(&tree, true),
      r#"aaa[
  bbbbb[ccc,dd],
  eee,
  ffff[gg,hhh,ii]
]
"#,
    );
    assert_printed(
      16,
      show_tree(&tree, false),
      r#"aaa[
  bbbbb[
    ccc,
    dd
  ],
  eee,
  ffff[
    gg,
    hhh,
    ii
  ]
]
"#,
    );
  }
}
