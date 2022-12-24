use super::prettier::Document;
use crate::{
  ast::source::{
    expr, ClassDefinition, ClassMemberDeclaration, Comment, CommentKind, ISourceType, IdType,
    InterfaceDeclaration, Module, Toplevel, Type, TypeParameter,
  },
  common::{rc_string, rcs, Str},
};
use itertools::Itertools;
use std::rc::Rc;

fn comma_sep_list<E, F: Fn(&E) -> Document>(elements: &Vec<E>, doc_creator: F) -> Document {
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

fn associated_comments_doc(
  associated_comments: &Vec<Comment>,
  add_final_line_break: bool,
) -> Option<Document> {
  let mut documents = vec![];
  for comment in associated_comments {
    documents.append(&mut match comment.kind {
      CommentKind::LINE => vec![Document::line_comment(&comment.text), Document::LineHard],
      CommentKind::BLOCK => vec![Document::multiline_comment("/*", &comment.text), Document::Line],
      CommentKind::DOC => vec![Document::multiline_comment("/**", &comment.text), Document::Line],
    });
  }
  if documents.is_empty() {
    None
  } else {
    let final_line_break_is_soft = documents.last().unwrap().eq(&Document::Line);
    if final_line_break_is_soft {
      documents.pop();
    }
    let final_main_doc = Document::group(Document::concat(documents));
    Some(if add_final_line_break && final_line_break_is_soft {
      Document::Concat(Rc::new(final_main_doc), Rc::new(Document::Line))
    } else {
      final_main_doc
    })
  }
}

fn optional_targs(type_args: &Vec<Rc<Type>>) -> String {
  if type_args.is_empty() {
    "".to_string()
  } else {
    format!("<{}>", type_args.iter().map(|t| t.pretty_print()).join(", "))
  }
}

impl expr::E {
  fn create_doc_for_subexpression_considering_precedence_level(
    &self,
    sub_expression: &expr::E,
    equal_level_parenthesis: bool,
  ) -> Document {
    let add_parenthesis = if equal_level_parenthesis {
      sub_expression.precedence() >= self.precedence()
    } else {
      sub_expression.precedence() > self.precedence()
    };
    if add_parenthesis {
      parenthesis_surrounded_doc(sub_expression.create_doc())
    } else {
      sub_expression.create_doc()
    }
  }

  fn create_doc_for_if_else(&self, if_else: &expr::IfElse) -> Document {
    let mut documents = vec![];
    self.add_if_else_first_half_docs(if_else, &mut documents);
    let mut base: &expr::E = &if_else.e2;
    loop {
      if let expr::E::IfElse(if_else) = base {
        self.add_if_else_first_half_docs(if_else, &mut documents);
        base = &if_else.e2;
      } else {
        documents.push(self.create_doc_for_subexpression_considering_precedence_level(base, false));
        return Document::concat(documents);
      }
    }
  }

  fn add_if_else_first_half_docs(&self, if_else: &expr::IfElse, documents: &mut Vec<Document>) {
    documents.push(Document::Text(rcs("if ")));
    documents.push(parenthesis_surrounded_doc(if_else.condition.create_doc()));
    documents.push(Document::Text(rcs(" then ")));
    documents
      .push(self.create_doc_for_subexpression_considering_precedence_level(&if_else.e1, false));
    documents.push(Document::Text(rcs(" else ")));
  }

  fn create_doc_for_dotted_expr(base: Document, comments: &Vec<Comment>, member: Str) -> Document {
    let member_preceding_comments_docs = if let Some(doc) = associated_comments_doc(comments, true)
    {
      Document::group(Document::Concat(Rc::new(Document::Line), Rc::new(doc)))
    } else {
      Document::Nil
    };
    Document::concat(vec![
      base,
      member_preceding_comments_docs,
      Document::Text(rcs(".")),
      Document::Text(member),
    ])
  }

  fn create_doc_without_preceding_comment(&self) -> Document {
    match self {
      expr::E::Literal(_, l) => Document::Text(rc_string(l.pretty_print())),
      expr::E::This(_) => Document::Text(rcs("this")),
      expr::E::Id(_, id) => Document::Text(id.name.clone()),
      expr::E::ClassFn(e) => Self::create_doc_for_dotted_expr(
        Document::Text(e.class_name.name.clone()),
        &e.fn_name.associated_comments,
        rc_string(format!("{}{}", e.fn_name.name, optional_targs(&e.type_arguments))),
      ),
      expr::E::FieldAccess(e) => Self::create_doc_for_dotted_expr(
        self.create_doc_for_subexpression_considering_precedence_level(&e.object, false),
        &e.field_name.associated_comments,
        rc_string(format!("{}{}", e.field_name.name, optional_targs(&e.type_arguments))),
      ),
      expr::E::MethodAccess(e) => Self::create_doc_for_dotted_expr(
        self.create_doc_for_subexpression_considering_precedence_level(&e.object, false),
        &e.method_name.associated_comments,
        rc_string(format!("{}{}", e.method_name.name, optional_targs(&e.type_arguments))),
      ),
      expr::E::Unary(e) => Document::Concat(
        Rc::new(Document::Text(rc_string(e.operator.to_string()))),
        Rc::new(self.create_doc_for_subexpression_considering_precedence_level(&e.argument, false)),
      ),
      expr::E::Call(e) => Document::Concat(
        Rc::new(self.create_doc_for_subexpression_considering_precedence_level(&e.callee, false)),
        Rc::new(parenthesis_surrounded_doc(comma_sep_list(&e.arguments, expr::E::create_doc))),
      ),
      expr::E::IfElse(e) => self.create_doc_for_if_else(e),

      expr::E::Binary(e) => {
        let operator_preceding_comments_docs =
          if let Some(doc) = associated_comments_doc(&e.operator_preceding_comments, false) {
            Document::group(Document::Concat(Rc::new(Document::Line), Rc::new(doc)))
          } else {
            Document::Nil
          };
        let operator_doc = Document::Text(rc_string(format!(" {} ", e.operator.to_string())));
        if e.e1.precedence() == self.precedence() {
          // Since we are doing left to right evaluation, this is safe.
          return Document::concat(vec![
            e.e1.create_doc(),
            operator_preceding_comments_docs,
            operator_doc,
            self.create_doc_for_subexpression_considering_precedence_level(&e.e2, true),
          ]);
        }
        if e.e2.precedence() == self.precedence() {
          // For the commutative operators, we can remove parentheses.
          match e.operator {
            expr::BinaryOperator::MINUS | expr::BinaryOperator::DIV | expr::BinaryOperator::MOD => {
            }
            _ => {
              return Document::concat(vec![
                self.create_doc_for_subexpression_considering_precedence_level(&e.e1, true),
                operator_preceding_comments_docs,
                operator_doc,
                e.e2.create_doc(),
              ]);
            }
          }
        }
        // Safest rule
        return Document::concat(vec![
          self.create_doc_for_subexpression_considering_precedence_level(&e.e1, true),
          operator_preceding_comments_docs,
          operator_doc,
          self.create_doc_for_subexpression_considering_precedence_level(&e.e2, true),
        ]);
      }

      expr::E::Match(e) => {
        let mut list = vec![];
        for case in &e.cases {
          list.push(Document::Text(rc_string(format!(
            "| {} {} -> ",
            case.tag.name,
            if let Some((data_var, _)) = &case.data_variable { &data_var.name } else { "_" }
          ))));
          list.push(
            self.create_doc_for_subexpression_considering_precedence_level(&case.body, false),
          );
          list.push(Document::Line);
        }
        list.pop();

        Document::concat(vec![
          Document::Text(rcs("match ")),
          parenthesis_surrounded_doc(e.matched.create_doc()),
          Document::Text(rcs(" ")),
          braces_surrounded_doc(Document::concat(list)),
        ])
      }

      expr::E::Lambda(e) => Document::concat(vec![
        parenthesis_surrounded_doc(comma_sep_list(&e.parameters, |id| {
          Document::Text(if let Some(annot) = &id.annotation {
            rc_string(format!("{}: {}", id.name.name, annot.pretty_print()))
          } else {
            id.name.name.clone()
          })
        })),
        Document::Text(rcs(" -> ")),
        self.create_doc_for_subexpression_considering_precedence_level(&e.body, false),
      ]),

      expr::E::Block(e) => {
        let mut segments = vec![];
        for stmt in &e.statements {
          let pattern_doc = match &stmt.pattern {
            expr::Pattern::Object(_, names) => braces_surrounded_doc(comma_sep_list(names, |it| {
              Document::Text(if let Some(alias) = &it.alias {
                rc_string(format!("{} as {}", it.field_name.name, alias.name))
              } else {
                it.field_name.name.clone()
              })
            })),
            expr::Pattern::Id(_, n) => Document::Text(n.clone()),
            expr::Pattern::Wildcard(_) => Document::Text(rcs("_")),
          };
          segments.push(
            associated_comments_doc(&stmt.associated_comments, true).unwrap_or(Document::Nil),
          );
          segments.push(Document::Text(rcs("val ")));
          segments.push(pattern_doc);
          segments.push(if let Some(annot) = &stmt.annotation {
            Document::Text(rc_string(format!(": {}", annot.pretty_print())))
          } else {
            Document::Nil
          });
          segments.push(Document::Text(rcs(" = ")));
          segments.push(stmt.assigned_expression.create_doc());
          segments.push(Document::Text(rcs(";")));
          segments.push(Document::LineHard);
        }
        let final_expr_doc = e.expression.as_ref().map(|e| e.create_doc());
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

  fn create_doc(&self) -> Document {
    let main_doc = self.create_doc_without_preceding_comment();
    if let Some(comment_doc) = associated_comments_doc(&self.common().associated_comments, true) {
      Document::group(Document::Concat(Rc::new(comment_doc), Rc::new(main_doc)))
    } else {
      main_doc
    }
  }
}

fn type_parameters_to_string(tparams: &Vec<TypeParameter>) -> String {
  if tparams.is_empty() {
    "".to_string()
  } else {
    format!("<{}> ", tparams.iter().map(TypeParameter::pretty_print).join(", "))
  }
}

fn create_doc_for_interface_member(
  member: &ClassMemberDeclaration,
  body: Option<&expr::E>,
) -> Vec<Document> {
  let body_doc = body.map(|e| e.create_doc()).unwrap_or(Document::Nil);

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
    associated_comments_doc(&member.associated_comments, true).unwrap_or(Document::Nil),
    if member.is_public { Document::Nil } else { Document::Text(rcs("private ")) },
    Document::Text(rcs(if member.is_method { "method " } else { "function " })),
    Document::Text(rc_string(type_parameters_to_string(&member.type_parameters))),
    Document::Text(member.name.name.clone()),
    parenthesis_surrounded_doc(comma_sep_list(member.parameters.as_ref(), |param| {
      Document::Text(rc_string(format!("{}: {}", param.name.name, param.annotation.pretty_print())))
    })),
    Document::Text(rcs(": ")),
    Document::Text(rc_string(member.type_.return_type.pretty_print())),
    if body.is_none() { Document::Nil } else { Document::Text(rcs(" =")) },
    body_doc_with_potential_indentation,
  ]
}

fn extends_or_implements_node_to_string(nodes: &Vec<IdType>) -> String {
  if nodes.is_empty() {
    "".to_string()
  } else {
    format!(" : {}", nodes.iter().map(|t| t.pretty_print()).join(", "))
  }
}

fn interface_to_doc(interface: &InterfaceDeclaration) -> Vec<Document> {
  let mut documents = vec![
    associated_comments_doc(&interface.associated_comments, true).unwrap_or(Document::Nil),
    Document::Text(rc_string(format!(
      "interface {}{}{}",
      interface.name.name,
      type_parameters_to_string(&interface.type_parameters).trim_end(),
      extends_or_implements_node_to_string(&interface.extends_or_implements_nodes)
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
          .chain(create_doc_for_interface_member(member, None))
          .collect(),
      )),
    ));
    documents.push(Document::Line);
  }
  documents.push(Document::Text(rcs("}")));

  documents
}

fn class_to_doc(class: &ClassDefinition) -> Vec<Document> {
  let mut documents = vec![
    associated_comments_doc(&class.associated_comments, true).unwrap_or(Document::Nil),
    Document::Text(rc_string(format!(
      "class {}{}",
      class.name.name,
      type_parameters_to_string(&class.type_parameters).trim_end(),
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
            name.name,
            type_.type_.pretty_print()
          )
        } else {
          format!("{}({})", name.name, type_.type_.pretty_print())
        }));
      }
      parenthesis_surrounded_doc(comma_sep_list(&type_mapping_items, |s| Document::Text(s.clone())))
    },
    Document::Text(rc_string(extends_or_implements_node_to_string(
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
          .chain(create_doc_for_interface_member(&member.decl, Some(&member.body)))
          .collect(),
      )),
    ));
    documents.push(Document::Line);
  }
  documents.push(Document::Text(rcs("}")));

  documents
}

pub(super) fn source_module_to_document(module: &Module) -> Document {
  let mut documents = vec![];

  for import in &module.imports {
    documents.push(Document::Text(rcs("import ")));
    documents.push(braces_surrounded_doc(comma_sep_list(&import.imported_members, |m| {
      Document::Text(m.name.clone())
    })));
    documents
      .push(Document::Text(rc_string(format!(" from {}", import.imported_module.to_string()))));
    documents.push(Document::LineHard);
  }
  if !module.imports.is_empty() {
    documents.push(Document::LineHard);
  }

  for toplevel in &module.toplevels {
    documents.append(&mut match toplevel {
      Toplevel::Interface(interface) => interface_to_doc(interface),
      Toplevel::Class(class) => class_to_doc(class),
    });
    documents.push(Document::LineHard);
    documents.push(Document::LineHard);
  }

  Document::concat(documents)
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{expr, test_builder, Id},
      ModuleReference,
    },
    errors::ErrorSet,
    parser::{parse_source_expression_from_text, parse_source_module_from_text},
    printer::{prettier, pretty_print_source_module},
  };
  use pretty_assertions::assert_eq;

  fn assert_reprint_expr(source: &str, expected: &str) {
    let mut error_set = ErrorSet::new();
    let e = parse_source_expression_from_text(source, &ModuleReference::dummy(), &mut error_set);
    assert!(error_set.error_messages().is_empty());
    assert_eq!(expected, prettier::pretty_print(40, e.create_doc()).trim_end());
  }

  fn assert_reprint_module(source: &str, expected: &str) {
    let mut error_set = ErrorSet::new();
    let m = parse_source_module_from_text(source, &ModuleReference::dummy(), &mut error_set);
    assert!(error_set.error_messages().is_empty());
    assert_eq!(expected, format!("\n{}", pretty_print_source_module(40, &m).trim_end()));
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
ClassName
/* b */ /* c */
.classMember<A, B>"#,
    );
    assert_reprint_expr("ClassName/* a */.classMember", "ClassName /* a */ .classMember");
    assert_reprint_expr("ClassName. /* b */classMember", "ClassName /* b */ .classMember");
    assert_reprint_expr(
      "ClassName/* a */. /* b */classMember",
      "ClassName /* a */ /* b */ .classMember",
    );

    assert_reprint_expr("Test.VariantName(42)", "Test.VariantName(42)");
    assert_reprint_expr("Test.VariantName<T>(42)", "Test.VariantName<T>(42)");
    assert_reprint_expr(
      "/* a */ Test./* b */ VariantName/* c */ <T>(42)",
      r#"/* a */
Test /* b */ /* c */ .VariantName<T>(42)"#,
    );
    assert_reprint_expr("/* a */Obj.VariantName(/* b */42)", "/* a */ Obj.VariantName(/* b */ 42)");
    assert_reprint_expr(
      "V.VariantName(aVariableNameThatIsVeryVeryVeryLong)",
      r#"V.VariantName(
  aVariableNameThatIsVeryVeryVeryLong
)"#,
    );

    assert_reprint_expr("foo.bar", "foo.bar");

    let builder = test_builder::create();
    assert_eq!(
      "foo.bar",
      prettier::pretty_print(
        40,
        expr::E::MethodAccess(expr::MethodAccess {
          common: builder.expr_common(builder.int_type()),
          type_arguments: vec![],
          object: Box::new(builder.id_expr("foo", builder.int_type())),
          method_name: Id::from("bar")
        })
        .create_doc()
      )
      .trim_end()
    );
    assert_eq!(
      "foo.bar<int>",
      prettier::pretty_print(
        40,
        expr::E::MethodAccess(expr::MethodAccess {
          common: builder.expr_common(builder.int_type()),
          type_arguments: vec![builder.int_type()],
          object: Box::new(builder.id_expr("foo", builder.int_type())),
          method_name: Id::from("bar")
        })
        .create_doc()
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

    assert_reprint_expr("if (b) then a else c", "if (b) then a else c");
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
      r#"if (b) then {
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
    );

    assert_reprint_expr(
      "match (v) { | None _ -> fooBar | Some bazBaz -> bazBaz }",
      r#"match (v) {
  | None _ -> fooBar
  | Some bazBaz -> bazBaz
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
import {Foo} from Bar.Baz
import {F1,F2,F3,F4,F5,F6,F7,F8,F9,F10} from Bar.Baz

class Option<T>(None(unit), Some(T)) {
  private method <T> matchExample(opt: Option<int>): int =
    match (opt) {
      | None _ -> 42
      | Some a -> a
    }

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
import { Foo } from Bar.Baz
import {
  F1,
  F2,
  F3,
  F4,
  F5,
  F6,
  F7,
  F8,
  F9,
  F10
} from Bar.Baz

class Option<T>(None(unit), Some(T)) {
  private method <T> matchExample(
    opt: Option<int>
  ): int =
    match (opt) {
      | None _ -> 42
      | Some a -> a
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
