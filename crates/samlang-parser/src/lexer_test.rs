#[cfg(test)]
mod tests {
  use super::super::lexer::*;
  use pretty_assertions::assert_eq;
  use samlang_ast::Location;
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, ModuleReference};

  #[test]
  fn boilterplate() {
    let heap = Heap::new();
    assert_eq!("EOF", TokenContent::EOF.pretty_print(&heap));
    assert!(Keyword::MATCH == Keyword::MATCH.clone());
    assert!(TokenOp::EQ == TokenOp::EQ.clone());
    assert_eq!(
      "DUMMY.sam:0:0-0:0: as",
      Token(Location::dummy(), TokenContent::Keyword(Keyword::AS).clone())
        .clone()
        .pretty_print(&heap)
    );
  }

  fn lex(source: &str) -> Vec<String> {
    let mut heap = Heap::new();
    lex_source_program(source, ModuleReference::ROOT, &mut heap, &mut ErrorSet::new())
      .into_iter()
      .map(|t| t.pretty_print(&heap))
      .collect()
  }

  #[test]
  fn good_test_0() {
    let expected = vec![
      ".sam:1:1-1:4: let",
      ".sam:1:5-1:6: l",
      ".sam:1:7-1:8: =",
      ".sam:1:9-1:13: List",
      ".sam:1:13-1:14: .",
      ".sam:1:14-1:16: of",
      ".sam:1:16-1:17: (",
      ".sam:1:17-1:26: \"SAMLANG\"",
      ".sam:1:26-1:27: )",
      ".sam:1:27-1:28: .",
      ".sam:1:28-1:32: cons",
      ".sam:1:32-1:33: (",
      ".sam:1:33-1:38: \"...\"",
      ".sam:1:38-1:39: )",
    ];
    assert_eq!(expected, lex(r#"let l = List.of("SAMLANG").cons("...")"#));
  }

  #[test]
  fn good_test_1() {
    let program = r#"
class Main {
  function main(): unit = {
    let i: int = 1;
    let j: int = 2;
    if ((i < j && i > 0) && j > 0) {
      let a: int = 3;
      let b: int = 4;
      if (a > b || a + b > 0 && true) { Process.println("one") } else { Process.println("two") }
    } else {
      let a: int = 3;
      let b: int = 4;
      if (a == 2 || b == 4) { Process.println("three") } else { Process.println("four") }
    }
  }

}
"#;
    let expected = vec![
      ".sam:2:1-2:6: class",
      ".sam:2:7-2:11: Main",
      ".sam:2:12-2:13: {",
      ".sam:3:3-3:11: function",
      ".sam:3:12-3:16: main",
      ".sam:3:16-3:17: (",
      ".sam:3:17-3:18: )",
      ".sam:3:18-3:19: :",
      ".sam:3:20-3:24: unit",
      ".sam:3:25-3:26: =",
      ".sam:3:27-3:28: {",
      ".sam:4:5-4:8: let",
      ".sam:4:9-4:10: i",
      ".sam:4:10-4:11: :",
      ".sam:4:12-4:15: int",
      ".sam:4:16-4:17: =",
      ".sam:4:18-4:19: 1",
      ".sam:4:19-4:20: ;",
      ".sam:5:5-5:8: let",
      ".sam:5:9-5:10: j",
      ".sam:5:10-5:11: :",
      ".sam:5:12-5:15: int",
      ".sam:5:16-5:17: =",
      ".sam:5:18-5:19: 2",
      ".sam:5:19-5:20: ;",
      ".sam:6:5-6:7: if",
      ".sam:6:8-6:9: (",
      ".sam:6:9-6:10: (",
      ".sam:6:10-6:11: i",
      ".sam:6:12-6:13: <",
      ".sam:6:14-6:15: j",
      ".sam:6:16-6:18: &&",
      ".sam:6:19-6:20: i",
      ".sam:6:21-6:22: >",
      ".sam:6:23-6:24: 0",
      ".sam:6:24-6:25: )",
      ".sam:6:26-6:28: &&",
      ".sam:6:29-6:30: j",
      ".sam:6:31-6:32: >",
      ".sam:6:33-6:34: 0",
      ".sam:6:34-6:35: )",
      ".sam:6:36-6:37: {",
      ".sam:7:7-7:10: let",
      ".sam:7:11-7:12: a",
      ".sam:7:12-7:13: :",
      ".sam:7:14-7:17: int",
      ".sam:7:18-7:19: =",
      ".sam:7:20-7:21: 3",
      ".sam:7:21-7:22: ;",
      ".sam:8:7-8:10: let",
      ".sam:8:11-8:12: b",
      ".sam:8:12-8:13: :",
      ".sam:8:14-8:17: int",
      ".sam:8:18-8:19: =",
      ".sam:8:20-8:21: 4",
      ".sam:8:21-8:22: ;",
      ".sam:9:7-9:9: if",
      ".sam:9:10-9:11: (",
      ".sam:9:11-9:12: a",
      ".sam:9:13-9:14: >",
      ".sam:9:15-9:16: b",
      ".sam:9:17-9:19: ||",
      ".sam:9:20-9:21: a",
      ".sam:9:22-9:23: +",
      ".sam:9:24-9:25: b",
      ".sam:9:26-9:27: >",
      ".sam:9:28-9:29: 0",
      ".sam:9:30-9:32: &&",
      ".sam:9:33-9:37: true",
      ".sam:9:37-9:38: )",
      ".sam:9:39-9:40: {",
      ".sam:9:41-9:48: Process",
      ".sam:9:48-9:49: .",
      ".sam:9:49-9:56: println",
      ".sam:9:56-9:57: (",
      ".sam:9:57-9:62: \"one\"",
      ".sam:9:62-9:63: )",
      ".sam:9:64-9:65: }",
      ".sam:9:66-9:70: else",
      ".sam:9:71-9:72: {",
      ".sam:9:73-9:80: Process",
      ".sam:9:80-9:81: .",
      ".sam:9:81-9:88: println",
      ".sam:9:88-9:89: (",
      ".sam:9:89-9:94: \"two\"",
      ".sam:9:94-9:95: )",
      ".sam:9:96-9:97: }",
      ".sam:10:5-10:6: }",
      ".sam:10:7-10:11: else",
      ".sam:10:12-10:13: {",
      ".sam:11:7-11:10: let",
      ".sam:11:11-11:12: a",
      ".sam:11:12-11:13: :",
      ".sam:11:14-11:17: int",
      ".sam:11:18-11:19: =",
      ".sam:11:20-11:21: 3",
      ".sam:11:21-11:22: ;",
      ".sam:12:7-12:10: let",
      ".sam:12:11-12:12: b",
      ".sam:12:12-12:13: :",
      ".sam:12:14-12:17: int",
      ".sam:12:18-12:19: =",
      ".sam:12:20-12:21: 4",
      ".sam:12:21-12:22: ;",
      ".sam:13:7-13:9: if",
      ".sam:13:10-13:11: (",
      ".sam:13:11-13:12: a",
      ".sam:13:13-13:15: ==",
      ".sam:13:16-13:17: 2",
      ".sam:13:18-13:20: ||",
      ".sam:13:21-13:22: b",
      ".sam:13:23-13:25: ==",
      ".sam:13:26-13:27: 4",
      ".sam:13:27-13:28: )",
      ".sam:13:29-13:30: {",
      ".sam:13:31-13:38: Process",
      ".sam:13:38-13:39: .",
      ".sam:13:39-13:46: println",
      ".sam:13:46-13:47: (",
      ".sam:13:47-13:54: \"three\"",
      ".sam:13:54-13:55: )",
      ".sam:13:56-13:57: }",
      ".sam:13:58-13:62: else",
      ".sam:13:63-13:64: {",
      ".sam:13:65-13:72: Process",
      ".sam:13:72-13:73: .",
      ".sam:13:73-13:80: println",
      ".sam:13:80-13:81: (",
      ".sam:13:81-13:87: \"four\"",
      ".sam:13:87-13:88: )",
      ".sam:13:89-13:90: }",
      ".sam:14:5-14:6: }",
      ".sam:15:3-15:4: }",
      ".sam:17:1-17:2: }",
    ];
    assert_eq!(expected, lex(program));
  }

  #[test]
  fn good_test_2() {
    let program = r#"
class Foo(val a: int) { function bar(): int = 3  }

class Option<T>(None(unit), Some(T)) {
  function matchExample(opt: Option<int>): int = match (opt) { | None _ -> 42 | Some a -> a }

}

class Obj(val d: int, val e: int) {
  function valExample(): int = {
    let a: int = 1;
    let b: int = 2;
    let [_, c]: [Str * int] = ["dd", 3];
    let { e as d }: Obj = { d: 5, e: 4 };
    let _: int = 42;
    a + (b * c) / d
  }

}

class Main {
  function identity(a: int): int = a

  function random(): int = {
    let a: int = 42;
    a
  }

  function oof(): int = 14

  function div(a: int, b: int): int =
    if (b == 0) {Process.panic("Division by zero is illegal!")} else {a / b}

  function nestedVal(): int = {
    let a: int = {
      let b: int = 4;
      let c: int = {
        let c: int = b;
        b
      };
      c
    };
    let [e, b, _]: [int * Str * bool] = [1, "bool", true];
    a + 1
  }

  function main(): unit =
    println(
      intToString(
        Main.identity(
          (((Foo.bar() * Main.oof()) * Obj.valExample()) / Main.div(4, 2) + Main.nestedVal()) - 5
        )
      )
    )

}
"#;
    let expected = vec![
      ".sam:2:1-2:6: class",
      ".sam:2:7-2:10: Foo",
      ".sam:2:10-2:11: (",
      ".sam:2:11-2:14: val",
      ".sam:2:15-2:16: a",
      ".sam:2:16-2:17: :",
      ".sam:2:18-2:21: int",
      ".sam:2:21-2:22: )",
      ".sam:2:23-2:24: {",
      ".sam:2:25-2:33: function",
      ".sam:2:34-2:37: bar",
      ".sam:2:37-2:38: (",
      ".sam:2:38-2:39: )",
      ".sam:2:39-2:40: :",
      ".sam:2:41-2:44: int",
      ".sam:2:45-2:46: =",
      ".sam:2:47-2:48: 3",
      ".sam:2:50-2:51: }",
      ".sam:4:1-4:6: class",
      ".sam:4:7-4:13: Option",
      ".sam:4:13-4:14: <",
      ".sam:4:14-4:15: T",
      ".sam:4:15-4:16: >",
      ".sam:4:16-4:17: (",
      ".sam:4:17-4:21: None",
      ".sam:4:21-4:22: (",
      ".sam:4:22-4:26: unit",
      ".sam:4:26-4:27: )",
      ".sam:4:27-4:28: ,",
      ".sam:4:29-4:33: Some",
      ".sam:4:33-4:34: (",
      ".sam:4:34-4:35: T",
      ".sam:4:35-4:36: )",
      ".sam:4:36-4:37: )",
      ".sam:4:38-4:39: {",
      ".sam:5:3-5:11: function",
      ".sam:5:12-5:24: matchExample",
      ".sam:5:24-5:25: (",
      ".sam:5:25-5:28: opt",
      ".sam:5:28-5:29: :",
      ".sam:5:30-5:36: Option",
      ".sam:5:36-5:37: <",
      ".sam:5:37-5:40: int",
      ".sam:5:40-5:41: >",
      ".sam:5:41-5:42: )",
      ".sam:5:42-5:43: :",
      ".sam:5:44-5:47: int",
      ".sam:5:48-5:49: =",
      ".sam:5:50-5:55: match",
      ".sam:5:56-5:57: (",
      ".sam:5:57-5:60: opt",
      ".sam:5:60-5:61: )",
      ".sam:5:62-5:63: {",
      ".sam:5:64-5:65: |",
      ".sam:5:66-5:70: None",
      ".sam:5:71-5:72: _",
      ".sam:5:73-5:75: ->",
      ".sam:5:76-5:78: 42",
      ".sam:5:79-5:80: |",
      ".sam:5:81-5:85: Some",
      ".sam:5:86-5:87: a",
      ".sam:5:88-5:90: ->",
      ".sam:5:91-5:92: a",
      ".sam:5:93-5:94: }",
      ".sam:7:1-7:2: }",
      ".sam:9:1-9:6: class",
      ".sam:9:7-9:10: Obj",
      ".sam:9:10-9:11: (",
      ".sam:9:11-9:14: val",
      ".sam:9:15-9:16: d",
      ".sam:9:16-9:17: :",
      ".sam:9:18-9:21: int",
      ".sam:9:21-9:22: ,",
      ".sam:9:23-9:26: val",
      ".sam:9:27-9:28: e",
      ".sam:9:28-9:29: :",
      ".sam:9:30-9:33: int",
      ".sam:9:33-9:34: )",
      ".sam:9:35-9:36: {",
      ".sam:10:3-10:11: function",
      ".sam:10:12-10:22: valExample",
      ".sam:10:22-10:23: (",
      ".sam:10:23-10:24: )",
      ".sam:10:24-10:25: :",
      ".sam:10:26-10:29: int",
      ".sam:10:30-10:31: =",
      ".sam:10:32-10:33: {",
      ".sam:11:5-11:8: let",
      ".sam:11:9-11:10: a",
      ".sam:11:10-11:11: :",
      ".sam:11:12-11:15: int",
      ".sam:11:16-11:17: =",
      ".sam:11:18-11:19: 1",
      ".sam:11:19-11:20: ;",
      ".sam:12:5-12:8: let",
      ".sam:12:9-12:10: b",
      ".sam:12:10-12:11: :",
      ".sam:12:12-12:15: int",
      ".sam:12:16-12:17: =",
      ".sam:12:18-12:19: 2",
      ".sam:12:19-12:20: ;",
      ".sam:13:5-13:8: let",
      ".sam:13:9-13:10: [",
      ".sam:13:10-13:11: _",
      ".sam:13:11-13:12: ,",
      ".sam:13:13-13:14: c",
      ".sam:13:14-13:15: ]",
      ".sam:13:15-13:16: :",
      ".sam:13:17-13:18: [",
      ".sam:13:18-13:21: Str",
      ".sam:13:22-13:23: *",
      ".sam:13:24-13:27: int",
      ".sam:13:27-13:28: ]",
      ".sam:13:29-13:30: =",
      ".sam:13:31-13:32: [",
      ".sam:13:32-13:36: \"dd\"",
      ".sam:13:36-13:37: ,",
      ".sam:13:38-13:39: 3",
      ".sam:13:39-13:40: ]",
      ".sam:13:40-13:41: ;",
      ".sam:14:5-14:8: let",
      ".sam:14:9-14:10: {",
      ".sam:14:11-14:12: e",
      ".sam:14:13-14:15: as",
      ".sam:14:16-14:17: d",
      ".sam:14:18-14:19: }",
      ".sam:14:19-14:20: :",
      ".sam:14:21-14:24: Obj",
      ".sam:14:25-14:26: =",
      ".sam:14:27-14:28: {",
      ".sam:14:29-14:30: d",
      ".sam:14:30-14:31: :",
      ".sam:14:32-14:33: 5",
      ".sam:14:33-14:34: ,",
      ".sam:14:35-14:36: e",
      ".sam:14:36-14:37: :",
      ".sam:14:38-14:39: 4",
      ".sam:14:40-14:41: }",
      ".sam:14:41-14:42: ;",
      ".sam:15:5-15:8: let",
      ".sam:15:9-15:10: _",
      ".sam:15:10-15:11: :",
      ".sam:15:12-15:15: int",
      ".sam:15:16-15:17: =",
      ".sam:15:18-15:20: 42",
      ".sam:15:20-15:21: ;",
      ".sam:16:5-16:6: a",
      ".sam:16:7-16:8: +",
      ".sam:16:9-16:10: (",
      ".sam:16:10-16:11: b",
      ".sam:16:12-16:13: *",
      ".sam:16:14-16:15: c",
      ".sam:16:15-16:16: )",
      ".sam:16:17-16:18: /",
      ".sam:16:19-16:20: d",
      ".sam:17:3-17:4: }",
      ".sam:19:1-19:2: }",
      ".sam:21:1-21:6: class",
      ".sam:21:7-21:11: Main",
      ".sam:21:12-21:13: {",
      ".sam:22:3-22:11: function",
      ".sam:22:12-22:20: identity",
      ".sam:22:20-22:21: (",
      ".sam:22:21-22:22: a",
      ".sam:22:22-22:23: :",
      ".sam:22:24-22:27: int",
      ".sam:22:27-22:28: )",
      ".sam:22:28-22:29: :",
      ".sam:22:30-22:33: int",
      ".sam:22:34-22:35: =",
      ".sam:22:36-22:37: a",
      ".sam:24:3-24:11: function",
      ".sam:24:12-24:18: random",
      ".sam:24:18-24:19: (",
      ".sam:24:19-24:20: )",
      ".sam:24:20-24:21: :",
      ".sam:24:22-24:25: int",
      ".sam:24:26-24:27: =",
      ".sam:24:28-24:29: {",
      ".sam:25:5-25:8: let",
      ".sam:25:9-25:10: a",
      ".sam:25:10-25:11: :",
      ".sam:25:12-25:15: int",
      ".sam:25:16-25:17: =",
      ".sam:25:18-25:20: 42",
      ".sam:25:20-25:21: ;",
      ".sam:26:5-26:6: a",
      ".sam:27:3-27:4: }",
      ".sam:29:3-29:11: function",
      ".sam:29:12-29:15: oof",
      ".sam:29:15-29:16: (",
      ".sam:29:16-29:17: )",
      ".sam:29:17-29:18: :",
      ".sam:29:19-29:22: int",
      ".sam:29:23-29:24: =",
      ".sam:29:25-29:27: 14",
      ".sam:31:3-31:11: function",
      ".sam:31:12-31:15: div",
      ".sam:31:15-31:16: (",
      ".sam:31:16-31:17: a",
      ".sam:31:17-31:18: :",
      ".sam:31:19-31:22: int",
      ".sam:31:22-31:23: ,",
      ".sam:31:24-31:25: b",
      ".sam:31:25-31:26: :",
      ".sam:31:27-31:30: int",
      ".sam:31:30-31:31: )",
      ".sam:31:31-31:32: :",
      ".sam:31:33-31:36: int",
      ".sam:31:37-31:38: =",
      ".sam:32:5-32:7: if",
      ".sam:32:8-32:9: (",
      ".sam:32:9-32:10: b",
      ".sam:32:11-32:13: ==",
      ".sam:32:14-32:15: 0",
      ".sam:32:15-32:16: )",
      ".sam:32:17-32:18: {",
      ".sam:32:18-32:25: Process",
      ".sam:32:25-32:26: .",
      ".sam:32:26-32:31: panic",
      ".sam:32:31-32:32: (",
      ".sam:32:32-32:62: \"Division by zero is illegal!\"",
      ".sam:32:62-32:63: )",
      ".sam:32:63-32:64: }",
      ".sam:32:65-32:69: else",
      ".sam:32:70-32:71: {",
      ".sam:32:71-32:72: a",
      ".sam:32:73-32:74: /",
      ".sam:32:75-32:76: b",
      ".sam:32:76-32:77: }",
      ".sam:34:3-34:11: function",
      ".sam:34:12-34:21: nestedVal",
      ".sam:34:21-34:22: (",
      ".sam:34:22-34:23: )",
      ".sam:34:23-34:24: :",
      ".sam:34:25-34:28: int",
      ".sam:34:29-34:30: =",
      ".sam:34:31-34:32: {",
      ".sam:35:5-35:8: let",
      ".sam:35:9-35:10: a",
      ".sam:35:10-35:11: :",
      ".sam:35:12-35:15: int",
      ".sam:35:16-35:17: =",
      ".sam:35:18-35:19: {",
      ".sam:36:7-36:10: let",
      ".sam:36:11-36:12: b",
      ".sam:36:12-36:13: :",
      ".sam:36:14-36:17: int",
      ".sam:36:18-36:19: =",
      ".sam:36:20-36:21: 4",
      ".sam:36:21-36:22: ;",
      ".sam:37:7-37:10: let",
      ".sam:37:11-37:12: c",
      ".sam:37:12-37:13: :",
      ".sam:37:14-37:17: int",
      ".sam:37:18-37:19: =",
      ".sam:37:20-37:21: {",
      ".sam:38:9-38:12: let",
      ".sam:38:13-38:14: c",
      ".sam:38:14-38:15: :",
      ".sam:38:16-38:19: int",
      ".sam:38:20-38:21: =",
      ".sam:38:22-38:23: b",
      ".sam:38:23-38:24: ;",
      ".sam:39:9-39:10: b",
      ".sam:40:7-40:8: }",
      ".sam:40:8-40:9: ;",
      ".sam:41:7-41:8: c",
      ".sam:42:5-42:6: }",
      ".sam:42:6-42:7: ;",
      ".sam:43:5-43:8: let",
      ".sam:43:9-43:10: [",
      ".sam:43:10-43:11: e",
      ".sam:43:11-43:12: ,",
      ".sam:43:13-43:14: b",
      ".sam:43:14-43:15: ,",
      ".sam:43:16-43:17: _",
      ".sam:43:17-43:18: ]",
      ".sam:43:18-43:19: :",
      ".sam:43:20-43:21: [",
      ".sam:43:21-43:24: int",
      ".sam:43:25-43:26: *",
      ".sam:43:27-43:30: Str",
      ".sam:43:31-43:32: *",
      ".sam:43:33-43:37: bool",
      ".sam:43:37-43:38: ]",
      ".sam:43:39-43:40: =",
      ".sam:43:41-43:42: [",
      ".sam:43:42-43:43: 1",
      ".sam:43:43-43:44: ,",
      ".sam:43:45-43:51: \"bool\"",
      ".sam:43:51-43:52: ,",
      ".sam:43:53-43:57: true",
      ".sam:43:57-43:58: ]",
      ".sam:43:58-43:59: ;",
      ".sam:44:5-44:6: a",
      ".sam:44:7-44:8: +",
      ".sam:44:9-44:10: 1",
      ".sam:45:3-45:4: }",
      ".sam:47:3-47:11: function",
      ".sam:47:12-47:16: main",
      ".sam:47:16-47:17: (",
      ".sam:47:17-47:18: )",
      ".sam:47:18-47:19: :",
      ".sam:47:20-47:24: unit",
      ".sam:47:25-47:26: =",
      ".sam:48:5-48:12: println",
      ".sam:48:12-48:13: (",
      ".sam:49:7-49:18: intToString",
      ".sam:49:18-49:19: (",
      ".sam:50:9-50:13: Main",
      ".sam:50:13-50:14: .",
      ".sam:50:14-50:22: identity",
      ".sam:50:22-50:23: (",
      ".sam:51:11-51:12: (",
      ".sam:51:12-51:13: (",
      ".sam:51:13-51:14: (",
      ".sam:51:14-51:17: Foo",
      ".sam:51:17-51:18: .",
      ".sam:51:18-51:21: bar",
      ".sam:51:21-51:22: (",
      ".sam:51:22-51:23: )",
      ".sam:51:24-51:25: *",
      ".sam:51:26-51:30: Main",
      ".sam:51:30-51:31: .",
      ".sam:51:31-51:34: oof",
      ".sam:51:34-51:35: (",
      ".sam:51:35-51:36: )",
      ".sam:51:36-51:37: )",
      ".sam:51:38-51:39: *",
      ".sam:51:40-51:43: Obj",
      ".sam:51:43-51:44: .",
      ".sam:51:44-51:54: valExample",
      ".sam:51:54-51:55: (",
      ".sam:51:55-51:56: )",
      ".sam:51:56-51:57: )",
      ".sam:51:58-51:59: /",
      ".sam:51:60-51:64: Main",
      ".sam:51:64-51:65: .",
      ".sam:51:65-51:68: div",
      ".sam:51:68-51:69: (",
      ".sam:51:69-51:70: 4",
      ".sam:51:70-51:71: ,",
      ".sam:51:72-51:73: 2",
      ".sam:51:73-51:74: )",
      ".sam:51:75-51:76: +",
      ".sam:51:77-51:81: Main",
      ".sam:51:81-51:82: .",
      ".sam:51:82-51:91: nestedVal",
      ".sam:51:91-51:92: (",
      ".sam:51:92-51:93: )",
      ".sam:51:93-51:94: )",
      ".sam:51:95-51:96: -",
      ".sam:51:97-51:98: 5",
      ".sam:52:9-52:10: )",
      ".sam:53:7-53:8: )",
      ".sam:54:5-54:6: )",
      ".sam:56:1-56:2: }",
    ];
    assert_eq!(expected, lex(program));
  }

  #[test]
  fn good_test_3() {
    let expected = vec![".sam:1:2-1:12: comm"];
    assert_eq!(expected, lex(r#" /* comm */"#));
  }

  #[test]
  fn line_comment_edge_case() {
    assert_eq!(vec![".sam:1:1-1:6: ss"], lex("// ss"));
  }

  #[test]
  fn comment_lexing_test() {
    let program = r#"
class Main {
  function main(): unit = {
    let i: int = 1;
    let j: int = 2;
    /* block comment lol
    ol ol
    0000l */
    / not a line comment
    // line comment haha
    /** foo bar */
    /*
  }
}
"#;
    let expected = vec![
      ".sam:2:1-2:6: class",
      ".sam:2:7-2:11: Main",
      ".sam:2:12-2:13: {",
      ".sam:3:3-3:11: function",
      ".sam:3:12-3:16: main",
      ".sam:3:16-3:17: (",
      ".sam:3:17-3:18: )",
      ".sam:3:18-3:19: :",
      ".sam:3:20-3:24: unit",
      ".sam:3:25-3:26: =",
      ".sam:3:27-3:28: {",
      ".sam:4:5-4:8: let",
      ".sam:4:9-4:10: i",
      ".sam:4:10-4:11: :",
      ".sam:4:12-4:15: int",
      ".sam:4:16-4:17: =",
      ".sam:4:18-4:19: 1",
      ".sam:4:19-4:20: ;",
      ".sam:5:5-5:8: let",
      ".sam:5:9-5:10: j",
      ".sam:5:10-5:11: :",
      ".sam:5:12-5:15: int",
      ".sam:5:16-5:17: =",
      ".sam:5:18-5:19: 2",
      ".sam:5:19-5:20: ;",
      ".sam:6:5-8:13: block comment lol ol ol 0000l",
      ".sam:9:5-9:6: /",
      ".sam:9:7-9:10: not",
      ".sam:9:11-9:12: a",
      ".sam:9:13-9:17: line",
      ".sam:9:18-9:25: comment",
      ".sam:10:5-10:25: line comment haha",
      ".sam:11:5-11:19: foo bar",
      ".sam:12:5-12:6: /",
      ".sam:12:6-12:7: *",
      ".sam:13:3-13:4: }",
      ".sam:14:1-14:2: }",
    ];
    assert_eq!(expected, lex(program));
  }

  #[test]
  fn string_end_escaping_tests() {
    assert_eq!(vec![r#".sam:1:1-1:14: "abcdefg\\\\""#], lex(r#""abcdefg\\\\""#));
    assert_eq!(vec![r#".sam:1:1-1:13: ERROR: "abcdefg\\\""#], lex(r#""abcdefg\\\""#));
  }

  #[test]
  fn string_mid_escaping_bad_tests() {
    assert_eq!(vec![".sam:1:1-1:12: \"abcdefg\\a\""], lex(r#""abcdefg\a""#));
    assert_eq!(vec![".sam:1:1-1:12: \"abcdefg\\c\""], lex(r#""abcdefg\c""#));
  }

  #[test]
  fn string_mid_escaping_good_tests() {
    assert_eq!(vec![".sam:1:1-1:5: \"\\t\""], lex(r#""\t""#));
    assert_eq!(vec![".sam:1:1-1:5: \"\\n\""], lex(r#""\n""#));
  }

  #[test]
  fn bad_code_multiple_string() {
    assert_eq!(
      vec![".sam:1:1-1:9: ERROR: \"abcdefg", ".sam:2:1-2:2: ERROR: \""],
      lex("\"abcdefg\n\"")
    );
  }

  #[test]
  fn int_tests() {
    assert_eq!(vec![".sam:1:1-1:2: 0"], lex("0"));
    assert_eq!(vec![".sam:1:1-1:11: 2147483648"], lex("2147483648"));
    assert_eq!(vec![".sam:1:1-1:11: 2147483649"], lex("2147483649"));
    assert_eq!(vec![".sam:1:1-1:26: 1111111111111111111111111"], lex("1111111111111111111111111"));
    assert_eq!(vec![".sam:1:1-1:11: 2147483648", ".sam:1:12-1:13: 3"], lex("2147483648 3"));
    assert_eq!(vec![".sam:1:1-1:2: +", ".sam:1:3-1:13: 2147483648"], lex("+ 2147483648"));
    assert_eq!(vec![".sam:1:1-1:12: -2147483648"], lex("-2147483648"));
  }

  #[test]
  fn id_test() {
    assert_eq!(vec![".sam:1:1-1:7: fooBar"], lex("fooBar"));
  }

  #[test]
  fn garbage_test() {
    assert_eq!(
      vec![".sam:1:1-1:23: ERROR: $php_is_a_bad_language", ".sam:1:24-1:30: 123456"],
      lex("$php_is_a_bad_language 123456")
    )
  }
}
