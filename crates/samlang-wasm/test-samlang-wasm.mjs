import assert from "assert";
import * as samlang from "./index.js";

assert(samlang.reformat_source("class  Foo {}") === "class Foo\n");
assert(samlang.reformat_source("class") === "class");
assert(samlang.compile_single_source("class").errors.length > 0);
assert(samlang.compile_single_source("class Foo {}").errors.length === 0);
assert(new samlang.LanguageService("class Foo {}").get_errors() === "");
assert(new samlang.LanguageService("class").get_errors().length > 0);
assert(
  JSON.stringify(new samlang.LanguageService("class Foo {}").query_type(0, 7)) ===
    '{"contents":[{"language":"samlang","value":"class Foo"}],"range":{"startLineNumber":1,"startColumn":7,"endLineNumber":1,"endColumn":10}}',
);
assert(
  JSON.stringify(new samlang.LanguageService("class Foo {}").query_definition(0, 7)) ===
    '{"startLineNumber":1,"startColumn":1,"endLineNumber":1,"endColumn":13}',
);
assert(
  JSON.stringify(
    new samlang.LanguageService(`
class Main {
  function main(a: Developer): Developer = a.
}
class Developer {
  private method f(): unit = {}
  method b(): unit = {}
}
`).autocomplete(2, 45),
  ) ===
    '[{"label":"b(): unit","insertText":"b()","insertTextFormat":1,"kind":2,"detail":"() -> unit"}]',
);
