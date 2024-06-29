use super::prettier::Document;
use itertools::Itertools;
use samlang_ast::source::{
  annotation, expr, pattern, ClassDefinition, ClassMemberDeclaration, CommentKind,
  CommentReference, CommentStore, ExtendsOrImplementsNodes, Id, InterfaceDeclaration, Literal,
  Module, Toplevel, TypeDefinition, NO_COMMENT_REFERENCE,
};
use samlang_heap::{Heap, ModuleReference, PStr};
use std::{collections::HashMap, rc::Rc};

fn text_pstr(heap: &Heap, s: PStr) -> Document {
  Document::non_static_str(String::from(s.as_str(heap)))
}

fn parenthesis_surrounded_doc(doc: Document) -> Document {
  Document::no_space_bracket("(", doc, ")")
}

fn braces_surrounded_doc(doc: Document) -> Document {
  Document::spaced_bracket("{", doc, "}")
}

fn angle_bracket_surrounded_doc(doc: Document) -> Document {
  Document::no_space_bracket("<", doc, ">")
}

enum DocumentGrouping {
  Flattened,
  Expanded,
  Grouped,
}

fn associated_comments_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  associated_comments: Vec<CommentReference>,
  group: DocumentGrouping,
  add_final_line_break: bool,
) -> Option<Document> {
  let mut documents = vec![];
  for associated_comments in associated_comments {
    for comment in comment_store.get(associated_comments).iter() {
      documents.append(&mut match comment.kind {
        CommentKind::LINE => {
          vec![Document::line_comment(comment.text.as_str(heap)), Document::LineHard]
        }
        CommentKind::BLOCK => {
          vec![Document::multiline_comment("/*", comment.text.as_str(heap)), Document::Line]
        }
        CommentKind::DOC => {
          vec![Document::multiline_comment("/**", comment.text.as_str(heap)), Document::Line]
        }
      });
    }
  }
  if documents.is_empty() {
    None
  } else {
    let final_line_break_is_soft = documents.last().unwrap().eq(&Document::Line);
    if final_line_break_is_soft {
      documents.pop();
    }
    let mut final_main_doc = Document::concat(documents);
    match group {
      DocumentGrouping::Flattened => {
        if let Some(d) = final_main_doc.flatten() {
          final_main_doc = d;
        }
      }
      DocumentGrouping::Expanded => {}
      DocumentGrouping::Grouped => final_main_doc = Document::group(final_main_doc),
    }
    Some(if add_final_line_break && final_line_break_is_soft {
      Document::Concat(Rc::new(final_main_doc), Rc::new(Document::Line))
    } else {
      final_main_doc
    })
  }
}

fn create_opt_preceding_comment_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  associated_comments: CommentReference,
  main_doc: Document,
) -> Document {
  if let Some(comment_doc) = associated_comments_doc(
    heap,
    comment_store,
    vec![associated_comments],
    DocumentGrouping::Grouped,
    true,
  ) {
    Document::group(Document::Concat(Rc::new(comment_doc), Rc::new(main_doc)))
  } else {
    main_doc
  }
}

fn comma_sep_list<E, F: Fn(&E) -> Document>(
  heap: &Heap,
  comment_store: &CommentStore,
  elements: &[E],
  ending_comments: CommentReference,
  doc_creator: F,
) -> Document {
  let comment_doc_opt = associated_comments_doc(
    heap,
    comment_store,
    vec![ending_comments],
    DocumentGrouping::Expanded,
    false,
  );
  let mut iter = elements.iter().rev();
  let base = if let Some(last) = iter.next() {
    let mut base = doc_creator(last);
    for e in iter {
      base = Document::concat(vec![doc_creator(e), Document::Text(","), Document::Line, base]);
    }
    base
  } else {
    Document::Nil
  };
  if let Some(comment_doc) = comment_doc_opt {
    if matches!(base, Document::Nil) {
      comment_doc
    } else {
      Document::concat(vec![base, Document::Text(","), Document::Line, comment_doc])
    }
  } else {
    base
  }
}

pub(super) fn annotation_to_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  annotation: &annotation::T,
) -> Document {
  match annotation {
    annotation::T::Primitive(_, comments, kind) => create_opt_preceding_comment_doc(
      heap,
      comment_store,
      *comments,
      Document::Text(kind.kind_str()),
    ),
    annotation::T::Id(annot) => id_annot_to_doc(heap, comment_store, annot),
    annotation::T::Generic(_, id) => create_opt_preceding_comment_doc(
      heap,
      comment_store,
      id.associated_comments,
      text_pstr(heap, id.name),
    ),
    annotation::T::Fn(annotation::Function {
      location: _,
      associated_comments,
      parameters,
      return_type,
    }) => create_opt_preceding_comment_doc(
      heap,
      comment_store,
      *associated_comments,
      Document::concat(vec![
        parenthesis_surrounded_doc(comma_sep_list(
          heap,
          comment_store,
          &parameters.annotations,
          parameters.ending_associated_comments,
          |annot| annotation_to_doc(heap, comment_store, annot),
        )),
        Document::Text(" -> "),
        annotation_to_doc(heap, comment_store, return_type),
      ]),
    ),
  }
}

fn optional_targs(
  heap: &Heap,
  comment_store: &CommentStore,
  type_arguments: Option<&annotation::TypeArguments>,
) -> Document {
  if let Some(targs) = type_arguments {
    create_opt_preceding_comment_doc(
      heap,
      comment_store,
      targs.start_associated_comments,
      angle_bracket_surrounded_doc(comma_sep_list(
        heap,
        comment_store,
        &targs.arguments,
        targs.ending_associated_comments,
        |annot| annotation_to_doc(heap, comment_store, annot),
      )),
    )
  } else {
    Document::Nil
  }
}

fn id_annot_to_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  annotation::Id { location: _, module_reference: _, id, type_arguments }: &annotation::Id,
) -> Document {
  create_opt_preceding_comment_doc(
    heap,
    comment_store,
    id.associated_comments,
    Document::Concat(
      Rc::new(text_pstr(heap, id.name)),
      Rc::new(optional_targs(heap, comment_store, type_arguments.as_ref())),
    ),
  )
}

fn create_doc_for_subexpression_considering_precedence_level(
  heap: &Heap,
  comment_store: &CommentStore,
  expression: &expr::E<()>,
  sub_expression: &expr::E<()>,
  equal_level_parenthesis: bool,
) -> Document {
  let add_parenthesis = if equal_level_parenthesis {
    sub_expression.precedence() >= expression.precedence()
  } else {
    sub_expression.precedence() > expression.precedence()
  };
  if add_parenthesis {
    parenthesis_surrounded_doc(create_doc(heap, comment_store, sub_expression))
  } else {
    create_doc(heap, comment_store, sub_expression)
  }
}

fn create_doc_for_if_else(
  heap: &Heap,
  comment_store: &CommentStore,
  if_else: &expr::IfElse<()>,
) -> Document {
  let expanded = create_doc_for_if_else_customized_flattened(heap, comment_store, true, if_else);
  if let Some(flattened) =
    create_doc_for_if_else_customized_flattened(heap, comment_store, false, if_else).flatten()
  {
    Document::Union(Rc::new(flattened), Rc::new(expanded))
  } else {
    expanded
  }
}

struct FlattenedIfElseChainElement<'a> {
  comments: CommentReference,
  condition: &'a expr::IfElseCondition<()>,
  e1: &'a expr::Block<()>,
}

fn flattened_if_else(
  if_else: &expr::IfElse<()>,
) -> (Vec<FlattenedIfElseChainElement>, &expr::Block<()>) {
  let mut acc = if_else;
  let mut chain = vec![];
  loop {
    match acc.e2.as_ref() {
      expr::IfElseOrBlock::IfElse(nested) => {
        chain.push(FlattenedIfElseChainElement {
          comments: NO_COMMENT_REFERENCE,
          condition: acc.condition.as_ref(),
          e1: acc.e1.as_ref(),
        });
        acc = nested;
      }
      expr::IfElseOrBlock::Block(block) => {
        chain.push(FlattenedIfElseChainElement {
          comments: acc.common.associated_comments,
          condition: acc.condition.as_ref(),
          e1: acc.e1.as_ref(),
        });
        return (chain, block);
      }
    }
  }
}

fn create_doc_for_if_else_condition(
  heap: &Heap,
  comment_store: &CommentStore,
  associated_comments: CommentReference,
  condition: &expr::IfElseCondition<()>,
) -> Document {
  let mut documents = vec![];
  documents.push(create_opt_preceding_comment_doc(
    heap,
    comment_store,
    associated_comments,
    Document::Text("if "),
  ));
  match condition {
    expr::IfElseCondition::Expression(e) => documents.push(create_doc(heap, comment_store, e)),
    expr::IfElseCondition::Guard(p, e) => {
      documents.push(Document::Text("let "));
      documents.push(matching_pattern_to_document(heap, comment_store, p));
      documents.push(Document::Text(" = "));
      documents.push(create_doc(heap, comment_store, e));
    }
  };
  documents.push(Document::Text(" "));
  Document::concat(documents)
}

fn create_doc_for_if_else_customized_flattened(
  heap: &Heap,
  comment_store: &CommentStore,
  force_expanded: bool,
  if_else: &expr::IfElse<()>,
) -> Document {
  let (chain, final_else) = flattened_if_else(if_else);
  let mut documents = vec![];
  for (i, FlattenedIfElseChainElement { comments, condition, e1 }) in chain.into_iter().enumerate()
  {
    documents.push(create_doc_for_if_else_condition(
      heap,
      comment_store,
      if i == 0 { NO_COMMENT_REFERENCE } else { comments },
      condition,
    ));
    documents.push(create_doc_for_block(heap, comment_store, force_expanded, e1));
    documents.push(Document::Text(" else "));
  }
  documents.push(create_doc_for_block(heap, comment_store, force_expanded, final_else));
  Document::concat(documents)
}

fn create_doc_for_dotted_chain(
  heap: &Heap,
  comment_store: &CommentStore,
  (base, chain): (Document, Vec<(CommentReference, Vec<Document>)>),
) -> Document {
  let mut expanded = Document::concat(vec![
    base.clone(),
    Document::Nest(
      2,
      Rc::new(Document::concat(
        chain
          .iter()
          .cloned()
          .flat_map(|(c, d)| {
            vec![
              create_member_preceding_comment_docs(heap, comment_store, false, c),
              Document::Text("."),
            ]
            .into_iter()
            .chain(d)
          })
          .collect(),
      )),
    ),
  ]);
  if let Some(((first_c, first_d), chain)) = chain.split_first() {
    let less_expanded = Document::concat(vec![
      base.clone(),
      create_member_preceding_comment_docs(heap, comment_store, true, *first_c),
      Document::Text("."),
      Document::concat(first_d.clone()),
      Document::Nest(
        2,
        Rc::new(Document::concat(
          chain
            .iter()
            .cloned()
            .flat_map(|(c, d)| {
              vec![
                create_member_preceding_comment_docs(heap, comment_store, false, c),
                Document::Text("."),
              ]
              .into_iter()
              .chain(d)
            })
            .collect(),
        )),
      ),
    ]);
    expanded = Document::Union(Rc::new(less_expanded), Rc::new(expanded))
  }

  let flattened = Document::concat(
    vec![base]
      .into_iter()
      .chain(chain.into_iter().flat_map(|(c, d)| {
        vec![
          create_member_preceding_comment_docs(heap, comment_store, true, c),
          Document::Text("."),
        ]
        .into_iter()
        .chain(d)
      }))
      .collect(),
  );
  if let Some(flattened) = flattened.flatten() {
    Document::Union(Rc::new(flattened), Rc::new(expanded))
  } else {
    expanded
  }
}

fn create_member_preceding_comment_docs(
  heap: &Heap,
  comment_store: &CommentStore,
  flattened: bool,
  comments: CommentReference,
) -> Document {
  if let Some(doc) = associated_comments_doc(
    heap,
    comment_store,
    vec![comments],
    if flattened { DocumentGrouping::Flattened } else { DocumentGrouping::Expanded },
    !flattened,
  ) {
    if flattened {
      Document::Concat(Rc::new(Document::Text(" ")), Rc::new(doc))
    } else {
      Document::Concat(Rc::new(Document::LineHard), Rc::new(doc))
    }
  } else if flattened {
    Document::Nil
  } else {
    Document::LineHard
  }
}

fn create_chainable_ir_docs(
  heap: &Heap,
  comment_store: &CommentStore,
  expression: &expr::E<()>,
  potential_chainable_expr: &expr::E<()>,
) -> (Document, Vec<(CommentReference, Vec<Document>)>) {
  match potential_chainable_expr {
    expr::E::FieldAccess(e) => {
      let (base, mut chain) =
        create_chainable_ir_docs(heap, comment_store, potential_chainable_expr, &e.object);
      chain.push((
        e.field_name.associated_comments,
        vec![
          (text_pstr(heap, e.field_name.name)),
          optional_targs(heap, comment_store, e.explicit_type_arguments.as_ref()),
        ],
      ));
      (base, chain)
    }
    expr::E::MethodAccess(e) => {
      let (base, mut chain) =
        create_chainable_ir_docs(heap, comment_store, potential_chainable_expr, &e.object);
      chain.push((
        e.method_name.associated_comments,
        vec![
          (text_pstr(heap, e.method_name.name)),
          optional_targs(heap, comment_store, e.explicit_type_arguments.as_ref()),
        ],
      ));
      (base, chain)
    }
    expr::E::Call(e) => {
      let args_doc =
        create_doc_for_parenthesized_expression_list(heap, comment_store, &e.arguments);
      let (mut base, mut chain) =
        create_chainable_ir_docs(heap, comment_store, expression, &e.callee);
      if let Some((_, last_docs)) = chain.last_mut() {
        last_docs.push(args_doc);
      } else {
        base = Document::Concat(Rc::new(base), Rc::new(args_doc));
      }
      (base, chain)
    }
    _ => (
      create_doc_for_subexpression_considering_precedence_level(
        heap,
        comment_store,
        expression,
        potential_chainable_expr,
        false,
      ),
      vec![],
    ),
  }
}

fn create_doc_for_parenthesized_expression_list(
  heap: &Heap,
  comment_store: &CommentStore,
  expr::ParenthesizedExpressionList {
    loc: _,
    start_associated_comments,
    ending_associated_comments,
    expressions,
  }: &expr::ParenthesizedExpressionList<()>,
) -> Document {
  create_opt_preceding_comment_doc(
    heap,
    comment_store,
    *start_associated_comments,
    parenthesis_surrounded_doc(comma_sep_list(
      heap,
      comment_store,
      expressions,
      *ending_associated_comments,
      |e| create_doc(heap, comment_store, e),
    )),
  )
}

fn create_doc_for_block(
  heap: &Heap,
  comment_store: &CommentStore,
  force_expanded: bool,
  block: &expr::Block<()>,
) -> Document {
  let mut segments = vec![];
  for stmt in &block.statements {
    segments.push(statement_to_document(heap, comment_store, stmt));
    segments.push(Document::LineHard);
  }
  if let Some(comments) = associated_comments_doc(
    heap,
    comment_store,
    vec![block.ending_associated_comments],
    DocumentGrouping::Expanded,
    false,
  ) {
    segments.push(comments);
    segments.push(Document::LineHard);
  }
  let final_expr_doc = block.expression.as_ref().map(|e| create_doc(heap, comment_store, e));
  if segments.is_empty() {
    if force_expanded {
      Document::concat(vec![
        Document::Text("{"),
        Document::Nest(
          2,
          Rc::new(Document::concat(vec![
            Document::LineHard,
            final_expr_doc.unwrap_or(Document::Nil),
          ])),
        ),
        Document::Line,
        Document::Text("}"),
      ])
    } else {
      braces_surrounded_doc(final_expr_doc.unwrap_or(Document::Nil))
    }
  } else {
    if let Some(d) = final_expr_doc {
      segments.push(d);
    } else {
      segments.pop();
    }
    Document::concat(vec![
      Document::Text("{"),
      Document::Nest(
        2,
        Rc::new(Document::concat(
          vec![if force_expanded { Document::LineHard } else { Document::Line }]
            .into_iter()
            .chain(segments)
            .collect(),
        )),
      ),
      if force_expanded { Document::LineHard } else { Document::Line },
      Document::Text("}"),
    ])
  }
}

fn create_doc_without_preceding_comment(
  heap: &Heap,
  comment_store: &CommentStore,
  expression: &expr::E<()>,
) -> Document {
  match expression {
    expr::E::Literal(_, Literal::Bool(false)) => Document::Text("false"),
    expr::E::Literal(_, Literal::Bool(true)) => Document::Text("true"),
    expr::E::Literal(_, Literal::Int(i)) => Document::non_static_str(i.to_string()),
    expr::E::Literal(_, Literal::String(s)) => {
      Document::concat(vec![Document::Text("\""), text_pstr(heap, *s), Document::Text("\"")])
    }
    expr::E::LocalId(_, id) | expr::E::ClassId(_, _, id) => text_pstr(heap, id.name),
    expr::E::Tuple(_, e) => create_doc_for_parenthesized_expression_list(heap, comment_store, e),
    expr::E::FieldAccess(_) | expr::E::MethodAccess(_) | expr::E::Call(_) => {
      create_doc_for_dotted_chain(
        heap,
        comment_store,
        create_chainable_ir_docs(heap, comment_store, expression, expression),
      )
    }
    expr::E::Unary(e) => Document::Concat(
      Rc::new(Document::Text(e.operator.kind_str())),
      Rc::new(create_doc_for_subexpression_considering_precedence_level(
        heap,
        comment_store,
        expression,
        &e.argument,
        false,
      )),
    ),
    expr::E::IfElse(e) => create_doc_for_if_else(heap, comment_store, e),

    expr::E::Binary(e) => {
      let operator_preceding_comments_docs = if let Some(doc) = associated_comments_doc(
        heap,
        comment_store,
        vec![e.operator_preceding_comments],
        DocumentGrouping::Grouped,
        false,
      ) {
        Document::group(Document::Concat(Rc::new(Document::Line), Rc::new(doc)))
      } else {
        Document::Nil
      };
      let operator_doc = Document::concat(vec![
        Document::Text(" "),
        Document::Text(e.operator.kind_str()),
        Document::Text(" "),
      ]);
      if e.e1.precedence() == expression.precedence() {
        // Since we are doing left to right evaluation, this is safe.
        return Document::concat(vec![
          create_doc(heap, comment_store, &e.e1),
          operator_preceding_comments_docs,
          operator_doc,
          create_doc_for_subexpression_considering_precedence_level(
            heap,
            comment_store,
            expression,
            &e.e2,
            true,
          ),
        ]);
      }
      if e.e2.precedence() == expression.precedence() {
        // For the commutative operators, we can remove parentheses.
        match e.operator {
          expr::BinaryOperator::MINUS | expr::BinaryOperator::DIV | expr::BinaryOperator::MOD => {}
          _ => {
            return Document::concat(vec![
              create_doc_for_subexpression_considering_precedence_level(
                heap,
                comment_store,
                expression,
                &e.e1,
                true,
              ),
              operator_preceding_comments_docs,
              operator_doc,
              create_doc(heap, comment_store, &e.e2),
            ]);
          }
        }
      }
      // Safest rule
      Document::concat(vec![
        create_doc_for_subexpression_considering_precedence_level(
          heap,
          comment_store,
          expression,
          &e.e1,
          true,
        ),
        operator_preceding_comments_docs,
        operator_doc,
        create_doc_for_subexpression_considering_precedence_level(
          heap,
          comment_store,
          expression,
          &e.e2,
          true,
        ),
      ])
    }

    expr::E::Match(e) => {
      let mut list = vec![];
      for case in &e.cases {
        list.push(matching_pattern_to_document(heap, comment_store, &case.pattern));
        list.push(Document::Text(" -> "));
        list.push(create_doc(heap, comment_store, &case.body));
        list.push(create_opt_preceding_comment_doc(
          heap,
          comment_store,
          case.ending_associated_comments,
          Document::Text(","),
        ));
        list.push(Document::Line);
      }
      list.pop();

      Document::concat(vec![
        Document::Text("match "),
        create_doc(heap, comment_store, &e.matched),
        Document::Text(" "),
        Document::bracket_flexible("{", Document::LineHard, Document::concat(list), "}"),
      ])
    }

    expr::E::Lambda(e) => Document::concat(vec![
      parenthesis_surrounded_doc(comma_sep_list(
        heap,
        comment_store,
        &e.parameters.parameters,
        e.parameters.ending_associated_comments,
        |id| {
          create_opt_preceding_comment_doc(
            heap,
            comment_store,
            id.name.associated_comments,
            if let Some(annot) = &id.annotation {
              Document::concat(vec![
                text_pstr(heap, id.name.name),
                Document::Text(": "),
                annotation_to_doc(heap, comment_store, annot),
              ])
            } else {
              text_pstr(heap, id.name.name)
            },
          )
        },
      )),
      Document::Text(" -> "),
      create_doc_for_subexpression_considering_precedence_level(
        heap,
        comment_store,
        expression,
        &e.body,
        false,
      ),
    ]),

    expr::E::Block(e) => create_doc_for_block(heap, comment_store, false, e),
  }
}

fn create_doc(heap: &Heap, comment_store: &CommentStore, expression: &expr::E<()>) -> Document {
  let main_doc = create_doc_without_preceding_comment(heap, comment_store, expression);
  create_opt_preceding_comment_doc(
    heap,
    comment_store,
    expression.common().associated_comments,
    main_doc,
  )
}

fn tuple_pattern_to_document(
  heap: &Heap,
  comment_store: &CommentStore,
  pattern::TuplePattern {
    location: _,
    start_associated_comments,
    ending_associated_comments,
    elements,
  }: &pattern::TuplePattern<()>,
) -> Document {
  create_opt_preceding_comment_doc(
    heap,
    comment_store,
    *start_associated_comments,
    parenthesis_surrounded_doc(comma_sep_list(
      heap,
      comment_store,
      elements,
      *ending_associated_comments,
      |it| matching_pattern_to_document(heap, comment_store, &it.pattern),
    )),
  )
}

fn matching_pattern_to_document(
  heap: &Heap,
  comment_store: &CommentStore,
  pattern: &pattern::MatchingPattern<()>,
) -> Document {
  match pattern {
    pattern::MatchingPattern::Tuple(p) => tuple_pattern_to_document(heap, comment_store, p),
    pattern::MatchingPattern::Object {
      location: _,
      start_associated_comments,
      ending_associated_comments,
      elements,
    } => create_opt_preceding_comment_doc(
      heap,
      comment_store,
      *start_associated_comments,
      braces_surrounded_doc(comma_sep_list(
        heap,
        comment_store,
        elements,
        *ending_associated_comments,
        |it| {
          if it.shorthand {
            text_pstr(heap, it.field_name.name)
          } else {
            Document::concat(vec![
              (text_pstr(heap, it.field_name.name)),
              Document::Text(" as "),
              matching_pattern_to_document(heap, comment_store, &it.pattern),
            ])
          }
        },
      )),
    ),
    pattern::MatchingPattern::Variant(pattern::VariantPattern {
      loc: _,
      tag_order: _,
      tag,
      data_variables,
      type_: (),
    }) => {
      if let Some(p) = data_variables {
        Document::concat(vec![
          create_opt_preceding_comment_doc(
            heap,
            comment_store,
            tag.associated_comments,
            text_pstr(heap, tag.name),
          ),
          tuple_pattern_to_document(heap, comment_store, p),
        ])
      } else {
        create_opt_preceding_comment_doc(
          heap,
          comment_store,
          tag.associated_comments,
          text_pstr(heap, tag.name),
        )
      }
    }
    pattern::MatchingPattern::Id(id, _) => create_opt_preceding_comment_doc(
      heap,
      comment_store,
      id.associated_comments,
      text_pstr(heap, id.name),
    ),
    pattern::MatchingPattern::Wildcard { location: _, associated_comments } => {
      create_opt_preceding_comment_doc(
        heap,
        comment_store,
        *associated_comments,
        Document::Text("_"),
      )
    }
  }
}

pub(super) fn statement_to_document(
  heap: &Heap,
  comment_store: &CommentStore,
  stmt: &expr::DeclarationStatement<()>,
) -> Document {
  let mut segments = vec![];
  let pattern_doc = matching_pattern_to_document(heap, comment_store, &stmt.pattern);
  segments.push(
    associated_comments_doc(
      heap,
      comment_store,
      vec![stmt.associated_comments],
      DocumentGrouping::Grouped,
      true,
    )
    .unwrap_or(Document::Nil),
  );
  segments.push(Document::Text("let "));
  segments.push(pattern_doc);
  segments.push(if let Some(annot) = &stmt.annotation {
    Document::Concat(
      Rc::new(Document::Text(": ")),
      Rc::new(annotation_to_doc(heap, comment_store, annot)),
    )
  } else {
    Document::Nil
  });
  segments.push(Document::Text(" = "));
  segments.push(create_doc(heap, comment_store, &stmt.assigned_expression));
  segments.push(Document::Text(";"));
  Document::concat(segments)
}

fn type_parameters_to_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  extra_space: bool,
  tparams_opt: Option<&annotation::TypeParameters>,
) -> Document {
  if let Some(tparams) = tparams_opt {
    let doc = angle_bracket_surrounded_doc(comma_sep_list(
      heap,
      comment_store,
      &tparams.parameters,
      NO_COMMENT_REFERENCE,
      |tparam| {
        create_opt_preceding_comment_doc(
          heap,
          comment_store,
          tparam.name.associated_comments,
          if let Some(b) = &tparam.bound {
            Document::concat(vec![
              text_pstr(heap, tparam.name.name),
              Document::Text(": "),
              id_annot_to_doc(heap, comment_store, b),
            ])
          } else {
            text_pstr(heap, tparam.name.name)
          },
        )
      },
    ));
    if extra_space {
      Document::Concat(Rc::new(doc), Rc::new(Document::Text(" ")))
    } else {
      doc
    }
  } else {
    Document::Nil
  }
}

pub(super) fn expression_to_document(
  heap: &Heap,
  comment_store: &CommentStore,
  expression: &expr::E<()>,
) -> Document {
  create_doc(heap, comment_store, expression)
}

fn create_doc_for_interface_member(
  heap: &Heap,
  comment_store: &CommentStore,
  member: &ClassMemberDeclaration,
  body: Option<&expr::E<()>>,
) -> Vec<Document> {
  let body_doc =
    body.map(|e| expression_to_document(heap, comment_store, e)).unwrap_or(Document::Nil);

  // Special case for statement block as body for prettier result.
  // We want to lift the leading `{` to the same line as `=`.
  let body_doc_with_potential_indentation = match body_doc {
    Document::Concat(d1, d2) if matches!(d1.as_ref(), Document::Text(s) if (*s).eq("{")) => {
      Document::Concat(Rc::new(Document::Text(" {")), d2)
    }
    _ => Document::group(Document::Nest(
      2,
      Rc::new(Document::Concat(Rc::new(Document::Line), Rc::new(body_doc))),
    )),
  };

  vec![
    associated_comments_doc(
      heap,
      comment_store,
      vec![member.associated_comments],
      DocumentGrouping::Grouped,
      true,
    )
    .unwrap_or(Document::Nil),
    if member.is_public { Document::Nil } else { Document::Text("private ") },
    Document::Text(if member.is_method { "method " } else { "function " }),
    type_parameters_to_doc(heap, comment_store, true, member.type_parameters.as_ref()),
    (text_pstr(heap, member.name.name)),
    create_opt_preceding_comment_doc(
      heap,
      comment_store,
      member.parameters.start_associated_comments,
      parenthesis_surrounded_doc(comma_sep_list(
        heap,
        comment_store,
        &member.parameters.parameters,
        member.parameters.ending_associated_comments,
        |param| {
          create_opt_preceding_comment_doc(
            heap,
            comment_store,
            param.name.associated_comments,
            Document::concat(vec![
              (text_pstr(heap, param.name.name)),
              Document::Text(": "),
              annotation_to_doc(heap, comment_store, &param.annotation),
            ]),
          )
        },
      )),
    ),
    Document::Text(": "),
    annotation_to_doc(heap, comment_store, &member.return_type),
    if body.is_none() { Document::Nil } else { Document::Text(" =") },
    body_doc_with_potential_indentation,
  ]
}

fn extends_or_implements_node_to_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  nodes: Option<&ExtendsOrImplementsNodes>,
) -> Document {
  if let Some(nodes) = nodes {
    let mut expanded_ids = vec![Document::Line];
    for id in &nodes.nodes {
      expanded_ids.push(id_annot_to_doc(heap, comment_store, id));
      expanded_ids.push(Document::Text(","));
      expanded_ids.push(Document::Line);
    }
    expanded_ids.pop();
    expanded_ids.pop();
    let expanded = Document::Concat(
      Rc::new(Document::Text(" :")),
      Rc::new(Document::Nest(2, Rc::new(Document::concat(expanded_ids)))),
    );
    create_opt_preceding_comment_doc(
      heap,
      comment_store,
      nodes.associated_comments,
      Document::group(expanded),
    )
  } else {
    Document::Nil
  }
}

fn interface_to_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  interface: &InterfaceDeclaration,
) -> Vec<Document> {
  let mut documents = vec![
    associated_comments_doc(
      heap,
      comment_store,
      vec![interface.associated_comments],
      DocumentGrouping::Grouped,
      true,
    )
    .unwrap_or(Document::Nil),
    Document::Text(if interface.private { "private interface " } else { "interface " }),
    (text_pstr(heap, interface.name.name)),
    type_parameters_to_doc(heap, comment_store, false, interface.type_parameters.as_ref()),
    extends_or_implements_node_to_doc(
      heap,
      comment_store,
      interface.extends_or_implements_nodes.as_ref(),
    ),
  ];

  documents.push(Document::Text(" {"));
  for member in &interface.members.members {
    documents.push(Document::Nest(
      2,
      Rc::new(Document::concat(
        vec![Document::Line]
          .into_iter()
          .chain(create_doc_for_interface_member(heap, comment_store, member, None))
          .collect(),
      )),
    ));
    documents.push(Document::Line);
  }
  if let Some(comments) = associated_comments_doc(
    heap,
    comment_store,
    vec![interface.members.ending_associated_comments],
    DocumentGrouping::Expanded,
    true,
  ) {
    documents.push(Document::Nest(2, Rc::new(Document::concat(vec![Document::Line, comments]))));
    documents.push(Document::Line);
  };
  documents.push(Document::Text("}"));

  documents
}

fn class_to_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  class: &ClassDefinition<()>,
) -> Vec<Document> {
  let mut documents = vec![
    associated_comments_doc(
      heap,
      comment_store,
      vec![class.associated_comments],
      DocumentGrouping::Grouped,
      true,
    )
    .unwrap_or(Document::Nil),
    Document::Text(if class.private { "private class " } else { "class " }),
    text_pstr(heap, class.name.name),
    type_parameters_to_doc(heap, comment_store, false, class.type_parameters.as_ref()),
    match class.type_definition.as_ref() {
      None => Document::Nil,
      Some(TypeDefinition::Struct {
        loc: _,
        start_associated_comments,
        ending_associated_comments,
        fields,
      }) => create_opt_preceding_comment_doc(
        heap,
        comment_store,
        *start_associated_comments,
        parenthesis_surrounded_doc(comma_sep_list(
          heap,
          comment_store,
          fields,
          *ending_associated_comments,
          |field| {
            Document::concat(vec![
              Document::Text(if field.is_public { "val " } else { "private val " }),
              text_pstr(heap, field.name.name),
              Document::Text(": "),
              annotation_to_doc(heap, comment_store, &field.annotation),
            ])
          },
        )),
      ),
      Some(TypeDefinition::Enum {
        loc: _,
        start_associated_comments,
        ending_associated_comments,
        variants,
      }) => create_opt_preceding_comment_doc(
        heap,
        comment_store,
        *start_associated_comments,
        parenthesis_surrounded_doc(comma_sep_list(
          heap,
          comment_store,
          variants,
          *ending_associated_comments,
          |variant| {
            if let Some(annotations) = &variant.associated_data_types {
              Document::concat(vec![
                (text_pstr(heap, variant.name.name)),
                create_opt_preceding_comment_doc(
                  heap,
                  comment_store,
                  annotations.start_associated_comments,
                  parenthesis_surrounded_doc(comma_sep_list(
                    heap,
                    comment_store,
                    &annotations.annotations,
                    annotations.ending_associated_comments,
                    |annot| annotation_to_doc(heap, comment_store, annot),
                  )),
                ),
              ])
            } else {
              text_pstr(heap, variant.name.name)
            }
          },
        )),
      ),
    },
    extends_or_implements_node_to_doc(
      heap,
      comment_store,
      class.extends_or_implements_nodes.as_ref(),
    ),
  ];

  documents.push(Document::Text(" {"));
  for member in &class.members.members {
    documents.push(Document::Nest(
      2,
      Rc::new(Document::concat(
        vec![Document::Line]
          .into_iter()
          .chain(create_doc_for_interface_member(
            heap,
            comment_store,
            &member.decl,
            Some(&member.body),
          ))
          .collect(),
      )),
    ));
    documents.push(Document::Line);
  }
  if let Some(comments) = associated_comments_doc(
    heap,
    comment_store,
    vec![class.members.ending_associated_comments],
    DocumentGrouping::Expanded,
    true,
  ) {
    documents.push(Document::Nest(2, Rc::new(Document::concat(vec![Document::Line, comments]))));
    documents.push(Document::Line);
  };
  documents.push(Document::Text("}"));

  documents
}

pub(super) fn import_to_document(
  heap: &Heap,
  comment_store: &CommentStore,
  associated_comments: Vec<CommentReference>,
  imported_module: ModuleReference,
  imported_members: &[Id],
) -> Document {
  let mut documents = vec![];
  if let Some(comments) = associated_comments_doc(
    heap,
    comment_store,
    associated_comments,
    DocumentGrouping::Expanded,
    true,
  ) {
    documents.push(comments);
  }
  documents.push(Document::Text("import "));
  documents.push(braces_surrounded_doc(comma_sep_list(
    heap,
    comment_store,
    imported_members,
    NO_COMMENT_REFERENCE,
    |m| text_pstr(heap, m.name),
  )));
  documents.push(Document::Text(" from "));
  documents.push(Document::non_static_str(imported_module.pretty_print(heap)));
  documents.push(Document::Text(";"));
  documents.push(Document::LineHard);
  Document::concat(documents)
}

pub(super) fn toplevel_to_document(
  heap: &Heap,
  comment_store: &CommentStore,
  toplevel: &Toplevel<()>,
) -> Document {
  Document::concat(match toplevel {
    Toplevel::Interface(interface) => interface_to_doc(heap, comment_store, interface),
    Toplevel::Class(class) => class_to_doc(heap, comment_store, class),
  })
}

pub(super) fn source_module_to_document(heap: &Heap, module: &Module<()>) -> Document {
  let mut documents = vec![];

  let mut organized_imports = HashMap::<ModuleReference, (Vec<CommentReference>, Vec<Id>)>::new();
  for import in &module.imports {
    if let Some((c, m)) = organized_imports.get_mut(&import.imported_module) {
      c.push(import.associated_comments);
      m.append(&mut import.imported_members.clone());
    } else {
      organized_imports.insert(
        import.imported_module,
        (vec![import.associated_comments], import.imported_members.clone()),
      );
    }
  }

  for (imported_module, (associated_comments, imported_members)) in organized_imports
    .into_iter()
    .sorted_by_key(|(mod_ref, _)| mod_ref.pretty_print(heap))
    .map(|(mod_ref, (comments, members))| {
      (
        mod_ref,
        (
          comments,
          members
            .into_iter()
            .sorted_by(|x, y| x.name.as_str(heap).cmp(y.name.as_str(heap)))
            .collect_vec(),
        ),
      )
    })
  {
    documents.push(import_to_document(
      heap,
      &module.comment_store,
      associated_comments,
      imported_module,
      &imported_members,
    ))
  }
  if !module.imports.is_empty() {
    documents.push(Document::LineHard);
  }

  for toplevel in &module.toplevels {
    documents.push(toplevel_to_document(heap, &module.comment_store, toplevel));
    documents.push(Document::LineHard);
    documents.push(Document::LineHard);
  }

  if let Some(comments) = associated_comments_doc(
    heap,
    &module.comment_store,
    vec![module.trailing_comments],
    DocumentGrouping::Expanded,
    true,
  ) {
    documents.push(comments);
  }

  Document::concat(documents)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    prettier, pretty_print_annotation, pretty_print_expression, pretty_print_import,
    pretty_print_source_module, pretty_print_statement, pretty_print_toplevel,
  };
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    source::{expr, test_builder, CommentStore, Id},
    Location,
  };
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, ModuleReference};
  use samlang_parser::{parse_source_expression_from_text, parse_source_module_from_text};

  fn assert_reprint_expr(source: &str, expected: &str) {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let (comment_store, e) =
      parse_source_expression_from_text(source, ModuleReference::DUMMY, &mut heap, &mut error_set);
    assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(&heap));
    assert_eq!(
      expected,
      prettier::pretty_print(40, create_doc(&heap, &comment_store, &e)).trim_end()
    );
  }

  fn assert_reprint_module(source: &str, expected: &str) {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let m =
      parse_source_module_from_text(source, ModuleReference::DUMMY, &mut heap, &mut error_set);
    for n in &m.imports {
      pretty_print_import(&heap, 40, &m.comment_store, n);
    }
    for n in &m.toplevels {
      pretty_print_toplevel(&heap, 40, &m.comment_store, n);
      match n {
        Toplevel::Interface(_) => {}
        Toplevel::Class(c) => {
          for member in &c.members.members {
            for p in member.decl.parameters.parameters.as_ref().iter() {
              pretty_print_annotation(&heap, 40, &m.comment_store, &p.annotation);
            }
            pretty_print_expression(&heap, 40, &m.comment_store, &member.body);
            if let expr::E::Block(expr::Block {
              common: _,
              statements,
              expression: _,
              ending_associated_comments: _,
            }) = &member.body
            {
              for stmt in statements {
                pretty_print_statement(&heap, 40, &m.comment_store, stmt);
              }
            }
          }
        }
      }
    }

    assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(&heap));
    assert_eq!(expected, format!("\n{}", pretty_print_source_module(&heap, 40, &m).trim_end()));
  }

  #[test]
  fn expression_printer_tests() {
    assert_reprint_expr("1", "1");
    assert_reprint_expr("/* dsfsd */ 1", "/* dsfsd */ 1");
    assert_reprint_expr(
      "/** long long long long long long long long long long */ 1",
      r#"/**
 * long long long long long long long
 * long long long
 */
1"#,
    );
    assert_reprint_expr("hi", "hi");
    assert_reprint_expr("this", "this");
    assert_reprint_expr("ClassName.classMember", "ClassName.classMember");
    assert_reprint_expr(
      "ClassName.classMember.classMember.classMember.classMember",
      r#"ClassName.classMember
  .classMember
  .classMember
  .classMember"#,
    );
    assert_reprint_expr("ClassName.classMember<A,B>", "ClassName.classMember<A, B>");
    assert_reprint_expr(
      "/* a */ ClassName./* b */  /* c */ classMember<A,B>",
      r#"/* a */
ClassName /* b */ /* c */.classMember<
  A,
  B
>"#,
    );
    assert_reprint_expr(
      "// foo\n ClassName./* b */  /* c */ classMember<A,B>",
      r#"// foo
ClassName /* b */ /* c */.classMember<
  A,
  B
>"#,
    );
    assert_reprint_expr(
      "/* abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg */ ClassName./* b */  /* c */ classMember<A,B>",
      r#"/*
 * abcdefg abcdefg abcdefg abcdefg
 * abcdefg abcdefg abcdefg abcdefg
 * abcdefg abcdefg
 */
ClassName /* b */ /* c */.classMember<
  A,
  B
>"#,
    );
    assert_reprint_expr("ClassName/* a */.classMember", "ClassName /* a */.classMember");
    assert_reprint_expr("ClassName// a\n.classMember", "ClassName // a\n.classMember");
    assert_reprint_expr("ClassName. /* b */classMember", "ClassName /* b */.classMember");
    assert_reprint_expr(
      "ClassName/* a */. /* b */classMember",
      "ClassName /* a */ /* b */.classMember",
    );

    assert_reprint_expr("Test.VariantName(42)", "Test.VariantName(42)");
    assert_reprint_expr("Test.VariantName<T>(42)", "Test.VariantName<T>(42)");
    assert_reprint_expr(
      "/* a */ Test./* b */ VariantName/* c */ <T>(42)",
      r#"/* a */ Test /* b */.VariantName/* c */
<T>(42)"#,
    );
    assert_reprint_expr("/* a */Obj.VariantName(/* b */42)", "/* a */ Obj.VariantName(/* b */ 42)");
    assert_reprint_expr(
      "V.VariantName(aVariableNameThatIsVeryVeryVeryLong)",
      r#"V.VariantName(
  aVariableNameThatIsVeryVeryVeryLong
)"#,
    );
    assert_reprint_expr(
      "(match foo {None(_)->1}).bar",
      r#"(
  match foo {
    None(_) -> 1,
  }
).bar"#,
    );
    assert_reprint_expr(
      "(match foo {None(_)->{}}).bar",
      r#"(
  match foo {
    None(_) -> {  },
  }
).bar"#,
    );

    assert_reprint_expr("foo.bar", "foo.bar");

    let empty_comment_store = CommentStore::new();
    let mut heap = Heap::new();
    let e = expr::E::MethodAccess(expr::MethodAccess {
      common: expr::ExpressionCommon::dummy(()),
      explicit_type_arguments: None,
      inferred_type_arguments: vec![],
      object: Box::new(expr::E::LocalId(
        expr::ExpressionCommon::dummy(()),
        Id::from(heap.alloc_str_for_test("foo")),
      )),
      method_name: Id::from(heap.alloc_str_for_test("bar")),
    });
    assert_eq!(
      "foo.bar",
      prettier::pretty_print(40, create_doc(&heap, &empty_comment_store, &e)).trim_end()
    );
    let e = expr::E::MethodAccess(expr::MethodAccess {
      common: expr::ExpressionCommon::dummy(()),
      explicit_type_arguments: Some(annotation::TypeArguments {
        location: Location::dummy(),
        start_associated_comments: NO_COMMENT_REFERENCE,
        ending_associated_comments: NO_COMMENT_REFERENCE,
        arguments: vec![test_builder::create().int_annot()],
      }),
      inferred_type_arguments: vec![],
      object: Box::new(expr::E::LocalId(
        expr::ExpressionCommon::dummy(()),
        Id::from(heap.alloc_str_for_test("foo")),
      )),
      method_name: Id::from(heap.alloc_str_for_test("bar")),
    });
    assert_eq!(
      "foo.bar<int>",
      prettier::pretty_print(40, create_doc(&heap, &empty_comment_store, &e)).trim_end()
    );

    assert_reprint_expr("-42", "-42");
    assert_reprint_expr(
      "!(1+aVariableNameThatIsVeryVeryVeryVeryVeryLong)",
      r#"!(
  1 + aVariableNameThatIsVeryVeryVeryVeryVeryLong
)"#,
    );

    assert_reprint_expr("panic(ah)", "panic(ah)");
    assert_reprint_expr("println(ah)", "println(ah)");
    assert_reprint_expr("foo()", "foo()");
    assert_reprint_expr("foo(bar)", "foo(bar)");
    assert_reprint_expr("foo(bar,baz)", "foo(bar, baz)");
    assert_reprint_expr(
      "foo(v1, v2, v3, v4, v5, v6, v7, v8, v9, v10)",
      r#"foo(
  v1,
  v2,
  v3,
  v4,
  v5,
  v6,
  v7,
  v8,
  v9,
  v10
)"#,
    );

    assert_reprint_expr("1 + 1", "1 + 1");
    assert_reprint_expr("/* a */ 1 /* plus */ + /* b */ 1", "/* a */ 1 /* plus */ + /* b */ 1");
    assert_reprint_expr("1 + 1 * 1", "1 + 1 * 1");
    assert_reprint_expr("(1 + 1) * 1", "(1 + 1) * 1");
    assert_reprint_expr("1 - (1 + 1)", "1 - (1 + 1)");
    assert_reprint_expr("1 + (1 + 1)", "1 + 1 + 1");
    assert_reprint_expr("1 + 1 + 1 + 1", "1 + 1 + 1 + 1");
    assert_reprint_expr("1 + 1 + 1 - 1", "1 + 1 + 1 - 1");
    assert_reprint_expr("1 * 1 * 1", "1 * 1 * 1");
    assert_reprint_expr("1 / 1 % 1 * 1", "1 / 1 % 1 * 1");
    assert_reprint_expr("true && false && true", "true && false && true");
    assert_reprint_expr("true || false || true", "true || false || true");
    assert_reprint_expr(r#""dev" :: "meggo" :: "vibez""#, r#""dev" :: "meggo" :: "vibez""#);

    assert_reprint_expr("if (b) {a} else {c}", "if b { a } else { c }");
    assert_reprint_expr(
      r#"
      if (b) {
        // fff
        let _ = println("");
        let _ = println("");
        let _ = println("");
        /* f */
        let _ = println("");
      } else if (b) {
        let _ = println("");
        let _ = println("");
        let _ = println("");
        let _ = println("");
      } else {
        let _ = println("");
        let _ = println("");
        let _ = println("");
        let _ = println("");
      }"#,
      r#"if b {
  // fff
  let _ = println("");
  let _ = println("");
  let _ = println("");
  /* f */
  let _ = println("");
} else if b {
  let _ = println("");
  let _ = println("");
  let _ = println("");
  let _ = println("");
} else {
  let _ = println("");
  let _ = println("");
  let _ = println("");
  let _ = println("");
}"#,
    );

    assert_reprint_expr(
      "match (v) { None(_) -> fooBar, Some(bazBaz) -> bazBaz }",
      r#"match v {
  None(_) -> fooBar,
  Some(bazBaz) -> bazBaz,
}"#,
    );

    assert_reprint_expr("() -> 1", "() -> 1");
    assert_reprint_expr("(a: int) -> 1", "(a: int) -> 1");
    assert_reprint_expr("(a) -> 1", "(a) -> 1");
    assert_reprint_expr("(a, b) -> 1", "(a, b) -> 1");
    assert_reprint_expr("(a: int) -> 1 + 1", "(a: int) -> 1 + 1");
    assert_reprint_expr("(a: (/* foo */) -> int) -> 1 + 1", "(a: (/* foo */) -> int) -> 1 + 1");
    assert_reprint_expr(
      "(a: (int/* foo */) -> int) -> 1 + 1",
      "(a: (int, /* foo */) -> int) -> 1 + 1",
    );
    assert_reprint_expr(
      "(a: (// foo\n) -> int) -> 1 + 1",
      r#"(
  a: (
    // foo
  ) -> int
) -> 1 + 1"#,
    );
    assert_reprint_expr(
      "(a: (int// foo\n) -> int) -> 1 + 1",
      r#"(
  a: (
    int,
    // foo
  ) -> int
) -> 1 + 1"#,
    );
    assert_reprint_expr("(() -> 1)()", "(() -> 1)()");

    assert_reprint_expr("{}", "{  }");
    assert_reprint_expr("{3}", "{ 3 }");
    assert_reprint_expr(
      "{ let _:int=0;let _=0; }",
      r#"{
  let _: int = 0;
  let _ = 0;
}"#,
    );
    assert_reprint_expr(
      "{ let a:int=1; 3 }",
      r#"{
  let a: int = 1;
  3
}"#,
    );
    assert_reprint_expr(
      "{ let {a, b as c}: int = 3; }",
      r#"{
  let { a, b as c }: int = 3;
}"#,
    );

    assert_reprint_expr(
      "{ let (a, _): int = (1, 4); }",
      r#"{
  let (a, _): int = (1, 4);
}"#,
    );
    assert_reprint_expr(
      "{ let (aaaaa,aaaaa,aaaaa,aaaaa,_,aaaaa,aaaaa,aaaaa,aaaaa,_,aaaaa): int = 3; }",
      r#"{
  let (
    aaaaa,
    aaaaa,
    aaaaa,
    aaaaa,
    _,
    aaaaa,
    aaaaa,
    aaaaa,
    aaaaa,
    _,
    aaaaa
  ): int = 3;
}"#,
    );
    assert_reprint_expr(
      "{let_=if let {foo as {bar as (Fizz(baz), Buzz, _), boo}} = true {3} else {bar};}",
      r#"{
  let _ = if let {
    foo as {
      bar as (Fizz(baz), Buzz, _),
      boo
    }
  } = true {
    3
  } else {
    bar
  };
}"#,
    );

    assert_reprint_expr(
      "{ let a: unit = { let b: unit = { let c: unit = { let d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong; }; }; }; }",
      r#"{
  let a: unit = {
    let b: unit = {
      let c: unit = {
        let d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong;
      };
    };
  };
}"#);
    assert_reprint_expr(
      "() -> () -> () -> { let a: unit = { let b: unit = { let c: unit = { let d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong; }; }; }; }",
      r#"() -> () -> () -> {
  let a: unit = {
    let b: unit = {
      let c: unit = {
        let d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong;
      };
    };
  };
}"#);
  }

  #[test]
  fn module_printer_tests() {
    assert_reprint_module("", "\n");

    assert_reprint_module(
      r#"
interface Foo {}
interface Foo2 : Foo {

  // f
}
private interface Bar</* comment*/A: // foo
B> { function baz(): int }
class Empty {}
class Empty2 : Foo {}
class Main { function main(): unit = {} }
"#,
      r#"
interface Foo {}

interface Foo2 : Foo {
  // f
}

private interface Bar<
  /* comment */
  A: // foo
  B
> {
  function baz(): int
}

class Empty {}

class Empty2 : Foo {}

class Main {
  function main(): unit = {  }
}"#,
    );

    assert_reprint_module(
      r#"
import {Foo} from Foo.Baz
// a
import {F1,F2,F3,F4,F5,F6,F7,F8} from Bar.Baz
import {F9,F10} from Bar.Baz

class Option<T>(None, Some(T)): F1,F2,F3,F4,F5,F6,/** fff */ F7, F8, F9,F10 {
  private method <T> matchExample(opt: Option<int>): int =
    match (opt) { None -> 42, Some(a, _) -> a }

  /* not ignored */ /** foo bar a */
  function a(): int = 3

  /** foo bar b */
  function b(): (int,int,int,int,int,int,int,int,int,int,int,int,int,int,int,int,int)->int = {}

  /** foo bar c */
  function c(): Foo<Foo<Foo<Foo<Foo<Foo<Foo<Foo<Foo<Foo<int>>>>>>>>>> = { let a: int = 3; }
}

class Obj(private val d: int, val e: int) {
  /** foo bar */
  function valExample(): unit = {
    let a: int = 1;
    let b: int = 2; /* a */
    // sss
  }

  // f
}

/** short line */
private class A(val a: int) {}

/** some very very very very very very very very very very very very very very very very very very
 * long document string
 */
class Main {}
// f
"#,
      r#"
// a
import {
  F1,
  F10,
  F2,
  F3,
  F4,
  F5,
  F6,
  F7,
  F8,
  F9
} from Bar.Baz;
import { Foo } from Foo.Baz;

class Option<T>(None, Some(T)) :
  F1,
  F2,
  F3,
  F4,
  F5,
  F6,
  /** fff */ F7,
  F8,
  F9,
  F10 {
  private method <T> matchExample(
    opt: Option<int>
  ): int =
    match opt {
      None -> 42,
      Some(a, _) -> a,
    }

  /* not ignored */ /** foo bar a */
  function a(): int = 3

  /** foo bar b */
  function b(): (
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int
  ) -> int = {  }

  /** foo bar c */
  function c(): Foo<
    Foo<
      Foo<
        Foo<
          Foo<
            Foo<Foo<Foo<Foo<Foo<int>>>>>
          >
        >
      >
    >
  > = {
    let a: int = 3;
  }
}

class Obj(
  private val d: int,
  val e: int
) {
  /** foo bar */
  function valExample(): unit = {
    let a: int = 1;
    let b: int = 2;
    /* a */
    // sss
  }

  // f
}

/** short line */
private class A(val a: int) {}

/**
 * some very very very very very very
 * very very very very very very very
 * very very very very very long
 * document string
 */
class Main {}

// f"#,
    );
  }
}
