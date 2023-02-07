use super::prettier::Document;
use crate::{
  ast::source::{
    expr, ClassDefinition, ClassMemberDeclaration, CommentKind, CommentReference, CommentStore, Id,
    InterfaceDeclaration, Module, Toplevel, TypeParameter,
  },
  checker::type_::{ISourceType, IdType, Type},
  common::{rc_pstr, rc_string, rcs, Heap},
  ModuleReference,
};
use itertools::Itertools;
use std::{collections::HashMap, ops::Deref, rc::Rc};

fn comma_sep_list<E, F: Fn(&E) -> Document>(elements: &[E], doc_creator: F) -> Document {
  let mut iter = elements.iter().rev();
  if let Some(last) = iter.next() {
    let mut base = doc_creator(last);
    for e in iter {
      base = Document::concat(vec![doc_creator(e), Document::Text(rcs(",")), Document::Line, base]);
    }
    base
  } else {
    Document::Nil
  }
}

fn parenthesis_surrounded_doc(doc: Document) -> Document {
  Document::no_space_bracket(rcs("("), doc, rcs(")"))
}

fn braces_surrounded_doc(doc: Document) -> Document {
  Document::spaced_bracket(rcs("{"), doc, rcs("}"))
}

fn braces_surrounded_block_doc(docs: Vec<Document>) -> Document {
  Document::concat(vec![
    Document::Text(rcs("{")),
    Document::Nest(
      2,
      Rc::new(Document::concat(vec![Document::Line].into_iter().chain(docs).collect())),
    ),
    Document::Line,
    Document::Text(rcs("}")),
  ])
}

enum DocumentGrouping {
  Flattened,
  Expanded,
  Grouped,
}

fn associated_comments_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  associated_comments: CommentReference,
  group: DocumentGrouping,
  add_final_line_break: bool,
) -> Option<Document> {
  let mut documents = vec![];
  for comment in comment_store.get(associated_comments) {
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

fn optional_targs(heap: &Heap, type_args: &Vec<Rc<Type>>) -> String {
  if type_args.is_empty() {
    "".to_string()
  } else {
    format!("<{}>", type_args.iter().map(|t| t.pretty_print(heap)).join(", "))
  }
}

impl expr::E {
  fn create_doc_for_subexpression_considering_precedence_level(
    &self,
    heap: &Heap,
    comment_store: &CommentStore,
    sub_expression: &expr::E,
    equal_level_parenthesis: bool,
  ) -> Document {
    let add_parenthesis = if equal_level_parenthesis {
      sub_expression.precedence() >= self.precedence()
    } else {
      sub_expression.precedence() > self.precedence()
    };
    if add_parenthesis {
      parenthesis_surrounded_doc(sub_expression.create_doc(heap, comment_store))
    } else {
      sub_expression.create_doc(heap, comment_store)
    }
  }

  fn create_doc_for_if_else(
    &self,
    heap: &Heap,
    comment_store: &CommentStore,
    if_else: &expr::IfElse,
  ) -> Document {
    let expanded =
      self.create_doc_for_if_else_customized_flattened(heap, comment_store, false, if_else);
    if let Some(flattened) =
      self.create_doc_for_if_else_customized_flattened(heap, comment_store, true, if_else).flatten()
    {
      Document::Union(Rc::new(flattened), Rc::new(expanded))
    } else {
      expanded
    }
  }

  fn create_doc_for_if_else_customized_flattened(
    &self,
    heap: &Heap,
    comment_store: &CommentStore,
    flattened: bool,
    if_else: &expr::IfElse,
  ) -> Document {
    let mut documents = vec![];
    self.add_if_else_first_half_docs(heap, comment_store, flattened, if_else, &mut documents);
    let mut base: &expr::E = &if_else.e2;
    loop {
      if let expr::E::IfElse(if_else) = base {
        self.add_if_else_first_half_docs(heap, comment_store, flattened, if_else, &mut documents);
        base = &if_else.e2;
      } else {
        documents.push(self.expr_wrapped_with_braces_expanded_in_if_else(
          heap,
          comment_store,
          flattened,
          base,
        ));
        return Document::concat(documents);
      }
    }
  }

  fn add_if_else_first_half_docs(
    &self,
    heap: &Heap,
    comment_store: &CommentStore,
    flattened: bool,
    if_else: &expr::IfElse,
    documents: &mut Vec<Document>,
  ) {
    documents.push(Document::Text(rcs("if ")));
    documents.push(if_else.condition.create_doc(heap, comment_store));
    documents.push(Document::Text(rcs(" then ")));
    documents.push(self.expr_wrapped_with_braces_expanded_in_if_else(
      heap,
      comment_store,
      flattened,
      &if_else.e1,
    ));
    documents.push(Document::Text(rcs(" else ")));
  }

  fn expr_wrapped_with_braces_expanded_in_if_else(
    &self,
    heap: &Heap,
    comment_store: &CommentStore,
    flattened: bool,
    sub_expression: &expr::E,
  ) -> Document {
    let mut expr_doc = self.create_doc_for_subexpression_considering_precedence_level(
      heap,
      comment_store,
      sub_expression,
      false,
    );
    if !matches!(sub_expression, expr::E::Block(_)) && !flattened {
      expr_doc = Document::concat(vec![
        Document::Text(rcs("{")),
        Document::Nest(2, Rc::new(Document::Concat(Rc::new(Document::Line), Rc::new(expr_doc)))),
        Document::Line,
        Document::Text(rcs("}")),
      ]);
    }
    expr_doc
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
                Self::create_member_preceding_comment_docs(heap, comment_store, false, c),
                Document::Text(rcs(".")),
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
        Self::create_member_preceding_comment_docs(heap, comment_store, true, *first_c),
        Document::Text(rcs(".")),
        Document::concat(first_d.clone()),
        Document::Nest(
          2,
          Rc::new(Document::concat(
            chain
              .iter()
              .cloned()
              .flat_map(|(c, d)| {
                vec![
                  Self::create_member_preceding_comment_docs(heap, comment_store, false, c),
                  Document::Text(rcs(".")),
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
            Self::create_member_preceding_comment_docs(heap, comment_store, true, c),
            Document::Text(rcs(".")),
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
      comments,
      if flattened { DocumentGrouping::Flattened } else { DocumentGrouping::Expanded },
      !flattened,
    ) {
      if flattened {
        Document::Concat(Rc::new(Document::Text(rcs(" "))), Rc::new(doc))
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
    &self,
    heap: &Heap,
    comment_store: &CommentStore,
    potential_chainable_expr: &expr::E,
  ) -> (Document, Vec<(CommentReference, Vec<Document>)>) {
    match potential_chainable_expr {
      expr::E::ClassFn(e) => {
        let mut class_name_doc = Document::Text(rc_pstr(heap, e.class_name.name));
        if let Some(comment_doc) = associated_comments_doc(
          heap,
          comment_store,
          e.common.associated_comments,
          DocumentGrouping::Grouped,
          true,
        ) {
          class_name_doc =
            Document::group(Document::Concat(Rc::new(comment_doc), Rc::new(class_name_doc)))
        }
        (
          class_name_doc,
          vec![(
            e.fn_name.associated_comments,
            vec![Document::Text(rc_string(format!(
              "{}{}",
              e.fn_name.name.as_str(heap),
              optional_targs(heap, &e.type_arguments)
            )))],
          )],
        )
      }
      expr::E::FieldAccess(e) => {
        let (base, mut chain) =
          potential_chainable_expr.create_chainable_ir_docs(heap, comment_store, &e.object);
        chain.push((
          e.field_name.associated_comments,
          vec![Document::Text(rc_string(format!(
            "{}{}",
            e.field_name.name.as_str(heap),
            optional_targs(heap, &e.type_arguments)
          )))],
        ));
        (base, chain)
      }
      expr::E::MethodAccess(e) => {
        let (base, mut chain) =
          potential_chainable_expr.create_chainable_ir_docs(heap, comment_store, &e.object);
        chain.push((
          e.method_name.associated_comments,
          vec![Document::Text(rc_string(format!(
            "{}{}",
            e.method_name.name.as_str(heap),
            optional_targs(heap, &e.type_arguments)
          )))],
        ));
        (base, chain)
      }
      expr::E::Call(e) => {
        let args_doc = parenthesis_surrounded_doc(comma_sep_list(&e.arguments, |e| {
          e.create_doc(heap, comment_store)
        }));
        let (mut base, mut chain) = self.create_chainable_ir_docs(heap, comment_store, &e.callee);
        if let Some((_, last_docs)) = chain.last_mut() {
          last_docs.push(args_doc);
        } else {
          base = Document::Concat(Rc::new(base), Rc::new(args_doc));
        }
        (base, chain)
      }
      _ => (
        self.create_doc_for_subexpression_considering_precedence_level(
          heap,
          comment_store,
          potential_chainable_expr,
          false,
        ),
        vec![],
      ),
    }
  }

  fn create_doc_without_preceding_comment(
    &self,
    heap: &Heap,
    comment_store: &CommentStore,
  ) -> Document {
    match self {
      expr::E::Literal(_, l) => Document::Text(rc_string(l.pretty_print(heap))),
      expr::E::Id(_, id) => Document::Text(rc_pstr(heap, id.name)),
      expr::E::ClassFn(_)
      | expr::E::FieldAccess(_)
      | expr::E::MethodAccess(_)
      | expr::E::Call(_) => Self::create_doc_for_dotted_chain(
        heap,
        comment_store,
        Self::create_chainable_ir_docs(self, heap, comment_store, self),
      ),
      expr::E::Unary(e) => Document::Concat(
        Rc::new(Document::Text(rc_string(e.operator.to_string()))),
        Rc::new(self.create_doc_for_subexpression_considering_precedence_level(
          heap,
          comment_store,
          &e.argument,
          false,
        )),
      ),
      expr::E::IfElse(e) => self.create_doc_for_if_else(heap, comment_store, e),

      expr::E::Binary(e) => {
        let operator_preceding_comments_docs = if let Some(doc) = associated_comments_doc(
          heap,
          comment_store,
          e.operator_preceding_comments,
          DocumentGrouping::Grouped,
          false,
        ) {
          Document::group(Document::Concat(Rc::new(Document::Line), Rc::new(doc)))
        } else {
          Document::Nil
        };
        let operator_doc = Document::Text(rc_string(format!(" {} ", e.operator.to_string())));
        if e.e1.precedence() == self.precedence() {
          // Since we are doing left to right evaluation, this is safe.
          return Document::concat(vec![
            e.e1.create_doc(heap, comment_store),
            operator_preceding_comments_docs,
            operator_doc,
            self.create_doc_for_subexpression_considering_precedence_level(
              heap,
              comment_store,
              &e.e2,
              true,
            ),
          ]);
        }
        if e.e2.precedence() == self.precedence() {
          // For the commutative operators, we can remove parentheses.
          match e.operator {
            expr::BinaryOperator::MINUS | expr::BinaryOperator::DIV | expr::BinaryOperator::MOD => {
            }
            _ => {
              return Document::concat(vec![
                self.create_doc_for_subexpression_considering_precedence_level(
                  heap,
                  comment_store,
                  &e.e1,
                  true,
                ),
                operator_preceding_comments_docs,
                operator_doc,
                e.e2.create_doc(heap, comment_store),
              ]);
            }
          }
        }
        // Safest rule
        Document::concat(vec![
          self.create_doc_for_subexpression_considering_precedence_level(
            heap,
            comment_store,
            &e.e1,
            true,
          ),
          operator_preceding_comments_docs,
          operator_doc,
          self.create_doc_for_subexpression_considering_precedence_level(
            heap,
            comment_store,
            &e.e2,
            true,
          ),
        ])
      }

      expr::E::Match(e) => {
        let mut list = vec![];
        for case in &e.cases {
          list.push(Document::Text(rc_string(format!(
            "{}({}) -> ",
            case.tag.name.as_str(heap),
            if let Some((data_var, _)) = &case.data_variable {
              data_var.name.as_str(heap)
            } else {
              "_"
            }
          ))));
          list.push(case.body.create_doc(heap, comment_store));
          if !matches!(case.body.deref(), expr::E::Block(_) | expr::E::Match(_)) {
            list.push(Document::Text(rcs(",")))
          }
          list.push(Document::Line);
        }
        list.pop();

        Document::concat(vec![
          Document::Text(rcs("match ")),
          e.matched.create_doc(heap, comment_store),
          Document::Text(rcs(" ")),
          Document::bracket_flexible(
            rcs("{"),
            Document::LineHard,
            Document::concat(list),
            rcs("}"),
          ),
        ])
      }

      expr::E::Lambda(e) => Document::concat(vec![
        parenthesis_surrounded_doc(comma_sep_list(&e.parameters, |id| {
          Document::Text(if let Some(annot) = &id.annotation {
            rc_string(format!("{}: {}", id.name.name.as_str(heap), annot.pretty_print(heap)))
          } else {
            rc_pstr(heap, id.name.name)
          })
        })),
        Document::Text(rcs(" -> ")),
        self.create_doc_for_subexpression_considering_precedence_level(
          heap,
          comment_store,
          &e.body,
          false,
        ),
      ]),

      expr::E::Block(e) => {
        let mut segments = vec![];
        for stmt in &e.statements {
          let pattern_doc = match &stmt.pattern {
            expr::Pattern::Object(_, names) => braces_surrounded_doc(comma_sep_list(names, |it| {
              Document::Text(if let Some(alias) = &it.alias {
                rc_string(format!(
                  "{} as {}",
                  it.field_name.name.as_str(heap),
                  alias.name.as_str(heap)
                ))
              } else {
                rc_pstr(heap, it.field_name.name)
              })
            })),
            expr::Pattern::Id(_, n) => Document::Text(rc_pstr(heap, *n)),
            expr::Pattern::Wildcard(_) => Document::Text(rcs("_")),
          };
          segments.push(
            associated_comments_doc(
              heap,
              comment_store,
              stmt.associated_comments,
              DocumentGrouping::Grouped,
              true,
            )
            .unwrap_or(Document::Nil),
          );
          segments.push(Document::Text(rcs("val ")));
          segments.push(pattern_doc);
          segments.push(if let Some(annot) = &stmt.annotation {
            Document::Text(rc_string(format!(": {}", annot.pretty_print(heap))))
          } else {
            Document::Nil
          });
          segments.push(Document::Text(rcs(" = ")));
          segments.push(stmt.assigned_expression.create_doc(heap, comment_store));
          segments.push(Document::Text(rcs(";")));
          segments.push(Document::LineHard);
        }
        let final_expr_doc = e.expression.as_ref().map(|e| e.create_doc(heap, comment_store));
        if segments.is_empty() {
          braces_surrounded_doc(final_expr_doc.unwrap_or(Document::Nil))
        } else {
          if let Some(d) = final_expr_doc {
            segments.push(d);
          } else {
            segments.pop();
          }
          braces_surrounded_block_doc(segments)
        }
      }
    }
  }

  fn create_doc(&self, heap: &Heap, comment_store: &CommentStore) -> Document {
    let main_doc = self.create_doc_without_preceding_comment(heap, comment_store);
    if matches!(self, expr::E::ClassFn(_)) {
      return main_doc;
    }
    if let Some(comment_doc) = associated_comments_doc(
      heap,
      comment_store,
      self.common().associated_comments,
      DocumentGrouping::Grouped,
      true,
    ) {
      Document::group(Document::Concat(Rc::new(comment_doc), Rc::new(main_doc)))
    } else {
      main_doc
    }
  }
}

fn type_parameters_to_string(heap: &Heap, tparams: &Vec<TypeParameter>) -> String {
  if tparams.is_empty() {
    "".to_string()
  } else {
    format!("<{}> ", tparams.iter().map(|tparam| tparam.pretty_print(heap)).join(", "))
  }
}

fn create_doc_for_interface_member(
  heap: &Heap,
  comment_store: &CommentStore,
  member: &ClassMemberDeclaration,
  body: Option<&expr::E>,
) -> Vec<Document> {
  let body_doc = body.map(|e| e.create_doc(heap, comment_store)).unwrap_or(Document::Nil);

  // Special case for statement block as body for prettier result.
  // We want to lift the leading `{` to the same line as `=`.
  let body_doc_with_potential_indentation = match body_doc {
    Document::Concat(d1, d2) if d1.as_text().map(|s| s.as_str().eq("{")).unwrap_or(false) => {
      Document::Concat(Rc::new(Document::Text(rcs(" {"))), d2)
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
      member.associated_comments,
      DocumentGrouping::Grouped,
      true,
    )
    .unwrap_or(Document::Nil),
    if member.is_public { Document::Nil } else { Document::Text(rcs("private ")) },
    Document::Text(rcs(if member.is_method { "method " } else { "function " })),
    Document::Text(rc_string(type_parameters_to_string(heap, &member.type_parameters))),
    Document::Text(rc_pstr(heap, member.name.name)),
    parenthesis_surrounded_doc(comma_sep_list(member.parameters.as_ref(), |param| {
      Document::Text(rc_string(format!(
        "{}: {}",
        param.name.name.as_str(heap),
        param.annotation.pretty_print(heap)
      )))
    })),
    Document::Text(rcs(": ")),
    Document::Text(rc_string(member.type_.return_type.pretty_print(heap))),
    if body.is_none() { Document::Nil } else { Document::Text(rcs(" =")) },
    body_doc_with_potential_indentation,
  ]
}

fn extends_or_implements_node_to_string(heap: &Heap, nodes: &Vec<IdType>) -> String {
  if nodes.is_empty() {
    "".to_string()
  } else {
    format!(" : {}", nodes.iter().map(|t| t.pretty_print(heap)).join(", "))
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
      interface.associated_comments,
      DocumentGrouping::Grouped,
      true,
    )
    .unwrap_or(Document::Nil),
    Document::Text(rc_string(format!(
      "interface {}{}{}",
      interface.name.name.as_str(heap),
      type_parameters_to_string(heap, &interface.type_parameters).trim_end(),
      extends_or_implements_node_to_string(heap, &interface.extends_or_implements_nodes)
    ))),
  ];

  if interface.members.is_empty() {
    return documents;
  }

  documents.push(Document::Text(rcs(" {")));
  for member in &interface.members {
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
  documents.push(Document::Text(rcs("}")));

  documents
}

fn class_to_doc(
  heap: &Heap,
  comment_store: &CommentStore,
  class: &ClassDefinition,
) -> Vec<Document> {
  let mut documents = vec![
    associated_comments_doc(
      heap,
      comment_store,
      class.associated_comments,
      DocumentGrouping::Grouped,
      true,
    )
    .unwrap_or(Document::Nil),
    Document::Text(rc_string(format!(
      "class {}{}",
      class.name.name.as_str(heap),
      type_parameters_to_string(heap, &class.type_parameters).trim_end(),
    ))),
    if class.type_definition.mappings.is_empty() {
      Document::Nil
    } else {
      let mut type_mapping_items = vec![];
      for name in &class.type_definition.names {
        let type_ = class.type_definition.mappings.get(&name.name).unwrap();
        type_mapping_items.push(rc_string(if class.type_definition.is_object {
          format!(
            "{}val {}: {}",
            if type_.is_public { "" } else { "private " },
            name.name.as_str(heap),
            type_.type_.pretty_print(heap)
          )
        } else {
          format!("{}({})", name.name.as_str(heap), type_.type_.pretty_print(heap))
        }));
      }
      parenthesis_surrounded_doc(comma_sep_list(&type_mapping_items, |s| Document::Text(s.clone())))
    },
    Document::Text(rc_string(extends_or_implements_node_to_string(
      heap,
      &class.extends_or_implements_nodes,
    ))),
  ];

  if class.members.is_empty() {
    return documents;
  }

  documents.push(Document::Text(rcs(" {")));
  for member in &class.members {
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
  documents.push(Document::Text(rcs("}")));

  documents
}

pub(super) fn source_module_to_document(heap: &Heap, module: &Module) -> Document {
  let mut documents = vec![];

  let mut organized_imports = HashMap::<ModuleReference, Vec<Id>>::new();
  for import in &module.imports {
    if let Some(list) = organized_imports.get_mut(&import.imported_module) {
      list.append(&mut import.imported_members.clone());
    } else {
      organized_imports.insert(import.imported_module, import.imported_members.clone());
    }
  }

  for (imported_module, imported_members) in organized_imports
    .into_iter()
    .sorted_by_key(|(mod_ref, _)| mod_ref.pretty_print(heap))
    .map(|(mod_ref, members)| {
      (mod_ref, members.into_iter().sorted_by_key(|m| m.name.as_str(heap)).collect_vec())
    })
  {
    documents.push(Document::Text(rcs("import ")));
    documents.push(braces_surrounded_doc(comma_sep_list(&imported_members, |m| {
      Document::Text(rc_pstr(heap, m.name))
    })));
    documents
      .push(Document::Text(rc_string(format!(" from {}", imported_module.pretty_print(heap)))));
    documents.push(Document::LineHard);
  }
  if !module.imports.is_empty() {
    documents.push(Document::LineHard);
  }

  for toplevel in &module.toplevels {
    documents.append(&mut match toplevel {
      Toplevel::Interface(interface) => interface_to_doc(heap, &module.comment_store, interface),
      Toplevel::Class(class) => class_to_doc(heap, &module.comment_store, class),
    });
    documents.push(Document::LineHard);
    documents.push(Document::LineHard);
  }

  Document::concat(documents)
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::source::{expr, CommentStore, Id},
    checker::type_::test_type_builder,
    common::{Heap, ModuleReference},
    errors::ErrorSet,
    parser::{parse_source_expression_from_text, parse_source_module_from_text},
    printer::{prettier, pretty_print_source_module},
  };
  use pretty_assertions::assert_eq;

  fn assert_reprint_expr(source: &str, expected: &str) {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let (comment_store, e) = parse_source_expression_from_text(
      source,
      ModuleReference::dummy(),
      &mut heap,
      &mut error_set,
    );
    assert!(error_set.error_messages(&heap).is_empty());
    assert_eq!(
      expected,
      prettier::pretty_print(40, e.create_doc(&heap, &comment_store)).trim_end()
    );
  }

  fn assert_reprint_module(source: &str, expected: &str) {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let m =
      parse_source_module_from_text(source, ModuleReference::dummy(), &mut heap, &mut error_set);
    assert!(error_set.error_messages(&heap).is_empty());
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
    assert_reprint_expr("ClassName.classMember<A,B>", "ClassName.classMember<A, B>");
    assert_reprint_expr(
      "/* a */ ClassName./* b */  /* c */ classMember<A,B>",
      r#"/* a */
ClassName /* b */ /* c */.classMember<A, B>"#,
    );
    assert_reprint_expr(
      "// foo\n ClassName./* b */  /* c */ classMember<A,B>",
      r#"// foo
ClassName /* b */ /* c */.classMember<A, B>"#,
    );
    assert_reprint_expr(
      "/* abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg abcdefg */ ClassName./* b */  /* c */ classMember<A,B>",
      r#"/*
 * abcdefg abcdefg abcdefg abcdefg
 * abcdefg abcdefg abcdefg abcdefg
 * abcdefg abcdefg
 */
ClassName /* b */ /* c */.classMember<A, B>"#,
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
      r#"/* a */
Test /* b */ /* c */.VariantName<T>(42)"#,
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

    assert_reprint_expr("foo.bar", "foo.bar");

    let builder = test_type_builder::create();
    let empty_comment_store = CommentStore::new();
    let mut heap = Heap::new();
    assert_eq!(
      "foo.bar",
      prettier::pretty_print(
        40,
        expr::E::MethodAccess(expr::MethodAccess {
          common: expr::ExpressionCommon::dummy(builder.int_type()),
          type_arguments: vec![],
          object: Box::new(expr::E::Id(
            expr::ExpressionCommon::dummy(builder.int_type()),
            Id::from(heap.alloc_str("foo"))
          )),
          method_name: Id::from(heap.alloc_str("bar"))
        })
        .create_doc(&heap, &empty_comment_store)
      )
      .trim_end()
    );
    assert_eq!(
      "foo.bar<int>",
      prettier::pretty_print(
        40,
        expr::E::MethodAccess(expr::MethodAccess {
          common: expr::ExpressionCommon::dummy(builder.int_type()),
          type_arguments: vec![builder.int_type()],
          object: Box::new(expr::E::Id(
            expr::ExpressionCommon::dummy(builder.int_type()),
            Id::from(heap.alloc_str("foo"))
          )),
          method_name: Id::from(heap.alloc_str("bar"))
        })
        .create_doc(&heap, &empty_comment_store)
      )
      .trim_end()
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

    assert_reprint_expr("if (b) then a else c", "if b then a else c");
    assert_reprint_expr(
      r#"
      if (b) then {
        // fff
        val _ = println("");
        val _ = println("");
        val _ = println("");
        /* f */
        val _ = println("");
      } else if (b) then {
        val _ = println("");
        val _ = println("");
        val _ = println("");
        val _ = println("");
      } else {
        val _ = println("");
        val _ = println("");
        val _ = println("");
        val _ = println("");
      }"#,
      r#"if b then {
  // fff
  val _ = println("");
  val _ = println("");
  val _ = println("");
  /* f */
  val _ = println("");
} else if b then {
  val _ = println("");
  val _ = println("");
  val _ = println("");
  val _ = println("");
} else {
  val _ = println("");
  val _ = println("");
  val _ = println("");
  val _ = println("");
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
    assert_reprint_expr("(() -> 1)()", "(() -> 1)()");

    assert_reprint_expr("{}", "{  }");
    assert_reprint_expr("{3}", "{ 3 }");
    assert_reprint_expr(
      "{ val _:int=0;val _=0; }",
      r#"{
  val _: int = 0;
  val _ = 0;
}"#,
    );
    assert_reprint_expr(
      "{ val a:int=1; 3 }",
      r#"{
  val a: int = 1;
  3
}"#,
    );
    assert_reprint_expr(
      "{ val {a, b as c}: int = 3; }",
      r#"{
  val { a, b as c }: int = 3;
}"#,
    );

    assert_reprint_expr(
      "{ val a: unit = { val b: unit = { val c: unit = { val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong; }; }; }; }",
      r#"{
  val a: unit = {
    val b: unit = {
      val c: unit = {
        val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong;
      };
    };
  };
}"#);
    assert_reprint_expr(
      "() -> () -> () -> { val a: unit = { val b: unit = { val c: unit = { val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong; }; }; }; }",
      r#"() -> () -> () -> {
  val a: unit = {
    val b: unit = {
      val c: unit = {
        val d: unit = aVariableNameThatIsVeryVeryVeryVeryVeryLong;
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
interface Foo2 : Foo {}
interface Bar<A> { function baz(): int }
class Empty
class Empty2 : Foo
class Main { function main(): unit = {} }
"#,
      r#"
interface Foo

interface Foo2 : Foo

interface Bar<A> {
  function baz(): int
}

class Empty

class Empty2 : Foo

class Main {
  function main(): unit = {  }
}"#,
    );

    assert_reprint_module(
      r#"
import {Foo} from Foo.Baz
import {F1,F2,F3,F4,F5,F6,F7,F8} from Bar.Baz
import {F9,F10} from Bar.Baz

class Option<T>(None(unit), Some(T)) {
  private method <T> matchExample(opt: Option<int>): int =
    match (opt) { None(_) -> 42, Some(a) -> a }

  /* not ignored */ /** foo bar a */
  function a(): int = 3

  /** foo bar b */
  function b(): int = {}

  /** foo bar c */
  function c(): int = { val a: int = 3; }
}

class Obj(private val d: int, val e: int) {
  /** foo bar */
  function valExample(): unit = {
    val a: int = 1;
    val b: int = 2;
  }
}

/** short line */
class A(val a: int) {}

/** some very very very very very very very very very very very very very very very very very very
 * long document string
 */
class Main {}
"#,
      r#"
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
} from Bar.Baz
import { Foo } from Foo.Baz

class Option<T>(None(unit), Some(T)) {
  private method <T> matchExample(
    opt: Option<int>
  ): int =
    match opt {
      None(_) -> 42,
      Some(a) -> a,
    }

  /* not ignored */ /** foo bar a */
  function a(): int = 3

  /** foo bar b */
  function b(): int = {  }

  /** foo bar c */
  function c(): int = {
    val a: int = 3;
  }
}

class Obj(
  private val d: int,
  val e: int
) {
  /** foo bar */
  function valExample(): unit = {
    val a: int = 1;
    val b: int = 2;
  }
}

/** short line */
class A(val a: int)

/**
 * some very very very very very very
 * very very very very very very very
 * very very very very very long
 * document string
 */
class Main"#,
    );
  }
}
