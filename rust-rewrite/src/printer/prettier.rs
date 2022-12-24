use crate::common::{rc_string, rcs, Str};
use enum_as_inner::EnumAsInner;
use itertools::Itertools;
use std::rc::Rc;

/// This document type is a little clumsy at the stage of pretty printing.
/// However, it is very useful for doing optimization on whether to start a new line.
///
/// Quote:
/// > "... we introduce a new representation for documents, with one constructor corresponding to each
/// operator that builds a document."
#[derive(Debug, Clone, PartialEq, Eq, EnumAsInner)]
pub(super) enum Document {
  Nil,
  Concat(Rc<Document>, Rc<Document>),
  Nest(usize, Rc<Document>),
  Text(Str),
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
  /// Replace all LINE with TEXT(' '). Correspond to the `flatten` function in the prettier paper.
  fn flatten(&self) -> Option<Document> {
    match self {
      Document::Nil => Some(Document::Nil),
      Document::Concat(d1, d2) => {
        if let (Some(d1), Some(d2)) = (d1.flatten(), d2.flatten()) {
          Some(Document::Concat(Rc::new(d1), Rc::new(d2)))
        } else {
          None
        }
      }
      Document::Nest(indentation, d) => {
        d.flatten().map(|d| Document::Nest(*indentation, Rc::new(d)))
      }
      Document::Text(s) => Some(Document::Text(s.clone())),
      Document::Line => Some(Document::Text(rcs(" "))),
      Document::LineFlattenToNil => Some(Document::Nil),
      Document::LineHard => None,
      Document::Union(d, _) => d.flatten(),
    }
  }

  pub(super) fn concat(mut docs: Vec<Document>) -> Document {
    if let Some(last) = docs.pop() {
      let mut base = last;
      while !docs.is_empty() {
        base = Document::Concat(Rc::new(docs.pop().unwrap()), Rc::new(base));
      }
      base
    } else {
      Document::Nil
    }
  }

  pub(super) fn group(doc: Document) -> Document {
    if let Some(flattened) = doc.flatten() {
      Document::Union(Rc::new(flattened), Rc::new(doc))
    } else {
      doc
    }
  }

  fn bracket_flexible(left: Str, separator: Document, doc: Document, right: Str) -> Document {
    Self::group(Self::concat(vec![
      Self::Text(left),
      Self::Nest(2, Rc::new(Self::Concat(Rc::new(separator.clone()), Rc::new(doc)))),
      separator,
      Self::Text(right),
    ]))
  }

  pub(super) fn no_space_bracket(left: Str, doc: Document, right: Str) -> Document {
    Self::bracket_flexible(left, Self::LineFlattenToNil, doc, right)
  }

  pub(super) fn spaced_bracket(left: Str, doc: Document, right: Str) -> Document {
    Self::bracket_flexible(left, Self::Line, doc, right)
  }

  pub(super) fn line_comment(text: &str) -> Document {
    let mut multiline_docs = vec![Self::Text(rcs("// "))];
    for word in text.split(' ') {
      multiline_docs.push(Self::Union(
        Rc::new(Self::Text(rc_string(format!("{} ", word)))),
        Rc::new(Self::concat(vec![
          Self::Text(rc_string(word.to_string())),
          Self::LineHard,
          Self::Text(rcs("// ")),
        ])),
      ));
    }
    Self::Union(
      Rc::new(Self::Text(rc_string(format!("// {}", text)))),
      Rc::new(Self::concat(multiline_docs)),
    )
  }

  pub(super) fn multiline_comment(starter: &str, text: &str) -> Document {
    let mut multiline_docs =
      vec![Self::Text(rc_string(starter.to_string())), Self::LineHard, Self::Text(rcs(" * "))];
    for word in text.split(' ') {
      multiline_docs.push(Self::Union(
        Rc::new(Self::Text(rc_string(format!("{} ", word)))),
        Rc::new(Self::concat(vec![
          Self::Text(rc_string(word.to_string())),
          Self::LineHard,
          Self::Text(rcs(" * ")),
        ])),
      ));
    }
    multiline_docs.push(Self::LineHard);
    multiline_docs.push(Self::Text(rcs(" */")));
    Self::Union(
      Rc::new(Self::Text(rc_string(format!("{} {} */", starter, text)))),
      Rc::new(Self::concat(multiline_docs)),
    )
  }
}

/// The representation of a document that is most useful for pretty-printing.
/// Each variant can be translated easily into a printable form without extra state.
enum IntermediateDocumentTokenForPrinting {
  Text(Str),
  Line(usize),
}

enum DocumentList {
  Nil,
  Cons(usize, Rc<Document>, Rc<DocumentList>),
}

fn generate_best_doc(
  collector: &mut Vec<IntermediateDocumentTokenForPrinting>,
  available_width: usize,
  consumed: usize,
  enforce_consumed: bool,
  list: &DocumentList,
) -> bool {
  if enforce_consumed && consumed > available_width {
    return false;
  }
  let (indentation, document, rest) = if let DocumentList::Cons(i, d, r) = list {
    (i, d, r)
  } else {
    return true;
  };
  match document.as_ref() {
    Document::Nil => {
      generate_best_doc(collector, available_width, consumed, enforce_consumed, rest)
    }
    Document::Concat(d1, d2) => generate_best_doc(
      collector,
      available_width,
      consumed,
      enforce_consumed,
      &DocumentList::Cons(
        *indentation,
        d1.clone(),
        Rc::new(DocumentList::Cons(*indentation, d2.clone(), rest.clone())),
      ),
    ),
    Document::Nest(i, d) => generate_best_doc(
      collector,
      available_width,
      consumed,
      enforce_consumed,
      &DocumentList::Cons(indentation + i, d.clone(), rest.clone()),
    ),
    Document::Text(s) => {
      collector.push(IntermediateDocumentTokenForPrinting::Text(s.clone()));
      generate_best_doc(collector, available_width, consumed + s.len(), enforce_consumed, rest)
    }
    Document::Line | Document::LineFlattenToNil | Document::LineHard => {
      collector.push(IntermediateDocumentTokenForPrinting::Line(*indentation));
      generate_best_doc(collector, available_width, *indentation, false, rest)
    }
    Document::Union(d1, d2) => {
      let prev_length = collector.len();
      if generate_best_doc(
        collector,
        available_width,
        consumed,
        true,
        &DocumentList::Cons(*indentation, d1.clone(), rest.clone()),
      ) {
        true
      } else {
        collector.truncate(prev_length);
        generate_best_doc(
          collector,
          available_width,
          consumed,
          enforce_consumed,
          &DocumentList::Cons(*indentation, d2.clone(), rest.clone()),
        )
      }
    }
  }
}

/// This function implements the prettier algorithm described in:
/// https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf
pub(super) fn pretty_print(available_width: usize, document: Document) -> String {
  let mut collector = vec![];
  generate_best_doc(
    &mut collector,
    available_width,
    0,
    false,
    &DocumentList::Cons(0, Rc::new(document), Rc::new(DocumentList::Nil)),
  );

  let mut string_builder = String::new();
  for token in collector {
    match token {
      IntermediateDocumentTokenForPrinting::Text(s) => {
        string_builder.push_str(&s);
      }
      IntermediateDocumentTokenForPrinting::Line(indentation) => {
        string_builder.push('\n');
        for _ in 0..indentation {
          string_builder.push(' ');
        }
      }
    }
  }

  let mut post_processed =
    string_builder.split('\n').into_iter().map(|line| line.trim_end()).join("\n");
  post_processed.push('\n');
  post_processed
}

#[cfg(test)]
mod tests {
  use super::{pretty_print, Document};
  use crate::common::rcs;
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use std::rc::Rc;

  #[test]
  fn concat_tests() {
    assert!(
      !format!("{:?}", Document::Nest(0, Rc::new(Document::Nil)).as_nest().unwrap().1).is_empty()
    );
    assert_eq!(Document::Nil, Document::concat(vec![]));
    assert_eq!(Document::Text(rcs("a")), Document::concat(vec![Document::Text(rcs("a"))]));
    assert_eq!(
      Document::Concat(Rc::new(Document::Text(rcs("a"))), Rc::new(Document::Text(rcs("b")))),
      Document::concat(vec![Document::Text(rcs("a")), Document::Text(rcs("b"))])
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
        Document::Text(rcs("a")),
        Document::Line,
        Document::Nest(
          2,
          Rc::new(Document::concat(vec![
            Document::Text(rcs("c")),
            Document::LineHard,
            Document::Text(rcs("d")),
          ])),
        ),
        Document::Line,
        Document::Text(rcs("b")),
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
    assert_printed(
      100,
      Document::spaced_bracket(rcs("["), Document::Text(rcs("a")), rcs("]")),
      "[ a ]\n",
    );
  }

  struct Tree {
    name: &'static str,
    children: Vec<Rc<Tree>>,
  }

  fn show_tree(tree: &Tree, nil_line: bool) -> Document {
    Document::Concat(
      Rc::new(Document::Text(rcs(tree.name))),
      Rc::new(show_bracket(tree.children.clone(), nil_line)),
    )
  }

  fn show_bracket(trees: Vec<Rc<Tree>>, nil_line: bool) -> Document {
    if trees.is_empty() {
      Document::Nil
    } else {
      Document::concat(vec![Document::no_space_bracket(
        rcs("["),
        show_trees(trees, nil_line),
        rcs("]"),
      )])
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
        Document::Text(rcs(",")),
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
            Rc::new(Tree { name: "ccc", children: vec![] }),
            Rc::new(Tree { name: "dd", children: vec![] }),
          ],
        }),
        Rc::new(Tree { name: "eee", children: vec![] }),
        Rc::new(Tree {
          name: "ffff",
          children: vec![
            Rc::new(Tree { name: "gg", children: vec![] }),
            Rc::new(Tree { name: "hhh", children: vec![] }),
            Rc::new(Tree { name: "ii", children: vec![] }),
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
