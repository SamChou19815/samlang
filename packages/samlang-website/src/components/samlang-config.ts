import * as samlang from "samlang-demo";
import type * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import type { editor, languages } from "monaco-editor/esm/vs/editor/editor.api";

export type MonacoEditor = typeof monaco;

export const monacoEditorOptions: editor.IEditorConstructionOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  lineHeight: 20,
};

const monacoEditorTheme: editor.IStandaloneThemeData = {
  base: "vs",
  inherit: false,
  colors: { "editor.foreground": "#38484F", "editor.background": "#F7F7F7" },
  rules: [
    { token: "keyword", foreground: "#3E7AE2", fontStyle: "bold" },
    { token: "string", foreground: "#1A8F52" },
    { token: "number", foreground: "#C33B30" },
    { token: "type", foreground: "#9A30AD" },
    { token: "comments", foreground: "#808080" },
    { token: "functions", foreground: "#D52262" },
    { token: "identifier", foreground: "#38484F" },
    { token: "comment", foreground: "#808080", fontStyle: "" },
  ],
};

export const languageConfiguration: languages.LanguageConfiguration = {
  // the default separators except `@$`
  wordPattern: /(-?\d*\.\d\w*)|([^`~!#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g,
  comments: { lineComment: "//", blockComment: ["/*", "*/"] },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: "<", close: ">" },
  ],
  folding: {
    markers: {
      start: new RegExp("^\\s*//\\s*(?:(?:#?region\\b)|(?:<editor-fold\\b))"),
      end: new RegExp("^\\s*//\\s*(?:(?:#?endregion\\b)|(?:</editor-fold>))"),
    },
  },
};

const languageDefinition: languages.IMonarchLanguage = {
  keywords: [
    "val",
    "as",
    "if",
    "then",
    "else",
    "match",
    "interface",
    "class",
    "public",
    "private",
    "function",
    "method",
    "import",
    "from",
    "unit",
    "int",
    "string",
    "bool",
    "true",
    "false",
  ],
  operators: [
    "=",
    ">",
    "<",
    "!",
    ":",
    "==",
    "<=",
    ">=",
    "!=",
    "&&",
    "||",
    "+",
    "-",
    "*",
    "/",
    "%",
    "::",
  ],
  symbols: /[=><!~?:&|+\-*/^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
  digits: /\d+(_+\d+)*/,
  octaldigits: /[0-7]+(_+[0-7]+)*/,
  binarydigits: /[0-1]+(_+[0-1]+)*/,
  hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,
  tokenizer: {
    root: [
      // identifiers and keywords
      [
        /[a-z][a-zA-Z-0-9]*/,
        { cases: { "@keywords": { token: "keyword" }, "@default": "identifier" } },
      ],
      [/[A-Z][a-zA-Z-0-9]*/, "type"],
      // whitespace
      { include: "@whitespace" },
      // delimiters and operators
      [/[{}()[\]]/, "@brackets"],
      [/[<>](?!@symbols)/, "@brackets"],
      [/@symbols/, { cases: { "@operators": "delimiter", "@default": "" } }],
      // numbers
      [/(@digits)[eE]([-+]?(@digits))?[fFdD]?/, "number.float"],
      [/(@digits)\.(@digits)([eE][-+]?(@digits))?[fFdD]?/, "number.float"],
      [/0[xX](@hexdigits)[Ll]?/, "number.hex"],
      [/0(@octaldigits)[Ll]?/, "number.octal"],
      [/0[bB](@binarydigits)[Ll]?/, "number.binary"],
      [/(@digits)[fFdD]/, "number.float"],
      [/(@digits)[lL]?/, "number"],
      // strings
      [/"([^"\\]|\\.)*$/, "string.invalid"], // non-teminated string
      [/"/, "string", "@string"],
      // characters
      [/'[^\\']'/, "string"],
      [/(')(@escapes)(')/, ["string", "string.escape", "string"]],
      [/'/, "string.invalid"],
    ],
    whitespace: [
      [/[ \t\r\n]+/, ""],
      [/\/\*\*(?!\/)/, "comment.doc", "@javadoc"],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"],
    ],
    comment: [
      [/[^/*]+/, "comment"],
      // [/\/\*/, 'comment', '@push' ],    // nested comment not allowed :-(
      // [/\/\*/,    'comment.invalid' ],    // this breaks block comments in the shape of /* //*/
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],
    // Identical copy of comment above, except for the addition of .doc
    javadoc: [
      [/[^/*]+/, "comment.doc"],
      // [/\/\*/, 'comment.doc', '@push' ],    // nested comment not allowed :-(
      [/\/\*/, "comment.doc.invalid"],
      [/\*\//, "comment.doc", "@pop"],
      [/[/*]/, "comment.doc"],
    ],
    string: [
      [/[^\\"]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/"/, "string", "@pop"],
    ],
  },
};

let monacoInitialized = false;
let monacoLSPInitialized = false;

export function initializeMonacoEditor(monacoEditor: MonacoEditor, fullLSP: boolean) {
  if (!monacoInitialized) {
    monacoInitialized = true;
    monacoEditor.editor.defineTheme("sam-theme", monacoEditorTheme);
    monacoEditor.languages.register({ id: "samlang" });
    monacoEditor.languages.setLanguageConfiguration("samlang", languageConfiguration);
    monacoEditor.languages.setMonarchTokensProvider("samlang", languageDefinition);
  }

  if (!monacoLSPInitialized && fullLSP) {
    monacoLSPInitialized = true;
    monacoEditor.languages.registerHoverProvider("samlang", {
      async provideHover(model, position) {
        const result = await samlang.queryType(
          model.getValue(),
          position.lineNumber,
          position.column,
        );
        if (result == null) return null;
        return {
          range: result.range,
          contents: result.contents.map(({ language, value }) => ({
            value: `${"```"}${language}\n${value}\n${"```"}`,
          })),
        };
      },
    });

    monacoEditor.languages.registerCompletionItemProvider("samlang", {
      triggerCharacters: ["."],
      async provideCompletionItems(model, position) {
        const offset = model.getOffsetAt(position);
        let source: string = model.getValue();
        if (source.charAt(offset) !== ".") {
          source = `${source.substring(0, offset)}.${source.substring(offset)}`;
        }
        try {
          const suggestions = await samlang.autoComplete(
            source,
            position.lineNumber,
            position.column,
          );
          return { suggestions };
        } catch (e) {
          console.log(e);
          return null;
        }
      },
    });

    monacoEditor.languages.registerDefinitionProvider("samlang", {
      async provideDefinition(model, position) {
        const range = await samlang.queryDefinitionLocation(
          model.getValue(),
          position.lineNumber,
          position.column,
        );
        return range != null ? { uri: model.uri, range } : null;
      },
    });
  }
}

async function getWasmResponse(programString: string): Promise<samlang.CompilationResult> {
  try {
    return samlang.compile(programString);
  } catch (interpreterError) {
    console.error(interpreterError);
    return `Interpreter Error:
${interpreterError instanceof Error ? interpreterError.message : "Unknown Error"}`;
  }
}

function parseToMarkers(response: string): monaco.editor.IMarkerData[] {
  return response.split("\n").flatMap((line) => {
    const [p1, p2] = line.substring("Demo.sam:".length).split("-");
    if (p1 == null || p2 == null) return [];
    const [lineStart, colStart] = p1.split(":");
    const [lineEnd, colEnd, ...rest] = p2.split(":");
    if (lineStart == null || colStart == null || lineEnd == null || colEnd == null) {
      return [];
    }
    return {
      startLineNumber: parseInt(lineStart, 10),
      startColumn: parseInt(colStart, 10),
      endLineNumber: parseInt(lineEnd, 10),
      endColumn: parseInt(colEnd, 10),
      message: rest.join(":").trim(),
      severity: 8,
    };
  });
}

export function onMonacoModelMount(
  editor: monaco.editor.IStandaloneCodeEditor,
  monaco: MonacoEditor,
  onCompilationResponse?: (response: samlang.CompilationResult) => unknown,
): void {
  const model = editor.getModel();
  if (model == null) return;

  const respond = () => {
    const value = model.getValue();
    if (onCompilationResponse != null) {
      getWasmResponse(value).then(onCompilationResponse);
    }
    samlang.typeCheck(value).then((response) => {
      monaco.editor.setModelMarkers(model, "samlang", parseToMarkers(response));
    });
  };

  model.onDidChangeContent(() => respond());
  respond();
}
