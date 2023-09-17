'use client';

import Editor from '@monaco-editor/react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import Link from 'next/link';
import type { CompilationResult } from './samlang-wasm-glue';

import { useRef, useState } from 'react';
import { initializeMonacoEditor, monacoEditorOptions, onMonacoModelMount } from './samlang-config';
import { ALL_EXPRESSIONS, ALL_TYPES, PRINT_HELLO_WORLD, MODULES } from './samlang-programs';

const DemoPrograms = [
  { name: 'Hello World', program: PRINT_HELLO_WORLD },
  { name: 'Modules', program: MODULES },
  { name: 'Types', program: ALL_TYPES },
  { name: 'Expressions', program: ALL_EXPRESSIONS },
];

export default function LanguageDemo(): JSX.Element {
  const [response, setResponse] = useState<CompilationResult | null>(null);
  const [chosenTab, setChosenTab] = useState(0);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>();

  const showCompilerOutput = chosenTab === 0;

  return (
    <div>
      <nav className="sticky top-0 z-40 flex h-12 bg-white pr-4 drop-shadow-sm filter">
        <div className="flex w-full flex-wrap justify-between">
          <div className="flex min-w-0 flex-auto items-center">
            <Link className="mr-8 flex min-w-0 items-center text-gray-900" href="/">
              <img className="mr-4 h-12 flex-initial" src="/img/logo.png" alt="samlang logo" />
              <strong className="flex-auto text-lg font-semibold">samlang</strong>
            </Link>
          </div>
          <div className="flex min-w-0 flex-initial items-center justify-end">
            <a
              className="px-3 py-1 font-medium text-gray-900 hover:text-blue-500"
              href="https://github.com/SamChou19815/samlang"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>
      <div className="flex-row">
        <div>
          <div className="flex h-8 w-full text-center">
            {DemoPrograms.map(({ name, program }, index) => (
              <button
                key={name}
                type="button"
                className={`cursor-pointer flex-[25%] max-w-[50%] text-sm border-b-2 p-1 pb-3 hover:bg-blue-100 ${
                  chosenTab === index ? 'border-blue-400' : 'border-transparent'
                }`}
                onClick={() => {
                  editorRef.current?.getModel()?.setValue(program);
                  setChosenTab(index);
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <Editor
            defaultLanguage="samlang"
            className="border-r-2 border-r-gray-300"
            theme="sam-theme"
            width="100vw"
            height={showCompilerOutput ? '60vh' : 'calc(100vh - 5em)'}
            path="Demo.sam"
            loading={<pre>{PRINT_HELLO_WORLD}</pre>}
            defaultValue={PRINT_HELLO_WORLD}
            options={monacoEditorOptions}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              onMonacoModelMount(editor, monaco, setResponse);
            }}
            beforeMount={(monaco) => {
              initializeMonacoEditor(monaco, true);
            }}
          />
        </div>
        {showCompilerOutput && (
          <div className="border-t-2">
            <div className="h-8 w-full text-center p-1 text-sm">
              Compiler Output & Interpreter Result
            </div>
            {typeof response === 'string' || response == null ? (
              <Editor
                width="100vw"
                height="calc(40vh - 7em)"
                theme="sam-theme"
                path="result.txt"
                value={response ?? 'Loading response...'}
                options={{ ...monacoEditorOptions, readOnly: true }}
              />
            ) : (
              <Editor
                defaultLanguage="typescript"
                theme="sam-theme"
                width="100vw"
                height="calc(40vh - 7em)"
                path="Demo.ts"
                value={`// Standard out:
// ${response.interpreterResult}
// Optimized TypeScript emit:
${response.tsCode}`}
                options={{ ...monacoEditorOptions, readOnly: true }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
